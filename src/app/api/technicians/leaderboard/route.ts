import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    try {
      await requireAuth(req);
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
      throw e;
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    throw error;
  }

  try {
    const now = new Date();
    const { searchParams } = new URL(req.url);
    const monthParam = searchParams.get("month");
    const yearParam = searchParams.get("year");

    // Parse month/year or use current
    const targetMonth = monthParam ? parseInt(monthParam, 10) : now.getMonth() + 1;
    const targetYear = yearParam ? parseInt(yearParam, 10) : now.getFullYear();

    const monthStart = new Date(targetYear, targetMonth - 1, 1);
    const monthEnd = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);

    // Previous month for comparison
    const prevMonthStart = new Date(targetYear, targetMonth - 2, 1);
    const prevMonthEnd = new Date(targetYear, targetMonth - 1, 0, 23, 59, 59, 999);

    // Fetch technicians
    const technicians = await db.technician.findMany({
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        status: true,
        skills: true,
        createdAt: true,
      },
    });

    // Current month complaints
    const currentMonthComplaints = await db.complaint.findMany({
      where: {
        assignedToId: { not: null },
        createdAt: { gte: monthStart, lte: monthEnd },
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

    // Previous month complaints
    const prevMonthComplaints = await db.complaint.findMany({
      where: {
        assignedToId: { not: null },
        createdAt: { gte: prevMonthStart, lte: prevMonthEnd },
      },
      select: {
        id: true,
        assignedToId: true,
        status: true,
        createdAt: true,
        resolvedAt: true,
        customerRating: true,
      },
    });

    // Current month installations
    const currentMonthInstallations = await db.installation.findMany({
      where: {
        status: "COMPLETED",
        completedAt: { gte: monthStart, lte: monthEnd },
      },
      select: {
        id: true,
        technicianId: true,
      },
    });

    // Current month attendance
    const daysInMonth = monthEnd.getDate();
    const attendanceRecords = await db.attendanceRecord.findMany({
      where: {
        date: { gte: monthStart, lte: monthEnd },
      },
      select: {
        technicianId: true,
        status: true,
      },
    });

    // Group current month complaints by technician
    const currentComplaintsByTech = new Map<string, typeof currentMonthComplaints>();
    for (const c of currentMonthComplaints) {
      if (c.assignedToId) {
        if (!currentComplaintsByTech.has(c.assignedToId)) {
          currentComplaintsByTech.set(c.assignedToId, []);
        }
        currentComplaintsByTech.get(c.assignedToId)!.push(c);
      }
    }

    // Group previous month complaints by technician
    const prevComplaintsByTech = new Map<string, typeof prevMonthComplaints>();
    for (const c of prevMonthComplaints) {
      if (c.assignedToId) {
        if (!prevComplaintsByTech.has(c.assignedToId)) {
          prevComplaintsByTech.set(c.assignedToId, []);
        }
        prevComplaintsByTech.get(c.assignedToId)!.push(c);
      }
    }

    // Group installations by technician
    const installsByTech = new Map<string, number>();
    for (const inst of currentMonthInstallations) {
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

    // Calculate performance for each technician for current month
    const leaderboard = technicians.map((tech) => {
      const currentComplaints = currentComplaintsByTech.get(tech.id) || [];
      const prevComplaints = prevComplaintsByTech.get(tech.id) || [];

      const resolved = currentComplaints.filter(
        (c) => c.status === "RESOLVED" || c.status === "CLOSED"
      );
      const resolvedCount = resolved.length;

      // Avg resolution time (hours)
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

      // Avg rating
      const ratedComplaints = resolved.filter((c) => (c.customerRating ?? 0) > 0);
      const avgRating =
        ratedComplaints.length > 0
          ? ratedComplaints.reduce((sum, c) => sum + (c.customerRating ?? 0), 0) / ratedComplaints.length
          : 0;

      // Attendance
      const techAttendance = attendanceByTech.get(tech.id) || [];
      const presentDays = techAttendance.filter(
        (a) => a.status === "PRESENT" || a.status === "LATE" || a.status === "HALF_DAY"
      ).length;
      const attendanceRate = techAttendance.length > 0 ? (presentDays / daysInMonth) * 100 : 0;

      // Installations
      const installationsCompleted = installsByTech.get(tech.id) || 0;

      // Previous month score for comparison
      const prevResolved = prevComplaints.filter(
        (c) => c.status === "RESOLVED" || c.status === "CLOSED"
      );
      const prevRated = prevResolved.filter((c) => (c.customerRating ?? 0) > 0);
      const prevAvgRating =
        prevRated.length > 0
          ? prevRated.reduce((sum, c) => sum + (c.customerRating ?? 0), 0) / prevRated.length
          : 0;

      let prevTotalResolutionHours = 0;
      let prevResolvedWithTime = 0;
      for (const c of prevResolved) {
        if (c.resolvedAt) {
          const hours = (c.resolvedAt.getTime() - c.createdAt.getTime()) / (1000 * 60 * 60);
          prevTotalResolutionHours += hours;
          prevResolvedWithTime++;
        }
      }
      const prevAvgResolutionHours = prevResolvedWithTime > 0 ? prevTotalResolutionHours / prevResolvedWithTime : 0;

      // Performance score
      const resolutionRate = currentComplaints.length > 0 ? (resolvedCount / currentComplaints.length) * 100 : 0;
      const resolutionEfficiencyScore = Math.min(100,
        (resolutionRate * 0.6) + (avgResolutionHours > 0 ? Math.max(0, 100 - avgResolutionHours * 5) * 0.4 : 50 * 0.4)
      );
      const satisfactionScore = avgRating > 0 ? (avgRating / 5) * 100 : 0;
      const activeDays = Math.max(1, new Set(currentComplaints.map((c) => c.createdAt.toISOString().slice(0, 10))).size);
      const productivityScore = Math.min(100, (resolvedCount / activeDays) * 20);
      const reliabilityScore = attendanceRate;

      const performanceScore = Math.round(
        resolutionEfficiencyScore * 0.30 +
        satisfactionScore * 0.25 +
        productivityScore * 0.25 +
        reliabilityScore * 0.20
      );

      // Previous month performance score
      const prevResolutionRate = prevComplaints.length > 0 ? (prevResolved.length / prevComplaints.length) * 100 : 0;
      const prevEfficiencyScore = Math.min(100,
        (prevResolutionRate * 0.6) + (prevAvgResolutionHours > 0 ? Math.max(0, 100 - prevAvgResolutionHours * 5) * 0.4 : 50 * 0.4)
      );
      const prevSatisfactionScore = prevAvgRating > 0 ? (prevAvgRating / 5) * 100 : 0;
      const prevActiveDays = Math.max(1, new Set(prevComplaints.map((c) => c.createdAt.toISOString().slice(0, 10))).size);
      const prevProductivityScore = Math.min(100, (prevResolved.length / prevActiveDays) * 20);
      const prevPerformanceScore = Math.round(
        prevEfficiencyScore * 0.30 +
        prevSatisfactionScore * 0.25 +
        prevProductivityScore * 0.25 +
        reliabilityScore * 0.20
      );

      // Badges
      const badges: string[] = [];

      // Speed Demon: Avg resolution time < 4 hours
      if (avgResolutionHours > 0 && avgResolutionHours < 4 && resolvedCount > 0) {
        badges.push("Speed Demon");
      }

      // Customer Favorite: Avg rating >= 4.5
      if (avgRating >= 4.5 && ratedComplaints.length >= 3) {
        badges.push("Customer Favorite");
      }

      // Workhorse: 20+ complaints resolved this month
      if (resolvedCount >= 20) {
        badges.push("Workhorse");
      }

      // Perfect Attendance: 100% attendance
      if (techAttendance.length > 0 && attendanceRate >= 100) {
        badges.push("Perfect Attendance");
      }

      // Rising Star: Most improved vs last month (need previous month data)
      const improvement = performanceScore - prevPerformanceScore;

      return {
        technicianId: tech.id,
        technicianName: tech.name,
        phone: tech.phone,
        email: tech.email,
        status: tech.status,
        complaintsResolved: resolvedCount,
        totalComplaintsAssigned: currentComplaints.length,
        avgRating: Math.round(avgRating * 100) / 100,
        avgResolutionHours: Math.round(avgResolutionHours * 100) / 100,
        installationsCompleted,
        attendanceRate: Math.round(attendanceRate * 100) / 100,
        presentDays,
        performanceScore: Math.max(0, Math.min(100, performanceScore)),
        prevMonthScore: Math.max(0, Math.min(100, prevPerformanceScore)),
        scoreChange: performanceScore - prevPerformanceScore,
        badges,
      };
    });

    // Sort by performance score descending
    leaderboard.sort((a, b) => b.performanceScore - a.performanceScore);

    // Assign ranks
    let rank = 0;
    let prevScore = -1;
    for (let i = 0; i < leaderboard.length; i++) {
      if (leaderboard[i].performanceScore !== prevScore) {
        rank = i + 1;
        prevScore = leaderboard[i].performanceScore;
      }
      leaderboard[i].rank = rank;
    }

    // Determine "Rising Star" - most improved (need at least 5 resolved in prev month)
    let risingStarId: string | null = null;
    let maxImprovement = -Infinity;
    for (const entry of leaderboard) {
      const prevComplaints = prevComplaintsByTech.get(entry.technicianId) || [];
      const prevResolved = prevComplaints.filter(
        (c) => c.status === "RESOLVED" || c.status === "CLOSED"
      );
      if (prevResolved.length >= 3 && entry.scoreChange > 0) {
        if (entry.scoreChange > maxImprovement) {
          maxImprovement = entry.scoreChange;
          risingStarId = entry.technicianId;
        }
      }
    }

    if (risingStarId) {
      const risingEntry = leaderboard.find((e) => e.technicianId === risingStarId);
      if (risingEntry && !risingEntry.badges.includes("Rising Star")) {
        risingEntry.badges.push("Rising Star");
      }
    }

    // Re-sort after adding Rising Star badge
    leaderboard.sort((a, b) => b.performanceScore - a.performanceScore);

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];

    return NextResponse.json({
      success: true,
      leaderboard,
      month: targetMonth,
      year: targetYear,
      monthName: monthNames[targetMonth - 1],
      generatedAt: now.toISOString(),
    });
  } catch (error) {
    console.error("[Technician Leaderboard API]", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch leaderboard data" },
      { status: 500 }
    );
  }
}
