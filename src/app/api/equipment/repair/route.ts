import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditCreate } from "@/lib/services/audit-service";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req);
    const body = await req.json();
    const { equipmentId, issueDescription, repairVendor, repairCost, repairNotes, status } = body;

    if (!equipmentId) {
      return NextResponse.json({ error: "equipmentId is required" }, { status: 400 });
    }

    const equipment = await db.equipment.findUnique({ where: { id: equipmentId } });
    if (!equipment) {
      return NextResponse.json({ error: "Equipment not found" }, { status: 404 });
    }

    const record = await db.repairRecord.create({
      data: {
        equipmentId,
        reportedBy: userId,
        issueDescription: issueDescription || "",
        repairAction: repairNotes || "",
        cost: repairCost || 0,
        status: status || "SUBMITTED",
      },
    });

    // Update equipment repair status
    await db.equipment.update({
      where: { id: equipmentId },
      data: {
        repairStatus: "SUBMITTED",
        condition: "DAMAGED",
      },
    });

    if (repairVendor) {
      await db.equipment.update({
        where: { id: equipmentId },
        data: { vendorName: repairVendor },
      });
    }

    await auditCreate(req, "RepairRecord", record.id, { equipmentId, status: status || "SUBMITTED" });
    return NextResponse.json({ record }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Repair POST error:", error);
    return NextResponse.json({ error: "Failed to create repair record" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req);
    const body = await req.json();
    const { id, status, repairAction, cost, diagnosisNotes } = body;

    if (!id || !status) {
      return NextResponse.json({ error: "id and status are required" }, { status: 400 });
    }

    const existing = await db.repairRecord.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Repair record not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = { status };
    if (repairAction !== undefined) updateData.repairAction = repairAction;
    if (cost !== undefined) updateData.cost = cost;
    if (diagnosisNotes !== undefined) updateData.diagnosisNotes = diagnosisNotes;
    if (status === "COMPLETED") updateData.completedAt = new Date();

    const record = await db.repairRecord.update({
      where: { id },
      data: updateData,
    });

    // Sync equipment status
    if (status === "COMPLETED") {
      await db.equipment.update({
        where: { id: existing.equipmentId },
        data: { repairStatus: "COMPLETED", condition: "GOOD" },
      });
    } else if (status === "UNREPAIRABLE") {
      await db.equipment.update({
        where: { id: existing.equipmentId },
        data: { repairStatus: "UNREPAIRABLE", condition: "DEAD", status: "DECOMMISSIONED" },
      });
    }

    return NextResponse.json({ record });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Repair PUT error:", error);
    return NextResponse.json({ error: "Failed to update repair record" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const equipmentId = searchParams.get("equipmentId");
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (equipmentId) where.equipmentId = equipmentId;
    if (status) where.status = status;

    const records = await db.repairRecord.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ records });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Repair GET error:", error);
    return NextResponse.json({ error: "Failed to fetch repair records" }, { status: 500 });
  }
}
