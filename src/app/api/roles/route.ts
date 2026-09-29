import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditRoleChange } from "@/lib/audit";
import type { PermissionAction } from "@prisma/client";

const VALID_ACTIONS: PermissionAction[] = [
  "read",
  "list",
  "create",
  "update",
  "delete",
  "approve",
  "execute",
  "export",
  "manage",
];

/** Auto-derive a slug from a role name (snake_case, like seeded roles) */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// GET /api/roles — list all roles with their permissions + user counts
export async function GET(req: NextRequest) {
  try {
    await requirePermission("role", "list");

    const roles = await db.role.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        _count: {
          select: { users: true, permissions: true },
        },
        permissions: {
          include: {
            permission: {
              select: { id: true, resource: true, action: true, description: true },
            },
          },
        },
      },
    });

    // Format: group permissions by resource
    const formatted = roles.map((role) => ({
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
    }));

    return NextResponse.json({ roles: formatted });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to fetch roles" }, { status: 500 });
  }
}

// POST /api/roles — create a custom role (isSystem = false)
// Body: { name, slug?, description?, permissionIds?: string[], permissions?: {resource, action}[] }
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("role", "create");

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "Role name is required" }, { status: 400 });
    }
    if (name.length > 100) {
      return NextResponse.json({ error: "Role name must be 100 characters or fewer" }, { status: 400 });
    }

    const slug =
      typeof body?.slug === "string" && body.slug.trim()
        ? slugify(body.slug)
        : slugify(name);
    if (!slug) {
      return NextResponse.json({ error: "Could not derive a valid slug from name" }, { status: 400 });
    }
    if (!/^[a-z0-9_]+$/.test(slug)) {
      return NextResponse.json(
        { error: "Slug may only contain lowercase letters, numbers and underscores" },
        { status: 400 }
      );
    }

    const description =
      typeof body?.description === "string" && body.description.trim()
        ? body.description.trim()
        : null;

    // Resolve permission ids — either explicit permissionIds[] or {resource, action} pairs
    let permissionIds: string[] = [];
    if (Array.isArray(body?.permissionIds)) {
      permissionIds = body.permissionIds.filter((id: unknown) => typeof id === "string");
    } else if (Array.isArray(body?.permissions)) {
      const pairs = body.permissions.filter(
        (p: any) =>
          p &&
          typeof p.resource === "string" &&
          typeof p.action === "string" &&
          VALID_ACTIONS.includes(p.action as PermissionAction)
      );
      if (pairs.length === 0) {
        return NextResponse.json({ error: "No valid permissions provided" }, { status: 400 });
      }
      const perms = await db.permission.findMany({
        where: {
          OR: pairs.map((p: { resource: string; action: string }) => ({
            resource: p.resource,
            action: p.action,
          })),
        },
        select: { id: true },
      });
      permissionIds = perms.map((p) => p.id);
      if (permissionIds.length !== pairs.length) {
        return NextResponse.json(
          { error: "Some resource.action pairs do not match existing permissions" },
          { status: 400 }
        );
      }
    }

    if (permissionIds.length > 0) {
      const found = await db.permission.count({
        where: { id: { in: permissionIds } },
      });
      if (found !== new Set(permissionIds).size) {
        return NextResponse.json({ error: "One or more permission IDs do not exist" }, { status: 400 });
      }
    }

    // Unique slug check → 409
    const existing = await db.role.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json(
        { error: `A role with slug "${slug}" already exists` },
        { status: 409 }
      );
    }

    const uniquePermissionIds = Array.from(new Set(permissionIds));
    const maxSort = await db.role.aggregate({ _max: { sortOrder: true } });
    const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;

    const role = await db.$transaction(async (tx) => {
      const created = await tx.role.create({
        data: {
          name,
          slug,
          description,
          isSystem: false,
          isBreakGlass: false,
          sortOrder,
        },
      });
      if (uniquePermissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: uniquePermissionIds.map((permissionId) => ({
            roleId: created.id,
            permissionId,
          })),
        });
      }
      return created;
    });

    await auditRoleChange({
      userId: user.id,
      action: "role_change",
      resource: "role",
      resourceId: role.id,
      resourceName: role.name,
      after: { name: role.name, slug: role.slug, description: role.description },
      metadata: { operation: "create", permissionCount: uniquePermissionIds.length },
    });

    return NextResponse.json(
      {
        role: {
          id: role.id,
          name: role.name,
          slug: role.slug,
          description: role.description,
          isSystem: role.isSystem,
          isBreakGlass: role.isBreakGlass,
          sortOrder: role.sortOrder,
          createdAt: role.createdAt,
          userCount: 0,
          permissionCount: uniquePermissionIds.length,
          permissionIds: uniquePermissionIds,
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    if (err instanceof Response) return err;
    // Prisma unique constraint (name) → 409
    if (err?.code === "P2002") {
      const target = Array.isArray(err?.meta?.target) ? err.meta.target.join(", ") : "field";
      return NextResponse.json({ error: `A role with this ${target} already exists` }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create role" }, { status: 500 });
  }
}
