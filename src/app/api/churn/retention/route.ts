import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ─── POST /api/churn/retention ───────────────────────────────
// Save a retention action for a subscriber

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth(request);

    const body = await request.json();
    const { subscriberId, actionType, discount, notes, channel } = body;

    if (!subscriberId || !actionType) {
      return NextResponse.json(
        { error: "subscriberId and actionType are required" },
        { status: 400 }
      );
    }

    const validActionTypes = [
      "DISCOUNT",
      "CALLBACK",
      "RETENTION_MESSAGE",
      "PLAN_UPGRADE",
      "PAYMENT_PLAN",
      "ESCALATION",
      "GENERAL_REMINDER",
      "SPECIAL_OFFER",
    ];

    if (!validActionTypes.includes(actionType)) {
      return NextResponse.json(
        { error: `Invalid actionType. Must be one of: ${validActionTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // Build action detail string
    let actionDetail = actionType;
    if (actionType === "DISCOUNT" && discount) {
      const discountType = typeof discount === "object" ? discount.type : "PERCENTAGE";
      const discountValue = typeof discount === "object" ? discount.value : discount;
      actionDetail = `${discountType}: ${discountValue}${discountType === "PERCENTAGE" ? "%" : " INR"}`;
    } else if (actionType === "CALLBACK") {
      actionDetail = "Scheduled callback to subscriber";
    } else if (actionType === "RETENTION_MESSAGE") {
      actionDetail = "Retention message sent via " + (channel || "IN_APP");
    } else if (actionType === "PLAN_UPGRADE") {
      actionDetail = "Plan upgrade suggested";
    }

    // Create or find ChurnTracking record
    let tracking = await db.churnTracking.findFirst({
      where: { subscriberId, status: "TRACKING" },
    });

    if (!tracking) {
      tracking = await db.churnTracking.create({
        data: {
          subscriberId,
          status: "TRACKING",
          notes: notes || "",
          assignedToId: userId,
        },
      });
    }

    // Create ChurnCommunication record
    const communication = await db.churnCommunication.create({
      data: {
        trackingId: tracking.id,
        subscriberId,
        actionType,
        actionDetail,
        note: notes || "",
        createdBy: userId,
      },
    });

    // If it's a retention message, also create a notification
    if (actionType === "RETENTION_MESSAGE" || actionType === "GENERAL_REMINDER" || actionType === "SPECIAL_OFFER") {
      const messageMap: Record<string, { title: string; message: string }> = {
        RETENTION_MESSAGE: {
          title: "Retention Offer",
          message: notes || "We value your connection with us. Please contact us for a special retention offer.",
        },
        GENERAL_REMINDER: {
          title: "Payment Reminder",
          message: notes || "This is a friendly reminder about your pending bill. Please pay at your earliest convenience.",
        },
        SPECIAL_OFFER: {
          title: "Special Discount Offer",
          message: notes || "As a valued customer, we're offering you a special discount on your next bill. Contact us for details!",
        },
      };

      const msgTemplate = messageMap[actionType];
      if (msgTemplate) {
        const channelType = (channel === "WHATSAPP" ? "WHATSAPP" : channel === "SMS" ? "SMS" : channel === "EMAIL" ? "EMAIL" : "IN_APP") as "IN_APP" | "WHATSAPP" | "SMS" | "EMAIL" | "PUSH";
        await db.notification.create({
          data: {
            subscriberId,
            type: channelType,
            category: "OTHER",
            title: msgTemplate.title,
            message: msgTemplate.message,
            status: "SENT",
            sentAt: new Date(),
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: "Retention action saved successfully",
      communication: {
        id: communication.id,
        trackingId: tracking.id,
        actionType,
        actionDetail,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("Churn retention POST error:", error);
    return NextResponse.json(
      { error: "Failed to save retention action" },
      { status: 500 }
    );
  }
}

// ─── GET /api/churn/retention ────────────────────────────────
// List retention actions for a subscriber

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const subscriberId = searchParams.get("subscriberId");

    if (!subscriberId) {
      return NextResponse.json(
        { error: "subscriberId query parameter is required" },
        { status: 400 }
      );
    }

    // Fetch tracking records and communications separately
    const [trackingRecords, communications] = await Promise.all([
      db.churnTracking.findMany({
        where: { subscriberId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          notes: true,
          assignedToId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),

      db.churnCommunication.findMany({
        where: { subscriberId },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

    // Get total action count and breakdown
    const actionBreakdown: Record<string, number> = {};
    for (const comm of communications) {
      actionBreakdown[comm.actionType] = (actionBreakdown[comm.actionType] || 0) + 1;
    }

    return NextResponse.json({
      subscriberId,
      trackingRecords,
      communications: communications.map((c) => ({
        id: c.id,
        trackingId: c.trackingId,
        actionType: c.actionType,
        actionDetail: c.actionDetail,
        note: c.note,
        createdBy: c.createdBy || "System",
        createdAt: c.createdAt,
      })),
      summary: {
        totalActions: communications.length,
        actionBreakdown,
        activeTracking: trackingRecords.some((t) => t.status === "TRACKING"),
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("Churn retention GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch retention actions" },
      { status: 500 }
    );
  }
}
