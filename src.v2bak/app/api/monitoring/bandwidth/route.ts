import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

// ============================================================
// CRYPTSK Nexus — GET /api/monitoring/bandwidth?hours=24|72|168
// Real RADIUS accounting traffic aggregated over a time window:
// hourly series, per-NAS and per-plan breakdowns.
// Sessions are bucketed by acctstarttime (still-open sessions are
// included with their bytes-so-far — same attribution as the
// dashboard hourly throughput chart).
// Plan join: radacct carries the Cryptsk-extended "planId" column
// stamped by the session engine; rows without it fall back to the
// BSS-authoritative link username → subscribers.radiusUsername →
// subscribers.planId (dual LEFT JOIN, COALESCE).
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

    const { searchParams } = new URL(req.url);
    let hours = Number(searchParams.get("hours"));
    if (!Number.isFinite(hours) || hours <= 0) hours = 24;
    hours = Math.min(Math.round(hours), 168);

    const windowStart = new Date(Date.now() - hours * 3600 * 1000);

    const [seriesRows, perNasRows, perPlanRows] = await Promise.all([
      db.$queryRaw<Array<{ hr: Date; inb: bigint; outb: bigint; sessions: bigint }>>`
        SELECT date_trunc('hour', acctstarttime) AS hr,
               SUM(COALESCE(acctinputoctets, 0)) AS inb,
               SUM(COALESCE(acctoutputoctets, 0)) AS outb,
               COUNT(*) AS sessions
        FROM radacct
        WHERE acctstarttime >= ${windowStart}
        GROUP BY 1 ORDER BY 1`,
      db.$queryRaw<Array<{ id: number; nasname: string; shortname: string | null; inb: bigint; outb: bigint; sessions: bigint }>>`
        SELECT n.id, n.nasname, n.shortname,
               SUM(COALESCE(r.acctinputoctets, 0)) AS inb,
               SUM(COALESCE(r.acctoutputoctets, 0)) AS outb,
               COUNT(*) AS sessions
        FROM radacct r
        JOIN nas n ON n.nasname = r.nasipaddress
        WHERE r.acctstarttime >= ${windowStart}
        GROUP BY n.id, n.nasname, n.shortname
        ORDER BY (SUM(COALESCE(r.acctinputoctets, 0)) + SUM(COALESCE(r.acctoutputoctets, 0))) DESC`,
      db.$queryRaw<Array<{ planId: string; planName: string; inb: bigint; outb: bigint }>>`
        SELECT COALESCE(p2.id, p1.id) AS "planId",
               COALESCE(p2.name, p1.name) AS "planName",
               SUM(COALESCE(r.acctinputoctets, 0)) AS inb,
               SUM(COALESCE(r.acctoutputoctets, 0)) AS outb
        FROM radacct r
        LEFT JOIN plans p1 ON p1.id = r."planId"
        LEFT JOIN subscribers s ON s."radiusUsername" = r.username
        LEFT JOIN plans p2 ON p2.id = s."planId"
        WHERE r.acctstarttime >= ${windowStart} AND COALESCE(p2.id, p1.id) IS NOT NULL
        GROUP BY 1, 2
        ORDER BY (SUM(COALESCE(r.acctinputoctets, 0)) + SUM(COALESCE(r.acctoutputoctets, 0))) DESC`,
    ]);

    const series = seriesRows.map((r) => ({
      hour: new Date(r.hr).toISOString(),
      inBytes: Number(r.inb),
      outBytes: Number(r.outb),
      sessions: Number(r.sessions),
    }));

    const perNas = perNasRows.map((r) => ({
      nasId: r.id,
      nasName: r.shortname || r.nasname,
      inBytes: Number(r.inb),
      outBytes: Number(r.outb),
      sessions: Number(r.sessions),
    }));

    const perPlan = perPlanRows.map((r) => ({
      planId: r.planId,
      planName: r.planName,
      inBytes: Number(r.inb),
      outBytes: Number(r.outb),
    }));

    // Totals = sum of the hourly series (every counted row has acctstarttime,
    // so series-sum and window totals are consistent by construction)
    const totals = series.reduce(
      (acc, b) => ({
        inBytes: acc.inBytes + b.inBytes,
        outBytes: acc.outBytes + b.outBytes,
        sessions: acc.sessions + b.sessions,
      }),
      { inBytes: 0, outBytes: 0, sessions: 0 }
    );

    return NextResponse.json({ series, perNas, perPlan, totals });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/monitoring/bandwidth] GET failed:", err);
    return NextResponse.json({ error: "Failed to compute bandwidth analytics" }, { status: 500 });
  }
}
