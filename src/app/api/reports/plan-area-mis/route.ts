// GET /api/reports/plan-area-mis — Plan & Area MIS (Task 3-a, Phase 2)
//
// Builds BOTH breakdowns (page tabs switch client-side); `dimension` (plan|area,
// default plan) only controls which rowset CSV/XLSX exports.
//   - subscriber counts per (planId,status) and (areaId,status) via groupBy
//   - newInPeriod: activations (activationDate) in range
//   - revenueInPeriod: invoices issueDate in range, status != CANCELLED,
//     aggregated in JS by the subscriber's planId/areaId (scan capped 5000 —
//     well above register scale; JS aggregation needed for the dimension join)
//   - outstanding: invoices balanceAmount > 0 AND status notIn
//     [PAID, CANCELLED, CREDIT_NOTE, DRAFT], same aggregation
// ARPU = revenueInPeriod / activeSubs (0 when no active subs).
// Doctrine: CANCELLED invoices never enter money totals.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { csvResponse, generateExportFilename } from "@/lib/export-utils";
import { xlsxResponse } from "@/lib/xlsx-export";
import { auditExport } from "@/lib/services/audit-service";

const INVOICE_SCAN_CAP = 5000; // documented cap: JS aggregation over invoice scan

// ── Helpers (per-file copies, Phase 1 doctrine) ────────────────────

/** BigInt/Decimal → Number at the edge. */
function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Validate a YYYY-MM-DD string → Date at local midnight, else null. */
function parseYmd(s: string | null): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Local YYYY-MM-DD for a Date (avoids UTC off-by-one in CSVs). */
function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

type DimAgg = {
  activeSubs: number;
  suspendedSubs: number;
  trialSubs: number;
  totalSubs: number;
  newInPeriod: number;
  revenueInPeriod: number;
  outstanding: number;
};

function newAgg(): DimAgg {
  return { activeSubs: 0, suspendedSubs: 0, trialSubs: 0, totalSubs: 0, newInPeriod: 0, revenueInPeriod: 0, outstanding: 0 };
}

// ── GET ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const now = new Date();

    // Date range — default: last 30 days
    const from =
      parseYmd(searchParams.get("from")) ??
      new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
    const to = endOfDay(
      parseYmd(searchParams.get("to")) ?? new Date(now.getFullYear(), now.getMonth(), now.getDate())
    );

    // dimension controls only which rowset is exported
    const dimension = (searchParams.get("dimension") || "plan").trim().toLowerCase() === "area" ? "area" : "plan";
    const format = (searchParams.get("format") || "").toLowerCase();

    // ── Lookup maps ─────────────────────────────────────────────────
    const [plans, areas] = await Promise.all([
      db.plan.findMany({ select: { id: true, name: true, category: true, priceMonthly: true } }),
      db.area.findMany({ select: { id: true, name: true } }),
    ]);
    const planMap = new Map(plans.map((p) => [p.id, p]));
    const areaMap = new Map(areas.map((a) => [a.id, a]));

    // ── Aggregators keyed by planId / areaId (null → "(Unassigned)") ─
    const byPlanAgg = new Map<string, DimAgg>();
    const byAreaAgg = new Map<string, DimAgg>();
    const UNASSIGNED = "";

    const planAgg = (id: string | null): DimAgg => {
      const key = id ?? UNASSIGNED;
      let a = byPlanAgg.get(key);
      if (!a) {
        a = newAgg();
        byPlanAgg.set(key, a);
      }
      return a;
    };
    const areaAgg = (id: string | null): DimAgg => {
      const key = id ?? UNASSIGNED;
      let a = byAreaAgg.get(key);
      if (!a) {
        a = newAgg();
        byAreaAgg.set(key, a);
      }
      return a;
    };

    // ── 1. Subscriber counts per (dim, status) ──────────────────────
    const [planStatusGroups, areaStatusGroups] = await Promise.all([
      db.subscriber.groupBy({ by: ["planId", "status"], _count: { _all: true } }),
      db.subscriber.groupBy({ by: ["areaId", "status"], _count: { _all: true } }),
    ]);
    for (const g of planStatusGroups) {
      const a = planAgg(g.planId);
      const c = g._count._all;
      a.totalSubs += c;
      if (g.status === "ACTIVE") a.activeSubs += c;
      else if (g.status === "SUSPENDED") a.suspendedSubs += c;
      else if (g.status === "TRIAL") a.trialSubs += c;
    }
    for (const g of areaStatusGroups) {
      const a = areaAgg(g.areaId);
      const c = g._count._all;
      a.totalSubs += c;
      if (g.status === "ACTIVE") a.activeSubs += c;
      else if (g.status === "SUSPENDED") a.suspendedSubs += c;
      else if (g.status === "TRIAL") a.trialSubs += c;
    }

    // ── 2. New activations in period ────────────────────────────────
    const [newByPlan, newByArea] = await Promise.all([
      db.subscriber.groupBy({
        by: ["planId"],
        _count: { _all: true },
        where: { activationDate: { gte: from, lte: to } },
      }),
      db.subscriber.groupBy({
        by: ["areaId"],
        _count: { _all: true },
        where: { activationDate: { gte: from, lte: to } },
      }),
    ]);
    for (const g of newByPlan) planAgg(g.planId).newInPeriod += g._count._all;
    for (const g of newByArea) areaAgg(g.areaId).newInPeriod += g._count._all;

    // ── 3. Revenue in period (invoice scan, JS aggregation) ────────
    const [revInvoices, outInvoices] = await Promise.all([
      db.invoice.findMany({
        where: { issueDate: { gte: from, lte: to }, status: { not: "CANCELLED" } },
        select: { grandTotal: true, Subscriber: { select: { planId: true, areaId: true } } },
        take: INVOICE_SCAN_CAP,
      }),
      db.invoice.findMany({
        where: {
          balanceAmount: { gt: 0 },
          status: { notIn: ["PAID", "CANCELLED", "CREDIT_NOTE", "DRAFT"] },
        },
        select: { balanceAmount: true, Subscriber: { select: { planId: true, areaId: true } } },
        take: INVOICE_SCAN_CAP,
      }),
    ]);
    for (const inv of revInvoices) {
      planAgg(inv.Subscriber?.planId ?? null).revenueInPeriod += num(inv.grandTotal);
      areaAgg(inv.Subscriber?.areaId ?? null).revenueInPeriod += num(inv.grandTotal);
    }
    for (const inv of outInvoices) {
      planAgg(inv.Subscriber?.planId ?? null).outstanding += num(inv.balanceAmount);
      areaAgg(inv.Subscriber?.areaId ?? null).outstanding += num(inv.balanceAmount);
    }

    // ── Build rowsets ───────────────────────────────────────────────
    type PlanRow = {
      planId: string | null;
      plan: string;
      category: string;
      priceMonthly: number;
      activeSubs: number;
      suspendedSubs: number;
      trialSubs: number;
      totalSubs: number;
      newInPeriod: number;
      revenueInPeriod: number;
      outstanding: number;
      arpu: number;
    };
    const byPlan: PlanRow[] = [];
    for (const [id, a] of byPlanAgg) {
      const p = id ? planMap.get(id) : undefined;
      byPlan.push({
        planId: id || null,
        plan: p?.name ?? (id ? "(Unknown Plan)" : "(Unassigned)"),
        category: p?.category ?? "",
        priceMonthly: round2(num(p?.priceMonthly)),
        activeSubs: a.activeSubs,
        suspendedSubs: a.suspendedSubs,
        trialSubs: a.trialSubs,
        totalSubs: a.totalSubs,
        newInPeriod: a.newInPeriod,
        revenueInPeriod: round2(a.revenueInPeriod),
        outstanding: round2(a.outstanding),
        arpu: a.activeSubs > 0 ? round2(a.revenueInPeriod / a.activeSubs) : 0,
      });
    }
    byPlan.sort((x, y) => y.revenueInPeriod - x.revenueInPeriod);

    type AreaRow = {
      areaId: string | null;
      area: string;
      activeSubs: number;
      suspendedSubs: number;
      trialSubs: number;
      totalSubs: number;
      newInPeriod: number;
      revenueInPeriod: number;
      outstanding: number;
      arpu: number;
    };
    const byArea: AreaRow[] = [];
    for (const [id, a] of byAreaAgg) {
      const ar = id ? areaMap.get(id) : undefined;
      byArea.push({
        areaId: id || null,
        area: ar?.name ?? (id ? "(Unknown Area)" : "(Unassigned)"),
        activeSubs: a.activeSubs,
        suspendedSubs: a.suspendedSubs,
        trialSubs: a.trialSubs,
        totalSubs: a.totalSubs,
        newInPeriod: a.newInPeriod,
        revenueInPeriod: round2(a.revenueInPeriod),
        outstanding: round2(a.outstanding),
        arpu: a.activeSubs > 0 ? round2(a.revenueInPeriod / a.activeSubs) : 0,
      });
    }
    byArea.sort((x, y) => y.revenueInPeriod - x.revenueInPeriod);

    const summary = {
      from: ymd(from),
      to: ymd(to),
      totals: {
        activeSubs: byPlan.reduce((s, r) => s + r.activeSubs, 0),
        revenueInPeriod: round2(byPlan.reduce((s, r) => s + r.revenueInPeriod, 0)),
        outstanding: round2(byPlan.reduce((s, r) => s + r.outstanding, 0)),
      },
      topPlan: byPlan.length > 0 ? { name: byPlan[0].plan, revenue: byPlan[0].revenueInPeriod } : null,
      topArea: byArea.length > 0 ? { name: byArea[0].area, revenue: byArea[0].revenueInPeriod } : null,
      planCount: plans.length,
      areaCount: areas.length,
    };

    // CSV / XLSX export branch — exports the `dimension` rowset
    if (format === "csv" || format === "xlsx") {
      let headers: string[];
      let exportRows: (string | number)[][];
      if (dimension === "area") {
        headers = [
          "Area",
          "Active",
          "Suspended",
          "Trial",
          "Total",
          "New In Period",
          "Revenue In Period",
          "Outstanding",
          "ARPU",
        ];
        exportRows = byArea.map((r) => [
          r.area,
          r.activeSubs,
          r.suspendedSubs,
          r.trialSubs,
          r.totalSubs,
          r.newInPeriod,
          r.revenueInPeriod,
          r.outstanding,
          r.arpu,
        ]);
      } else {
        headers = [
          "Plan",
          "Category",
          "Monthly Price",
          "Active",
          "Suspended",
          "Trial",
          "Total",
          "New In Period",
          "Revenue In Period",
          "Outstanding",
          "ARPU",
        ];
        exportRows = byPlan.map((r) => [
          r.plan,
          r.category,
          r.priceMonthly,
          r.activeSubs,
          r.suspendedSubs,
          r.trialSubs,
          r.totalSubs,
          r.newInPeriod,
          r.revenueInPeriod,
          r.outstanding,
          r.arpu,
        ]);
      }
      await auditExport(request, "PlanAreaMIS", format, exportRows.length);
      const filename = generateExportFilename(`plan-area-mis-${dimension}`, format);
      return format === "xlsx"
        ? xlsxResponse(headers, exportRows, filename)
        : csvResponse(headers, exportRows, filename);
    }

    return NextResponse.json({
      success: true,
      data: { summary, byPlan, byArea },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("plan-area-mis report failed:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to build plan & area MIS" },
      { status: 500 }
    );
  }
}
