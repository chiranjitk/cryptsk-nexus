import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/rbac";

// POST /api/notifications/read-all — mark all unread as read for the
// current user. Returns { updated: n }.
export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await db.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { isRead: true, readAt: new Date() },
    });

    return NextResponse.json({ updated: result.count });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to mark notifications read" }, { status: 500 });
  }
}
