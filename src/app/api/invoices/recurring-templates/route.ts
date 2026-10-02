import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  try {
    const templates = await db.recurringInvoiceTemplate.findMany({
      include: {
        Subscriber: { select: { id: true, name: true, code: true } },
        Plan: { select: { id: true, name: true } },
        Area: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ templates });
  } catch (error) {
    console.error("Recurring templates GET error:", error);
    return NextResponse.json({ error: "Failed to fetch recurring templates" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req);
    const body = await req.json();
    const { name, subscriberId, planId, areaId, schedule, notes } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const template = await db.recurringInvoiceTemplate.create({
      data: {
        name,
        subscriberId: subscriberId || null,
        planId: planId || null,
        areaId: areaId || null,
        schedule: schedule || "MONTHLY",
        notes: notes || "",
        nextGenerateAt: calculateNextDate(schedule || "MONTHLY"),
      },
      include: {
        Subscriber: { select: { id: true, name: true, code: true } },
        Plan: { select: { id: true, name: true } },
        Area: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    console.error("Recurring templates POST error:", error);
    return NextResponse.json({ error: "Failed to create recurring template" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req);
    const { id, ...body } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const template = await db.recurringInvoiceTemplate.findUnique({ where: { id } });
    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.subscriberId !== undefined) updateData.subscriberId = body.subscriberId || null;
    if (body.planId !== undefined) updateData.planId = body.planId || null;
    if (body.areaId !== undefined) updateData.areaId = body.areaId || null;
    if (body.schedule !== undefined) updateData.schedule = body.schedule;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.status !== undefined) updateData.status = body.status;

    const updated = await db.recurringInvoiceTemplate.update({
      where: { id },
      data: updateData,
      include: {
        Subscriber: { select: { id: true, name: true, code: true } },
        Plan: { select: { id: true, name: true } },
        Area: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ template: updated });
  } catch (error) {
    console.error("Recurring templates PUT error:", error);
    return NextResponse.json({ error: "Failed to update recurring template" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req);
    const { searchParams } = req.nextUrl;
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    await db.recurringInvoiceTemplate.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Recurring templates DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete recurring template" }, { status: 500 });
  }
}

function calculateNextDate(schedule: string): Date {
  const now = new Date();
  switch (schedule) {
    case "DAILY":
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    case "WEEKLY":
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    case "MONTHLY":
    default:
      return new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }
}
