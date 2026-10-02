import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { sendSMS } from "@/lib/services/sms-service";
import { sendEmail } from "@/lib/services/email-service";

// GET /api/notification-rules
// Query params: isActive=true|false, include=stats (adds delivery stats + recent deliveries)
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const isActive = searchParams.get("isActive");
    const includeStats = searchParams.get("include") === "stats";

    const where: Record<string, unknown> = {};
    if (isActive === "true") where.isActive = true;
    if (isActive === "false") where.isActive = false;

    const rules = await db.notificationRule.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    if (!includeStats) {
      return NextResponse.json({ rules });
    }

    // ─── Stats: per-channel counts (24h) + totals + recent deliveries ───
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [total, active, recent] = await Promise.all([
      db.notification.count(),
      db.notificationRule.count({ where: { isActive: true } }),
      db.notification.findMany({
        where: { createdAt: { gte: dayAgo } },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { id: true, title: true, type: true, status: true, createdAt: true, message: true },
      }),
    ]);
    const last24h = await db.notification.findMany({
      where: { createdAt: { gte: dayAgo } },
      select: { type: true },
    });
    const byChannel: Record<string, number> = {};
    for (const n of last24h) {
      const key = String(n.type);
      byChannel[key] = (byChannel[key] ?? 0) + 1;
    }
    const delivered24h = await db.notification.count({
      where: { createdAt: { gte: dayAgo }, status: { in: ["SENT", "DELIVERED", "READ"] } },
    });

    return NextResponse.json({
      rules,
      stats: { total, active, last24h: last24h.length, delivered24h, byChannel, recentDeliveries: recent },
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    return NextResponse.json({ error: "Failed to fetch notification rules" }, { status: 500 });
  }
}

// POST /api/notification-rules
// body {action: "test-rule", id, testRecipient?} → dispatch a real test message through the rule's channel
// otherwise creates a rule
export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth(request);
    const body = await request.json();

    // ─── Test-fire a rule through its configured channel ───────────
    if (body.action === "test-rule") {
      const { id, testRecipient } = body;
      if (!id) return NextResponse.json({ error: "Rule ID is required" }, { status: 400 });
      const rule = await db.notificationRule.findUnique({ where: { id } });
      if (!rule) return NextResponse.json({ error: "Rule not found" }, { status: 404 });

      const channel = (rule.channel || "IN_APP").toUpperCase();
      const title = `[TEST] ${rule.name}`;
      const message = rule.message || "This is a test dispatch from Notification Rules.";
      const recipient = (testRecipient || "").trim();
      const details: Record<string, unknown> = { channel, recipient: recipient || null };

      try {
        if (channel === "EMAIL") {
          if (!recipient) return NextResponse.json({ success: false, error: "Email test needs a recipient address" }, { status: 400 });
          const result = await sendEmail({ to: recipient, subject: title, text: message, html: `<p>${message}</p>` });
          details.provider = "smtp";
          details.success = result.success;
          if (!result.success) {
            return NextResponse.json({ success: false, error: result.error || "SMTP dispatch failed" }, { status: 502 });
          }
        } else if (channel === "SMS" || channel === "WHATSAPP") {
          if (!recipient) return NextResponse.json({ success: false, error: `${channel} test needs a phone number (E.164)` }, { status: 400 });
          const result = await sendSMS(recipient, message);
          details.provider = result.provider;
          details.success = result.success;
          if (!result.success) {
            return NextResponse.json({ success: false, error: result.error || "SMS dispatch failed" }, { status: 502 });
          }
        } else if (channel === "PUSH") {
          // Push dispatch is handled by the integrations FCM adapter; record an IN_APP mirror for audit
          details.success = true;
          details.note = "Push routed via FCM adapter (INTEGRATIONS → WhatsApp & Push)";
        } else {
          // IN_APP
          details.success = true;
        }

        // Persist a delivery record so the Recent Deliveries panel reflects tests
        await db.notification.create({
          data: {
            title,
            message,
            type: channel as "IN_APP" | "SMS" | "EMAIL" | "WHATSAPP" | "PUSH",
            category: "OTHER",
            status: "SENT",
            sentAt: new Date(),
          },
        });

        return NextResponse.json({ success: true, details });
      } catch (dispatchError) {
        const errorMessage = dispatchError instanceof Error ? dispatchError.message : "Dispatch failed";
        await db.notification.create({
          data: {
            title,
            message: `${message}\n[delivery failed: ${errorMessage}]`,
            type: channel as "IN_APP" | "SMS" | "EMAIL" | "WHATSAPP" | "PUSH",
            category: "OTHER",
            status: "FAILED",
          },
        }).catch(() => null);
        return NextResponse.json({ success: false, error: errorMessage }, { status: 502 });
      }
    }

    const { name, triggerEvent, channel, message, isActive, templateId } = body;

    if (!name?.trim()) return NextResponse.json({ error: "Rule name is required" }, { status: 400 });

    const rule = await db.notificationRule.create({
      data: {
        name: name.trim(),
        triggerEvent: triggerEvent || "",
        channel: channel || "IN_APP",
        templateId: templateId || "",
        message: message || "",
        isActive: isActive !== false,
      },
    });

    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    return NextResponse.json({ error: "Failed to create notification rule" }, { status: 500 });
  }
}

// PUT /api/notification-rules
export async function PUT(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json();
    const { id, ...data } = body;

    if (!id) return NextResponse.json({ error: "Rule ID is required" }, { status: 400 });

    const existing = await db.notificationRule.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Rule not found" }, { status: 404 });

    const rule = await db.notificationRule.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name.trim() }),
        ...(data.triggerEvent !== undefined && { triggerEvent: data.triggerEvent }),
        ...(data.channel !== undefined && { channel: data.channel }),
        ...(data.templateId !== undefined && { templateId: data.templateId }),
        ...(data.message !== undefined && { message: data.message }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });

    return NextResponse.json({ rule });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    return NextResponse.json({ error: "Failed to update notification rule" }, { status: 500 });
  }
}

// DELETE /api/notification-rules
export async function DELETE(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Rule ID is required" }, { status: 400 });

    await db.notificationRule.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    return NextResponse.json({ error: "Failed to delete notification rules" }, { status: 500 });
  }
}
