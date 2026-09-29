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

interface AdjustmentItem {
  id: string;
  type: "CREDIT_NOTE" | "REFUND" | "DISCOUNT";
  amount: number;
  reason: string;
  status: string;
  date: string;
  subscriberName: string;
  referenceNumber: string;
  createdBy: string;
}

interface AdjustmentGroup {
  type: string;
  count: number;
  totalAmount: number;
  items: AdjustmentItem[];
}

interface AnomalyFlag {
  id: string;
  type: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  description: string;
  amount: number;
  subscriberName: string;
  date: string;
  referenceNumber: string;
}

interface MonthlyAdjustment {
  month: string;
  label: string;
  creditNotes: number;
  refunds: number;
  discounts: number;
  totalAdjustments: number;
}

// ── Helper: month key ─────────────────────────────────────────────

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(m, 10) - 1]} ${y}`;
}

// ── GET /api/revenue/audit ────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const now = new Date();
    const allItems: AdjustmentItem[] = [];
    const anomalies: AnomalyFlag[] = [];

    // ══════════════════════════════════════════════════════════════
    // 1. CREDIT NOTES
    // ══════════════════════════════════════════════════════════════
    const creditNotes = await db.creditNote.findMany({
      select: {
        id: true,
        amount: true,
        reason: true,
        status: true,
        createdAt: true,
        Invoice: {
          select: {
            invoiceNumber: true,
            Subscriber: { select: { name: true } },
          },
        },
        creator: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    for (const cn of creditNotes) {
      allItems.push({
        id: cn.id,
        type: "CREDIT_NOTE",
        amount: cn.amount,
        reason: cn.reason || "No reason provided",
        status: cn.status,
        date: cn.createdAt.toISOString(),
        subscriberName: cn.Invoice.Subscriber.name,
        referenceNumber: cn.Invoice.invoiceNumber,
        createdBy: cn.creator?.name || "System",
      });
    }

    // ══════════════════════════════════════════════════════════════
    // 2. REFUNDS
    // ══════════════════════════════════════════════════════════════
    const refunds = await db.refund.findMany({
      select: {
        id: true,
        amount: true,
        reason: true,
        status: true,
        createdAt: true,
        mode: true,
        payment: {
          select: {
            Subscriber: { select: { name: true } },
            Invoice: { select: { invoiceNumber: true } },
          },
        },
        processedBy: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    for (const r of refunds) {
      allItems.push({
        id: r.id,
        type: "REFUND",
        amount: r.amount,
        reason: r.reason || `Refund via ${r.mode}`,
        status: r.status,
        date: r.createdAt.toISOString(),
        subscriberName: r.payment.Subscriber.name,
        referenceNumber: r.payment.Invoice?.invoiceNumber || r.id.slice(0, 8),
        createdBy: r.processedBy?.name || "System",
      });
    }

    // ══════════════════════════════════════════════════════════════
    // 3. DISCOUNTS APPLIED
    // ══════════════════════════════════════════════════════════════
    const discountInvoices = await db.invoice.findMany({
      where: { discountAmount: { gt: 0 } },
      select: {
        id: true,
        discountAmount: true,
        discountType: true,
        discountValue: true,
        subtotal: true,
        invoiceNumber: true,
        issueDate: true,
        Subscriber: { select: { name: true } },
      },
      orderBy: { issueDate: "desc" },
    });

    for (const inv of discountInvoices) {
      const desc = inv.discountType
        ? `${inv.discountType === "PERCENTAGE" ? `${inv.discountValue}% off` : `₹${inv.discountValue} flat off`} on ₹${inv.subtotal}`
        : `₹${inv.discountAmount} discount on ₹${inv.subtotal}`;
      allItems.push({
        id: `disc-${inv.id}`,
        type: "DISCOUNT",
        amount: inv.discountAmount,
        reason: desc,
        status: "APPLIED",
        date: inv.issueDate.toISOString(),
        subscriberName: inv.Subscriber.name,
        referenceNumber: inv.invoiceNumber,
        createdBy: "System",
      });
    }

    // ══════════════════════════════════════════════════════════════
    // Group by type with totals
    // ══════════════════════════════════════════════════════════════
    const groups: Record<string, AdjustmentItem[]> = {
      CREDIT_NOTE: [],
      REFUND: [],
      DISCOUNT: [],
    };
    for (const item of allItems) {
      groups[item.type].push(item);
    }

    const adjustmentGroups: AdjustmentGroup[] = [
      {
        type: "CREDIT_NOTE",
        count: groups.CREDIT_NOTE.length,
        totalAmount: groups.CREDIT_NOTE.reduce((s, i) => s + i.amount, 0),
        items: groups.CREDIT_NOTE,
      },
      {
        type: "REFUND",
        count: groups.REFUND.length,
        totalAmount: groups.REFUND.reduce((s, i) => s + i.amount, 0),
        items: groups.REFUND,
      },
      {
        type: "DISCOUNT",
        count: groups.DISCOUNT.length,
        totalAmount: groups.DISCOUNT.reduce((s, i) => s + i.amount, 0),
        items: groups.DISCOUNT,
      },
    ];

    // ══════════════════════════════════════════════════════════════
    // Top 10 largest adjustments
    // ══════════════════════════════════════════════════════════════
    const top10 = [...allItems].sort((a, b) => b.amount - a.amount).slice(0, 10);

    // ══════════════════════════════════════════════════════════════
    // Monthly adjustment trend (last 6 months)
    // ══════════════════════════════════════════════════════════════
    const trendMap = new Map<string, MonthlyAdjustment>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = monthKey(d);
      trendMap.set(key, {
        month: key,
        label: monthLabel(key),
        creditNotes: 0,
        refunds: 0,
        discounts: 0,
        totalAdjustments: 0,
      });
    }

    for (const item of allItems) {
      const itemMonth = monthKey(new Date(item.date));
      const trend = trendMap.get(itemMonth);
      if (trend) {
        if (item.type === "CREDIT_NOTE") trend.creditNotes += item.amount;
        else if (item.type === "REFUND") trend.refunds += item.amount;
        else if (item.type === "DISCOUNT") trend.discounts += item.amount;
        trend.totalAdjustments += item.amount;
      }
    }

    const monthlyTrend = Array.from(trendMap.values()).map((t) => ({
      ...t,
      creditNotes: Math.round(t.creditNotes * 100) / 100,
      refunds: Math.round(t.refunds * 100) / 100,
      discounts: Math.round(t.discounts * 100) / 100,
      totalAdjustments: Math.round(t.totalAdjustments * 100) / 100,
    }));

    // ══════════════════════════════════════════════════════════════
    // Anomaly Detection
    // ══════════════════════════════════════════════════════════════

    // Unusual credit note amounts (>2x average)
    if (creditNotes.length > 2) {
      const avgCn = creditNotes.reduce((s, c) => s + c.amount, 0) / creditNotes.length;
      const threshold = avgCn * 2;
      for (const cn of creditNotes) {
        if (cn.amount > threshold) {
          anomalies.push({
            id: `anomaly-cn-${cn.id}`,
            type: "UNUSUAL_CREDIT_NOTE",
            severity: cn.amount > threshold * 2 ? "CRITICAL" : "HIGH",
            description: `Credit note of ₹${cn.amount} is ${(cn.amount / avgCn).toFixed(1)}x the average (₹${avgCn.toFixed(0)})`,
            amount: cn.amount,
            subscriberName: cn.Invoice.Subscriber.name,
            date: cn.createdAt.toISOString(),
            referenceNumber: cn.Invoice.invoiceNumber,
          });
        }
      }
    }

    // Frequent refunds per subscriber (>3 refunds)
    const refundBySub = new Map<string, typeof refunds>();
    for (const r of refunds) {
      const subName = r.payment.Subscriber.name;
      const list = refundBySub.get(subName) || [];
      list.push(r);
      refundBySub.set(subName, list);
    }
    for (const [subName, subRefunds] of refundBySub) {
      if (subRefunds.length > 3) {
        const totalRefundAmount = subRefunds.reduce((s, r) => s + r.amount, 0);
        anomalies.push({
          id: `anomaly-freq-${subName}`,
          type: "FREQUENT_REFUNDS",
          severity: subRefunds.length > 5 ? "CRITICAL" : subRefunds.length > 4 ? "HIGH" : "MEDIUM",
          description: `${subRefunds.length} refunds issued — ${subRefunds.filter((r) => r.status === "PENDING").length} pending, total ₹${totalRefundAmount.toFixed(0)}`,
          amount: totalRefundAmount,
          subscriberName: subName,
          date: subRefunds[subRefunds.length - 1].createdAt.toISOString(),
          referenceNumber: `${subRefunds.length} refunds`,
        });
      }
    }

    // Large refunds (>₹5000)
    for (const r of refunds) {
      if (r.amount > 5000) {
        anomalies.push({
          id: `anomaly-large-refund-${r.id}`,
          type: "LARGE_REFUND",
          severity: r.amount > 10000 ? "CRITICAL" : "HIGH",
          description: `Large refund of ₹${r.amount} via ${r.mode} — ${r.reason || "No reason"}`,
          amount: r.amount,
          subscriberName: r.payment.Subscriber.name,
          date: r.createdAt.toISOString(),
          referenceNumber: r.payment.Invoice?.invoiceNumber || r.id.slice(0, 8),
        });
      }
    }

    // Total adjustments summary
    const totalAdjustments = allItems.reduce((s, i) => s + i.amount, 0);

    return NextResponse.json(
      {
        adjustments: allItems,
        groups: adjustmentGroups,
        top10,
        monthlyTrend,
        anomalies: anomalies.sort((a, b) => {
          const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
          return (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
        }),
        summary: {
          totalAdjustments: Math.round(totalAdjustments * 100) / 100,
          totalCreditNotes: adjustmentGroups[0].totalAmount,
          totalRefunds: adjustmentGroups[1].totalAmount,
          totalDiscounts: adjustmentGroups[2].totalAmount,
          anomalyCount: anomalies.length,
          criticalAnomalies: anomalies.filter((a) => a.severity === "CRITICAL").length,
        },
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
    console.error("Financial audit trail failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch financial audit trail" },
      { status: 500, headers: corsHeaders }
    );
  }
}
