import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import type { PermissionAction } from "@prisma/client";

// Canonical verb order per spec 08_SEC §7:
// read, list, create, update, delete, approve, execute, export, manage
const ACTION_ORDER: PermissionAction[] = [
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

type PermissionItem = {
  id: string;
  resource: string;
  action: PermissionAction;
  description: string | null;
};

// GET /api/permissions — all permissions grouped by resource, ordered
export async function GET(req: NextRequest) {
  try {
    await requirePermission("permission", "list");

    const permissions = await db.permission.findMany({
      orderBy: [{ resource: "asc" }, { action: "asc" }],
      select: { id: true, resource: true, action: true, description: true },
    });

    // Group by resource, keep actions in canonical verb order
    const groupsMap = new Map<string, PermissionItem[]>();
    for (const p of permissions) {
      let list = groupsMap.get(p.resource);
      if (!list) {
        list = [];
        groupsMap.set(p.resource, list);
      }
      list.push({ id: p.id, resource: p.resource, action: p.action, description: p.description });
    }

    const groups = Array.from(groupsMap.entries())
      .map(([resource, perms]) => ({
        resource,
        permissions: perms.sort(
          (a, b) => ACTION_ORDER.indexOf(a.action) - ACTION_ORDER.indexOf(b.action)
        ),
      }))
      .sort((a, b) => a.resource.localeCompare(b.resource));

    return NextResponse.json({ groups, total: permissions.length });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to fetch permissions" }, { status: 500 });
  }
}
