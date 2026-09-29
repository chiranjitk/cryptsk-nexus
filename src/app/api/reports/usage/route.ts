import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

// ============================================================
// CRYPTSK Nexus — GET /api/reports/usage?days=30
// Customer usage & bandwidth report (Reports & Analytics module).
// Source of truth: FreeRADIUS radacct (real accounting rows).
//   • totals: sessions, traffic, avg session, distinct users, live
//   • daily traffic trend (up/down)
//   • top-10 users by traffic (joined to subscriber + plan)
//   • per-NAS traffic breakdown
// ============================================================

export const dynamic = "force-dynamic";

function isRedirectError(err: unknown): boolean {
  return typeof err === "object" && err !== null && String((err as any)?.digest || "").startsWith("NEXT_REDIRECT");
}

interface TotalsRow {
  sessions: number;
  traffic: number;
  avg_session: number;
  users: number;
  live: number;
}
interface TrendRow {
  day: string;
  up: number;
  down: number;
  sessions: number;
}
interface TopRow {
  username: string;
  sessions: number;
  traffic: number;
  avg_session: number;
  last_seen: string | null;
  display_name: string | null;
  subscriber_code: string | null;
  plan_name: string | null;
}
interface NasRow {
  nasipaddress: string;
  sessions: number;
  traffic: number;
}

export async function GET(req: NextRequest) {
  try {
    await requirePermission("report", "read");

    const { searchParams } = new URL(req.url);
    const days = Math.min(Math.max(Number(searchParams.get("days")) || 30, 7), 90);
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);

    const [totals, trend, topUsers, nasBreakdown] = await Promise.all([
      db.$queryRaw<TotalsRow[]>`
        SELECT COUNT(*)::int AS sessions,
               COALESCE(SUM(COALESCE(acctinputoctets,0) + COALESCE(acctoutputoctets,0)), 0)::float8 AS traffic,
               COALESCE(AVG(NULLIF(acctsessiontime, 0)), 0)::float8 AS avg_session,
               COUNT(DISTINCT username)::int AS users,
               COUNT(*) FILTER (WHERE acctstoptime IS NULL)::int AS live
        FROM radacct
        WHERE acctstarttime >= ${since}`,
      db.$queryRaw<TrendRow[]>`
        SELECT to_char(date_trunc('day', acctstarttime), 'YYYY-MM-DD') AS day,
               COALESCE(SUM(COALESCE(acctinputoctets,0)), 0)::float8 AS up,
               COALESCE(SUM(COALESCE(acctoutputoctets,0)), 0)::float8 AS down,
               COUNT(*)::int AS sessions
        FROM radacct
        WHERE acctstarttime >= ${since}
        GROUP BY 1 ORDER BY 1`,
      db.$queryRaw<TopRow[]>`
        SELECT r.username,
               COUNT(*)::int AS sessions,
               COALESCE(SUM(COALESCE(r.acctinputoctets,0) + COALESCE(r.acctoutputoctets,0)), 0)::float8 AS traffic,
               COALESCE(AVG(NULLIF(r.acctsessiontime, 0)), 0)::float8 AS avg_session,
               to_char(MAX(r.acctstarttime), 'YYYY-MM-DD"T"HH24:MI:SS') AS last_seen,
               c."displayName" AS display_name,
               s."subscriberCode" AS subscriber_code,
               p.name AS plan_name
        FROM radacct r
        LEFT JOIN subscribers s ON s."radiusUsername" = r.username
        LEFT JOIN customers c ON c.id = s."customerId"
        LEFT JOIN plans p ON p.id = s."planId"
        WHERE r.acctstarttime >= ${since} AND r.username IS NOT NULL AND r.username <> ''
        GROUP BY r.username, s.id, c."displayName", s."subscriberCode", p.name
        ORDER BY traffic DESC
        LIMIT 10`,
      db.$queryRaw<NasRow[]>`
        SELECT nasipaddress,
               COUNT(*)::int AS sessions,
               COALESCE(SUM(COALESCE(acctinputoctets,0) + COALESCE(acctoutputoctets,0)), 0)::float8 AS traffic
        FROM radacct
        WHERE acctstarttime >= ${since} AND nasipaddress <> ''
        GROUP BY 1 ORDER BY traffic DESC
        LIMIT 10`,
    ]);

    const t = totals[0] || { sessions: 0, traffic: 0, avg_session: 0, users: 0, live: 0 };

    return NextResponse.json({
      window: { days, since: since.toISOString() },
      totals: {
        sessions: t.sessions,
        traffic: t.traffic,
        avgSessionSeconds: t.avg_session,
        distinctUsers: t.users,
        liveNow: t.live,
        avgTrafficPerUser: t.users > 0 ? t.traffic / t.users : 0,
      },
      trend: trend.map((r) => ({ day: r.day, up: r.up, down: r.down, sessions: r.sessions })),
      topUsers: topUsers.map((r) => ({
        username: r.username,
        sessions: r.sessions,
        traffic: r.traffic,
        avgSessionSeconds: r.avg_session,
        lastSeen: r.last_seen,
        displayName: r.display_name,
        subscriberCode: r.subscriber_code,
        planName: r.plan_name,
      })),
      nasBreakdown: nasBreakdown.map((r) => ({
        nasIp: r.nasipaddress,
        sessions: r.sessions,
        traffic: r.traffic,
      })),
    });
  } catch (err) {
    if (isRedirectError(err)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to build usage report" }, { status: 500 });
  }
}
