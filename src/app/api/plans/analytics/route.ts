import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/plans/analytics — plan analytics data
export async function GET(request: Request) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    // Subscriber count per plan (adoption rate) — use $queryRaw to avoid Turbopack _count issues
    const adoptionData = await db.$queryRaw<Array<{
      planId: string;
      planName: string;
      category: string;
      subscribers: number;
    }>>`
      SELECT p."id" as "planId", p."name" as "planName", p."category",
             COUNT(s."id") as "subscribers"
      FROM "Plan" p
      LEFT JOIN "Subscriber" s ON s."planId" = p."id"
      WHERE p."status" = 'ACTIVE'
      GROUP BY p."id", p."name", p."category"
      ORDER BY "subscribers" DESC
    `;

    // Revenue per plan from paid invoices — use $queryRaw to avoid groupBy Turbopack issues
    const revenueData = await db.$queryRaw<Array<{
      planId: string;
      totalRevenue: number;
      totalBilled: number;
      invoiceCount: number;
    }>>`
      SELECT i."planId",
             COALESCE(SUM(i."paidAmount"), 0) as "totalRevenue",
             COALESCE(SUM(i."totalAmount"), 0) as "totalBilled",
             COUNT(*) as "invoiceCount"
      FROM "Invoice" i
      WHERE i."status" IN ('PAID', 'PARTIALLY_PAID')
        AND i."planId" IS NOT NULL
      GROUP BY i."planId"
      ORDER BY "totalRevenue" DESC
    `;

    // Get plan names for revenue data
    const planIds = revenueData.map((r) => r.planId).filter(Boolean);
    const planNameMap: Record<string, string> = {};
    if (planIds.length > 0) {
      const placeholders = planIds.map((_, i) => `$${i + 1}`).join(",");
      const plansForRevenue = await db.$queryRawUnsafe<Array<{ id: string; name: string }>>(
        `SELECT "id", "name" FROM "Plan" WHERE "id" IN (${placeholders})`,
        ...planIds,
      );
      for (const p of plansForRevenue) {
        planNameMap[p.id] = p.name;
      }
    }

    const revenueByPlan = revenueData.map((r) => ({
      planId: r.planId,
      planName: planNameMap[r.planId] || "Unknown",
      totalRevenue: Number(r.totalRevenue) || 0,
      totalBilled: Number(r.totalBilled) || 0,
      invoiceCount: Number(r.invoiceCount) || 0,
    }));

    // Category distribution
    const categoryData = await db.$queryRaw<Array<{ category: string; count: number }>>`
      SELECT p."category", COUNT(s."id") as count
      FROM "Plan" p
      LEFT JOIN "Subscriber" s ON s."planId" = p."id" AND s."status" != 'DISCONNECTED'
      WHERE p."status" = 'ACTIVE'
      GROUP BY p."category"
      ORDER BY count DESC
    `;

    // Total stats
    const totalPlans = await db.plan.count();
    const activePlans = await db.plan.count({ where: { status: "ACTIVE" } });
    const totalSubscribers = await db.subscriber.count({
      where: { status: { not: "DISCONNECTED" } },
    });

    return NextResponse.json({
      adoption: adoptionData.map((p) => ({
        planId: p.planId,
        planName: p.planName,
        category: p.category,
        subscribers: Number(p.subscribers) || 0,
      })),
      revenue: revenueByPlan,
      categoryDistribution: categoryData.map((c) => ({
        category: c.category,
        count: Number(c.count) || 0,
      })),
      stats: { totalPlans, activePlans, totalSubscribers },
    });
  } catch (error) {
    console.error("Plan Analytics GET error:", error);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
