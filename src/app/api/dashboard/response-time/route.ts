import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// SLA targets in hours per priority
const SLA_TARGETS: Record<string, number> = {
  P1_CRITICAL: 1,
  P2_HIGH: 4,
  P3_MEDIUM: 8,
  P4_LOW: 24,
};

const PRIORITY_LABELS: Record<string, string> = {
  P1_CRITICAL: "P1 Critical",
  P2_HIGH: "P2 High",
  P3_MEDIUM: "P3 Medium",
  P4_LOW: "P4 Low",
};

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    // Fetch complaints with comments (limited to prevent memory issues)
    const complaints = await db.complaint.findMany({
      select: {
        id: true,
        priority: true,
        createdAt: true,
        ComplaintComment: {
          select: { createdAt: true },
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
      take: 50000,
      orderBy: { createdAt: "desc" },
    });

    // Group by priority and calculate average first response time
    const priorityGroups: Record<string, { totalMs: number; count: number; breached: number }> = {
      P1_CRITICAL: { totalMs: 0, count: 0, breached: 0 },
      P2_HIGH: { totalMs: 0, count: 0, breached: 0 },
      P3_MEDIUM: { totalMs: 0, count: 0, breached: 0 },
      P4_LOW: { totalMs: 0, count: 0, breached: 0 },
    };

    for (const complaint of complaints) {
      if (!complaint.ComplaintComment || complaint.ComplaintComment.length === 0) continue;

      const firstResponseAt = complaint.ComplaintComment[0].createdAt;
      const responseMs = new Date(firstResponseAt).getTime() - new Date(complaint.createdAt).getTime();
      const responseHours = responseMs / (1000 * 60 * 60);

      const priority = complaint.priority as string;
      if (!priorityGroups[priority]) continue;

      priorityGroups[priority].totalMs += responseMs;
      priorityGroups[priority].count += 1;

      const target = SLA_TARGETS[priority] || 24;
      if (responseHours > target) {
        priorityGroups[priority].breached += 1;
      }
    }

    const priorities = Object.entries(priorityGroups).map(([priority, data]) => ({
      priority,
      label: PRIORITY_LABELS[priority] || priority,
      avgResponseHours: data.count > 0 ? Math.round((data.totalMs / data.count / (1000 * 60 * 60)) * 10) / 10 : 0,
      count: data.count,
      breached: data.breached,
      slaTargetHours: SLA_TARGETS[priority] || 24,
      withinSla: data.count - data.breached,
      breachRate: data.count > 0 ? Math.round((data.breached / data.count) * 100) : 0,
    }));

    // Overall average
    const totalResponseMs = Object.values(priorityGroups).reduce((sum, g) => sum + g.totalMs, 0);
    const totalResponses = Object.values(priorityGroups).reduce((sum, g) => sum + g.count, 0);
    const totalBreached = Object.values(priorityGroups).reduce((sum, g) => sum + g.breached, 0);

    const response = NextResponse.json({
      priorities,
      overallAvgHours: totalResponses > 0
        ? Math.round((totalResponseMs / totalResponses / (1000 * 60 * 60)) * 10) / 10
        : 0,
      totalResponses,
      totalBreached,
      overallBreachRate: totalResponses > 0 ? Math.round((totalBreached / totalResponses) * 100) : 0,
      slaTargets: SLA_TARGETS,
      timestamp: new Date().toISOString(),
    });

    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

    return response;
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[GET /api/dashboard/response-time]", error);
    return NextResponse.json(
      { error: "Failed to fetch response time data" },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
