import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

/**
 * GET /api/subscribers/expiring
 * Returns ACTIVE subscribers whose next billing cycle expires within 7 days.
 * Logic: billingStartDate + plan.validityDays is within [now, now + 7 days].
 * Uses modular arithmetic to find the most recent billing cycle boundary
 * and projects the next one.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Fetch all ACTIVE subscribers with their plan info and area
    const activeSubscribers = await db.subscriber.findMany({
      where: {
        status: "ACTIVE",
        billingStartDate: { not: null },
        planId: { not: null },
      },
      include: {
        Plan: {
          select: {
            id: true,
            name: true,
            priceMonthly: true,
            validityDays: true,
          },
        },
        Area: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        billingStartDate: "asc",
      },
    });

    // Total active subscribers (including those without billingStartDate)
    const totalActive = await db.subscriber.count({
      where: { status: "ACTIVE" },
    });

    // Calculate next billing date for each subscriber using modular arithmetic
    const expiring = activeSubscribers
      .map((sub) => {
        const startDate = new Date(sub.billingStartDate!);
        const validityDays = sub.Plan?.validityDays || 30;
        const diffMs = now.getTime() - startDate.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        // How many complete cycles have passed
        const cyclesCompleted = Math.floor(diffDays / validityDays);
        // Next billing date = billingStartDate + (cyclesCompleted + 1) * validityDays
        const nextBillingDate = new Date(
          startDate.getTime() + (cyclesCompleted + 1) * validityDays * 24 * 60 * 60 * 1000
        );

        const daysLeft = Math.ceil(
          (nextBillingDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );

        return {
          id: sub.id,
          code: sub.code,
          name: sub.name,
          planName: sub.Plan?.name || "Unknown",
          priceMonthly: sub.Plan?.priceMonthly || 0,
          expiresAt: nextBillingDate.toISOString(),
          daysLeft,
          area: sub.Area?.name || "N/A",
        };
      })
      .filter(
        (item) =>
          item.daysLeft >= 0 && item.daysLeft <= 7
      )
      .sort((a, b) => a.daysLeft - b.daysLeft);

    return NextResponse.json({
      expiring,
      totalExpiring: expiring.length,
      totalActive,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("Subscribers expiring GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch expiring subscriptions" },
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
