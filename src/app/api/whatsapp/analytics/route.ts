import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    // Total messages
    const totalMessages = await db.notification.count({
      where: { type: "WHATSAPP" },
    });

    // Count by status
    const statusCounts = await db.notification.groupBy({
      by: ["status"],
      where: { type: "WHATSAPP" },
      _count: { status: true },
    });

    const statusMap: Record<string, number> = {};
    for (const s of statusCounts) {
      statusMap[s.status] = s._count.status;
    }

    const delivered = statusMap["DELIVERED"] || 0;
    const read = statusMap["READ"] || 0;
    const sent = statusMap["SENT"] || 0;
    const failed = statusMap["FAILED"] || 0;

    const deliveredRate = totalMessages > 0 ? ((delivered + read) / totalMessages) * 100 : 0;
    const readRate = (delivered + read) > 0 ? (read / (delivered + read)) * 100 : 0;
    const replyRate = totalMessages > 0 ? Math.min((read / totalMessages) * 100, 100) : 0;

    // Message volume over time (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailyMessages = await db.notification.groupBy({
      by: ["createdAt"],
      where: {
        type: "WHATSAPP",
        createdAt: { gte: thirtyDaysAgo },
      },
      _count: { id: true },
    });

    // Group by date
    const volumeByDate: Record<string, number> = {};
    for (const d of dailyMessages) {
      const dateKey = d.createdAt.toISOString().split("T")[0];
      volumeByDate[dateKey] = (volumeByDate[dateKey] || 0) + d._count.id;
    }

    // Build continuous date range
    const volumeData: { date: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      volumeData.push({ date: key, count: volumeByDate[key] || 0 });
    }

    // Rate limits: count today and this month
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const todayCount = await db.notification.count({
      where: { type: "WHATSAPP", createdAt: { gte: todayStart } },
    });

    const monthCount = await db.notification.count({
      where: { type: "WHATSAPP", createdAt: { gte: monthStart } },
    });

    return NextResponse.json({
      stats: {
        totalMessages,
        deliveredRate: Math.round(deliveredRate * 10) / 10,
        readRate: Math.round(readRate * 10) / 10,
        replyRate: Math.round(replyRate * 10) / 10,
        sent,
        delivered,
        read,
        failed,
      },
      volumeData,
      statusDistribution: [
        { name: "Delivered", value: delivered, color: "#22c55e" },
        { name: "Read", value: read, color: "#a855f7" },
        { name: "Sent", value: sent, color: "#3b82f6" },
        { name: "Failed", value: failed, color: "#ef4444" },
        { name: "Pending", value: statusMap["PENDING"] || 0, color: "#eab308" },
      ],
      rateLimits: {
        dailyLimit: 10000,
        monthlyLimit: 100000,
        todayUsed: todayCount,
        monthUsed: monthCount,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("WhatsApp analytics error:", error);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
