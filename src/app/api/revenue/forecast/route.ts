import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ── Response Types ──────────────────────────────────────────────────

interface ForecastResponse {
  currentMRR: number;
  currentARR: number;
  historicalMRR: { month: string; revenue: number }[];
  forecast: {
    days30: { mrr: number; optimistic: number; pessimistic: number };
    days60: { mrr: number; optimistic: number; pessimistic: number };
    days90: { mrr: number; optimistic: number; pessimistic: number };
  };
  growthMetrics: {
    newSubsLast3Months: number;
    avgNewPerMonth: number;
    churnedLast3Months: number;
    avgChurnPerMonth: number;
    netGrowthPerMonth: number;
    avgPlanPrice: number;
    growthRate: number;
    churnRate: number;
  };
  cashFlowProjection: { week: string; expectedInflow: number }[];
  planMRRBreakdown: { planCategory: string; mrr: number; subscribers: number }[];
  outstandingReceivables: number;
  timestamp: string;
}

// ── CORS Headers ────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// ── Helper: get first day of a month ────────────────────────────────

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatMonth(date: Date): string {
  return date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

// ── GET /api/revenue/forecast ───────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const now = new Date();

    // ── 1. Current MRR: sum of monthly plan prices for ACTIVE subscribers ──
    const activeSubscribers = await db.subscriber.findMany({
      where: { status: "ACTIVE", planId: { not: null } },
      select: { planId: true },
    });

    const activePlanIds = [...new Set(activeSubscribers.map((s) => s.planId).filter(Boolean))];

    const plans = await db.plan.findMany({
      where: { id: { in: activePlanIds } },
      select: { id: true, priceMonthly: true, category: true },
    });

    const planMap = new Map(plans.map((p) => [p.id, p]));
    let currentMRR = 0;
    for (const sub of activeSubscribers) {
      const plan = planMap.get(sub.planId!);
      if (plan) {
        currentMRR += plan.priceMonthly;
      }
    }

    const currentARR = currentMRR * 12;

    // ── 2. Historical MRR trend: Last 6 months of actual revenue from verified payments ──
    const sixMonthsAgo = addMonths(now, -6);
    const sixMonthsAgoStart = startOfMonth(sixMonthsAgo);

    const verifiedPayments = await db.payment.findMany({
      where: {
        status: "VERIFIED",
        createdAt: { gte: sixMonthsAgoStart },
      },
      select: { amount: true, createdAt: true },
    });

    const monthlyRevenue = new Map<string, number>();
    for (let i = 5; i >= 0; i--) {
      const monthDate = addMonths(now, -i);
      const monthKey = formatMonth(monthDate);
      monthlyRevenue.set(monthKey, 0);
    }

    for (const p of verifiedPayments) {
      const monthKey = formatMonth(p.createdAt);
      const current = monthlyRevenue.get(monthKey) || 0;
      monthlyRevenue.set(monthKey, current + p.amount);
    }

    const historicalMRR = Array.from(monthlyRevenue.entries()).map(([month, revenue]) => ({
      month,
      revenue: Math.round(revenue),
    }));

    // ── 3. Growth metrics ──
    const threeMonthsAgo = addMonths(now, -3);
    const threeMonthsAgoStart = startOfMonth(threeMonthsAgo);

    // New ACTIVATE subscribers in last 3 months
    const newActiveSubs = await db.subscriber.count({
      where: {
        status: "ACTIVE",
        activationDate: { gte: threeMonthsAgoStart },
      },
    });

    // Churned subscribers (INACTIVE, SUSPENDED, DISCONNECTED) in last 3 months
    // We check subscribers whose status is not ACTIVE and were updated recently
    const churnedSubs = await db.subscriber.count({
      where: {
        status: { in: ["SUSPENDED", "DISCONNECTED"] },
        updatedAt: { gte: threeMonthsAgoStart },
      },
    });

    const avgNewPerMonth = Math.round((newActiveSubs / 3) * 10) / 10;
    const avgChurnPerMonth = Math.round((churnedSubs / 3) * 10) / 10;
    const netGrowthPerMonth = Math.round((avgNewPerMonth - avgChurnPerMonth) * 10) / 10;

    // Average plan price
    const avgPlanPrice =
      activePlanIds.length > 0
        ? Math.round((plans.reduce((sum, p) => sum + p.priceMonthly, 0) / plans.length) * 100) / 100
        : 0;

    // Growth/churn rates
    const totalActive = activeSubscribers.length;
    const growthRate = totalActive > 0 ? Math.round((avgNewPerMonth / totalActive) * 10000) / 100 : 0;
    const churnRate = totalActive > 0 ? Math.round((avgChurnPerMonth / totalActive) * 10000) / 100 : 0;

    // ── 4. Forecast: 30/60/90 day projections ──
    function calculateProjection(monthsOut: number) {
      const projectedMRR = Math.max(0, currentMRR + netGrowthPerMonth * avgPlanPrice * monthsOut);
      const optimistic = Math.round(projectedMRR * 1.2);
      const pessimistic = Math.round(projectedMRR * 0.8);
      return {
        mrr: Math.round(projectedMRR),
        optimistic,
        pessimistic,
      };
    }

    // ── 5. Cash flow projection: Expected payment inflows for next 90 days ──
    // Estimate based on active subscribers * avg plan price, distributed by weekly pattern
    const avgMonthlyPayment = totalActive > 0 ? currentMRR / totalActive : 0;

    // Get payment collection day pattern from last 3 months
    const recentPayments = await db.payment.findMany({
      where: {
        status: "VERIFIED",
        createdAt: { gte: threeMonthsAgoStart },
      },
      select: { createdAt: true, amount: true },
    });

    // Build weekly distribution pattern (Mon-Sun)
    const weeklyBuckets = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat
    for (const p of recentPayments) {
      const dayOfWeek = p.createdAt.getDay(); // 0=Sun, 6=Sat
      weeklyBuckets[dayOfWeek] += p.amount;
    }

    const totalWeeklyAmount = weeklyBuckets.reduce((a, b) => a + b, 0);

    // Build 13 weeks of cash flow projection (91 days ≈ 90 days)
    const cashFlowProjection: { week: string; expectedInflow: number }[] = [];
    for (let w = 1; w <= 13; w++) {
      const weekDate = new Date(now);
      weekDate.setDate(weekDate.getDate() + w * 7);
      const weekLabel = `Week ${w}`;
      // Expected inflow = total MRR / 4.33 (weeks per month) * 3 months / 13 weeks
      const expectedPerWeek = currentMRR > 0 ? (currentMRR * 3) / 13 : 0;
      cashFlowProjection.push({
        week: weekLabel,
        expectedInflow: Math.round(expectedPerWeek),
      });
    }

    // ── 6. Plan category-wise MRR breakdown ──
    const categoryMRR = new Map<string, { mrr: number; subscribers: number }>();
    for (const sub of activeSubscribers) {
      const plan = planMap.get(sub.planId!);
      if (plan) {
        const category = plan.category || "OTHER";
        const existing = categoryMRR.get(category) || { mrr: 0, subscribers: 0 };
        existing.mrr += plan.priceMonthly;
        existing.subscribers += 1;
        categoryMRR.set(category, existing);
      }
    }

    const planMRRBreakdown = Array.from(categoryMRR.entries()).map(([planCategory, data]) => ({
      planCategory,
      mrr: Math.round(data.mrr),
      subscribers: data.subscribers,
    }));

    // ── 7. Outstanding receivables (OVERDUE invoices) ──
    const overdueInvoices = await db.invoice.aggregate({
      _sum: { balanceAmount: true, grandTotal: true },
      where: { status: "OVERDUE" },
    });

    const outstandingReceivables = overdueInvoices._sum.balanceAmount || overdueInvoices._sum.grandTotal || 0;

    // ── Build response ──
    const response: ForecastResponse = {
      currentMRR: Math.round(currentMRR),
      currentARR: Math.round(currentARR),
      historicalMRR,
      forecast: {
        days30: calculateProjection(1),
        days60: calculateProjection(2),
        days90: calculateProjection(3),
      },
      growthMetrics: {
        newSubsLast3Months: newActiveSubs,
        avgNewPerMonth,
        churnedLast3Months: churnedSubs,
        avgChurnPerMonth,
        netGrowthPerMonth,
        avgPlanPrice,
        growthRate,
        churnRate,
      },
      cashFlowProjection,
      planMRRBreakdown,
      outstandingReceivables: Math.round(outstandingReceivables),
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response, { headers: corsHeaders });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode, headers: corsHeaders }
      );
    }
    console.error("Revenue forecast failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch revenue forecast" },
      { status: 500, headers: corsHeaders }
    );
  }
}
