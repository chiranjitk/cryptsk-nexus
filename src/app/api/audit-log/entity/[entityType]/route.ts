/**
 * Entity-Specific Audit Log API — /api/audit-log/entity/[entityType]
 *
 * GET — Fetch audit logs for a specific entity type.
 *       Use from subscriber/payment/etc. detail pages to see "all changes ever made".
 *
 * Query params:
 *   entityId  — optional, filter to a specific entity record
 *   page      — page number (default 1)
 *   limit     — items per page (default 50, max 200)
 *   sort      — "asc" or "desc" (default "desc")
 */

import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

interface RouteContext {
  params: Promise<{ entityType: string }>;
}

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    await requireAuth(request);

    const { entityType } = await context.params;

    if (!entityType || typeof entityType !== "string") {
      return NextResponse.json(
        { success: false, error: "entityType is required" },
        { status: 400 }
      );
    }

    const { searchParams } = request.nextUrl;
    const entityId = searchParams.get("entityId");

    const page = Math.max(1, parseInt(searchParams.get("page") || "1") || 1);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50") || 50));
    const skip = (page - 1) * limit;
    const sortDir = searchParams.get("sort") === "asc" ? "asc" : "desc";

    // Build where clause — always filter by entity type, optionally by entityId
    const where: Record<string, unknown> = { entity: entityType };
    if (entityId) where.entityId = entityId;

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { timestamp: sortDir },
        include: {
          User: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      db.auditLog.count({ where }),
    ]);

    // If entityId is provided, also get a summary of action types
    let actionSummary: { action: string; count: number }[] = [];
    if (entityId) {
      actionSummary = await db.auditLog.groupBy({
        by: ["action"],
        where: { entity: entityType, entityId },
        _count: { action: true },
        orderBy: { _count: { action: "desc" } },
      }).then((groups) =>
        groups.map((g) => ({ action: g.action, count: g._count.action }))
      );
    }

    return NextResponse.json({
      entityType,
      entityId: entityId || null,
      logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      actionSummary: actionSummary.length > 0 ? actionSummary : undefined,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("Entity audit log GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch entity audit logs" },
      { status: 500 }
    );
  }
}
