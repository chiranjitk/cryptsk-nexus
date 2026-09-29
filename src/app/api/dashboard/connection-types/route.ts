import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import type { ConnectionType } from "@prisma/client";

// GET /api/dashboard/connection-types — Subscriber distribution by connection type
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const connectionTypes: ConnectionType[] = [
      "FTTH",
      "WIRELESS",
      "CABLE",
      "LEASED_LINE",
      "ETHERNET",
    ];

    // Count subscribers per connection type in parallel
    const counts = await Promise.all(
      connectionTypes.map(async (type) => {
        const count = await db.subscriber.count({
          where: { connectionType: type },
        });
        return { type, count };
      })
    );

    const totalSubscribers = counts.reduce((sum, c) => sum + c.count, 0);

    const distribution = counts.map(({ type, count }) => ({
      type,
      label: type.replace(/_/g, " "),
      count,
      percentage:
        totalSubscribers > 0
          ? Math.round((count / totalSubscribers) * 1000) / 10
          : 0,
    }));

    return NextResponse.json({
      distribution,
      totalSubscribers,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("Connection types API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch connection type distribution" },
      { status: 500 }
    );
  }
}
