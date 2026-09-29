import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ── CORS ──
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

const PRIORITIES = ["P1_CRITICAL", "P2_HIGH", "P3_MEDIUM", "P4_LOW"] as const;

// ── GET /api/compliance/sla ─────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const now = new Date();
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // ── 1. Fetch complaints with resolution data (last 6 months, bounded) ──
    const complaints = await db.complaint.findMany({
      select: {
        id: true,
        ticketNumber: true,
        priority: true,
        status: true,
        slaHours: true,
        slaDeadline: true,
        resolvedAt: true,
        createdAt: true,
        escalationLevel: true,
        subscriberId: true,
        Subscriber: { select: { name: true } },
        type: true,
      },
      where: { createdAt: { gte: sixMonthsAgo } },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });

    // ── 2. Fetch network devices for uptime ──
    const devices = await db.networkDevice.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        lastSeenAt: true,
        uptimeSeconds: true,
        Area: { select: { name: true } },
      },
    });

    // ── 3. Fetch plan SLA targets ──
    const plans = await db.plan.findMany({
      select: { id: true, name: true, slaUptime: true },
      where: { status: "ACTIVE" },
    });

    // ── 4. Fetch subscribers with plans for uptime SLA comparison ──
    const activeSubscribers = await db.subscriber.findMany({
      select: { id: true, planId: true, name: true },
      where: { status: "ACTIVE", planId: { not: null } },
    });

    // ── Compute Complaint SLA Compliance ──
    const resolvedComplaints = complaints.filter(
      (c) => c.resolvedAt && c.slaDeadline
    );
    const openComplaints = complaints.filter(
      (c) => !["RESOLVED", "CLOSED"].includes(c.status) && c.slaDeadline
    );

    let totalResolvedOnTime = 0;
    let totalResolved = resolvedComplaints.length;
    const byPriority: Record<
      string,
      {
        total: number;
        resolved: number;
        onTime: number;
        breached: number;
        open: number;
        complianceRate: number;
        avgResolutionHours: number;
        avgResponseHours: number;
        p95ResolutionHours: number;
        medianResolutionHours: number;
        escalationRate: number;
        escalatedCount: number;
      }
    > = {};

    for (const p of PRIORITIES) {
      byPriority[p] = {
        total: 0,
        resolved: 0,
        onTime: 0,
        breached: 0,
        open: 0,
        complianceRate: 100,
        avgResolutionHours: 0,
        avgResponseHours: 0,
        p95ResolutionHours: 0,
        medianResolutionHours: 0,
        escalationRate: 0,
        escalatedCount: 0,
      };
    }

    const resolutionTimesByPriority: Record<string, number[]> = {};
    for (const p of PRIORITIES) resolutionTimesByPriority[p] = [];

    // Response times: time from createdAt to first comment (IN_PROGRESS status change proxy)
    const responseTimesByPriority: Record<string, number[]> = {};
    for (const p of PRIORITIES) responseTimesByPriority[p] = [];

    // Fetch complaint comments for response time calculation (scoped to fetched complaints only)
    const complaintIds = complaints.map((c) => c.id);
    const firstComments = complaintIds.length > 0
      ? await db.complaintComment.findMany({
          select: { complaintId: true, createdAt: true },
          where: { complaintId: { in: complaintIds } },
          orderBy: { createdAt: "asc" },
        })
      : [];
    const firstCommentMap = new Map<string, Date>();
    for (const c of firstComments) {
      if (!firstCommentMap.has(c.complaintId)) {
        firstCommentMap.set(c.complaintId, c.createdAt);
      }
    }

    // Track breaches
    const breaches: Array<{
      ticketNumber: string;
      subscriberName: string;
      priority: string;
      type: string;
      slaHours: number;
      resolvedAt: string | null;
      createdAt: string;
      overdueBy: string;
      status: string;
    }> = [];

    for (const c of resolvedComplaints) {
      const resolutionTime = new Date(c.resolvedAt!).getTime();
      const deadlineTime = new Date(c.slaDeadline!).getTime();
      const createdTime = new Date(c.createdAt).getTime();
      const resolutionHours = Math.max(0, (resolutionTime - createdTime) / (1000 * 60 * 60));

      const stats = byPriority[c.priority];
      if (!stats) continue;

      stats.total++;
      stats.resolved++;

      if (resolutionTime <= deadlineTime) {
        stats.onTime++;
        totalResolvedOnTime++;
      } else {
        stats.breached++;
        const overdueHours = Math.round(((resolutionTime - deadlineTime) / (1000 * 60 * 60)) * 10) / 10;
        breaches.push({
          ticketNumber: c.ticketNumber,
          subscriberName: c.Subscriber?.name || "Unknown",
          priority: c.priority,
          type: c.type,
          slaHours: c.slaHours,
          resolvedAt: c.resolvedAt?.toISOString() || null,
          createdAt: c.createdAt.toISOString(),
          overdueBy: `${overdueHours}h`,
          status: c.status,
        });
      }

      if (c.escalationLevel > 0) stats.escalatedCount++;
      resolutionTimesByPriority[c.priority].push(resolutionHours);

      // Response time: first comment timestamp minus creation
      const firstComment = firstCommentMap.get(c.id);
      if (firstComment) {
        const responseHours = Math.max(0, (firstComment.getTime() - createdTime) / (1000 * 60 * 60));
        responseTimesByPriority[c.priority].push(responseHours);
      }
    }

    // Open complaints breaching SLA
    for (const c of openComplaints) {
      const stats = byPriority[c.priority];
      if (!stats) continue;

      stats.total++;
      stats.open++;

      const deadlineTime = new Date(c.slaDeadline!).getTime();
      if (now.getTime() > deadlineTime) {
        stats.breached++;
        const overdueHours = Math.round(((now.getTime() - deadlineTime) / (1000 * 60 * 60)) * 10) / 10;
        breaches.push({
          ticketNumber: c.ticketNumber,
          subscriberName: c.Subscriber?.name || "Unknown",
          priority: c.priority,
          type: c.type,
          slaHours: c.slaHours,
          resolvedAt: null,
          createdAt: c.createdAt.toISOString(),
          overdueBy: `${overdueHours}h`,
          status: c.status,
        });
      }
      if (c.escalationLevel > 0) stats.escalatedCount++;
    }

    // ── Compute final priority stats ──
    for (const p of PRIORITIES) {
      const stats = byPriority[p];
      const denominator = stats.onTime + stats.breached;
      stats.complianceRate =
        denominator > 0
          ? Math.round((stats.onTime / denominator) * 10000) / 100
          : 100;

      // Resolution time stats
      const rTimes = resolutionTimesByPriority[p];
      if (rTimes.length > 0) {
        rTimes.sort((a, b) => a - b);
        stats.avgResolutionHours = Math.round((rTimes.reduce((s, v) => s + v, 0) / rTimes.length) * 10) / 10;
        const mid = Math.floor(rTimes.length / 2);
        stats.medianResolutionHours =
          rTimes.length % 2 === 0
            ? Math.round(((rTimes[mid - 1] + rTimes[mid]) / 2) * 10) / 10
            : Math.round(rTimes[mid] * 10) / 10;
        const p95Idx = Math.ceil(rTimes.length * 0.95) - 1;
        stats.p95ResolutionHours = Math.round(rTimes[Math.min(p95Idx, rTimes.length - 1)] * 10) / 10;
      }

      // Response time stats
      const respTimes = responseTimesByPriority[p];
      if (respTimes.length > 0) {
        stats.avgResponseHours = Math.round((respTimes.reduce((s, v) => s + v, 0) / respTimes.length) * 10) / 10;
      }

      // Escalation rate
      const escalatedTotal = stats.escalatedCount;
      stats.escalationRate = stats.total > 0
        ? Math.round((escalatedTotal / stats.total) * 10000) / 100
        : 0;
    }

    const overallCompliance =
      totalResolved > 0
        ? Math.round((totalResolvedOnTime / totalResolved) * 10000) / 100
        : 100;

    // ── Network Uptime SLA ──
    const onlineDevices = devices.filter((d) => d.status === "ONLINE");
    const offlineDevices = devices.filter((d) => d.status === "OFFLINE");
    const uptimePercentage =
      devices.length > 0
        ? Math.round((onlineDevices.length / devices.length) * 10000) / 100
        : 100;

    const planUptimeMap = new Map(plans.map((p) => [p.id, p.slaUptime]));
    const activePlanIds = new Set(activeSubscribers.map((s) => s.planId));
    const uniqueActivePlanIds = [...activePlanIds].filter(Boolean);

    let avgPlanUptimeTarget = 0;
    let planCount = 0;
    const devicesBelowSla: Array<{
      name: string;
      type: string;
      status: string;
      lastSeenAt: string | null;
    }> = [];

    for (const pid of uniqueActivePlanIds) {
      const target = planUptimeMap.get(pid!);
      if (target) {
        avgPlanUptimeTarget += target;
        planCount++;
      }
    }

    if (planCount > 0) avgPlanUptimeTarget = Math.round((avgPlanUptimeTarget / planCount) * 100) / 100;

    for (const d of devices) {
      if (d.status !== "ONLINE") {
        devicesBelowSla.push({
          name: d.name,
          type: d.type,
          status: d.status,
          lastSeenAt: d.lastSeenAt?.toISOString() || null,
        });
      }
    }

    // ── Monthly trend (last 6 months) ──
    const trend: Array<{
      month: string;
      complianceRate: number;
      totalResolved: number;
      breachedCount: number;
      avgResolutionHours: number;
    }> = [];

    for (let i = 5; i >= 0; i--) {
      const startDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const endDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
      const monthLabel = startDate.toLocaleString("en-US", { month: "short", year: "2-digit" });

      const monthResolved = resolvedComplaints.filter(
        (c) => {
          const r = new Date(c.resolvedAt!);
          return r >= startDate && r <= endDate;
        }
      );

      let monthOnTime = 0;
      let monthBreached = 0;
      let monthResMs = 0;

      for (const c of monthResolved) {
        const rt = new Date(c.resolvedAt!).getTime();
        const dt = new Date(c.slaDeadline!).getTime();
        const ct = new Date(c.createdAt).getTime();
        monthResMs += Math.max(0, rt - ct);
        if (rt <= dt) monthOnTime++;
        else monthBreached++;
      }

      trend.push({
        month: monthLabel,
        complianceRate: monthResolved.length > 0
          ? Math.round((monthOnTime / monthResolved.length) * 10000) / 100
          : 100,
        totalResolved: monthResolved.length,
        breachedCount: monthBreached,
        avgResolutionHours: monthResolved.length > 0
          ? Math.round((monthResMs / monthResolved.length / (1000 * 60 * 60)) * 10) / 10
          : 0,
      });
    }

    return NextResponse.json(
      {
        overallCompliance,
        byPriority,
        uptime: {
          percentage: uptimePercentage,
          onlineCount: onlineDevices.length,
          offlineCount: offlineDevices.length,
          totalDevices: devices.length,
          planTarget: avgPlanUptimeTarget,
          devicesBelowSla,
        },
        responseTime: Object.fromEntries(
          PRIORITIES.map((p) => [p, { avgHours: byPriority[p].avgResponseHours }])
        ),
        resolutionTime: Object.fromEntries(
          PRIORITIES.map((p) => [
            p,
            {
              avgHours: byPriority[p].avgResolutionHours,
              medianHours: byPriority[p].medianResolutionHours,
              p95Hours: byPriority[p].p95ResolutionHours,
            },
          ])
        ),
        escalation: Object.fromEntries(
          PRIORITIES.map((p) => [
            p,
            {
              rate: byPriority[p].escalationRate,
              count: byPriority[p].escalatedCount,
              total: byPriority[p].total,
            },
          ])
        ),
        trend,
        breaches: breaches.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ).slice(0, 50),
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode, headers: corsHeaders }
      );
    }
    console.error("Compliance SLA API failed:", error);
    return NextResponse.json(
      { error: "Failed to compute SLA compliance metrics" },
      { status: 500, headers: corsHeaders }
    );
  }
}
