import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { probeHttpService } from "@/lib/monitoring";

// ============================================================
// CRYPTSK Nexus — GET /api/monitoring/alerts
// SYNC-AND-RETURN: every GET recomputes the real platform
// conditions (billing, NAS fleet, RADIUS auth, tickets, inventory,
// subscriber expiry, VPP adapter reachability) and upserts them
// into monitoring_alerts keyed by a stable alertKey. Conditions
// that cleared get resolvedAt = now. The response is therefore
// always the real current alert state — no mock data.
// RBAC: monitoring.list
// ============================================================

const SEVERITY_RANK: Record<string, number> = { critical: 0, warning: 1, info: 2 };

// Next.js redirect() inside requireAuth surfaces as a thrown NEXT_REDIRECT —
// map it to a clean 401 JSON instead of a 500.
function isRedirectError(err: unknown): boolean {
  return typeof err === "object" && err !== null && String((err as any)?.digest || "").startsWith("NEXT_REDIRECT");
}

type AlertCondition = {
  alertKey: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  source: string;
  active: boolean;
};

function serializeAlert(a: AlertRow, isRecentlyResolved: boolean) {
  return {
    id: a.id.toString(),
    alertKey: a.alertKey,
    severity: a.severity,
    title: a.title,
    detail: a.detail,
    source: a.source,
    isAcknowledged: a.isAcknowledged,
    acknowledgedBy: a.acknowledgedBy,
    acknowledgedAt: a.acknowledgedAt,
    firstSeenAt: a.firstSeenAt,
    lastSeenAt: a.lastSeenAt,
    resolvedAt: a.resolvedAt,
    isRecentlyResolved,
  };
}

const alertSelect = {
  id: true, alertKey: true, severity: true, title: true, detail: true, source: true,
  isAcknowledged: true, acknowledgedBy: true, acknowledgedAt: true,
  firstSeenAt: true, lastSeenAt: true, resolvedAt: true,
} as const;

type AlertRow = {
  id: bigint;
  alertKey: string;
  severity: string;
  title: string;
  detail: string;
  source: string;
  isAcknowledged: boolean;
  acknowledgedBy: string | null;
  acknowledgedAt: Date | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  resolvedAt: Date | null;
};

export async function GET(req: NextRequest) {
  try {
    await requirePermission("monitoring", "list");

    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000);
    const hourAgo = new Date(now.getTime() - 3600 * 1000);
    const in7d = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

    // ── Recompute every real condition in parallel ──
    const [
      overdueAgg,
      nasTotal,
      nasDown,
      accepts24h,
      rejects24h,
      criticalTickets,
      outOfStock,
      lowStock,
      expiringPlans,
      vppProbe,
    ] = await Promise.all([
      db.invoice.aggregate({
        where: {
          OR: [
            { status: "overdue" },
            { dueDate: { lt: now }, balanceDue: { gt: 0 }, status: { in: ["issued", "sent", "partial"] } },
          ],
        },
        _count: true,
        _sum: { balanceDue: true },
      }),
      db.nas.count(),
      db.nas.count({ where: { isActive: false } }),
      db.radPostAuth.count({ where: { authdate: { gte: dayAgo }, reply: { contains: "Accept" } } }),
      db.radPostAuth.count({ where: { authdate: { gte: dayAgo }, reply: { contains: "Reject" } } }),
      db.ticket.count({ where: { status: { in: ["open", "in_progress", "pending"] }, priority: "critical" } }),
      db.inventoryItem.count({ where: { quantity: 0 } }),
      db.inventoryItem.count({ where: { quantity: { gt: 0, lte: db.inventoryItem.fields.minQuantity } } }),
      db.subscriber.count({ where: { expiresAt: { not: null, lte: in7d }, status: "active" } }),
      // Real inline probe of the VPP adapter (same probe the overview uses)
      probeHttpService("vppAdapter", "VPP Adapter", process.env.VPP_ADAPTER_URL || "http://127.0.0.1:3015"),
    ]);

    const authTotal = accepts24h + rejects24h;
    const authRejectPct = authTotal ? Math.round((rejects24h / authTotal) * 1000) / 10 : 0;
    const overdueCount = overdueAgg._count;
    const overdueAmount = Math.round(overdueAgg._sum.balanceDue ?? 0);

    const conditions: AlertCondition[] = [
      {
        alertKey: "overdue-invoices",
        severity: "warning",
        title: "Overdue invoices",
        detail: `${overdueCount} invoice${overdueCount === 1 ? "" : "s"} · ₹${overdueAmount.toLocaleString("en-IN")} outstanding`,
        source: "billing",
        active: overdueCount > 0,
      },
      {
        alertKey: "nas-down",
        severity: "critical",
        title: "NAS devices offline",
        detail: `${nasDown} of ${nasTotal} devices offline`,
        source: "network",
        active: nasDown > 0,
      },
      {
        alertKey: "auth-reject-rate",
        severity: "warning",
        title: "High RADIUS reject rate",
        detail: `${authRejectPct}% reject rate · ${rejects24h} of ${authTotal} attempts (24h)`,
        source: "aaa",
        active: authTotal >= 10 && authRejectPct > 20,
      },
      {
        alertKey: "critical-tickets",
        severity: "warning",
        title: "Critical support tickets",
        detail: `${criticalTickets} critical priority ticket${criticalTickets === 1 ? "" : "s"} active`,
        source: "operations",
        active: criticalTickets > 0,
      },
      {
        alertKey: "out-of-stock",
        severity: "warning",
        title: "Inventory out of stock",
        detail: `${outOfStock} SKU${outOfStock === 1 ? "" : "s"} at zero quantity`,
        source: "inventory",
        active: outOfStock > 0,
      },
      {
        alertKey: "low-stock",
        severity: "info",
        title: "Inventory low stock",
        detail: `${lowStock} SKU${lowStock === 1 ? "" : "s"} at or below minimum quantity`,
        source: "inventory",
        active: lowStock > 0,
      },
      {
        alertKey: "expiring-plans",
        severity: "info",
        title: "Subscriber plans expiring",
        detail: `${expiringPlans} plan${expiringPlans === 1 ? "" : "s"} expiring within 7 days`,
        source: "subscribers",
        active: expiringPlans > 0,
      },
      {
        alertKey: "vpp-adapter-down",
        severity: "warning",
        title: "VPP Adapter unreachable",
        detail: vppProbe.detail,
        source: "monitoring",
        active: vppProbe.status === "down",
      },
    ];

    // ── Sync: upsert active conditions, resolve cleared ones ──
    await Promise.all(
      conditions.map((c) =>
        c.active
          ? db.monitoringAlert.upsert({
              where: { alertKey: c.alertKey },
              update: { severity: c.severity, title: c.title, detail: c.detail, lastSeenAt: now, resolvedAt: null },
              create: { alertKey: c.alertKey, severity: c.severity, title: c.title, detail: c.detail, source: c.source },
            })
          : db.monitoringAlert.updateMany({
              where: { alertKey: c.alertKey, resolvedAt: null },
              data: { resolvedAt: now },
            })
      )
    );

    // ── Return current state ──
    const [activeAlerts, recentlyResolved] = await Promise.all([
      db.monitoringAlert.findMany({ where: { resolvedAt: null }, select: alertSelect }),
      db.monitoringAlert.findMany({
        where: { resolvedAt: { gte: hourAgo } },
        orderBy: { resolvedAt: "desc" },
        take: 20,
        select: alertSelect,
      }),
    ]);

    activeAlerts.sort((a, b) => {
      const rank = (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3);
      if (rank !== 0) return rank;
      return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
    });

    const counts = {
      critical: activeAlerts.filter((a) => a.severity === "critical").length,
      warning: activeAlerts.filter((a) => a.severity === "warning").length,
      info: activeAlerts.filter((a) => a.severity === "info").length,
      active: activeAlerts.length,
    };

    return NextResponse.json({
      alerts: [
        ...activeAlerts.map((a) => serializeAlert(a, false)),
        ...recentlyResolved.map((a) => serializeAlert(a, true)),
      ],
      counts,
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/monitoring/alerts] GET failed:", err);
    return NextResponse.json({ error: "Failed to sync monitoring alerts" }, { status: 500 });
  }
}
