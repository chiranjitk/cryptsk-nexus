import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(request: Request) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const settings = await db.ispSettings.findUnique({ where: { id: "default" } });
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const todayMessages = await db.notification.count({
      where: { type: "WHATSAPP", createdAt: { gte: startOfDay } },
    });
    const deliveredMessages = await db.notification.count({
      where: { type: "WHATSAPP", status: "DELIVERED", createdAt: { gte: startOfDay } },
    });

    // Get satisfaction from Complaint.customerRating
    const complaintsWithRating = await db.complaint.findMany({
      where: {
        customerRating: { not: null },
      },
      select: { customerRating: true },
    });
    const avgSatisfaction = complaintsWithRating.length > 0
      ? Math.round((complaintsWithRating.reduce((s, c) => s + (c.customerRating || 0), 0) / complaintsWithRating.length) * 10) / 10
      : 0;

    // Get unique message template categories from recent Notification records
    const recentNotifications = await db.notification.findMany({
      where: { type: "WHATSAPP" },
      select: { category: true, title: true, message: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // Build templates from unique notification categories
    const templateMap = new Map<string, { title: string; content: string; lastUsed: string }>();
    for (const n of recentNotifications) {
      if (!templateMap.has(n.category)) {
        templateMap.set(n.category, {
          title: n.title,
          content: n.message,
          lastUsed: n.createdAt.toISOString().split("T")[0],
        });
      }
    }
    const templates = Array.from(templateMap.values()).map((t) => ({
      name: t.title,
      content: t.content,
      lastUsed: t.lastUsed,
    }));

    // Get recent conversations from Notification records with subscriber data
    const recentConvoNotifications = await db.notification.findMany({
      where: { type: "WHATSAPP" },
      include: {
        Subscriber: { select: { name: true, phone: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    const conversations = recentConvoNotifications.map((n) => ({
      customer: n.Subscriber?.name || "Unknown",
      phone: n.Subscriber?.phone || "",
      topic: n.category,
      messages: 1,
      status: n.status,
      startedAt: n.createdAt.toISOString(),
      duration: "",
    }));

    return NextResponse.json({
      config: {
        enabled: !!settings?.whatsappApiToken,
        greeting: settings?.whatsappGreetingMessage || "Hello! Welcome to Cryptsk ISP. How can I help you today?",
        language: "Hindi/English",
        workingHours: { start: "09:00", end: "21:00" },
      },
      analytics: {
        messagesToday: todayMessages,
        deliveredToday: deliveredMessages,
        autoResolved: todayMessages > 0 ? Math.round((deliveredMessages / todayMessages) * 100) : 0,
        satisfaction: avgSatisfaction,
      },
      templates: templates.length > 0 ? templates : [],
      recentConversations: conversations,
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch bot data" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const body = await request.json();
    await db.ispSettings.upsert({
      where: { id: "default" },
      update: body,
      create: { id: "default", ...body },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update config" }, { status: 500 });
  }
}
