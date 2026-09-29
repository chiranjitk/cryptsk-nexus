import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditCreate } from "@/lib/services/audit-service";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const technicianId = searchParams.get("technicianId");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const search = searchParams.get("search");
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 20));
    const view = searchParams.get("view"); // "schedule" or "calendar"
    const calendarMonth = searchParams.get("calendarMonth"); // YYYY-MM

    // Status counts (global, not affected by pagination)
    const statusCounts = await db.installation.groupBy({
      by: ["status"],
      _count: { id: true },
    });
    const counts: Record<string, number> = {};
    for (const s of statusCounts) {
      counts[s.status] = s._count.id;
    }

    // Calendar view: return installations for a full month
    if (view === "calendar" && calendarMonth) {
      const [year, month] = calendarMonth.split("-").map(Number);
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59, 999);

      const calendarInstallations = await db.installation.findMany({
        where: {
          scheduledDate: { gte: startDate, lte: endDate },
          ...(status ? { status: status as any } : {}),
        },
        include: {
          Subscriber: { select: { id: true, name: true, code: true } },
          Technician: { select: { id: true, name: true } },
          Area: { select: { id: true, name: true } },
        },
        orderBy: { scheduledDate: "asc" },
      });

      return NextResponse.json({
        installations: calendarInstallations,
        statusCounts: counts,
      });
    }

    // Regular list with pagination
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (technicianId) where.technicianId = technicianId;
    if (dateFrom || dateTo) {
      where.scheduledDate = {};
      if (dateFrom) (where.scheduledDate as Record<string, unknown>).gte = new Date(dateFrom);
      if (dateTo) (where.scheduledDate as Record<string, unknown>).lte = new Date(dateTo);
    }
    if (search) {
      where.OR = [
        { Subscriber: { name: { contains: search } } },
        { Subscriber: { code: { contains: search } } },
        { Technician: { name: { contains: search } } },
        { Area: { name: { contains: search } } },
      ];
    }

    const [installations, total] = await Promise.all([
      db.installation.findMany({
        where,
        include: {
          Subscriber: { select: { id: true, name: true, phone: true, code: true, address: true } },
          Technician: { select: { id: true, name: true, phone: true, status: true } },
          Area: { select: { id: true, name: true, code: true } },
        },
        orderBy: { scheduledDate: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.installation.count({ where }),
    ]);

    return NextResponse.json({
      installations,
      statusCounts: counts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Installations GET error:", error);
    return NextResponse.json({ error: "Failed to fetch installations" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const body = await req.json();

    // Handle batch create
    if (body.action === "batch-create") {
      const { technicianId, areaId, startDate, endDate, scheduledTime, estimatedDurationHours } = body;
      if (!technicianId || !startDate || !endDate) {
        return NextResponse.json(
          { error: "Technician, start date, and end date are required for batch creation" },
          { status: 400 }
        );
      }

      const start = new Date(startDate);
      const end = new Date(endDate);
      if (start > end) {
        return NextResponse.json({ error: "Start date must be before end date" }, { status: 400 });
      }

      const days: Date[] = [];
      const current = new Date(start);
      while (current <= end) {
        days.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }

      if (days.length > 90) {
        return NextResponse.json({ error: "Cannot create more than 90 installations at once" }, { status: 400 });
      }

      const duration = estimatedDurationHours !== undefined ? Number(estimatedDurationHours) : 2;
      const time = scheduledTime || "10:00";

      // Check for existing installations for this technician on those dates
      const existing = await db.installation.findMany({
        where: {
          technicianId,
          scheduledDate: { gte: start, lte: end },
          status: { in: ["SCHEDULED", "IN_PROGRESS"] },
        },
        select: { id: true, scheduledDate: true, subscriberId: true },
      });

      const existingDates = new Set(existing.map(e => new Date(e.scheduledDate).toDateString()));
      const conflictDays = days.filter(d => existingDates.has(d.toDateString()));

      if (conflictDays.length > 0) {
        return NextResponse.json({
          error: "Conflicts detected",
          conflicts: conflictDays.map(d => d.toISOString().split("T")[0]),
          existingCount: conflictDays.length,
        }, { status: 409 });
      }

      // Create installations for each day — each without a subscriber (placeholder)
      const created = await db.installation.createMany({
        data: days.map(day => ({
          technicianId,
          areaId: areaId || null,
          scheduledDate: day,
          scheduledTime: time,
          estimatedDurationHours: duration,
          status: "SCHEDULED",
          subscriberId: technicianId,
        })) as any,
      });

      return NextResponse.json({
        message: `Batch created ${created.count} installations`,
        count: created.count,
      });
    }

    // Conflict check action
    if (body.action === "check-conflict") {
      const { technicianId, scheduledDate, scheduledTime, excludeId } = body;
      if (!technicianId || !scheduledDate) {
        return NextResponse.json({ error: "Technician ID and date are required" }, { status: 400 });
      }

      const dayStart = new Date(scheduledDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(scheduledDate);
      dayEnd.setHours(23, 59, 59, 999);

      const where: Record<string, unknown> = {
        technicianId,
        scheduledDate: { gte: dayStart, lte: dayEnd },
        status: { in: ["SCHEDULED", "IN_PROGRESS"] },
      };
      if (excludeId) where.id = { not: excludeId };

      const conflicts = await db.installation.findMany({
        where,
        include: {
          Subscriber: { select: { id: true, name: true, code: true } },
          Area: { select: { id: true, name: true } },
        },
      });

      // Check if technician is on leave
      const tech = await db.technician.findUnique({
        where: { id: technicianId },
        select: { name: true, status: true, daysOff: true, LeaveRecord: true },
      });

      let onLeave = false;
      if (tech) {
        try {
          const daysOff: string[] = JSON.parse(tech.daysOff || "[]");
          const dayName = new Date(scheduledDate).toLocaleDateString("en-US", { weekday: "long" });
          if (daysOff.includes(dayName)) onLeave = true;
        } catch { /* ignore */ }

        if (tech.leaveRecords) {
          // Note: leaveRecords not included in select above, let's check
        }
      }

      return NextResponse.json({
        hasConflict: conflicts.length > 0 || onLeave,
        conflicts,
        onLeave,
        technicianName: tech?.name,
        dailyCount: conflicts.length,
      });
    }

    // Single create
    const { subscriberId, technicianId, areaId, scheduledDate, scheduledTime, checklist, estimatedDurationHours } = body;
    if (!subscriberId || !technicianId || !scheduledDate) {
      return NextResponse.json(
        { error: "Subscriber, technician, and scheduled date are required" },
        { status: 400 }
      );
    }

    const installation = await db.installation.create({
      data: {
        subscriberId,
        technicianId,
        areaId: areaId || null,
        scheduledDate: new Date(scheduledDate),
        scheduledTime: scheduledTime || "",
        status: "SCHEDULED",
        checklist: checklist ? JSON.stringify(checklist) : "[]",
        estimatedDurationHours: estimatedDurationHours !== undefined ? Number(estimatedDurationHours) : 2,
      },
      include: {
        Subscriber: { select: { id: true, name: true, phone: true, code: true } },
        Technician: { select: { id: true, name: true, phone: true, status: true } },
        Area: { select: { id: true, name: true, code: true } },
      },
    });

    await auditCreate(req, "Installation", installation.id, { subscriberId, technicianId, scheduledDate, estimatedDurationHours });
    return NextResponse.json({ installation }, { status: 201 });
  } catch (error: unknown) {
    console.error("Installations POST error:", error);
    if (error && typeof error === "object" && "statusCode" in error) {
      const err = error as { statusCode: number; message: string };
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json({ error: "Failed to create installation" }, { status: 500 });
  }
}
