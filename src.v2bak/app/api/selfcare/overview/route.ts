import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSelfcareAccess } from "@/lib/portal-auth";
import { isRedirectError, resolveSelfcareSubscriber, radAcctSubscriberWhere, nasDisplayName } from "../common";

// ============================================================
// CRYPTSK Nexus — GET /api/selfcare/overview?subscriberId=<cuid>
// Self-Care portal landing dashboard (spec §18).
// AUTH: requireSelfcareAccess — customer logins are scoped to their
// own customer (subscriberId auto-picked from their first subscriber);
// staff preview per-subscriber via ?subscriberId= (RBAC: subscriber.list).
// 100% real data — subscriber + plan + latest subscription, real
// radacct usage (month/today), live session + NAS, latest invoice,
// open ticket count and a derived customer-facing service status.
// PRIVACY: subscriber-only fields — no credentials, no internal notes.
// ============================================================

export const dynamic = "force-dynamic";

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

    const subscriber = await resolveSelfcareSubscriber(ctx.subscriberId);
    if (!subscriber || !subscriber.customer) {
      return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [subscription, monthAgg, todayAgg, activeSession, lastInvoice, openTickets] = await Promise.all([
      db.subscription.findFirst({
        where: { subscriberId: subscriber.id },
        orderBy: { createdAt: "desc" },
        select: { id: true, subscriptionCode: true, status: true, basePrice: true, nextBillingDate: true },
      }),
      db.radAcct.aggregate({
        where: { ...radAcctSubscriberWhere(subscriber), acctstarttime: { gte: monthStart } },
        _sum: { acctinputoctets: true, acctoutputoctets: true },
        _count: true,
      }),
      db.radAcct.aggregate({
        where: { ...radAcctSubscriberWhere(subscriber), acctstarttime: { gte: todayStart } },
        _sum: { acctinputoctets: true, acctoutputoctets: true },
      }),
      db.radAcct.findFirst({
        where: { ...radAcctSubscriberWhere(subscriber), acctstoptime: null },
        orderBy: { acctstarttime: "desc" },
      }),
      db.invoice.findFirst({
        where: { customerId: subscriber.customer.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          invoiceNumber: true,
          total: true,
          balanceDue: true,
          status: true,
          dueDate: true,
          createdAt: true,
        },
      }),
      db.ticket.count({
        where: { customerId: subscriber.customer.id, status: { in: ["open", "in_progress", "pending"] } },
      }),
    ]);

    // radacct carries no FK to nas — join on nasipaddress (same as monitoring routes)
    const nas = activeSession?.nasipaddress
      ? await db.nas.findUnique({
          where: { nasname: activeSession.nasipaddress },
          select: { nasname: true, shortname: true },
        })
      : null;

    // Derived customer-facing service status (subscriber.status is the
    // SubscriberStatus enum; map it to portal language + expiry countdown)
    let serviceStatus = "operational";
    let daysLeft: number | null = null;
    if (subscriber.status === "suspended") serviceStatus = "suspended";
    else if (subscriber.status === "terminated") serviceStatus = "terminated";
    else if (subscriber.status === "pending_activation") serviceStatus = "pending";
    else if (subscriber.status === "expired") serviceStatus = "expired";
    else if (subscriber.status === "inactive") serviceStatus = "inactive";
    else if (subscriber.status === "active") {
      if (subscriber.expiresAt && subscriber.expiresAt < now) {
        serviceStatus = "expiring";
        daysLeft = 0;
      } else if (subscriber.expiresAt) {
        daysLeft = Math.ceil((subscriber.expiresAt.getTime() - now.getTime()) / (24 * 3600 * 1000));
      }
    }

    return NextResponse.json({
      subscriber: {
        id: subscriber.id,
        subscriberCode: subscriber.subscriberCode,
        radiusUsername: subscriber.radiusUsername,
        status: subscriber.status,
        activatedAt: subscriber.activatedAt,
        expiresAt: subscriber.expiresAt,
        staticIp: subscriber.staticIp,
        vlanId: subscriber.vlanId,
      },
      plan: subscriber.plan
        ? {
            id: subscriber.plan.id,
            name: subscriber.plan.name,
            basePrice: subscriber.plan.basePrice,
            billingCycle: subscriber.plan.billingCycle,
            dataLimitGb: subscriber.plan.dataLimitGb,
          }
        : null,
      customer: subscriber.customer,
      subscription: subscription ?? null,
      usage: {
        month: {
          // Codebase convention (sessions/serialize.ts, dashboard/stats):
          // acctinputoctets = bytes received FROM the subscriber (upload),
          // acctoutputoctets = bytes sent TO the subscriber (download).
          inBytes: Number(monthAgg._sum.acctinputoctets ?? 0),
          outBytes: Number(monthAgg._sum.acctoutputoctets ?? 0),
          sessions: monthAgg._count,
        },
        today: {
          inBytes: Number(todayAgg._sum.acctinputoctets ?? 0),
          outBytes: Number(todayAgg._sum.acctoutputoctets ?? 0),
        },
      },
      session: {
        online: !!activeSession,
        since: activeSession?.acctstarttime ?? null,
        nasName: nas ? nasDisplayName(nas) : null,
        framedIp: activeSession?.framedipaddress ? activeSession.framedipaddress : null,
      },
      lastInvoice: lastInvoice ?? null,
      openTickets,
      serviceStatus,
      daysLeft,
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/selfcare/overview] GET failed:", err);
    return NextResponse.json({ error: "Failed to load self-care overview" }, { status: 500 });
  }
}
