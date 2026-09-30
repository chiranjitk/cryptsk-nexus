/**
 * /api/roles — Phase 1 deliverable: DB-backed Role management
 * GET: list all roles + their permissions
 * POST: create a new role
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditCreate } from "@/lib/services/audit-service";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let userId: string | undefined;
  try {
    userId = await requireAuth(req);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    throw e;
  }
  if (!userId) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });

  try {
    const roles = await db.role.findMany({
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { userAssignments: true } },
      },
      orderBy: { sortOrder: "asc" },
    });
    return NextResponse.json({ roles, total: roles.length });
  } catch (err) {
    logger.error("roles_list_failed", { error: err instanceof Error ? err.message : String(err), userId });
    return NextResponse.json({ error: "Failed to fetch roles" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let userId: string | undefined;
  try {
    userId = await requireAuth(req);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    throw e;
  }
  if (!userId) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });

  try {
    const body = await req.json();
    const { name, slug, description, sortOrder = 0, permissionIds = [] } = body;

    if (!name || !slug) {
      return NextResponse.json({ error: "name and slug are required" }, { status: 400 });
    }

    const role = await db.role.create({
      data: {
        name,
        slug: slug.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
        description: description || "",
        sortOrder: Number(sortOrder),
        isSystem: false,
        permissions: permissionIds.length > 0 ? {
          create: permissionIds.map((pid: string) => ({ permissionId: pid, assignedBy: userId })),
        } : undefined,
      },
      include: { permissions: { include: { permission: true } } },
    });

    await auditCreate(req, "Role", role.id, { name, slug, description, permissionIds }, { userId }).catch(() => {});
    logger.info("role_created", { roleId: role.id, slug: role.slug, userId });
    return NextResponse.json({ role }, { status: 201 });
  } catch (err) {
    logger.error("role_create_failed", { error: err instanceof Error ? err.message : String(err), userId });
    return NextResponse.json({ error: "Failed to create role" }, { status: 500 });
  }
}
