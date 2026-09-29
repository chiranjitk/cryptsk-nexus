import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

// GET /api/radius-accounting — paginated accounting logs with filters
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "10")));
    const username = searchParams.get("username") || "";
    const startDate = searchParams.get("startDate") || "";
    const endDate = searchParams.get("endDate") || "";

    const where: Prisma.RadiusAccountingLogWhereInput = {};

    if (username) {
      where.username = { contains: username };
    }

    if (startDate || endDate) {
      where.acctStartTime = {};
      if (startDate) {
        where.acctStartTime.gte = new Date(startDate);
      }
      if (endDate) {
        // Include the entire end date
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.acctStartTime.lte = end;
      }
    }

    const [items, total] = await Promise.all([
      db.radiusAccountingLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.radiusAccountingLog.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      items,
      total,
      page,
      totalPages,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    const status = (error as any)?.statusCode || 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
