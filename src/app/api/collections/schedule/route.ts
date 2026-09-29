import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ── CORS Headers ────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// ── GET /api/collections/schedule ───────────────────────────────────
// List all scheduled messages with status filter
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const where: Record<string, unknown> = {};
    if (status && status !== "ALL") {
      where.status = status;
    }

    const [messages, total] = await Promise.all([
      db.scheduledMessage.findMany({
        where,
        orderBy: { scheduledAt: "asc" },
        take: limit,
        skip: offset,
      }),
      db.scheduledMessage.count({ where }),
    ]);

    return NextResponse.json(
      { messages, total, limit, offset },
      { headers: corsHeaders }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode, headers: corsHeaders }
      );
    }
    console.error("Failed to fetch scheduled messages:", error);
    return NextResponse.json(
      { error: "Failed to fetch scheduled messages" },
      { status: 500, headers: corsHeaders }
    );
  }
}

// ── POST /api/collections/schedule ──────────────────────────────────
// Schedule smart reminders for subscribers
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);

    const body = await request.json();
    const { subscriberIds, channel, message, scheduledAt } = body as {
      subscriberIds: string[];
      channel: string;
      message: string;
      scheduledAt: string;
    };

    // Validate required fields
    if (!Array.isArray(subscriberIds) || subscriberIds.length === 0) {
      return NextResponse.json(
        { error: "subscriberIds is required and must be a non-empty array" },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!channel || !["WHATSAPP", "SMS", "EMAIL"].includes(channel.toUpperCase())) {
      return NextResponse.json(
        { error: "channel must be WHATSAPP, SMS, or EMAIL" },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!message || message.trim().length === 0) {
      return NextResponse.json(
        { error: "message is required and must not be empty" },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!scheduledAt || isNaN(new Date(scheduledAt).getTime())) {
      return NextResponse.json(
        { error: "scheduledAt must be a valid ISO date string" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate subscribers exist
    const subscribers = await db.subscriber.findMany({
      where: { id: { in: subscriberIds } },
      select: { id: true, name: true, phone: true, email: true },
    });

    const foundIds = new Set(subscribers.map((s) => s.id));
    const missingIds = subscriberIds.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) {
      return NextResponse.json(
        { error: `Subscribers not found: ${missingIds.join(", ")}` },
        { status: 404, headers: corsHeaders }
      );
    }

    // Create scheduled messages
    const normalizedChannel = channel.toUpperCase();
    const scheduledDate = new Date(scheduledAt);

    const createData = subscribers.map((sub) => ({
      recipientId: sub.id,
      recipientName: sub.name,
      recipientPhone: sub.phone,
      message: message.replace(/\{name\}/g, sub.name),
      mediaType: normalizedChannel,
      scheduledAt: scheduledDate,
      status: "PENDING",
      sentById: userId,
    }));

    const created = await db.scheduledMessage.createMany({
      data: createData,
    });

    return NextResponse.json(
      {
        success: true,
        created: created.count,
        message: `Scheduled ${created.count} reminder${created.count > 1 ? "s" : ""} via ${normalizedChannel}`,
        scheduledAt: scheduledDate.toISOString(),
      },
      { status: 201, headers: corsHeaders }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode, headers: corsHeaders }
      );
    }
    console.error("Failed to schedule reminders:", error);
    return NextResponse.json(
      { error: "Failed to schedule reminders" },
      { status: 500, headers: corsHeaders }
    );
  }
}

// ── PUT /api/collections/schedule ───────────────────────────────────
// Update message status (SENT, FAILED, CANCELLED)
export async function PUT(request: NextRequest) {
  try {
    await requireAuth(request);

    const body = await request.json();
    const { messageIds, status } = body as {
      messageIds: string[];
      status: string;
    };

    if (!Array.isArray(messageIds) || messageIds.length === 0) {
      return NextResponse.json(
        { error: "messageIds is required and must be a non-empty array" },
        { status: 400, headers: corsHeaders }
      );
    }

    const validStatuses = ["SENT", "FAILED", "CANCELLED"];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${validStatuses.join(", ")}` },
        { status: 400, headers: corsHeaders }
      );
    }

    // Update messages
    const updateData: Record<string, unknown> = { status };
    if (status === "SENT") {
      updateData.sentAt = new Date();
    }

    const updated = await db.scheduledMessage.updateMany({
      where: { id: { in: messageIds } },
      data: updateData,
    });

    return NextResponse.json(
      {
        success: true,
        updated: updated.count,
        message: `Updated ${updated.count} message${updated.count > 1 ? "s" : ""} to ${status}`,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode, headers: corsHeaders }
      );
    }
    console.error("Failed to update scheduled messages:", error);
    return NextResponse.json(
      { error: "Failed to update scheduled messages" },
      { status: 500, headers: corsHeaders }
    );
  }
}
