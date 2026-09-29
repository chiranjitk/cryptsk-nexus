import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const subscriberId = searchParams.get("subscriberId");

    const where: Record<string, unknown> = {};
    if (subscriberId) where.subscriberId = subscriberId;

    const communications = await db.churnCommunication.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(communications);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Churn communications fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch communications" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const { subscriberId, actionType, actionDetail, note } = await request.json();

    if (!subscriberId || !actionType) {
      return NextResponse.json({ error: "Subscriber ID and action type are required" }, { status: 400 });
    }

    // Find existing tracking record
    const tracking = await db.churnTracking.findFirst({
      where: { subscriberId, status: "TRACKING" },
    });

    const communication = await db.churnCommunication.create({
      data: {
        trackingId: tracking?.id || "",
        subscriberId,
        actionType,
        actionDetail: actionDetail || actionType,
        note: note || "",
        createdBy: "current-user",
      },
    });

    return NextResponse.json(communication, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Churn communication log error:", error);
    return NextResponse.json({ error: "Failed to log communication" }, { status: 500 });
  }
}
