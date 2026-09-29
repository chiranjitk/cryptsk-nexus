import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    // Fetch our active plans
    const ourPlans = await db.plan.findMany({
      where: { status: "ACTIVE" },
      orderBy: { downloadSpeed: "asc" },
    });

    // Fetch all competitors
    const allCompetitors = await db.competitor.findMany();

    // Fetch all price history
    const allPriceHistory = await db.competitorPriceHistory.findMany({
      orderBy: { createdAt: "asc" },
    });

    // Fetch recent subscribers (for sensitivity analysis)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const recentSubscribers = await db.subscriber.findMany({
      where: { createdAt: { gte: sixMonthsAgo } },
      select: { id: true, createdAt: true, planId: true, status: true },
    });

    // Fetch win/loss records
    const winLossRecords = await db.winLossAnalysis.findMany({
      orderBy: { createdAt: "desc" },
    });

    // === Competitor Price Movement Tracking ===
    // Group price history by competitor, get latest vs previous price per competitor
    const competitorNames = [...new Set(allCompetitors.map(c => c.name))];
    const competitorPriceMovements = competitorNames.map(name => {
      const compEntries = allCompetitors.filter(c => c.name === name);
      const compIds = compEntries.map(c => c.id);
      const history = allPriceHistory.filter(h => compIds.includes(h.competitorId));

      // Current prices per plan
      const currentPrices = compEntries.map(c => ({
        planName: c.planName,
        speed: c.speed,
        currentPrice: c.price,
      }));

      // Latest price change per competitor plan
      const latestChanges: { planName: string; speed: string; oldPrice: number; newPrice: number; changedAt: string; direction: string }[] = [];
      const seenPlans = new Set<string>();

      for (const h of history) {
        const key = `${h.competitorId}|${h.planName}`;
        if (!seenPlans.has(key)) {
          seenPlans.add(key);
          const direction = h.newPrice > h.oldPrice ? "increase" : h.newPrice < h.oldPrice ? "decrease" : "unchanged";
          latestChanges.push({
            planName: h.planName,
            speed: h.speed,
            oldPrice: h.oldPrice,
            newPrice: h.newPrice,
            changedAt: h.createdAt.toISOString(),
            direction,
          });
        }
      }

      const avgCurrentPrice = compEntries.length > 0
        ? compEntries.reduce((s, c) => s + c.price, 0) / compEntries.length
        : 0;

      const priceIncreases = latestChanges.filter(c => c.direction === "increase").length;
      const priceDecreases = latestChanges.filter(c => c.direction === "decrease").length;
      const avgChangePercent = latestChanges.length > 0
        ? latestChanges.reduce((s, c) => s + ((c.newPrice - c.oldPrice) / Math.max(1, c.oldPrice)) * 100, 0) / latestChanges.length
        : 0;

      return {
        name,
        planCount: compEntries.length,
        avgCurrentPrice: Math.round(avgCurrentPrice),
        latestChanges,
        priceIncreases,
        priceDecreases,
        avgChangePercent: Math.round(avgChangePercent * 10) / 10,
        trend: avgChangePercent > 2 ? "increasing" : avgChangePercent < -2 ? "decreasing" : "stable",
      };
    });

    // === Price Gap Analysis ===
    // Compare our plans vs market average by speed tier
    function parseSpeedMbps(speedStr: string): number {
      if (!speedStr) return 0;
      const match = speedStr.match(/(\d+)/);
      return match ? parseInt(match[1]) : 0;
    }

    const tiers = [
      { label: "Up to 50 Mbps", min: 0, max: 50 },
      { label: "51-100 Mbps", min: 51, max: 100 },
      { label: "101-200 Mbps", min: 101, max: 200 },
      { label: "201-500 Mbps", min: 201, max: 500 },
      { label: "500+ Mbps", min: 501, max: 99999 },
    ];

    const priceGapAnalysis = tiers.map(tier => {
      const ourPlansInTier = ourPlans.filter(p => {
        const mbps = p.downloadSpeed / 1000;
        return mbps >= tier.min && mbps <= tier.max;
      });

      const compPlansInTier = allCompetitors.filter(c => {
        const mbps = parseSpeedMbps(c.speed);
        return mbps >= tier.min && mbps <= tier.max;
      });

      const ourAvgPrice = ourPlansInTier.length > 0
        ? ourPlansInTier.reduce((s, p) => s + p.priceMonthly, 0) / ourPlansInTier.length
        : 0;

      const compAvgPrice = compPlansInTier.length > 0
        ? compPlansInTier.reduce((s, c) => s + c.price, 0) / compPlansInTier.length
        : 0;

      const gapPercent = compAvgPrice > 0
        ? Math.round(((ourAvgPrice - compAvgPrice) / compAvgPrice) * 100)
        : 0;

      return {
        tier: tier.label,
        ourAvgPrice: Math.round(ourAvgPrice),
        competitorAvgPrice: Math.round(compAvgPrice),
        gapPercent,
        status: gapPercent > 10 ? "OVERPRICED" : gapPercent < -10 ? "UNDERPRICED" : "COMPETITIVE",
        ourPlanCount: ourPlansInTier.length,
        competitorPlanCount: compPlansInTier.length,
      };
    });

    // Overall gap
    const ourOverallAvg = ourPlans.length > 0
      ? ourPlans.reduce((s, p) => s + p.priceMonthly, 0) / ourPlans.length
      : 0;
    const compOverallAvg = allCompetitors.length > 0
      ? allCompetitors.reduce((s, c) => s + c.price, 0) / allCompetitors.length
      : 0;
    const overallGapPercent = compOverallAvg > 0
      ? Math.round(((ourOverallAvg - compOverallAvg) / compOverallAvg) * 100)
      : 0;

    // === Price Sensitivity Analysis ===
    // Monthly new subscriber acquisition vs loss count
    const monthlyAcquisition: { month: string; year: number; monthNum: number; newSubscribers: number; lostToCompetitor: number; netChange: number }[] = [];
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const nextMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

      const newSubs = recentSubscribers.filter(s => {
        const c = s.createdAt;
        return c >= d && c < nextMonth;
      }).length;

      const lostToCompetitor = winLossRecords.filter(r => {
        const c = r.createdAt;
        return c >= d && c < nextMonth && r.result === "LOSS";
      }).length;

      monthlyAcquisition.push({
        month: d.toLocaleString("en-US", { month: "short" }),
        year: d.getFullYear(),
        monthNum: d.getMonth(),
        newSubscribers: newSubs,
        lostToCompetitor: lostToCompetitor,
        netChange: newSubs - lostToCompetitor,
      });
    }

    // === Actionable Pricing Recommendations ===
    const recommendations: { id: string; type: string; priority: string; plan: string; currentPrice: number; suggestedPrice: number; competitor: string; reason: string; potentialImpact: string }[] = [];
    let recId = 1;

    for (const tier of priceGapAnalysis) {
      if (tier.status === "OVERPRICED" && tier.ourPlanCount > 0) {
        const reduction = Math.round(tier.ourAvgPrice * 0.1); // Suggest 10% reduction
        // Find the most threatening competitor in this tier
        const threateningComp = competitorPriceMovements.find(c => {
          const compAvg = c.avgCurrentPrice;
          return compAvg > 0 && compAvg < tier.ourAvgPrice;
        });

        recommendations.push({
          id: String(recId++),
          type: "PRICE_REDUCTION",
          priority: tier.gapPercent > 20 ? "HIGH" : "MEDIUM",
          plan: tier.tier,
          currentPrice: tier.ourAvgPrice,
          suggestedPrice: tier.ourAvgPrice - reduction,
          competitor: threateningComp ? threateningComp.name : "Market Average",
          reason: `${tier.tier} plan is ${tier.gapPercent}% above market average (${formatINR(tier.ourAvgPrice)} vs ${formatINR(tier.competitorAvgPrice)}).`,
          potentialImpact: `A ${formatINR(reduction)} reduction could improve win rate by an estimated ${Math.min(tier.gapPercent, 30)}% based on price sensitivity.`,
        });
      }

      if (tier.status === "UNDERPRICED" && tier.ourPlanCount > 0) {
        const increase = Math.round(tier.ourAvgPrice * 0.05); // Suggest 5% increase
        recommendations.push({
          id: String(recId++),
          type: "PRICE_INCREASE",
          priority: "LOW",
          plan: tier.tier,
          currentPrice: tier.ourAvgPrice,
          suggestedPrice: tier.ourAvgPrice + increase,
          competitor: "Market Average",
          reason: `${tier.tier} plan is ${Math.abs(tier.gapPercent)}% below market average — room for price increase.`,
          potentialImpact: `A ${formatINR(increase)} increase could add ${formatINR(increase * tier.ourPlanCount)}/month revenue with minimal churn risk.`,
        });
      }
    }

    // Competitor-specific alerts
    for (const comp of competitorPriceMovements) {
      if (comp.trend === "decreasing" && comp.avgChangePercent < -5) {
        recommendations.push({
          id: String(recId++),
          type: "COMPETITOR_ALERT",
          priority: "HIGH",
          plan: "All Tiers",
          currentPrice: 0,
          suggestedPrice: 0,
          competitor: comp.name,
          reason: `${comp.name} is aggressively reducing prices (avg ${comp.avgChangePercent}% decrease). Monitor closely for market disruption.`,
          potentialImpact: `May trigger price war. Consider value-added services rather than matching prices.`,
        });
      }

      if (comp.trend === "increasing" && comp.avgChangePercent > 5) {
        recommendations.push({
          id: String(recId++),
          type: "OPPORTUNITY",
          priority: "MEDIUM",
          plan: "All Tiers",
          currentPrice: 0,
          suggestedPrice: 0,
          competitor: comp.name,
          reason: `${comp.name} is increasing prices (avg ${comp.avgChangePercent}% increase). Opportunity to attract their price-sensitive customers.`,
          potentialImpact: `Targeted marketing campaigns could capture subscribers from ${comp.name}.`,
        });
      }
    }

    // Sort recommendations by priority
    const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return NextResponse.json({
      priceMovements: competitorPriceMovements,
      priceGapAnalysis,
      overallGapPercent,
      monthlyAcquisition,
      recommendations,
      summary: {
        totalCompetitors: competitorNames.length,
        competitorsIncreasing: competitorPriceMovements.filter(c => c.trend === "increasing").length,
        competitorsDecreasing: competitorPriceMovements.filter(c => c.trend === "decreasing").length,
        competitorsStable: competitorPriceMovements.filter(c => c.trend === "stable").length,
        ourAvgPrice: Math.round(ourOverallAvg),
        marketAvgPrice: Math.round(compOverallAvg),
        overpricedTiers: priceGapAnalysis.filter(t => t.status === "OVERPRICED").length,
        competitiveTiers: priceGapAnalysis.filter(t => t.status === "COMPETITIVE").length,
        underpricedTiers: priceGapAnalysis.filter(t => t.status === "UNDERPRICED").length,
        highPriorityActions: recommendations.filter(r => r.priority === "HIGH").length,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Pricing intelligence error:", error);
    return NextResponse.json({ error: "Failed to generate pricing intelligence" }, { status: 500 });
  }
}

function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}
