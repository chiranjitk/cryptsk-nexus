import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/dashboard/subscriber-lifecycle — Subscriber lifecycle analytics
export async function GET(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (error) {
      if (error instanceof AuthError)
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    const NOW = new Date();

    // ── Total subscribers ──
    const totalSubscribers = await db.subscriber.count();

    // ── Lifecycle stages ──
    const STAGE_CONFIG = [
      { stage: "PENDING_ACTIVATION", label: "New", color: "#0D9488" },
      { stage: "ACTIVE", label: "Active", color: "#10B981" },
      { stage: "TRIAL", label: "Trial", color: "#F59E0B" },
      { stage: "SUSPENDED", label: "Suspended", color: "#DC2626" },
      { stage: "DISCONNECTED", label: "Disconnected", color: "#6B7280" },
    ];

    const statusCountsRaw = await db.subscriber.groupBy({
      by: ["status"],
      _count: { status: true },
    });

    const statusCountMap = new Map(
      statusCountsRaw.map((s) => [s.status, s._count.status])
    );

    const lifecycleStages = STAGE_CONFIG.map((cfg) => ({
      stage: cfg.stage,
      label: cfg.label,
      count: statusCountMap.get(cfg.stage) || 0,
      color: cfg.color,
    }));

    // ── Connection type breakdown ──
    const connectionTypeRaw = await db.subscriber.groupBy({
      by: ["connectionType"],
      _count: { connectionType: true },
    });

    const connectionTypeBreakdown = connectionTypeRaw
      .map((ct) => ({
        type: ct.connectionType,
        count: ct._count.connectionType,
      }))
      .sort((a, b) => b.count - a.count);

    // ── Recently churned subscribers ──
    const recentChurnedRaw = await db.subscriber.findMany({
      where: { status: "DISCONNECTED" },
      select: {
        id: true,
        name: true,
        updatedAt: true,
        planId: true,
        notes: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 3,
    });

    // Get plan names for recently churned
    let recentChurned: {
      name: string;
      date: string;
      plan: string;
      reason: string;
    }[] = [];

    if (recentChurnedRaw.length > 0) {
      const planIds = recentChurnedRaw
        .map((s) => s.planId)
        .filter((id): id is string => id !== null);

      let planNameMap = new Map<string, string>();
      if (planIds.length > 0) {
        const plans = await db.plan.findMany({
          where: { id: { in: planIds } },
          select: { id: true, name: true },
        });
        planNameMap = new Map(plans.map((p) => [p.id, p.name]));
      }

      recentChurned = recentChurnedRaw.map((sub) => ({
        name: sub.name,
        date: sub.updatedAt.toISOString().split("T")[0],
        plan: sub.planId ? (planNameMap.get(sub.planId) || "Unknown") : "No Plan",
        reason: sub.notes || "Not specified",
      }));
    }

    // ── Average lifetime (days) for disconnected subscribers ──
    const disconnectedSubs = await db.subscriber.findMany({
      where: { status: "DISCONNECTED" },
      select: { createdAt: true, updatedAt: true },
      take: 500,
    });

    let totalDays = 0;
    let countedSubs = 0;
    for (const sub of disconnectedSubs) {
      totalDays += (sub.updatedAt.getTime() - sub.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      countedSubs++;
    }
    const avgLifetimeDays = countedSubs > 0 ? Math.round(totalDays / countedSubs) : 0;

    // ── Top plans by subscriber count ──
    const topPlansRaw = await db.subscriber.groupBy({
      by: ["planId"],
      where: { planId: { not: null }, status: { not: "DISCONNECTED" } },
      _count: { planId: true },
      orderBy: { _count: { planId: "desc" } },
      take: 5,
    });

    let topPlans: { name: string; count: number }[] = [];
    if (topPlansRaw.length > 0) {
      const topPlanIds = topPlansRaw
        .map((p) => p.planId)
        .filter((id): id is string => id !== null);

      if (topPlanIds.length > 0) {
        const plans = await db.plan.findMany({
          where: { id: { in: topPlanIds } },
          select: { id: true, name: true },
        });
        const planNameMap = new Map(plans.map((p) => [p.id, p.name]));

        topPlans = topPlansRaw
          .map((p) => ({
            name: p.planId ? (planNameMap.get(p.planId) || "Unknown") : "No Plan",
            count: p._count.planId,
          }))
          .sort((a, b) => b.count - a.count);
      }
    }

    const response = NextResponse.json({
      totalSubscribers,
      lifecycleStages,
      connectionTypeBreakdown,
      recentChurned,
      avgLifetimeDays,
      topPlans,
    });

    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

    return response;
  } catch (error) {
    console.error("[GET /api/dashboard/subscriber-lifecycle]", error);
    return NextResponse.json(
      { error: "Failed to fetch subscriber lifecycle data" },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
