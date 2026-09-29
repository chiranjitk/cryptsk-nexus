import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSelfcareAccess } from "@/lib/portal-auth";
import { isRedirectError, resolveSelfcareSubscriber, radAcctSubscriberWhere, nasDisplayName } from "../common";

// ============================================================
// CRYPTSK Nexus — GET /api/selfcare/usage?subscriberId=<cuid>&days=7|30|90
// Self-Care "My Usage" + "Speed History" (spec §18).
// AUTH: requireSelfcareAccess — customer logins are scoped to their
// own customer (subscriberId auto-picked from their first subscriber);
// staff preview per-subscriber via ?subscriberId= (RBAC: subscriber.list).
// Real FreeRADIUS radacct accounting only:
//   • daily traffic buckets over the window (real buckets — gaps are
//     days with genuinely no sessions, the UI renders them as gaps)
//   • last 20 sessions with average down/up Mbps per session
//   • window totals
// days: default 7, clamped 1..365.
// PRIVACY: only this subscriber's rows.
// ============================================================

export const dynamic = "force-dynamic";

const round1 = (v: number) => Math.round(v * 10) / 10;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ctx = await requireSelfcareAccess({
      subscriberId: searchParams.get("subscriberId"),
      customerId: searchParams.get("customerId"),
    });

    if (!ctx.subscriberId) {
      return ctx.mode === "staff"
        ? NextResponse.json({ error: "subscriberId is required" }, { status: 400 })
        : NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
    }

    let days = Number(searchParams.get("days"));
    if (!Number.isFinite(days) || days <= 0) days = 7;
    days = Math.min(Math.max(Math.round(days), 1), 365);

    const subscriber = await resolveSelfcareSubscriber(ctx.subscriberId);
    if (!subscriber || !subscriber.customer) {
      return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
    }

    const since = new Date(Date.now() - days * 24 * 3600 * 1000);

    const [dailyRows, sessions] = await Promise.all([
      db.$queryRaw<Array<{ day: string; inb: bigint; outb: bigint; sessions: number }>>`
        SELECT to_char(date_trunc('day', acctstarttime), 'YYYY-MM-DD') AS day,
               SUM(COALESCE(acctinputoctets, 0)) AS inb,
               SUM(COALESCE(acctoutputoctets, 0)) AS outb,
               COUNT(*)::int AS sessions
        FROM radacct
        WHERE acctstarttime >= ${since}
          AND ("subscriberId" = ${subscriber.id} OR username = ${subscriber.radiusUsername})
        GROUP BY 1
        ORDER BY 1`,
      db.radAcct.findMany({
        where: radAcctSubscriberWhere(subscriber),
        orderBy: { acctstarttime: "desc" },
        take: 20,
      }),
    ]);

    // radacct carries no FK to nas — resolve NAS display names in one lookup
    const nasIps = [...new Set(sessions.map((s) => s.nasipaddress).filter(Boolean))];
    const nases = nasIps.length
      ? await db.nas.findMany({
          where: { nasname: { in: nasIps } },
          select: { nasname: true, shortname: true },
        })
      : [];
    const nasMap = new Map(nases.map((n) => [n.nasname, nasDisplayName(n)]));

    const daily = dailyRows.map((r) => ({
      day: r.day,
      inBytes: Number(r.inb),
      outBytes: Number(r.outb),
      sessions: Number(r.sessions),
    }));

    const speedHistory = sessions.map((s) => {
      const durationSec = Number(s.acctsessiontime ?? 0);
      const inBytes = Number(s.acctinputoctets ?? 0);
      const outBytes = Number(s.acctoutputoctets ?? 0);
      // Codebase convention (sessions/serialize.ts, dashboard/stats, reports/usage):
      // acctinputoctets = bytes received FROM the subscriber (upload),
      // acctoutputoctets = bytes sent TO the subscriber (download).
      return {
        startedAt: s.acctstarttime,
        stoppedAt: s.acctstoptime, // null while the session is still active
        durationSec,
        avgDownMbps: durationSec > 0 ? round1((outBytes * 8) / durationSec / 1e6) : 0,
        avgUpMbps: durationSec > 0 ? round1((inBytes * 8) / durationSec / 1e6) : 0,
        nasName: nasMap.get(s.nasipaddress) ?? null,
      };
    });

    // Window totals = exact sum over the daily buckets (same WHERE window)
    const totals = {
      inBytes: daily.reduce((acc, d) => acc + d.inBytes, 0),
      outBytes: daily.reduce((acc, d) => acc + d.outBytes, 0),
      sessions: daily.reduce((acc, d) => acc + d.sessions, 0),
    };

    return NextResponse.json({ daily, speedHistory, totals });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/selfcare/usage] GET failed:", err);
    return NextResponse.json({ error: "Failed to load usage data" }, { status: 500 });
  }
}
