import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/rbac";

// ============================================================
// GET /api/dashboard/stats — real platform aggregates
// Every number is computed live from the database.
// Per: docs/architecture/07_UI_UX §14-15 (widget sources explicit)
// ============================================================

const CHART_COLORS = ["#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#65a30d", "#ea580c"];

function hourStart(d: Date): Date {
  const x = new Date(d);
  x.setUTCMinutes(0, 0, 0);
  return x;
}

export async function GET(req: NextRequest) {
  try {
    await requireAuth();

    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const startOfToday = new Date(now);
    startOfToday.setUTCHours(0, 0, 0, 0);

    // ── Parallel count/aggregate queries (all real) ──
    const [
      subTotal, subActive, subSuspended, subInactive, subPending, subNew7d, subNew30d,
      custTotal, custActive, custNew7d, custKycPending,
      sessionsActive, sessionsToday, sessionsWeek,
      trafficToday, avgSession,
      authAccept24h, authReject24h,
      revenueMtd, revenueToday, outstandingAgg, overdueCount, invoicesPaid, invoicesPartial, invoicesDraft, invoicesIssued,
      paymentsPending,
      nasTotal, nasActive,
      dhcpLeases, dhcpSubnets, dnsZones, dnsRecords, firewallRules,
      auditRecent,
      planRows,
      moduleActive, moduleTotal,
      subscribersExpiring,
      tOpen, tInProgress, tPending, tCritical, tUnassigned,
      instToday, instUpcoming,
      invLowStock, invOutOfStock, invStockValue,
      instTechnicians,
    ] = await Promise.all([
      db.subscriber.count(),
      db.subscriber.count({ where: { status: "active" } }),
      db.subscriber.count({ where: { status: "suspended" } }),
      db.subscriber.count({ where: { status: "inactive" } }),
      db.subscriber.count({ where: { status: "pending_activation" } }),
      db.subscriber.count({ where: { createdAt: { gte: weekAgo } } }),
      db.subscriber.count({ where: { createdAt: { gte: monthAgo } } }),
      db.customer.count(),
      db.customer.count({ where: { status: "active" } }),
      db.customer.count({ where: { createdAt: { gte: weekAgo } } }),
      db.customer.count({ where: { kycVerified: false } }),
      db.radAcct.count({ where: { acctstoptime: null } }),
      db.radAcct.count({ where: { acctstarttime: { gte: startOfToday } } }),
      db.radAcct.count({ where: { acctstarttime: { gte: weekAgo } } }),
      db.radAcct.aggregate({
        where: { acctstarttime: { gte: startOfToday } },
        _sum: { acctinputoctets: true, acctoutputoctets: true },
      }),
      db.radAcct.aggregate({
        where: { acctstoptime: { gte: weekAgo } },
        _avg: { acctsessiontime: true },
      }),
      db.radPostAuth.count({ where: { authdate: { gte: dayAgo }, reply: { contains: "Accept" } } }),
      db.radPostAuth.count({ where: { authdate: { gte: dayAgo }, reply: { contains: "Reject" } } }),
      db.payment.aggregate({
        where: { status: "completed", receivedAt: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
      db.payment.aggregate({
        where: { status: "completed", receivedAt: { gte: startOfToday } },
        _sum: { amount: true },
      }),
      db.invoice.aggregate({
        where: { status: { in: ["issued", "sent", "partial", "overdue"] } },
        _sum: { balanceDue: true },
      }),
      db.invoice.count({ where: { status: "overdue" } }),
      db.invoice.count({ where: { status: "paid" } }),
      db.invoice.count({ where: { status: "partial" } }),
      db.invoice.count({ where: { status: "draft" } }),
      db.invoice.count({ where: { status: { in: ["issued", "sent"] } } }),
      db.payment.count({ where: { status: "pending" } }),
      db.nas.count(),
      db.nas.count({ where: { isActive: true } }),
      db.dhcpLease.count(),
      db.dhcpSubnet.count(),
      db.dnsZone.count(),
      db.dnsRecord.count(),
      db.firewallRule.count(),
      db.auditEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true, action: true, resource: true, result: true,
          createdAt: true, resourceName: true, errorMessage: true, ipAddress: true,
          user: { select: { name: true, email: true } },
        },
      }),
      db.subscription.groupBy({
        by: ["planId"],
        where: { status: "active" },
        _count: { planId: true },
        orderBy: { _count: { planId: "desc" } },
      }),
      db.module.count({ where: { status: "active" } }),
      db.module.count(),
      db.subscriber.count({ where: { expiresAt: { not: null, lte: new Date(now.getTime() + 7 * 3600 * 1000 * 24) }, status: "active" } }),
      db.ticket.count({ where: { status: "open" } }),
      db.ticket.count({ where: { status: "in_progress" } }),
      db.ticket.count({ where: { status: "pending" } }),
      db.ticket.count({ where: { priority: "critical", status: { notIn: ["resolved", "closed"] } } }),
      db.ticket.count({ where: { status: { in: ["open", "in_progress", "pending"] }, assignedTo: null } }),
      db.installation.count({ where: { scheduledAt: { gte: startOfToday, lt: new Date(startOfToday.getTime() + 86400000) }, status: { in: ["scheduled", "in_progress"] } } }),
      db.installation.count({ where: { scheduledAt: { gte: now }, status: "scheduled" } }),
      db.inventoryItem.count({ where: { quantity: { lte: db.inventoryItem.fields.minQuantity } } }),
      db.inventoryItem.count({ where: { quantity: 0 } }),
      db.$queryRaw<Array<{ v: number | null }>>`SELECT COALESCE(SUM(quantity * COALESCE("unitPrice", 0)), 0)::float8 AS v FROM inventory_items`,
      db.installation.findMany({ where: { status: { in: ["scheduled", "in_progress"] }, technicianName: { not: null } }, select: { technicianName: true }, distinct: ["technicianName"] }),
    ]);

    // ── Plan distribution (real plan names) ──
    const planRowsFiltered = planRows.filter((r) => r.planId);
    const planIds = planRowsFiltered.map((p) => p.planId as string);
    const plans = planIds.length
      ? await db.plan.findMany({ where: { id: { in: planIds } }, select: { id: true, name: true, basePrice: true } })
      : [];
    const planMap = new Map(plans.map((p) => [p.id, p]));
    const planDistribution = planRowsFiltered.map((row, i) => {
      const plan = planMap.get(row.planId as string);
      return {
        name: plan?.name ?? "Unknown plan",
        value: row._count.planId,
        color: CHART_COLORS[i % CHART_COLORS.length],
      };
    }).slice(0, 8);

    // ── Top subscribers by traffic last 7d (real radacct aggregation) ──
    let topSubscribers: Array<{ username: string; plan: string | null; trafficBytes: number; sessions: number }> = [];
    try {
      const rows = await db.$queryRaw<Array<{ username: string; traffic: bigint; sessions: bigint }>>`
        SELECT username, SUM(COALESCE(acctinputoctets,0) + COALESCE(acctoutputoctets,0)) AS traffic, COUNT(*) AS sessions
        FROM radacct
        WHERE acctstarttime >= ${weekAgo} AND username IS NOT NULL AND username <> ''
        GROUP BY username ORDER BY traffic DESC LIMIT 5`;
      topSubscribers = rows.map((r) => ({ username: r.username, plan: null, trafficBytes: Number(r.traffic), sessions: Number(r.sessions) }));
      // enrich with plan names from subscriber records
      if (topSubscribers.length) {
        const subs = await db.subscriber.findMany({
          where: { radiusUsername: { in: topSubscribers.map((t) => t.username) } },
          select: { radiusUsername: true, plan: { select: { name: true } } },
        });
        const subMap = new Map(subs.map((s) => [s.radiusUsername, s.plan?.name ?? null]));
        topSubscribers = topSubscribers.map((t) => ({ ...t, plan: subMap.get(t.username) ?? null }));
      }
    } catch {
      topSubscribers = [];
    }

    // ── Hourly throughput last 24h (real radacct buckets, UTC) ──
    let hourlyThroughput: Array<{ hour: string; down: number; up: number }> = [];
    try {
      const rows = await db.$queryRaw<Array<{ hr: Date; up: bigint; down: bigint }>>`
        SELECT date_trunc('hour', acctstarttime) AS hr,
               SUM(COALESCE(acctinputoctets,0)) AS up,
               SUM(COALESCE(acctoutputoctets,0)) AS down
        FROM radacct
        WHERE acctstarttime >= ${dayAgo}
        GROUP BY 1 ORDER BY 1`;
      const buckets = new Map(rows.map((r) => [new Date(r.hr).getUTCHours(), { up: Number(r.up), down: Number(r.down) }]));
      const startH = hourStart(now).getUTCHours();
      hourlyThroughput = Array.from({ length: 12 }, (_, i) => {
        const h = (startH - (11 - i) + 24) % 24;
        const b = buckets.get(h);
        return {
          hour: `${String(h).padStart(2, "0")}`,
          up: Math.round((((b?.up ?? 0) * 8) / 1e9) * 100) / 100,   // Gbits
          down: Math.round((((b?.down ?? 0) * 8) / 1e9) * 100) / 100,
        };
      });
    } catch {
      hourlyThroughput = [];
    }

    // ── Sessions & revenue trend last 7 days ──
    let dailyTrend: Array<{ day: string; sessions: number; revenue: number }> = [];
    try {
      const sRows = await db.$queryRaw<Array<{ d: Date; c: bigint }>>`
        SELECT date_trunc('day', acctstarttime) AS d, COUNT(*) AS c
        FROM radacct WHERE acctstarttime >= ${weekAgo}
        GROUP BY 1 ORDER BY 1`;
      const rRows = await db.$queryRaw<Array<{ d: Date; sum: bigint }>>`
        SELECT date_trunc('day', received_at) AS d, SUM(amount) AS sum
        FROM payments WHERE status = 'completed' AND received_at >= ${weekAgo}
        GROUP BY 1 ORDER BY 1`;
      const sMap = new Map(sRows.map((r) => [new Date(r.d).toISOString().slice(0, 10), Number(r.c)]));
      const rMap = new Map(rRows.map((r) => [new Date(r.d).toISOString().slice(0, 10), Number(r.sum)]));
      dailyTrend = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekAgo.getTime() + (i + 1) * 24 * 3600 * 1000).toISOString().slice(0, 10);
        return {
          day: new Date(d + "T00:00:00Z").toLocaleDateString("en", { weekday: "short", timeZone: "UTC" }),
          sessions: sMap.get(d) ?? 0,
          revenue: rMap.get(d) ?? 0,
        };
      });
    } catch {
      dailyTrend = [];
    }

    // ── Real derived alerts ──
    const alerts: Array<{ severity: "error" | "warning" | "info"; title: string; desc: string; time: string }> = [];
    if (overdueCount > 0)
      alerts.push({ severity: "error", title: `${overdueCount} overdue invoice${overdueCount > 1 ? "s" : ""}`, desc: "Collections follow-up required", time: "now" });
    if (subSuspended > 0)
      alerts.push({ severity: "warning", title: `${subSuspended} suspended subscriber${subSuspended > 1 ? "s" : ""}`, desc: "Review suspension reasons and reactivate or terminate", time: "now" });
    if (authReject24h > 0 && authAccept24h + authReject24h > 0) {
      const rejectRate = Math.round((authReject24h / (authAccept24h + authReject24h)) * 100);
      if (rejectRate >= 20)
        alerts.push({ severity: "warning", title: `RADIUS reject rate ${rejectRate}%`, desc: `${authReject24h} rejected auth attempts in the last 24h — possible credential stuffing`, time: "24h" });
    }
    if (paymentsPending > 0)
      alerts.push({ severity: "info", title: `${paymentsPending} pending payment${paymentsPending > 1 ? "s" : ""}`, desc: "Payments awaiting verification/allocation", time: "now" });
    if (nasActive < nasTotal)
      alerts.push({ severity: "warning", title: `${nasTotal - nasActive} NAS device${nasTotal - nasActive > 1 ? "s" : ""} disabled`, desc: "Access clients marked inactive in RADIUS clients table", time: "now" });
    if (subscribersExpiring > 0)
      alerts.push({ severity: "info", title: `${subscribersExpiring} plan${subscribersExpiring > 1 ? "s" : ""} expiring in 7 days`, desc: "Send renewal reminders", time: "7d window" });

    const trafficTodayBytes = Number(trafficToday._sum.acctinputoctets ?? BigInt(0)) + Number(trafficToday._sum.acctoutputoctets ?? BigInt(0));
    const authTotal24h = authAccept24h + authReject24h;

    return NextResponse.json({
      generatedAt: now.toISOString(),
      subscribers: { total: subTotal, active: subActive, suspended: subSuspended, inactive: subInactive, pending: subPending, new7d: subNew7d, new30d: subNew30d },
      customers: { total: custTotal, active: custActive, new7d: custNew7d, kycPending: custKycPending },
      sessions: { active: sessionsActive, today: sessionsToday, week: sessionsWeek, trafficTodayBytes, avgSessionSec: Math.round(avgSession._avg.acctsessiontime ?? 0) },
      auth: { accept24h: authAccept24h, reject24h: authReject24h, total24h: authTotal24h, rate24h: authTotal24h ? Math.round((authAccept24h / authTotal24h) * 1000) / 10 : null },
      billing: {
        revenueMtd: revenueMtd._sum.amount ?? 0,
        revenueToday: revenueToday._sum.amount ?? 0,
        outstanding: outstandingAgg._sum.balanceDue ?? 0,
        overdue: overdueCount,
        invoices: { draft: invoicesDraft, issued: invoicesIssued, paid: invoicesPaid, partial: invoicesPartial },
        paymentsPending,
      },
      network: { nasTotal, nasActive, dhcpLeases, dhcpSubnets, dnsZones, dnsRecords, firewallRules },
      modules: { active: moduleActive, total: moduleTotal },
      operations: {
        tickets: { open: tOpen, inProgress: tInProgress, pending: tPending, critical: tCritical, unassigned: tUnassigned },
        installations: { today: instToday, upcoming: instUpcoming, technicians: instTechnicians.length },
        inventory: { lowStock: invLowStock, outOfStock: invOutOfStock, stockValue: Math.round(Number(Array.isArray(invStockValue) ? (invStockValue[0]?.v ?? 0) : 0)) },
      },
      planDistribution,
      topSubscribers,
      hourlyThroughput,
      dailyTrend,
      recentActivity: auditRecent.map((a) => ({
        id: a.id,
        user: a.user?.name ?? a.user?.email ?? "System",
        action: a.action,
        resource: a.resource,
        description: a.errorMessage ?? a.resourceName ?? undefined,
        result: a.result,
        createdAt: a.createdAt,
      })),
      alerts,
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error("[dashboard/stats]", err);
    return NextResponse.json({ error: "Failed to compute dashboard stats" }, { status: 500 });
  }
}
