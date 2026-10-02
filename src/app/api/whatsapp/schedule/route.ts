import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditLog } from "@/lib/services/audit-service";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "PENDING";

    const messages = await db.scheduledMessage.findMany({
      where: status !== "ALL" ? { status } : undefined,
      orderBy: { scheduledAt: "asc" },
    });

    return NextResponse.json(messages);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("WhatsApp scheduled messages fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch scheduled messages" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth(request);
    const { templateId, recipientId, recipientName, recipientPhone, message, mediaType, mediaUrl, scheduledAt } = await request.json();

    if (!recipientId || !message || !scheduledAt) {
      return NextResponse.json({ error: "recipientId, message, and scheduledAt are required" }, { status: 400 });
    }

    const scheduledDate = new Date(scheduledAt);
    if (isNaN(scheduledDate.getTime())) {
      return NextResponse.json({ error: "Invalid scheduledAt date" }, { status: 400 });
    }

    const scheduled = await db.scheduledMessage.create({
      data: {
        templateId: templateId || null,
        recipientId,
        recipientName: recipientName || "",
        recipientPhone: recipientPhone || "",
        message,
        mediaType: mediaType || "TEXT",
        mediaUrl: mediaUrl || "",
        scheduledAt: scheduledDate,
        sentById: userId,
      },
    });

    await auditLog(request, "CREATE", "ScheduledMessage", scheduled.id, {
      details: { recipientId, scheduledAt, templateId },
      userId,
    });

    return NextResponse.json(scheduled, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("WhatsApp schedule message error:", error);
    return NextResponse.json({ error: "Failed to schedule message" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { userId } = await requireAuth(request);
    const { id, action } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "Message ID is required" }, { status: 400 });
    }

    const existing = await db.scheduledMessage.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Scheduled message not found" }, { status: 404 });
    }

    if (action === "cancel") {
      const updated = await db.scheduledMessage.update({
        where: { id },
        data: { status: "CANCELLED" },
      });
      await auditLog(request, "UPDATE", "ScheduledMessage", id, {
        details: { action: "cancel" },
        userId,
      });
      return NextResponse.json(updated);
    }

    if (action === "send_now") {
      // Mark as sent immediately
      const updated = await db.scheduledMessage.update({
        where: { id },
        data: { status: "SENT", sentAt: new Date() },
      });
      // Also create a notification record
      await db.notification.create({
        data: {
          subscriberId: existing.recipientId,
          type: "WHATSAPP",
          category: "OTHER",
          title: "WhatsApp Message",
          message: existing.message,
          status: "SENT",
        },
      });
      await auditLog(request, "UPDATE", "ScheduledMessage", id, {
        details: { action: "send_now" },
        userId,
      });
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("WhatsApp scheduled message update error:", error);
    return NextResponse.json({ error: "Failed to update scheduled message" }, { status: 500 });
  }
}
