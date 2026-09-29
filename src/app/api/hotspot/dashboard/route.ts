import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/hotspot/dashboard — Aggregated hotspot dashboard stats
export async function GET(request: Request) {
  try {
    await requireAuth(request as unknown as import("next/server").NextRequest);

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Total active users — active RADIUS sessions
    const activeSessions = await db.radiusSession.count({
      where: { stopTime: null },
    });

    // Total bandwidth consumed today (from sessions that ended today or still active)
    const todaySessions = await db.radiusSession.findMany({
      where: {
        OR: [
          { startTime: { gte: startOfDay } },
          { stopTime: { gte: startOfDay } },
        ],
      },
      select: { inputOctets: true, outputOctets: true },
    });
    const bandwidthToday = todaySessions.reduce(
      (sum, s) => sum + Number(s.inputOctets || 0) + Number(s.outputOctets || 0),
      0
    );

    // Total sessions today
    const sessionsToday = await db.radiusSession.count({
      where: {
        OR: [
          { startTime: { gte: startOfDay } },
          { stopTime: { gte: startOfDay } },
        ],
      },
    });

    // Revenue this month (verified payments)
    const monthlyPayments = await db.payment.findMany({
      where: {
        createdAt: { gte: startOfMonth },
        status: "VERIFIED",
      },
      select: { amount: true },
    });
    const revenueThisMonth = monthlyPayments.reduce((s, p) => s + p.amount, 0);

    // Trend data — last 7 days of sessions & bandwidth
    const trendData: Array<{ date: string; sessions: number; bandwidth: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i + 1);

      const daySessions = await db.radiusSession.findMany({
        where: {
          OR: [
            { startTime: { gte: dayStart, lt: dayEnd } },
            { stopTime: { gte: dayStart, lt: dayEnd } },
          ],
        },
        select: { inputOctets: true, outputOctets: true },
      });

      const daySessionCount = await db.radiusSession.count({
        where: {
          startTime: { gte: dayStart, lt: dayEnd },
        },
      });

      const dayBandwidth = daySessions.reduce(
        (sum, s) => sum + Number(s.inputOctets || 0) + Number(s.outputOctets || 0),
        0
      );

      trendData.push({
        date: dayStart.toLocaleDateString("en-IN", { weekday: "short", day: "numeric" }),
        sessions: daySessionCount,
        bandwidth: Math.round(dayBandwidth / 1048576), // MB
      });
    }

    // Active hotspot plans count
    const hotspotPlanCount = await db.plan.count({
      where: { category: "HOTSPOT", status: "ACTIVE" },
    });

    // Active locations
    const activeLocations = await db.networkDevice.count({
      where: { type: "AP", status: "ONLINE" },
    });

    return NextResponse.json({
      activeUsers: activeSessions,
      bandwidthToday,
      sessionsToday,
      revenueThisMonth,
      hotspotPlanCount,
      activeLocations,
      trendData,
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Dashboard error:", error);
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 });
  }
}
