import crypto from "crypto";
import { db } from "@/lib/db";

// ─── Types ──────────────────────────────────────────────────────
interface WebhookPayload {
  event: string;
  data: Record<string, unknown>;
  timestamp: string;
  eventId: string;
}

interface WebhookDeliveryResult {
  success: boolean;
  statusCode: number;
  duration: number;
  errorMessage?: string;
}

// ─── Generate HMAC-SHA256 signature ─────────────────────────────
function generateSignature(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

// ─── Fire webhook to a single URL ───────────────────────────────
async function fireWebhook(
  webhookId: string,
  url: string,
  secret: string,
  event: string,
  data: Record<string, unknown>
): Promise<WebhookDeliveryResult> {
  const payload: WebhookPayload = {
    event,
    data,
    timestamp: new Date().toISOString(),
    eventId: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
  };

  const payloadString = JSON.stringify(payload);
  const signature = generateSignature(payloadString, secret);

  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Webhook-Event": event,
        "X-Webhook-Delivery": payload.eventId,
        "X-Cryptsk-Timestamp": payload.timestamp,
        "User-Agent": "Cryptsk-Webhooks/1.0",
      },
      body: payloadString,
      signal: AbortSignal.timeout(15000), // 15s timeout
    });

    const duration = Date.now() - startTime;
    const success = response.ok;

    // Log delivery
    await db.webhookDelivery.create({
      data: {
        webhookId,
        event,
        payload: payloadString,
        statusCode: response.status,
        success,
        duration,
        errorMessage: success ? "" : `HTTP ${response.status}`,
      },
    });

    // Update webhook stats
    await db.webhook.update({
      where: { id: webhookId },
      data: {
        lastDeliveryAt: new Date(),
        ...(success
          ? { successCount: { increment: 1 } }
          : { failureCount: { increment: 1 } }),
      },
    });

    return { success, statusCode: response.status, duration };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Log failed delivery
    await db.webhookDelivery.create({
      data: {
        webhookId,
        event,
        payload: payloadString,
        statusCode: 0,
        success: false,
        duration,
        errorMessage,
      },
    });

    // Update webhook stats
    await db.webhook.update({
      where: { id: webhookId },
      data: {
        lastDeliveryAt: new Date(),
        failureCount: { increment: 1 },
      },
    });

    return { success: false, statusCode: 0, duration, errorMessage };
  }
}

// ─── Public API: Fire event to all matching webhooks ────────────
export async function fireEvent(
  event: string,
  data: Record<string, unknown>
): Promise<{ fired: number; results: WebhookDeliveryResult[] }> {
  try {
    // Find all enabled webhooks that listen for this event
    const webhooks = await db.webhook.findMany({
      where: { enabled: true },
    });

    const matchingWebhooks = webhooks.filter((wh) => {
      try {
        const events: string[] = JSON.parse(wh.events || "[]");
        return events.includes(event) || events.includes("*");
      } catch {
        return false;
      }
    });

    if (matchingWebhooks.length === 0) {
      return { fired: 0, results: [] };
    }

    // Fire all webhooks in parallel (don't block)
    const results = await Promise.allSettled(
      matchingWebhooks.map((wh) => fireWebhook(wh.id, wh.url, wh.secret, event, data))
    );

    const deliveryResults = results.map((r) =>
      r.status === "fulfilled" ? r.value : { success: false, statusCode: 0, duration: 0, errorMessage: "Promise rejected" }
    );

    return {
      fired: matchingWebhooks.length,
      results: deliveryResults,
    };
  } catch (error) {
    console.error("Webhook fireEvent error:", error);
    return { fired: 0, results: [] };
  }
}

// ─── Fire event asynchronously (fire-and-forget) ────────────────
export function fireEventAsync(event: string, data: Record<string, unknown>): void {
  // Fire in background without blocking
  fireEvent(event, data).catch((err) => {
    console.error("Background webhook fire error:", err);
  });
}

// ─── Verify webhook signature (for incoming webhooks) ───────────
export function verifySignature(payload: string, signature: string, secret: string): boolean {
  try {
    const expected = generateSignature(payload, secret);
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

// ─── Get webhook delivery logs ──────────────────────────────────
export async function getDeliveryLogs(webhookId?: string, limit = 50) {
  return db.webhookDelivery.findMany({
    where: webhookId ? { webhookId } : undefined,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      Webhook: {
        select: { url: true, events: true },
      },
    },
  });
}
