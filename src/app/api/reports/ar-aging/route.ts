// GET /api/reports/ar-aging — Accounts-Receivable aging snapshot (Task 2-a)
// Param: asOf (YYYY-MM-DD, default today). Rows: open invoices as of that day.
// Open = balanceAmount > 0 AND status NOT IN [PAID, CANCELLED, CREDIT_NOTE, DRAFT].
// Buckets: notDue | d1_30 | d31_60 | d61_90 | d90plus. Row cap 2000, balance desc.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { csvResponse, generateExportFilename } from "@/lib/export-utils";
import { auditExport } from "@/lib/services/audit-service";

const MAX_ROWS = 2000;
const DAY_MS = 86_400_000;

type BucketKey = "notDue" | "d1_30" | "d31_60" | "d61_90" | "d90plus";
const BUCKET_KEYS: BucketKey[] = ["notDue", "d1_30", "d31_60", "d61_90", "d90plus"];

// ── Helpers ────────────────────────────────────────────────────────

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

function bucketFor(daysOverdue: number): BucketKey {
  if (daysOverdue <= 0) return "notDue";
  if (daysOverdue <= 30) return "d1_30";
  if (daysOverdue <= 60) return "d31_60";
  if (daysOverdue <= 90) return "d61_90";
  return "d90plus";
}

// ── GET ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const now = new Date();

    const asOfDate = parseYmd(searchParams.get("asOf")) ?? new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const asOf = ymd(asOfDate);
    const asOfStart = asOfDate;
    const asOfEnd = endOfDay(asOfDate);

    const invoices = await db.invoice.findMany({
      where: {
        balanceAmount: { gt: 0 },
        status: { notIn: ["PAID", "CANCELLED", "CREDIT_NOTE", "DRAFT"] },
        issueDate: { lte: asOfEnd },
      },
      include: {
        Subscriber: {
          select: { code: true, name: true, phone: true, Area: { select: { name: true } } },
        },
        Plan: { select: { name: true } },
      },
      orderBy: { balanceAmount: "desc" },
      take: MAX_ROWS,
    });

    const buckets: Record<BucketKey, { count: number; total: number }> = {
      notDue: { count: 0, total: 0 },
      d1_30: { count: 0, total: 0 },
      d31_60: { count: 0, total: 0 },
      d61_90: { count: 0, total: 0 },
      d90plus: { count: 0, total: 0 },
    };

    const subscriberIds = new Set<string>();
    let totalOutstanding = 0;

    const mapped = invoices.map((inv) => {
      const due = new Date(inv.dueDate);
      // daysOverdue = floor((asOfEnd - dueDate) / day); 0 when not yet due at asOf
      const rawDays = Math.floor((asOfEnd.getTime() - due.getTime()) / DAY_MS);
      const daysOverdue = due.getTime() >= asOfStart.getTime() ? 0 : Math.max(0, rawDays);
      const bucket = bucketFor(daysOverdue);

      const balance = round2(num(inv.balanceAmount));
      totalOutstanding += balance;
      subscriberIds.add(inv.subscriberId);
      buckets[bucket].count += 1;
      buckets[bucket].total += balance;

      return {
        invoiceNumber: inv.invoiceNumber,
        subscriberCode: inv.Subscriber?.code ?? "",
        subscriberName: inv.Subscriber?.name ?? "",
        phone: inv.Subscriber?.phone ?? "",
        area: inv.Subscriber?.Area?.name ?? "",
        plan: inv.Plan?.name ?? "",
        issueDate: new Date(inv.issueDate).toISOString(),
        dueDate: due.toISOString(),
        daysOverdue,
        grandTotal: round2(num(inv.grandTotal)),
        paidAmount: round2(num(inv.paidAmount)),
        balanceAmount: balance,
        bucket,
        status: inv.status,
      };
    });

    // Round bucket totals
    for (const key of BUCKET_KEYS) buckets[key].total = round2(buckets[key].total);

    const summary = {
      asOf,
      totalOutstanding: round2(totalOutstanding),
      invoiceCount: invoices.length,
      subscriberCount: subscriberIds.size,
      buckets,
    };

    // CSV export branch
    const format = (searchParams.get("format") || "").toLowerCase();
    if (format === "csv") {
      const headers = [
        "Invoice #",
        "Subscriber Code",
        "Subscriber Name",
        "Phone",
        "Area",
        "Plan",
        "Issue Date",
        "Due Date",
        "Days Overdue",
        "Grand Total",
        "Paid",
        "Balance",
        "Bucket",
        "Status",
      ];
      const rows = mapped.map((r) => [
        r.invoiceNumber,
        r.subscriberCode,
        r.subscriberName,
        r.phone,
        r.area,
        r.plan,
        ymd(new Date(r.issueDate)),
        ymd(new Date(r.dueDate)),
        r.daysOverdue,
        r.grandTotal,
        r.paidAmount,
        r.balanceAmount,
        r.bucket,
        r.status,
      ]);
      await auditExport(request, "Invoice", "csv", rows.length);
      return csvResponse(headers, rows, generateExportFilename("ar-aging"));
    }

    return NextResponse.json({
      success: true,
      data: { summary, rows: mapped },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("ar-aging report failed:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to build AR aging report" },
      { status: 500 }
    );
  }
}
