import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    // Fetch all ACTIVE plans from our ISP
    const ourPlans = await db.plan.findMany({
      where: { status: "ACTIVE" },
      orderBy: { downloadSpeed: "asc" },
    });

    // Fetch all competitor entries (latest per plan per competitor)
    const allCompetitors = await db.competitor.findMany({
      orderBy: { createdAt: "desc" },
    });

    // Get latest price history per competitor
    const allPriceHistory = await db.competitorPriceHistory.findMany({
      orderBy: { createdAt: "desc" },
    });

    // Group competitors by name
    const competitorNames = [...new Set(allCompetitors.map(c => c.name))];

    // For each competitor, get their current plans (latest entry per unique planName+speed combo)
    const competitorMap = new Map<string, typeof allCompetitors>();
    for (const c of allCompetitors) {
      const key = `${c.name}|${c.planName}|${c.speed}`;
      if (!competitorMap.has(key)) {
        competitorMap.set(key, c);
      }
    }

    // Build competitor plans array (deduplicated by name|planName|speed)
    const competitorPlans = Array.from(competitorMap.values());

    // Parse speed helper
    function parseSpeedMbps(speedStr: string): number {
      if (!speedStr) return 0;
      const match = speedStr.match(/(\d+)/);
      return match ? parseInt(match[1]) : 0;
    }

    // Define speed tiers
    const tiers = [
      { label: "Up to 50 Mbps", min: 0, max: 50 },
      { label: "51-100 Mbps", min: 51, max: 100 },
      { label: "101-200 Mbps", min: 101, max: 200 },
      { label: "201-500 Mbps", min: 201, max: 500 },
      { label: "500+ Mbps", min: 501, max: 99999 },
    ];

    // Build comparison matrix
    const comparisonMatrix = tiers.map(tier => {
      // Find our plans in this tier
      const ourPlansInTier = ourPlans.filter(p => {
        const mbps = p.downloadSpeed; // plan speeds stored in Mbps (unit migration)
        return mbps >= tier.min && mbps <= tier.max;
      });

      // Find competitor plans in this tier
      const competitorPlansInTier = competitorPlans.filter(c => {
        const mbps = parseSpeedMbps(c.speed);
        return mbps >= tier.min && mbps <= tier.max;
      });

      // Group competitor plans by competitor name
      const competitorPriceMap: Record<string, { name: string; plans: typeof competitorPlans; avgPrice: number; minPrice: number; maxPrice: number }> = {};
      for (const cp of competitorPlansInTier) {
        if (!competitorPriceMap[cp.name]) {
          competitorPriceMap[cp.name] = { name: cp.name, plans: [], avgPrice: 0, minPrice: Infinity, maxPrice: 0 };
        }
        competitorPriceMap[cp.name].plans.push(cp);
      }

      // Calculate competitor averages
      for (const name of Object.keys(competitorPriceMap)) {
        const entry = competitorPriceMap[name];
        const prices = entry.plans.map(p => p.price);
        entry.avgPrice = prices.reduce((a, b) => a + b, 0) / Math.max(1, prices.length);
        entry.minPrice = Math.min(...prices);
        entry.maxPrice = Math.max(...prices);
      }

      // Our average price in tier
      const ourPrices = ourPlansInTier.map(p => p.priceMonthly);
      const ourAvgPrice = ourPrices.length > 0 ? ourPrices.reduce((a, b) => a + b, 0) / ourPrices.length : 0;
      const ourMinPrice = ourPrices.length > 0 ? Math.min(...ourPrices) : 0;
      const ourMaxPrice = ourPrices.length > 0 ? Math.max(...ourPrices) : 0;

      // Market average
      const allPrices = [...ourPrices, ...competitorPlansInTier.map(p => p.price)];
      const marketAvgPrice = allPrices.length > 0 ? allPrices.reduce((a, b) => a + b, 0) / allPrices.length : 0;

      // Value scores (price per Mbps)
      const ourAvgMbps = ourPlansInTier.length > 0
        ? ourPlansInTier.reduce((s, p) => s + p.downloadSpeed, 0) / ourPlansInTier.length
        : 0;
      const ourValueScore = ourAvgPrice > 0 && ourAvgMbps > 0 ? ourAvgPrice / ourAvgMbps : 0;

      // Price advantage vs market average (positive = we're cheaper)
      const priceAdvantage = marketAvgPrice > 0 ? ((marketAvgPrice - ourAvgPrice) / marketAvgPrice) * 100 : 0;

      // Count where we're cheapest, most expensive, competitive
      const allCompetitorAvgs = Object.values(competitorPriceMap).map(e => e.avgPrice);
      const cheapestCount = allCompetitorAvgs.filter(p => ourAvgPrice < p).length;
      const expensiveCount = allCompetitorAvgs.filter(p => ourAvgPrice > p).length;
      const competitiveCount = allCompetitorAvgs.filter(p => {
        const diff = Math.abs(ourAvgPrice - p) / p * 100;
        return diff <= 10;
      }).length;

      return {
        tier: tier.label,
        ourPlans: ourPlansInTier.map(p => ({
          id: p.id,
          name: p.name,
          category: p.category,
          downloadSpeed: p.downloadSpeed,
          uploadSpeed: p.uploadSpeed,
          price: p.priceMonthly,
          dataLimitGb: p.dataLimitGb,
          valueScore: p.downloadSpeed > 0 ? (p.priceMonthly / p.downloadSpeed) : 0,
        })),
        ourAvgPrice: Math.round(ourAvgPrice),
        ourMinPrice: Math.round(ourMinPrice),
        ourMaxPrice: Math.round(ourMaxPrice),
        ourAvgMbps: Math.round(ourAvgMbps),
        ourValueScore: Math.round(ourValueScore * 100) / 100,
        competitorBreakdown: Object.values(competitorPriceMap).map(e => ({
          name: e.name,
          planCount: e.plans.length,
          avgPrice: Math.round(e.avgPrice),
          minPrice: Math.round(e.minPrice),
          maxPrice: Math.round(e.maxPrice),
          planNames: e.plans.map(p => p.planName),
          priceAdvantage: ourAvgPrice > 0 ? Math.round(((ourAvgPrice - e.avgPrice) / e.avgPrice) * 100) : 0,
        })),
        marketAvgPrice: Math.round(marketAvgPrice),
        priceAdvantage: Math.round(priceAdvantage * 10) / 10,
        cheapestVs: cheapestCount,
        expensiveVs: expensiveCount,
        competitiveVs: competitiveCount,
        totalCompetitorsInTier: Object.keys(competitorPriceMap).length,
      };
    });

    // Generate insights
    const insights: string[] = [];
    const totalPlans = ourPlans.length;
    const totalCompetitorPlans = competitorPlans.length;

    insights.push(`We offer ${totalPlans} active plans across ${tiers.filter(t => comparisonMatrix.find(m => m.tier === t.label)?.ourPlans.length).length} speed tiers, competing against ${competitorNames.length} competitors with ${totalCompetitorPlans} tracked plans.`);

    for (const row of comparisonMatrix) {
      if (row.ourPlans.length === 0) continue;
      if (row.priceAdvantage > 10) {
        insights.push(`In ${row.tier}, we are on average ${Math.abs(Math.round(row.priceAdvantage))}% cheaper than market average (our avg: ${formatINR(row.ourAvgPrice)} vs market: ${formatINR(row.marketAvgPrice)}).`);
      } else if (row.priceAdvantage < -10) {
        insights.push(`In ${row.tier}, we are ${Math.abs(Math.round(row.priceAdvantage))}% above market average (our avg: ${formatINR(row.ourAvgPrice)} vs market: ${formatINR(row.marketAvgPrice)}). Consider price adjustments.`);
      } else {
        insights.push(`In ${row.tier}, our pricing is within 10% of market average (our avg: ${formatINR(row.ourAvgPrice)} vs market: ${formatINR(row.marketAvgPrice)}).`);
      }

      // Find worst value competitor
      if (row.competitorBreakdown.length > 0) {
        const worstCompetitor = row.competitorBreakdown.reduce((worst, c) =>
          Math.abs(c.priceAdvantage) > Math.abs(worst.priceAdvantage) ? c : worst
        );
        if (worstCompetitor.priceAdvantage < -20) {
          insights.push(`${worstCompetitor.name} undercuts us by ${Math.abs(worstCompetitor.priceAdvantage)}% in ${row.tier} — a significant competitive threat.`);
        }
      }
    }

    // Value score insight
    const valueScores = comparisonMatrix.filter(m => m.ourValueScore > 0).map(m => m.ourValueScore);
    if (valueScores.length > 0) {
      const avgValue = valueScores.reduce((a, b) => a + b, 0) / valueScores.length;
      insights.push(`Our average value score (price per Mbps) is ${formatINR(Math.round(avgValue))}/Mbps across all tiers.`);
    }

    return NextResponse.json({
      ourPlans: ourPlans.map(p => ({
        id: p.id,
        name: p.name,
        category: p.category,
        downloadSpeed: p.downloadSpeed,
        uploadSpeed: p.uploadSpeed,
        price: p.priceMonthly,
        dataLimitGb: p.dataLimitGb,
        valueScore: p.downloadSpeed > 0 ? (p.priceMonthly / p.downloadSpeed) : 0,
      })),
      competitors: competitorNames.map(name => {
        const plans = competitorPlans.filter(c => c.name === name);
        return {
          name,
          planCount: plans.length,
          avgPrice: Math.round(plans.reduce((s, p) => s + p.price, 0) / Math.max(1, plans.length)),
          minPrice: Math.round(Math.min(...plans.map(p => p.price))),
          maxPrice: Math.round(Math.max(...plans.map(p => p.price))),
        };
      }),
      comparisonMatrix,
      insights,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Competitor comparison error:", error);
    return NextResponse.json({ error: "Failed to generate comparison" }, { status: 500 });
  }
}

function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}
