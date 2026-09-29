import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { Prisma } from "@prisma/client";

// ── Category label mapping ──────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  FTTH: "FTTH",
  WIRELESS: "Wireless",
  CABLE: "Cable",
  LEASED_LINE: "Leased Line",
  HOTSPOT: "Hotspot",
  COMBO: "Combo",
};

// ── GET /api/plans/performance ─────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    // ── Authentication ──
    await requireAuth(request);

    // ── 1. Get all plans with subscriber count ──
    const plansWithSubscribers = await db.plan.findMany({
      where: {
        status: "ACTIVE",
      },
      select: {
        id: true,
        name: true,
        category: true,
        downloadSpeed: true,
        uploadSpeed: true,
        speedUnit: true,
        priceMonthly: true,
        _count: {
          select: {
            Subscriber: {
              where: {
                status: {
                  in: ["ACTIVE", "TRIAL"],
                },
              },
            },
          },
        },
      },
      orderBy: {
        sortOrder: "asc",
      },
    });

    // ── 2. Enrich with revenue and utilization data ──
    // Calculate total revenue for each plan from active/trial subscribers
    const enrichedPlans = plansWithSubscribers.map((plan) => {
      const subscriberCount = plan._count.Subscriber;
      const totalRevenue = subscriberCount * plan.priceMonthly;

      return {
        id: plan.id,
        name: plan.name,
        category: plan.category,
        categoryLabel: CATEGORY_LABELS[plan.category] ?? plan.category,
        downloadSpeed: plan.downloadSpeed,
        uploadSpeed: plan.uploadSpeed,
        speedUnit: plan.speedUnit,
        priceMonthly: plan.priceMonthly,
        subscriberCount,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        utilizationPercent: 0, // will be calculated after finding max
      };
    });

    // ── 3. Calculate utilizationPercent based on max subscriber count ──
    const maxSubCount = Math.max(
      ...enrichedPlans.map((p) => p.subscriberCount),
      1
    );
    for (const plan of enrichedPlans) {
      plan.utilizationPercent =
        Math.round((plan.subscriberCount / maxSubCount) * 10000) / 100;
    }

    // ── 4. Sort by subscriber count descending ──
    enrichedPlans.sort((a, b) => b.subscriberCount - a.subscriberCount);

    // ── 5. Calculate summary metrics ──
    const totalPlans = enrichedPlans.length;
    const totalSubscribers = enrichedPlans.reduce(
      (sum, p) => sum + p.subscriberCount,
      0
    );
    const totalRevenue = enrichedPlans.reduce(
      (sum, p) => sum + p.totalRevenue,
      0
    );

    // ── 6. Calculate category breakdown ──
    const categoryBreakdown = new Map<string, number>();
    for (const plan of enrichedPlans) {
      const cat = plan.category;
      categoryBreakdown.set(cat, (categoryBreakdown.get(cat) ?? 0) + plan.subscriberCount);
    }
    const categories = Array.from(categoryBreakdown.entries()).map(
      ([category, count]) => ({
        category,
        label: CATEGORY_LABELS[category] ?? category,
        count,
        percentage:
          totalSubscribers > 0
            ? Math.round((count / totalSubscribers) * 10000) / 100
            : 0,
      })
    );
    categories.sort((a, b) => b.count - a.count);

    // ── 7. Most popular and highest revenue plans ──
    const mostPopular = enrichedPlans[0] ?? null;
    const highestRevenue = [...enrichedPlans].sort(
      (a, b) => b.totalRevenue - a.totalRevenue
    )[0] ?? null;
    const averagePrice =
      totalPlans > 0
        ? Math.round(
            (enrichedPlans.reduce((sum, p) => sum + p.priceMonthly, 0) /
              totalPlans) *
              100
          ) / 100
        : 0;

    return NextResponse.json(
      {
        plans: enrichedPlans,
        categories,
        totalPlans,
        totalSubscribers,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        mostPopular,
        highestRevenue,
        averagePrice,
        timestamp: new Date().toISOString(),
      },
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("Plan performance API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch plan performance data" },
      { status: 500 }
    );
  }
}
