import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const equipmentId = searchParams.get("equipmentId");
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50")));

    const where: Record<string, unknown> = {};
    if (equipmentId) where.equipmentId = equipmentId;

    const adjustments = await db.stockAdjustment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { Equipment: { select: { id: true, name: true, serialNumber: true } } },
    });

    return NextResponse.json({
      history: adjustments.map((a) => ({
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
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Adjustment history error:", error);
    return NextResponse.json({ error: "Failed to fetch adjustment history" }, { status: 500 });
  }
}
