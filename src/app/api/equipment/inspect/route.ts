import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditCreate } from "@/lib/services/audit-service";

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req);
    const body = await req.json();
    const { equipmentId, condition, notes, checklistResult, passed, action } = body;

    if (!equipmentId) {
      return NextResponse.json({ error: "equipmentId is required" }, { status: 400 });
    }

    const equipment = await db.equipment.findUnique({ where: { id: equipmentId } });
    if (!equipment) {
      return NextResponse.json({ error: "Equipment not found" }, { status: 404 });
    }

    const inspection = await db.equipmentInspection.create({
      data: {
        equipmentId,
        inspectedBy: userId,
        condition: condition || "GOOD",
        notes: notes || "",
        checklistResult: checklistResult ? JSON.stringify(checklistResult) : "{}",
        passed: passed !== undefined ? passed : true,
      },
    });

    // Update equipment based on inspection result
    const eqUpdate: Record<string, unknown> = {
      returnCondition: condition || "GOOD",
      returnedAt: new Date(),
    };

    if (action === "return_to_stock" && passed) {
      eqUpdate.status = "IN_STOCK";
      eqUpdate.condition = condition || "GOOD";
    } else if (action === "send_for_repair" && !passed) {
      eqUpdate.status = "RETURNED";
      eqUpdate.condition = "DAMAGED";
      eqUpdate.repairStatus = "SUBMITTED";
    }

    await db.equipment.update({
      where: { id: equipmentId },
      data: eqUpdate,
    });

    await auditCreate(req, "EquipmentInspection", inspection.id, { equipmentId, condition, passed });
    return NextResponse.json({ inspection }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Inspect POST error:", error);
    return NextResponse.json({ error: "Failed to create inspection" }, { status: 500 });
  }
}
