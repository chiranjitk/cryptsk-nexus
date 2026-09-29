import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifySubscriberSessionToken, SUBSCRIBER_SESSION_COOKIE_NAME } from "@/lib/subscriber-session";

async function getSubscriberFromToken(request: NextRequest) {
  const token = request.cookies.get(SUBSCRIBER_SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const subscriberId = await verifySubscriberSessionToken(token);
  if (!subscriberId) return null;
  return db.subscriber.findUnique({
    where: { id: subscriberId },
    include: { Plan: true },
  });
}

// GET /api/selfcare/plan-compare — Compare current plan with available plans
export async function GET(req: NextRequest) {
  try {
    const subscriber = await getSubscriberFromToken(req);
    if (!subscriber) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const currentPlan = subscriber.Plan;
    const currentCategory = currentPlan?.category || null;

    // Get all active plans, preferably in same category
    const plans = await db.plan.findMany({
      where: {
        status: "ACTIVE",
        ...(currentCategory ? { category: currentCategory as never } : {}),
      },
      orderBy: { sortOrder: "asc" },
    });

    // If no plans found in same category, get all active plans
    const allPlans = plans.length > 0 ? plans : await db.plan.findMany({
      where: { status: "ACTIVE" },
      orderBy: { sortOrder: "asc" },
    });

    // Build comparison data
    const comparison = allPlans.map((plan) => {
      const isCurrentPlan = plan.id === subscriber.planId;
      const downloadMbps = plan.downloadSpeed / 1000; // Kbps to Mbps
      const uploadMbps = plan.uploadSpeed / 1000;
      const pricePerMbps =
        downloadMbps > 0 ? parseFloat((plan.priceMonthly / downloadMbps).toFixed(2)) : 0;
      const pricePerGb =
        plan.dataLimitGb && plan.dataLimitGb > 0
          ? parseFloat((plan.priceMonthly / plan.dataLimitGb).toFixed(2))
          : null;

      // Value score: higher is better (inverse of price per Mbps, with data bonus)
      let valueScore = 0;
      if (pricePerMbps > 0) {
        valueScore = 100 / pricePerMbps; // Lower price per Mbps = higher score
      }
      if (pricePerGb && pricePerGb > 0) {
        valueScore += 50 / pricePerGb; // Bonus for good data pricing
      }
      valueScore = parseFloat(valueScore.toFixed(1));

      return {
        id: plan.id,
        name: plan.name,
        category: plan.category,
        priceMonthly: plan.priceMonthly,
        downloadSpeed: downloadMbps,
        uploadSpeed: uploadMbps,
        dataLimitGb: plan.dataLimitGb,
        pricePerMbps,
        pricePerGb,
        valueScore,
        isCurrentPlan,
        isPopular: plan.isPopular,
      };
    });

    // Sort by value score descending (best value first)
    comparison.sort((a, b) => b.valueScore - a.valueScore);

    return NextResponse.json({
      success: true,
      data: {
        currentPlanId: subscriber.planId,
        currentCategory,
        plans: comparison,
      },
    });
  } catch (error) {
    console.error("[selfcare-plan-compare] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
