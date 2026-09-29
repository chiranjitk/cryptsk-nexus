import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const body = await req.json();
    const { installationIds } = body;

    if (!installationIds || !Array.isArray(installationIds) || installationIds.length === 0) {
      return NextResponse.json({ error: "Installation IDs are required" }, { status: 400 });
    }

    const installations = await db.installation.findMany({
      where: {
        id: { in: installationIds },
        status: "SCHEDULED",
      },
      include: {
        Area: { select: { id: true, name: true } },
        Technician: { select: { id: true, name: true } },
      },
    });

    if (installations.length === 0) {
      return NextResponse.json({ error: "No scheduled installations found to assign" }, { status: 400 });
    }

    // Get all active technicians
    const technicians = await db.technician.findMany({
      where: { status: { not: "offline" } },
      include: { LeaveRecord: { select: { startDate: true, endDate: true, status: true } } },
    });

    const results: { installationId: string; assigned: boolean; technicianName: string; reason?: string }[] = [];

    for (const inst of installations) {
      const instDate = new Date(inst.scheduledDate);
      const dayName = instDate.toLocaleDateString("en-US", { weekday: "long" });
      const dayStart = new Date(instDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(instDate);
      dayEnd.setHours(23, 59, 59, 999);

      // Count existing assignments for each technician on this date
      const assignmentsByTech = await db.installation.groupBy({
        by: ["technicianId"],
        where: {
          scheduledDate: { gte: dayStart, lte: dayEnd },
          status: { in: ["SCHEDULED", "IN_PROGRESS"] },
        },
        _count: { id: true },
      });
      const techAssignmentCount: Record<string, number> = {};
      for (const a of assignmentsByTech) {
        techAssignmentCount[a.technicianId] = a._count.id;
      }

      // Find best technician
      let bestTech: typeof technicians[0] | null = null;
      let minAssignments = Infinity;

      for (const tech of technicians) {
        // Skip if already assigned
        if (tech.id === inst.technicianId) continue;

        // Check if on leave
        try {
          const daysOff: string[] = JSON.parse(tech.daysOff || "[]");
          if (daysOff.includes(dayName)) continue;
        } catch { /* ignore */ }

        // Check leave records
        const onLeave = tech.leaveRecords.some(
          lr => lr.startDate <= instDate && lr.endDate >= instDate && lr.status === "APPROVED"
        );
        if (onLeave) continue;

        // Check if within working hours (simple check based on scheduledTime)
        if (inst.scheduledTime) {
          const [h] = inst.scheduledTime.split(":").map(Number);
          const [whStart] = (tech.workingHoursStart || "09:00").split(":").map(Number);
          const [whEnd] = (tech.workingHoursEnd || "18:00").split(":").map(Number);
          if (h < whStart || h >= whEnd) continue;
        }

        // Check area match (prefer technicians assigned to same area)
        const count = techAssignmentCount[tech.id] || 0;
        if (count >= 5) continue; // Max 5 assignments per day

        // Prefer technicians managing the same area
        const areaMatch = inst.areaId && tech.areas && JSON.parse(tech.areas || "[]").includes(inst.areaId);
        const effectiveCount = areaMatch ? count : count + 0.5;

        if (effectiveCount < minAssignments) {
          minAssignments = effectiveCount;
          bestTech = tech;
        }
      }

      if (bestTech) {
        await db.installation.update({
          where: { id: inst.id },
          data: { technicianId: bestTech.id },
        });
        results.push({ installationId: inst.id, assigned: true, technicianName: bestTech.name });
      } else {
        results.push({ installationId: inst.id, assigned: false, technicianName: "", reason: "No available technician found" });
      }
    }

    const assigned = results.filter(r => r.assigned).length;
    const failed = results.filter(r => !r.assigned).length;

    return NextResponse.json({
      total: results.length,
      assigned,
      failed,
      results,
    });
  } catch (error: unknown) {
    console.error("Auto-assign error:", error);
    if (error && typeof error === "object" && "statusCode" in error) {
      const err = error as { statusCode: number; message: string };
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json({ error: "Failed to auto-assign" }, { status: 500 });
  }
}
