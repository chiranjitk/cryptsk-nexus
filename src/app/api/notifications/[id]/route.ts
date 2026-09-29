import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, hasRole, requirePermission } from "@/lib/rbac";
import { auditDelete } from "@/lib/audit";

// PATCH /api/notifications/[id] — mark as read ({ read: true })
// Only the owner or a Super Administrator may update.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();

    const notification = await db.notification.findUnique({ where: { id } });
    if (!notification) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 });
    }

    const isAdmin = hasRole(user, "Super Administrator");
    if (notification.userId !== user.id && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (body?.read !== true) {
      return NextResponse.json({ error: "Only { read: true } is supported" }, { status: 400 });
    }

    const updated = await db.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });

    return NextResponse.json({ notification: updated });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to update notification" }, { status: 500 });
  }
}

// DELETE /api/notifications/[id] — remove a notification (admin)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("system_setting", "manage");
    const { id } = await params;

    const existing = await db.notification.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 });
    }

    await db.notification.delete({ where: { id } });

    await auditDelete({
      userId: user.id,
      resource: "notification",
      resourceId: id,
      resourceName: existing.title,
      before: { title: existing.title, type: existing.type },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to delete notification" }, { status: 500 });
  }
}
