import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { auditCreate } from "@/lib/services/audit-service";
import type { NextRequest } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const filterType = searchParams.get("type") || "all";
    const filterCategory = searchParams.get("category") || "all";
    const filterStatus = searchParams.get("status") || "all";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));
    const search = searchParams.get("search") || "";

    const where: Record<string, unknown> = {};
    if (filterType !== "all") where.type = filterType;
    if (filterCategory !== "all") where.category = filterCategory;
    if (filterStatus !== "all") where.status = filterStatus;
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { message: { contains: search } },
        { Subscriber: { name: { contains: search } } },
      ];
    }

    const [notifications, total] = await Promise.all([
      db.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          Subscriber: { select: { id: true, name: true, code: true, phone: true } },
        },
      }),
      db.notification.count({ where }),
    ]);

    return NextResponse.json({
      items: notifications.map((n) => ({
        id: n.id,
        subscriberId: n.subscriberId,
        subscriberName: n.Subscriber?.name || null,
        subscriberCode: n.Subscriber?.code || null,
        type: n.type,
        category: n.category,
        title: n.title,
        message: n.message,
        status: n.status,
        sentAt: n.sentAt?.toISOString() || null,
        deliveredAt: n.deliveredAt?.toISOString() || null,
        readAt: n.readAt?.toISOString() || null,
        contentType: n.contentType,
        imageUrl: n.imageUrl,
        buttonText: n.buttonText,
        buttonUrl: n.buttonUrl,
        recurringEnabled: n.recurringEnabled,
        recurringFrequency: n.recurringFrequency,
        recurrencePattern: n.recurrencePattern,
        nextFireAt: n.nextFireAt?.toISOString() || null,
        retryCount: n.retryCount,
        maxRetries: n.maxRetries,
        createdAt: n.createdAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Notifications fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const body = await request.json();
    const { subscriberId, type, category, title, message } = body;

    if (!title || !message) {
      return NextResponse.json({ error: "Title and message are required" }, { status: 400 });
    }

    const validTypes = ["IN_APP", "SMS", "EMAIL", "WHATSAPP", "PUSH"];
    const validCategories = ["BILL_DUE", "PAYMENT_CONFIRM", "DATA_USAGE", "PLAN_CHANGE", "OUTAGE", "MAINTENANCE", "WELCOME", "OTHER"];
    const notificationType = (type || "IN_APP").toUpperCase();
    const notificationCategory = (category || "OTHER").toUpperCase();

    if (!validTypes.includes(notificationType)) {
      return NextResponse.json({ error: `Invalid type. Must be one of: ${validTypes.join(", ")}` }, { status: 400 });
    }
    if (!validCategories.includes(notificationCategory)) {
      return NextResponse.json({ error: `Invalid category. Must be one of: ${validCategories.join(", ")}` }, { status: 400 });
    }

    // Validate subscriberId FK if provided
    if (subscriberId) {
      const subscriber = await db.subscriber.findUnique({ where: { id: subscriberId }, select: { id: true } });
      if (!subscriber) {
        return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
      }
    }

    const notification = await db.notification.create({
      data: {
        subscriberId: subscriberId || null,
        userId: session || null,
        type: notificationType as "IN_APP" | "SMS" | "EMAIL" | "WHATSAPP" | "PUSH",
        category: notificationCategory as "BILL_DUE" | "PAYMENT_CONFIRM" | "DATA_USAGE" | "PLAN_CHANGE" | "OUTAGE" | "MAINTENANCE" | "WELCOME" | "OTHER",
        title,
        message,
        status: "PENDING",
        contentType: body.contentType || "plain",
        imageUrl: body.imageUrl || "",
        buttonText: body.buttonText || "",
        buttonUrl: body.buttonUrl || "",
      },
    });

    auditCreate(request, "Notification", notification.id, { type: notificationType, category: notificationCategory, title, subscriberId, contentType: body.contentType }, { userId: session }).catch(() => {});
    return NextResponse.json(notification, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Notification create error:", error);
    return NextResponse.json({ error: "Failed to create notification" }, { status: 500 });
  }
}
