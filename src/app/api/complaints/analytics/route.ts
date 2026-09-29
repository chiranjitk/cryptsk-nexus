import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(request: Request) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    // 1. Complaint type distribution
    const typeDistribution = await db.complaint.groupBy({
      by: ["type"],
      _count: { id: true },
    });

    // 2. Complaint trend (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const complaints30Days = await db.complaint.findMany({
      where: {
        createdAt: { gte: thirtyDaysAgo },
      },
      select: {
        createdAt: true,
        status: true,
      },
      orderBy: { createdAt: "asc" },
    });

    // Group by day
    const trendByDay: Record<string, { date: string; total: number; open: number; resolved: number }> = {};
    for (let i = 0; i < 30; i++) {
      const d = new Date(thirtyDaysAgo);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().split("T")[0];
      trendByDay[key] = { date: key, total: 0, open: 0, resolved: 0 };
    }

    for (const c of complaints30Days) {
      const day = new Date(c.createdAt).toISOString().split("T")[0];
      if (trendByDay[day]) {
        trendByDay[day].total++;
        if (c.status === "OPEN" || c.status === "REOPENED") trendByDay[day].open++;
        if (c.status === "RESOLVED" || c.status === "CLOSED") trendByDay[day].resolved++;
      }
    }

    const trendData = Object.values(trendByDay).map((d) => ({
      date: d.date,
      total: d.total,
      open: d.open,
      resolved: d.resolved,
    }));

    // 3. Average resolution time per priority
    const resolvedComplaints = await db.complaint.findMany({
      where: {
        status: { in: ["RESOLVED", "CLOSED"] },
        resolvedAt: { not: null },
      },
      select: {
        priority: true,
        createdAt: true,
        resolvedAt: true,
      },
    });

    const resolutionByPriority: Record<string, number[]> = {
      P1_CRITICAL: [],
      P2_HIGH: [],
      P3_MEDIUM: [],
      P4_LOW: [],
    };

    for (const c of resolvedComplaints) {
      if (c.resolvedAt) {
        const diffHrs = (new Date(c.resolvedAt).getTime() - new Date(c.createdAt).getTime()) / 3600000;
        if (resolutionByPriority[c.priority]) {
          resolutionByPriority[c.priority].push(diffHrs);
        }
      }
    }

    const avgResolutionTime = Object.entries(resolutionByPriority).map(([priority, times]) => ({
      priority,
      avgHours: times.length > 0 ? Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) / 10 : 0,
      count: times.length,
    }));

    // 4. Priority distribution
    const priorityDistribution = await db.complaint.groupBy({
      by: ["priority"],
      _count: { id: true },
    });

    return NextResponse.json({
      typeDistribution: typeDistribution.map((t) => ({
        type: t.type,
        count: t._count.id,
      })),
      trendData,
      avgResolutionTime,
      priorityDistribution: priorityDistribution.map((p) => ({
        priority: p.priority,
        count: p._count.id,
      })),
      totalComplaints: await db.complaint.count(),
      openComplaints: await db.complaint.count({ where: { status: { in: ["OPEN", "REOPENED"] } } }),
      avgResolutionOverall: (() => {
        const allTimes = resolvedComplaints.map((c) =>
          c.resolvedAt
            ? (new Date(c.resolvedAt).getTime() - new Date(c.createdAt).getTime()) / 3600000
            : 0
        ).filter((t) => t > 0);
        return allTimes.length > 0
          ? Math.round((allTimes.reduce((a, b) => a + b, 0) / allTimes.length) * 10) / 10
          : 0;
      })(),
    });
  } catch (error) {
    console.error("Complaints analytics error:", error);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
