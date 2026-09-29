import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/rbac";
import type { NotificationType } from "@prisma/client";

// ============================================================
// Notifications — in-app, per-user (Notification.userId is a
// required relation, so every notification belongs to a user).
// ============================================================

const VALID_TYPES = ["info", "success", "warning", "error", "system"];

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

// GET /api/notifications?unread=1&limit=20&type=info
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();

    const { searchParams } = new URL(req.url);
    const unread = searchParams.get("unread") === "1";
    const type = searchParams.get("type");
    const limitParam = parseInt(searchParams.get("limit") || "20", 10);
    const limit = isNaN(limitParam) ? 20 : Math.min(Math.max(limitParam, 1), 100);

    const where: Record<string, unknown> = { userId: user.id };
    if (unread) where.readAt = null;
    if (type && VALID_TYPES.includes(type)) where.type = type;

    const [notifications, unreadCount] = await Promise.all([
      db.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      db.notification.count({ where: { userId: user.id, readAt: null } }),
    ]);

    return NextResponse.json({ notifications, unreadCount });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}

// POST /api/notifications — create a notification { type, title, message, link }
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return unauthorized();

    const body = await req.json();
    const { type, title, message, link } = body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }
    if (type && !VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `type must be one of: ${VALID_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const notification = await db.notification.create({
      data: {
        userId: user.id,
        type: (type as NotificationType) || "info",
        title: title.trim(),
        message: message.trim(),
        actionUrl: typeof link === "string" && link ? link : null,
      },
    });

    return NextResponse.json({ notification }, { status: 201 });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to create notification" }, { status: 500 });
  }
}
