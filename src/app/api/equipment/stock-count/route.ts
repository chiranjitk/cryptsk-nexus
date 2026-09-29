import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const location = searchParams.get("location") || "";

    const where: Record<string, unknown> = { status: "IN_STOCK" };
    if (location) where.stockLocation = location;

    const equipment = await db.equipment.groupBy({
      by: ["category", "stockLocation"],
      where,
      _count: { id: true },
      _sum: { purchasePrice: true },
      orderBy: { category: "asc" },
    });

    // Also get total counts
    const totalByCategory = await db.equipment.groupBy({
      by: ["category"],
      where: { status: "IN_STOCK" },
      _count: { id: true },
    });

    return NextResponse.json({
      stockCounts: equipment,
      totalByCategory,
      locations: [...new Set(equipment.map((e) => e.stockLocation).filter(Boolean))],
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Stock count error:", error);
    return NextResponse.json({ error: "Failed to fetch stock count" }, { status: 500 });
  }
}
