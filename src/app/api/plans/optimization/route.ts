import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { db } from "@/lib/db";

// ─── GET: Revenue optimization report ────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    // Fetch all active subscribers with plans and areas
    const subscribers = await db.subscriber.findMany({
      where: {
        status: "ACTIVE",
        planId: { not: null },
      },
      include: {
        Plan: true,
        Area: { select: { id: true, name: true } },
      },
    });

    // Fetch all active plans
    const allPlans = await db.plan.findMany({
      where: { status: "ACTIVE" },
    });

    // Fetch usage data for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10);

    const subscriberIds = subscribers.map((s) => s.id);

    const allUsage = await db.dataUsage.findMany({
      where: {
        subscriberId: { in: subscriberIds },
        date: { gte: thirtyDaysAgoStr },
      },
    });

    // Group usage by subscriber
    const usageBySubscriber = new Map<string, typeof allUsage>();
    for (const record of allUsage) {
      const existing = usageBySubscriber.get(record.subscriberId) || [];
      existing.push(record);
      usageBySubscriber.set(record.subscriberId, existing);
    }

    let totalCurrentMRR = 0;
    let totalOptimizedMRR = 0;

    const subscriberAnalysis: {
      subscriberId: string;
      subscriberName: string;
      subscriberCode: string;
      areaId: string | null;
      areaName: string | null;
      currentPlanId: string;
      currentPlanName: string;
      currentPrice: number;
      optimalPlanId: string | null;
      optimalPlanName: string | null;
      optimalPrice: number;
      monthlySavings: number;
      type: "downgrade" | "upgrade" | "better_value" | "optimal" | "no_change";
      reasons: string[];
      projectedMonthlyGb: number;
      dataUtilizationPercent: number | null;
    }[] = [];

    // Group by area for reporting
    const byArea = new Map<string, { currentMRR: number; optimizedMRR: number; count: number }>();
    // Group by current plan for reporting
    const byCurrentPlan = new Map<string, { currentMRR: number; optimizedMRR: number; count: number; subscriberIds: string[] }>();

    for (const subscriber of subscribers) {
      if (!subscriber.Plan) continue;

      const currentPlan = subscriber.Plan;
      totalCurrentMRR += currentPlan.priceMonthly;

      const usageRecords = usageBySubscriber.get(subscriber.id) || [];
      const totalDays = usageRecords.length || 1;
      const totalDownloadMb = usageRecords.reduce((sum, r) => sum + r.downloadMb, 0);
      const totalUploadMb = usageRecords.reduce((sum, r) => sum + r.uploadMb, 0);
      const avgDailyTotalMb = (totalDownloadMb + totalUploadMb) / totalDays;
      const projectedMonthlyGb = (avgDailyTotalMb * 30) / 1024;

      const currentSpeedDownMbps = currentPlan.downloadSpeed;
      const currentPricePerMbps =
        currentSpeedDownMbps > 0 ? currentPlan.priceMonthly / currentSpeedDownMbps : 0;

      const dataUtilizationPercent = currentPlan.dataLimitGb
        ? (projectedMonthlyGb / currentPlan.dataLimitGb) * 100
        : null;

      let bestMatch: { plan: typeof allPlans[0]; score: number; reasons: string[]; type: "downgrade" | "upgrade" | "better_value" | "optimal" } | null = null;
      let bestScore = 55;

      for (const plan of allPlans) {
        if (plan.id === currentPlan.id) continue;

        const reasons: string[] = [];
        let score = 50;
        const monthlySavings = currentPlan.priceMonthly - plan.priceMonthly;
        let type: "downgrade" | "upgrade" | "better_value" | "optimal" = "better_value";

        const planSpeedDownMbps = plan.downloadSpeed;
        const planPricePerMbps =
          planSpeedDownMbps > 0 ? plan.priceMonthly / planSpeedDownMbps : 0;
        const planDataLimitGb = plan.dataLimitGb;

        // Data utilization > 80% → need more data
        if (planDataLimitGb && currentPlan.dataLimitGb && dataUtilizationPercent !== null) {
          if (dataUtilizationPercent > 80 && planDataLimitGb > currentPlan.dataLimitGb) {
            score += 15;
            reasons.push(`${((planDataLimitGb - currentPlan.dataLimitGb) / currentPlan.dataLimitGb * 100).toFixed(0)}% more data capacity`);
            if (monthlySavings <= 0) type = "upgrade";
          }
        }

        // Better value per Mbps
        if (planPricePerMbps > 0 && currentPricePerMbps > planPricePerMbps * 1.15) {
          const improvement = ((currentPricePerMbps - planPricePerMbps) / currentPricePerMbps) * 100;
          score += Math.min(improvement * 0.3, 12);
          reasons.push(`${improvement.toFixed(0)}% better value per Mbps`);
          type = "better_value";
        }

        // Savings with acceptable speed
        if (monthlySavings > 0 && planSpeedDownMbps >= currentSpeedDownMbps * 0.7) {
          const savingsPercent = (monthlySavings / currentPlan.priceMonthly) * 100;
          score += Math.min(savingsPercent * 0.4, 18);
          reasons.push(`Save ₹${monthlySavings.toFixed(0)}/mo (${savingsPercent.toFixed(0)}%)`);
          if (planSpeedDownMbps >= currentSpeedDownMbps) type = "better_value";
          else type = "downgrade";
        }

        // Speed upgrade for high usage
        if (planSpeedDownMbps > currentSpeedDownMbps && avgDailyTotalMb > currentSpeedDownMbps * 0.5) {
          score += 10;
          reasons.push(`Higher speed (${planSpeedDownMbps} vs ${currentSpeedDownMbps} Mbps)`);
          if (type !== "downgrade") type = "upgrade";
        }

        // Unlimited when near data limit
        if (!planDataLimitGb && currentPlan.dataLimitGb && projectedMonthlyGb > currentPlan.dataLimitGb * 0.75) {
          score += 8;
          reasons.push("Unlimited data eliminates overage risk");
        }

        // Penalize if new plan's data limit can't handle projected usage
        if (planDataLimitGb && projectedMonthlyGb > planDataLimitGb * 0.9) {
          score -= 12;
        }

        // Category match bonus
        if (plan.category === currentPlan.category) {
          score += 3;
        }

        // Same price but better features → optimal
        if (Math.abs(monthlySavings) < 5 && planSpeedDownMbps > currentSpeedDownMbps) {
          score += 20;
          reasons.push("Same price, better features");
          type = "optimal";
        }

        if (score > bestScore && reasons.length > 0) {
          bestScore = score;
          bestMatch = { plan, score, reasons, type };
        }
      }

      const optimalPlanId = bestMatch ? bestMatch.Plan.id : currentPlan.id;
      const optimalPlanName = bestMatch ? bestMatch.Plan.name : currentPlan.name;
      const optimalPrice = bestMatch ? bestMatch.Plan.priceMonthly : currentPlan.priceMonthly;
      const monthlySavings = currentPlan.priceMonthly - optimalPrice;

      totalOptimizedMRR += optimalPrice;

      const analysisEntry = {
        subscriberId: subscriber.id,
        subscriberName: subscriber.name,
        subscriberCode: subscriber.code,
        areaId: subscriber.Area?.id || null,
        areaName: subscriber.Area?.name || null,
        currentPlanId: currentPlan.id,
        currentPlanName: currentPlan.name,
        currentPrice: currentPlan.priceMonthly,
        optimalPlanId,
        optimalPlanName,
        optimalPrice,
        monthlySavings,
        type: bestMatch ? bestMatch.type : "no_change",
        reasons: bestMatch ? bestMatch.reasons : [],
        projectedMonthlyGb,
        dataUtilizationPercent,
      };

      subscriberAnalysis.push(analysisEntry);

      // Aggregate by area
      const areaKey = subscriber.Area?.name || "Unknown";
      const areaStats = byArea.get(areaKey) || { currentMRR: 0, optimizedMRR: 0, count: 0 };
      areaStats.currentMRR += currentPlan.priceMonthly;
      areaStats.optimizedMRR += optimalPrice;
      areaStats.count += 1;
      byArea.set(areaKey, areaStats);

      // Aggregate by current plan
      const planKey = currentPlan.name;
      const planStats = byCurrentPlan.get(planKey) || { currentMRR: 0, optimizedMRR: 0, count: 0, subscriberIds: [] };
      planStats.currentMRR += currentPlan.priceMonthly;
      planStats.optimizedMRR += optimalPrice;
      planStats.count += 1;
      planStats.subscriberIds.push(subscriber.id);
      byCurrentPlan.set(planKey, planStats);
    }

    const potentialGain = totalCurrentMRR - totalOptimizedMRR;

    // Build opportunities array
    const opportunities = subscriberAnalysis
      .filter((a) => a.type !== "no_change")
      .sort((a, b) => b.monthlySavings - a.monthlySavings);

    return NextResponse.json(
      {
        success: true,
        opportunities,
        totalCurrentMRR,
        totalOptimizedMRR,
        potentialGain,
        subscriberAnalysis,
        groupByArea: Object.fromEntries(
          Array.from(byArea.entries()).map(([name, stats]) => [
            name,
            { ...stats, potentialChange: stats.currentMRR - stats.optimizedMRR },
          ])
        ),
        groupByPlan: Object.fromEntries(
          Array.from(byCurrentPlan.entries()).map(([name, stats]) => [
            name,
            {
              ...stats,
              potentialChange: stats.currentMRR - stats.optimizedMRR,
              subscriberCount: stats.count,
            },
          ])
        ),
        generatedAt: new Date().toISOString(),
      },
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("[GET /api/plans/optimization]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
