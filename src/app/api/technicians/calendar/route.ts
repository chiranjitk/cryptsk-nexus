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
    const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1), 10);
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()), 10);

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    // Get complaints assigned in the month
    const complaints = await db.complaint.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        assignedToId: { not: null },
      },
      select: {
        assignedToId: true,
        createdAt: true,
        type: true,
        status: true,
        ticketNumber: true,
        Subscriber: { select: { name: true } },
      },
    });

    // Get installations in the month
    const installations = await db.installation.findMany({
      where: {
        scheduledDate: { gte: startDate, lte: endDate },
      },
      select: {
        technicianId: true,
        scheduledDate: true,
        status: true,
        Subscriber: { select: { name: true } },
      },
    });

    // Get technicians
    const technicians = await db.technician.findMany({
      select: { id: true, name: true, status: true },
    });

    // Build calendar days
    const daysInMonth = endDate.getDate();
    const calendar: Record<string, { date: string; day: number; Complaint: { technician: string; ticketNumber: string; type: string; status: string; subscriber: string }[]; installations: { technician: string; status: string; subscriber: string }[] }> = {};

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      calendar[dateStr] = { date: dateStr, day: d, complaints: [], installations: [] };
    }

    // Populate complaints
    for (const c of complaints) {
      if (!c.assignedToId) continue;
      const day = c.createdAt.getDate();
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (calendar[dateStr]) {
        calendar[dateStr].complaints.push({
          technician: technicians.find((t) => t.id === c.assignedToId)?.name || "Unknown",
          ticketNumber: c.ticketNumber,
          type: c.type,
          status: c.status,
          subscriber: c.Subscriber?.name || "N/A",
        });
      }
    }

    // Populate installations
    for (const inst of installations) {
      const day = inst.scheduledDate.getDate();
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (calendar[dateStr]) {
        calendar[dateStr].installations.push({
          technician: technicians.find((t) => t.id === inst.technicianId)?.name || "Unknown",
          status: inst.status,
          subscriber: inst.Subscriber?.name || "N/A",
        });
      }
    }

    // Get leave records for the month
    const leaveRecords = await db.leaveRecord.findMany({
      where: {
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      include: {
        Technician: { select: { id: true, name: true } },
      },
    });

    const leaves = leaveRecords.map((lr) => ({
      id: lr.id,
      technicianId: lr.technicianId,
      technicianName: lr.Technician.name,
      startDate: lr.startDate.toISOString(),
      endDate: lr.endDate.toISOString(),
      reason: lr.reason,
      status: lr.status,
    }));

    return NextResponse.json({
      year,
      month,
      daysInMonth,
      firstDayOfWeek: startDate.getDay(),
      calendar,
      leaves,
      technicians,
    });
  } catch (error) {
    console.error("Technician calendar GET error:", error);
    return NextResponse.json({ error: "Failed to fetch calendar data" }, { status: 500 });
  }
}
