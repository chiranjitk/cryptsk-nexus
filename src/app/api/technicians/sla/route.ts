import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  try {
    try {
      await requireAuth(req as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const { searchParams } = new URL(req.url);
    const technicianId = searchParams.get("technicianId");

    if (!technicianId) {
      return NextResponse.json({ error: "technicianId is required" }, { status: 400 });
    }

    // Get all resolved complaints for this technician
    const resolvedComplaints = await db.complaint.findMany({
      where: {
        assignedToId: technicianId,
        status: "RESOLVED",
        resolvedAt: { not: null },
        slaDeadline: { not: null },
      },
      select: {
        id: true,
        createdAt: true,
        resolvedAt: true,
        slaDeadline: true,
        slaHours: true,
        status: true,
      },
    });

    const totalResolved = resolvedComplaints.length;

    // Calculate SLA compliance
    let slaCompliant = 0;
    let totalResolutionMinutes = 0;
    let escalatedCount = 0;

    for (const c of resolvedComplaints) {
      if (c.resolvedAt && c.slaDeadline) {
        const resolvedWithinSla = c.resolvedAt <= c.slaDeadline;
        if (resolvedWithinSla) slaCompliant++;

        const minutes = (c.resolvedAt.getTime() - c.createdAt.getTime()) / 60000;
        totalResolutionMinutes += minutes;
      }
    }

    // Escalation rate: complaints that were REOPENED at some point
    const reopenedCount = await db.complaint.count({
      where: { assignedToId: technicianId, status: "REOPENED" },
    });
    const totalAllComplaints = await db.complaint.count({
      where: { assignedToId: technicianId },
    });
    escalatedCount = reopenedCount;

    const slaCompliancePercent = totalResolved > 0 ? Math.round((slaCompliant / totalResolved) * 100) : 0;
    const avgResolutionMinutes = totalResolved > 0 ? Math.round(totalResolutionMinutes / totalResolved) : 0;
    const escalationRate = totalAllComplaints > 0 ? Math.round((escalatedCount / totalAllComplaints) * 100) : 0;

    return NextResponse.json({
      technicianId,
      slaCompliancePercent,
      avgResolutionMinutes,
      escalationRate,
      totalResolved,
      totalComplaints: totalAllComplaints,
      escalatedCount,
      resolvedWithinSla: slaCompliant,
    });
  } catch (error) {
    console.error("SLA GET error:", error);
    return NextResponse.json({ error: "Failed to fetch SLA metrics" }, { status: 500 });
  }
}
