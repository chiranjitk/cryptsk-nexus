import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ── CORS Headers ────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// ── Types ──────────────────────────────────────────────────────────

interface AgingBucket {
  label: string;
  minDays: number;
  maxDays: number;
  count: number;
  amount: number;
  color: string;
}

interface MonthlyRecovery {
  month: string;
  totalOverdue: number;
  recovered: number;
  recoveryRate: number;
}

interface ChannelEffectiveness {
  channel: string;
  label: string;
  totalPayments: number;
  totalAmount: number;
  avgDaysToCollect: number;
  successRate: number;
}

interface AreaPerformance {
  areaName: string;
  totalOutstanding: number;
  recoveredAmount: number;
  recoveryRate: number;
  avgDaysToCollect: number;
  subscriberCount: number;
}

interface TopDebtor {
  subscriberId: string;
  subscriberName: string;
  phone: string;
  planName: string;
  areaName: string;
  totalOutstanding: number;
  daysOverdue: number;
  invoiceCount: number;
}

interface CollectionAnalyticsResponse {
  agingBuckets: AgingBucket[];
  monthlyRecovery: MonthlyRecovery[];
  channelEffectiveness: ChannelEffectiveness[];
  areaPerformance: AreaPerformance[];
  topDebtors: TopDebtor[];
  dso: number;
  avgDaysToCollect: number;
  summary: {
    totalOutstanding: number;
    totalOverdueInvoices: number;
    totalRecoveredThisMonth: number;
    overallRecoveryRate: number;
  };
  timestamp: string;
}

// ── GET /api/collections/analytics ─────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const now = new Date();

    // ── 1. Aging Buckets ──
    const overdueInvoices = await db.invoice.findMany({
      where: {
        status: "OVERDUE",
        balanceAmount: { gt: 0 },
      },
      select: {
        id: true,
        balanceAmount: true,
        dueDate: true,
        Subscriber: {
          select: {
            id: true,
            name: true,
            phone: true,
            Plan: { select: { name: true } },
            Area: { select: { name: true } },
          },
        },
      },
    });

    const buckets: AgingBucket[] = [
      { label: "0–7 days", minDays: 0, maxDays: 7, count: 0, amount: 0, color: "#10B981" },
      { label: "8–14 days", minDays: 8, maxDays: 14, count: 0, amount: 0, color: "#F59E0B" },
      { label: "15–30 days", minDays: 15, maxDays: 30, count: 0, amount: 0, color: "#F97316" },
      { label: "31–60 days", minDays: 31, maxDays: 60, count: 0, amount: 0, color: "#EF4444" },
      { label: "60+ days", minDays: 61, maxDays: 99999, count: 0, amount: 0, color: "#991B1B" },
    ];

    // Subscriber-level aggregation for top debtors
    const debtorMap = new Map<string, TopDebtor>();

    for (const inv of overdueInvoices) {
      const daysOverdue = Math.max(
        0,
        Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24))
      );

      for (const bucket of buckets) {
        if (daysOverdue >= bucket.minDays && daysOverdue <= bucket.maxDays) {
          bucket.count++;
          bucket.amount += inv.balanceAmount;
          break;
        }
      }

      // Aggregate for top debtors
      const subId = inv.Subscriber.id;
      const existing = debtorMap.get(subId);
      if (existing) {
        existing.totalOutstanding += inv.balanceAmount;
        existing.invoiceCount++;
        existing.daysOverdue = Math.max(existing.daysOverdue, daysOverdue);
      } else {
        debtorMap.set(subId, {
          subscriberId: subId,
          subscriberName: inv.Subscriber.name,
          phone: inv.Subscriber.phone,
          planName: inv.Subscriber.Plan?.name || "N/A",
          areaName: inv.Subscriber.Area?.name || "N/A",
          totalOutstanding: inv.balanceAmount,
          daysOverdue,
          invoiceCount: 1,
        });
      }
    }

    // Round bucket amounts
    for (const b of buckets) {
      b.amount = Math.round(b.amount * 100) / 100;
    }

    // Top debtors sorted by outstanding amount
    const topDebtors = Array.from(debtorMap.values())
      .sort((a, b) => b.totalOutstanding - a.totalOutstanding)
      .slice(0, 20)
      .map((d) => ({ ...d, totalOutstanding: Math.round(d.totalOutstanding * 100) / 100 }));

    const totalOutstanding = overdueInvoices.reduce((sum, inv) => sum + inv.balanceAmount, 0);

    // ── 2. Monthly Recovery Rate (last 6 months) ──
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const recentPaidInvoices = await db.invoice.findMany({
      where: {
        status: { in: ["PAID", "PARTIALLY_PAID"] },
        paidAt: { gte: sixMonthsAgo },
      },
      select: {
        totalAmount: true,
        paidAmount: true,
        paidAt: true,
        dueDate: true,
        issueDate: true,
        paymentMode: true,
        subscriberId: true,
        Subscriber: {
          select: {
            Area: { select: { name: true } },
          },
        },
      },
    });

    const monthlyRecovery: MonthlyRecovery[] = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
      const monthLabel = monthStart.toLocaleString("en-IN", { month: "short", year: "2-digit" });

      // Invoices that became overdue in this month
      const overdueInMonth = overdueInvoices.filter((inv) => {
        const due = new Date(inv.dueDate);
        return due >= monthStart && due <= monthEnd;
      });
      const totalOverdue = overdueInMonth.reduce((sum, inv) => sum + inv.balanceAmount, 0);

      // Payments collected this month
      const paidInMonth = recentPaidInvoices.filter((inv) => {
        const paid = inv.paidAt;
        return paid && paid >= monthStart && paid <= monthEnd;
      });
      const recovered = paidInMonth.reduce((sum, inv) => sum + inv.paidAmount, 0);

      const recoveryRate = totalOverdue > 0 ? Math.round((recovered / totalOverdue) * 10000) / 100 : 0;

      monthlyRecovery.push({
        month: monthLabel,
        totalOverdue: Math.round(totalOverdue * 100) / 100,
        recovered: Math.round(recovered * 100) / 100,
        recoveryRate,
      });
    }

    // ── 3. Channel Effectiveness ──
    const channelModes = ["UPI", "ONLINE", "BANK_TRANSFER", "CASH", "CHEQUE", "WALLET"] as const;
    const channelLabels: Record<string, string> = {
      UPI: "UPI",
      ONLINE: "Online",
      BANK_TRANSFER: "Bank Transfer",
      CASH: "Cash",
      CHEQUE: "Cheque",
      WALLET: "Wallet",
    };

    const channelEffectiveness: ChannelEffectiveness[] = [];
    for (const mode of channelModes) {
      const channelPayments = recentPaidInvoices.filter((inv) => inv.paymentMode === mode);
      if (channelPayments.length === 0) continue;

      const totalAmount = channelPayments.reduce((sum, inv) => sum + inv.paidAmount, 0);
      const totalDays = channelPayments.reduce((sum, inv) => {
        const issue = new Date(inv.issueDate);
        const paid = inv.paidAt || new Date();
        return sum + Math.max(0, Math.floor((paid.getTime() - issue.getTime()) / (1000 * 60 * 60 * 24)));
      }, 0);
      const avgDays = totalDays / channelPayments.length;

      channelEffectiveness.push({
        channel: mode,
        label: channelLabels[mode],
        totalPayments: channelPayments.length,
        totalAmount: Math.round(totalAmount * 100) / 100,
        avgDaysToCollect: Math.round(avgDays * 10) / 10,
        successRate: 100, // Already verified payments
      });
    }

    channelEffectiveness.sort((a, b) => b.totalAmount - a.totalAmount);

    // ── 4. Area Performance ──
    const areaMap = new Map<string, {
      totalOutstanding: number;
      recovered: number;
      totalDays: number;
      count: number;
    }>();

    for (const inv of overdueInvoices) {
      const areaName = inv.Subscriber.Area?.name || "Unknown";
      const existing = areaMap.get(areaName) || { totalOutstanding: 0, recovered: 0, totalDays: 0, count: 0 };
      existing.totalOutstanding += inv.balanceAmount;
      existing.count++;
      areaMap.set(areaName, existing);
    }

    for (const inv of recentPaidInvoices) {
      const areaName = inv.Subscriber.Area?.name || "Unknown";
      const existing = areaMap.get(areaName) || { totalOutstanding: 0, recovered: 0, totalDays: 0, count: 0 };
      existing.recovered += inv.paidAmount;
      const days = Math.max(0, Math.floor((new Date(inv.paidAt!).getTime() - new Date(inv.issueDate).getTime()) / (1000 * 60 * 60 * 24)));
      existing.totalDays += days;
      existing.count++;
      areaMap.set(areaName, existing);
    }

    const areaPerformance: AreaPerformance[] = Array.from(areaMap.entries())
      .map(([areaName, data]) => {
        const recoveryRate = data.totalOutstanding > 0
          ? Math.round((data.recovered / (data.totalOutstanding + data.recovered)) * 10000) / 100
          : 0;
        return {
          areaName,
          totalOutstanding: Math.round(data.totalOutstanding * 100) / 100,
          recoveredAmount: Math.round(data.recovered * 100) / 100,
          recoveryRate,
          avgDaysToCollect: data.totalDays > 0 ? Math.round(data.totalDays / Math.max(1, recentPaidInvoices.filter((p) => p.Subscriber.Area?.name === areaName).length)) : 0,
          subscriberCount: data.count,
        };
      })
      .sort((a, b) => b.totalOutstanding - a.totalOutstanding)
      .slice(0, 10);

    // ── 5. DSO (Days Sales Outstanding) ──
    let totalCollectionDays = 0;
    let totalCollectedAmount = 0;
    for (const inv of recentPaidInvoices) {
      if (inv.paidAt && inv.paidAmount > 0) {
        const days = Math.max(0, (new Date(inv.paidAt).getTime() - new Date(inv.issueDate).getTime()) / (1000 * 60 * 60 * 24));
        totalCollectionDays += days * inv.paidAmount;
        totalCollectedAmount += inv.paidAmount;
      }
    }
    const dso = totalCollectedAmount > 0 ? Math.round(totalCollectionDays / totalCollectedAmount) : 0;
    const avgDaysToCollect = recentPaidInvoices.length > 0
      ? Math.round(recentPaidInvoices.reduce((sum, inv) => {
          if (!inv.paidAt) return sum;
          return sum + Math.max(0, (new Date(inv.paidAt).getTime() - new Date(inv.issueDate).getTime()) / (1000 * 60 * 60 * 24));
        }, 0) / recentPaidInvoices.filter((inv) => inv.paidAt).length)
      : 0;

    // ── 6. Current month recovery ──
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthPaid = recentPaidInvoices.filter((inv) => inv.paidAt && inv.paidAt >= currentMonthStart);
    const recoveredThisMonth = currentMonthPaid.reduce((sum, inv) => sum + inv.paidAmount, 0);
    const overallRecoveryRate = totalOutstanding > 0
      ? Math.round((recoveredThisMonth / totalOutstanding) * 10000) / 100
      : 0;

    // ── Build response ──
    const response: CollectionAnalyticsResponse = {
      agingBuckets: buckets,
      monthlyRecovery,
      channelEffectiveness,
      areaPerformance,
      topDebtors,
      dso,
      avgDaysToCollect,
      summary: {
        totalOutstanding: Math.round(totalOutstanding * 100) / 100,
        totalOverdueInvoices: overdueInvoices.length,
        totalRecoveredThisMonth: Math.round(recoveredThisMonth * 100) / 100,
        overallRecoveryRate,
      },
      timestamp: now.toISOString(),
    };

    return NextResponse.json(response, { headers: corsHeaders });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode, headers: corsHeaders }
      );
    }
    console.error("Collection analytics failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch collection analytics" },
      { status: 500, headers: corsHeaders }
    );
  }
}
