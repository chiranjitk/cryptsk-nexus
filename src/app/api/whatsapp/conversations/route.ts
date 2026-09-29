import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditLog } from "@/lib/services/audit-service";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const contact = searchParams.get("contact") || "";

    if (!contact) {
      return NextResponse.json({ error: "Contact parameter is required" }, { status: 400 });
    }

    const messages = await db.notification.findMany({
      where: {
        type: { in: ["WHATSAPP", "SMS"] },
        Subscriber: { phone: contact },
      },
      orderBy: { createdAt: "asc" },
      take: 200,
      include: {
        Subscriber: { select: { name: true, phone: true } },
      },
    });

    const formatted = messages.map((m) => ({
      id: m.id,
      from: "Cryptsk",
      to: contact,
      subscriberName: m.Subscriber?.name || null,
      message: m.message,
      direction: "OUTBOUND" as const,
      status: m.status,
      contentType: m.contentType || "plain",
      imageUrl: m.imageUrl || null,
      timestamp: m.sentAt?.toISOString() || m.createdAt.toISOString(),
      deliveredAt: m.deliveredAt?.toISOString() || null,
      readAt: m.readAt?.toISOString() || null,
      createdAt: m.createdAt.toISOString(),
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("WhatsApp conversation fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch conversation" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const { to, message, contentType, imageUrl } = await request.json();

    if (!to || !message) {
      return NextResponse.json({ error: "Recipient phone and message are required" }, { status: 400 });
    }

    // Find or reference subscriber by phone
    let subscriberId: string | null = null;
    const subscriber = await db.subscriber.findFirst({
      where: { phone: to },
      select: { id: true },
    });
    if (subscriber) subscriberId = subscriber.id;

    // Create an outbound notification record
    const notification = await db.notification.create({
      data: {
        subscriberId,
        type: "WHATSAPP",
        category: "OTHER",
        title: `Message to ${to}`,
        message,
        contentType: contentType || "plain",
        imageUrl: imageUrl || "",
        status: "SENT",
        sentAt: new Date(),
      },
    });

    await auditLog(request, "CREATE", "WhatsAppConversation", notification.id, {
      details: { to, messageLength: message.length },
      userId,
    });

    return NextResponse.json({
      success: true,
      id: notification.id,
      message: "Message sent successfully",
      sentAt: notification.sentAt?.toISOString(),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("WhatsApp conversation send error:", error);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
