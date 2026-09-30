import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { logger } from "@/lib/logger";

// GET /api/partner-reports/[id] — partner-wise stats
// id = partnerId
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAuth(request);
    const { id } = await params;

    const partner = await db.partner.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        code: true,
        status: true,
        distributionHubId: true,
        createdAt: true,
      },
    });
    if (!partner) {
      return NextResponse.json({ error: "Partner not found" }, { status: 404 });
    }

    // Subscriber counts by status
    const subscriberStatusGroups = await db.subscriber.groupBy({
      by: ["status"],
      where: { partnerId: id },
      _count: true,
    });

    const subscriberStats = {
      total: 0,
      active: 0,
      suspended: 0,
      disconnected: 0,
      trial: 0,
      pendingActivation: 0,
    };
    for (const g of subscriberStatusGroups) {
      subscriberStats.total += g._count;
      const status = String(g.status).toUpperCase();
      if (status === "ACTIVE") subscriberStats.active += g._count;
      else if (status === "SUSPENDED") subscriberStats.suspended += g._count;
      else if (status === "DISCONNECTED") subscriberStats.disconnected += g._count;
      else if (status === "TRIAL") subscriberStats.trial += g._count;
      else if (status === "PENDING_ACTIVATION") subscriberStats.pendingActivation += g._count;
    }

    // Billing summary — for invoices belonging to subscribers under this partner
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [totalRevenueAgg, outstandingAgg, collectedThisMonthAgg] = await Promise.all([
      db.invoice.aggregate({
        where: { Subscriber: { partnerId: id }, status: { in: ["PAID", "PARTIALLY_PAID"] } },
        _sum: { grandTotal: true },
      }),
      db.invoice.aggregate({
        where: { Subscriber: { partnerId: id }, status: { in: ["SENT", "OVERDUE", "PARTIALLY_PAID"] } },
        _sum: { balanceAmount: true },
      }),
      db.invoice.aggregate({
        where: {
          Subscriber: { partnerId: id },
          status: "PAID",
          paidAt: { gte: startOfMonth },
        },
        _sum: { paidAmount: true },
      }),
    ]);

    const billingSummary = {
      totalRevenue: totalRevenueAgg._sum?.grandTotal || 0,
      outstanding: outstandingAgg._sum?.balanceAmount || 0,
      collectedThisMonth: collectedThisMonthAgg._sum?.paidAmount || 0,
    };

    // Session stats — active sessions via radacct where acctstoptime is null
    // We need to join radacct -> subscriber by username (serviceUsername)
    const subscribers = await db.subscriber.findMany({
      where: { partnerId: id },
      select: { serviceUsername: true },
    });
    const usernames = subscribers.map((s) => s.serviceUsername).filter(Boolean);

    let activeSessions = 0;
    if (usernames.length > 0) {
      const result = await db.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT count(*)::bigint as count FROM radacct WHERE acctstoptime IS NULL AND username = ANY($1::text[])`,
        usernames,
      );
      activeSessions = result[0] ? Number(result[0].count) : 0;
    }

    // IP pool utilization — basic counts
    const ipPools = await db.partnerIpPool.findMany({
      where: { partnerId: id },
      orderBy: { createdAt: "desc" },
    });
    const ipPoolUtilization = ipPools.map((pool) => ({
      id: pool.id,
      poolType: pool.poolType,
      startIp: pool.startIp,
      endIp: pool.endIp,
      description: pool.description,
    }));

    // Recent subscribers (last 5)
    const recentSubscribers = await db.subscriber.findMany({
      where: { partnerId: id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        code: true,
        name: true,
        phone: true,
        email: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      partner,
      subscriberStats,
      billingSummary,
      sessionStats: { activeSessions },
      ipPoolUtilization,
      recentSubscribers: recentSubscribers.map((s) => ({
        ...s,
        createdAt: s.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("partner_report_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to build partner report" }, { status: 500 });
  }
}
