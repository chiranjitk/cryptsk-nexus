import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { auditCreate } from "@/lib/services/audit-service";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get("agentId");
    const status = searchParams.get("status");

    const where: any = {};
    if (agentId) where.agentId = agentId;
    if (status) where.status = status;

    const records = await (db.agentFollowUp.findMany as any)({
      where,
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      include: {
        Subscriber: { select: { id: true, name: true, code: true } },
      },
    }) as Array<{ id: string; agentId: string; subscriberId: string | null; type: string; notes: string; dueDate: Date | null; status: string; createdAt: Date; updatedAt: Date; Subscriber: { id: string; name: string; code: string } | null }>;

    return NextResponse.json({ records });
  } catch (error) {
    console.error("Followups GET error:", error);
    return NextResponse.json({ error: "Failed to fetch follow-ups" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req);
    const body = await req.json();
    const { agentId, subscriberId, type, notes, dueDate, status } = body;

    if (!agentId) {
      return NextResponse.json({ error: "agentId is required" }, { status: 400 });
    }

    const validTypes = ["PAYMENT", "COMPLAINT", "GENERAL"];
    if (type && !validTypes.includes(type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    const validStatuses = ["PENDING", "COMPLETED", "CANCELLED"];
    const followStatus = status || "PENDING";
    if (!validStatuses.includes(followStatus)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const record = await (db.agentFollowUp.create as any)({
      data: {
        agentId,
        subscriberId: subscriberId || null,
        type: type || "GENERAL",
        notes: notes || "",
        dueDate: dueDate ? new Date(dueDate) : null,
        status: followStatus,
      },
      include: {
        Subscriber: { select: { id: true, name: true, code: true } },
      },
    }) as { id: string; agentId: string; subscriberId: string | null; type: string; notes: string; dueDate: Date | null; status: string; createdAt: Date; updatedAt: Date; Subscriber: { id: string; name: string; code: string } | null };

    await auditCreate(req, "AgentFollowUp", record.id, { agentId, type, subscriberId, dueDate, status: followStatus });
    return NextResponse.json({ record }, { status: 201 });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "statusCode" in error) {
      const e = error as { statusCode: number; message: string };
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    console.error("Followups POST error:", error);
    return NextResponse.json({ error: "Failed to create follow-up" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, status, notes } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const existing = await db.agentFollowUp.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Follow-up not found" }, { status: 404 });
    }

    const updateData: any = {};
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;

    const record = await (db.agentFollowUp.update as any)({
      where: { id },
      data: updateData,
      include: {
        Subscriber: { select: { id: true, name: true, code: true } },
      },
    }) as { id: string; agentId: string; subscriberId: string | null; type: string; notes: string; dueDate: Date | null; status: string; createdAt: Date; updatedAt: Date; Subscriber: { id: string; name: string; code: string } | null };

    return NextResponse.json({ record });
  } catch (error) {
    console.error("Followups PUT error:", error);
    return NextResponse.json({ error: "Failed to update follow-up" }, { status: 500 });
  }
}
