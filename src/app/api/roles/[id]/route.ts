import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditRoleChange } from "@/lib/audit";

type RouteContext = { params: Promise<{ id: string }> };

async function getRoleOr404(id: string) {
  const role = await db.role.findUnique({
    where: { id },
    include: {
      _count: { select: { users: true, permissions: true } },
      permissions: {
        include: {
          permission: {
            select: { id: true, resource: true, action: true, description: true },
          },
        },
      },
    },
  });
  return role;
}

function formatRole(role: NonNullable<Awaited<ReturnType<typeof getRoleOr404>>>) {
  return {
    id: role.id,
    name: role.name,
    slug: role.slug,
    description: role.description,
    isSystem: role.isSystem,
    isBreakGlass: role.isBreakGlass,
    sortOrder: role.sortOrder,
    createdAt: role.createdAt,
    userCount: role._count.users,
    permissionCount: role._count.permissions,
    permissionIds: role.permissions.map((rp) => rp.permission.id),
    permissions: role.permissions.reduce((acc: Record<string, string[]>, rp) => {
      const resource = rp.permission.resource;
      if (!acc[resource]) acc[resource] = [];
      acc[resource].push(rp.permission.action);
      return acc;
    }, {}),
  };
}

// GET /api/roles/[id] — role detail with permissions + user count
export async function GET(req: NextRequest, ctx: RouteContext) {
  try {
    await requirePermission("role", "read");
    const { id } = await ctx.params;

    const role = await getRoleOr404(id);
    if (!role) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    return NextResponse.json({ role: formatRole(role) });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to fetch role" }, { status: 500 });
  }
}

// PATCH /api/roles/[id] — update name/description and/or sync permissions
// Body: { name?, description?, permissionIds?: string[] }
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requirePermission("role", "update");
    const { id } = await ctx.params;

    const role = await getRoleOr404(id);
    if (!role) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const data: { name?: string; description?: string | null } = {};
    let blockedReason: string | null = null;

    if (body?.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim()) {
        return NextResponse.json({ error: "Role name cannot be empty" }, { status: 400 });
      }
      const newName = body.name.trim();
      if (role.isSystem && newName !== role.name) {
        // System role names are locked — permission edits remain allowed
        blockedReason = "System role name cannot be changed";
      } else if (newName !== role.name) {
        data.name = newName;
      }
    }

    if (body?.description !== undefined) {
      if (body.description === null) {
        data.description = null;
      } else if (typeof body.description === "string") {
        data.description = body.description.trim() || null;
      } else {
        return NextResponse.json({ error: "Invalid description" }, { status: 400 });
      }
    }

    const syncPermissions = body?.permissionIds !== undefined;
    let permissionIds: string[] = [];
    if (syncPermissions) {
      if (!Array.isArray(body.permissionIds) || body.permissionIds.some((v: unknown) => typeof v !== "string")) {
        return NextResponse.json({ error: "permissionIds must be an array of strings" }, { status: 400 });
      }
      permissionIds = Array.from(new Set(body.permissionIds as string[]));
      if (permissionIds.length > 0) {
        const found = await db.permission.count({ where: { id: { in: permissionIds } } });
        if (found !== permissionIds.length) {
          return NextResponse.json({ error: "One or more permission IDs do not exist" }, { status: 400 });
        }
      }
    }

    if (blockedReason && Object.keys(data).length === 0 && !syncPermissions) {
      return NextResponse.json({ error: blockedReason }, { status: 400 });
    }

    const beforePermissions = role.permissions.map((rp) => rp.permission.id);

    const updated = await db.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.role.update({ where: { id: role.id }, data });
      }
      if (syncPermissions) {
        await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
        if (permissionIds.length > 0) {
          await tx.rolePermission.createMany({
            data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
          });
        }
      }
      return tx.role.findUnique({
        where: { id: role.id },
        include: {
          _count: { select: { users: true, permissions: true } },
          permissions: {
            include: {
              permission: {
                select: { id: true, resource: true, action: true, description: true },
              },
            },
          },
        },
      });
    });

    if (!updated) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    const permissionsChanged =
      syncPermissions &&
      (beforePermissions.length !== permissionIds.length ||
        beforePermissions.some((pid) => !permissionIds.includes(pid)));

    await auditRoleChange({
      userId: user.id,
      action: "role_change",
      resource: "role",
      resourceId: role.id,
      resourceName: updated.name,
      before: {
        name: role.name,
        description: role.description,
        permissionIds: beforePermissions,
      },
      after: {
        name: updated.name,
        description: updated.description,
        permissionIds: updated.permissions.map((rp) => rp.permission.id),
      },
      metadata: {
        operation: "update",
        permissionsChanged,
        isSystemRole: role.isSystem,
        ...(blockedReason ? { blockedNameChange: blockedReason } : {}),
      },
    });

    return NextResponse.json({ role: formatRole(updated) });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "A role with this name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to update role" }, { status: 500 });
  }
}

// DELETE /api/roles/[id] — delete a non-system role with zero assigned users
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requirePermission("role", "delete");
    const { id } = await ctx.params;

    const role = await db.role.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!role) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    if (role.isSystem) {
      return NextResponse.json(
        { error: "System roles cannot be deleted", code: "SYSTEM_ROLE" },
        { status: 409 }
      );
    }

    if (role._count.users > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete role: ${role._count.users} user${role._count.users === 1 ? " is" : "s are"} still assigned to it`,
          code: "USERS_ASSIGNED",
          userCount: role._count.users,
        },
        { status: 409 }
      );
    }

    await db.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      await tx.role.delete({ where: { id: role.id } });
    });

    await auditRoleChange({
      userId: user.id,
      action: "role_change",
      resource: "role",
      resourceId: role.id,
      resourceName: role.name,
      before: { name: role.name, slug: role.slug, description: role.description },
      metadata: { operation: "delete" },
    });

    return NextResponse.json({ ok: true, deletedId: role.id });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to delete role" }, { status: 500 });
  }
}
