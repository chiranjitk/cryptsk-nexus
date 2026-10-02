import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { auditCreate } from "@/lib/services/audit-service";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const technicianId = searchParams.get("technicianId");
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (technicianId) where.technicianId = technicianId;
    if (status) where.status = status;

    const records = await db.leaveRecord.findMany({
      where,
      include: {
        Technician: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({ records });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "statusCode" in error) {
      const e = error as { statusCode: number; message: string };
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    console.error("Leave GET error:", error);
    return NextResponse.json({ error: "Failed to fetch leave records" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req);
    const body = await req.json();
    const { technicianId, startDate, endDate, reason, type } = body;

    if (!technicianId || !startDate || !endDate) {
      return NextResponse.json({ error: "technicianId, startDate and endDate are required" }, { status: 400 });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) {
      return NextResponse.json({ error: "End date must be after start date" }, { status: 400 });
    }

    const record = await db.leaveRecord.create({
      data: {
        technicianId,
        startDate: start,
        endDate: end,
        type: type || "FULL_DAY",
        reason: reason || "",
        status: "PENDING",
        approvedBy: userId,
      },
      include: {
        Technician: { select: { id: true, name: true, phone: true } },
      },
    });

    await auditCreate(req, "LeaveRecord", record.id, { technicianId, startDate, endDate, reason });
    return NextResponse.json({ record }, { status: 201 });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "statusCode" in error) {
      const e = error as { statusCode: number; message: string };
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    console.error("Leave POST error:", error);
    return NextResponse.json({ error: "Failed to create leave record" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req);
    const body = await req.json();
    const { id, status } = body;

    if (!id || !status) {
      return NextResponse.json({ error: "id and status are required" }, { status: 400 });
    }

    const validStatuses = ["PENDING", "APPROVED", "REJECTED"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const existing = await db.leaveRecord.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Leave record not found" }, { status: 404 });
    }

    const record = await db.leaveRecord.update({
      where: { id },
      data: { status, approvedBy: userId },
      include: {
        Technician: { select: { id: true, name: true, phone: true } },
      },
    });

    await auditCreate(req, "LeaveRecord", id, { action: `status changed to ${status}` });
    return NextResponse.json({ record });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "statusCode" in error) {
      const e = error as { statusCode: number; message: string };
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    console.error("Leave PUT error:", error);
    return NextResponse.json({ error: "Failed to update leave record" }, { status: 500 });
  }
}
