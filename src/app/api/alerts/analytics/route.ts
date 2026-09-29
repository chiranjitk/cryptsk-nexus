import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";

// GET /api/alerts/analytics - Alert trend data for charts
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const days = Math.min(90, Math.max(1, Number(searchParams.get("days")) || 7));

    const now = new Date();
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    // 1. Daily alert trend (last N days)
    const alerts = await db.networkAlert.findMany({
      where: { createdAt: { gte: startDate } },
      select: {
        createdAt: true,
        severity: true,
        status: true,
        resolvedAt: true,
        acknowledgedAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    // Build daily buckets
    const dailyBuckets: Record<string, { total: number; critical: number; high: number; medium: number; low: number; resolved: number; avgResolutionMin: number; resolutionSum: number; resolvedCount: number }> = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      dailyBuckets[key] = { total: 0, critical: 0, high: 0, medium: 0, low: 0, resolved: 0, avgResolutionMin: 0, resolutionSum: 0, resolvedCount: 0 };
    }

    for (const alert of alerts) {
      const dayKey = alert.createdAt.toISOString().slice(0, 10);
      if (!dailyBuckets[dayKey]) continue;
      const bucket = dailyBuckets[dayKey];
      bucket.total++;
      const sev = alert.severity.toLowerCase();
      if (sev === "critical") bucket.critical++;
      else if (sev === "high") bucket.high++;
      else if (sev === "medium") bucket.medium++;
      else if (sev === "low") bucket.low++;

      // Check if resolved on same day
      if (alert.resolvedAt && alert.resolvedAt.toISOString().slice(0, 10) === dayKey) {
        bucket.resolved++;
      }
      // Resolution time for alerts that were resolved
      if (alert.resolvedAt) {
        const resMin = (alert.resolvedAt.getTime() - alert.createdAt.getTime()) / 60000;
        bucket.resolutionSum += resMin;
        bucket.resolvedCount++;
      }
    }

    const dailyTrend = Object.entries(dailyBuckets).map(([date, data]) => ({
      date,
      total: data.total,
      critical: data.critical,
      high: data.high,
      medium: data.medium,
      low: data.low,
      resolved: data.resolved,
      avgResolutionMin: data.resolvedCount > 0 ? Math.round(data.resolutionSum / data.resolvedCount) : 0,
    }));

    // 2. Severity distribution (all-time)
    const severityDist = await db.networkAlert.groupBy({
      by: ["severity"],
      _count: { id: true },
    });

    // 3. Top alert sources (most common devices/rules)
    const topSources = await db.networkAlert.groupBy({
      by: ["ruleId"],
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    });

    const topSourcesWithNames: Array<{ ruleId: string | null; name: string; count: number }> = [];
    for (const src of topSources) {
      let rule: { name: string } | null = null;
      if (src.ruleId) {
        rule = await db.alertRule.findUnique({
          where: { id: src.ruleId },
          select: { name: true },
        });
      }
      topSourcesWithNames.push({
        ruleId: src.ruleId,
        name: rule?.name || "Unknown",
        count: src._count.id,
      });
    }

    // 4. Resolution stats
    const totalAlerts = alerts.length;
    const resolvedAlerts = alerts.filter((a) => a.status === "RESOLVED");
    const totalResolutionTime = resolvedAlerts.reduce((sum, a) => {
      if (a.resolvedAt) return sum + (a.resolvedAt.getTime() - a.createdAt.getTime()) / 60000;
      return sum;
    }, 0);
    const avgResolutionMin = resolvedAlerts.length > 0 ? Math.round(totalResolutionTime / resolvedAlerts.length) : 0;
    const medianResolutionMin = (() => {
      if (resolvedAlerts.length === 0) return 0;
      const times = resolvedAlerts
        .filter((a) => a.resolvedAt)
        .map((a) => (a.resolvedAt!.getTime() - a.createdAt.getTime()) / 60000)
        .sort((a, b) => a - b);
      const mid = Math.floor(times.length / 2);
      return times.length % 2 !== 0 ? Math.round(times[mid]) : Math.round((times[mid - 1] + times[mid]) / 2);
    })();

    return NextResponse.json({
      dailyTrend,
      severityDistribution: severityDist.map((s) => ({
        severity: s.severity.charAt(0).toUpperCase() + s.severity.slice(1).toLowerCase(),
        count: s._count.id,
      })),
      topSources: topSourcesWithNames,
      summary: {
        totalAlerts,
        resolvedCount: resolvedAlerts.length,
        avgResolutionMin,
        medianResolutionMin,
        resolveRate: totalAlerts > 0 ? Math.round((resolvedAlerts.length / totalAlerts) * 100) : 0,
      },
    });
  } catch (error: unknown) {
    console.error("Alert analytics error:", error);
    const msg = error instanceof Error && error.message.includes("Authentication") ? error.message : "Failed to fetch alert analytics";
    const status = error instanceof Error && error.message.includes("401") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
