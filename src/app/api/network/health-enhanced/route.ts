import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/network/health-enhanced — Comprehensive multi-factor health analysis
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // ── Factor 1: Device Health (30%) ──
    const [onlineDevices, offlineDevices, warningDevices, totalDevices] = await Promise.all([
      db.networkDevice.count({ where: { status: "ONLINE" } }),
      db.networkDevice.count({ where: { status: "OFFLINE" } }),
      db.networkDevice.count({ where: { status: "WARNING" } }),
      db.networkDevice.count(),
    ]);

    const offlineDeviceList = await db.networkDevice.findMany({
      where: { status: "OFFLINE" },
      select: { id: true, name: true, type: true, areaId: true, lastSeenAt: true, ipAddress: true },
      orderBy: { lastSeenAt: "desc" },
      take: 50,
    });

    const onlineRatio = totalDevices > 0 ? onlineDevices / totalDevices : 1;
    const deviceHealthScore = Math.round(onlineRatio * 100);

    // ── Factor 2: Subscriber Impact (20%) ──
    const [activeSubscribers, totalSubscribers] = await Promise.all([
      db.subscriber.count({ where: { status: "ACTIVE" } }),
      db.subscriber.count(),
    ]);

    const subscriberImpactScore = totalSubscribers > 0
      ? Math.round((activeSubscribers / totalSubscribers) * 100)
      : 100;

    // ── Complaints data ──
    const recentComplaints = await db.complaint.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      select: { id: true, areaId: true, createdAt: true, resolvedAt: true, priority: true, status: true },
    });

    const allComplaints = await db.complaint.findMany({
      select: { id: true, areaId: true, createdAt: true, resolvedAt: true, priority: true, status: true },
    });

    // ── Factor 3: Complaint Density (20%) ──
    const areas = await db.area.findMany({
      select: {
        id: true,
        name: true,
        _count: { select: { Subscriber: true, Complaint: true, NetworkDevice: true } },
      },
    });

    // Complaints per 100 subscribers per area (last 7 days)
    const areaComplaints: Record<string, number> = {};
    for (const c of recentComplaints) {
      if (c.areaId) {
        areaComplaints[c.areaId] = (areaComplaints[c.areaId] || 0) + 1;
      }
    }

    const areaDensity = areas.map((a) => {
      const complaints7d = areaComplaints[a.id] || 0;
      const density = a._count.Subscriber > 0
        ? (complaints7d / a._count.Subscriber) * 100
        : 0;
      return {
        areaId: a.id,
        areaName: a.name,
        subscriberCount: a._count.Subscriber,
        deviceCount: a._count.NetworkDevice,
        complaints7d,
        densityPer100: Math.round(density * 100) / 100,
      };
    });

    const avgDensity = areaDensity.length > 0
      ? areaDensity.reduce((sum, a) => sum + a.densityPer100, 0) / areaDensity.length
      : 0;

    // Score: 0 complaints/100 = 100, 10+ = 0
    const complaintDensityScore = Math.max(0, Math.round(100 - avgDensity * 10));

    // ── Factor 4: Resolution Time (15%) ──
    const resolvedComplaints = allComplaints.filter(
      (c) => c.resolvedAt && c.createdAt
    );

    let avgResolutionHours = 0;
    if (resolvedComplaints.length > 0) {
      const totalHours = resolvedComplaints.reduce((sum, c) => {
        const hours = (new Date(c.resolvedAt!).getTime() - new Date(c.createdAt).getTime()) / (1000 * 60 * 60);
        return sum + hours;
      }, 0);
      avgResolutionHours = totalHours / resolvedComplaints.length;
    }

    // Score: <4h = 100, 4-12h = 80, 12-24h = 60, 24-48h = 40, >48h = 20
    let resolutionTimeScore: number;
    if (avgResolutionHours <= 4) resolutionTimeScore = 100;
    else if (avgResolutionHours <= 12) resolutionTimeScore = 80;
    else if (avgResolutionHours <= 24) resolutionTimeScore = 60;
    else if (avgResolutionHours <= 48) resolutionTimeScore = 40;
    else resolutionTimeScore = 20;

    // ── Factor 5: Alert Severity (15%) ──
    const activeAlerts = await db.networkAlert.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, severity: true, message: true, createdAt: true, title: true, source: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const criticalAlerts = activeAlerts.filter((a) => a.severity === "CRITICAL").length;
    const highAlerts = activeAlerts.filter((a) => a.severity === "HIGH").length;
    const mediumAlerts = activeAlerts.filter((a) => a.severity === "MEDIUM").length;
    const lowAlerts = activeAlerts.filter((a) => a.severity === "LOW").length;

    // Score: 0 alerts = 100, critical = -40, high = -20, medium = -5, low = -1
    const alertScore = Math.max(0, Math.min(100, 100 - criticalAlerts * 40 - highAlerts * 20 - mediumAlerts * 5 - lowAlerts * 1));

    // ── Composite Score ──
    const score = Math.round(
      deviceHealthScore * 0.30 +
      subscriberImpactScore * 0.20 +
      complaintDensityScore * 0.20 +
      resolutionTimeScore * 0.15 +
      alertScore * 0.15
    );

    // ── Grade ──
    let grade: "A" | "B" | "C" | "D" | "F";
    if (score >= 85) grade = "A";
    else if (score >= 70) grade = "B";
    else if (score >= 55) grade = "C";
    else if (score >= 40) grade = "D";
    else grade = "F";

    // ── Recommendations ──
    const recommendations: string[] = [];
    if (offlineDevices > 0) recommendations.push(`${offlineDevices} device(s) offline — investigate immediately`);
    if (criticalAlerts > 0) recommendations.push(`${criticalAlerts} critical alert(s) require immediate attention`);
    if (avgResolutionHours > 24) recommendations.push(`Avg resolution time (${Math.round(avgResolutionHours)}h) exceeds 24h SLA — review ticket workflow`);
    if (avgDensity > 5) recommendations.push(`High complaint density (${avgDensity.toFixed(1)}/100 subs) — check affected areas`);
    if (warningDevices > 0) recommendations.push(`${warningDevices} device(s) in warning state — schedule maintenance`);
    if (activeSubscribers / (totalSubscribers || 1) < 0.85) recommendations.push(`Low active subscriber ratio — review suspended accounts`);

    // ── Predictions (lightweight, computed inline) ──
    const predictions: { type: string; severity: string; confidence: number; message: string; action: string }[] = [];
    if (offlineDevices >= 2) {
      predictions.push({
        type: "DEVICE_OUTAGE_CLUSTER",
        severity: "HIGH",
        confidence: Math.min(95, 60 + offlineDevices * 5),
        message: `Multiple devices offline (${offlineDevices}) — possible network segment failure`,
        action: "Check backbone connectivity and core switch status",
      });
    }
    if (criticalAlerts >= 3) {
      predictions.push({
        type: "ALERT_STORM",
        severity: "CRITICAL",
        confidence: Math.min(90, 50 + criticalAlerts * 10),
        message: `${criticalAlerts} critical alerts active — alert storm detected`,
        action: "Investigate root cause immediately, consider emergency maintenance",
      });
    }
    if (avgResolutionHours > 48) {
      predictions.push({
        type: "SLA_BREACH_RISK",
        severity: "HIGH",
        confidence: 80,
        message: `Resolution times exceeding 48h — SLA breach risk for ${resolvedComplaints.length > 0 ? "active" : "all"} complaints`,
        action: "Escalate unresolved complaints and allocate additional technicians",
      });
    }

    return NextResponse.json({
      score: Math.min(Math.max(score, 0), 100),
      grade,
      factors: {
        deviceHealth: {
          score: deviceHealthScore,
          weight: 0.30,
          label: "Device Health",
          onlineDevices,
          offlineDevices,
          warningDevices,
          totalDevices,
          onlineRatio: Math.round(onlineRatio * 1000) / 10,
        },
        subscriberImpact: {
          score: subscriberImpactScore,
          weight: 0.20,
          label: "Subscriber Impact",
          activeSubscribers,
          totalSubscribers,
          activeRatio: totalSubscribers > 0
            ? Math.round((activeSubscribers / totalSubscribers) * 1000) / 10
            : 100,
        },
        complaintDensity: {
          score: complaintDensityScore,
          weight: 0.20,
          label: "Complaint Density",
          complaints7d: recentComplaints.length,
          avgDensityPer100: Math.round(avgDensity * 100) / 100,
        },
        resolutionTime: {
          score: resolutionTimeScore,
          weight: 0.15,
          label: "Resolution Time",
          avgHours: Math.round(avgResolutionHours * 10) / 10,
          totalResolved: resolvedComplaints.length,
        },
        alertSeverity: {
          score: alertScore,
          weight: 0.15,
          label: "Alert Severity",
          critical: criticalAlerts,
          high: highAlerts,
          medium: mediumAlerts,
          low: lowAlerts,
          totalActive: activeAlerts.length,
        },
      },
      areas: areaDensity,
      offlineDevices: offlineDeviceList,
      activeAlerts: activeAlerts.slice(0, 20),
      predictions,
      recommendations,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("Enhanced health score API error:", error);
    return NextResponse.json(
      { error: "Failed to calculate enhanced health score" },
      { status: 500 }
    );
  }
}
