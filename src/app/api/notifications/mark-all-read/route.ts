import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

/**
 * POST /api/notifications/mark-all-read
 * Marks all unread notifications as READ in a single bulk operation.
 * Sets status to "READ" and readAt to now().
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);

    const result = await db.notification.updateMany({
      where: {
        readAt: null,
      },
      data: {
        status: "READ",
        readAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      updatedCount: result.count,
      message: `Marked ${result.count} notifications as read`,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Mark all read error:", error);
    return NextResponse.json({ error: "Failed to mark notifications as read" }, { status: 500 });
  }
}
