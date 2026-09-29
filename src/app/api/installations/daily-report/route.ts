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
    const dateStr = searchParams.get("date");

    const targetDate = dateStr ? new Date(dateStr) : new Date();
    const dayStart = new Date(targetDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(targetDate);
    dayEnd.setHours(23, 59, 59, 999);

    const installations = await db.installation.findMany({
      where: {
        scheduledDate: { gte: dayStart, lte: dayEnd },
      },
      include: {
        Technician: { select: { id: true, name: true } },
      },
    });

    const totalScheduled = installations.filter(i => i.status === "SCHEDULED").length;
    const totalCompleted = installations.filter(i => i.status === "COMPLETED").length;
    const totalCancelled = installations.filter(i => i.status === "CANCELLED").length;
    const totalInProgress = installations.filter(i => i.status === "IN_PROGRESS").length;
    const totalNoShow = installations.filter(i => i.status === "NO_SHOW").length;
    const total = installations.length;

    // Average duration for completed installations
    const completedWithTimes = installations.filter(
      i => i.status === "COMPLETED" && i.completedAt && i.scheduledDate
    );
    const avgDuration = completedWithTimes.length > 0
      ? Math.round(
          completedWithTimes.reduce((sum, i) => {
            const ms = new Date(i.completedAt!).getTime() - new Date(i.scheduledDate).getTime();
            return sum + ms / (1000 * 60 * 60);
          }, 0) / completedWithTimes.length * 10
        ) / 10
      : 0;

    // Completion rate
    const completionRate = total > 0
      ? Math.round(((totalCompleted + totalCancelled + totalNoShow) / total) * 100)
      : 0;

    // Technician breakdown
    const technicianBreakdown = installations.reduce<Record<string, { name: string; total: number; completed: number; inProgress: number; scheduled: number }>>((acc, inst) => {
      const techName = inst.Technician?.name || "Unassigned";
      if (!acc[inst.technicianId]) {
        acc[inst.technicianId] = { name: techName, total: 0, completed: 0, inProgress: 0, scheduled: 0 };
      }
      acc[inst.technicianId].total++;
      if (inst.status === "COMPLETED") acc[inst.technicianId].completed++;
      if (inst.status === "IN_PROGRESS") acc[inst.technicianId].inProgress++;
      if (inst.status === "SCHEDULED") acc[inst.technicianId].scheduled++;
      return acc;
    }, {});

    return NextResponse.json({
      date: dayStart.toISOString().split("T")[0],
      total,
      totalScheduled,
      totalCompleted,
      totalCancelled,
      totalInProgress,
      totalNoShow,
      avgDuration,
      completionRate,
      technicianBreakdown: Object.values(technicianBreakdown),
    });
  } catch (error) {
    console.error("Daily report error:", error);
    return NextResponse.json({ error: "Failed to generate daily report" }, { status: 500 });
  }
}
