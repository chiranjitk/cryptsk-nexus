// GET /api/reports/side-revenue — Side Revenue report (Task 3-a, Phase 2)
//
// UNION-OF-SOURCES doctrine (until ledger wiring lands):
//   TOPUP  — SubscriberTopUp (purchasedAt in range, status != CANCELLED);
//            amount = usedAmount + remainingAmount; item = product name; type = product type.
//   VOUCHER— Voucher (usedAt in range, status = USED);
//            amount = denomination; item = voucher code; type = "VOUCHER".
//   ADDON  — SubscriberAddOn (startDate in range, status != CANCELLED);
//            amount = chargeAmount; item = service name; type = chargeType.
// Params: from,to (YYYY-MM-DD, default last 30 days) | source (ALL|TOPUP|VOUCHER|ADDON, default ALL)
// Each source query capped at 2000; merged rows sorted date desc.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { csvResponse, generateExportFilename } from "@/lib/export-utils";
import { xlsxResponse } from "@/lib/xlsx-export";
import { pdfResponse } from "@/lib/pdf-export";
import { auditExport } from "@/lib/services/audit-service";

const MAX_ROWS = 2000;
const DAY_MS = 86_400_000;

const SOURCES = ["ALL", "TOPUP", "VOUCHER", "ADDON"] as const;
type SourceFilter = (typeof SOURCES)[number];

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

    // Date range — default: last 30 days
    const from =
      parseYmd(searchParams.get("from")) ??
      new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
    const to = endOfDay(
      parseYmd(searchParams.get("to")) ?? new Date(now.getFullYear(), now.getMonth(), now.getDate())
    );

    const sourceParam = (searchParams.get("source") || "ALL").trim().toUpperCase();
    const source: SourceFilter = (SOURCES as readonly string[]).includes(sourceParam)
      ? (sourceParam as SourceFilter)
      : "ALL";

    const format = (searchParams.get("format") || "").toLowerCase();

    type SideRow = {
      date: string; // ISO
      source: "TOPUP" | "VOUCHER" | "ADDON";
      subscriberCode: string;
      name: string;
      area: string;
      item: string;
      type: string;
      amount: number;
      reference: string;
    };
    const merged: SideRow[] = [];

    // ── TOPUP ───────────────────────────────────────────────────────
    if (source === "ALL" || source === "TOPUP") {
      const topups = await db.subscriberTopUp.findMany({
        where: { purchasedAt: { gte: from, lte: to }, status: { not: "CANCELLED" } },
        include: {
          TopUpProduct: { select: { name: true, type: true, price: true } },
          Subscriber: { select: { code: true, name: true, Area: { select: { name: true } } } },
        },
        take: MAX_ROWS,
      });
      for (const t of topups) {
        merged.push({
          subscriberId: t.subscriberId,
          date: new Date(t.purchasedAt).toISOString(),
          source: "TOPUP",
          subscriberCode: t.Subscriber?.code ?? "",
          name: t.Subscriber?.name ?? "",
          area: t.Subscriber?.Area?.name ?? "",
          item: t.TopUpProduct?.name ?? "",
          type: t.TopUpProduct?.type ?? "",
          amount: round2(num(t.usedAmount) + num(t.remainingAmount)),
          reference: t.TopUpProduct?.name ?? "",
        });
      }
    }

    // ── VOUCHER (only redemption counts: status USED + usedAt set) ──
    if (source === "ALL" || source === "VOUCHER") {
      const vouchers = await db.voucher.findMany({
        where: { usedAt: { gte: from, lte: to }, status: "USED" },
        include: {
          Subscriber: { select: { code: true, name: true, Area: { select: { name: true } } } },
        },
        take: MAX_ROWS,
      });
      for (const v of vouchers) {
        merged.push({
          subscriberId: v.usedBySubscriberId,
          date: new Date(v.usedAt as Date).toISOString(),
          source: "VOUCHER",
          subscriberCode: v.Subscriber?.code ?? "",
          name: v.Subscriber?.name ?? "",
          area: v.Subscriber?.Area?.name ?? "",
          item: v.code,
          type: "VOUCHER",
          amount: round2(num(v.denomination)),
          reference: v.code,
        });
      }
    }

    // ── ADDON ───────────────────────────────────────────────────────
    if (source === "ALL" || source === "ADDON") {
      const addons = await db.subscriberAddOn.findMany({
        where: { startDate: { gte: from, lte: to }, status: { not: "CANCELLED" } },
        include: {
          AddOnService: { select: { name: true, chargeType: true } },
          Subscriber: { select: { code: true, name: true, Area: { select: { name: true } } } },
        },
        take: MAX_ROWS,
      });
      for (const a of addons) {
        merged.push({
          subscriberId: a.subscriberId,
          date: new Date(a.startDate).toISOString(),
          source: "ADDON",
          subscriberCode: a.Subscriber?.code ?? "",
          name: a.Subscriber?.name ?? "",
          area: a.Subscriber?.Area?.name ?? "",
          item: a.AddOnService?.name ?? "",
          type: a.AddOnService?.chargeType ?? "",
          amount: round2(num(a.chargeAmount)),
          reference: a.AddOnService?.name ?? "",
        });
      }
    }

    merged.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    // Summary
    const bySource: Record<string, { count: number; total: number }> = {
      TOPUP: { count: 0, total: 0 },
      VOUCHER: { count: 0, total: 0 },
      ADDON: { count: 0, total: 0 },
    };
    const spenderAgg = new Map<string, { subscriberCode: string; name: string; total: number }>();
    let totalSideRevenue = 0;
    for (const r of merged) {
      totalSideRevenue += r.amount;
      bySource[r.source].count += 1;
      bySource[r.source].total += r.amount;
      const key = r.subscriberCode || r.name;
      const cur = spenderAgg.get(key) ?? { subscriberCode: r.subscriberCode, name: r.name, total: 0 };
      cur.total += r.amount;
      spenderAgg.set(key, cur);
    }
    for (const s of Object.values(bySource)) s.total = round2(s.total);
    const topSpenders = Array.from(spenderAgg.values())
      .map((s) => ({ subscriberCode: s.subscriberCode, name: s.name, total: round2(s.total) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const summary = {
      from: ymd(from),
      to: ymd(to),
      totalSideRevenue: round2(totalSideRevenue),
      count: merged.length,
      bySource,
      topSpenders,
    };

    // CSV / XLSX / PDF export branch
    if (format === "csv" || format === "xlsx" || format === "pdf") {
      const headers = [
        "Date",
        "Source",
        "Subscriber Code",
        "Name",
        "Area",
        "Item",
        "Type",
        "Amount",
        "Reference",
      ];
      const exportRows: (string | number)[][] = merged.map((r) => [
        ymd(new Date(r.date)),
        r.source,
        r.subscriberCode,
        r.name,
        r.area,
        r.item,
        r.type,
        r.amount,
        r.reference,
      ]);
      await auditExport(request, "SideRevenue", format, exportRows.length);
      const filename = generateExportFilename("side-revenue", format);
      return format === "xlsx"
        ? xlsxResponse(headers, exportRows, filename)
        : format === "pdf"
          ? pdfResponse(headers, exportRows, filename, {
              title: "Side Revenue",
              subtitle: `Period ${ymd(from)} → ${ymd(to)} · Source: ${source}`,
            })
          : csvResponse(headers, exportRows, filename);
    }

    return NextResponse.json({
      success: true,
      data: { summary, rows: merged },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("side-revenue report failed:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to build side revenue report" },
      { status: 500 }
    );
  }
}
