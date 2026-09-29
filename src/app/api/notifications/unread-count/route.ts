import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

/**
 * GET /api/notifications/unread-count
 * Returns the count of unread notifications (readAt is null).
 * Used for the sidebar badge.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const count = await db.notification.count({
      where: {
        readAt: null,
      },
    });

    return NextResponse.json({ count });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Unread notification count error:", error);
    return NextResponse.json({ count: 0 });
  }
}
