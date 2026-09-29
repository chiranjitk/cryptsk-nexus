import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

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

// ── GET /api/payments/recent ────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    // ── Authentication ──
    await requireAuth(request);

    // ── Date boundaries for today ──
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // ── 1. Fetch last 15 payments with subscriber info ──
    const recentPayments = await db.payment.findMany({
      take: 15,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        amount: true,
        paymentMode: true,
        status: true,
        createdAt: true,
        Subscriber: {
          select: {
            name: true,
            code: true,
          },
        },
      },
    });

    // ── 2. Calculate totals from ALL payments ──
    const [totalTodayResult, totalMonthResult, avgResult, totalCount] =
      await Promise.all([
        // Total collected today (all statuses)
        db.payment.aggregate({
          _sum: { amount: true },
          where: { createdAt: { gte: todayStart } },
        }),
        // Total collected this month (all statuses)
        db.payment.aggregate({
          _sum: { amount: true },
          where: { createdAt: { gte: monthStart } },
        }),
        // Average payment amount across all payments
        db.payment.aggregate({
          _avg: { amount: true },
          _count: true,
        }),
        // Total count of all payments
        db.payment.count(),
      ]);

    const totalToday =
      Math.round((totalTodayResult._sum.amount ?? 0) * 100) / 100;
    const totalThisMonth =
      Math.round((totalMonthResult._sum.amount ?? 0) * 100) / 100;
    const averagePayment =
      Math.round((avgResult._avg.amount ?? 0) * 100) / 100;

    return NextResponse.json(
      {
        payments: recentPayments.map((p) => ({
          ...p,
          subscriber: p.Subscriber,
          Subscriber: undefined,
        })),
        totalToday,
        totalThisMonth,
        averagePayment,
        totalCount,
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
    console.error("Recent payments API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch recent payments" },
      { status: 500, headers: corsHeaders }
    );
  }
}
