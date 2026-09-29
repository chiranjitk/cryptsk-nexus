import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { db } from "@/lib/db";

// ─── POST: Recommend plans for a single subscriber ──────────────────────
export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json();
    const { subscriberId } = body;

    if (!subscriberId) {
      return NextResponse.json(
        { success: false, error: "subscriberId is required" },
        { status: 400 }
      );
    }

    // Fetch subscriber with plan and area
    const subscriber = await db.subscriber.findUnique({
      where: { id: subscriberId },
      include: {
        Plan: true,
        Area: { select: { id: true, name: true } },
      },
    });

    if (!subscriber) {
      return NextResponse.json(
        { success: false, error: "Subscriber not found" },
        { status: 404 }
      );
    }

    if (!subscriber.planId) {
      return NextResponse.json(
        { success: false, error: "Subscriber has no plan assigned" },
        { status: 400 }
      );
    }

    const currentPlan = subscriber.Plan;

    // Fetch usage data for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10);

    const usageRecords = await db.dataUsage.findMany({
      where: {
        subscriberId,
        date: { gte: thirtyDaysAgoStr },
      },
      orderBy: { date: "asc" },
    });

    // Calculate average daily usage in MB
    const totalDays = usageRecords.length || 1;
    const totalDownloadMb = usageRecords.reduce((sum, r) => sum + r.downloadMb, 0);
    const totalUploadMb = usageRecords.reduce((sum, r) => sum + r.uploadMb, 0);
    const avgDailyDownloadMb = totalDownloadMb / totalDays;
    const avgDailyUploadMb = totalUploadMb / totalDays;
    const avgDailyTotalMb = avgDailyDownloadMb + avgDailyUploadMb;
    const projectedMonthlyMb = avgDailyTotalMb * 30;
    const projectedMonthlyGb = projectedMonthlyMb / 1024;

    // Fetch all ACTIVE plans except current
    const allPlans = await db.plan.findMany({
      where: {
        status: "ACTIVE",
        id: { not: currentPlan.id },
      },
      include: {
        _count: { select: { Subscriber: true } },
      },
    });

    // Calculate speed in Mbps for comparison
    const currentSpeedDownMbps = currentPlan.downloadSpeed; // Already in Mbps
    const currentSpeedUpMbps = currentPlan.uploadSpeed;
    const currentPricePerMbps =
      currentSpeedDownMbps > 0 ? currentPlan.priceMonthly / currentSpeedDownMbps : 0;

    // Score each plan
    const scored: {
      plan: typeof allPlans[0];
      score: number;
      reasons: string[];
      monthlySavings: number;
      type: "downgrade" | "upgrade" | "better_value" | "better_fit";
    }[] = [];

    for (const plan of allPlans) {
      const reasons: string[] = [];
      let score = 50; // Base score
      let type: "downgrade" | "upgrade" | "better_value" | "better_fit" = "better_value";
      const monthlySavings = currentPlan.priceMonthly - plan.priceMonthly;

      const planSpeedDownMbps = plan.downloadSpeed;
      const planPricePerMbps =
        planSpeedDownMbps > 0 ? plan.priceMonthly / planSpeedDownMbps : 0;

      const planDataLimitGb = plan.dataLimitGb;

      // Rule 1: Data usage > 80% of plan limit → need higher data
      if (planDataLimitGb && currentPlan.dataLimitGb) {
        const currentUsagePercent = currentPlan.dataLimitGb > 0
          ? (projectedMonthlyGb / currentPlan.dataLimitGb) * 100
          : 0;

        if (currentUsagePercent > 80) {
          // Prefer plans with more data
          if (planDataLimitGb > currentPlan.dataLimitGb) {
            const dataIncrease = ((planDataLimitGb - currentPlan.dataLimitGb) / currentPlan.dataLimitGb) * 100;
            score += Math.min(dataIncrease * 0.5, 20);
            reasons.push(`${dataIncrease.toFixed(0)}% more data capacity (${planDataLimitGb} GB vs ${currentPlan.dataLimitGb} GB)`);
            if (monthlySavings <= 0) type = "upgrade";
          }
        }
      }

      // Rule 2: Subscriber uses < 20% of speed → cheaper plan recommended
      if (avgDailyDownloadMb < currentSpeedDownMbps * 0.2 * 30 / 30) {
        // Daily average is less than 20% of plan speed in MB (rough heuristic)
        if (planSpeedDownMbps < currentSpeedDownMbps && planSpeedDownMbps >= avgDailyDownloadMb * 30 / 30 / 0.5) {
          score += 10;
          reasons.push(`${planSpeedDownMbps} Mbps is sufficient for your average usage pattern`);
          if (monthlySavings > 0) type = "downgrade";
        }
      }

      // Rule 3: Better value per Mbps
      if (planPricePerMbps > 0 && currentPricePerMbps > planPricePerMbps * 1.2) {
        const valueImprovement = ((currentPricePerMbps - planPricePerMbps) / currentPricePerMbps) * 100;
        score += Math.min(valueImprovement * 0.3, 15);
        reasons.push(`${valueImprovement.toFixed(0)}% better value per Mbps (₹${planPricePerMbps.toFixed(1)}/Mbps vs ₹${currentPricePerMbps.toFixed(1)}/Mbps)`);
        if (type === "better_value" || monthlySavings <= 0) type = "better_value";
      }

      // Rule 4: Speed needs based on usage pattern
      if (planSpeedDownMbps > currentSpeedDownMbps) {
        // Higher speed plan
        if (avgDailyDownloadMb > currentSpeedDownMbps * 0.6) {
          // Subscriber is using most of their speed
          score += 15;
          reasons.push(`${planSpeedDownMbps} Mbps would better accommodate your high usage pattern`);
          if (type !== "downgrade") type = "upgrade";
        }
      }

      // Rule 5: Cheaper plan with same or more features
      if (monthlySavings > 0) {
        const savingsPercent = (monthlySavings / currentPlan.priceMonthly) * 100;
        if (planSpeedDownMbps >= currentSpeedDownMbps * 0.8) {
          score += Math.min(savingsPercent * 0.4, 20);
          reasons.push(`Save ${savingsPercent.toFixed(0)}% monthly (₹${monthlySavings.toFixed(0)} savings)`);
          if (type === "better_value") type = "downgrade";
        }
      }

      // Rule 6: Data limit match — subscriber projected usage should be under 80% of new plan
      if (planDataLimitGb) {
        const projectedUsagePercent = (projectedMonthlyGb / planDataLimitGb) * 100;
        if (projectedUsagePercent <= 80) {
          score += 5;
        } else if (projectedUsagePercent > 100) {
          score -= 15;
          reasons.push(`⚠️ Projected usage (${projectedMonthlyGb.toFixed(1)} GB) may exceed ${planDataLimitGb} GB limit`);
        }
      } else {
        // Unlimited data plan — bonus if current plan has a limit
        if (currentPlan.dataLimitGb && projectedMonthlyGb > currentPlan.dataLimitGb * 0.8) {
          score += 10;
          reasons.push("Unlimited data — no overage concerns");
        }
      }

      // Rule 7: Category match bonus
      if (plan.category === currentPlan.category) {
        score += 3;
      }

      // Only include if there's a meaningful reason
      if (reasons.length > 0 && score > 50) {
        scored.push({
          plan,
          score,
          reasons,
          monthlySavings,
          type,
        });
      }
    }

    // Sort by score descending and take top 3
    scored.sort((a, b) => b.score - a.score);
    const topRecommendations = scored.slice(0, 3);

    return NextResponse.json(
      {
        success: true,
        Subscriber: {
          id: subscriber.id,
          name: subscriber.name,
          code: subscriber.code,
          status: subscriber.status,
          areaName: subscriber.Area?.name || null,
        },
        currentPlan: {
          id: currentPlan.id,
          name: currentPlan.name,
          priceMonthly: currentPlan.priceMonthly,
          downloadSpeed: currentPlan.downloadSpeed,
          uploadSpeed: currentPlan.uploadSpeed,
          speedUnit: currentPlan.speedUnit,
          dataLimitGb: currentPlan.dataLimitGb,
          category: currentPlan.category,
        },
        usageAnalysis: {
          daysAnalyzed: totalDays,
          totalDownloadGb: (totalDownloadMb / 1024).toFixed(2),
          totalUploadGb: (totalUploadMb / 1024).toFixed(2),
          avgDailyDownloadMb: avgDailyDownloadMb.toFixed(1),
          avgDailyUploadMb: avgDailyUploadMb.toFixed(1),
          projectedMonthlyGb: projectedMonthlyGb.toFixed(2),
          dataLimitUtilization: currentPlan.dataLimitGb
            ? ((projectedMonthlyGb / currentPlan.dataLimitGb) * 100).toFixed(1)
            : null,
          speedUtilizationPercent: currentSpeedDownMbps > 0 && avgDailyDownloadMb > 0
            ? Math.min((avgDailyDownloadMb * 30 / 30 / currentSpeedDownMbps) * 100, 100).toFixed(1)
            : null,
        },
        recommendations: topRecommendations.map((r) => ({
          planId: r.Plan.id,
          planName: r.Plan.name,
          planPrice: r.Plan.priceMonthly,
          downloadSpeed: r.Plan.downloadSpeed,
          uploadSpeed: r.Plan.uploadSpeed,
          speedUnit: r.Plan.speedUnit,
          dataLimitGb: r.Plan.dataLimitGb,
          category: r.Plan.category,
          score: r.score,
          reasons: r.reasons,
          monthlySavings: r.monthlySavings,
          type: r.type,
          subscriberCount: r.Plan._count.Subscriber,
        })),
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
    console.error("[POST /api/plans/recommend]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ─── GET: Bulk analysis — all subscribers who could benefit ──────────────
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    // Fetch all active subscribers with plans
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
      include: { _count: { select: { Subscriber: true } } },
    });

    // Fetch last 30 days usage for all active subscribers
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10);

    const subscriberIds = subscribers.map((s) => s.id);

    // Batch fetch usage — get all records in one query
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

    const opportunities: {
      subscriberId: string;
      subscriberName: string;
      subscriberCode: string;
      areaName: string | null;
      currentPlanId: string;
      currentPlanName: string;
      currentPlanPrice: number;
      recommendedPlanId: string;
      recommendedPlanName: string;
      recommendedPlanPrice: number;
      type: "downgrade" | "upgrade" | "better_value" | "better_fit";
      monthlySavings: number;
      score: number;
      reasons: string[];
    }[] = [];

    let totalCurrentMRR = 0;

    for (const subscriber of subscribers) {
      if (!subscriber.Plan) continue;

      const currentPlan = subscriber.Plan;
      totalCurrentMRR += currentPlan.priceMonthly;

      const usageRecords = usageBySubscriber.get(subscriber.id) || [];
      const totalDays = usageRecords.length || 1;
      const totalDownloadMb = usageRecords.reduce((sum, r) => sum + r.downloadMb, 0);
      const totalUploadMb = usageRecords.reduce((sum, r) => sum + r.uploadMb, 0);
      const avgDailyDownloadMb = totalDownloadMb / totalDays;
      const avgDailyTotalMb = (totalDownloadMb + totalUploadMb) / totalDays;
      const projectedMonthlyGb = (avgDailyTotalMb * 30) / 1024;

      const currentSpeedDownMbps = currentPlan.downloadSpeed;
      const currentPricePerMbps =
        currentSpeedDownMbps > 0 ? currentPlan.priceMonthly / currentSpeedDownMbps : 0;

      let bestMatch: (typeof opportunities)[0] | null = null;
      let bestScore = 55; // Threshold

      for (const plan of allPlans) {
        if (plan.id === currentPlan.id) continue;

        const reasons: string[] = [];
        let score = 50;
        const monthlySavings = currentPlan.priceMonthly - plan.priceMonthly;
        let type: "downgrade" | "upgrade" | "better_value" | "better_fit" = "better_value";

        const planSpeedDownMbps = plan.downloadSpeed;
        const planPricePerMbps =
          planSpeedDownMbps > 0 ? plan.priceMonthly / planSpeedDownMbps : 0;
        const planDataLimitGb = plan.dataLimitGb;

        // Rule 1: Data usage > 80% of plan limit
        if (planDataLimitGb && currentPlan.dataLimitGb) {
          const usagePercent = currentPlan.dataLimitGb > 0
            ? (projectedMonthlyGb / currentPlan.dataLimitGb) * 100
            : 0;
          if (usagePercent > 80 && planDataLimitGb > currentPlan.dataLimitGb) {
            score += 15;
            reasons.push(`${((planDataLimitGb - currentPlan.dataLimitGb) / currentPlan.dataLimitGb * 100).toFixed(0)}% more data`);
            if (monthlySavings <= 0) type = "upgrade";
          }
        }

        // Rule 2: Better value per Mbps
        if (planPricePerMbps > 0 && currentPricePerMbps > planPricePerMbps * 1.15) {
          const improvement = ((currentPricePerMbps - planPricePerMbps) / currentPricePerMbps) * 100;
          score += Math.min(improvement * 0.3, 12);
          reasons.push(`${improvement.toFixed(0)}% better value per Mbps`);
          type = "better_value";
        }

        // Rule 3: Savings with similar speed
        if (monthlySavings > 0 && planSpeedDownMbps >= currentSpeedDownMbps * 0.7) {
          const savingsPercent = (monthlySavings / currentPlan.priceMonthly) * 100;
          score += Math.min(savingsPercent * 0.4, 18);
          reasons.push(`Save ₹${monthlySavings.toFixed(0)}/mo (${savingsPercent.toFixed(0)}%)`);
          if (planSpeedDownMbps >= currentSpeedDownMbps) type = "better_value";
          else type = "downgrade";
        }

        // Rule 4: Speed upgrade needed
        if (planSpeedDownMbps > currentSpeedDownMbps && avgDailyDownloadMb > currentSpeedDownMbps * 0.5) {
          score += 12;
          reasons.push(`${planSpeedDownMbps} Mbps (vs ${currentSpeedDownMbps} Mbps)`);
          if (type !== "downgrade") type = "upgrade";
        }

        // Rule 5: Unlimited when current has limit and near capacity
        if (!planDataLimitGb && currentPlan.dataLimitGb && projectedMonthlyGb > currentPlan.dataLimitGb * 0.75) {
          score += 8;
          reasons.push("Unlimited data — eliminates overage risk");
        }

        // Rule 6: Data fit check
        if (planDataLimitGb && projectedMonthlyGb > planDataLimitGb) {
          score -= 10;
        }

        // Rule 7: Category match
        if (plan.category === currentPlan.category) {
          score += 3;
        }

        if (score > bestScore && reasons.length > 0) {
          bestScore = score;
          bestMatch = {
            subscriberId: subscriber.id,
            subscriberName: subscriber.name,
            subscriberCode: subscriber.code,
            areaName: subscriber.Area?.name || null,
            currentPlanId: currentPlan.id,
            currentPlanName: currentPlan.name,
            currentPlanPrice: currentPlan.priceMonthly,
            recommendedPlanId: plan.id,
            recommendedPlanName: plan.name,
            recommendedPlanPrice: plan.priceMonthly,
            type,
            monthlySavings,
            score,
            reasons,
          };
        }
      }

      if (bestMatch) {
        opportunities.push(bestMatch);
      }
    }

    // Sort by score descending
    opportunities.sort((a, b) => b.score - a.score);

    // Summary counts
    const savingsCount = opportunities.filter((o) => o.type === "downgrade").length;
    const upgradeCount = opportunities.filter((o) => o.type === "upgrade").length;
    const betterValueCount = opportunities.filter((o) => o.type === "better_value").length;
    const betterFitCount = opportunities.filter((o) => o.type === "better_fit").length;
    const totalPotentialSavings = opportunities
      .filter((o) => o.monthlySavings > 0)
      .reduce((sum, o) => sum + o.monthlySavings, 0);
    const totalPotentialCost = opportunities
      .filter((o) => o.monthlySavings < 0)
      .reduce((sum, o) => sum + Math.abs(o.monthlySavings), 0);

    return NextResponse.json(
      {
        success: true,
        summary: {
          totalSubscribersAnalyzed: subscribers.length,
          totalOpportunities: opportunities.length,
          savingsCount,
          upgradeCount,
          betterValueCount,
          betterFitCount,
          totalPotentialSavings,
          totalPotentialCost,
          netMonthlyImpact: totalPotentialSavings - totalPotentialCost,
        },
        totalCurrentMRR,
        opportunities: opportunities.slice(0, 50), // Top 50
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
    console.error("[GET /api/plans/recommend]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
