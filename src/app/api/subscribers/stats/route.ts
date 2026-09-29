import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/subscribers/stats — subscriber statistics dashboard
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    // ── Status counts ─────────────────────────────────────
    // SubscriberStatus enum: ACTIVE, SUSPENDED, DISCONNECTED, TRIAL, PENDING_ACTIVATION
    // "INACTIVE" does NOT exist in the enum — was causing 500 errors
    const [
      total,
      active,
      suspended,
      disconnected,
      trial,
      pending,
      radiusEnabled,
    ] = await Promise.all([
      db.subscriber.count(),
      db.subscriber.count({ where: { status: "ACTIVE" } }),
      db.subscriber.count({ where: { status: "SUSPENDED" } }),
      db.subscriber.count({ where: { status: "DISCONNECTED" } }),
      db.subscriber.count({ where: { status: "TRIAL" } }),
      db.subscriber.count({ where: { status: "PENDING_ACTIVATION" } }),
      db.subscriber.count({ where: { radiusEnabled: true } }),
    ]);

    // ── Connection type distribution ──────────────────────
    const connectionTypeGroups = await db.subscriber.groupBy({
      by: ["connectionType"],
      _count: { connectionType: true },
    });

    const byConnectionType: Record<string, number> = {
      FTTH: 0,
      WIRELESS: 0,
      CABLE: 0,
      LEASED_LINE: 0,
      ETHERNET: 0,
    };
    for (const g of connectionTypeGroups) {
      byConnectionType[g.connectionType] = g._count.connectionType;
    }

    // ── Plan distribution (top 5) ────────────────────────
    const planGroups = await db.subscriber.groupBy({
      by: ["planId"],
      _count: { planId: true },
      orderBy: { _count: { planId: "desc" } },
      take: 5,
    });

    const planIds = planGroups.map((g) => g.planId).filter(Boolean) as string[];
    const planNames: Record<string, string> = {};

    if (planIds.length > 0) {
      const plans = await db.plan.findMany({
        where: { id: { in: planIds } },
        select: { id: true, name: true },
      });
      for (const p of plans) {
        planNames[p.id] = p.name;
      }
    }

    const byPlan = planGroups.map((g) => ({
      planName: planNames[g.planId || ""] || "No Plan",
      count: g._count.planId,
    }));

    // ── Area distribution (top 5) ────────────────────────
    const areaGroups = await db.subscriber.groupBy({
      by: ["areaId"],
      _count: { areaId: true },
      orderBy: { _count: { areaId: "desc" } },
      take: 5,
    });

    const areaIds = areaGroups.map((g) => g.areaId).filter(Boolean) as string[];
    const areaNames: Record<string, string> = {};

    if (areaIds.length > 0) {
      const areas = await db.area.findMany({
        where: { id: { in: areaIds } },
        select: { id: true, name: true },
      });
      for (const a of areas) {
        areaNames[a.id] = a.name;
      }
    }

    const byArea = areaGroups.map((g) => ({
      areaName: areaNames[g.areaId || ""] || "No Area",
      count: g._count.areaId,
    }));

    // ── Monthly growth ───────────────────────────────────
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const [newThisMonth, newLastMonth] = await Promise.all([
      db.subscriber.count({
        where: { createdAt: { gte: thisMonthStart } },
      }),
      db.subscriber.count({
        where: {
          createdAt: { gte: lastMonthStart, lte: lastMonthEnd },
        },
      }),
    ]);

    const growthPercent =
      newLastMonth > 0
        ? Math.round(((newThisMonth - newLastMonth) / newLastMonth) * 10000) / 100
        : newThisMonth > 0
          ? 100
          : 0;

    // ── Revenue metrics (active subscribers' plan prices — optimized) ─
    const planRevenueAgg = await db.plan.findMany({
      include: {
        _count: { select: { Subscriber: { where: { status: 'ACTIVE' } } } },
      },
    });

    let totalMonthlyRevenue = 0;
    let activeWithPlanCount = 0;
    for (const plan of planRevenueAgg) {
      const activeCount = plan._count.Subscriber;
      if (activeCount > 0) {
        totalMonthlyRevenue += (plan.priceMonthly || 0) * activeCount;
        activeWithPlanCount += activeCount;
      }
    }

    const avgMonthlyRevenue =
      activeWithPlanCount > 0
        ? Math.round((totalMonthlyRevenue / activeWithPlanCount) * 100) / 100
        : 0;

    // ── Activation rate ──────────────────────────────────
    const activationRate =
      total > 0
        ? Math.round((active / total) * 10000) / 100
        : 0;

    return NextResponse.json({
      total,
      active,
      suspended,
      disconnected,
      trial,
      pending,
      inactive: total - active - suspended - disconnected - trial - pending,
      radiusEnabled,
      byConnectionType,
      byPlan,
      byArea,
      newThisMonth,
      newLastMonth,
      growthPercent,
      avgMonthlyRevenue,
      totalMonthlyRevenue,
      activationRate,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("Subscriber stats GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch subscriber statistics" },
      { status: 500 }
    );
  }
}
