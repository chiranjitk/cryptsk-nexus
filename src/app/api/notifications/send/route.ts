import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { sendSMS } from "@/lib/services/sms-service";
import { sendEmail } from "@/lib/services/email-service";
import { fireEventAsync } from "@/lib/services/webhook-service";
import { auditCreate } from "@/lib/services/audit-service";
import { requireAuth, AuthError } from "@/lib/api-auth";
import type { NextRequest } from "next/server";

function computeNextFireAt(pattern: string, baseDate: Date): Date | null {
  const next = new Date(baseDate);
  switch (pattern) {
    case "daily":
      next.setDate(next.getDate() + 1);
      return next;
    case "weekly":
      next.setDate(next.getDate() + 7);
      return next;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      return next;
    default:
      return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();
    const { subscriberId, type, category, title, message, recurringEnabled, recurringFrequency, contentType, imageUrl, buttonText, buttonUrl } = body;

    if (!title || !message) {
      return NextResponse.json({ error: "Title and message are required" }, { status: 400 });
    }

    const notificationType = (type || "IN_APP").toUpperCase();
    const notificationCategory = (category || "OTHER").toUpperCase();

    const validTypes = ["IN_APP", "SMS", "EMAIL", "WHATSAPP", "PUSH"];
    const validCategories = ["BILL_DUE", "PAYMENT_CONFIRM", "DATA_USAGE", "PLAN_CHANGE", "OUTAGE", "MAINTENANCE", "WELCOME", "OTHER"];
    if (!validTypes.includes(notificationType)) {
      return NextResponse.json({ error: `Invalid type. Must be one of: ${validTypes.join(", ")}` }, { status: 400 });
    }
    if (!validCategories.includes(notificationCategory)) {
      return NextResponse.json({ error: `Invalid category. Must be one of: ${validCategories.join(", ")}` }, { status: 400 });
    }

    const validContentTypes = ["plain", "with_button", "with_image"];
    const notifContentType = validContentTypes.includes(contentType) ? contentType : "plain";

    // Determine recurrence pattern
    let recurrencePattern = "one-time";
    if (recurringEnabled && recurringFrequency && recurringFrequency !== "ONCE") {
      recurrencePattern = recurringFrequency.toLowerCase(); // daily, weekly, monthly
    }

    const now = new Date();
    const nextFireAt = computeNextFireAt(recurrencePattern, now);

    let createdCount = 0;
    let smsResults: Array<{ to: string; success: boolean; error?: string }> = [];
    let emailResults: Array<{ to: string; success: boolean; error?: string }> = [];

    // Get ISP settings for branding
    let ispName = "Cryptsk ISP";
    try {
      const settings = await db.ispSettings.findUnique({ where: { id: "default" } });
      if (settings) ispName = settings.companyName || ispName;
    } catch {
      // ignore
    }

    // Common notification data
    const commonData = {
      userId,
      type: notificationType as "IN_APP" | "SMS" | "EMAIL" | "WHATSAPP" | "PUSH",
      category: notificationCategory as "BILL_DUE" | "PAYMENT_CONFIRM" | "DATA_USAGE" | "PLAN_CHANGE" | "OUTAGE" | "MAINTENANCE" | "WELCOME" | "OTHER",
      title,
      message,
      status: "SENT" as const,
      sentAt: now,
      contentType: notifContentType,
      imageUrl: imageUrl || "",
      buttonText: buttonText || "",
      buttonUrl: buttonUrl || "",
      recurringEnabled: !!recurringEnabled,
      recurringFrequency: recurringEnabled ? (recurringFrequency || "DAILY") : "",
      recurrencePattern,
      nextFireAt,
    };

    if (subscriberId) {
      // ── Send to specific subscriber ────────────────────────────
      const subscriber = await db.subscriber.findUnique({
        where: { id: subscriberId },
        select: { id: true, name: true, phone: true, email: true, status: true },
      });

      if (!subscriber) {
        return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
      }

      const created = await db.notification.create({
        data: { subscriberId, ...commonData },
      });
      createdCount = 1;

      // Actually send SMS if type is SMS or WHATSAPP
      if ((notificationType === "SMS" || notificationType === "WHATSAPP") && subscriber.phone) {
        const smsResult = await sendSMS(subscriber.phone, message);
        smsResults.push({ to: subscriber.phone, success: smsResult.success, error: smsResult.error });
        await db.notification.update({
          where: { id: created.id },
          data: {
            status: smsResult.success ? "DELIVERED" : "FAILED",
            ...(smsResult.success && { deliveredAt: new Date() }),
          },
        });
      }

      // Actually send EMAIL if type is EMAIL
      if (notificationType === "EMAIL" && subscriber.email) {
        const emailResult = await sendEmail({
          to: subscriber.email,
          subject: `${ispName} - ${title}`,
          html: `
            <div style="max-width: 600px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
              <div style="background: #DC2626; color: white; padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
                <h1 style="margin: 0; font-size: 24px;">${ispName}</h1>
              </div>
              <div style="padding: 32px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
                <h2 style="color: #111827; margin-top: 0;">${title}</h2>
                <p style="color: #374151; line-height: 1.6;">${message.replace(/\n/g, "<br>")}</p>
                ${notifContentType === "with_button" && buttonUrl ? `<div style="margin-top: 16px; text-align: center;"><a href="${buttonUrl}" style="background: #DC2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">${buttonText || "Click Here"}</a></div>` : ""}
                ${notifContentType === "with_image" && imageUrl ? `<div style="margin-top: 16px; text-align: center;"><img src="${imageUrl}" alt="Notification image" style="max-width: 100%; border-radius: 8px;" /></div>` : ""}
                <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
                  <p style="color: #9ca3af; font-size: 12px; margin: 0;">Dear ${subscriber.name},</p>
                  <p style="color: #9ca3af; font-size: 12px; margin: 4px 0 0;">This is an automated notification from ${ispName}.</p>
                </div>
              </div>
            </div>
          `,
        });
        emailResults.push({ to: subscriber.email, success: emailResult.success, error: emailResult.error });
        await db.notification.update({
          where: { id: created.id },
          data: {
            status: emailResult.success ? "DELIVERED" : "FAILED",
            ...(emailResult.success && { deliveredAt: new Date() }),
          },
        });
      }

      fireEventAsync("notification.sent", {
        notificationId: created.id,
        subscriberId: subscriber.id,
        subscriberName: subscriber.name,
        type: notificationType,
        category: notificationCategory,
        title,
        contentType: notifContentType,
        isBroadcast: false,
      });
    } else {
      // ── Broadcast to all active subscribers ────────────────────
      const activeSubscribers = await db.subscriber.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, name: true, phone: true, email: true },
      });

      if (activeSubscribers.length === 0) {
        return NextResponse.json({ success: true, sentCount: 0, isBroadcast: true, deliveryDetails: { sms: { sent: 0, failed: 0 }, email: { sent: 0, failed: 0 } }, warning: "No active subscribers found" });
      }

      // Create IN_APP records for all subscribers
      const created = await db.notification.createMany({
        data: activeSubscribers.map((s) => ({
          subscriberId: s.id,
          ...commonData,
        })),
      });
      createdCount = created.count;

      // Send SMS and track individual delivery status
      if (notificationType === "SMS" || notificationType === "WHATSAPP") {
        for (const sub of activeSubscribers) {
          if (sub.phone) {
            const result = await sendSMS(sub.phone, `Dear ${sub.name}, ${message}`);
            smsResults.push({ to: sub.phone, success: result.success, error: result.error });
            await db.notification.updateMany({
              where: { subscriberId: sub.id, type: notificationType, title, status: "SENT", createdAt: { gte: new Date(Date.now() - 10000) } },
              data: {
                status: result.success ? "DELIVERED" : "FAILED",
                ...(result.success && { deliveredAt: new Date() }),
              },
            });
          }
        }
      }

      // Send EMAIL and track individual delivery status
      if (notificationType === "EMAIL") {
        for (const sub of activeSubscribers) {
          if (sub.email) {
            const result = await sendEmail({
              to: sub.email,
              subject: `${ispName} - ${title}`,
              html: `
                <div style="max-width: 600px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
                  <div style="background: #DC2626; color: white; padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
                    <h1 style="margin: 0; font-size: 24px;">${ispName}</h1>
                  </div>
                  <div style="padding: 32px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
                    <h2 style="color: #111827; margin-top: 0;">${title}</h2>
                    <p style="color: #374151; line-height: 1.6;">${message.replace(/\n/g, "<br>")}</p>
                    ${notifContentType === "with_button" && buttonUrl ? `<div style="margin-top: 16px; text-align: center;"><a href="${buttonUrl}" style="background: #DC2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">${buttonText || "Click Here"}</a></div>` : ""}
                    ${notifContentType === "with_image" && imageUrl ? `<div style="margin-top: 16px; text-align: center;"><img src="${imageUrl}" alt="Notification image" style="max-width: 100%; border-radius: 8px;" /></div>` : ""}
                    <p style="color: #9ca3af; font-size: 12px;">Dear ${sub.name},</p>
                    <p style="color: #9ca3af; font-size: 12px;">This notification from ${ispName}.</p>
                  </div>
                </div>
              `,
            });
            emailResults.push({ to: sub.email, success: result.success, error: result.error });
            await db.notification.updateMany({
              where: { subscriberId: sub.id, type: notificationType, title, status: "SENT", createdAt: { gte: new Date(Date.now() - 10000) } },
              data: {
                status: result.success ? "DELIVERED" : "FAILED",
                ...(result.success && { deliveredAt: new Date() }),
              },
            });
          }
        }
      }

      fireEventAsync("notification.sent", {
        type: notificationType,
        category: notificationCategory,
        title,
        recipientCount: activeSubscribers.length,
        contentType: notifContentType,
        recurrencePattern,
        isBroadcast: true,
      });
    }

    auditCreate(request, "Notification", "broadcast", { type: notificationType, category: notificationCategory, title, recipientCount: createdCount, contentType: notifContentType, recurrencePattern, isBroadcast: !subscriberId }, { userId }).catch(() => {});
    return NextResponse.json({
      success: true,
      sentCount: createdCount,
      isBroadcast: !subscriberId,
      recurrencePattern,
      nextFireAt: nextFireAt?.toISOString() || null,
      deliveryDetails: {
        sms: { sent: smsResults.filter((r) => r.success).length, failed: smsResults.filter((r) => !r.success).length },
        email: { sent: emailResults.filter((r) => r.success).length, failed: emailResults.filter((r) => !r.success).length },
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Notification send error:", error);
    return NextResponse.json({ error: "Failed to send notification" }, { status: 500 });
  }
}
