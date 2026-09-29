import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const { templateId, recipientIds, message, scheduledAt } = await request.json();

    if ((!templateId && !message) || !recipientIds || !Array.isArray(recipientIds) || recipientIds.length === 0) {
      return NextResponse.json({ error: "Provide templateId or message, and recipientIds array" }, { status: 400 });
    }

    let finalMessage = message || "";

    // If templateId provided, fetch template content
    if (templateId) {
      const template = await db.whatsAppTemplate.findUnique({ where: { id: templateId } });
      if (template) finalMessage = template.content;
    }

    // Replace known variables with placeholder values
    const subscriberIds = recipientIds.slice(0, 100); // Max 100 per broadcast

    // Verify all subscribers exist
    if (subscriberIds.length > 0) {
      const existingSubs = await db.subscriber.findMany({
        where: { id: { in: subscriberIds } },
        select: { id: true },
      });
      const validIds = existingSubs.map(s => s.id);
      const queuedCount = validIds.length;

      if (queuedCount === 0) {
        return NextResponse.json({ error: "No valid recipients found" }, { status: 400 });
      }

      // Create notification records for ALL recipients (not just the first one)
      await db.notification.createMany({
        data: validIds.map(subscriberId => ({
          subscriberId,
          type: "WHATSAPP",
          category: "OTHER",
          title: `Broadcast to ${queuedCount} recipients`,
          message: finalMessage,
          status: "PENDING",
        })),
      });

      return NextResponse.json({
        success: true,
        queuedCount,
        message: "Broadcast queued for delivery. Recipients will receive the message shortly.",
      });
    }

    return NextResponse.json({ error: "No valid recipients" }, { status: 400 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("WhatsApp broadcast error:", error);
    return NextResponse.json({ error: "Failed to queue broadcast" }, { status: 500 });
  }
}
