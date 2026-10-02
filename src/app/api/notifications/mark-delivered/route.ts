import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

/**
 * POST /api/notifications/mark-delivered
 *
 * Rendering an IN_APP notification in the staff bell panel IS its delivery.
 * Every open of the panel flips PENDING IN_APP notifications to DELIVERED
 * (deliveredAt = now). Without this, in-app notifications stayed "PENDING
 * forever" in the Notifications history page even though staff had seen them.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);

    const result = await db.notification.updateMany({
      where: {
        type: "IN_APP",
        status: "PENDING",
        deliveredAt: null,
      },
      data: {
        status: "DELIVERED",
        deliveredAt: new Date(),
      },
    });

    return NextResponse.json({ updated: result.count });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Mark-delivered error:", error);
    return NextResponse.json({ error: "Failed to mark notifications delivered" }, { status: 500 });
  }
}
