import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const contact = searchParams.get("contact") || "";
    const limit = parseInt(searchParams.get("limit") || "100", 10);

    const where: any = {
      type: { in: ["WHATSAPP", "SMS"] },
    };

    if (contact) {
      where.Subscriber = { phone: contact };
    }

    if (search) {
      where.OR = [
        { message: { contains: search } },
        { Subscriber: { phone: { contains: search } } },
        { Subscriber: { name: { contains: search } } },
      ];
    }

    const notifications = await db.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        Subscriber: { select: { name: true, phone: true } },
      },
    });

    const logs = notifications.map((n) => ({
      id: n.id,
      from: n.type === "WHATSAPP" ? "Cryptsk" : (n.Subscriber?.name || n.Subscriber?.phone || "Unknown"),
      to: n.Subscriber?.phone || "Unknown",
      subscriberName: n.Subscriber?.name || null,
      message: n.message,
      direction: "OUTBOUND" as const,
      status: n.status,
      contentType: n.contentType || "plain",
      imageUrl: n.imageUrl || null,
      timestamp: n.sentAt?.toISOString() || n.createdAt.toISOString(),
      deliveredAt: n.deliveredAt?.toISOString() || null,
      readAt: n.readAt?.toISOString() || null,
      createdAt: n.createdAt.toISOString(),
    }));

    return NextResponse.json(logs);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("WhatsApp logs error:", error);
    return NextResponse.json({ error: "Failed to fetch logs" }, { status: 500 });
  }
}
