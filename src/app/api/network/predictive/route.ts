import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/network/predictive — Predictive network insights
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const eightWeeksAgo = new Date(now.getTime() - 8 * 7 * 24 * 60 * 60 * 1000);

    const predictions: {
      type: string;
      severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
      confidence: number;
      message: string;
      action: string;
      metadata?: Record<string, unknown>;
    }[] = [];

    // ── 1. Bandwidth Growth Trend (last 8 weeks) ──
    const bandwidthLogs = await db.bandwidthLog.findMany({
      where: { timestamp: { gte: eightWeeksAgo } },
      select: { downloadBps: true, uploadBps: true, timestamp: true, deviceId: true },
      orderBy: { timestamp: "asc" },
    });

    if (bandwidthLogs.length > 0) {
      // Group by week
      const weeklyData: Record<string, { totalDown: number; totalUp: number; count: number }> = {};
      for (const log of bandwidthLogs) {
        const weekStart = new Date(log.timestamp);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        const key = weekStart.toISOString().split("T")[0];
        if (!weeklyData[key]) weeklyData[key] = { totalDown: 0, totalUp: 0, count: 0 };
        weeklyData[key].totalDown += log.downloadBps;
        weeklyData[key].totalUp += log.uploadBps;
        weeklyData[key].count += 1;
      }

      const weeks = Object.entries(weeklyData)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([week, data]) => ({
          week,
          avgDown: data.count > 0 ? Math.round(data.totalDown / data.count) : 0,
          avgUp: data.count > 0 ? Math.round(data.totalUp / data.count) : 0,
        }));

      if (weeks.length >= 2) {
        const firstHalf = weeks.slice(0, Math.floor(weeks.length / 2));
        const secondHalf = weeks.slice(Math.floor(weeks.length / 2));
        const avgFirstHalfDown = firstHalf.reduce((s, w) => s + w.avgDown, 0) / firstHalf.length;
        const avgSecondHalfDown = secondHalf.reduce((s, w) => s + w.avgDown, 0) / secondHalf.length;

        if (avgFirstHalfDown > 0) {
          const growthRate = ((avgSecondHalfDown - avgFirstHalfDown) / avgFirstHalfDown) * 100;

          if (growthRate > 10) {
            const currentAvg = weeks[weeks.length - 1].avgDown;
            const capacityThreshold = currentAvg * 1.8; // 80% capacity threshold
            const weeklyGrowth = currentAvg * (growthRate / 100);
            const weeksTo80 = weeklyGrowth > 0 ? Math.round((capacityThreshold - currentAvg) / weeklyGrowth) : 999;

            predictions.push({
              type: "BANDWIDTH_GROWTH",
              severity: growthRate > 30 ? "HIGH" : "MEDIUM",
              confidence: Math.min(90, 55 + weeks.length * 3),
              message: `Bandwidth growing at ${growthRate.toFixed(1)}%/week — 80% capacity in ~${weeksTo80} weeks`,
              action: weeksTo80 <= 4
                ? "Upgrade uplink capacity immediately"
                : "Plan bandwidth upgrade within the next quarter",
              metadata: {
                growthRate: Math.round(growthRate * 10) / 10,
                currentAvgMbps: Math.round(currentAvg / 1000000 * 10) / 10,
                weeksToCapacity: weeksTo80,
                weeklyTrend: weeks,
              },
            });
          } else {
            predictions.push({
              type: "BANDWIDTH_STABLE",
              severity: "LOW",
              confidence: 70,
              message: `Bandwidth usage stable (${growthRate.toFixed(1)}%/week growth)`,
              action: "Monitor bandwidth trends monthly",
              metadata: {
                growthRate: Math.round(growthRate * 10) / 10,
                weeklyTrend: weeks,
              },
            });
          }
        }
      }
    }

    // ── 2. Device Failure Prediction ──
    const offlineDevices = await db.networkDevice.findMany({
      where: { status: "OFFLINE" },
      select: { id: true, name: true, type: true, lastSeenAt: true, areaId: true, ipAddress: true },
      orderBy: { lastSeenAt: "desc" },
    });

    const warningDevices = await db.networkDevice.findMany({
      where: { status: "WARNING" },
      select: { id: true, name: true, type: true, lastSeenAt: true, cpuUsage: true, memoryUsage: true, temperature: true, areaId: true, ipAddress: true },
    });

    // Devices with high resource usage at risk
    const atRiskDevices = warningDevices.filter(
      (d) => (d.cpuUsage > 80 && d.memoryUsage > 80) || (d.temperature !== null && d.temperature > 70)
    );

    if (atRiskDevices.length > 0) {
      predictions.push({
        type: "DEVICE_FAILURE_RISK",
        severity: atRiskDevices.length >= 3 ? "HIGH" : "MEDIUM",
        confidence: Math.min(85, 55 + atRiskDevices.length * 8),
        message: `${atRiskDevices.length} device(s) at risk of failure (high CPU/memory/temperature)`,
        action: "Schedule preventive maintenance for flagged devices",
        metadata: {
          devices: atRiskDevices.map((d) => ({
            name: d.name,
            cpu: d.cpuUsage,
            memory: d.memoryUsage,
            temperature: d.temperature,
          })),
        },
      });
    }

    if (offlineDevices.length > 0) {
      predictions.push({
        type: "DEVICE_OUTAGE",
        severity: offlineDevices.length >= 3 ? "CRITICAL" : "HIGH",
        confidence: 95,
        message: `${offlineDevices.length} device(s) currently offline`,
        action: "Investigate connectivity for offline devices and restore service",
        metadata: {
          devices: offlineDevices.map((d) => ({
            name: d.name,
            type: d.type,
            lastSeen: d.lastSeenAt,
          })),
        },
      });
    }

    // ── 3. Alert Storm Detection ──
    const alerts24h = await db.networkAlert.count({
      where: { createdAt: { gte: oneDayAgo } },
    });

    const totalAlerts7d = await db.networkAlert.count({
      where: { createdAt: { gte: sevenDaysAgo } },
    });

    const avgDailyAlerts = totalAlerts7d / 7;

    if (avgDailyAlerts > 0) {
      const spikeRatio = alerts24h / avgDailyAlerts;

      if (spikeRatio > 3) {
        predictions.push({
          type: "ALERT_STORM",
          severity: "CRITICAL",
          confidence: Math.min(95, 70 + Math.round(spikeRatio * 5)),
          message: `Alert storm detected: ${alerts24h} alerts in 24h vs ${avgDailyAlerts.toFixed(0)} daily average (${spikeRatio.toFixed(1)}x spike)`,
          action: "Investigate root cause of alert spike — possible infrastructure issue",
          metadata: {
            alerts24h,
            avgDailyAlerts: Math.round(avgDailyAlerts * 10) / 10,
            spikeRatio: Math.round(spikeRatio * 10) / 10,
          },
        });
      } else if (spikeRatio > 2) {
        predictions.push({
          type: "ALERT_INCREASE",
          severity: "MEDIUM",
          confidence: 65,
          message: `Alert rate elevated: ${alerts24h} alerts in 24h vs ${avgDailyAlerts.toFixed(0)} daily average`,
          action: "Review recent alerts and check for recurring issues",
          metadata: {
            alerts24h,
            avgDailyAlerts: Math.round(avgDailyAlerts * 10) / 10,
            spikeRatio: Math.round(spikeRatio * 10) / 10,
          },
        });
      }
    }

    // ── 4. Complaint Trend Prediction ──
    const complaints7d = await db.complaint.count({
      where: { createdAt: { gte: sevenDaysAgo } },
    });

    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const complaintsPrev7d = await db.complaint.count({
      where: {
        createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo },
      },
    });

    if (complaintsPrev7d > 0) {
      const complaintGrowth = ((complaints7d - complaintsPrev7d) / complaintsPrev7d) * 100;

      if (complaintGrowth > 50) {
        predictions.push({
          type: "COMPLAINT_SURGE",
          severity: "HIGH",
          confidence: Math.min(85, 60 + Math.round(complaintGrowth / 5)),
          message: `Complaint volume surging: ${complaints7d} this week vs ${complaintsPrev7d} last week (+${complaintGrowth.toFixed(0)}%)`,
          action: "Review complaint types and affected areas — may indicate service degradation",
          metadata: {
            thisWeek: complaints7d,
            lastWeek: complaintsPrev7d,
            growth: Math.round(complaintGrowth * 10) / 10,
          },
        });
      }
    }

    // ── 5. Capacity Forecast per Area ──
    const areas = await db.area.findMany({
      select: {
        id: true,
        name: true,
        _count: { select: { Subscriber: true, NetworkDevice: true } },
      },
    });

    const capacityForecasts = areas.map((area) => {
      const subsPerDevice = area._count.NetworkDevice > 0
        ? area._count.Subscriber / area._count.NetworkDevice
        : area._count.Subscriber;
      const utilization = Math.min(100, Math.round(subsPerDevice * 2)); // rough heuristic
      return {
        areaId: area.id,
        areaName: area.name,
        subscribers: area._count.Subscriber,
        devices: area._count.NetworkDevice,
        utilization,
        status: utilization >= 80 ? "CRITICAL" : utilization >= 60 ? "WARNING" : "OK" as string,
      };
    });

    const criticalAreas = capacityForecasts.filter((a) => a.status === "CRITICAL");
    if (criticalAreas.length > 0) {
      predictions.push({
        type: "CAPACITY_WARNING",
        severity: "HIGH",
        confidence: 75,
        message: `${criticalAreas.length} area(s) near or at capacity: ${criticalAreas.map((a) => a.areaName).join(", ")}`,
        action: "Expand network infrastructure in high-utilization areas",
        metadata: { areas: criticalAreas },
      });
    }

    // Sort predictions by severity priority
    const severityOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    predictions.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return NextResponse.json({
      predictions,
      summary: {
        total: predictions.length,
        critical: predictions.filter((p) => p.severity === "CRITICAL").length,
        high: predictions.filter((p) => p.severity === "HIGH").length,
        medium: predictions.filter((p) => p.severity === "MEDIUM").length,
        low: predictions.filter((p) => p.severity === "LOW").length,
      },
      capacityForecasts,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("Predictive API error:", error);
    return NextResponse.json(
      { error: "Failed to generate predictive insights" },
      { status: 500 }
    );
  }
}
