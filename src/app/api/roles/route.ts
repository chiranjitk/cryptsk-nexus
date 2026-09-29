import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

// GET /api/roles — list all roles with their permissions + user counts
export async function GET(req: NextRequest) {
  try {
    await requirePermission("role", "list");

    const roles = await db.role.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        _count: {
          select: { users: true },
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
      userCount: role._count.users,
      permissionCount: role.permissions.length,
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
