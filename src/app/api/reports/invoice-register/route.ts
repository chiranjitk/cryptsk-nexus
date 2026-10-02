// GET /api/reports/invoice-register — Invoice Register report (Task 2-a)
// Filters: from,to (YYYY-MM-DD) | status (comma list) | planId | areaId | q | limit
// Default range: first-of-current-month → today. Row cap: ≤2000.
// Money totals EXCLUDE CANCELLED invoices (doctrine: CANCELLED never enters money totals).

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { Prisma, type InvoiceStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { csvResponse, generateExportFilename } from "@/lib/export-utils";
import { xlsxResponse } from "@/lib/xlsx-export";
import { auditExport } from "@/lib/services/audit-service";

const VALID_STATUSES: InvoiceStatus[] = [
  "DRAFT",
  "SENT",
  "PAID",
  "PARTIALLY_PAID",
  "OVERDUE",
  "CANCELLED",
  "CREDIT_NOTE",
];

const MAX_ROWS = 2000;

// ── Helpers ────────────────────────────────────────────────────────

/** BigInt/Decimal → Number at the edge (schema uses Float, but stay defensive). */
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

// ── GET ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const now = new Date();

    // Date range — default: first of current month → today (end-of-day inclusive)
    const from =
      parseYmd(searchParams.get("from")) ??
      new Date(now.getFullYear(), now.getMonth(), 1);
    const to = endOfDay(
      parseYmd(searchParams.get("to")) ?? new Date(now.getFullYear(), now.getMonth(), now.getDate())
    );

    // status=SENT,OVERDUE → subset of InvoiceStatus (invalid tokens ignored)
    const statuses: InvoiceStatus[] = (searchParams.get("status") || "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s): s is InvoiceStatus => (VALID_STATUSES as string[]).includes(s));

    const planId = searchParams.get("planId") || "";
    const areaId = searchParams.get("areaId") || "";
    const q = (searchParams.get("q") || "").trim();

    // limit — default 500, hard cap 2000
    const limitRaw = parseInt(searchParams.get("limit") || "500", 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), MAX_ROWS) : 500;

    // Build where clause
    const where: Prisma.InvoiceWhereInput = {
      issueDate: { gte: from, lte: to },
    };
    if (statuses.length > 0) where.status = { in: statuses };
    if (planId) where.planId = planId;
    if (areaId) where.Subscriber = { areaId };
    if (q) {
      where.OR = [
        { invoiceNumber: { contains: q, mode: "insensitive" } },
        { Subscriber: { code: { contains: q, mode: "insensitive" } } },
        { Subscriber: { name: { contains: q, mode: "insensitive" } } },
      ];
    }

    const invoices = await db.invoice.findMany({
      where,
      include: {
        Subscriber: {
          select: { code: true, name: true, phone: true, Area: { select: { name: true } } },
        },
        Plan: { select: { name: true } },
      },
      orderBy: { issueDate: "desc" },
      take: limit,
    });

    // Summary — computed over the returned rows; CANCELLED never enters money totals
    let totalBilled = 0;
    let totalPaid = 0;
    let totalOutstanding = 0;
    let cancelledCount = 0;
    for (const inv of invoices) {
      if (inv.status === "CANCELLED") {
        cancelledCount += 1;
        continue;
      }
      totalBilled += num(inv.grandTotal);
      totalPaid += num(inv.paidAmount);
      totalOutstanding += num(inv.balanceAmount);
    }
    const summary = {
      count: invoices.length,
      totalBilled: round2(totalBilled),
      totalPaid: round2(totalPaid),
      totalOutstanding: round2(totalOutstanding),
      cancelledCount,
    };

    // CSV export branch
    const format = (searchParams.get("format") || "").toLowerCase();
    if (format === "csv") {
      const headers = [
        "Invoice #",
        "Issue Date",
        "Due Date",
        "Subscriber Code",
        "Subscriber Name",
        "Phone",
        "Area",
        "Plan",
        "Subtotal",
        "CGST",
        "SGST",
        "Grand Total",
        "Paid",
        "Balance",
        "Status",
      ];
      const rows = invoices.map((inv) => [
        inv.invoiceNumber,
        ymd(new Date(inv.issueDate)),
        ymd(new Date(inv.dueDate)),
        inv.Subscriber?.code ?? "",
        inv.Subscriber?.name ?? "",
        inv.Subscriber?.phone ?? "",
        inv.Subscriber?.Area?.name ?? "",
        inv.Plan?.name ?? "",
        round2(num(inv.subtotal)),
        round2(num(inv.cgstAmount)),
        round2(num(inv.sgstAmount)),
        round2(num(inv.grandTotal)),
        round2(num(inv.paidAmount)),
        round2(num(inv.balanceAmount)),
        inv.status,
      ]);
      await auditExport(request, "Invoice", "csv", rows.length);
      return csvResponse(headers, rows, generateExportFilename("invoice-register"));
    }

    // XLSX export branch (Phase 2, Task 3-a) — mirrors the CSV branch above
    if (format === "xlsx") {
      const headers = [
        "Invoice #",
        "Issue Date",
        "Due Date",
        "Subscriber Code",
        "Subscriber Name",
        "Phone",
        "Area",
        "Plan",
        "Subtotal",
        "CGST",
        "SGST",
        "Grand Total",
        "Paid",
        "Balance",
        "Status",
      ];
      const rows = invoices.map((inv) => [
        inv.invoiceNumber,
        ymd(new Date(inv.issueDate)),
        ymd(new Date(inv.dueDate)),
        inv.Subscriber?.code ?? "",
        inv.Subscriber?.name ?? "",
        inv.Subscriber?.phone ?? "",
        inv.Subscriber?.Area?.name ?? "",
        inv.Plan?.name ?? "",
        round2(num(inv.subtotal)),
        round2(num(inv.cgstAmount)),
        round2(num(inv.sgstAmount)),
        round2(num(inv.grandTotal)),
        round2(num(inv.paidAmount)),
        round2(num(inv.balanceAmount)),
        inv.status,
      ]);
      await auditExport(request, "Invoice", "xlsx", rows.length);
      return xlsxResponse(headers, rows, generateExportFilename("invoice-register", "xlsx"));
    }

    // JSON response — dates as ISO strings
    return NextResponse.json({
      success: true,
      data: {
        summary,
        rows: invoices.map((inv) => ({
          invoiceNumber: inv.invoiceNumber,
          issueDate: new Date(inv.issueDate).toISOString(),
          dueDate: new Date(inv.dueDate).toISOString(),
          subscriberCode: inv.Subscriber?.code ?? "",
          subscriberName: inv.Subscriber?.name ?? "",
          phone: inv.Subscriber?.phone ?? "",
          area: inv.Subscriber?.Area?.name ?? "",
          plan: inv.Plan?.name ?? "",
          subtotal: round2(num(inv.subtotal)),
          cgst: round2(num(inv.cgstAmount)),
          sgst: round2(num(inv.sgstAmount)),
          grandTotal: round2(num(inv.grandTotal)),
          paidAmount: round2(num(inv.paidAmount)),
          balanceAmount: round2(num(inv.balanceAmount)),
          status: inv.status,
        })),
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("invoice-register report failed:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to build invoice register report" },
      { status: 500 }
    );
  }
}
