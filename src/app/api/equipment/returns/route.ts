import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "all";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));

    const where: Record<string, unknown> = {};
    if (status !== "all") where.status = status;

    const [returns, total] = await Promise.all([
      db.equipmentReturn.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: { Equipment: { select: { id: true, name: true, category: true, serialNumber: true } } },
      }),
      db.equipmentReturn.count({ where }),
    ]);

    return NextResponse.json({
      items: returns.map((r) => ({
        id: r.id,
        equipmentId: r.equipmentId,
        equipment: r.Equipment,
        returnedById: r.returnedById,
        returnDate: r.returnDate.toISOString(),
        condition: r.condition,
        inspectionNotes: r.inspectionNotes,
        status: r.status,
        inspectedById: r.inspectedById,
        createdAt: r.createdAt.toISOString(),
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Returns list error:", error);
    return NextResponse.json({ error: "Failed to fetch returns" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();
    const { equipmentId, condition, inspectionNotes } = body;

    if (!equipmentId) return NextResponse.json({ error: "equipmentId is required" }, { status: 400 });

    const equipment = await db.equipment.findUnique({ where: { id: equipmentId } });
    if (!equipment) return NextResponse.json({ error: "Equipment not found" }, { status: 404 });

    const validConditions = ["GOOD", "FAIR", "POOR"];
    const eqCondition = (condition || "FAIR").toUpperCase();
    if (!validConditions.includes(eqCondition)) {
      return NextResponse.json({ error: `Invalid condition. Must be one of: ${validConditions.join(", ")}` }, { status: 400 });
    }

    const eqReturn = await db.equipmentReturn.create({
      data: {
        equipmentId,
        returnedById: userId,
        condition: eqCondition as "GOOD" | "FAIR" | "POOR",
        inspectionNotes: inspectionNotes || "",
        status: "PENDING_INSPECTION",
      },
    });

    await db.equipment.update({
      where: { id: equipmentId },
      data: { status: "RETURNED" },
    });

    return NextResponse.json({ return: eqReturn }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Return create error:", error);
    return NextResponse.json({ error: "Failed to create return" }, { status: 500 });
  }
}
