import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

// ============================================================
// CRYPTSK Nexus — GET /api/reports/revenue?months=6
// Revenue & Collection report (Reports & Analytics module).
//   • monthly series: invoiced / collected / outstanding / count
//   • invoice aging buckets (current → 90+)
//   • payment method mix (completed payments)
//   • top outstanding customers
// All series computed with SQL date_trunc over real tables.
// ============================================================

export const dynamic = "force-dynamic";

function isRedirectError(err: unknown): boolean {
  return typeof err === "object" && err !== null && String((err as any)?.digest || "").startsWith("NEXT_REDIRECT");
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface MonthRow {
  month: string;
  invoiced: number;
  invoices: number;
}
interface PayRow {
  month: string;
  collected: number;
  payments: number;
}
interface AgingRow {
  bucket: string;
  amount: number;
  invoices: number;
}
interface MethodRow {
  method: string;
  amount: number;
  payments: number;
}
interface OutstandingRow {
  customer_id: string;
  display_name: string;
  customer_code: string;
  amount: number;
  invoices: number;
}

export async function GET(req: NextRequest) {
  try {
    await requirePermission("report", "read");

    const { searchParams } = new URL(req.url);
    const months = Math.min(Math.max(Number(searchParams.get("months")) || 6, 3), 24);
    const now = new Date();
    const seriesStart = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [invoicedSeries, collectedSeries, aging, methods, topOutstanding] = await Promise.all([
      // Monthly invoiced (real invoices, excluding draft/void/cancelled)
      db.$queryRaw<MonthRow[]>`
        SELECT to_char(date_trunc('month', "issueDate"), 'YYYY-MM') AS month,
               COALESCE(SUM(total), 0)::float8 AS invoiced,
               COUNT(*)::int AS invoices
        FROM invoices
        WHERE "issueDate" >= ${seriesStart}
          AND status NOT IN ('draft', 'void', 'cancelled')
        GROUP BY 1 ORDER BY 1`,
      // Monthly collected (completed payments)
      db.$queryRaw<PayRow[]>`
        SELECT to_char(date_trunc('month', "receivedAt"), 'YYYY-MM') AS month,
               COALESCE(SUM(amount), 0)::float8 AS collected,
               COUNT(*)::int AS payments
        FROM payments
        WHERE "receivedAt" >= ${seriesStart}
          AND status = 'completed'
        GROUP BY 1 ORDER BY 1`,
      // Invoice aging over unpaid balances
      db.$queryRaw<AgingRow[]>`
        SELECT CASE
                 WHEN "dueDate" >= ${todayStart} THEN 'current'
                 WHEN "dueDate" >= ${todayStart} - INTERVAL '30 days' THEN '1-30'
                 WHEN "dueDate" >= ${todayStart} - INTERVAL '60 days' THEN '31-60'
                 WHEN "dueDate" >= ${todayStart} - INTERVAL '90 days' THEN '61-90'
                 ELSE '90+'
               END AS bucket,
               COALESCE(SUM("balanceDue"), 0)::float8 AS amount,
               COUNT(*)::int AS invoices
        FROM invoices
        WHERE "balanceDue" > 0
          AND status IN ('issued', 'sent', 'partial', 'overdue')
        GROUP BY 1`,
      // Payment method mix
      db.$queryRaw<MethodRow[]>`
        SELECT method::text AS method,
               COALESCE(SUM(amount), 0)::float8 AS amount,
               COUNT(*)::int AS payments
        FROM payments
        WHERE status = 'completed'
        GROUP BY 1 ORDER BY amount DESC`,
      // Top outstanding customers
      db.$queryRaw<OutstandingRow[]>`
        SELECT c.id AS customer_id, c."displayName" AS display_name, c."customerCode" AS customer_code,
               COALESCE(SUM(i."balanceDue"), 0)::float8 AS amount,
               COUNT(i.id)::int AS invoices
        FROM invoices i
        JOIN customers c ON c.id = i."customerId"
        WHERE i."balanceDue" > 0
          AND i.status IN ('issued', 'sent', 'partial', 'overdue')
        GROUP BY c.id, c."displayName", c."customerCode"
        ORDER BY amount DESC
        LIMIT 8`,
    ]);

    // Merge into a continuous month axis (no gaps)
    const series: Array<{ month: string; label: string; invoiced: number; collected: number; outstanding: number; invoices: number; payments: number; collectionPct: number }> = [];
    const invMap = new Map(invoicedSeries.map((r) => [r.month, r]));
    const payMap = new Map(collectedSeries.map((r) => [r.month, r]));
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const inv = invMap.get(key);
      const pay = payMap.get(key);
      const invoiced = inv?.invoiced || 0;
      const collected = pay?.collected || 0;
      series.push({
        month: key,
        label: `${MONTH_LABELS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
        invoiced,
        collected,
        outstanding: Math.max(invoiced - collected, 0),
        invoices: inv?.invoices || 0,
        payments: pay?.payments || 0,
        collectionPct: invoiced > 0 ? Math.min((collected / invoiced) * 100, 100) : 0,
      });
    }

    // Ensure all 5 buckets exist
    const bucketOrder = ["current", "1-30", "31-60", "61-90", "90+"];
    const agingBuckets = bucketOrder.map((b) => {
      const row = aging.find((r) => r.bucket === b);
      return { bucket: b, amount: row?.amount || 0, invoices: row?.invoices || 0 };
    });
    const totalOverdueAmount = agingBuckets.slice(1).reduce((s, b) => s + b.amount, 0);

    const last = series[series.length - 1];
    const prev = series.length > 1 ? series[series.length - 2] : null;
    const growthPct = prev && prev.collected > 0 ? ((last.collected - prev.collected) / prev.collected) * 100 : last.collected > 0 ? 100 : 0;

    return NextResponse.json({
      series,
      summary: {
        invoicedThisMonth: last.invoiced,
        collectedThisMonth: last.collected,
        collectedLastMonth: prev?.collected || 0,
        collectionRatePct: last.collectionPct,
        growthPct,
        totalOverdueAmount,
        overdueInvoices: agingBuckets.slice(1).reduce((s, b) => s + b.invoices, 0),
      },
      aging: agingBuckets,
      methods: methods.map((m) => ({ method: m.method, amount: m.amount, payments: m.payments })),
      topOutstanding: topOutstanding.map((r) => ({
        customerId: r.customer_id,
        displayName: r.display_name,
        customerCode: r.customer_code,
        amount: r.amount,
        invoices: r.invoices,
      })),
    });
  } catch (err) {
    if (isRedirectError(err)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to build revenue report" }, { status: 500 });
  }
}
