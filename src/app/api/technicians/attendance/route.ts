import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { auditCreate } from "@/lib/services/audit-service";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const technicianId = searchParams.get("technicianId");
    const month = searchParams.get("month");
    const year = searchParams.get("year");

    const where: Record<string, unknown> = {};
    if (technicianId) where.technicianId = technicianId;

    // Filter by month if provided
    if (month && year) {
      const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      const endDate = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59, 999);
      where.date = { gte: startDate, lte: endDate };
    }

    const records = await db.attendanceRecord.findMany({
      where,
      orderBy: { date: "desc" },
      include: {
        Technician: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ records });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "statusCode" in error) {
      const e = error as { statusCode: number; message: string };
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    console.error("Attendance GET error:", error);
    return NextResponse.json({ error: "Failed to fetch attendance records" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req);
    const body = await req.json();
    const { technicianId, date, status, notes } = body;

    if (!technicianId || !date) {
      return NextResponse.json({ error: "technicianId and date are required" }, { status: 400 });
    }

    const dateObj = new Date(date);
    dateObj.setHours(0, 0, 0, 0);

    const existing = await db.attendanceRecord.findUnique({
      where: { technicianId_date: { technicianId, date: dateObj } },
    });

    let record;
    if (existing) {
      record = await db.attendanceRecord.update({
        where: { id: existing.id },
        data: { status: status || existing.status, notes: notes || existing.notes },
      });
    } else {
      record = await db.attendanceRecord.create({
        data: {
          technicianId,
          date: dateObj,
          status: status || "PRESENT",
          notes: notes || "",
        },
      });
    }

    await auditCreate(req, "AttendanceRecord", record.id, { technicianId, date, status });
    return NextResponse.json({ record }, { status: 201 });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "statusCode" in error) {
      const e = error as { statusCode: number; message: string };
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    console.error("Attendance POST error:", error);
    return NextResponse.json({ error: "Failed to save attendance" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await requireAuth(req);
    const body = await req.json();
    const { technicianId, date, action, notes } = body;

    if (!technicianId || !date || !action) {
      return NextResponse.json({ error: "technicianId, date and action are required" }, { status: 400 });
    }

    const dateObj = new Date(date);
    dateObj.setHours(0, 0, 0, 0);

    const existing = await db.attendanceRecord.findUnique({
      where: { technicianId_date: { technicianId, date: dateObj } },
    });

    if (!existing) {
      // Auto-create record
      const record = await db.attendanceRecord.create({
        data: { technicianId, date: dateObj, status: "PRESENT" },
      });

      if (action === "checkin") {
        const updated = await db.attendanceRecord.update({
          where: { id: record.id },
          data: { checkIn: new Date() },
        });
        await auditCreate(req, "AttendanceRecord", updated.id, { action: "checkin", technicianId, date });
        return NextResponse.json({ record: updated });
      }
      return NextResponse.json({ record });
    }

    let updateData: Record<string, unknown> = {};
    if (notes !== undefined) updateData.notes = notes;

    if (action === "checkin") {
      updateData.checkIn = new Date();
      if (!existing.checkIn) updateData.status = existing.status === "ABSENT" ? "LATE" : existing.status;
    } else if (action === "checkout") {
      updateData.checkOut = new Date();
    } else if (action === "status") {
      updateData.status = body.newStatus || existing.status;
    }

    const record = await db.attendanceRecord.update({
      where: { id: existing.id },
      data: updateData,
    });

    await auditCreate(req, "AttendanceRecord", record.id, { action, technicianId, date });
    return NextResponse.json({ record });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "statusCode" in error) {
      const e = error as { statusCode: number; message: string };
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    console.error("Attendance PUT error:", error);
    return NextResponse.json({ error: "Failed to update attendance" }, { status: 500 });
  }
}
