import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// Tiered commission calculation
function calculateTieredCommission(
  baseRate: number,
  subscriberCount: number,
  revenue: number,
  monthlyTarget: number,
  churnRate: number
) {
  let totalRate = baseRate;
  let volumeBonus = 0;
  let performanceBonus = 0;
  let retentionBonus = 0;

  // Volume bonus
  if (subscriberCount > 200) {
    volumeBonus = 8;
  } else if (subscriberCount > 100) {
    volumeBonus = 5;
  } else if (subscriberCount > 50) {
    volumeBonus = 2;
  }

  // Performance bonus: revenue > 80% of monthly target
  if (monthlyTarget > 0 && revenue > monthlyTarget * 0.8) {
    performanceBonus = 3;
  }

  // Retention bonus: churn rate < 5%
  if (churnRate < 5) {
    retentionBonus = 2;
  }

  totalRate = baseRate + volumeBonus + performanceBonus + retentionBonus;

  const simpleCommission = Math.round(revenue * (baseRate / 100));
  const tieredCommission = Math.round(revenue * (totalRate / 100));
  const bonusEarnings = tieredCommission - simpleCommission;

  return {
    baseRate,
    totalRate: Math.round(totalRate * 100) / 100,
    volumeBonus,
    performanceBonus,
    retentionBonus,
    simpleCommission,
    tieredCommission,
    bonusEarnings,
  };
}

// GET /api/resellers/commission-engine
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const now = new Date();

    // Fetch all resellers
    const resellers = await db.reseller.findMany({
      orderBy: { totalCommission: "desc" },
    });

    // Fetch all subscribers with plans
    const subscribers = await db.subscriber.findMany({
      select: {
        id: true,
        status: true,
        areaId: true,
        Plan: { select: { id: true, priceMonthly: true } },
      },
    });

    // Fetch areas
    const areas = await db.area.findMany({ select: { id: true, name: true } });

    // Fetch existing payouts
    const payouts = await db.resellerCommissionPayout.findMany({
      orderBy: { createdAt: "desc" },
    });

    // Commission rules display
    const commissionRules = {
      tiers: [
        { threshold: "> 200 subscribers", bonus: "+8%", description: "High volume reseller" },
        { threshold: "> 100 subscribers", bonus: "+5%", description: "Growing reseller" },
        { threshold: "> 50 subscribers", bonus: "+2%", description: "Established reseller" },
      ],
      performance: {
        condition: "Revenue > 80% of monthly target",
        bonus: "+3%",
        description: "Target achiever bonus",
      },
      retention: {
        condition: "Churn rate < 5%",
        bonus: "+2%",
        description: "Customer retention bonus",
      },
    };

    // Calculate commission for each reseller
    const commissionDetails = [];

    for (const r of resellers) {
      let areaIds: string[] = [];
      try {
        areaIds = JSON.parse(r.areaIds as string) as string[];
      } catch {
        areaIds = [];
      }
      const areaIdSet = new Set(areaIds);

      const resellerSubs = areaIds.length > 0
        ? subscribers.filter((s) => areaIdSet.has(s.areaId || ""))
        : [];

      const totalSubs = resellerSubs.length;
      const inactiveSubs = resellerSubs.filter((s) =>
        ["SUSPENDED", "DISCONNECTED"].includes(s.status)
      ).length;
      const churnRate = totalSubs > 0
        ? (inactiveSubs / totalSubs) * 100
        : 0;

      const revenue = resellerSubs
        .filter((s) => s.status === "ACTIVE" && s.Plan)
        .reduce((sum, s) => sum + (s.Plan?.priceMonthly || 0), 0);

      const tiered = calculateTieredCommission(
        r.commissionRate,
        totalSubs,
        revenue,
        r.monthlyTarget || 0,
        churnRate
      );

      // Reseller's payouts
      const resellerPayouts = payouts.filter((p) => p.resellerId === r.id);

      commissionDetails.push({
        id: r.id,
        name: r.name,
        code: r.code,
        status: r.status,
        subscriberCount: totalSubs,
        revenue: Math.round(revenue * 100) / 100,
        monthlyTarget: r.monthlyTarget || 0,
        churnRate: Math.round(churnRate * 100) / 100,
        commissionCalculationMethod: r.commissionCalculationMethod,
        ...tiered,
        totalEarned: resellerPayouts.reduce((s, p) => s + p.commissionAmount, 0),
        totalPaid: resellerPayouts.filter((p) => p.status === "PAID").reduce((s, p) => s + p.commissionAmount, 0),
        pendingPayouts: resellerPayouts.filter((p) => p.status === "PENDING"),
        payoutHistory: resellerPayouts.slice(0, 20).map((p) => ({
          id: p.id,
          period: p.period,
          subscriberCount: p.subscriberCount,
          revenue: p.revenue,
          commissionRate: p.commissionRate,
          commissionAmount: p.commissionAmount,
          status: p.status,
          paidOn: p.paidOn?.toISOString() || null,
          createdAt: p.createdAt.toISOString(),
        })),
      });
    }

    // Summary
    const totalSimple = commissionDetails.reduce((s, c) => s + c.simpleCommission, 0);
    const totalTiered = commissionDetails.reduce((s, c) => s + c.tieredCommission, 0);
    const totalBonus = commissionDetails.reduce((s, c) => s + c.bonusEarnings, 0);

    // All payout history for the history table
    const allPayoutHistory = payouts.map((p) => {
      const reseller = resellers.find((r) => r.id === p.resellerId);
      return {
        id: p.id,
        resellerId: p.resellerId,
        resellerName: reseller?.name || "Unknown",
        period: p.period,
        subscriberCount: p.subscriberCount,
        revenue: p.revenue,
        commissionRate: p.commissionRate,
        commissionAmount: p.commissionAmount,
        status: p.status,
        paidOn: p.paidOn?.toISOString() || null,
        approvedBy: p.approvedBy || null,
        createdAt: p.createdAt.toISOString(),
      };
    });

    return NextResponse.json(
      {
        rules: commissionRules,
        resellers: commissionDetails,
        summary: {
          totalSimpleCommission: totalSimple,
          totalTieredCommission: totalTiered,
          totalBonusEarnings: totalBonus,
          averageBonusPercent: totalSimple > 0
            ? Math.round((totalBonus / totalSimple) * 10000) / 100
            : 0,
          totalResellers: resellers.length,
          eligibleForBonus: commissionDetails.filter((c) => c.bonusEarnings > 0).length,
        },
        payoutHistory: allPayoutHistory,
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
    console.error("Commission Engine API failed:", error);
    return NextResponse.json(
      { error: "Failed to compute commission engine data" },
      { status: 500, headers: corsHeaders }
    );
  }
}

// POST /api/resellers/commission-engine
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();
    const { resellerId, period, amount } = body;

    if (!resellerId || !period) {
      return NextResponse.json(
        { error: "resellerId and period are required" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Verify reseller exists
    const reseller = await db.reseller.findUnique({
      where: { id: resellerId },
    });

    if (!reseller) {
      return NextResponse.json(
        { error: "Reseller not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    // Get subscriber count and revenue for this period
    let areaIds: string[] = [];
    try {
      areaIds = JSON.parse(reseller.areaIds as string) as string[];
    } catch {
      areaIds = [];
    }
    const areaIdSet = new Set(areaIds);

    const subscribers = areaIds.length > 0
      ? await db.subscriber.findMany({
          where: { areaId: { in: areaIds } },
          select: { id: true, status: true, Plan: { select: { priceMonthly: true } } },
        })
      : [];

    const activeSubs = subscribers.filter((s) => s.status === "ACTIVE");
    const revenue = activeSubs.reduce(
      (sum, s) => sum + (s.Plan?.priceMonthly || 0),
      0
    );

    const commissionAmount = amount || Math.round(revenue * (reseller.commissionRate / 100));

    // Check for existing payout in this period
    const existing = await db.resellerCommissionPayout.findFirst({
      where: { resellerId, period },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Payout already exists for period ${period}. Use a different period.` },
        { status: 409, headers: corsHeaders }
      );
    }

    const payout = await db.resellerCommissionPayout.create({
      data: {
        resellerId,
        period,
        subscriberCount: activeSubs.length,
        revenue: Math.round(revenue * 100) / 100,
        commissionRate: reseller.commissionRate,
        commissionAmount,
        status: "PENDING",
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: `Commission payout of ₹${commissionAmount.toLocaleString("en-IN")} created for ${reseller.name} (${period})`,
        payout: {
          id: payout.id,
          resellerId: payout.resellerId,
          period: payout.period,
          subscriberCount: payout.subscriberCount,
          revenue: payout.revenue,
          commissionRate: payout.commissionRate,
          commissionAmount: payout.commissionAmount,
          status: payout.status,
          createdAt: payout.createdAt.toISOString(),
        },
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
    console.error("Commission Engine POST failed:", error);
    return NextResponse.json(
      { error: "Failed to process commission payout" },
      { status: 500, headers: corsHeaders }
    );
  }
}
