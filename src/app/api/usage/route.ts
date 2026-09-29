import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/usage — Admin: Get usage stats for all or specific subscriber
export async function GET(req: NextRequest) {
  try {
    try {
      await requireAuth(req);
    } catch (error) {
      if (error instanceof AuthError)
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    const { searchParams } = new URL(req.url);
    const subscriberId = searchParams.get("subscriberId");
    const days = parseInt(searchParams.get("days") || "30", 10);
    const top = parseInt(searchParams.get("top") || "10", 10);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().slice(0, 10);

    if (subscriberId) {
      // Single subscriber usage
      const records = await db.dataUsage.findMany({
        where: { subscriberId, date: { gte: startDateStr } },
        orderBy: { date: "desc" },
      });

      const totalUsage = records.reduce((sum, r) => sum + r.totalMb, 0);

      return NextResponse.json({
        subscriberId,
        totalUsageMb: Math.round(totalUsage),
        avgDailyMb: records.length > 0 ? Math.round(totalUsage / records.length) : 0,
        days: records.length,
        records: records.map((r) => ({
          date: r.date,
          downloadMb: Math.round(r.downloadMb * 10) / 10,
          uploadMb: Math.round(r.uploadMb * 10) / 10,
          totalMb: Math.round(r.totalMb * 10) / 10,
        })),
      });
    }

    // Aggregate stats for all subscribers
    const topUsers = await db.dataUsage.groupBy({
      by: ["subscriberId"],
      where: { date: { gte: startDateStr } },
      _sum: { totalMb: true, downloadMb: true, uploadMb: true },
      orderBy: { _sum: { totalMb: "desc" } },
      take: top,
    });

    const enrichedTop = await Promise.all(
      topUsers.map(async (u) => {
        const sub = await db.subscriber.findUnique({
          where: { id: u.subscriberId },
          select: { name: true, code: true, Plan: { select: { name: true, dataLimitGb: true } } },
        });
        return {
          subscriberId: u.subscriberId,
          subscriberName: sub?.name || "Unknown",
          subscriberCode: sub?.code || "",
          planName: sub?.Plan?.name || "",
          dataLimitGb: sub?.Plan?.dataLimitGb || 0,
          totalUsageMb: Math.round(u._sum.totalMb || 0),
          downloadMb: Math.round(u._sum.downloadMb || 0),
          uploadMb: Math.round(u._sum.uploadMb || 0),
        };
      }),
    );

    // Overall network stats
    const networkTotal = await db.dataUsage.aggregate({
      where: { date: { gte: startDateStr } },
      _sum: { totalMb: true, downloadMb: true, uploadMb: true },
    });

    // Today's stats
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayStats = await db.dataUsage.aggregate({
      where: { date: todayStr },
      _sum: { totalMb: true, downloadMb: true, uploadMb: true },
      _count: true,
    });

    // Unique subscribers with usage today
    const activeToday = await db.dataUsage.groupBy({
      by: ["subscriberId"],
      where: { date: todayStr },
    });

    return NextResponse.json({
      network: {
        totalUsageMb: Math.round(networkTotal._sum.totalMb || 0),
        totalDownloadMb: Math.round(networkTotal._sum.downloadMb || 0),
        totalUploadMb: Math.round(networkTotal._sum.uploadMb || 0),
        daysAnalyzed: days,
      },
      today: {
        totalUsageMb: Math.round(todayStats._sum.totalMb || 0),
        downloadMb: Math.round(todayStats._sum.downloadMb || 0),
        uploadMb: Math.round(todayStats._sum.uploadMb || 0),
        activeSubscribers: activeToday.length,
      },
      topUsers: enrichedTop,
    });
  } catch (error) {
    console.error("[usage] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
