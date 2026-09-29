import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { auditLog } from "@/lib/services/audit-service";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate") || "";
    const endDate = searchParams.get("endDate") || "";
    const category = searchParams.get("category") || "";

    const where: Record<string, unknown> = {};
    if (startDate && endDate) {
      where.date = { gte: new Date(startDate), lte: new Date(endDate) };
    } else if (startDate) {
      where.date = { gte: new Date(startDate) };
    } else if (endDate) {
      where.date = { lte: new Date(endDate) };
    }
    if (category) where.category = category;

    const expenses = await db.expense.findMany({
      where,
      orderBy: { date: "desc" },
    });

    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const categoryBreakdown: Record<string, number> = {};
    for (const exp of expenses) {
      categoryBreakdown[exp.category] = (categoryBreakdown[exp.category] || 0) + exp.amount;
    }

    return NextResponse.json({
      expenses,
      summary: {
        total: Math.round(totalExpenses),
        count: expenses.length,
        byCategory: categoryBreakdown,
      },
    });
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Expenses API error:", error);
    return NextResponse.json({ error: "Failed to fetch expenses" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req);
    const body = await req.json();
    const { description, category, amount, date } = body;

    if (!description || !amount || !date) {
      return NextResponse.json({ error: "Description, amount, and date are required" }, { status: 400 });
    }

    const validCategories = ["salary", "equipment", "bandwidth", "marketing", "maintenance", "other"];
    if (category && !validCategories.includes(category)) {
      return NextResponse.json({ error: `Invalid category. Must be one of: ${validCategories.join(", ")}` }, { status: 400 });
    }

    const expense = await db.expense.create({
      data: {
        description,
        category: category || "other",
        amount: Number(amount),
        date: new Date(date),
        createdBy: userId,
      },
    });

    await auditLog(req, "CREATE", "Expense", expense.id, { details: { description, category, amount, date }, userId });
    return NextResponse.json({ success: true, expense });
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode === 401) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Expenses POST error:", error);
    return NextResponse.json({ error: "Failed to create expense" }, { status: 500 });
  }
}
