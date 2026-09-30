/**
 * /api/permissions — Phase 1 deliverable: DB-backed Permission management
 * GET: list all permissions (grouped by resource)
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
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
    const permissions = await db.permission.findMany({
      include: { roles: true },
      orderBy: [{ resource: "asc" }, { action: "asc" }],
    });
    // Group by resource for easier UI rendering
    const grouped: Record<string, typeof permissions> = {};
    for (const p of permissions) {
      if (!grouped[p.resource]) grouped[p.resource] = [];
      grouped[p.resource].push(p);
    }
    return NextResponse.json({ permissions, grouped, total: permissions.length });
  } catch (err) {
    logger.error("permissions_list_failed", { error: err instanceof Error ? err.message : String(err), userId });
    return NextResponse.json({ error: "Failed to fetch permissions" }, { status: 500 });
  }
}
