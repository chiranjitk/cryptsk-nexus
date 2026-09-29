import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const last6Months = new Date();
    last6Months.setMonth(last6Months.getMonth() - 6);
    const tracking = await db.churnTracking.findMany({
      where: { createdAt: { gte: last6Months } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json(tracking);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Churn tracking fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch tracking data" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const { subscriberId, action, notes } = await request.json();

    if (!subscriberId || !action) {
      return NextResponse.json({ error: "Subscriber ID and action are required" }, { status: 400 });
    }

    if (action === "track") {
      const existing = await db.churnTracking.findFirst({
        where: { subscriberId, status: "TRACKING" },
      });
      if (existing) {
        return NextResponse.json({ message: "Already tracking this subscriber" });
      }
      const tracking = await db.churnTracking.create({
        data: { subscriberId, status: "TRACKING", notes: notes || "Retention tracking started" },
      });
      return NextResponse.json(tracking, { status: 201 });
    } else if (action === "untrack") {
      await db.churnTracking.updateMany({
        where: { subscriberId, status: "TRACKING" },
        data: { status: "STOPPED", notes: notes || "Retention tracking stopped" },
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action. Use 'track' or 'untrack'." }, { status: 400 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Churn tracking error:", error);
    return NextResponse.json({ error: "Tracking action failed" }, { status: 500 });
  }
}
