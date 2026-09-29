import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const reason = searchParams.get("reason") || "all";

    const where: Record<string, unknown> = {};
    if (reason !== "all") where.reason = reason;

    const [adjustments, total] = await Promise.all([
      db.stockAdjustment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: { Equipment: { select: { id: true, name: true, category: true, serialNumber: true } } },
      }),
      db.stockAdjustment.count({ where }),
    ]);

    return NextResponse.json({
      items: adjustments.map((a) => ({
        id: a.id,
        equipmentId: a.equipmentId,
        equipment: a.Equipment,
        adjustedBy: a.adjustedBy,
        previousQty: a.previousQty,
        newQty: a.newQty,
        reason: a.reason,
        notes: a.notes,
        createdAt: a.createdAt.toISOString(),
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Adjustments list error:", error);
    return NextResponse.json({ error: "Failed to fetch adjustments" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();
    const { equipmentId, newQty, reason, notes } = body;

    if (!equipmentId) return NextResponse.json({ error: "equipmentId is required" }, { status: 400 });

    const equipment = await db.equipment.findUnique({ where: { id: equipmentId } });
    if (!equipment) return NextResponse.json({ error: "Equipment not found" }, { status: 404 });

    const validReasons = ["CORRECTION", "DAMAGED", "RETURN", "AUDIT", "OTHER"];
    const adjReason = (reason || "CORRECTION").toUpperCase();
    if (!validReasons.includes(adjReason)) {
      return NextResponse.json({ error: `Invalid reason. Must be one of: ${validReasons.join(", ")}` }, { status: 400 });
    }

    const adjustment = await db.stockAdjustment.create({
      data: {
        equipmentId,
        adjustedBy: userId,
        previousQty: equipment.quantity,
        newQty: newQty !== undefined ? Number(newQty) : equipment.quantity,
        reason: adjReason as "CORRECTION" | "DAMAGED" | "RETURN" | "AUDIT" | "OTHER",
        notes: notes || "",
      },
    });

    if (newQty !== undefined && newQty !== equipment.quantity) {
      await db.equipment.update({
        where: { id: equipmentId },
        data: { quantity: Number(newQty) },
      });
    }

    return NextResponse.json({ adjustment }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Adjustment create error:", error);
    return NextResponse.json({ error: "Failed to create adjustment" }, { status: 500 });
  }
}
