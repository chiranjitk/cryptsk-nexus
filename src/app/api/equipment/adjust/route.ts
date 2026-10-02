import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditCreate } from "@/lib/services/audit-service";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req);
    const body = await req.json();
    const { equipmentId, newQty, reason, notes } = body;

    if (!equipmentId) {
      return NextResponse.json({ error: "equipmentId is required" }, { status: 400 });
    }

    const equipment = await db.equipment.findUnique({ where: { id: equipmentId } });
    if (!equipment) {
      return NextResponse.json({ error: "Equipment not found" }, { status: 404 });
    }

    // For stock adjustment, we track the previous and new quantities
    // Since equipment is individual items, we use this for status changes
    const validReasons = ["CORRECTION", "DAMAGED", "RETURN", "AUDIT", "OTHER"];
    const adjReason = (reason || "CORRECTION").toUpperCase();

    if (!validReasons.includes(adjReason)) {
      return NextResponse.json({ error: `Invalid reason. Must be one of: ${validReasons.join(", ")}` }, { status: 400 });
    }

    const adjustment = await db.stockAdjustment.create({
      data: {
        equipmentId,
        adjustedBy: userId,
        previousQty: 1,
        newQty: newQty !== undefined ? Number(newQty) : 1,
        reason: adjReason as "CORRECTION" | "DAMAGED" | "RETURN" | "AUDIT" | "OTHER",
        notes: notes || "",
      },
    });

    // Update equipment status based on reason
    if (adjReason === "DAMAGED") {
      await db.equipment.update({
        where: { id: equipmentId },
        data: { condition: "DAMAGED", repairStatus: "SUBMITTED" },
      });
    } else if (adjReason === "RETURN") {
      await db.equipment.update({
        where: { id: equipmentId },
        data: { status: "IN_STOCK", condition: "GOOD" },
      });
    }

    await auditCreate(req, "StockAdjustment", adjustment.id, { equipmentId, reason: adjReason });
    return NextResponse.json({ adjustment }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Stock adjust error:", error);
    return NextResponse.json({ error: "Failed to create adjustment" }, { status: 500 });
  }
}
