import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/network/health-history — Daily health score snapshots for last 30 days
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Fetch all data needed for 30-day historical reconstruction
    const [
      devices,
      subscribers,
      complaints,
      alerts,
    ] = await Promise.all([
      db.networkDevice.findMany({
        select: { id: true, status: true, areaId: true, createdAt: true, updatedAt: true, lastSeenAt: true },
      }),
      db.subscriber.findMany({
        select: { id: true, status: true, areaId: true, createdAt: true },
      }),
      db.complaint.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: { id: true, areaId: true, createdAt: true, resolvedAt: true, priority: true, status: true },
        orderBy: { createdAt: "asc" },
      }),
      db.networkAlert.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: { id: true, severity: true, createdAt: true, status: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const totalDevices = devices.length;
    const totalSubscribers = subscribers.length;

    // For each day in the last 30 days, compute an approximate health score
    // Since we don't have daily snapshots, we compute based on:
    //   - Device status: use lastSeenAt and updatedAt to infer historical status
    //   - Complaints: count complaints created on or before that day, and resolved
    //   - Alerts: count alerts active on that day
    const dailySnapshots: { date: string; score: number; deviceHealth: number; complaintScore: number; alertScore: number }[] = [];

    for (let d = 29; d >= 0; d--) {
      const dayStart = new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      const dateStr = dayStart.toISOString().split("T")[0];

      // Device health: devices that were online at this point in time
      // We infer: if lastSeenAt >= dayStart, device was likely online. If updatedAt < dayStart and lastSeenAt < dayStart, it was already offline.
      let onlineCount = 0;
      for (const dev of devices) {
        const lastSeen = dev.lastSeenAt ? new Date(dev.lastSeenAt).getTime() : 0;
        const created = new Date(dev.createdAt).getTime();
        // Device is considered online if lastSeenAt is on or after dayStart
        if (lastSeen >= dayStart.getTime() && created <= dayEnd.getTime()) {
          onlineCount++;
        } else if (created > dayEnd.getTime()) {
          // Device didn't exist yet, don't count in total for this day
          continue;
        } else if (lastSeen === 0 && dev.status === "ONLINE") {
          // No lastSeenAt but status is online - count as online if device existed
          onlineCount++;
        }
      }

      const devicesThatDay = devices.filter(
        (dev) => new Date(dev.createdAt).getTime() <= dayEnd.getTime()
      ).length;
      const deviceRatio = devicesThatDay > 0 ? onlineCount / devicesThatDay : 1;
      const deviceHealth = Math.round(deviceRatio * 100);

      // Complaints: active complaints on this day (created before or on this day, not yet resolved)
      const activeComplaints = complaints.filter((c) => {
        const created = new Date(c.createdAt).getTime();
        const resolved = c.resolvedAt ? new Date(c.resolvedAt).getTime() : Infinity;
        return created <= dayEnd.getTime() && resolved > dayStart.getTime();
      });

      const openComplaints = activeComplaints.filter(
        (c) => c.status !== "RESOLVED" && c.status !== "CLOSED"
      ).length;

      // Recent complaints (last 7 days relative to this day)
      const sevenDaysBefore = new Date(dayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
      const recentComplaints = activeComplaints.filter(
        (c) => new Date(c.createdAt).getTime() >= sevenDaysBefore.getTime()
      ).length;

      const complaintRate = totalSubscribers > 0
        ? (openComplaints / totalSubscribers) * 10000 / 100
        : 0;
      const complaintScore = Math.max(0, Math.round(100 - complaintRate * 5));

      // Alerts: active on this day
      const activeAlerts = alerts.filter((a) => {
        const created = new Date(a.createdAt).getTime();
        const resolved = a.status === "RESOLVED" && a.updatedAt
          ? new Date(a.updatedAt).getTime()
          : Infinity;
        return created <= dayEnd.getTime() && resolved > dayStart.getTime();
      });

      const critCount = activeAlerts.filter((a) => a.severity === "CRITICAL").length;
      const highCount = activeAlerts.filter((a) => a.severity === "HIGH").length;
      const medCount = activeAlerts.filter((a) => a.severity === "MEDIUM").length;

      const alertScoreVal = Math.max(0, Math.min(100, 100 - critCount * 40 - highCount * 20 - medCount * 5));

      // Composite score for the day
      const score = Math.round(
        deviceHealth * 0.40 +
        complaintScore * 0.35 +
        alertScoreVal * 0.25
      );

      dailySnapshots.push({
        date: dateStr,
        score: Math.min(Math.max(score, 0), 100),
        deviceHealth,
        complaintScore,
        alertScore: alertScoreVal,
      });
    }

    // Calculate trend
    const firstWeek = dailySnapshots.slice(0, 7);
    const lastWeek = dailySnapshots.slice(-7);
    const firstWeekAvg = firstWeek.reduce((s, d) => s + d.score, 0) / firstWeek.length;
    const lastWeekAvg = lastWeek.reduce((s, d) => s + d.score, 0) / lastWeek.length;
    const trend = Math.round((lastWeekAvg - firstWeekAvg) * 10) / 10;

    return NextResponse.json({
      daily: dailySnapshots,
      summary: {
        currentScore: dailySnapshots[dailySnapshots.length - 1]?.score ?? 0,
        average: Math.round(dailySnapshots.reduce((s, d) => s + d.score, 0) / dailySnapshots.length * 10) / 10,
        min: Math.min(...dailySnapshots.map((d) => d.score)),
        max: Math.max(...dailySnapshots.map((d) => d.score)),
        trend,
        trendDirection: trend > 2 ? "improving" : trend < -2 ? "declining" : "stable",
      },
      timestamp: now.toISOString(),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("Health history API error:", error);
    return NextResponse.json(
      { error: "Failed to load health history" },
      { status: 500 }
    );
  }
}
