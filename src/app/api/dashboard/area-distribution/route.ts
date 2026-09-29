import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/dashboard/area-distribution
// Returns subscriber distribution across all areas with counts, revenue, and complaints.

interface AreaRow {
  areaId: string;
  areaName: string;
  totalSubscribers: number;
  activeSubscribers: number;
  totalRevenue: number;
  complaintCount: number;
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    // Single query: join Subscriber → Area, left-join Plan for revenue, left-join Complaint for count.
    // SQLite COUNT returns BigInt, so we CAST to INTEGER.
    // SUM on REAL is fine, but we also CAST for safety.
    const rows: AreaRow[] = await db.$queryRaw`
      SELECT
        a."id" AS "areaId",
        a."name" AS "areaName",
        CAST(COUNT(s."id") AS int) AS "totalSubscribers",
        CAST(SUM(CASE WHEN s."status" = 'ACTIVE' THEN 1 ELSE 0 END) AS int) AS "activeSubscribers",
        CAST(COALESCE(SUM(CASE WHEN s."status" = 'ACTIVE' THEN p."priceMonthly" ELSE 0 END), 0) AS float) AS "totalRevenue",
        CAST(COALESCE(c.cnt, 0) AS int) AS "complaintCount"
      FROM "Area" a
      LEFT JOIN "Subscriber" s ON s."areaId" = a."id"
      LEFT JOIN "Plan" p ON s."planId" = p."id"
      LEFT JOIN (
        SELECT "areaId", CAST(COUNT(*) AS int) AS cnt
        FROM "Complaint"
        GROUP BY "areaId"
      ) c ON c."areaId" = a."id"
      WHERE a."status" = 'ACTIVE'
      GROUP BY a."id", a."name", c.cnt
      HAVING COUNT(s."id") > 0
      ORDER BY "totalSubscribers" DESC
    `;

    const areas = rows.map((r) => ({
      areaId: r.areaId,
      areaName: r.areaName,
      totalSubscribers: Number(r.totalSubscribers),
      activeSubscribers: Number(r.activeSubscribers),
      totalRevenue: Number(r.totalRevenue),
      complaintCount: Number(r.complaintCount),
    }));

    const totalAreas = areas.length;
    const totalSubscribers = areas.reduce((sum, a) => sum + a.totalSubscribers, 0);
    const totalActive = areas.reduce((sum, a) => sum + a.activeSubscribers, 0);
    const totalRevenue = areas.reduce((sum, a) => sum + a.totalRevenue, 0);
    const totalComplaints = areas.reduce((sum, a) => sum + a.complaintCount, 0);
    const averagePerArea = totalAreas > 0 ? Math.round(totalSubscribers / totalAreas) : 0;

    return NextResponse.json({
      areas,
      summary: {
        totalAreas,
        totalSubscribers,
        totalActive,
        totalRevenue,
        totalComplaints,
        averagePerArea,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("Area distribution API error:", error);
    return NextResponse.json(
      { error: "Failed to load area distribution" },
      { status: 500 }
    );
  }
}
