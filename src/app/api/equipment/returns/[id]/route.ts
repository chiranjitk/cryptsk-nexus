import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING_INSPECTION: ["INSPECTED", "SCRAPPED"],
  INSPECTED: ["REPAIRED", "SCRAPPED", "RESTOCKED"],
  REPAIRED: ["RESTOCKED", "SCRAPPED"],
  SCRAPPED: [],
  RESTOCKED: [],
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const eqReturn = await db.equipmentReturn.findUnique({
      where: { id },
      include: { Equipment: { select: { id: true, name: true, category: true, serialNumber: true, status: true } } },
    });
    if (!eqReturn) return NextResponse.json({ error: "Return not found" }, { status: 404 });
    return NextResponse.json({ return: eqReturn });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    return NextResponse.json({ error: "Failed to fetch return" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireAuth(request);
    const { id } = await params;
    const body = await request.json();
    const { status, inspectionNotes, condition } = body;

    const existing = await db.equipmentReturn.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Return not found" }, { status: 404 });

    if (status && status !== existing.status) {
      const allowed = VALID_TRANSITIONS[existing.status as string] || [];
      if (!allowed.includes(status)) {
        return NextResponse.json({ error: `Cannot transition from ${existing.status} to ${status}. Allowed: ${allowed.join(", ")}` }, { status: 400 });
      }
    }

    const data: Record<string, unknown> = {};
    if (status) data.status = status;
    if (inspectionNotes !== undefined) data.inspectionNotes = inspectionNotes;
    if (status === "INSPECTED" || status === "RESTOCKED") data.inspectedById = userId;

    const updated = await db.equipmentReturn.update({ where: { id }, data });

    if (status === "RESTOCKED") {
      await db.equipment.update({
        where: { id: existing.equipmentId },
        data: { status: "IN_STOCK", condition: condition === "GOOD" ? "GOOD" : "DAMAGED" },
      });
    } else if (status === "SCRAPPED") {
      await db.equipment.update({
        where: { id: existing.equipmentId },
        data: { status: "DECOMMISSIONED", condition: "DEAD" },
      });
    }

    return NextResponse.json({ return: updated });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Return update error:", error);
    return NextResponse.json({ error: "Failed to update return" }, { status: 500 });
  }
}
