import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import type { Prisma } from "@prisma/client";

// GET /api/audit — list audit events with filters
export async function GET(req: NextRequest) {
  try {
    await requirePermission("audit", "read");

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "50");
    const userId = searchParams.get("userId") || undefined;
    const action = searchParams.get("action") || undefined;
    const resource = searchParams.get("resource") || undefined;
    const result = searchParams.get("result") || undefined;
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const skip = (page - 1) * pageSize;

    const where: Prisma.AuditEventWhereInput = {};
    if (userId) where.userId = userId;
    if (action) where.action = action as Prisma.EnumAuditActionFilter["equals"];
    if (resource) where.resource = resource;
    if (result) where.result = result;
    if (startDate || endDate) {
      where.createdAt = {
        ...(startDate ? { gte: new Date(startDate) } : {}),
        ...(endDate ? { lte: new Date(endDate) } : {}),
      };
    }

    const [events, total] = await Promise.all([
      db.auditEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      db.auditEvent.count({ where }),
    ]);

    return NextResponse.json({
      events,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to fetch audit events" }, { status: 500 });
  }
}
