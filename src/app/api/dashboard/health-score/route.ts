import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/dashboard/health-score — ISP health score (0-100)
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const [
      onlineDevices,
      totalDevices,
      activeSubscribers,
      totalSubscribers,
      openComplaints,
    ] = await Promise.all([
      db.networkDevice.count({ where: { status: "ONLINE" } }),
      db.networkDevice.count(),
      db.subscriber.count({ where: { status: "ACTIVE" } }),
      db.subscriber.count(),
      db.complaint.count({
        where: {
          status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS", "REOPENED"] },
        },
      }),
    ]);

    // Uptime score (40% weight): ratio of online devices
    const uptimeScore = totalDevices > 0 ? Math.round((onlineDevices / totalDevices) * 100) : 100;

    // Active ratio score (30% weight): ratio of active subscribers
    const activeRatioScore = totalSubscribers > 0 ? Math.round((activeSubscribers / totalSubscribers) * 100) : 100;

    // Complaint rate score (30% weight): lower complaints = higher score
    // If 0 complaints, score is 100. If complaints equal or exceed subscriber count, score approaches 0.
    const complaintRate =
      totalSubscribers > 0
        ? Math.round((openComplaints / totalSubscribers) * 10000) / 100 // percentage with 2 decimals
        : 0;
    const complaintScore = Math.max(0, Math.round(100 - complaintRate * 5));

    // Weighted health score
    const score =
      Math.round(uptimeScore * 0.4 + activeRatioScore * 0.3 + complaintScore * 0.3);

    return NextResponse.json({
      score: Math.min(Math.max(score, 0), 100),
      uptime: totalDevices > 0 ? Math.round((onlineDevices / totalDevices) * 1000) / 10 : 100,
      activeRatio: totalSubscribers > 0 ? Math.round((activeSubscribers / totalSubscribers) * 1000) / 10 : 100,
      complaintRate,
      components: {
        uptime: {
          score: uptimeScore,
          label: `Online Devices: ${onlineDevices}/${totalDevices}`,
        },
        activeRatio: {
          score: activeRatioScore,
          label: `Active: ${activeSubscribers}/${totalSubscribers}`,
        },
        complaintRate: {
          score: complaintScore,
          label: `Open Complaints: ${openComplaints}`,
        },
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("Health score API error:", error);
    return NextResponse.json(
      { error: "Failed to calculate health score" },
      { status: 500 }
    );
  }
}
