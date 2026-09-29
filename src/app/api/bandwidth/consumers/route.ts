import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import type { NextRequest } from "next/server";

// GET /api/bandwidth/consumers - Top subscribers by data usage
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    // Aggregate usage by subscriber
    const usageData = await db.usageLog.groupBy({
      by: ["subscriberId"],
      _sum: {
        downloadBytes: true,
        uploadBytes: true,
        totalBytes: true,
      },
      orderBy: {
        _sum: { totalBytes: "desc" },
      },
      take: 10,
    });

    // Batch fetch all subscriber details to avoid N+1
    const subscriberIds = usageData.map((ud) => ud.subscriberId);
    const subscribers = await db.subscriber.findMany({
      where: { id: { in: subscriberIds } },
      select: {
        id: true,
        name: true,
        code: true,
        Plan: {
          select: { name: true },
        },
      },
    });
    const subscriberMap = new Map(subscribers.map((s) => [s.id, s]));

    const consumers: Array<{
      id: string; name: string; code: string; plan: string;
      downloadGB: number; uploadGB: number; totalGB: number;
    }> = [];
    for (const ud of usageData) {
      const subscriber = subscriberMap.get(ud.subscriberId);

      if (subscriber) {
        consumers.push({
          id: ud.subscriberId,
          name: subscriber.name,
          code: subscriber.code,
          plan: subscriber.Plan?.name || "No Plan",
          downloadGB: Number((Number(ud._sum.downloadBytes) / (1024 * 1024 * 1024)).toFixed(2)),
          uploadGB: Number((Number(ud._sum.uploadBytes) / (1024 * 1024 * 1024)).toFixed(2)),
          totalGB: Number((Number(ud._sum.totalBytes) / (1024 * 1024 * 1024)).toFixed(2)),
        });
      }
    }

    return NextResponse.json({ consumers });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Bandwidth consumers API error:", error);
    return NextResponse.json({ consumers: [] });
  }
}
