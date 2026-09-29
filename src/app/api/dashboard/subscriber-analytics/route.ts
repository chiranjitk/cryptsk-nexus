import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/dashboard/subscriber-analytics — subscriber funnel, connection types, ARPU, growth, plan distribution
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    // Run all queries in parallel
    const [
      trialCount,
      activeCount,
      suspendedCount,
      disconnectedCount,
      pendingCount,
      totalSubscribers,
      ftthCount,
      wirelessCount,
      cableCount,
      leasedLineCount,
      ethernetCount,
      // Active subscribers with plan prices for ARPU
      activeSubscribersWithPlans,
      // New signups this month
      newThisMonth,
      // New signups last month
      newLastMonth,
      // Top 5 plans by subscriber count
      topPlans,
    ] = await Promise.all([
      // Status funnel counts
      db.subscriber.count({ where: { status: "TRIAL" } }),
      db.subscriber.count({ where: { status: "ACTIVE" } }),
      db.subscriber.count({ where: { status: "SUSPENDED" } }),
      db.subscriber.count({ where: { status: "DISCONNECTED" } }),
      db.subscriber.count({ where: { status: "PENDING_ACTIVATION" } }),
      db.subscriber.count(),

      // Connection type counts
      db.subscriber.count({ where: { connectionType: "FTTH" } }),
      db.subscriber.count({ where: { connectionType: "WIRELESS" } }),
      db.subscriber.count({ where: { connectionType: "CABLE" } }),
      db.subscriber.count({ where: { connectionType: "LEASED_LINE" } }),
      db.subscriber.count({ where: { connectionType: "ETHERNET" } }),

      // Active subscribers with their plan prices for ARPU calculation
      db.subscriber.findMany({
        where: { status: "ACTIVE" },
        select: { planId: true },
      }),

      // New signups this month
      db.subscriber.count({
        where: { createdAt: { gte: thisMonthStart } },
      }),

      // New signups last month
      db.subscriber.count({
        where: {
          createdAt: { gte: lastMonthStart, lte: lastMonthEnd },
        },
      }),

      // Top 5 plans by subscriber count
      db.subscriber.groupBy({
        by: ["planId"],
        where: { planId: { not: null }, status: "ACTIVE" },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 5,
      }),
    ]);

    // ── ARPU Calculation ──
    // Get plan prices for active subscriber plan IDs
    const planIds = [...new Set(activeSubscribersWithPlans.map((s) => s.planId).filter(Boolean))];
    let mrr = 0;
    if (planIds.length > 0) {
      const plans = await db.plan.findMany({
        where: { id: { in: planIds } },
        select: { id: true, priceMonthly: true },
      });
      const planPriceMap: Record<string, number> = {};
      for (const p of plans) {
        planPriceMap[p.id] = Number(p.priceMonthly);
      }
      for (const sub of activeSubscribersWithPlans) {
        if (sub.planId && planPriceMap[sub.planId]) {
          mrr += planPriceMap[sub.planId];
        }
      }
    }
    const arpu = activeCount > 0 ? Math.round((mrr / activeCount) * 100) / 100 : 0;

    // ── Growth Rate Calculation ──
    let growthRate = 0;
    if (newLastMonth > 0) {
      growthRate = Math.round(((newThisMonth - newLastMonth) / newLastMonth) * 10000) / 100;
    } else if (newThisMonth > 0) {
      growthRate = 100; // all new
    }

    // ── Plan Distribution ──
    // Batch fetch plan names to avoid N+1
    const topPlanIds = topPlans.map((g) => g.planId).filter(Boolean);
    const topPlansDetails = topPlanIds.length > 0
      ? await db.plan.findMany({
          where: { id: { in: topPlanIds } },
          select: { id: true, name: true },
        })
      : [];
    const topPlanNameMap = new Map(topPlansDetails.map((p) => [p.id, p.name]));

    const planDistribution = topPlans.map((group) => ({
      planName: group.planId ? (topPlanNameMap.get(group.planId) || "Unknown") : "Unknown",
      count: Number(group._count.id),
    }));

    return NextResponse.json({
      // Subscriber funnel
      funnel: {
        trial: Number(trialCount),
        active: Number(activeCount),
        suspended: Number(suspendedCount),
        disconnected: Number(disconnectedCount),
        pending: Number(pendingCount),
        total: Number(totalSubscribers),
      },

      // Connection type breakdown
      connectionTypes: [
        { type: "FTTH", label: "FTTH (Fiber)", count: Number(ftthCount) },
        { type: "WIRELESS", label: "Wireless", count: Number(wirelessCount) },
        { type: "CABLE", label: "Cable", count: Number(cableCount) },
        { type: "LEASED_LINE", label: "Leased Line", count: Number(leasedLineCount) },
        { type: "ETHERNET", label: "Ethernet", count: Number(ethernetCount) },
      ],

      // ARPU and MRR
      arpu,
      mrr: Math.round(mrr * 100) / 100,
      activeSubscribers: Number(activeCount),

      // Growth
      newThisMonth: Number(newThisMonth),
      newLastMonth: Number(newLastMonth),
      growthRate,

      // Plan distribution (top 5)
      planDistribution,

      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("Subscriber analytics API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch subscriber analytics" },
      { status: 500 }
    );
  }
}
