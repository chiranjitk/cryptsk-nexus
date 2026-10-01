import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/payments/analytics
// [PAYMENTS-NOLEAK] One endpoint powering the production Payments page tabs:
//   • summary        — collected today/MTD, verification queue, failed/refunded 30d
//   • leakRadar      — maker-checker bypass, missing receipts, stale pending,
//                      unmatched gateway transactions + orphan gateway payments
//   • aging          — outstanding AR buckets (current/1-30/31-60/61-90/90+) + top debtors
//   • collectors     — MTD leaderboard by collectedById (VERIFIED payments only)
//   • modes          — MTD revenue by payment mode
//   • trend          — 14-day verified collection trend
//   • reconciliation — match stats (full detail lives in /api/payments/reconcile)

function startOfDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function daysAgo(n: number) {
  const d = startOfDay();
  d.setDate(d.getDate() - n);
  return d;
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}

interface Bucket { key: string; label: string; count: number; amount: number }

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const now = new Date();
    const todayStart = startOfDay();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const d30 = daysAgo(30);

    // ── Core aggregates ──
    const [
      todayVerifiedAgg,
      monthVerifiedAgg,
      pendingAgg,
      oldestPending,
      failed30d,
      refunded30d,
      monthVerifiedRows,
      missingReceiptCount,
      stalePendingCount,
      arInvoices,
      trendPayments,
      txnTotal,
      txnMatched,
      unmatchedTxnSample,
      gatewayRefPayments,
      linkedTxnPaymentIds,
    ] = await Promise.all([
      db.payment.aggregate({
        where: { status: "VERIFIED", createdAt: { gte: todayStart } },
        _sum: { amount: true },
        _count: true,
      }),
      db.payment.aggregate({
        where: { status: "VERIFIED", createdAt: { gte: monthStart } },
        _sum: { amount: true },
        _count: true,
      }),
      db.payment.aggregate({
        where: { status: "PENDING" },
        _sum: { amount: true },
        _count: true,
      }),
      db.payment.findFirst({
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
      db.payment.count({ where: { status: "FAILED", createdAt: { gte: d30 } } }),
      db.payment.count({ where: { status: "REFUNDED", createdAt: { gte: d30 } } }),
      // MTD verified payments → collectors + modes (single fetch, bucketed in JS)
      db.payment.findMany({
        where: { status: "VERIFIED", createdAt: { gte: monthStart } },
        select: {
          amount: true,
          paymentMode: true,
          collectedById: true,
          createdAt: true,
          User_Payment_collectedByIdToUser: { select: { name: true } },
        },
      }),
      // Leak radar #2 — verified money with no receipt number (untraceable)
      db.payment.count({ where: { status: "VERIFIED", receiptNumber: "" } }),
      // Leak radar #3 — pending verification older than 24h
      db.payment.count({
        where: { status: "PENDING", createdAt: { lt: new Date(Date.now() - 24 * 3600 * 1000) } },
      }),
      // Outstanding AR for aging buckets
      db.invoice.findMany({
        where: { balanceAmount: { gt: 0.01 }, status: { notIn: ["CANCELLED", "CREDIT_NOTE"] } },
        select: {
          id: true, invoiceNumber: true, balanceAmount: true, dueDate: true, status: true,
          Subscriber: { select: { id: true, name: true, code: true } },
        },
      }),
      db.payment.findMany({
        where: { status: "VERIFIED", createdAt: { gte: daysAgo(13) } },
        select: { amount: true, createdAt: true },
      }),
      db.integrationTransaction.count({
        where: { transactionType: { in: ["payment", "order", "settlement"] } },
      }),
      db.integrationTransaction.count({
        where: { transactionType: { in: ["payment", "order", "settlement"] }, paymentId: { not: null } },
      }),
      db.integrationTransaction.findMany({
        where: { transactionType: { in: ["payment", "order", "settlement"] }, paymentId: null },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, gatewayType: true, amount: true, externalRef: true, status: true, createdAt: true },
      }),
      db.payment.findMany({
        where: { transactionRef: { contains: "|" } },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true, amount: true, transactionRef: true, receiptNumber: true, status: true, createdAt: true,
          Subscriber: { select: { name: true, code: true } },
        },
      }),
      db.integrationTransaction.findMany({
        where: { paymentId: { not: null } },
        select: { paymentId: true },
      }),
    ]);

    // ── Leak radar #1 — maker-checker bypass: verifier == collector (MTD) ──
    const autoVerifiedRows = await db.payment.findMany({
      where: { status: "VERIFIED", createdAt: { gte: monthStart }, collectedById: { not: null }, verifiedById: { not: null } },
      select: { collectedById: true, verifiedById: true },
    });
    const autoVerifiedExact = autoVerifiedRows.filter((r) => r.collectedById === r.verifiedById).length;

    // ── Aging buckets from due date ──
    const buckets: Bucket[] = [
      { key: "current", label: "Current (not due)", count: 0, amount: 0 },
      { key: "d1_30", label: "1–30 days", count: 0, amount: 0 },
      { key: "d31_60", label: "31–60 days", count: 0, amount: 0 },
      { key: "d61_90", label: "61–90 days", count: 0, amount: 0 },
      { key: "d90p", label: "90+ days", count: 0, amount: 0 },
    ];
    const debtorMap = new Map<string, {
      subscriberId: string; name: string; code: string;
      invoiceCount: number; outstanding: number; oldestDueDate: Date | null;
    }>();

    for (const inv of arInvoices) {
      const overdueDays = Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / 86400000);
      const amount = round2(inv.balanceAmount);
      let b: Bucket;
      if (overdueDays <= 0) b = buckets[0];
      else if (overdueDays <= 30) b = buckets[1];
      else if (overdueDays <= 60) b = buckets[2];
      else if (overdueDays <= 90) b = buckets[3];
      else b = buckets[4];
      b.count += 1;
      b.amount += amount;

      const sub = inv.Subscriber;
      if (sub) {
        const cur = debtorMap.get(sub.id) || {
          subscriberId: sub.id, name: sub.name, code: sub.code,
          invoiceCount: 0, outstanding: 0, oldestDueDate: null as Date | null,
        };
        cur.invoiceCount += 1;
        cur.outstanding += amount;
        const due = new Date(inv.dueDate);
        if (!cur.oldestDueDate || due < cur.oldestDueDate) cur.oldestDueDate = due;
        debtorMap.set(sub.id, cur);
      }
    }
    buckets.forEach((b) => { b.amount = round2(b.amount); });

    const topDebtors = [...debtorMap.values()]
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, 10)
      .map((d) => ({
        ...d,
        outstanding: round2(d.outstanding),
        daysOverdue: d.oldestDueDate
          ? Math.max(0, Math.floor((now.getTime() - d.oldestDueDate.getTime()) / 86400000))
          : 0,
      }));

    // ── Collectors leaderboard (MTD, verified only) ──
    type CollectorRow = { userId: string | null; name: string; total: number; count: number; lastAt: Date | null };
    const collectorMap = new Map<string, CollectorRow>();
    for (const p of monthVerifiedRows) {
      const key = p.collectedById || "unattributed";
      const cur = collectorMap.get(key) || {
        userId: p.collectedById,
        name: p.User_Payment_collectedByIdToUser?.name || "Unattributed",
        total: 0, count: 0, lastAt: null as Date | null,
      };
      cur.total += p.amount;
      cur.count += 1;
      if (!cur.lastAt || p.createdAt > cur.lastAt) cur.lastAt = p.createdAt;
      collectorMap.set(key, cur);
    }
    const collectors = [...collectorMap.values()]
      .sort((a, b) => b.total - a.total)
      .map((c) => ({ userId: c.userId, name: c.name, total: round2(c.total), count: c.count, lastAt: c.lastAt }));

    // ── Mode breakdown (MTD) ──
    const modeMap = new Map<string, { mode: string; total: number; count: number }>();
    for (const p of monthVerifiedRows) {
      const cur = modeMap.get(p.paymentMode) || { mode: p.paymentMode, total: 0, count: 0 };
      cur.total += p.amount;
      cur.count += 1;
      modeMap.set(p.paymentMode, cur);
    }
    const modes = [...modeMap.values()]
      .map((m) => ({ ...m, total: round2(m.total) }))
      .sort((a, b) => b.total - a.total);

    // ── 14-day trend ──
    const trendMap = new Map<string, number>();
    for (let i = 13; i >= 0; i--) {
      // [FIX] was `trendMap[key] = 0` — bracket notation on a Map sets an object
      // property, not an entry, so the trend was always empty.
      trendMap.set(startOfDay(new Date(Date.now() - i * 86400000)).toISOString().slice(0, 10), 0);
    }
    for (const p of trendPayments) {
      const key = startOfDay(p.createdAt).toISOString().slice(0, 10);
      if (trendMap.has(key)) trendMap.set(key, trendMap.get(key)! + p.amount);
    }
    const trend = [...trendMap.entries()].map(([date, total]) => ({ date, total: round2(total) }));

    // ── Reconciliation ──
    const unmatchedGatewayCount = txnTotal - txnMatched;
    const linkedIds = new Set(linkedTxnPaymentIds.map((t) => t.paymentId));
    const orphanGatewayPayments = gatewayRefPayments.filter((p) => !linkedIds.has(p.id)).slice(0, 5);

    const oldestPendingHours = oldestPending
      ? Math.floor((now.getTime() - oldestPending.createdAt.getTime()) / 3600000)
      : 0;

    return NextResponse.json({
      summary: {
        collectedTodayCount: todayVerifiedAgg._count,
        collectedTodayTotal: round2(todayVerifiedAgg._sum.amount || 0),
        collectedMonthTotal: round2(monthVerifiedAgg._sum.amount || 0),
        collectedMonthCount: monthVerifiedAgg._count,
        pendingVerifyCount: pendingAgg._count,
        pendingVerifyAmount: round2(pendingAgg._sum.amount || 0),
        oldestPendingHours,
        failed30d,
        refunded30d,
      },
      leakRadar: {
        autoVerifiedCount: autoVerifiedExact,
        missingReceiptCount,
        stalePendingCount,
        unmatchedGatewayCount,
        orphanGatewayPayments,
      },
      aging: {
        buckets,
        totalOutstanding: round2(buckets.reduce((s, b) => s + b.amount, 0)),
        totalCount: buckets.reduce((s, b) => s + b.count, 0),
        invoiceCount: arInvoices.length,
        topDebtors,
      },
      collectors,
      modes,
      trend,
      reconciliation: {
        gatewayTxnCount: txnTotal,
        matchedCount: txnMatched,
        unmatchedGatewayCount,
        unmatchedTxnSample,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Payments analytics GET error:", error);
    return NextResponse.json({ error: "Failed to fetch payment analytics" }, { status: 500 });
  }
}
