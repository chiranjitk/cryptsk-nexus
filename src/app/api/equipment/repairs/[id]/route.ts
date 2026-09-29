import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

const VALID_TRANSITIONS: Record<string, string[]> = {
  REPORTED: ["DIAGNOSED", "CANCELLED"],
  DIAGNOSED: ["REPAIRING", "CANCELLED"],
  REPAIRING: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const repair = await db.equipmentRepair.findUnique({
      where: { id },
      include: { Equipment: { select: { id: true, name: true, category: true, serialNumber: true, status: true } } },
    });
    if (!repair) return NextResponse.json({ error: "Repair not found" }, { status: 404 });
    return NextResponse.json({ repair });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    return NextResponse.json({ error: "Failed to fetch repair" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const body = await request.json();
    const { status, repairNotes, actualCost } = body;

    const existing = await db.equipmentRepair.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Repair not found" }, { status: 404 });

    if (status && status !== existing.status) {
      const allowed = VALID_TRANSITIONS[existing.status as string] || [];
      if (!allowed.includes(status)) {
        return NextResponse.json({ error: `Cannot transition from ${existing.status} to ${status}. Allowed: ${allowed.join(", ")}` }, { status: 400 });
      }
    }

    const data: Record<string, unknown> = {};
    if (status) data.status = status;
    if (repairNotes !== undefined) data.repairNotes = repairNotes;
    if (actualCost !== undefined) data.actualCost = Number(actualCost) || 0;
    if (status === "REPAIRING") data.startedAt = new Date();
    if (status === "COMPLETED") data.completedAt = new Date();

    const repair = await db.equipmentRepair.update({ where: { id }, data });

    if (status === "COMPLETED") {
      await db.equipment.update({
        where: { id: existing.equipmentId },
        data: { condition: "GOOD", repairStatus: "COMPLETED" },
      });
    } else if (status === "CANCELLED") {
      await db.equipment.update({
        where: { id: existing.equipmentId },
        data: { repairStatus: "UNREPAIRABLE" },
      });
    }

    return NextResponse.json({ repair });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Repair update error:", error);
    return NextResponse.json({ error: "Failed to update repair" }, { status: 500 });
  }
}
