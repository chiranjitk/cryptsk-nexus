import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ── Response Types ──────────────────────────────────────────────────

interface CashflowResponse {
  collectionPattern: { dayOfMonth: number; totalCollected: number; paymentCount: number }[];
  averageCollectionRate: number;
  outstandingReceivables: number;
  overdueInvoiceCount: number;
  expectedCashInflow30Days: number;
  paymentModeTrend: {
    month: string;
    modes: { mode: string; amount: number; count: number }[];
  }[];
  dailyCollectionPattern: { dayOfWeek: string; avgAmount: number }[];
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

// ── Helper ──────────────────────────────────────────────────────────

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function formatMonth(date: Date): string {
  return date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MODE_LABELS: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  ONLINE: "Online",
  BANK_TRANSFER: "Bank Transfer",
  CHEQUE: "Cheque",
  WALLET: "Wallet",
};

// ── GET /api/revenue/cashflow ───────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const now = new Date();
    const threeMonthsAgo = addMonths(now, -3);

    // ── 1. Payment collection pattern by day of month (last 3 months) ──
    const recentPayments = await db.payment.findMany({
      where: {
        status: "VERIFIED",
        createdAt: { gte: threeMonthsAgo },
      },
      select: { amount: true, createdAt: true, paymentMode: true },
    });

    // Pattern by day of month
    const dayPattern = new Map<number, { total: number; count: number }>();
    for (let d = 1; d <= 31; d++) {
      dayPattern.set(d, { total: 0, count: 0 });
    }

    // Pattern by day of week
    const weekPattern = new Map<number, { total: number; count: number }>();
    for (let d = 0; d <= 6; d++) {
      weekPattern.set(d, { total: 0, count: 0 });
    }

    for (const p of recentPayments) {
      const day = p.createdAt.getDate();
      const dow = p.createdAt.getDay();
      const dayEntry = dayPattern.get(day) || { total: 0, count: 0 };
      dayEntry.total += p.amount;
      dayEntry.count += 1;
      dayPattern.set(day, dayEntry);

      const weekEntry = weekPattern.get(dow) || { total: 0, count: 0 };
      weekEntry.total += p.amount;
      weekEntry.count += 1;
      weekPattern.set(dow, weekEntry);
    }

    // Days per month in the last 3 months for averaging
    const daysPerMonth = 3;

    const collectionPattern = Array.from(dayPattern.entries()).map(([dayOfMonth, data]) => ({
      dayOfMonth,
      totalCollected: Math.round(data.total),
      paymentCount: data.count,
    }));

    const dailyCollectionPattern = Array.from(weekPattern.entries()).map(([dow, data]) => {
      const months = Math.max(daysPerMonth, 1);
      return {
        dayOfWeek: DAY_LABELS[dow],
        avgAmount: Math.round(data.total / months),
      };
    });

    // ── 2. Average collection rate per month ──
    // Total collected in last 3 months vs total invoiced
    const totalCollected = recentPayments.reduce((sum, p) => sum + p.amount, 0);

    // Get invoices from last 3 months
    const recentInvoices = await db.invoice.aggregate({
      _sum: { grandTotal: true },
      where: {
        createdAt: { gte: threeMonthsAgo },
        status: { in: ["SENT", "PAID", "PARTIALLY_PAID"] },
      },
    });

    const totalInvoiced = recentInvoices._sum.grandTotal || 0;
    const averageCollectionRate =
      totalInvoiced > 0 ? Math.round((totalCollected / totalInvoiced) * 10000) / 100 : 0;

    // ── 3. Outstanding receivables (OVERDUE invoices) ──
    const overdueAgg = await db.invoice.aggregate({
      _sum: { balanceAmount: true, grandTotal: true },
      where: { status: "OVERDUE" },
    });
    const overdueInvoiceCount = await db.invoice.count({
      where: { status: "OVERDUE" },
    });
    const outstandingReceivables = overdueAgg._sum.balanceAmount || overdueAgg._sum.grandTotal || 0;

    // ── 4. Expected cash inflow for next 30 days ──
    // Active MRR subscribers who haven't paid this month
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const activeSubsWithPlan = await db.subscriber.findMany({
      where: { status: "ACTIVE", planId: { not: null } },
      select: { id: true, planId: true },
    });

    const activePlanIds = [...new Set(activeSubsWithPlan.map((s) => s.planId).filter(Boolean))];
    const plans = await db.plan.findMany({
      where: { id: { in: activePlanIds } },
      select: { id: true, priceMonthly: true },
    });
    const planPriceMap = new Map(plans.map((p) => [p.id, p.priceMonthly]));

    // Get subscribers who have already paid this month
    const paidThisMonth = await db.payment.findMany({
      where: {
        status: "VERIFIED",
        createdAt: { gte: currentMonthStart },
      },
      select: { subscriberId: true },
    });
    const paidSubIds = new Set(paidThisMonth.map((p) => p.subscriberId));

    // Expected inflow = sum of monthly plan prices for active subs who haven't paid this month
    // Plus projected payments from those who paid (next billing cycle may fall within 30 days)
    let expectedCashInflow = 0;
    for (const sub of activeSubsWithPlan) {
      const price = planPriceMap.get(sub.planId!) || 0;
      if (!paidSubIds.has(sub.id)) {
        expectedCashInflow += price;
      }
    }
    // Also add a fraction for recurring payments (about 25% of already-paid subs may have another billing cycle in 30 days)
    const paidActiveSubs = activeSubsWithPlan.filter((s) => paidSubIds.has(s.id));
    for (const sub of paidActiveSubs) {
      const price = planPriceMap.get(sub.planId!) || 0;
      expectedCashInflow += price * 0.25;
    }

    // ── 5. Payment mode breakdown trend (last 3 months) ──
    const paymentModeTrend: CashflowResponse["paymentModeTrend"] = [];
    for (let m = 2; m >= 0; m--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - m + 1, 0, 23, 59, 59, 999);
      const monthLabel = formatMonth(monthStart);

      const monthPayments = await db.payment.findMany({
        where: {
          status: "VERIFIED",
          createdAt: { gte: monthStart, lte: monthEnd },
        },
        select: { paymentMode: true, amount: true },
      });

      const modeMap = new Map<string, { amount: number; count: number }>();
      for (const p of monthPayments) {
        const entry = modeMap.get(p.paymentMode) || { amount: 0, count: 0 };
        entry.amount += p.amount;
        entry.count += 1;
        modeMap.set(p.paymentMode, entry);
      }

      paymentModeTrend.push({
        month: monthLabel,
        modes: Array.from(modeMap.entries()).map(([mode, data]) => ({
          mode: MODE_LABELS[mode] || mode,
          amount: Math.round(data.amount),
          count: data.count,
        })),
      });
    }

    // ── Build response ──
    const response: CashflowResponse = {
      collectionPattern,
      averageCollectionRate,
      outstandingReceivables: Math.round(outstandingReceivables),
      overdueInvoiceCount,
      expectedCashInflow: Math.round(expectedCashInflow),
      paymentModeTrend,
      dailyCollectionPattern,
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
    console.error("Cash flow analysis failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch cash flow data" },
      { status: 500, headers: corsHeaders }
    );
  }
}
