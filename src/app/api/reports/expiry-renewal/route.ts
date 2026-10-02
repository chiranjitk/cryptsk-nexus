// GET /api/reports/expiry-renewal — Expiry & Renewal report (Task 3-a, Phase 2)
//
// EXPIRY DERIVATION (schema has NO subscriber expiry column):
//   anchor    = latest of (billingStartDate, latest VERIFIED payment.createdAt, activationDate)
//   expiryDate = anchor + (Plan.validityDays || 30) days
//   no anchor at all → subscriber skipped, counted in summary.unknownExpiry
// daysToExpiry = floor((endOfDay(expiryDate) − endOfDay(today)) / 86_400_000)
//   → computed against END of today so "expires today" = 0.
// Buckets (fixed thresholds, independent of withinDays):
//   EXPIRED (days < 0) | DUE_7 (<= 7) | DUE_30 (<= 30) | LATER
// Rows kept when daysToExpiry <= withinDays (default 7, clamp 1..90). Cap 2000.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import type { SubscriberStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { csvResponse, generateExportFilename } from "@/lib/export-utils";
import { xlsxResponse } from "@/lib/xlsx-export";
import { pdfResponse } from "@/lib/pdf-export";
import { auditExport } from "@/lib/services/audit-service";

const MAX_ROWS = 2000;
const DAY_MS = 86_400_000;

const VALID_STATUSES: SubscriberStatus[] = [
  "ACTIVE",
  "SUSPENDED",
  "DISCONNECTED",
  "TRIAL",
  "PENDING_ACTIVATION",
];

// ── Helpers (per-file copies, Phase 1 doctrine) ────────────────────

/** BigInt/Decimal → Number at the edge. */
function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Local YYYY-MM-DD for a Date (avoids UTC off-by-one in CSVs). */
function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function bucketFor(daysToExpiry: number): "EXPIRED" | "DUE_7" | "DUE_30" | "LATER" {
  if (daysToExpiry < 0) return "EXPIRED";
  if (daysToExpiry <= 7) return "DUE_7";
  if (daysToExpiry <= 30) return "DUE_30";
  return "LATER";
}

// ── GET ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const now = new Date();
    const todayEnd = endOfDay(now);

    // withinDays — default 7, clamped to 1..90
    const withinRaw = parseInt(searchParams.get("withinDays") || "7", 10);
    const withinDays = Number.isFinite(withinRaw) ? Math.min(Math.max(withinRaw, 1), 90) : 7;

    // status — comma list validated against SubscriberStatus; default ACTIVE,SUSPENDED,TRIAL
    const statuses: SubscriberStatus[] = (searchParams.get("status") || "ACTIVE,SUSPENDED,TRIAL")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s): s is SubscriberStatus => (VALID_STATUSES as string[]).includes(s));

    const areaId = (searchParams.get("areaId") || "").trim();
    const planId = (searchParams.get("planId") || "").trim();
    const format = (searchParams.get("format") || "").toLowerCase();

    const subscribers = await db.subscriber.findMany({
      where: {
        ...(statuses.length > 0 ? { status: { in: statuses } } : {}),
        ...(areaId ? { areaId } : {}),
        ...(planId ? { planId } : {}),
      },
      include: {
        Plan: { select: { name: true, validityDays: true, priceMonthly: true } },
        Area: { select: { name: true } },
        // Relation name is "Payment" (singular) per schema
        Payment: {
          where: { status: "VERIFIED" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
      orderBy: { code: "asc" },
      take: MAX_ROWS,
    });

    let unknownExpiry = 0;
    const allDerived = subscribers.map((s) => {
      const billingStart = s.billingStartDate ? new Date(s.billingStartDate) : null;
      const lastRenewal = s.Payment[0]?.createdAt ? new Date(s.Payment[0].createdAt) : null;
      const activation = s.activationDate ? new Date(s.activationDate) : null;

      // anchor = latest non-null of the three candidates
      let anchor: Date | null = null;
      for (const c of [billingStart, lastRenewal, activation]) {
        if (c && (!anchor || c > anchor)) anchor = c;
      }
      if (!anchor) {
        unknownExpiry += 1;
        return null;
      }
      const validityDays = s.Plan?.validityDays ?? 30;
      const expiryDate = new Date(anchor.getTime() + validityDays * DAY_MS);
      const daysToExpiry = Math.floor((endOfDay(expiryDate).getTime() - todayEnd.getTime()) / DAY_MS);
      return {
        subscriberId: s.id,
        subscriberCode: s.code,
        name: s.name,
        phone: s.phone,
        area: s.Area?.name ?? "",
        plan: s.Plan?.name ?? "",
        planPrice: round2(num(s.Plan?.priceMonthly)),
        lastRenewal: lastRenewal ? lastRenewal.toISOString() : null,
        expiryDate: expiryDate.toISOString(),
        daysToExpiry,
        bucket: bucketFor(daysToExpiry),
        status: s.status,
      };
    });

    const rows = allDerived
      .filter((r): r is NonNullable<typeof r> => r !== null && r.daysToExpiry <= withinDays)
      .sort((a, b) => a.daysToExpiry - b.daysToExpiry)
      .slice(0, MAX_ROWS);

    // Renewals in the last 30 days — ONE query feeds both counts.
    const renewalsCutoff = new Date(todayEnd.getTime() - 30 * DAY_MS);
    const recentRenewals = await db.payment.findMany({
      where: { status: "VERIFIED", createdAt: { gte: renewalsCutoff } },
      select: { subscriberId: true },
      // Slim select; guard rail well above register scale
      take: 10000,
    });

    const summary = {
      asOf: ymd(now),
      withinDays,
      expiringCount: rows.length,
      expiredCount: rows.filter((r) => r.bucket === "EXPIRED").length,
      dueIn7: rows.filter((r) => r.bucket === "DUE_7").length,
      dueIn30: rows.filter((r) => r.bucket === "DUE_30").length,
      laterCount: rows.filter((r) => r.bucket === "LATER").length,
      unknownExpiry,
      potentialMrrAtRisk: round2(rows.reduce((s, r) => s + r.planPrice, 0)),
      renewalsLast30Days: recentRenewals.length,
      renewedSubscriberCount: new Set(recentRenewals.map((p) => p.subscriberId)).size,
    };

    // CSV / XLSX / PDF export branch
    if (format === "csv" || format === "xlsx" || format === "pdf") {
      const headers = [
        "Subscriber Code",
        "Name",
        "Phone",
        "Area",
        "Plan",
        "Monthly Price",
        "Last Renewal",
        "Expiry Date",
        "Days To Expiry",
        "Bucket",
        "Status",
      ];
      const exportRows: (string | number)[][] = rows.map((r) => [
        r.subscriberCode,
        r.name,
        r.phone,
        r.area,
        r.plan,
        r.planPrice,
        r.lastRenewal ? ymd(new Date(r.lastRenewal)) : "",
        ymd(new Date(r.expiryDate)),
        r.daysToExpiry,
        r.bucket,
        r.status,
      ]);
      await auditExport(request, "Subscriber", format, exportRows.length);
      const filename = generateExportFilename("expiry-renewal", format);
      return format === "xlsx"
        ? xlsxResponse(headers, exportRows, filename)
        : format === "pdf"
          ? pdfResponse(headers, exportRows, filename, {
              title: "Expiry & Renewal",
              subtitle: `As of ${ymd(now)} · Within ${withinDays} days`,
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
    console.error("expiry-renewal report failed:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to build expiry & renewal report" },
      { status: 500 }
    );
  }
}
