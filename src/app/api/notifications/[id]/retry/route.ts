import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { sendSMS } from "@/lib/services/sms-service";
import { sendEmail } from "@/lib/services/email-service";
import { auditCreate } from "@/lib/services/audit-service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth(request);
    const { id } = await params;

    const notification = await db.notification.findUnique({
      where: { id },
      include: {
        Subscriber: { select: { id: true, name: true, phone: true, email: true, status: true } },
      },
    });

    if (!notification) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 });
    }

    if (notification.status !== "FAILED") {
      return NextResponse.json({ error: "Only failed notifications can be retried" }, { status: 400 });
    }

    // Check max retries
    if (notification.retryCount >= notification.maxRetries) {
      return NextResponse.json({ error: `Max retries (${notification.maxRetries}) exceeded` }, { status: 400 });
    }

    if (!notification.Subscriber) {
      return NextResponse.json({ error: "Notification has no subscriber — cannot retry" }, { status: 400 });
    }

    // Increment retry count and reset status
    await db.notification.update({
      where: { id },
      data: { retryCount: { increment: 1 }, status: "PENDING", sentAt: null, deliveredAt: null },
    });

    let deliverySuccess = false;
    let deliveryError: string | undefined;

    // Re-send based on notification type
    if (notification.type === "SMS" || notification.type === "WHATSAPP") {
      if (!notification.Subscriber.phone) {
        await db.notification.update({
          where: { id },
          data: { status: "FAILED" },
        });
        return NextResponse.json({ error: "Subscriber has no phone number" }, { status: 400 });
      }

      const smsResult = await sendSMS(notification.Subscriber.phone, notification.message);
      deliverySuccess = smsResult.success;
      deliveryError = smsResult.error;

      await db.notification.update({
        where: { id },
        data: {
          status: smsResult.success ? "SENT" : "FAILED",
          sentAt: new Date(),
          ...(smsResult.success && { deliveredAt: new Date() }),
        },
      });
    } else if (notification.type === "EMAIL") {
      if (!notification.Subscriber.email) {
        await db.notification.update({
          where: { id },
          data: { status: "FAILED" },
        });
        return NextResponse.json({ error: "Subscriber has no email address" }, { status: 400 });
      }

      const emailResult = await sendEmail({
        to: notification.Subscriber.email,
        subject: notification.title,
        html: `<div style="max-width:600px;margin:0 auto;font-family:sans-serif;padding:24px;"><h2>${notification.title}</h2><p>${notification.message.replace(/\n/g, "<br>")}</p></div>`,
      });
      deliverySuccess = emailResult.success;
      deliveryError = emailResult.error;

      await db.notification.update({
        where: { id },
        data: {
          status: emailResult.success ? "SENT" : "FAILED",
          sentAt: new Date(),
          ...(emailResult.success && { deliveredAt: new Date() }),
        },
      });
    } else {
      // IN_APP / PUSH — just mark as SENT
      await db.notification.update({
        where: { id },
        data: { status: "SENT", sentAt: new Date() },
      });
      deliverySuccess = true;
    }

    auditCreate(request, "Notification", id, { action: "retry", type: notification.type, success: deliverySuccess, retryCount: notification.retryCount + 1 }, { userId }).catch(() => {});

    return NextResponse.json({
      success: deliverySuccess,
      message: deliverySuccess ? "Notification re-sent successfully" : "Retry failed",
      error: deliveryError,
      status: deliverySuccess ? "SENT" : "FAILED",
      retryCount: notification.retryCount + 1,
      maxRetries: notification.maxRetries,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Retry notification error:", error);
    return NextResponse.json({ error: "Failed to retry notification" }, { status: 500 });
  }
}
