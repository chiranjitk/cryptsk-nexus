import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { Prisma } from "@prisma/client";

// ── CORS Headers ────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ── OPTIONS handler for CORS preflight ──────────────────────────────

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// ── GET /api/dashboard/technician-stats ────────────────────────────

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    // ── 1. Fetch all technicians ──
    const technicians = await db.technician.findMany({
      select: {
        id: true,
        name: true,
        status: true,
        rating: true,
      },
    });

    if (technicians.length === 0) {
      return NextResponse.json(
        {
          technicians: [],
          summary: {
            total: 0,
            available: 0,
            avgRating: 0,
            avgResolutionHours: 0,
            totalOpenComplaints: 0,
          },
          timestamp: new Date().toISOString(),
        },
        { headers: corsHeaders }
      );
    }

    // ── 2. For each technician, compute complaint stats ──
    const techIds = technicians.map((t) => t.id);

    // Batch query: count of assigned complaints per technician
    const assignedCounts = await db.complaint.groupBy({
      by: ["assignedToId"],
      where: { assignedToId: { in: techIds } },
      _count: { id: true },
    });

    // Batch query: count of resolved complaints (RESOLVED, CLOSED) per technician
    const resolvedCounts = await db.complaint.groupBy({
      by: ["assignedToId"],
      where: {
        assignedToId: { in: techIds },
        status: { in: ["RESOLVED", "CLOSED"] },
      },
      _count: { id: true },
    });

    // Batch query: count of open complaints (OPEN, ASSIGNED, IN_PROGRESS, REOPENED)
    const openCounts = await db.complaint.groupBy({
      by: ["assignedToId"],
      where: {
        assignedToId: { in: techIds },
        status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS", "REOPENED"] },
      },
      _count: { id: true },
    });

    // Batch query: resolved complaints with resolvedAt for avg resolution time
    const resolvedWithTime = await db.complaint.findMany({
      where: {
        assignedToId: { in: techIds },
        status: { in: ["RESOLVED", "CLOSED"] },
        resolvedAt: { not: null },
      },
      select: {
        assignedToId: true,
        createdAt: true,
        resolvedAt: true,
      },
    });

    // Build lookup maps
    const assignedMap = new Map(assignedCounts.map((r) => [r.assignedToId!, r._count.id]));
    const resolvedMap = new Map(resolvedCounts.map((r) => [r.assignedToId!, r._count.id]));
    const openMap = new Map(openCounts.map((r) => [r.assignedToId!, r._count.id]));

    // Group resolved complaints by technician for avg resolution time
    const resolutionTimesMap = new Map<string, number[]>();
    for (const c of resolvedWithTime) {
      if (c.assignedToId && c.resolvedAt) {
        const hours =
          (c.resolvedAt.getTime() - c.createdAt.getTime()) / (1000 * 60 * 60);
        const arr = resolutionTimesMap.get(c.assignedToId) ?? [];
        arr.push(hours);
        resolutionTimesMap.set(c.assignedToId, arr);
      }
    }

    // ── 3. Build technician stats array ──
    const techStats = technicians.map((t) => {
      const totalAssigned = assignedMap.get(t.id) ?? 0;
      const totalResolved = resolvedMap.get(t.id) ?? 0;
      const totalOpen = openMap.get(t.id) ?? 0;
      const resolutionRate =
        totalAssigned > 0
          ? Math.round((totalResolved / totalAssigned) * 10000) / 100
          : 0;

      const times = resolutionTimesMap.get(t.id);
      const avgResolutionHours =
        times && times.length > 0
          ? Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 100) /
            100
          : 0;

      return {
        id: t.id,
        name: t.name,
        status: t.status,
        rating: t.rating,
        totalAssigned,
        totalResolved,
        totalOpen,
        resolutionRate,
        avgResolutionHours,
      };
    });

    // Sort by totalResolved descending, take top 5
    techStats.sort((a, b) => b.totalResolved - a.totalResolved);
    const topTechnicians = techStats.slice(0, 5);

    // ── 4. Compute summary metrics ──
    const total = technicians.length;
    const available = technicians.filter((t) => t.status === "available").length;
    const avgRating =
      total > 0
        ? Math.round(
            (technicians.reduce((sum, t) => sum + t.rating, 0) / total) * 100
          ) / 100
        : 0;

    // Average resolution time across all technicians with data
    const allResolutionTimes: number[] = [];
    for (const times of resolutionTimesMap.values()) {
      allResolutionTimes.push(...times);
    }
    const avgResolutionHours =
      allResolutionTimes.length > 0
        ? Math.round(
            (allResolutionTimes.reduce((a, b) => a + b, 0) /
              allResolutionTimes.length) *
              100
          ) / 100
        : 0;

    const totalOpenComplaints = Array.from(openMap.values()).reduce(
      (sum, count) => sum + count,
      0
    );

    return NextResponse.json(
      {
        technicians: topTechnicians,
        summary: {
          total,
          available,
          avgRating,
          avgResolutionHours,
          totalOpenComplaints,
        },
        timestamp: new Date().toISOString(),
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
    console.error("Technician stats API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch technician performance data" },
      { status: 500, headers: corsHeaders }
    );
  }
}
