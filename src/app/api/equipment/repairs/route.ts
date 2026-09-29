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

    const [repairs, total] = await Promise.all([
      db.equipmentRepair.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: { Equipment: { select: { id: true, name: true, category: true, serialNumber: true } } },
      }),
      db.equipmentRepair.count({ where }),
    ]);

    return NextResponse.json({
      items: repairs.map((r) => ({
        id: r.id,
        equipmentId: r.equipmentId,
        equipment: r.Equipment,
        reportedIssue: r.reportedIssue,
        repairType: r.repairType,
        estimatedCost: r.estimatedCost,
        actualCost: r.actualCost,
        status: r.status,
        repairNotes: r.repairNotes,
        assignedTo: r.assignedTo,
        startedAt: r.startedAt?.toISOString() || null,
        completedAt: r.completedAt?.toISOString() || null,
        createdAt: r.createdAt.toISOString(),
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Repairs list error:", error);
    return NextResponse.json({ error: "Failed to fetch repairs" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();
    const { equipmentId, reportedIssue, repairType, estimatedCost, repairNotes } = body;

    if (!equipmentId) return NextResponse.json({ error: "equipmentId is required" }, { status: 400 });

    const equipment = await db.equipment.findUnique({ where: { id: equipmentId } });
    if (!equipment) return NextResponse.json({ error: "Equipment not found" }, { status: 404 });

    const validTypes = ["HARDWARE", "FIRMWARE", "PHYSICAL", "ELECTRICAL", "OTHER"];
    const eqType = (repairType || "HARDWARE").toUpperCase();
    if (!validTypes.includes(eqType)) {
      return NextResponse.json({ error: `Invalid repair type. Must be one of: ${validTypes.join(", ")}` }, { status: 400 });
    }

    const repair = await db.equipmentRepair.create({
      data: {
        equipmentId,
        reportedIssue: reportedIssue || "",
        repairType: eqType as "HARDWARE" | "FIRMWARE" | "PHYSICAL" | "ELECTRICAL" | "OTHER",
        estimatedCost: Number(estimatedCost) || 0,
        repairNotes: repairNotes || "",
        assignedTo: userId,
      },
    });

    await db.equipment.update({
      where: { id: equipmentId },
      data: { condition: "DAMAGED", repairStatus: "SUBMITTED" },
    });

    return NextResponse.json({ repair }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Repair create error:", error);
    return NextResponse.json({ error: "Failed to create repair" }, { status: 500 });
  }
}
