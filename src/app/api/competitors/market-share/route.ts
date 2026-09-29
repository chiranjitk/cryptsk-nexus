import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    // Fetch all win/loss records
    const allRecords = await db.winLossAnalysis.findMany({
      orderBy: { createdAt: "desc" },
    });

    // Fetch all competitors for market share
    const allCompetitors = await db.competitor.findMany();

    // Fetch all subscribers
    const totalSubscribers = await db.subscriber.count({
      where: { status: "ACTIVE" },
    });

    // Group records by competitor name
    const competitorMap: Record<string, { wins: number; losses: number; reasons: { reason: string; count: number; result: string }[]; records: typeof allRecords }> = {};

    for (const r of allRecords) {
      const name = r.competitorName || "Unknown";
      if (!competitorMap[name]) {
        competitorMap[name] = { wins: 0, losses: 0, reasons: [], records: [] };
      }
      const entry = competitorMap[name];
      entry.records.push(r);

      if (r.result === "WIN") {
        entry.wins++;
      } else {
        entry.losses++;
      }

      // Track reasons
      if (r.reason) {
        const existing = entry.reasons.find(x => x.reason === r.reason);
        if (existing) {
          existing.count++;
        } else {
          entry.reasons.push({ reason: r.reason, count: 1, result: r.result });
        }
      }
    }

    // Build competitor list with win/loss stats
    const competitors = Object.entries(competitorMap).map(([name, data]) => {
      const total = data.wins + data.losses;
      const winRate = total > 0 ? Math.round((data.wins / total) * 100) : 0;
      return {
        name,
        wins: data.wins,
        losses: data.losses,
        total,
        winRate,
        topWinReasons: data.reasons
          .filter(r => r.result === "WIN")
          .sort((a, b) => b.count - a.count)
          .slice(0, 3)
          .map(r => ({ reason: r.reason, count: r.count })),
        topLossReasons: data.reasons
          .filter(r => r.result === "LOSS")
          .sort((a, b) => b.count - a.count)
          .slice(0, 3)
          .map(r => ({ reason: r.reason, count: r.count })),
      };
    }).sort((a, b) => b.total - a.total);

    // Monthly win/loss trend (last 6 months)
    const now = new Date();
    const months: { label: string; year: number; month: number; wins: number; losses: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        label: d.toLocaleString("en-US", { month: "short", year: "2-digit" }),
        year: d.getFullYear(),
        month: d.getMonth(),
        wins: 0,
        losses: 0,
      });
    }

    for (const r of allRecords) {
      const rDate = new Date(r.createdAt);
      const monthEntry = months.find(m =>
        m.year === rDate.getFullYear() && m.month === rDate.getMonth()
      );
      if (monthEntry) {
        if (r.result === "WIN") monthEntry.wins++;
        else monthEntry.losses++;
      }
    }

    // Top reasons across all competitors
    const allWinReasons: Record<string, number> = {};
    const allLossReasons: Record<string, number> = {};

    for (const r of allRecords) {
      if (!r.reason) continue;
      if (r.result === "WIN") {
        allWinReasons[r.reason] = (allWinReasons[r.reason] || 0) + 1;
      } else {
        allLossReasons[r.reason] = (allLossReasons[r.reason] || 0) + 1;
      }
    }

    const topReasons = {
      win: Object.entries(allWinReasons)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([reason, count]) => ({ reason, count })),
      loss: Object.entries(allLossReasons)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([reason, count]) => ({ reason, count })),
    };

    // Market share estimate based on competitor tracking data + our active subscribers
    const uniqueCompetitorNames = [...new Set(allCompetitors.map(c => c.name))];
    const competitorSubscriberEstimates = uniqueCompetitorNames.map(name => {
      const plans = allCompetitors.filter(c => c.name === name);
      const avgPrice = plans.reduce((s, p) => s + p.price, 0) / Math.max(1, plans.length);
      const avgSpeed = plans.reduce((s, p) => {
        const match = p.speed.match(/(\d+)/);
        return s + (match ? parseInt(match[1]) : 0);
      }, 0) / Math.max(1, plans.length);
      // Estimate based on value score (Mbps/price)
      const valueScore = avgPrice > 0 ? avgSpeed / avgPrice : 0;
      return {
        name,
        planCount: plans.length,
        avgPrice: Math.round(avgPrice),
        avgSpeed: Math.round(avgSpeed),
        valueScore: Math.round(valueScore * 100) / 100,
        estimatedMarketShare: 0, // Will be calculated below
      };
    });

    // Simple market share estimation: weight by plan count + value score
    const totalWeight = totalSubscribers + competitorSubscriberEstimates.reduce((s, c) => s + c.valueScore * c.planCount * 100, 0);
    const ourMarketShare = totalWeight > 0 ? Math.round((totalSubscribers / totalWeight) * 100) : 50;

    let remainingShare = 100 - ourMarketShare;
    const compTotalWeight = competitorSubscriberEstimates.reduce((s, c) => s + c.valueScore * c.planCount * 100, 0);
    for (const comp of competitorSubscriberEstimates) {
      comp.estimatedMarketShare = compTotalWeight > 0
        ? Math.round((comp.valueScore * comp.planCount * 100 / compTotalWeight) * remainingShare)
        : 0;
    }

    const marketShare = [
      { name: "Our ISP", share: ourMarketShare, subscribers: totalSubscribers },
      ...competitorSubscriberEstimates.map(c => ({
        name: c.name,
        share: c.estimatedMarketShare,
        subscribers: Math.round((c.estimatedMarketShare / 100) * (totalSubscribers / (ourMarketShare / 100))),
      })),
    ].sort((a, b) => b.share - a.share);

    // Total wins and losses
    const totalWins = allRecords.filter(r => r.result === "WIN").length;
    const totalLosses = allRecords.filter(r => r.result === "LOSS").length;
    const overallWinRate = (totalWins + totalLosses) > 0 ? Math.round((totalWins / (totalWins + totalLosses)) * 100) : 0;

    return NextResponse.json({
      competitors,
      winLossTrend: months,
      topReasons,
      marketShare,
      summary: {
        totalCompetitorsTracked: uniqueCompetitorNames.length,
        totalCompetitorPlans: allCompetitors.length,
        totalRecords: allRecords.length,
        totalWins,
        totalLosses,
        overallWinRate,
        ourActiveSubscribers: totalSubscribers,
        ourMarketShare,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Market share analysis error:", error);
    return NextResponse.json({ error: "Failed to generate market share analysis" }, { status: 500 });
  }
}
