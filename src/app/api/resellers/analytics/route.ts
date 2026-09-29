import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const now = new Date();

    // Fetch all resellers
    const resellers = await db.reseller.findMany({
      orderBy: { totalCommission: "desc" },
    });

    // Fetch all commission payouts
    const allPayouts = await db.resellerCommissionPayout.findMany({
      orderBy: { createdAt: "desc" },
    });

    // Fetch all subscribers with plans and areas
    const subscribers = await db.subscriber.findMany({
      select: {
        id: true,
        status: true,
        areaId: true,
        planId: true,
        createdAt: true,
        Plan: { select: { id: true, name: true, priceMonthly: true, category: true } },
        Area: { select: { id: true, name: true } },
        Payment: { select: { id: true, amount: true, status: true, createdAt: true } },
      },
    });

    // Fetch areas
    const areas = await db.area.findMany({
      select: { id: true, name: true },
    });

    const areaMap = new Map(areas.map((a) => [a.id, a.name]));

    // Date ranges for growth calculation
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    // Build reseller area mappings
    const resellerAreaMap = new Map<string, string[]>();
    for (const r of resellers) {
      let ids: string[] = [];
      try {
        ids = JSON.parse(r.areaIds as string) as string[];
      } catch {
        ids = [];
      }
      resellerAreaMap.set(r.id, ids);
    }

    // Build reseller analytics
    const resellerAnalytics = [];

    for (const r of resellers) {
      const areaIds = resellerAreaMap.get(r.id) || [];
      const subscriberAreaIds = new Set(areaIds);

      // Get subscribers belonging to this reseller's areas
      const resellerSubscribers = areaIds.length > 0
        ? subscribers.filter((s) => subscriberAreaIds.has(s.areaId || ""))
        : [];

      const totalSubs = resellerSubscribers.length;
      const activeSubs = resellerSubscribers.filter((s) => s.status === "ACTIVE").length;
      const inactiveSubs = resellerSubscribers.filter((s) =>
        ["SUSPENDED", "DISCONNECTED"].includes(s.status)
      ).length;
      const churnRate = totalSubs > 0 ? (inactiveSubs / totalSubs) * 100 : 0;

      // Revenue contribution: sum of active subscriber plan prices
      const revenueContribution = resellerSubscribers
        .filter((s) => s.status === "ACTIVE" && s.Plan)
        .reduce((sum, s) => sum + (s.Plan?.priceMonthly || 0), 0);

      // MRR contribution (same as revenue for monthly plans)
      const mrrContribution = revenueContribution;

      // New subscribers this month vs last month
      const newThisMonth = resellerSubscribers.filter(
        (s) => s.createdAt >= thisMonthStart
      ).length;
      const newLastMonth = resellerSubscribers.filter(
        (s) => s.createdAt >= lastMonthStart && s.createdAt <= lastMonthEnd
      ).length;

      // Commission analytics
      const resellerPayouts = allPayouts.filter((p) => p.resellerId === r.id);
      const earnedCommission = resellerPayouts.reduce((s, p) => s + p.commissionAmount, 0);
      const paidCommission = resellerPayouts
        .filter((p) => p.status === "PAID")
        .reduce((s, p) => s + p.commissionAmount, 0);
      const pendingCommission = resellerPayouts
        .filter((p) => p.status === "PENDING")
        .reduce((s, p) => s + p.commissionAmount, 0);

      // Credit utilization
      const creditLimit = r.creditLimit || 0;
      const creditUsed = r.currentCreditUsed || 0;
      const creditUtilization = creditLimit > 0
        ? Math.round((creditUsed / creditLimit) * 10000) / 100
        : 0;
      const creditAvailable = Math.max(0, creditLimit - creditUsed);

      // Performance score (0-100)
      // Subscriber growth (30%): based on new subs vs total
      const growthScore = totalSubs > 0
        ? Math.min(100, (newThisMonth / Math.max(1, totalSubs)) * 500)
        : 50;
      const growthNormalized = Math.min(100, Math.max(0, growthScore));

      // Revenue score (30%): based on mrr relative to target
      const revenueScore = r.monthlyTarget > 0
        ? Math.min(100, (mrrContribution / r.monthlyTarget) * 100)
        : (mrrContribution > 0 ? 70 : 50);
      const revenueNormalized = Math.min(100, Math.max(0, revenueScore));

      // Commission collection (20%): paid vs earned ratio
      const collectionScore = earnedCommission > 0
        ? (paidCommission / earnedCommission) * 100
        : 100;
      const collectionNormalized = Math.min(100, Math.max(0, collectionScore));

      // Credit discipline (20%): inverse of utilization
      const creditScore = creditLimit > 0
        ? Math.max(0, 100 - creditUtilization)
        : 100;
      const creditNormalized = Math.min(100, Math.max(0, creditScore));

      const performanceScore = Math.round(
        growthNormalized * 0.3 +
        revenueNormalized * 0.3 +
        collectionNormalized * 0.2 +
        creditNormalized * 0.2
      );

      resellerAnalytics.push({
        id: r.id,
        name: r.name,
        code: r.code,
        status: r.status,
        phone: r.phone,
        email: r.email,
        areaNames: areaIds.map((id) => areaMap.get(id)).filter(Boolean),
        totalSubscribers: totalSubs,
        activeSubscribers: activeSubs,
        inactiveSubscribers,
        churnRate: Math.round(churnRate * 100) / 100,
        revenueContribution: Math.round(revenueContribution * 100) / 100,
        mrrContribution: Math.round(mrrContribution * 100) / 100,
        newSubscribersThisMonth: newThisMonth,
        newSubscribersLastMonth: newLastMonth,
        subscriberGrowth: newLastMonth > 0
          ? Math.round(((newThisMonth - newLastMonth) / newLastMonth) * 10000) / 100
          : (newThisMonth > 0 ? 100 : 0),
        earnedCommission: Math.round(earnedCommission * 100) / 100,
        paidCommission: Math.round(paidCommission * 100) / 100,
        pendingCommission: Math.round(pendingCommission * 100) / 100,
        creditLimit,
        creditUsed,
        creditAvailable: Math.round(creditAvailable * 100) / 100,
        creditUtilization,
        performanceScore,
        commissionRate: r.commissionRate,
        monthlyTarget: r.monthlyTarget,
      });
    }

    // Summary stats
    const totalResellers = resellers.length;
    const activeResellers = resellers.filter((r) => r.status === "ACTIVE").length;
    const trialResellers = resellers.filter((r) => r.status === "TRIAL").length;
    const suspendedResellers = resellers.filter((r) => r.status === "SUSPENDED").length;

    const totalMrr = resellerAnalytics.reduce((s, a) => s + a.mrrContribution, 0);
    const totalRevenue = resellerAnalytics.reduce((s, a) => s + a.revenueContribution, 0);
    const avgCommissionRate = totalResellers > 0
      ? Math.round(
          resellers.reduce((s, r) => s + r.commissionRate, 0) / totalResellers * 100
        ) / 100
      : 0;
    const totalEarnedCommission = resellerAnalytics.reduce((s, a) => s + a.earnedCommission, 0);
    const totalPendingPayouts = resellerAnalytics.reduce((s, a) => s + a.pendingCommission, 0);
    const avgPerformanceScore = totalResellers > 0
      ? Math.round(resellerAnalytics.reduce((s, a) => s + a.performanceScore, 0) / totalResellers)
      : 0;

    // Top resellers by revenue (for charts)
    const topByRevenue = [...resellerAnalytics]
      .sort((a, b) => b.revenueContribution - a.revenueContribution)
      .slice(0, 10);

    // Monthly subscriber growth trend (last 6 months)
    const monthlyGrowth = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
      const monthLabel = monthStart.toLocaleString("en-US", { month: "short", year: "2-digit" });

      const monthNew = resellerAnalytics.map((a) => {
        const areaIds = resellerAreaMap.get(a.id) || [];
        const areaIdSet = new Set(areaIds);
        const monthSubs = areaIds.length > 0
          ? subscribers.filter(
              (s) => areaIdSet.has(s.areaId || "") &&
              s.createdAt >= monthStart &&
              s.createdAt <= monthEnd
            ).length
          : 0;
        return { resellerId: a.id, name: a.name, count: monthSubs };
      });

      monthlyGrowth.push({
        month: monthLabel,
        newSubscribers: monthNew.reduce((s, m) => s + m.count, 0),
        byReseller: monthNew,
      });
    }

    // Monthly revenue growth trend (last 6 months)
    const monthlyRevenue = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
      const monthLabel = monthStart.toLocaleString("en-US", { month: "short", year: "2-digit" });

      // Revenue from paid invoices in this month
      const monthRevenueByReseller = resellerAnalytics.map((a) => {
        const areaIds = resellerAreaMap.get(a.id) || [];
        const areaIdSet = new Set(areaIds);
        const relevantSubscribers = areaIds.length > 0
          ? subscribers.filter((s) => areaIdSet.has(s.areaId || ""))
          : [];
        const subIds = new Set(relevantSubscribers.map((s) => s.id));

        // Calculate revenue from active subscriber plans
        const rev = relevantSubscribers
          .filter((s) => s.status === "ACTIVE" && s.Plan)
          .reduce((sum, s) => sum + (s.Plan?.priceMonthly || 0), 0);
        return { resellerId: a.id, name: a.name, revenue: Math.round(rev * 100) / 100 };
      });

      monthlyRevenue.push({
        month: monthLabel,
        totalRevenue: monthRevenueByReseller.reduce((s, m) => s + m.revenue, 0),
        byReseller: monthRevenueByReseller,
      });
    }

    return NextResponse.json(
      {
        summary: {
          totalResellers,
          activeResellers,
          trialResellers,
          suspendedResellers,
          totalMrr,
          totalRevenue,
          avgCommissionRate,
          totalEarnedCommission,
          totalPendingPayouts,
          avgPerformanceScore,
        },
        resellers: resellerAnalytics,
        topByRevenue,
        monthlyGrowth,
        monthlyRevenue,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode, headers: corsHeaders }
      );
    }
    console.error("Reseller Analytics API failed:", error);
    return NextResponse.json(
      { error: "Failed to compute reseller analytics" },
      { status: 500, headers: corsHeaders }
    );
  }
}
