import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/dashboard/plan-comparison — Plan statistics: subscriber count, revenue, avg revenue
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    // Fetch all plans with subscriber count (SQLite-compatible)
    const planStats = await db.$queryRaw<
      {
        planId: string;
        planName: string;
        subscriberCount: number;
        totalRevenue: number;
      }[]
    >`
      SELECT
        p."id" as "planId",
        p."name" as "planName",
        CAST(COUNT(DISTINCT s."id") AS int) as "subscriberCount",
        CAST(COALESCE(SUM(pay."amount"), 0) AS float) as "totalRevenue"
      FROM "Plan" p
      LEFT JOIN "Subscriber" s ON s."planId" = p."id" AND s."status" IN ('ACTIVE', 'SUSPENDED', 'TRIAL')
      LEFT JOIN "Payment" pay ON pay."subscriberId" = s."id" AND pay."status" = 'VERIFIED'
      WHERE p."status" = 'ACTIVE'
      GROUP BY p."id", p."name"
      HAVING COUNT(DISTINCT s."id") > 0
      ORDER BY COUNT(DISTINCT s."id") DESC
    `;

    const result = planStats.map((stat) => ({
      planName: stat.planName,
      subscriberCount: Number(stat.subscriberCount),
      totalRevenue: Math.round(Number(stat.totalRevenue) * 100) / 100,
      avgRevenuePerSubscriber:
        Number(stat.subscriberCount) > 0
          ? Math.round((Number(stat.totalRevenue) / Number(stat.subscriberCount)) * 100) / 100
          : 0,
    }));

    return NextResponse.json({ plans: result });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("Plan comparison API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch plan comparison data" },
      { status: 500 }
    );
  }
}
