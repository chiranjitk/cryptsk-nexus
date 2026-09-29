import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const warehouses = await db.warehouse.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      include: {
        Equipment: { select: { id: true, category: true, status: true } },
      },
    });

    const summary = warehouses.map((w) => {
      const cats: Record<string, number> = {};
      const statuses: Record<string, number> = {};
      for (const eq of w.Equipment) {
        cats[eq.category] = (cats[eq.category] || 0) + 1;
        statuses[eq.status] = (statuses[eq.status] || 0) + 1;
      }
      return {
        id: w.id,
        name: w.name,
        city: w.city,
        state: w.state,
        isDefault: w.isDefault,
        totalItems: w.Equipment.length,
        categoryBreakdown: cats,
        statusBreakdown: statuses,
      };
    });

    return NextResponse.json({ summary });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Warehouse summary error:", error);
    return NextResponse.json({ error: "Failed to fetch warehouse summary" }, { status: 500 });
  }
}
