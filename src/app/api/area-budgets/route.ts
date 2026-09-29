import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ============================================================
// Zone Budget Limits — Area Budget Management
// ============================================================

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = req.nextUrl;
    const action = searchParams.get("action");

    // ── List all budget limits ─────────────────────────────
    if (action === "list") {
      const cycleStartDate = searchParams.get("cycleStartDate");
      const areaId = searchParams.get("areaId");
      const page = parseInt(searchParams.get("page") || "1");
      const limit = parseInt(searchParams.get("limit") || "25");

      const where: Record<string, unknown> = {};

      if (areaId) {
        where.areaId = areaId;
      }
      if (cycleStartDate) {
        const start = new Date(cycleStartDate);
        where.cycleStartDate = { gte: start };
      }

      const [budgetLimits, total] = await Promise.all([
        db.areaBudgetLimit.findMany({
          where,
          include: {
            Area: {
              select: { id: true, name: true, code: true },
            },
          },
          orderBy: { cycleStartDate: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        db.areaBudgetLimit.count({ where }),
      ]);

      // Enrich with usage percentage
      const enriched = budgetLimits.map((bl) => {
        const usagePercent =
          bl.allottedAmount > 0 ? (bl.usedAmount / bl.allottedAmount) * 100 : 0;
        return {
          ...bl,
          usagePercent: Math.round(usagePercent * 100) / 100,
          isOverBudget: bl.usedAmount > bl.allottedAmount,
          isNearAlert:
            bl.alertThreshold > 0 &&
            bl.allottedAmount > 0 &&
            usagePercent >= bl.alertThreshold,
        };
      });

      return NextResponse.json({ budgetLimits: enriched, total, page, limit });
    }

    // ── Get budget limits for a specific area ──────────────
    if (action === "area") {
      const areaId = searchParams.get("areaId");
      if (!areaId) {
        return NextResponse.json({ error: "Missing required parameter: areaId" }, { status: 400 });
      }

      const area = await db.area.findUnique({
        where: { id: areaId },
        select: { id: true, name: true, code: true },
      });

      if (!area) {
        return NextResponse.json({ error: "Area not found" }, { status: 404 });
      }

      const budgetLimits = await db.areaBudgetLimit.findMany({
        where: { areaId },
        orderBy: { cycleStartDate: "desc" },
      });

      const enriched = budgetLimits.map((bl) => {
        const usagePercent =
          bl.allottedAmount > 0 ? (bl.usedAmount / bl.allottedAmount) * 100 : 0;
        return {
          ...bl,
          usagePercent: Math.round(usagePercent * 100) / 100,
          isOverBudget: bl.usedAmount > bl.allottedAmount,
        };
      });

      return NextResponse.json({ area, budgetLimits: enriched });
    }

    // ── Check all areas for budget threshold alerts ────────
    if (action === "alert-check") {
      const allBudgets = await db.areaBudgetLimit.findMany({
        where: { status: "active" },
        include: {
          Area: {
            select: { id: true, name: true, code: true },
          },
        },
        orderBy: { cycleStartDate: "desc" },
      });

      const alerts: Array<{
        id: string;
        areaId: string;
        areaName: string;
        areaCode: string;
        cycleType: string;
        allottedAmount: number;
        usedAmount: number;
        usagePercent: number;
        alertThreshold: number;
        isOverBudget: boolean;
      }> = [];

      for (const bl of allBudgets) {
        if (bl.allottedAmount <= 0) continue;

        const usagePercent = (bl.usedAmount / bl.allottedAmount) * 100;

        if (usagePercent >= bl.alertThreshold || bl.usedAmount > bl.allottedAmount) {
          alerts.push({
            id: bl.id,
            areaId: bl.areaId,
            areaName: bl.Area.name,
            areaCode: bl.Area.code,
            cycleType: bl.cycleType,
            allottedAmount: bl.allottedAmount,
            usedAmount: bl.usedAmount,
            usagePercent: Math.round(usagePercent * 100) / 100,
            alertThreshold: bl.alertThreshold,
            isOverBudget: bl.usedAmount > bl.allottedAmount,
          });
        }
      }

      // Sort by severity: over-budget first, then highest usage
      alerts.sort((a, b) => {
        if (a.isOverBudget !== b.isOverBudget) return a.isOverBudget ? -1 : 1;
        return b.usagePercent - a.usagePercent;
      });

      return NextResponse.json({
        alerts,
        totalAlerts: alerts.length,
        overBudgetCount: alerts.filter((a) => a.isOverBudget).length,
      });
    }

    return NextResponse.json(
      { error: "Invalid action. Use: list, area, alert-check" },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Area Budgets GET error:", error);
    return NextResponse.json({ error: "Failed to fetch budget data" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = req.nextUrl;
    const action = searchParams.get("action");
    const body = await req.json();

    // ── Create budget limit ────────────────────────────────
    if (action === "create") {
      const { areaId, cycleType, allottedAmount, cycleStartDate, alertThreshold } = body;

      if (!areaId || !cycleStartDate) {
        return NextResponse.json(
          { error: "Missing required fields: areaId, cycleStartDate" },
          { status: 400 }
        );
      }

      // Verify area exists
      const area = await db.area.findUnique({ where: { id: areaId } });
      if (!area) {
        return NextResponse.json({ error: "Area not found" }, { status: 404 });
      }

      // Check for overlapping cycle for same area
      const start = new Date(cycleStartDate);
      const existingCycle = await db.areaBudgetLimit.findFirst({
        where: {
          areaId,
          status: "active",
        },
        orderBy: { cycleStartDate: "desc" },
      });

      if (existingCycle) {
        return NextResponse.json(
          {
            error:
              "An active budget cycle already exists for this area. Reset or close the existing cycle first.",
            existingBudgetId: existingCycle.id,
          },
          { status: 409 }
        );
      }

      const budgetLimit = await db.areaBudgetLimit.create({
        data: {
          areaId,
          cycleType: cycleType || "MONTHLY",
          allottedAmount: allottedAmount ?? 0,
          usedAmount: 0,
          cycleStartDate: start,
          alertThreshold: alertThreshold ?? 80,
          status: "active",
        },
        include: {
          Area: { select: { id: true, name: true, code: true } },
        },
      });

      return NextResponse.json({ budgetLimit }, { status: 201 });
    }

    // ── Update usage ───────────────────────────────────────
    if (action === "update") {
      const { id, usedAmount } = body;

      if (!id) {
        return NextResponse.json({ error: "Missing required field: id" }, { status: 400 });
      }

      const existing = await db.areaBudgetLimit.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json({ error: "Budget limit not found" }, { status: 404 });
      }

      if (existing.status !== "active") {
        return NextResponse.json(
          { error: `Cannot update usage for a ${existing.status} budget cycle.` },
          { status: 400 }
        );
      }

      const budgetLimit = await db.areaBudgetLimit.update({
        where: { id },
        data: {
          usedAmount: usedAmount ?? 0,
        },
        include: {
          Area: { select: { id: true, name: true, code: true } },
        },
      });

      const usagePercent =
        budgetLimit.allottedAmount > 0
          ? (budgetLimit.usedAmount / budgetLimit.allottedAmount) * 100
          : 0;

      return NextResponse.json({
        budgetLimit,
        usagePercent: Math.round(usagePercent * 100) / 100,
        isOverBudget: budgetLimit.usedAmount > budgetLimit.allottedAmount,
        isNearAlert: usagePercent >= budgetLimit.alertThreshold,
      });
    }

    // ── Reset cycle ────────────────────────────────────────
    if (action === "reset-cycle") {
      const { id } = body;

      if (!id) {
        return NextResponse.json({ error: "Missing required field: id" }, { status: 400 });
      }

      const existing = await db.areaBudgetLimit.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json({ error: "Budget limit not found" }, { status: 404 });
      }

      // Close the old cycle
      await db.areaBudgetLimit.update({
        where: { id },
        data: {
          status: "closed",
          cycleEndDate: new Date(),
        },
      });

      // Create new cycle with same settings, reset usage
      const newCycle = await db.areaBudgetLimit.create({
        data: {
          areaId: existing.areaId,
          cycleType: existing.cycleType,
          allottedAmount: existing.allottedAmount,
          usedAmount: 0,
          cycleStartDate: new Date(),
          alertThreshold: existing.alertThreshold,
          status: "active",
        },
        include: {
          Area: { select: { id: true, name: true, code: true } },
        },
      });

      return NextResponse.json({
        oldCycleId: id,
        newCycle,
      });
    }

    return NextResponse.json(
      { error: "Invalid action. Use: create, update, reset-cycle" },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Area Budgets POST error:", error);
    return NextResponse.json({ error: "Failed to process budget request" }, { status: 500 });
  }
}
