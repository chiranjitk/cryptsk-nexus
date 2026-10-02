// GET /api/reports/collection-register — Collection Register (Task 3-a, Phase 2)
// Params: from,to (YYYY-MM-DD, default MTD) | mode (PaymentMode, optional) |
//         status (comma list, default "VERIFIED", validated against PaymentStatus) |
//         areaId | collectorId | q (receiptNumber/transactionRef/Subscriber code+name contains)
// Rows: payments createdAt desc, cap 2000. byMode/byStatus computed over returned rows.
// Doctrine: summaries describe RETURNED rows (status filter shapes both).

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { Prisma, type PaymentMode, type PaymentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { csvResponse, generateExportFilename } from "@/lib/export-utils";
import { xlsxResponse } from "@/lib/xlsx-export";
import { pdfResponse } from "@/lib/pdf-export";
import { auditExport } from "@/lib/services/audit-service";

const MAX_ROWS = 2000;

const VALID_MODES: PaymentMode[] = ["CASH", "UPI", "ONLINE", "BANK_TRANSFER", "CHEQUE", "WALLET"];
const VALID_STATUSES: PaymentStatus[] = ["PENDING", "VERIFIED", "FAILED", "REFUNDED"];

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

// ── GET ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { userId } = await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const now = new Date();

    // Date range — default: first of current month → today (end-of-day inclusive)
    const from = parseYmd(searchParams.get("from")) ?? new Date(now.getFullYear(), now.getMonth(), 1);
    const to = endOfDay(
      parseYmd(searchParams.get("to")) ?? new Date(now.getFullYear(), now.getMonth(), now.getDate())
    );

    // mode — single PaymentMode token; invalid → ignored (Prisma would 500 on a bad enum)
    const modeParam = (searchParams.get("mode") || "").trim().toUpperCase();
    const mode: PaymentMode | null = (VALID_MODES as string[]).includes(modeParam)
      ? (modeParam as PaymentMode)
      : null;

    // status — comma list validated against PaymentStatus; default VERIFIED.
    // Invalid tokens are ignored (Phase 1 doctrine). If the caller passes ONLY
    // invalid tokens, no status filter is applied (all statuses returned).
    const statusParam = searchParams.get("status");
    const statuses: PaymentStatus[] = statusParam
      ? statusParam
          .split(",")
          .map((s) => s.trim().toUpperCase())
          .filter((s): s is PaymentStatus => (VALID_STATUSES as string[]).includes(s))
      : ["VERIFIED"];

    const areaId = (searchParams.get("areaId") || "").trim();
    const collectorId = (searchParams.get("collectorId") || "").trim();
    const q = (searchParams.get("q") || "").trim();

    const where: Prisma.PaymentWhereInput = {
      createdAt: { gte: from, lte: to },
    };
    if (statuses.length > 0) where.status = { in: statuses };
    if (mode) where.paymentMode = mode;
    if (areaId) where.Subscriber = { areaId };
    if (collectorId) where.collectedById = collectorId;
    if (q) {
      where.OR = [
        { receiptNumber: { contains: q, mode: "insensitive" } },
        { transactionRef: { contains: q, mode: "insensitive" } },
        { Subscriber: { code: { contains: q, mode: "insensitive" } } },
        { Subscriber: { name: { contains: q, mode: "insensitive" } } },
      ];
    }

    const payments = await db.payment.findMany({
      where,
      include: {
        Subscriber: { select: { code: true, name: true, Area: { select: { name: true } } } },
        Invoice: { select: { invoiceNumber: true } },
        User_Payment_collectedByIdToUser: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_ROWS,
    });

    const rows = payments.map((p) => ({
      subscriberId: p.subscriberId,
      receiptNumber: p.receiptNumber,
      paymentDate: new Date(p.createdAt).toISOString(),
      subscriberCode: p.Subscriber?.code ?? "",
      name: p.Subscriber?.name ?? "",
      area: p.Subscriber?.Area?.name ?? "",
      invoiceNumber: p.Invoice?.invoiceNumber ?? "",
      amount: round2(num(p.amount)),
      paymentMode: p.paymentMode,
      status: p.status,
      collectedBy: p.User_Payment_collectedByIdToUser?.name ?? "",
      transactionRef: p.transactionRef,
      notes: p.notes,
    }));

    // Summary over returned rows
    const subscriberIds = new Set<string>();
    let totalCollected = 0;
    const byMode: Record<string, { count: number; total: number }> = {};
    const byStatus: Record<string, { count: number; total: number }> = {};
    for (const r of rows) {
      totalCollected += r.amount;
      subscriberIds.add(r.subscriberCode);
      if (!byMode[r.paymentMode]) byMode[r.paymentMode] = { count: 0, total: 0 };
      byMode[r.paymentMode].count += 1;
      byMode[r.paymentMode].total += r.amount;
      if (!byStatus[r.status]) byStatus[r.status] = { count: 0, total: 0 };
      byStatus[r.status].count += 1;
      byStatus[r.status].total += r.amount;
    }
    for (const m of Object.values(byMode)) m.total = round2(m.total);
    for (const s of Object.values(byStatus)) s.total = round2(s.total);

    const summary = {
      from: ymd(from),
      to: ymd(to),
      totalCollected: round2(totalCollected),
      paymentCount: rows.length,
      uniqueSubscribers: subscriberIds.size,
      byMode,
      byStatus,
    };

    // CSV / XLSX / PDF export branch
    const format = (searchParams.get("format") || "").toLowerCase();
    if (format === "csv" || format === "xlsx" || format === "pdf") {
      const headers = [
        "Receipt #",
        "Date",
        "Subscriber Code",
        "Name",
        "Area",
        "Invoice #",
        "Amount",
        "Mode",
        "Status",
        "Collected By",
        "Transaction Ref",
        "Notes",
      ];
      const exportRows: (string | number)[][] = rows.map((r) => [
        r.receiptNumber,
        ymd(new Date(r.paymentDate)),
        r.subscriberCode,
        r.name,
        r.area,
        r.invoiceNumber,
        r.amount,
        r.paymentMode,
        r.status,
        r.collectedBy,
        r.transactionRef,
        r.notes,
      ]);
      await auditExport(request, "Payment", format, exportRows.length);
      const filename = generateExportFilename("collection-register", format);
      return format === "xlsx"
        ? xlsxResponse(headers, exportRows, filename)
        : format === "pdf"
          ? pdfResponse(headers, exportRows, filename, {
              title: "Collection Register",
              subtitle: `Period ${ymd(from)} → ${ymd(to)}${mode ? ` · Mode: ${mode}` : ""} · Status: ${statuses.length ? statuses.join(", ") : "ALL"}`,
            })
          : csvResponse(headers, exportRows, filename);
    }

    return NextResponse.json({
      success: true,
      data: { summary, rows },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("collection-register report failed:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to build collection register" },
      { status: 500 }
    );
  }
}
