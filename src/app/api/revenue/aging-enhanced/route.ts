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

// ── Types ──────────────────────────────────────────────────────────

interface AgingBucket {
  label: string;
  minDays: number;
  maxDays: number;
  count: number;
  totalAmount: number;
  weightedAvgDays: number;
  color: string;
}

interface WriteOffCandidate {
  invoiceId: string;
  invoiceNumber: string;
  subscriberId: string;
  subscriberName: string;
  balanceAmount: number;
  daysOverdue: number;
  subscriberStatus: string;
  areaName: string;
}

interface MonthlyTrend {
  month: string;
  current: number;
  d1to30: number;
  d31to60: number;
  d61to90: number;
  d90plus: number;
}

interface AreaAging {
  areaId: string;
  areaName: string;
  current: number;
  d1to30: number;
  d31to60: number;
  d61to90: number;
  d90plus: number;
  total: number;
}

// ── Helper: Days between two dates ─────────────────────────────────

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
}

// ── Helper: Get month key YYYY-MM ─────────────────────────────────

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(m, 10) - 1]} ${y}`;
}

// ── GET /api/revenue/aging-enhanced ────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const now = new Date();

    // Fetch all invoices with balance
    const invoices = await db.invoice.findMany({
      where: {
        status: { in: ["OVERDUE", "PARTIALLY_PAID", "SENT"] },
        balanceAmount: { gt: 0 },
      },
      select: {
        id: true,
        invoiceNumber: true,
        totalAmount: true,
        paidAmount: true,
        balanceAmount: true,
        dueDate: true,
        issueDate: true,
        subscriberId: true,
        Subscriber: {
          select: {
            id: true,
            name: true,
            status: true,
            Area: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { dueDate: "asc" },
    });

    // ══════════════════════════════════════════════════════════════
    // Standard Aging Buckets
    // ══════════════════════════════════════════════════════════════
    const bucketDefs: AgingBucket[] = [
      { label: "Current", minDays: 0, maxDays: 0, count: 0, totalAmount: 0, weightedAvgDays: 0, color: "#10B981" },
      { label: "1–30 Days", minDays: 1, maxDays: 30, count: 0, totalAmount: 0, weightedAvgDays: 0, color: "#F59E0B" },
      { label: "31–60 Days", minDays: 31, maxDays: 60, count: 0, totalAmount: 0, weightedAvgDays: 0, color: "#F97316" },
      { label: "61–90 Days", minDays: 61, maxDays: 90, count: 0, totalAmount: 0, weightedAvgDays: 0, color: "#EF4444" },
      { label: "90+ Days", minDays: 91, maxDays: 99999, count: 0, totalAmount: 0, weightedAvgDays: 0, color: "#991B1B" },
    ];

    const writeOffCandidates: WriteOffCandidate[] = [];
    const areaMap = new Map<string, AreaAging>();
    const trendMap = new Map<string, MonthlyTrend>();

    // Initialize trend for last 6 months
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = monthKey(d);
      trendMap.set(key, { month: key, current: 0, d1to30: 0, d31to60: 0, d61to90: 0, d90plus: 0 });
    }

    for (const inv of invoices) {
      const days = daysBetween(new Date(inv.dueDate), now);

      // Classify into bucket
      for (const bucket of bucketDefs) {
        if (days >= bucket.minDays && days <= bucket.maxDays) {
          bucket.count += 1;
          bucket.totalAmount += inv.balanceAmount;
          bucket.weightedAvgDays += days * inv.balanceAmount;
          break;
        }
      }

      // Write-off candidates: 90+ days AND subscriber SUSPENDED/DISCONNECTED
      if (days >= 90 && (inv.Subscriber.status === "SUSPENDED" || inv.Subscriber.status === "DISCONNECTED")) {
        writeOffCandidates.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          subscriberId: inv.Subscriber.id,
          subscriberName: inv.Subscriber.name,
          balanceAmount: inv.balanceAmount,
          daysOverdue: days,
          subscriberStatus: inv.Subscriber.status,
          areaName: inv.Subscriber.Area?.name || "Unknown",
        });
      }

      // Area-wise aging
      const areaId = inv.Subscriber.Area?.id || "unknown";
      const areaName = inv.Subscriber.Area?.name || "Unknown";
      if (!areaMap.has(areaId)) {
        areaMap.set(areaId, {
          areaId,
          areaName,
          current: 0,
          d1to30: 0,
          d31to60: 0,
          d61to90: 0,
          d90plus: 0,
          total: 0,
        });
      }
      const area = areaMap.get(areaId)!;
      area.total += inv.balanceAmount;
      if (days <= 0) area.current += inv.balanceAmount;
      else if (days <= 30) area.d1to30 += inv.balanceAmount;
      else if (days <= 60) area.d31to60 += inv.balanceAmount;
      else if (days <= 90) area.d61to90 += inv.balanceAmount;
      else area.d90plus += inv.balanceAmount;

      // Monthly trend — classify based on issueDate month
      const invMonthKey = monthKey(new Date(inv.issueDate));
      const trend = trendMap.get(invMonthKey);
      if (trend) {
        if (days <= 0) trend.current += inv.balanceAmount;
        else if (days <= 30) trend.d1to30 += inv.balanceAmount;
        else if (days <= 60) trend.d31to60 += inv.balanceAmount;
        else if (days <= 90) trend.d61to90 += inv.balanceAmount;
        else trend.d90plus += inv.balanceAmount;
      }
    }

    // Compute weighted average days per bucket
    for (const bucket of bucketDefs) {
      if (bucket.totalAmount > 0) {
        bucket.weightedAvgDays = Math.round(bucket.weightedAvgDays / bucket.totalAmount);
      }
      bucket.totalAmount = Math.round(bucket.totalAmount * 100) / 100;
    }

    // ══════════════════════════════════════════════════════════════
    // Doubtful Debt Provision
    // 50% of 61-90 day amount + 100% of 90+ day amount
    // ══════════════════════════════════════════════════════════════
    const d61to90Bucket = bucketDefs.find((b) => b.label === "61–90 Days")!;
    const d90plusBucket = bucketDefs.find((b) => b.label === "90+ Days")!;
    const doubtfulDebtProvision = (d61to90Bucket.totalAmount * 0.5) + d90plusBucket.totalAmount;

    const totalOutstanding = bucketDefs.reduce((sum, b) => sum + b.totalAmount, 0);

    // ══════════════════════════════════════════════════════════════
    // Monthly Trend — compute totals per month
    // ══════════════════════════════════════════════════════════════
    const monthlyTrend: MonthlyTrend[] = Array.from(trendMap.values()).map((t) => ({
      ...t,
      current: Math.round(t.current * 100) / 100,
      d1to30: Math.round(t.d1to30 * 100) / 100,
      d31to60: Math.round(t.d31to60 * 100) / 100,
      d61to90: Math.round(t.d61to90 * 100) / 100,
      d90plus: Math.round(t.d90plus * 100) / 100,
    }));

    // ══════════════════════════════════════════════════════════════
    // Area aging
    // ══════════════════════════════════════════════════════════════
    const areaAging = Array.from(areaMap.values())
      .sort((a, b) => b.total - a.total)
      .map((a) => ({
        ...a,
        current: Math.round(a.current * 100) / 100,
        d1to30: Math.round(a.d1to30 * 100) / 100,
        d31to60: Math.round(a.d31to60 * 100) / 100,
        d61to90: Math.round(a.d61to90 * 100) / 100,
        d90plus: Math.round(a.d90plus * 100) / 100,
        total: Math.round(a.total * 100) / 100,
      }));

    // ══════════════════════════════════════════════════════════════
    // Write-off recommendation summary
    // ══════════════════════════════════════════════════════════════
    const writeOffTotal = writeOffCandidates.reduce((sum, c) => sum + c.balanceAmount, 0);

    return NextResponse.json(
      {
        buckets: bucketDefs,
        totalOutstanding: Math.round(totalOutstanding * 100) / 100,
        invoiceCount: invoices.length,
        doubtfulDebtProvision: Math.round(doubtfulDebtProvision * 100) / 100,
        writeOffCandidates,
        writeOffSummary: {
          count: writeOffCandidates.length,
          totalAmount: Math.round(writeOffTotal * 100) / 100,
        },
        monthlyTrend,
        areaAging,
        timestamp: now.toISOString(),
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
    console.error("Enhanced aging analysis failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch enhanced aging analysis" },
      { status: 500, headers: corsHeaders }
    );
  }
}
