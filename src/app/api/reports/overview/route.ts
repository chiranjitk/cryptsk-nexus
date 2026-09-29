import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

// ============================================================
// CRYPTSK Nexus — GET /api/reports/overview
// Report Center KPI overview (Reports & Analytics module).
// Real aggregates only — no caching of business KPIs.
//   • customer base + KYC coverage
//   • subscriber base by status + 7-day expiry exposure
//   • active subscriptions + MRR (Σ basePrice of active subs)
//   • revenue MoM (collected this month vs last) + collection rate
//   • ARPU (MRR / active subscribers and collected / active subs)
//   • operational load (open tickets, overdue invoices)
// ============================================================

export const dynamic = "force-dynamic";

function isRedirectError(err: unknown): boolean {
  return typeof err === "object" && err !== null && String((err as any)?.digest || "").startsWith("NEXT_REDIRECT");
}

export async function GET(_req: NextRequest) {
  try {
    await requirePermission("report", "read");

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const in7Days = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

    const [
      customers,
      kycVerified,
      subsActive,
      subsSuspended,
      subsPending,
      subsTotal,
      subsExpiring7d,
      subscriptionsActive,
      newSubsThisMonth,
      newSubsLastMonth,
      invoicedThisMonth,
      invoicedLastMonth,
      collectedThisMonth,
      collectedLastMonth,
      outstandingNow,
      overdueNow,
      openTickets,
      activePlans,
    ] = await Promise.all([
      db.customer.count(),
      db.customer.count({ where: { kycVerified: true } }),
      db.subscriber.count({ where: { status: "active" } }),
      db.subscriber.count({ where: { status: "suspended" } }),
      db.subscriber.count({ where: { status: "pending_activation" } }),
      db.subscriber.count(),
      db.subscriber.count({
        where: { expiresAt: { not: null, lte: in7Days }, status: "active" },
      }),
      db.subscription.findMany({
        where: { status: "active" },
        select: { basePrice: true },
      }),
      db.subscriber.count({ where: { createdAt: { gte: monthStart } } }),
      db.subscriber.count({
        where: { createdAt: { gte: lastMonthStart, lt: monthStart } },
      }),
      db.invoice.aggregate({
        _sum: { total: true },
        _count: true,
        where: { issueDate: { gte: monthStart }, status: { notIn: ["draft", "void", "cancelled"] } },
      }),
      db.invoice.aggregate({
        _sum: { total: true },
        where: { issueDate: { gte: lastMonthStart, lt: monthStart }, status: { notIn: ["draft", "void", "cancelled"] } },
      }),
      db.payment.aggregate({
        _sum: { amount: true },
        _count: true,
        where: { status: "completed", receivedAt: { gte: monthStart } },
      }),
      db.payment.aggregate({
        _sum: { amount: true },
        where: { status: "completed", receivedAt: { gte: lastMonthStart, lt: monthStart } },
      }),
      db.invoice.aggregate({
        _sum: { balanceDue: true },
        where: { balanceDue: { gt: 0 }, status: { in: ["issued", "sent", "partial", "overdue"] } },
      }),
      db.invoice.count({ where: { status: "overdue" } }),
      db.ticket.count({ where: { status: { in: ["open", "in_progress", "pending"] } } }),
      db.plan.count({ where: { status: "active" } }),
    ]);

    const mrr = subscriptionsActive.reduce((s, x) => s + (x.basePrice || 0), 0);
    const activeSubsBase = Math.max(subsActive, 1);

    const collectedThis = collectedThisMonth._sum.amount || 0;
    const collectedLast = collectedLastMonth._sum.amount || 0;
    const invoicedThis = invoicedThisMonth._sum.total || 0;
    const growthPct =
      collectedLast > 0 ? ((collectedThis - collectedLast) / collectedLast) * 100 : collectedThis > 0 ? 100 : 0;

    return NextResponse.json({
      customers: {
        total: customers,
        kycVerified,
        kycCoveragePct: customers > 0 ? (kycVerified / customers) * 100 : 0,
      },
      subscribers: {
        total: subsTotal,
        active: subsActive,
        suspended: subsSuspended,
        pending: subsPending,
        expiring7d: subsExpiring7d,
        newThisMonth: newSubsThisMonth,
        newLastMonth: newSubsLastMonth,
        growthPct:
          newSubsLastMonth > 0
            ? ((newSubsThisMonth - newSubsLastMonth) / newSubsLastMonth) * 100
            : newSubsThisMonth > 0
              ? 100
              : 0,
      },
      revenue: {
        mrr,
        invoicedThisMonth: invoicedThis,
        invoicedThisMonthCount: invoicedThisMonth._count,
        invoicedLastMonth: invoicedLastMonth._sum.total || 0,
        collectedThisMonth: collectedThis,
        collectedThisMonthCount: collectedThisMonth._count,
        collectedLastMonth: collectedLast,
        collectionRatePct: invoicedThis > 0 ? Math.min((collectedThis / invoicedThis) * 100, 100) : 0,
        growthPct,
        arpuMrr: mrr / activeSubsBase,
        arpuCollected: collectedThis / activeSubsBase,
      },
      exposure: {
        outstanding: outstandingNow._sum.balanceDue || 0,
        overdueCount: overdueNow,
      },
      ops: { openTickets },
      catalog: { activePlans },
    });
  } catch (err) {
    if (isRedirectError(err)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to build report overview" }, { status: 500 });
  }
}
