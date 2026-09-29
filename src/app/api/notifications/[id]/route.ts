import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditCreate } from "@/lib/services/audit-service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const notification = await db.notification.findUnique({
      where: { id },
      include: {
        Subscriber: { select: { id: true, name: true, code: true, phone: true, email: true } },
        User: { select: { id: true, name: true, email: true } },
      },
    });

    if (!notification) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 });
    }

    return NextResponse.json({ notification });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Get notification error:", error);
    return NextResponse.json({ error: "Failed to fetch notification" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    const { id } = await params;
    const body = await request.json();

    const notification = await db.notification.findUnique({ where: { id } });
    if (!notification) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    // Only allow safe fields — userId is excluded to prevent authorization bypass
    const allowedFields = [
      "title", "message", "type", "category", "status", "subscriberId",
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field] === "" ? null : body[field];
      }
    }

    if (body.status === "DELIVERED") updateData.deliveredAt = new Date();
    if (body.status === "READ") {
      updateData.readAt = new Date();
      if (!updateData.deliveredAt) updateData.deliveredAt = new Date();
    }
    if (body.sentAt) updateData.sentAt = new Date(body.sentAt);

    const updated = await db.notification.update({
      where: { id },
      data: updateData,
      include: {
        Subscriber: { select: { id: true, name: true, code: true } },
        User: { select: { id: true, name: true } },
      },
    });

    auditCreate(request, "Notification", id, { updatedFields: Object.keys(updateData), oldStatus: notification.status, newStatus: body.status }, { userId: session }).catch(() => {});
    return NextResponse.json({ notification: updated });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Update notification error:", error);
    return NextResponse.json({ error: "Failed to update notification" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(request);
    const { id } = await params;
    const notification = await db.notification.findUnique({ where: { id } });

    if (!notification) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 });
    }

    await db.notification.delete({ where: { id } });
    auditCreate(request, "Notification", id, { action: "delete", title: notification.title, subscriberId: notification.subscriberId }, { userId: session }).catch(() => {});
    return NextResponse.json({ success: true, message: "Notification deleted successfully" });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Delete notification error:", error);
    return NextResponse.json({ error: "Failed to delete notification" }, { status: 500 });
  }
}
