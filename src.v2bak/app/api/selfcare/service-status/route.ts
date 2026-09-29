import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSelfcareAccess } from "@/lib/portal-auth";
import { isRedirectError, radAcctSubscriberWhere } from "../common";

// ============================================================
// CRYPTSK Nexus — GET /api/selfcare/service-status?subscriberId=<cuid>
// Self-Care "Service Status" tab (spec §18): live RADIUS session,
// recent session history and the service lifecycle trail.
// AUTH: requireSelfcareAccess — customer logins are scoped to their
// own customer (subscriberId auto-picked from their first subscriber);
// staff preview per-subscriber via ?subscriberId= (RBAC: subscriber.list).
// 100% real data — subscriber + plan from the DB, sessions from radacct
// (dual attribution: Cryptsk subscriberId column OR RADIUS username,
// same as sessions/reports routes), lifecycle from service_lifecycle.
// PRIVACY: subscriber-only fields — no RADIUS credentials, no internal
// staff columns (changedBy on lifecycle stays server-side).
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

// FreeRADIUS string columns default to "" — render as null client-side
function orNull(v: string | null | undefined): string | null {
  return v && v.trim() !== "" ? v : null;
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
        subscriberCode: true,
        fullName: true,
        status: true,
        radiusUsername: true,
        staticIp: true,
        vlanId: true,
        activatedAt: true,
        expiresAt: true,
        plan: { select: { id: true, name: true, billingCycle: true, dataLimitGb: true, status: true } },
      },
    });
    if (!subscriber) {
      return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
    }

    const now = new Date();
    const [activeSession, recentSessions, lifecycle] = await Promise.all([
      // Live session — newest row still open (acctstoptime null)
      db.radAcct.findFirst({
        where: { ...radAcctSubscriberWhere(subscriber), acctstoptime: null },
        orderBy: { acctstarttime: "desc" },
      }),
      // History — stopped sessions only, newest first
      db.radAcct.findMany({
        where: { ...radAcctSubscriberWhere(subscriber), acctstoptime: { not: null } },
        orderBy: { acctstarttime: "desc" },
        take: 5,
      }),
      // Lifecycle trail of the subscriber's subscriptions
      db.serviceLifecycle.findMany({
        where: { subscription: { subscriberId: subscriber.id } },
        orderBy: { changedAt: "desc" },
        take: 8,
        select: { id: true, state: true, previousState: true, reason: true, changedAt: true },
      }),
    ]);

    // Active session duration: still running → seconds since start;
    // stopped → acctsessiontime (defensive: this branch is open-only)
    const activeDurationSeconds = activeSession
      ? activeSession.acctstoptime
        ? toNum(activeSession.acctsessiontime)
        : activeSession.acctstarttime
          ? Math.max(0, Math.floor((now.getTime() - activeSession.acctstarttime.getTime()) / 1000))
          : 0
      : 0;

    return NextResponse.json({
      subscriber: {
        id: subscriber.id,
        subscriberCode: subscriber.subscriberCode,
        fullName: subscriber.fullName,
        status: subscriber.status,
        radiusUsername: subscriber.radiusUsername,
        staticIp: subscriber.staticIp,
        vlanId: subscriber.vlanId,
        activatedAt: subscriber.activatedAt,
        expiresAt: subscriber.expiresAt,
        plan: subscriber.plan
          ? {
              id: subscriber.plan.id,
              name: subscriber.plan.name,
              billingCycle: subscriber.plan.billingCycle,
              dataLimitGb: subscriber.plan.dataLimitGb,
              status: subscriber.plan.status,
            }
          : null,
      },
      online: !!activeSession,
      activeSession: activeSession
        ? {
            startedAt: activeSession.acctstarttime,
            durationSeconds: activeDurationSeconds,
            ipAddress: orNull(activeSession.framedipaddress),
            nas: orNull(activeSession.nasipaddress),
            calledStationId: orNull(activeSession.calledstationid),
            inputOctets: toNum(activeSession.acctinputoctets),
            outputOctets: toNum(activeSession.acctoutputoctets),
          }
        : null,
      recentSessions: recentSessions.map((s) => ({
        startedAt: s.acctstarttime,
        stoppedAt: s.acctstoptime,
        durationSeconds: toNum(s.acctsessiontime),
        ipAddress: orNull(s.framedipaddress),
        inputOctets: toNum(s.acctinputoctets),
        outputOctets: toNum(s.acctoutputoctets),
        terminateCause: orNull(s.acctterminatecause),
      })),
      lifecycle,
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/selfcare/service-status] GET failed:", err);
    return NextResponse.json({ error: "Failed to load service status" }, { status: 500 });
  }
}
