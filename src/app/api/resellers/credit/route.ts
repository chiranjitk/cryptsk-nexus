import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditUpdate } from "@/lib/services/audit-service";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// GET /api/resellers/credit
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const now = new Date();

    // Fetch all resellers
    const resellers = await db.reseller.findMany({
      orderBy: { createdAt: "desc" },
    });

    // Build credit data for each reseller
    const creditData = [];

    for (const r of resellers) {
      const creditLimit = r.creditLimit || 0;
      const creditUsed = r.currentCreditUsed || 0;
      const creditAvailable = Math.max(0, creditLimit - creditUsed);
      const utilization = creditLimit > 0
        ? Math.round((creditUsed / creditLimit) * 10000) / 100
        : 0;

      const isOverLimit = creditUsed > creditLimit && creditLimit > 0;

      // Risk assessment
      let riskLevel = "LOW";
      if (utilization > 90) riskLevel = "HIGH";
      else if (utilization > 70) riskLevel = "MEDIUM";

      creditData.push({
        id: r.id,
        name: r.name,
        code: r.code,
        status: r.status,
        phone: r.phone,
        email: r.email,
        creditLimit,
        creditUsed: Math.round(creditUsed * 100) / 100,
        creditAvailable: Math.round(creditAvailable * 100) / 100,
        utilization,
        isOverLimit,
        riskLevel,
        totalSubscribers: r.totalSubscribers,
        totalCommission: r.totalCommission,
      });
    }

    // Over-limit resellers
    const overLimitResellers = creditData.filter((c) => c.isOverLimit);

    // High-risk resellers
    const highRiskResellers = creditData.filter((c) => c.riskLevel === "HIGH");

    // Credit history trend — real data from ResellerCommissionPayout, plus current month
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const payouts = await db.resellerCommissionPayout.findMany({
      where: { createdAt: { gte: sixMonthsAgo } },
    });

    // Group payouts by calendar month (YYYY-MM)
    const payoutsByMonth = new Map<string, typeof payouts>();
    for (const p of payouts) {
      const key = `${p.createdAt.getFullYear()}-${String(p.createdAt.getMonth() + 1).padStart(2, "0")}`;
      const arr = payoutsByMonth.get(key) || [];
      arr.push(p);
      payoutsByMonth.set(key, arr);
    }

    const currentTotalLimit = resellers.reduce((s, r) => s + (r.creditLimit || 0), 0);
    const currentTotalUsed = resellers.reduce((s, r) => s + (r.currentCreditUsed || 0), 0);

    const creditTrend: {
      month: string; totalLimit: number; totalUsed: number;
      totalAvailable: number; averageUtilization: number;
      resellerCount: number; overLimitCount: number;
    }[] = [];

    // Always include current month (real-time data from reseller records)
    creditTrend.push({
      month: now.toLocaleString("en-US", { month: "short", year: "2-digit" }),
      totalLimit: currentTotalLimit,
      totalUsed: currentTotalUsed,
      totalAvailable: Math.max(0, currentTotalLimit - currentTotalUsed),
      averageUtilization: currentTotalLimit > 0
        ? Math.round((currentTotalUsed / currentTotalLimit) * 10000) / 100
        : 0,
      resellerCount: resellers.length,
      overLimitCount: creditData.filter((c) => c.isOverLimit).length,
    });

    // Add historical months only where real payout data exists
    for (let i = 1; i <= 5; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const monthPayouts = payoutsByMonth.get(key);

      if (monthPayouts && monthPayouts.length > 0) {
        const totalRevenue = monthPayouts.reduce((s, p) => s + (p.revenue || 0), 0);
        const uniqueResellers = new Set(monthPayouts.map((p) => p.resellerId)).size;

        creditTrend.push({
          month: d.toLocaleString("en-US", { month: "short", year: "2-digit" }),
          totalLimit: currentTotalLimit,
          totalUsed: Math.round(totalRevenue),
          totalAvailable: Math.max(0, currentTotalLimit - totalRevenue),
          averageUtilization: currentTotalLimit > 0
            ? Math.round((totalRevenue / currentTotalLimit) * 10000) / 100
            : 0,
          resellerCount: uniqueResellers,
          overLimitCount: 0,
        });
      }
    }

    creditTrend.sort((a, b) => a.month.localeCompare(b.month));
    const trendDataAvailable = creditTrend.length > 1;

    // Summary stats
    const totalCreditLimit = resellers.reduce((s, r) => s + (r.creditLimit || 0), 0);
    const totalCreditUsed = resellers.reduce((s, r) => s + (r.currentCreditUsed || 0), 0);
    const totalCreditAvailable = Math.max(0, totalCreditLimit - totalCreditUsed);
    const overallUtilization = totalCreditLimit > 0
      ? Math.round((totalCreditUsed / totalCreditLimit) * 10000) / 100
      : 0;
    const averageUtilization = creditData.length > 0
      ? Math.round(
          creditData.reduce((s, c) => s + c.utilization, 0) / creditData.length * 100
        ) / 100
      : 0;

    // Risk distribution
    const riskDistribution = {
      HIGH: creditData.filter((c) => c.riskLevel === "HIGH").length,
      MEDIUM: creditData.filter((c) => c.riskLevel === "MEDIUM").length,
      LOW: creditData.filter((c) => c.riskLevel === "LOW").length,
    };

    return NextResponse.json(
      {
        summary: {
          totalCreditLimit,
          totalCreditUsed,
          totalCreditAvailable,
          overallUtilization,
          averageUtilization,
          totalResellers: resellers.length,
          overLimitCount: overLimitResellers.length,
          highRiskCount: highRiskResellers.length,
          riskDistribution,
        },
        resellers: creditData,
        overLimitResellers,
        highRiskResellers,
        creditTrend,
        dataAvailable: trendDataAvailable,
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
    console.error("Reseller Credit API failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch credit management data" },
      { status: 500, headers: corsHeaders }
    );
  }
}

// POST /api/resellers/credit — Adjust credit limit
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();
    const { resellerId, newLimit, reason } = body;

    if (!resellerId || newLimit === undefined || newLimit === null) {
      return NextResponse.json(
        { error: "resellerId and newLimit are required" },
        { status: 400, headers: corsHeaders }
      );
    }

    if (newLimit < 0) {
      return NextResponse.json(
        { error: "Credit limit cannot be negative" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Verify reseller exists
    const existing = await db.reseller.findUnique({
      where: { id: resellerId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Reseller not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    // Check if new limit is below current usage
    if (newLimit < existing.currentCreditUsed) {
      return NextResponse.json(
        {
          error: `Cannot set credit limit (₹${newLimit.toLocaleString("en-IN")}) below current usage (₹${existing.currentCreditUsed.toLocaleString("en-IN")})`,
        },
        { status: 400, headers: corsHeaders }
      );
    }

    const oldLimit = existing.creditLimit;

    const reseller = await db.reseller.update({
      where: { id: resellerId },
      data: { creditLimit: newLimit },
    });

    await auditUpdate(
      request,
      "Reseller",
      resellerId,
      { creditLimit: newLimit, reason: reason || "Credit limit adjustment" },
      { creditLimit: oldLimit } as Record<string, unknown>,
      { userId }
    );

    const creditAvailable = Math.max(0, newLimit - existing.currentCreditUsed);
    const utilization = newLimit > 0
      ? Math.round((existing.currentCreditUsed / newLimit) * 10000) / 100
      : 0;

    return NextResponse.json(
      {
        success: true,
        message: `Credit limit updated from ₹${(oldLimit || 0).toLocaleString("en-IN")} to ₹${newLimit.toLocaleString("en-IN")} for ${existing.name}`,
        reseller: {
          id: reseller.id,
          name: reseller.name,
          creditLimit: reseller.creditLimit,
          creditUsed: existing.currentCreditUsed,
          creditAvailable: Math.round(creditAvailable * 100) / 100,
          utilization,
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
    console.error("Reseller Credit POST failed:", error);
    return NextResponse.json(
      { error: "Failed to adjust credit limit" },
      { status: 500, headers: corsHeaders }
    );
  }
}
