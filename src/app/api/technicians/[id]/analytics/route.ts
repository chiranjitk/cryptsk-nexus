import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/technicians/[id]/analytics - Performance trend data for charts
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    try {
      await requireAuth(req as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const { id } = await params;

    const technician = await db.technician.findUnique({ where: { id } });
    if (!technician) {
      return NextResponse.json({ error: "Technician not found" }, { status: 404 });
    }

    // Build 6-month range
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const monthLabels: string[] = [];
    const complaintsPerMonth: number[] = [];
    const avgResolutionPerMonth: number[] = [];

    for (let i = 0; i < 6; i++) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - (5 - i) + 1, 0, 23, 59, 59, 999);
      const label = monthStart.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
      monthLabels.push(label);

      // Complaints resolved in this month by this technician
      const resolved = await db.complaint.count({
        where: {
          assignedToId: id,
          status: "RESOLVED",
          resolvedAt: { gte: monthStart, lte: monthEnd },
        },
      });
      complaintsPerMonth.push(resolved);

      // Average resolution time for complaints resolved in this month
      const resolvedComplaints = await db.complaint.findMany({
        where: {
          assignedToId: id,
          status: "RESOLVED",
          resolvedAt: { gte: monthStart, lte: monthEnd },
        },
        select: { createdAt: true, resolvedAt: true },
      });

      let avgMinutes = 0;
      if (resolvedComplaints.length > 0) {
        const totalMinutes = resolvedComplaints.reduce((sum, c) => {
          if (c.resolvedAt) {
            return sum + (c.resolvedAt.getTime() - c.createdAt.getTime()) / 60000;
          }
          return sum;
        }, 0);
        avgMinutes = Math.round(totalMinutes / resolvedComplaints.length);
      }
      avgResolutionPerMonth.push(avgMinutes);
    }

    return NextResponse.json({
      months: monthLabels,
      complaintsPerMonth,
      avgResolutionMinutes: avgResolutionPerMonth,
    });
  } catch (error) {
    console.error("Technician analytics error:", error);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
