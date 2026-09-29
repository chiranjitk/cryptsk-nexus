import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditLog } from "@/lib/services/audit-service";
import type { NextRequest } from "next/server";

const DEFAULT_WEBHOOK = {
  webhookUrl: "",
  verifyToken: "",
  subscribeMessages: true,
  subscribeDelivery: true,
  subscribeAccount: false,
};

export async function GET(_request: NextRequest) {
  try {
    await requireAuth(_request);
    const settings = db.ispSettings
      ? await db.ispSettings.findUnique({ where: { id: "default" } })
      : null;
    const config = settings?.whatsappWebhookConfig
      ? JSON.parse(settings.whatsappWebhookConfig)
      : DEFAULT_WEBHOOK;

    return NextResponse.json({ ...DEFAULT_WEBHOOK, ...config });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("WhatsApp webhook config fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch webhook config" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();

    const { webhookUrl, verifyToken, subscribeMessages, subscribeDelivery, subscribeAccount, action } = body;

    // Handle test webhook
    if (action === "test") {
      if (!webhookUrl) {
        return NextResponse.json({ error: "Webhook URL is required" }, { status: 400 });
      }

      try {
        const testPayload = {
          object: "whatsapp_business_account",
          entry: [{ id: "test", changes: [{ value: { messages: [{ id: "test_msg_1" }] }, field: "messages" }] }],
        };

        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(testPayload),
        });

        if (res.ok) {
          await auditLog(request, "INTEGRATION_TEST", "WhatsAppWebhook", "test", {
            details: { webhookUrl, result: "success" },
            userId,
          });
          return NextResponse.json({ success: true, message: "Test webhook sent successfully!" });
        } else {
          return NextResponse.json({ error: `Webhook returned status ${res.status}` }, { status: 400 });
        }
      } catch (err) {
        return NextResponse.json({ error: `Failed to reach webhook: ${err}` }, { status: 400 });
      }
    }

    // Save webhook config
    const config = {
      webhookUrl: webhookUrl || "",
      verifyToken: verifyToken || "",
      subscribeMessages: subscribeMessages !== false,
      subscribeDelivery: subscribeDelivery !== false,
      subscribeAccount: subscribeAccount === true,
    };

    if (db.ispSettings) {
      await db.ispSettings.upsert({
        where: { id: "default" },
        update: { whatsappWebhookConfig: JSON.stringify(config) },
        create: { id: "default", whatsappWebhookConfig: JSON.stringify(config) },
      });
    }

    await auditLog(request, "CONFIG_CHANGE", "WhatsAppWebhook", "config", {
      details: config,
      userId,
    });

    return NextResponse.json({ success: true, message: "Webhook configuration saved!" });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("WhatsApp webhook config save error:", error);
    return NextResponse.json({ error: "Failed to save webhook config" }, { status: 500 });
  }
}
