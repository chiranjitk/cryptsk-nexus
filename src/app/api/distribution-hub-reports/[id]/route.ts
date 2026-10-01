import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { logger } from "@/lib/logger";

// GET /api/distribution-hub-reports/[id] — consolidated stats across all partners
// id = distributionHubId
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAuth(request);
    const { id } = await params;

    const hub = await db.distributionHub.findUnique({
      where: { id },
      select: { id: true, name: true, code: true, status: true },
    });
    if (!hub) {
      return NextResponse.json({ error: "Distribution hub not found" }, { status: 404 });
    }

    const partners = await db.partner.findMany({
      where: { distributionHubId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        code: true,
        status: true,
      },
    });

    // Aggregate per-partner breakdown
    const perPartner = [];
    let totalSubscribers = 0;
    let totalRevenue = 0;
    let totalOutstanding = 0;

    for (const p of partners) {
      const [subCount, revAgg, outAgg] = await Promise.all([
        db.subscriber.count({ where: { partnerId: p.id } }),
        db.invoice.aggregate({
          where: { Subscriber: { partnerId: p.id }, status: { in: ["PAID", "PARTIALLY_PAID"] } },
          _sum: { grandTotal: true },
        }),
        db.invoice.aggregate({
          where: { Subscriber: { partnerId: p.id }, status: { in: ["SENT", "OVERDUE", "PARTIALLY_PAID"] } },
          _sum: { balanceAmount: true },
        }),
      ]);
      const revenue = revAgg._sum?.grandTotal || 0;
      const outstanding = outAgg._sum?.balanceAmount || 0;
      perPartner.push({
        partnerId: p.id,
        name: p.name,
        code: p.code,
        status: p.status,
        subscriberCount: subCount,
        revenue,
        outstanding,
      });
      totalSubscribers += subCount;
      totalRevenue += revenue;
      totalOutstanding += outstanding;
    }

    return NextResponse.json({
      distributionHub: hub,
      totals: {
        totalPartners: partners.length,
        totalSubscribers,
        totalRevenue,
        totalOutstanding,
      },
      perPartnerBreakdown: perPartner,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("distribution_hub_report_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to build distribution hub report" }, { status: 500 });
  }
}
