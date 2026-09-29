import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/equipment/analytics — equipment analytics data
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    // 1. Category distribution: count of equipment by category
    const categoryData = await db.equipment.groupBy({
      by: ["category"],
      _count: true,
      orderBy: { _count: { id: "desc" } },
    });
    const categoryDistribution = categoryData.map((c) => ({
      category: c.category,
      count: c._count,
    }));

    // 2. Condition status: count by condition
    const conditionData = await db.equipment.groupBy({
      by: ["condition"],
      _count: true,
    });
    const conditionDistribution = conditionData.map((c) => ({
      condition: c.condition,
      count: c._count,
    }));

    // 3. Monthly additions: equipment added per month for last 6 months
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1, 0, 0, 0, 0);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const monthlyData = await db.$queryRaw<
      Array<{ month: string; count: number }>
    >`
      SELECT
        TO_CHAR("createdAt", 'YYYY-MM') as month,
        CAST(COUNT(*) AS int) as count
      FROM "Equipment"
      WHERE "createdAt" >= ${sixMonthsAgo} AND "createdAt" <= ${endOfMonth}
      GROUP BY TO_CHAR("createdAt", 'YYYY-MM')
      ORDER BY month ASC
    `;

    // Fill in missing months
    const monthlyAdditions: Array<{ month: string; label: string; count: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
      const found = monthlyData.find((m) => m.month === monthKey);
      monthlyAdditions.push({
        month: monthKey,
        label,
        count: found ? found.count : 0,
      });
    }

    // 4. Status distribution (for low-stock alerts)
    const statusByCategory = await db.equipment.groupBy({
      by: ["category", "status"],
      _count: true,
    });
    const lowStockData: Record<string, { inStock: number; total: number }> = {};
    for (const row of statusByCategory) {
      if (!lowStockData[row.category]) {
        lowStockData[row.category] = { inStock: 0, total: 0 };
      }
      lowStockData[row.category].total += row._count;
      if (row.status === "IN_STOCK") {
        lowStockData[row.category].inStock = row._count;
      }
    }

    // Total value by category
    const valueByCategory = await db.equipment.groupBy({
      by: ["category"],
      _sum: { purchasePrice: true },
    });

    return NextResponse.json({
      categoryDistribution,
      conditionDistribution,
      monthlyAdditions,
      lowStockData,
      valueByCategory: valueByCategory.map((v) => ({
        category: v.category,
        totalValue: v._sum.purchasePrice || 0,
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Equipment Analytics GET error:", error);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
