import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { db } from "@/lib/db";

// POST /api/radius-users/toggle-enabled - Toggle RADIUS enabled on a subscriber
export async function POST(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    const body = await request.json();
    const { subscriberId, radiusEnabled } = body;

    if (!subscriberId) {
      return NextResponse.json({ error: "Subscriber ID is required" }, { status: 400 });
    }

    const subscriber = await db.subscriber.findUnique({
      where: { id: subscriberId },
    });

    if (!subscriber) {
      return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
    }

    if (radiusEnabled) {
      // Enable RADIUS: create RadiusUser record if not exists
      const existing = await db.radiusUser.findUnique({
        where: { subscriberId },
      });
      if (!existing) {
        await db.radiusUser.create({
          data: { subscriberId },
        });
      }
      await db.subscriber.update({
        where: { id: subscriberId },
        data: { radiusEnabled: true },
      });
    } else {
      // Disable RADIUS: remove RadiusUser record
      await db.radiusUser.deleteMany({
        where: { subscriberId },
      });
      await db.subscriber.update({
        where: { id: subscriberId },
        data: { radiusEnabled: false },
      });
    }

    return NextResponse.json({
      success: true,
      message: radiusEnabled ? "RADIUS enabled for subscriber" : "RADIUS disabled for subscriber",
    });
  } catch (error) {
    console.error("Toggle RADIUS enabled error:", error);
    return NextResponse.json(
      { error: "Failed to toggle RADIUS status" },
      { status: 500 }
    );
  }
}
