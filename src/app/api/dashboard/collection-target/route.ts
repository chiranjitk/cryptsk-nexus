import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/dashboard/collection-target — Monthly collection target vs actual
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const NOW = new Date();
    const monthStart = new Date(NOW.getFullYear(), NOW.getMonth(), 1);
    const todayStart = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());

    // Days in this month
    const lastDayOfMonth = new Date(NOW.getFullYear(), NOW.getMonth() + 1, 0).getDate();
    const daysInMonth = lastDayOfMonth;
    const daysElapsed = NOW.getDate(); // today is day N (1-indexed)
    const daysRemaining = Math.max(daysInMonth - daysElapsed, 0);

    // Monthly collection (verified payments this month)
    const monthPayments = await db.payment.aggregate({
      _sum: { amount: true },
      _count: true,
      where: { status: "VERIFIED", createdAt: { gte: monthStart } },
    });
    const monthCollected = monthPayments._sum.amount || 0;
    const monthPaymentCount = monthPayments._count || 0;

    // Today's collection
    const todayPayments = await db.payment.aggregate({
      _sum: { amount: true },
      _count: true,
      where: { status: "VERIFIED", createdAt: { gte: todayStart } },
    });
    const todayCollected = todayPayments._sum.amount || 0;
    const todayPaymentCount = todayPayments._count || 0;

    // Monthly target from ISP settings
    const ispSettings = await db.ispSettings.findUnique({
      where: { id: "default" },
      select: { kpiTargets: true },
    });

    let monthlyTarget = 15000;
    if (ispSettings?.kpiTargets) {
      try {
        const targets = typeof ispSettings.kpiTargets === "string"
          ? JSON.parse(ispSettings.kpiTargets)
          : ispSettings.kpiTargets;
        if (targets.monthlyCollectionTarget) monthlyTarget = targets.monthlyCollectionTarget;
      } catch {
        // Use default
      }
    }

    // Calculate percentages and daily average
    const collectionPercent = monthlyTarget > 0 ? Math.round((monthCollected / monthlyTarget) * 100) : 0;
    const remaining = Math.max(monthlyTarget - monthCollected, 0);
    const dailyAvgCollected = daysElapsed > 0 ? Math.round(monthCollected / daysElapsed) : 0;
    const dailyAvgNeeded = daysRemaining > 0 ? Math.ceil(remaining / daysRemaining) : 0;

    // Expected collection by now (if on track, assuming linear)
    const expectedByNow = monthlyTarget > 0 ? Math.round((monthlyTarget / daysInMonth) * daysElapsed) : 0;
    const onTrackPercent = expectedByNow > 0 ? Math.round((monthCollected / expectedByNow) * 100) : 0;

    // Status: on track, behind, or critically behind
    let status: "on_track" | "behind" | "critically_behind";
    if (onTrackPercent >= 90) status = "on_track";
    else if (onTrackPercent >= 60) status = "behind";
    else status = "critically_behind";

    const response = NextResponse.json({
      monthlyTarget,
      monthCollected: Math.round(monthCollected),
      collectionPercent,
      todayCollected: Math.round(todayCollected),
      todayPaymentCount,
      monthPaymentCount,
      daysInMonth,
      daysElapsed,
      daysRemaining,
      dailyAvgCollected,
      dailyAvgNeeded,
      remaining: Math.round(remaining),
      expectedByNow: Math.round(expectedByNow),
      onTrackPercent,
      status,
      timestamp: new Date().toISOString(),
    });

    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

    return response;
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[GET /api/dashboard/collection-target]", error);
    return NextResponse.json(
      { error: "Failed to fetch collection target data" },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
