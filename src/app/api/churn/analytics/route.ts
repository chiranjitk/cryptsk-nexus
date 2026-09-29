import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ─── GET /api/churn/analytics ────────────────────────────────
// Returns comprehensive churn analytics for the dashboard

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

    // ── 1. Risk Distribution ──
    // Run the prediction logic inline to get distribution
    const activeSubscribers = await db.subscriber.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        status: true,
        activationDate: true,
        createdAt: true,
        balance: true,
        lastAuthAt: true,
        planId: true,
        areaId: true,
      },
    });

    const subscriberIds = activeSubscribers.map((s) => s.id);

    const [
      overdueInvoices,
      failedPayments,
      recentComplaints,
      lastVerifiedPayments,
    ] = await Promise.all([
      db.invoice.findMany({
        where: {
          subscriberId: { in: subscriberIds },
          status: { in: ["OVERDUE", "DRAFT", "SENT"] },
          dueDate: { lt: now },
        },
        select: { subscriberId: true, balanceAmount: true, dueDate: true },
      }),
      db.payment.findMany({
        where: {
          subscriberId: { in: subscriberIds },
          status: "FAILED",
          createdAt: { gte: ninetyDaysAgo },
        },
        select: { subscriberId: true },
      }),
      db.complaint.findMany({
        where: {
          subscriberId: { in: subscriberIds },
          createdAt: { gte: ninetyDaysAgo },
        },
        select: { subscriberId: true, status: true, priority: true },
      }),
      db.payment.findMany({
        where: {
          subscriberId: { in: subscriberIds },
          status: "VERIFIED",
        },
        select: { subscriberId: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    // Build lookup maps
    const overdueMap = new Map<string, number>();
    for (const inv of overdueInvoices) {
      overdueMap.set(inv.subscriberId, (overdueMap.get(inv.subscriberId) || 0) + 1);
    }

    const failedMap = new Map<string, number>();
    for (const p of failedPayments) {
      failedMap.set(p.subscriberId, (failedMap.get(p.subscriberId) || 0) + 1);
    }

    const complaintMap = new Map<string, { total: number; unresolved: number; highPriority: number }>();
    for (const c of recentComplaints) {
      const existing = complaintMap.get(c.subscriberId) || { total: 0, unresolved: 0, highPriority: 0 };
      existing.total++;
      if (c.status !== "CLOSED") existing.unresolved++;
      if (c.priority === "P1_CRITICAL" || c.priority === "P2_HIGH") existing.highPriority++;
      complaintMap.set(c.subscriberId, existing);
    }

    const lastPayMap = new Map<string, Date>();
    for (const p of lastVerifiedPayments) {
      if (!lastPayMap.has(p.subscriberId)) {
        lastPayMap.set(p.subscriberId, new Date(p.createdAt));
      }
    }

    // Calculate scores for distribution
    const riskDistribution = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    const areaRisk: Record<string, { scores: number[]; count: number; highRisk: number }> = {};
    const planRisk: Record<string, { scores: number[]; count: number; highRisk: number }> = {};
    let revenueAtRisk = 0;

    for (const sub of activeSubscribers) {
      let score = 0;

      // Payment (30%)
      const overdueCount = overdueMap.get(sub.id) || 0;
      const failedCount = failedMap.get(sub.id) || 0;
      if (overdueCount >= 3) score += 30;
      else if (overdueCount >= 2) score += 22;
      else if (overdueCount >= 1) score += 12;
      if (failedCount >= 3) score = Math.min(100, score + 10);
      else if (failedCount >= 1) score = Math.min(100, score + 8);

      const lastPay = lastPayMap.get(sub.id);
      if (lastPay) {
        const daysSince = Math.floor((now.getTime() - lastPay.getTime()) / 86400000);
        if (daysSince > 60) score = 30;
        else if (daysSince > 45) score = Math.max(score, 20);
        else if (daysSince > 30) score = Math.max(score, 15);
      } else {
        score = 30;
      }
      const paymentScore = Math.min(30, score);
      score = paymentScore;

      // Complaints (25%)
      const complaints = complaintMap.get(sub.id);
      let complaintScore = 0;
      if (complaints) {
        if (complaints.total >= 5) complaintScore = 25;
        else if (complaints.total >= 3) complaintScore = 20;
        else if (complaints.total >= 1) complaintScore = 10;
        if (complaints.unresolved >= 3) complaintScore = 25;
        else if (complaints.unresolved >= 2) complaintScore = Math.max(complaintScore, 18);
        else if (complaints.unresolved >= 1) complaintScore = Math.max(complaintScore, 12);
        if (complaints.highPriority >= 2) complaintScore = 22;
        else if (complaints.highPriority >= 1) complaintScore = Math.max(complaintScore, 15);
      }
      score += complaintScore;

      // Tenure (15%)
      const activationDate = sub.activationDate ? new Date(sub.activationDate) : new Date(sub.createdAt);
      const tenureMonths = Math.floor((now.getTime() - activationDate.getTime()) / (30.44 * 86400000));
      if (tenureMonths < 1) score += 15;
      else if (tenureMonths < 3) score += 12;
      else if (tenureMonths < 6) score += 7;
      else if (tenureMonths < 12) score += 3;

      // Engagement (15%)
      if (sub.lastAuthAt) {
        const daysSinceAuth = Math.floor((now.getTime() - new Date(sub.lastAuthAt).getTime()) / 86400000);
        if (daysSinceAuth > 30) score += 15;
        else if (daysSinceAuth > 14) score += 10;
        else if (daysSinceAuth > 7) score += 5;
      } else {
        score += 15;
      }

      // Balance (15%)
      if (sub.balance < -2000) score += 15;
      else if (sub.balance < -1000) score += 12;
      else if (sub.balance < -500) score += 8;
      else if (sub.balance < 0) score += 4;

      score = Math.min(100, Math.round(score));

      // Classify
      let level: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
      if (score >= 75) level = "CRITICAL";
      else if (score >= 60) level = "HIGH";
      else if (score >= 40) level = "MEDIUM";
      else level = "LOW";

      riskDistribution[level]++;

      // Area breakdown
      if (sub.areaId) {
        if (!areaRisk[sub.areaId]) areaRisk[sub.areaId] = { scores: [], count: 0, highRisk: 0 };
        areaRisk[sub.areaId].scores.push(score);
        areaRisk[sub.areaId].count++;
        if (level === "CRITICAL" || level === "HIGH") areaRisk[sub.areaId].highRisk++;
      }

      // Plan breakdown
      if (sub.planId) {
        if (!planRisk[sub.planId]) planRisk[sub.planId] = { scores: [], count: 0, highRisk: 0 };
        planRisk[sub.planId].scores.push(score);
        planRisk[sub.planId].count++;
        if (level === "CRITICAL" || level === "HIGH") planRisk[sub.planId].highRisk++;
      }

      // Revenue at risk (high-risk subscribers)
      if (level === "CRITICAL" || level === "HIGH") {
        // Get plan price
        const plan = await getPlanPrice(sub.planId);
        revenueAtRisk += plan;
      }
    }

    // ── 2. Area-wise risk breakdown ──
    const areaIds = Object.keys(areaRisk);
    let areaBreakdown: { areaId: string; areaName: string; totalSubscribers: number; avgRiskScore: number; highRiskCount: number }[] = [];

    if (areaIds.length > 0) {
      const areas = await db.area.findMany({
        where: { id: { in: areaIds } },
        select: { id: true, name: true },
      });

      const areaNameMap = new Map(areas.map((a) => [a.id, a.name]));

      areaBreakdown = areaIds.map((areaId) => {
        const data = areaRisk[areaId];
        const avgScore = data.scores.length > 0
          ? Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length)
          : 0;
        return {
          areaId,
          areaName: areaNameMap.get(areaId) || "Unknown",
          totalSubscribers: data.count,
          avgRiskScore: avgScore,
          highRiskCount: data.highRisk,
        };
      }).sort((a, b) => b.avgRiskScore - a.avgRiskScore);
    }

    // ── 3. Plan-wise risk breakdown ──
    const planIds = Object.keys(planRisk);
    let planBreakdown: { planId: string; planName: string; totalSubscribers: number; avgRiskScore: number; highRiskCount: number }[] = [];

    if (planIds.length > 0) {
      const plans = await db.plan.findMany({
        where: { id: { in: planIds } },
        select: { id: true, name: true },
      });

      const planNameMap = new Map(plans.map((p) => [p.id, p.name]));

      planBreakdown = planIds.map((planId) => {
        const data = planRisk[planId];
        const avgScore = data.scores.length > 0
          ? Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length)
          : 0;
        return {
          planId,
          planName: planNameMap.get(planId) || "Unknown",
          totalSubscribers: data.count,
          avgRiskScore: avgScore,
          highRiskCount: data.highRisk,
        };
      }).sort((a, b) => b.avgRiskScore - a.avgRiskScore);
    }

    // ── 4. Monthly churn trend (last 6 months) ──
    const churnTrend: { month: string; churned: number; activated: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
      const monthLabel = monthStart.toLocaleString("en-IN", { month: "short", year: "2-digit" });

      const [churned, activated] = await Promise.all([
        db.subscriber.count({
          where: {
            status: "DISCONNECTED",
            updatedAt: { gte: monthStart, lt: monthEnd },
          },
        }),
        db.subscriber.count({
          where: {
            createdAt: { gte: monthStart, lt: monthEnd },
          },
        }),
      ]);

      churnTrend.push({
        month: monthLabel,
        churned,
        activated,
      });
    }

    // ── 5. Top churn reasons ──
    const topReasons = await getTopChurnReasons(subscriberIds, now);

    return NextResponse.json({
      riskDistribution,
      areaBreakdown,
      planBreakdown,
      churnTrend,
      revenueAtRisk,
      topReasons,
      totalActiveSubscribers: activeSubscribers.length,
      generatedAt: now.toISOString(),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("Churn analytics API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch churn analytics" },
      { status: 500 }
    );
  }
}

// ─── Plan price cache ───────────────────────────────────────

const planPriceCache = new Map<string, number>();

async function getPlanPrice(planId: string | null): Promise<number> {
  if (!planId) return 0;
  if (planPriceCache.has(planId)) return planPriceCache.get(planId)!;
  const plan = await db.plan.findUnique({
    where: { id: planId },
    select: { priceMonthly: true },
  });
  const price = plan?.priceMonthly || 0;
  planPriceCache.set(planId, price);
  return price;
}

// ─── Top Churn Reasons ──────────────────────────────────────

async function getTopChurnReasons(subscriberIds: string[], now: Date) {
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400000);

  // Count overdue invoices per subscriber
  const overdueCounts = await db.invoice.groupBy({
    by: ["subscriberId"],
    where: {
      subscriberId: { in: subscriberIds },
      status: { in: ["OVERDUE", "DRAFT", "SENT"] },
      dueDate: { lt: now },
    },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 20,
  });

  // Count complaints per subscriber
  const complaintCounts = await db.complaint.groupBy({
    by: ["subscriberId"],
    where: {
      subscriberId: { in: subscriberIds },
      createdAt: { gte: ninetyDaysAgo },
    },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 20,
  });

  // Count failed payments
  const failedCounts = await db.payment.groupBy({
    by: ["subscriberId"],
    where: {
      subscriberId: { in: subscriberIds },
      status: "FAILED",
      createdAt: { gte: ninetyDaysAgo },
    },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 20,
  });

  // Build aggregated reason data
  const reasons: { reason: string; count: number; category: string }[] = [];

  // Payment issues
  const overdueSubCount = overdueCounts.filter((o) => o._count.id >= 1).length;
  const severeOverdueCount = overdueCounts.filter((o) => o._count.id >= 3).length;
  if (severeOverdueCount > 0) reasons.push({ reason: "Multiple overdue invoices (3+)", count: severeOverdueCount, category: "payment" });
  if (overdueSubCount > severeOverdueCount) reasons.push({ reason: "Overdue invoices", count: overdueSubCount - severeOverdueCount, category: "payment" });

  const failedSubCount = failedCounts.filter((f) => f._count.id >= 1).length;
  if (failedSubCount > 0) reasons.push({ reason: "Failed payments", count: failedSubCount, category: "payment" });

  // Service issues
  const highComplaintCount = complaintCounts.filter((c) => c._count.id >= 3).length;
  const someComplaintCount = complaintCounts.filter((c) => c._count.id >= 1).length;
  if (highComplaintCount > 0) reasons.push({ reason: "Frequent complaints (3+)", count: highComplaintCount, category: "service" });
  if (someComplaintCount > highComplaintCount) reasons.push({ reason: "Service complaints", count: someComplaintCount - highComplaintCount, category: "service" });

  // Balance issues
  const negativeBalanceCount = await db.subscriber.count({
    where: {
      id: { in: subscriberIds },
      balance: { lt: 0 },
    },
  });
  if (negativeBalanceCount > 0) reasons.push({ reason: "Negative balance", count: negativeBalanceCount, category: "financial" });

  // Inactivity
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const inactiveCount = await db.subscriber.count({
    where: {
      id: { in: subscriberIds },
      lastAuthAt: { lt: thirtyDaysAgo },
    },
  });
  const neverActiveCount = await db.subscriber.count({
    where: {
      id: { in: subscriberIds },
      lastAuthAt: null,
    },
  });
  if (inactiveCount > 0) reasons.push({ reason: "Inactive (30+ days)", count: inactiveCount, category: "engagement" });
  if (neverActiveCount > 0) reasons.push({ reason: "No RADIUS activity", count: neverActiveCount, category: "engagement" });

  return reasons.sort((a, b) => b.count - a.count).slice(0, 10);
}
