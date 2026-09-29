import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

// ============================================================
// CRYPTSK Nexus — GET /api/reports/sla
// Compliance & SLA report (Reports & Analytics module).
//   • priority-wise SLA compliance: resolved-in-SLA %, avg & P95
//     resolution hours (percentile_cont over real resolutions)
//   • monthly created-vs-resolved trend (6 months)
//   • category breakdown
//   • installation completion rate
//   • audit coverage (events last 30 days, success/failure)
// ============================================================

export const dynamic = "force-dynamic";

function isRedirectError(err: unknown): boolean {
  return typeof err === "object" && err !== null && String((err as any)?.digest || "").startsWith("NEXT_REDIRECT");
}

interface PriorityRow {
  priority: string;
  total: number;
  resolved: number;
  breached: number;
  avg_hours: number;
  p95_hours: number;
  avg_sla_hours: number;
}
interface MonthRow {
  month: string;
  created: number;
  resolved: number;
}
interface CategoryRow {
  category: string;
  total: number;
  resolved: number;
}
interface InstallRow {
  scheduled: number;
  in_progress: number;
  completed: number;
  failed: number;
  rescheduled: number;
}
interface AuditRow {
  total: number;
  success: number;
  failure: number;
}

export async function GET(_req: NextRequest) {
  try {
    await requirePermission("report", "read");

    const now = new Date();
    const trendStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const auditSince = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

    const [priorityStats, monthlyTrend, categories, installs, audit] = await Promise.all([
      db.$queryRaw<PriorityRow[]>`
        SELECT priority::text AS priority,
               COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE status IN ('resolved','closed'))::int AS resolved,
               COUNT(*) FILTER (WHERE "resolvedAt" IS NOT NULL AND "slaDueAt" IS NOT NULL AND "resolvedAt" > "slaDueAt")::int AS breached,
               COALESCE(AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) / 3600) FILTER (WHERE "resolvedAt" IS NOT NULL), 0)::float8 AS avg_hours,
               COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) / 3600) FILTER (WHERE "resolvedAt" IS NOT NULL), 0)::float8 AS p95_hours,
               COALESCE(AVG(EXTRACT(EPOCH FROM ("slaDueAt" - "createdAt")) / 3600), 0)::float8 AS avg_sla_hours
        FROM tickets
        GROUP BY 1`,
      db.$queryRaw<MonthRow[]>`
        SELECT to_char(m.m, 'YYYY-MM') AS month,
               (SELECT COUNT(*)::int FROM tickets t WHERE date_trunc('month', t."createdAt") = m.m)::int AS created,
               (SELECT COUNT(*)::int FROM tickets t WHERE date_trunc('month', t."resolvedAt") = m.m)::int AS resolved
        FROM generate_series(date_trunc('month', ${trendStart}::timestamp), date_trunc('month', now()), interval '1 month') AS m(m)
        ORDER BY 1`,
      db.$queryRaw<CategoryRow[]>`
        SELECT category::text AS category,
               COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE status IN ('resolved','closed'))::int AS resolved
        FROM tickets GROUP BY 1 ORDER BY total DESC`,
      db.$queryRaw<InstallRow[]>`
        SELECT COUNT(*) FILTER (WHERE status = 'scheduled')::int AS scheduled,
               COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
               COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
               COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
               COUNT(*) FILTER (WHERE status = 'rescheduled')::int AS rescheduled
        FROM installations`,
      db.$queryRaw<AuditRow[]>`
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE result = 'success')::int AS success,
               COUNT(*) FILTER (WHERE result <> 'success')::int AS failure
        FROM audit_events
        WHERE "createdAt" >= ${auditSince}`,
    ]);

    const priorityOrder = ["critical", "high", "medium", "low"];
    const priorities = priorityOrder
      .map((p) => {
        const row = priorityStats.find((r) => r.priority === p);
        const total = row?.total || 0;
        const resolved = row?.resolved || 0;
        const breached = row?.breached || 0;
        return {
          priority: p,
          total,
          resolved,
          breached,
          slaMetPct: resolved > 0 ? ((resolved - breached) / resolved) * 100 : null,
          avgResolutionHours: row?.avg_hours || 0,
          p95ResolutionHours: row?.p95_hours || 0,
          avgSlaWindowHours: row?.avg_sla_hours || 0,
        };
      })
      .filter((p) => p.total > 0 || p.priority === "critical" || p.priority === "high" || p.priority === "medium" || p.priority === "low");

    const totalResolved = priorities.reduce((s, p) => s + p.resolved, 0);
    const totalBreached = priorities.reduce((s, p) => s + p.breached, 0);
    const totalWeightedHours =
      priorities.reduce((s, p) => s + p.avgResolutionHours * p.resolved, 0);

    const install = installs[0] || { scheduled: 0, in_progress: 0, completed: 0, failed: 0, rescheduled: 0 };
    const installFinished = install.completed + install.failed;

    return NextResponse.json({
      sla: {
        overallCompliancePct: totalResolved > 0 ? ((totalResolved - totalBreached) / totalResolved) * 100 : null,
        overallAvgResolutionHours: totalResolved > 0 ? totalWeightedHours / totalResolved : 0,
        totalResolved,
        totalBreached,
      },
      priorities,
      monthlyTrend,
      categories,
      installations: {
        ...install,
        completionRatePct: installFinished > 0 ? (install.completed / installFinished) * 100 : null,
      },
      auditCoverage: {
        ...audit,
        successPct: audit[0]?.total > 0 ? (audit[0].success / audit[0].total) * 100 : null,
        windowDays: 30,
      },
    });
  } catch (err) {
    if (isRedirectError(err)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to build SLA report" }, { status: 500 });
  }
}
