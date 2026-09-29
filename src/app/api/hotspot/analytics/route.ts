import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/hotspot/analytics - Hotspot analytics: plan distribution, revenue, location usage
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    // 1. Plan distribution (subscribers per hotspot plan)
    const hotspotPlans = await db.plan.findMany({
      where: { category: "HOTSPOT", status: "ACTIVE" },
      include: { _count: { select: { Subscriber: true } } },
      orderBy: { Subscriber: { _count: "desc" } },
    });

    const planDistribution = hotspotPlans.map((p) => ({
      name: p.name,
      count: p._count.Subscriber,
      revenue: p.priceMonthly * p._count.Subscriber,
    }));

    // 2. Location usage (from NetworkDevice where type=AP or similar)
    const devices = await db.networkDevice.findMany({
      where: { type: "AP", status: { in: ["ONLINE", "WARNING"] } },
      select: { id: true, name: true, location: true, ipAddress: true, bandwidthLogs: { take: 1, orderBy: { timestamp: "desc" }, select: { totalBps: true } } },
    });

    // Real active session counts per NAS IP from RADIUS
    const activeSessionsByNas = await db.radiusSession.groupBy({
      by: ["nasIp"],
      where: { stopTime: null },
      _count: true,
    });
    const sessionCountMap = new Map(
      activeSessionsByNas.map((s) => [s.nasIp, s._count])
    );

    const locationUsage = devices.map((d) => ({
      name: d.name || d.location || "Unknown",
      activeUsers: sessionCountMap.get(d.ipAddress) || 0,
      bandwidthUsed: d.bandwidthLogs[0] ? `${(d.bandwidthLogs[0].totalBps / 1_000_000).toFixed(1)} Mbps` : "—",
    }));

    // 3. Revenue by location (distribute plan revenue across locations)
    const totalRevenue = hotspotPlans.reduce((s, p) => s + p.priceMonthly * p._count.Subscriber, 0);
    const totalSubscribers = hotspotPlans.reduce((s, p) => s + p._count.Subscriber, 0);
    const avgRevenuePerUser = totalSubscribers > 0 ? Math.round(totalRevenue / totalSubscribers) : 0;

    const revenueByLocation = locationUsage.map((loc) => ({
      name: loc.name,
      revenue: Math.round(totalRevenue * (loc.activeUsers / Math.max(1, locationUsage.reduce((s, l) => s + l.activeUsers, 0)))),
    }));

    // 4. Popular plan
    const popularPlan = hotspotPlans.length > 0
      ? hotspotPlans.reduce((a, b) => a._count.Subscriber >= b._count.Subscriber ? a : b).name
      : "";

    // 5. Peak concurrent
    const peakConcurrent = locationUsage.reduce((s, l) => s + l.activeUsers, 0);

    return NextResponse.json({
      planDistribution,
      locationUsage,
      revenueByLocation,
      summary: {
        totalRevenue,
        avgRevenuePerUser,
        peakConcurrent,
        popularPlan,
      },
      dataAvailable: true, // RADIUS sessions are real-time
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
