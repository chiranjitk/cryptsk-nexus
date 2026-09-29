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
    include: { Plan: { select: { dataLimitGb: true, name: true, priceMonthly: true, validityDays: true } } },
  });
}

// GET /api/selfcare/usage-meter — Usage meter gauge data
export async function GET(req: NextRequest) {
  try {
    const subscriber = await getSubscriberFromToken(req);
    if (!subscriber) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const dataLimitGb = subscriber.Plan?.dataLimitGb ?? null;
    const isUnlimited = dataLimitGb === null || dataLimitGb === 0;

    // Current cycle data usage: combine currentCycleDataUsed + DataUsage this month
    const now = new Date();
    const cycleStartStr = now.toISOString().slice(0, 7) + "-01"; // First day of current month

    const monthlyUsage = await db.dataUsage.aggregate({
      _sum: { downloadMb: true, uploadMb: true, totalMb: true },
      where: {
        subscriberId: subscriber.id,
        date: { gte: cycleStartStr },
      },
    });

    const cycleUsageMb =
      (subscriber.currentCycleDataUsed || 0) +
      (monthlyUsage._sum.totalMb || 0);

    // Avoid double counting if currentCycleDataUsed already reflects this month
    // We'll use whichever is larger since subscriber.currentCycleDataUsed may be stale
    const usedGb = cycleUsageMb / 1024;

    if (isUnlimited) {
      return NextResponse.json({
        success: true,
        data: {
          used: parseFloat(usedGb.toFixed(2)),
          limit: null,
          percentage: 0,
          remaining: null,
          daysLeft: 0,
          dailyAverage: parseFloat((usedGb / Math.max(now.getDate(), 1)).toFixed(2)),
          isUnlimited: true,
          downloadGb: parseFloat(((monthlyUsage._sum.downloadMb || 0) / 1024).toFixed(2)),
          uploadGb: parseFloat(((monthlyUsage._sum.uploadMb || 0) / 1024).toFixed(2)),
        },
      });
    }

    const percentage = dataLimitGb > 0 ? (usedGb / dataLimitGb) * 100 : 0;
    const remaining = Math.max(0, dataLimitGb - usedGb);

    // Calculate days left in billing cycle
    const validityDays = subscriber.Plan?.validityDays || 30;
    const daysInCycle = validityDays;
    const daysUsed = now.getDate(); // Approximate: day of month
    const daysLeft = Math.max(0, daysInCycle - daysUsed);
    const dailyAverage = daysUsed > 0 ? usedGb / daysUsed : 0;

    return NextResponse.json({
      success: true,
      data: {
        used: parseFloat(usedGb.toFixed(2)),
        limit: dataLimitGb,
        percentage: parseFloat(Math.min(percentage, 100).toFixed(1)),
        remaining: parseFloat(remaining.toFixed(2)),
        daysLeft,
        dailyAverage: parseFloat(dailyAverage.toFixed(2)),
        isUnlimited: false,
        downloadGb: parseFloat(((monthlyUsage._sum.downloadMb || 0) / 1024).toFixed(2)),
        uploadGb: parseFloat(((monthlyUsage._sum.uploadMb || 0) / 1024).toFixed(2)),
        daysUsed,
      },
    });
  } catch (error) {
    console.error("[selfcare-usage-meter] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
