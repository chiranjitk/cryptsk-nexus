import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSelfcareAccess } from "@/lib/portal-auth";
import { isRedirectError, radAcctSubscriberWhere } from "../common";

// ============================================================
// CRYPTSK Nexus — GET /api/selfcare/speed-history?subscriberId=<cuid>
// Self-Care "Speed History" — REAL average throughput derived from
// RadAcct accounting (there is NO speed-test table anywhere in the
// stack; completed RADIUS sessions ARE the honest data source):
//   per session  avgKbps = (bytesUp + bytesDown) * 8 / durationSec / 1000
//   per day      avgKbps = Σ(bytesUp + bytesDown) * 8 / ΣdurationSec / 1000
// Window: last 30 days, COMPLETED sessions only (acctstoptime not
// null AND acctstarttime >= now-30d). inputOctets = UP,
// outputOctets = DOWN (sessions/serialize.ts convention).
// AUTH: requireSelfcareAccess — customer logins are scoped to their
// own customer (subscriberId auto-picked from their first subscriber);
// staff preview per-subscriber via ?subscriberId= (a staff call
// without subscriberId → 400 "subscriberId is required").
// HONESTY: days contains ONLY days with ≥1 completed session; empty
// days/sessions arrays = genuinely no data — zero-days are NEVER
// fabricated. Sessions with durationSeconds <= 0 are still listed
// (they happened) but skipped from averages — a zero-duration session
// has no meaningful rate.
// READ-ONLY — no writes anywhere in this route.
// BigInt safety: acctsessiontime / acctinputoctets / acctoutputoctets
// are BigInt — converted with Number() + NaN guard.
// ============================================================

export const dynamic = "force-dynamic";

// BigInt → Number without NaN/Infinity leaking into JSON
function toNum(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// avgKbps rounded to 1 decimal
function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

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

    const subscriber = await db.subscriber.findUnique({
      where: { id: ctx.subscriberId },
      select: {
        id: true,
        radiusUsername: true,
        plan: { select: { name: true } },
      },
    });
    if (!subscriber) {
      return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
    }

    // Completed sessions in the last 30 days — the window is small, so
    // fetch and aggregate in JS; select only the accounting columns used.
    const windowStart = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const sessions = await db.radAcct.findMany({
      where: {
        ...radAcctSubscriberWhere(subscriber),
        acctstoptime: { not: null },
        acctstarttime: { gte: windowStart },
      },
      orderBy: { acctstarttime: "desc" },
      select: {
        acctstarttime: true,
        acctstoptime: true,
        acctsessiontime: true,
        acctinputoctets: true,
        acctoutputoctets: true,
      },
    });

    // ---- Session rows (last 10 completed sessions, newest first) ----
    const sessionRows = sessions.slice(0, 10).map((s) => {
      const durationSeconds = toNum(s.acctsessiontime);
      const bytesUp = toNum(s.acctinputoctets);
      const bytesDown = toNum(s.acctoutputoctets);
      const avgKbps =
        durationSeconds > 0 ? ((bytesUp + bytesDown) * 8) / durationSeconds / 1000 : 0;
      return {
        startedAt: s.acctstarttime,
        stoppedAt: s.acctstoptime,
        durationSeconds,
        bytesUp,
        bytesDown,
        avgKbps: round1(avgKbps),
      };
    });

    // ---- Day aggregation (UTC calendar day of acctstarttime) ----
    const byDay = new Map<
      string,
      { sessions: number; bytesUp: number; bytesDown: number; totalDuration: number }
    >();
    for (const s of sessions) {
      if (!s.acctstarttime) continue; // where-clause guarantees this; defensive only
      const durationSeconds = toNum(s.acctsessiontime);
      if (durationSeconds <= 0) continue; // skip zero-duration sessions from averages
      const bytesUp = toNum(s.acctinputoctets);
      const bytesDown = toNum(s.acctoutputoctets);
      const date = s.acctstarttime.toISOString().slice(0, 10);
      const day = byDay.get(date) ?? { sessions: 0, bytesUp: 0, bytesDown: 0, totalDuration: 0 };
      day.sessions += 1;
      day.bytesUp += bytesUp;
      day.bytesDown += bytesDown;
      day.totalDuration += durationSeconds;
      byDay.set(date, day);
    }

    const days = Array.from(byDay.entries())
      .map(([date, d]) => ({
        date,
        sessions: d.sessions,
        bytesUp: d.bytesUp,
        bytesDown: d.bytesDown,
        avgKbps: round1(((d.bytesUp + d.bytesDown) * 8) / d.totalDuration / 1000),
      }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)); // ascending

    return NextResponse.json({
      plan: subscriber.plan ? { name: subscriber.plan.name } : null,
      days,
      sessions: sessionRows,
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/selfcare/speed-history] GET failed:", err);
    return NextResponse.json({ error: "Failed to load speed history" }, { status: 500 });
  }
}
