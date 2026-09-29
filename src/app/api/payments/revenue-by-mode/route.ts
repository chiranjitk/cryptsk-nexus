import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { Prisma } from "@prisma/client";

// ── CORS Headers ────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ── OPTIONS handler for CORS preflight ──────────────────────────────

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// ── Mode label mapping ──────────────────────────────────────────────

const MODE_LABELS: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  ONLINE: "Online",
  BANK_TRANSFER: "Bank Transfer",
  CHEQUE: "Cheque",
  WALLET: "Wallet",
};

// ── GET /api/payments/revenue-by-mode ───────────────────────────────

export async function GET(request: NextRequest) {
  try {
    // ── Authentication ──
    await requireAuth(request);

    // ── 1. Group payments by paymentMode with sum and count ──
    const groupedPayments = await db.payment.groupBy({
      by: ["paymentMode"],
      _sum: {
        amount: true,
      },
      _count: {
        id: true,
      },
      where: {
        status: "VERIFIED",
      },
    });

    // ── 2. Calculate total revenue ──
    const totalRevenue = groupedPayments.reduce(
      (sum, group) => sum + (group._sum.amount ?? 0),
      0
    );

    // ── 3. Sort by total descending for consistent ordering ──
    const sorted = groupedPayments.sort(
      (a, b) => (b._sum.amount ?? 0) - (a._sum.amount ?? 0)
    );

    // ── 4. Build response modes array ──
    const modes = sorted.map((group) => ({
      mode: group.paymentMode,
      label: MODE_LABELS[group.paymentMode] ?? group.paymentMode,
      total: Math.round((group._sum.amount ?? 0) * 100) / 100,
      count: group._count.id,
      percentage:
        totalRevenue > 0
          ? Math.round(((group._sum.amount ?? 0) / totalRevenue) * 10000) / 100
          : 0,
    }));

    // ── 5. Ensure all known modes are present (even if zero) ──
    const knownModes = Object.keys(MODE_LABELS);
    const existingModes = new Set(modes.map((m) => m.mode));
    for (const mode of knownModes) {
      if (!existingModes.has(mode)) {
        modes.push({
          mode,
          label: MODE_LABELS[mode],
          total: 0,
          count: 0,
          percentage: 0,
        });
      }
    }

    // ── 6. Final sort: by total descending, zeros at the end ──
    modes.sort((a, b) => {
      if (a.total === 0 && b.total === 0) return a.mode.localeCompare(b.mode);
      if (a.total === 0) return 1;
      if (b.total === 0) return -1;
      return b.total - a.total;
    });

    return NextResponse.json(
      {
        modes,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalPayments: modes.reduce((sum, m) => sum + m.count, 0),
        timestamp: new Date().toISOString(),
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode, headers: corsHeaders }
      );
    }
    console.error("Revenue by payment mode API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch revenue by payment mode" },
      { status: 500, headers: corsHeaders }
    );
  }
}
