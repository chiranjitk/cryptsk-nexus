import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/hotspot/revenue - Revenue stats per hotspot location
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    // Get all areas with their subscriber counts and payment totals
    const areas = await db.area.findMany({
      include: {
        _count: { select: { Subscriber: true } },
        Subscriber: {
          where: { status: "ACTIVE" },
          select: { id: true, planId: true },
        },
      },
    });

    const revenueData = areas
      .filter((a) => a._count.Subscriber > 0)
      .map((a) => {
        const activePlanIds = a.subscribers.map((s) => s.planId).filter(Boolean);
        return {
          areaId: a.id,
          areaName: a.name,
          activeSubscribers: a._count.Subscriber,
        };
      });

    // Get total revenue from invoices by area
    const areaRevenue = await db.invoice.groupBy({
      by: ["subscriberId"],
      where: { status: { in: ["PAID", "PARTIALLY_PAID"] } },
      _sum: { paidAmount: true },
    });

    // Get subscriber areas for mapping
    const subscriberAreas = await db.subscriber.findMany({
      where: { areaId: { not: null }, status: "ACTIVE" },
      select: { id: true, areaId: true, planId: true },
    });

    // Calculate per-area revenue
    const subscriberPaymentMap = new Map<string, number>();
    for (const item of areaRevenue) {
      if (item._sum.paidAmount) {
        subscriberPaymentMap.set(item.subscriberId, item._sum.paidAmount);
      }
    }

    const areaRevenueMap = new Map<string, number>();
    for (const sub of subscriberAreas) {
      const payment = subscriberPaymentMap.get(sub.id) || 0;
      if (sub.areaId) {
        areaRevenueMap.set(sub.areaId, (areaRevenueMap.get(sub.areaId) || 0) + payment);
      }
    }

    const finalData = revenueData.map((a) => ({
      ...a,
      totalRevenue: areaRevenueMap.get(a.areaId) || 0,
    }));

    return NextResponse.json({ revenue: finalData });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    return NextResponse.json({ error: "Failed to fetch revenue data" }, { status: 500 });
  }
}
