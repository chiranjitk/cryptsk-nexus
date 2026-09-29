import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/dashboard/retention — Subscriber retention & churn analysis
export async function GET(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (error) {
      if (error instanceof AuthError)
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    const NOW = new Date();
    // Start of current month
    const startOfMonth = new Date(NOW.getFullYear(), NOW.getMonth(), 1);
    // Start of previous month
    const startOfPrevMonth = new Date(NOW.getFullYear(), NOW.getMonth() - 1, 1);
    const endOfPrevMonth = new Date(NOW.getFullYear(), NOW.getMonth(), 0, 23, 59, 59, 999);

    // Run core queries in parallel
    const [
      totalResult,
      activeResult,
      churnedThisMonthResult,
      churnedLastMonthResult,
      newThisMonthResult,
      newLastMonthResult,
      churnedByTypeRaw,
      atRiskSubscribersRaw,
      subscribersWithComplaintsCount,
      activeWithComplaintsIds,
    ] = await Promise.all([
      // Total subscribers (non-disconnected)
      db.subscriber.count({ where: { status: { not: "DISCONNECTED" } } }),

      // Active subscribers
      db.subscriber.count({ where: { status: "ACTIVE" } }),

      // Churned this month (disconnected this month by updatedAt)
      db.subscriber.count({
        where: {
          status: "DISCONNECTED",
          updatedAt: { gte: startOfMonth },
        },
      }),

      // Churned last month
      db.subscriber.count({
        where: {
          status: "DISCONNECTED",
          updatedAt: { gte: startOfPrevMonth, lte: endOfPrevMonth },
        },
      }),

      // New subscribers this month
      db.subscriber.count({
        where: {
          createdAt: { gte: startOfMonth },
          status: { not: "DISCONNECTED" },
        },
      }),

      // New subscribers last month
      db.subscriber.count({
        where: {
          createdAt: { gte: startOfPrevMonth, lte: endOfPrevMonth },
          status: { not: "DISCONNECTED" },
        },
      }),

      // Churned by connection type (this month)
      db.subscriber.groupBy({
        by: ["connectionType"],
        where: {
          status: "DISCONNECTED",
          updatedAt: { gte: startOfMonth },
        },
        _count: { connectionType: true },
      }),

      // At-risk subscribers: SUSPENDED or negative balance (non-disconnected)
      db.subscriber.findMany({
        where: {
          status: { not: "DISCONNECTED" },
          OR: [
            { status: "SUSPENDED" },
            { balance: { lt: 0 } },
          ],
        },
        select: {
          id: true,
          name: true,
          status: true,
          balance: true,
          planId: true,
          connectionType: true,
        },
        orderBy: { balance: "asc" },
        take: 5,
      }),

      // Total distinct subscribers with complaints (for complaint ratio)
      db.complaint.groupBy({
        by: ["subscriberId"],
        where: { subscriberId: { not: null } },
        _count: true,
      }),

      // Active subscribers with complaints
      db.complaint.groupBy({
        by: ["subscriberId"],
        where: {
          subscriberId: { not: null },
          Subscriber: { status: "ACTIVE" },
        },
        _count: true,
      }),
    ]);

    const total = totalResult;
    const active = activeResult;
    const churnedThisMonth = churnedThisMonthResult;
    const churnedLastMonth = churnedLastMonthResult;
    const newThisMonth = newThisMonthResult;
    const newLastMonth = newLastMonthResult;

    // Churn rate: (disconnected this month / total including disconnected) * 100
    // Use (total + churnedThisMonth) as denominator to approximate totalSubscribers
    // (non-disconnected + those lost this month ≈ start-of-month total), consistent
    // with the main dashboard API's formula.
    const churnDenominator = total + churnedThisMonth;
    const churnRate =
      churnDenominator > 0 ? parseFloat(((churnedThisMonth / churnDenominator) * 100).toFixed(2)) : 0;

    // Retention rate
    const retentionRate = parseFloat((100 - churnRate).toFixed(2));

    // Growth rate: (newThisMonth - newLastMonth) / newLastMonth * 100
    const growthRate =
      newLastMonth > 0
        ? parseFloat((((newThisMonth - newLastMonth) / newLastMonth) * 100).toFixed(1))
        : newThisMonth > 0
          ? 100
          : 0;

    // Average subscriber lifetime (days)
    // For active: days since createdAt. For disconnected: days between createdAt and updatedAt.
    const [activeSubs, disconnectedSubs] = await Promise.all([
      db.subscriber.findMany({
        where: { status: { in: ["ACTIVE", "TRIAL"] } },
        select: { createdAt: true },
        take: 500,
      }),
      db.subscriber.findMany({
        where: { status: "DISCONNECTED" },
        select: { createdAt: true, updatedAt: true },
        take: 500,
      }),
    ]);

    let totalDays = 0;
    let countedSubs = 0;

    for (const sub of activeSubs) {
      totalDays += (NOW.getTime() - sub.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      countedSubs++;
    }
    for (const sub of disconnectedSubs) {
      totalDays += (sub.updatedAt.getTime() - sub.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      countedSubs++;
    }

    const avgLifetimeDays = countedSubs > 0 ? Math.round(totalDays / countedSubs) : 0;

    // Revenue at risk: sum of plan prices for SUSPENDED or negative-balance subscribers
    const atRiskPlanIds = atRiskSubscribersRaw
      .map((s) => s.planId)
      .filter((id): id is string => id !== null);

    let revenueAtRisk = 0;
    if (atRiskPlanIds.length > 0) {
      const uniquePlanIds = [...new Set(atRiskPlanIds)];
      const plans = await db.plan.findMany({
        where: { id: { in: uniquePlanIds } },
        select: { id: true, priceMonthly: true },
      });
      const planPriceMap = new Map(plans.map((p) => [p.id, p.priceMonthly]));
      for (const sub of atRiskSubscribersRaw) {
        if (sub.planId) {
          revenueAtRisk += planPriceMap.get(sub.planId) || 0;
        }
      }
    }
    revenueAtRisk = Math.round(revenueAtRisk * 100) / 100;

    // Complaint ratio: active subscribers with complaints / total active
    const complaintRatio =
      active > 0
        ? parseFloat(((activeWithComplaintsIds.length / active) * 100).toFixed(1))
        : 0;

    // Churn by connection type
    const churnByType = churnedByTypeRaw
      .map((c) => ({
        type: c.connectionType,
        count: c._count.connectionType,
      }))
      .sort((a, b) => b.count - a.count);

    // At-risk subscribers with plan names and days since last payment
    let atRiskSubscribers: {
      id: string;
      name: string;
      status: string;
      balance: number;
      plan: string;
      daysSincePayment: number;
    }[] = [];

    if (atRiskSubscribersRaw.length > 0) {
      const allAtRiskIds = atRiskSubscribersRaw.map((s) => s.id);
      const allPlanIds = [...new Set(atRiskSubscribersRaw.map((s) => s.planId).filter(Boolean))] as string[];

      const [planNameMap, lastPayments] = await Promise.all([
        allPlanIds.length > 0
          ? db.plan.findMany({
              where: { id: { in: allPlanIds } },
              select: { id: true, name: true },
            }).then((plans) => new Map(plans.map((p) => [p.id, p.name])))
          : Promise.resolve(new Map<string, string>()),

        db.payment.groupBy({
          by: ["subscriberId"],
          where: {
            subscriberId: { in: allAtRiskIds },
            status: { in: ["VERIFIED"] },
          },
          _max: { createdAt: true },
        }),
      ]);

      const paymentDateMap = new Map(
        lastPayments.map((p) => [p.subscriberId, p._max.createdAt])
      );

      atRiskSubscribers = atRiskSubscribersRaw.map((sub) => {
        const lastPayment = paymentDateMap.get(sub.id);
        const daysSincePayment = lastPayment
          ? Math.floor((NOW.getTime() - lastPayment.getTime()) / (1000 * 60 * 60 * 24))
          : 999;

        return {
          id: sub.id,
          name: sub.name,
          status: sub.status,
          balance: sub.balance,
          plan: sub.planId ? (planNameMap.get(sub.planId) || "Unknown") : "No Plan",
          daysSincePayment,
        };
      });
    }

    return NextResponse.json({
      metrics: {
        total,
        active,
        churnedThisMonth,
        churnedLastMonth,
        churnRate,
        retentionRate,
        newThisMonth,
        newLastMonth,
        growthRate,
        avgLifetimeDays,
        revenueAtRisk,
        complaintRatio,
      },
      churnByType,
      atRiskSubscribers,
      timestamp: NOW.toISOString(),
    });
  } catch (error) {
    console.error("[GET /api/dashboard/retention]", error);
    return NextResponse.json(
      { error: "Failed to fetch retention data" },
      { status: 500 }
    );
  }
}
