import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    throw error;
  }

  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Fetch all technicians
    const technicians = await db.technician.findMany({
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        skills: true,
        status: true,
      },
    });

    // Fetch all complaints from last 30 days
    const recentComplaints = await db.complaint.findMany({
      where: {
        assignedToId: { not: null },
        createdAt: { gte: thirtyDaysAgo },
      },
      select: {
        id: true,
        assignedToId: true,
        status: true,
        priority: true,
        createdAt: true,
        resolvedAt: true,
        customerRating: true,
      },
    });

    // Fetch all complaints (unresolved) for backlog
    const unresolvedComplaints = await db.complaint.groupBy({
      by: ["assignedToId"],
      where: {
        assignedToId: { not: null },
        status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS", "REOPENED"] },
      },
      _count: { id: true },
    });

    // Fetch installations completed in last 30 days
    const recentInstallations = await db.installation.findMany({
      where: {
        status: "COMPLETED",
        completedAt: { gte: thirtyDaysAgo },
      },
      select: {
        id: true,
        technicianId: true,
      },
    });

    // Fetch attendance records for last 30 days
    const attendanceRecords = await db.attendanceRecord.findMany({
      where: {
        date: { gte: thirtyDaysAgo },
      },
      select: {
        technicianId: true,
        date: true,
        status: true,
      },
    });

    // Fetch leave records for last 30 days
    const leaveRecords = await db.leaveRecord.findMany({
      where: {
        status: "APPROVED",
        startDate: { lte: now },
        endDate: { gte: thirtyDaysAgo },
      },
      select: {
        technicianId: true,
        startDate: true,
        endDate: true,
      },
    });

    // Build technician performance data
    const unresolvedMap = new Map<string, number>();
    for (const item of unresolvedComplaints) {
      if (item.assignedToId) {
        unresolvedMap.set(item.assignedToId, item._count.id);
      }
    }

    // Group complaints by technician
    const complaintsByTech = new Map<string, typeof recentComplaints>();
    for (const c of recentComplaints) {
      if (c.assignedToId) {
        if (!complaintsByTech.has(c.assignedToId)) {
          complaintsByTech.set(c.assignedToId, []);
        }
        complaintsByTech.get(c.assignedToId)!.push(c);
      }
    }

    // Group installations by technician
    const installsByTech = new Map<string, number>();
    for (const inst of recentInstallations) {
      installsByTech.set(inst.technicianId, (installsByTech.get(inst.technicianId) || 0) + 1);
    }

    // Group attendance by technician
    const attendanceByTech = new Map<string, typeof attendanceRecords>();
    for (const a of attendanceRecords) {
      if (!attendanceByTech.has(a.technicianId)) {
        attendanceByTech.set(a.technicianId, []);
      }
      attendanceByTech.get(a.technicianId)!.push(a);
    }

    // Calculate leave days per technician
    const leaveDaysByTech = new Map<string, number>();
    for (const l of leaveRecords) {
      const start = new Date(l.startDate) < thirtyDaysAgo ? thirtyDaysAgo : new Date(l.startDate);
      const end = new Date(l.endDate) > now ? now : new Date(l.endDate);
      const days = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
      leaveDaysByTech.set(l.technicianId, (leaveDaysByTech.get(l.technicianId) || 0) + Math.max(0, days));
    }

    const performanceMetrics = technicians.map((tech) => {
      const techComplaints = complaintsByTech.get(tech.id) || [];
      const totalAssigned = techComplaints.length;
      const resolved = techComplaints.filter((c) => c.status === "RESOLVED" || c.status === "CLOSED");
      const resolvedCount = resolved.length;

      // Average resolution time (hours)
      let totalResolutionHours = 0;
      let resolvedWithTime = 0;
      for (const c of resolved) {
        if (c.resolvedAt) {
          const hours = (c.resolvedAt.getTime() - c.createdAt.getTime()) / (1000 * 60 * 60);
          totalResolutionHours += hours;
          resolvedWithTime++;
        }
      }
      const avgResolutionHours = resolvedWithTime > 0 ? totalResolutionHours / resolvedWithTime : 0;

      // First-visit fix rate (rating >= 4)
      const highRated = resolved.filter((c) => (c.customerRating ?? 0) >= 4);
      const firstVisitFixRate = resolvedCount > 0 ? (highRated.length / resolvedCount) * 100 : 0;

      // Average customer rating
      const ratedComplaints = resolved.filter((c) => c.customerRating != null && c.customerRating > 0);
      const avgRating =
        ratedComplaints.length > 0
          ? ratedComplaints.reduce((sum, c) => sum + (c.customerRating ?? 0), 0) / ratedComplaints.length
          : 0;

      // Installations completed
      const installationsCompleted = installsByTech.get(tech.id) || 0;

      // Attendance rate (last 30 days)
      const techAttendance = attendanceByTech.get(tech.id) || [];
      const presentDays = techAttendance.filter(
        (a) => a.status === "PRESENT" || a.status === "LATE" || a.status === "HALF_DAY"
      ).length;
      const attendanceRate = techAttendance.length > 0 ? (presentDays / techAttendance.length) * 100 : 0;

      // Leave days
      const leaveDays = leaveDaysByTech.get(tech.id) || 0;

      // Backlog count
      const backlog = unresolvedMap.get(tech.id) || 0;

      // Active days (days with at least one complaint)
      const activeDaysSet = new Set<string>();
      for (const c of techComplaints) {
        activeDaysSet.add(c.createdAt.toISOString().slice(0, 10));
      }
      const activeDays = Math.max(activeDaysSet.size, 1);

      // Performance score (0-100) weighted composite
      const resolutionRate = totalAssigned > 0 ? (resolvedCount / totalAssigned) * 100 : 0;
      const resolutionEfficiencyScore = Math.min(100,
        (resolutionRate * 0.6) + (avgResolutionHours > 0 ? Math.max(0, 100 - avgResolutionHours * 5) * 0.4 : 50 * 0.4)
      );
      const satisfactionScore = avgRating > 0 ? (avgRating / 5) * 100 : 0;
      const productivityScore = Math.min(100, (resolvedCount / activeDays) * 20);
      const reliabilityScore = attendanceRate;

      const performanceScore = Math.round(
        resolutionEfficiencyScore * 0.30 +
        satisfactionScore * 0.25 +
        productivityScore * 0.25 +
        reliabilityScore * 0.20
      );

      return {
        technicianId: tech.id,
        technicianName: tech.name,
        phone: tech.phone,
        email: tech.email,
        status: tech.status,
        skills: tech.skills,
        totalComplaintsAssigned: totalAssigned,
        complaintsResolved: resolvedCount,
        avgResolutionHours: Math.round(avgResolutionHours * 100) / 100,
        firstVisitFixRate: Math.round(firstVisitFixRate * 100) / 100,
        totalInstallationsCompleted: installationsCompleted,
        attendanceRate: Math.round(attendanceRate * 100) / 100,
        leaveDays,
        avgCustomerRating: Math.round(avgRating * 100) / 100,
        backlogCount: backlog,
        performanceScore: Math.max(0, Math.min(100, performanceScore)),
      };
    });

    // Sort by performance score descending
    performanceMetrics.sort((a, b) => b.performanceScore - a.performanceScore);

    return NextResponse.json({
      success: true,
      metrics: performanceMetrics,
      generatedAt: now.toISOString(),
      period: "last30Days",
    });
  } catch (error) {
    console.error("[Technician Performance API]", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch technician performance data" },
      { status: 500 }
    );
  }
}
