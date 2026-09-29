import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/dashboard/top-subscribers — Top 5 subscribers by total payment amount
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    // Aggregate payments by subscriberId using SQLite-compatible grouping
    const paymentAggregates = await db.$queryRaw<
      {
        subscriberId: string;
        totalPaid: number;
        paymentCount: number;
        lastPaymentDate: string;
      }[]
    >`
      SELECT
        "subscriberId",
        CAST(SUM("amount") AS float) as "totalPaid",
        CAST(COUNT(*) AS int) as "paymentCount",
        MAX("createdAt") as "lastPaymentDate"
      FROM "Payment"
      WHERE status = 'VERIFIED'
      GROUP BY "subscriberId"
      ORDER BY "totalPaid" DESC
      LIMIT 5
    `;

    if (paymentAggregates.length === 0) {
      return NextResponse.json({ subscribers: [] });
    }

    // Fetch subscriber details with plan info for each aggregated result
    const subscriberIds = paymentAggregates.map((p) => p.subscriberId);

    const subscribers = await db.subscriber.findMany({
      where: { id: { in: subscriberIds } },
      select: {
        id: true,
        name: true,
        Plan: {
          select: {
            name: true,
          },
        },
      },
    });

    // Map subscriber info into the aggregated data
    const subscriberMap = new Map(subscribers.map((s) => [s.id, s]));

    const result = paymentAggregates.map((agg, index) => {
      const sub = subscriberMap.get(agg.subscriberId);
      return {
        rank: index + 1,
        subscriberId: agg.subscriberId,
        name: sub?.name ?? "Unknown",
        planName: sub?.Plan?.name ?? "No Plan",
        totalPaid: Math.round(Number(agg.totalPaid) * 100) / 100,
        paymentCount: Number(agg.paymentCount),
        lastPaymentDate: String(agg.lastPaymentDate),
      };
    });

    return NextResponse.json({ subscribers: result });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("Top subscribers API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch top subscribers" },
      { status: 500 }
    );
  }
}
