import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/dashboard/collection-performance — daily collection data for last 30 days
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    // Calculate the date 30 days ago (start of day)
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    // Fetch ISP settings for daily collection target
    const settings = await db.ispSettings.findUnique({
      where: { id: "default" },
      select: { kpiTargets: true },
    });

    // Parse kpiTargets for dailyCollectionTarget
    let dailyTarget = 0;
    if (settings?.kpiTargets) {
      const kpi = typeof settings.kpiTargets === "string"
        ? JSON.parse(settings.kpiTargets)
        : settings.kpiTargets;
      if (kpi?.dailyCollectionTarget && typeof kpi.dailyCollectionTarget === "number") {
        dailyTarget = kpi.dailyCollectionTarget;
      }
    }

    // Fetch all VERIFIED payments in the last 30 days
    const payments = await db.payment.findMany({
      where: {
        status: "VERIFIED",
        createdAt: { gte: thirtyDaysAgo },
      },
      select: {
        amount: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    // Group payments by date using SQLite-compatible strftime
    const dailyMap = new Map<string, number>();

    // Initialize all 30 days with 0
    for (let i = 0; i < 30; i++) {
      const d = new Date(thirtyDaysAgo);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
      dailyMap.set(key, 0);
    }

    // Sum payments by date
    for (const p of payments) {
      const dateStr = p.createdAt.toISOString().slice(0, 10);
      const current = dailyMap.get(dateStr) || 0;
      dailyMap.set(dateStr, current + p.amount);
    }

    // If no target from settings, calculate from average of non-zero days
    if (dailyTarget === 0) {
      const nonZeroDays = Array.from(dailyMap.values()).filter((v) => v > 0);
      if (nonZeroDays.length > 0) {
        dailyTarget = Math.round(
          nonZeroDays.reduce((sum, v) => sum + v, 0) / nonZeroDays.length
        );
      }
    }

    // Build daily data array
    const dailyData: {
      date: string;
      label: string;
      collected: number;
      target: number;
      achievement: number;
    }[] = [];

    let runningTotal = 0;
    let totalAchievement = 0;
    let daysWithTarget = 0;

    for (const [dateKey, collected] of dailyMap) {
      runningTotal += collected;
      const achievement = dailyTarget > 0 ? Math.round((collected / dailyTarget) * 100) : 0;
      if (dailyTarget > 0) {
        totalAchievement += achievement;
        daysWithTarget++;
      }

      // Format label as DD MMM
      const dateObj = new Date(dateKey + "T00:00:00");
      const label = dateObj.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
      });

      dailyData.push({
        date: dateKey,
        label,
        collected: Math.round(collected * 100) / 100,
        target: dailyTarget,
        achievement,
      });
    }

    const avgAchievement = daysWithTarget > 0 ? Math.round(totalAchievement / daysWithTarget) : 0;
    const totalCollected = Math.round(runningTotal * 100) / 100;
    const daysWithData = dailyData.length;
    const avgDaily = daysWithData > 0 ? Math.round((totalCollected / daysWithData) * 100) / 100 : 0;

    // Find best day
    const bestDay = dailyData.reduce(
      (best, d) => (d.collected > best.collected ? d : best),
      { date: "", label: "", collected: 0, target: 0, achievement: 0 }
    );

    // Days that met/exceeded target
    const daysMetTarget = dailyData.filter((d) => d.collected >= d.target && d.collected > 0).length;

    return NextResponse.json({
      dailyData,
      summary: {
        totalCollected,
        avgDaily,
        bestDay: {
          date: bestDay.date,
          label: bestDay.label,
          amount: bestDay.collected,
        },
        avgAchievement,
        daysMetTarget,
        daysWithData,
        dailyTarget,
        runningTotal,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("Collection performance API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch collection performance data" },
      { status: 500 }
    );
  }
}
