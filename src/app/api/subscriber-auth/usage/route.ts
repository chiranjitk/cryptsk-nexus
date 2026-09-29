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
    include: { Plan: { select: { dataLimitGb: true, name: true } } },
  });
}

// GET /api/subscriber-auth/usage — Get subscriber's data usage history
export async function GET(req: NextRequest) {
  try {
    const subscriber = await getSubscriberFromToken(req);
    if (!subscriber) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get("days") || "30", 10);

    // Get daily usage for the last N days
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().slice(0, 10);

    const usageRecords = await db.dataUsage.findMany({
      where: {
        subscriberId: subscriber.id,
        date: { gte: startDateStr },
      },
      orderBy: { date: "asc" },
    });

    // Calculate totals
    const totalDownload = usageRecords.reduce((sum, r) => sum + r.downloadMb, 0);
    const totalUpload = usageRecords.reduce((sum, r) => sum + r.uploadMb, 0);
    const totalUsage = totalDownload + totalUpload;
    const avgDailyUsage = usageRecords.length > 0 ? totalUsage / usageRecords.length : 0;

    // Get plan data limit
    const dataLimitMb = (subscriber.Plan?.dataLimitGb || 500) * 1024;
    const usagePercent = dataLimitMb > 0 ? Math.min((totalUsage / dataLimitMb) * 100, 100) : 0;

    // Calculate cycle dates based on activation/billing start
    const cycleStart = subscriber.billingStartDate
      ? new Date(subscriber.billingStartDate).toISOString().slice(0, 10)
      : startDateStr;
    const cycleEnd = subscriber.billingStartDate
      ? (() => {
          const start = new Date(subscriber.billingStartDate!);
          const end = new Date(start);
          end.setMonth(end.getMonth() + 1);
          return end.toISOString().slice(0, 10);
        })()
      : new Date().toISOString().slice(0, 10);

    // Daily breakdown matching UsageData interface
    const dailyUsage = usageRecords.map((r) => ({
      date: r.date,
      download: Math.round(r.downloadMb * 10) / 10,
      upload: Math.round(r.uploadMb * 10) / 10,
      total: Math.round(r.totalMb * 10) / 10,
    }));

    // Weekly aggregation
    const weeklyAgg: Record<string, { download: number; upload: number; total: number; days: number }> = {};
    for (const r of usageRecords) {
      const weekStart = new Date(r.date);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekKey = weekStart.toISOString().slice(0, 10);
      if (!weeklyAgg[weekKey]) weeklyAgg[weekKey] = { download: 0, upload: 0, total: 0, days: 0 };
      weeklyAgg[weekKey].download += r.downloadMb;
      weeklyAgg[weekKey].upload += r.uploadMb;
      weeklyAgg[weekKey].total += r.totalMb;
      weeklyAgg[weekKey].days += 1;
    }

    // Return in format matching both UsageData interface and enriched summary
    return NextResponse.json({
      success: true,
      data: {
        currentUsed: Math.round(totalUsage),
        dataLimit: dataLimitMb,
        percentage: Math.round(usagePercent * 10) / 10,
        dailyUsage,
        cycleStart,
        cycleEnd,
      },
      summary: {
        totalDownload: Math.round(totalDownload),
        totalUpload: Math.round(totalUpload),
        totalUsage: Math.round(totalUsage),
        avgDailyUsage: Math.round(avgDailyUsage),
        dataLimitMb,
        usagePercent: Math.round(usagePercent * 10) / 10,
        remainingMb: Math.max(0, Math.round(dataLimitMb - totalUsage)),
        daysAnalyzed: usageRecords.length,
        planName: subscriber.Plan?.name || "Unknown",
      },
      weeklyUsage: Object.entries(weeklyAgg).map(([week, data]) => ({
        weekStart: week,
        download: Math.round(data.download),
        upload: Math.round(data.upload),
        total: Math.round(data.total),
        days: data.days,
        avgDaily: Math.round(data.total / data.days),
      })),
    });
  } catch (error) {
    console.error("[subscriber-usage] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
