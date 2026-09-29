import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "30d";

    // Calculate date range
    const now = new Date();
    let startDate = new Date();
    if (period === "7d") startDate.setDate(now.getDate() - 7);
    else if (period === "90d") startDate.setDate(now.getDate() - 90);
    else startDate.setDate(now.getDate() - 30);

    // Get total sent and delivery stats
    const [total, delivered, failed, pending, byType] = await Promise.all([
      db.notification.count({ where: { createdAt: { gte: startDate } } }),
      db.notification.count({ where: { createdAt: { gte: startDate }, status: "DELIVERED" } }),
      db.notification.count({ where: { createdAt: { gte: startDate }, status: "FAILED" } }),
      db.notification.count({ where: { createdAt: { gte: startDate }, status: "PENDING" } }),
      db.notification.groupBy({
        by: ["type"],
        where: { createdAt: { gte: startDate } },
        _count: { id: true },
      }),
    ]);

    // Get sent count (SENT + DELIVERED)
    const sent = await db.notification.count({
      where: { createdAt: { gte: startDate }, status: { in: ["SENT", "DELIVERED"] } },
    });

    const deliveryRate = total > 0 ? Math.round((delivered / total) * 100) : 0;
    const failureRate = total > 0 ? Math.round((failed / total) * 100) : 0;

    // Channel breakdown for pie chart
    const channelBreakdown = byType.map((t) => ({
      name: t.type,
      value: t._count.id,
    }));

    // Daily trend: batch fetch all notifications in range, then aggregate in JS to avoid N+1 (was up to 270 queries)
    const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
    const notificationsInRange = await db.notification.findMany({
      where: { createdAt: { gte: startDate } },
      select: { createdAt: true, status: true },
    });

    const dailyCountsMap = new Map<string, { total: number; delivered: number; failed: number }>();
    for (const n of notificationsInRange) {
      const dateKey = n.createdAt.toISOString().split("T")[0];
      const counts = dailyCountsMap.get(dateKey) || { total: 0, delivered: 0, failed: 0 };
      counts.total++;
      if (n.status === "DELIVERED") counts.delivered++;
      if (n.status === "FAILED") counts.failed++;
      dailyCountsMap.set(dateKey, counts);
    }

    const dailyTrend: Array<{ date: string; label: string; total: number; delivered: number; failed: number }> = [];
    for (let i = days - 1; i >= 0; i--) {
      const dayStart = new Date();
      dayStart.setDate(now.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);
      const dateKey = dayStart.toISOString().split("T")[0];
      const counts = dailyCountsMap.get(dateKey) || { total: 0, delivered: 0, failed: 0 };

      dailyTrend.push({
        date: dateKey,
        label: dayStart.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
        ...counts,
      });
    }

    return NextResponse.json({
      period,
      startDate: startDate.toISOString(),
      endDate: now.toISOString(),
      summary: {
        total,
        sent,
        delivered,
        failed,
        pending,
        deliveryRate,
        failureRate,
      },
      channelBreakdown,
      dailyTrend,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Notification analytics error:", error);
    return NextResponse.json({ error: "Failed to fetch notification analytics" }, { status: 500 });
  }
}
