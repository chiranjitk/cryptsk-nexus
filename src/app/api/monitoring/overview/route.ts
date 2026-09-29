import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { probePlatformServices, recordServiceProbes, type ServiceProbeResult } from "@/lib/monitoring";

// ============================================================
// CRYPTSK Nexus — GET /api/monitoring/overview
// One-shot live platform health: real service probes (session
// engine, VPP adapter, DNS, PostgreSQL), NAS fleet, RADIUS
// sessions + auth, today's traffic, syslog volume and active
// alert counts. Every number is computed live — no mock data.
// RBAC: monitoring.list
// ============================================================

// Next.js redirect() inside requireAuth surfaces as a thrown NEXT_REDIRECT —
// map it to a clean 401 JSON instead of a 500.
function isRedirectError(err: unknown): boolean {
  return typeof err === "object" && err !== null && String((err as any)?.digest || "").startsWith("NEXT_REDIRECT");
}

export async function GET(req: NextRequest) {
  try {
    await requirePermission("monitoring", "list");

    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000);
    const hourAgo = new Date(now.getTime() - 3600 * 1000);
    const startOfToday = new Date(now);
    startOfToday.setUTCHours(0, 0, 0, 0);

    // ── PostgreSQL probe: latency around a real SELECT 1 (+ real version) ──
    const dbStarted = Date.now();
    const versionRows = await db.$queryRaw<Array<{ v: string }>>`SELECT version() AS v`;
    const dbLatencyMs = Date.now() - dbStarted;
    const pgVersion = versionRows[0]?.v?.split(",").slice(0, 1).join("").split(" on ").slice(0, 1).join("") || "PostgreSQL";
    const dbProbe: ServiceProbeResult = {
      key: "postgresql",
      label: "PostgreSQL 18",
      status: "up",
      latencyMs: dbLatencyMs,
      detail: `${pgVersion} · SELECT 1 in ${dbLatencyMs}ms`,
    };

    // ── Everything else in one parallel batch (probes + counts + aggregates) ──
    const [
      serviceProbes,
      nasTotal,
      nasUp,
      sessionsActive,
      sessionsToday,
      accepts24h,
      rejects24h,
      trafficToday,
      syslogLast24h,
      syslogErrOrWorse1h,
      syslogLast,
      alertGroups,
    ] = await Promise.all([
      probePlatformServices(),
      db.nas.count(),
      db.nas.count({ where: { isActive: true } }),
      db.radAcct.count({ where: { acctstoptime: null } }),
      db.radAcct.count({ where: { acctstarttime: { gte: startOfToday } } }),
      db.radPostAuth.count({ where: { authdate: { gte: dayAgo }, reply: { contains: "Accept" } } }),
      db.radPostAuth.count({ where: { authdate: { gte: dayAgo }, reply: { contains: "Reject" } } }),
      db.radAcct.aggregate({
        where: { acctstarttime: { gte: startOfToday } },
        _sum: { acctinputoctets: true, acctoutputoctets: true },
      }),
      db.syslogEntry.count({ where: { receivedAt: { gte: dayAgo } } }),
      db.syslogEntry.count({ where: { receivedAt: { gte: hourAgo }, severity: { lte: 3 } } }),
      db.syslogEntry.findFirst({ orderBy: { receivedAt: "desc" }, select: { receivedAt: true } }),
      db.monitoringAlert.groupBy({ by: ["severity"], where: { resolvedAt: null }, _count: true }),
    ]);

    // Persist probe results (60s dedup per service) + prune > 24h
    await recordServiceProbes([...serviceProbes, dbProbe]);

    const services: ServiceProbeResult[] = [dbProbe, ...serviceProbes];

    const alertCounts = { critical: 0, warning: 0, info: 0 };
    for (const g of alertGroups) {
      if (g.severity === "critical") alertCounts.critical = g._count;
      else if (g.severity === "warning") alertCounts.warning = g._count;
      else if (g.severity === "info") alertCounts.info = g._count;
    }

    const authTotal = accepts24h + rejects24h;

    return NextResponse.json({
      dbLatencyMs,
      services,
      nas: { total: nasTotal, up: nasUp, down: nasTotal - nasUp },
      sessions: { active: sessionsActive, today: sessionsToday },
      auth: {
        accepts24h,
        rejects24h,
        rejectRatePct: authTotal ? Math.round((rejects24h / authTotal) * 1000) / 10 : 0,
      },
      traffic: {
        inBytes: Number(trafficToday._sum.acctinputoctets ?? 0),
        outBytes: Number(trafficToday._sum.acctoutputoctets ?? 0),
      },
      syslog: { last24h: syslogLast24h, errOrWorse1h: syslogErrOrWorse1h, lastAt: syslogLast?.receivedAt ?? null },
      alerts: { ...alertCounts, active: alertCounts.critical + alertCounts.warning + alertCounts.info },
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/monitoring/overview] GET failed:", err);
    return NextResponse.json({ error: "Failed to compute monitoring overview" }, { status: 500 });
  }
}
