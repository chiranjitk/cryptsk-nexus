import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/services/audit-service";
import { requireAuth, AuthError } from "@/lib/api-auth";
import crypto from "crypto";

function validateIpAllowlist(ips: string): { valid: boolean; message: string } {
  if (!ips.trim()) return { valid: true, message: "" };
  const parts = ips.split(",").map((s) => s.trim()).filter(Boolean);
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(\/(\d{1,2}|(\d{1,3}\.){3}\d{1,3}))?$/;
  for (const ip of parts) {
    if (!ipRegex.test(ip)) {
      return { valid: false, message: `Invalid IP address or CIDR: "${ip}"` };
    }
  }
  return { valid: true, message: "" };
}

// ─── Secret hygiene: never return raw credentials to the client ───
function maskSecret(value?: string | null): string {
  if (!value) return "";
  const v = String(value);
  if (v.length <= 4) return "••••";
  return `••••${v.slice(-4)}`;
}

function maskIntegration<T extends { apiKey?: string; apiSecret?: string }>(row: T): T {
  return { ...row, apiKey: maskSecret(row.apiKey), apiSecret: maskSecret(row.apiSecret) };
}

// HMAC-signed webhook probe payload (mirrors Stripe/Razorpay style)
function signPayload(secret: string, payload: string, timestamp: number): string {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
}

// ─── GET: Return integration configs, webhooks, and stats ──────
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");

    if (type === "gateways") {
      const gateways = await db.integrationConfig.findMany({
        where: { type: "payment_gateway" },
        orderBy: { name: "asc" },
      });
      return NextResponse.json({ gateways: gateways.map(maskIntegration) });
    }

    if (type === "communication") {
      const channels = await db.integrationConfig.findMany({
        where: { type: "communication" },
        orderBy: { name: "asc" },
      });
      return NextResponse.json({ channels: channels.map(maskIntegration) });
    }

    if (type === "deliveries") {
      const webhookId = searchParams.get("webhookId");
      const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);
      const deliveries = await db.webhookDelivery.findMany({
        where: webhookId ? { webhookId } : undefined,
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return NextResponse.json({ deliveries });
    }

    if (type === "webhooks") {
      const webhooks = await db.webhook.findMany({
        include: {
          WebhookDelivery: {
            orderBy: { createdAt: "desc" },
            take: 10,
          },
        },
        orderBy: { createdAt: "desc" },
      });
      // Client contract: deliveries key
      const shaped = webhooks.map((w) => {
        const { WebhookDelivery, ...rest } = w;
        return { ...rest, deliveries: WebhookDelivery };
      });
      return NextResponse.json({ webhooks: shaped });
    }

    if (type === "stats") {
      const [active, inactive, total, webhookCount] = await Promise.all([
        db.integrationConfig.count({ where: { enabled: true } }),
        db.integrationConfig.count({ where: { enabled: false } }),
        db.integrationConfig.count(),
        db.webhook.count(),
      ]);
      const integrations = await db.integrationConfig.findMany({
        select: { apiCalls: true, estimatedCost: true, monthlyBudget: true },
      });
      const totalApiCalls = integrations.reduce((s, i) => s + (i.apiCalls || 0), 0);
      const totalEstimatedCost = integrations.reduce((s, i) => s + (i.estimatedCost || 0), 0);
      return NextResponse.json({
        stats: { active, inactive, total, webhooks: webhookCount, totalApiCalls, totalEstimatedCost },
      });
    }

    // Default: return gateways + channels + stats
    const [gateways, channels, activeCount, inactiveCount, totalCount, allIntegrations] =
      await Promise.all([
        db.integrationConfig.findMany({
          where: { type: "payment_gateway" },
          orderBy: { name: "asc" },
        }),
        db.integrationConfig.findMany({
          where: { type: "communication" },
          orderBy: { name: "asc" },
        }),
        db.integrationConfig.count({ where: { enabled: true } }),
        db.integrationConfig.count({ where: { enabled: false } }),
        db.integrationConfig.count(),
        db.integrationConfig.findMany({
          select: { apiCalls: true, estimatedCost: true, monthlyBudget: true },
        }),
      ]);

    const totalApiCalls = allIntegrations.reduce((s, i) => s + (i.apiCalls || 0), 0);
    const totalEstimatedCost = allIntegrations.reduce((s, i) => s + (i.estimatedCost || 0), 0);

    return NextResponse.json({
      stats: {
        active: activeCount,
        inactive: inactiveCount,
        total: totalCount,
        totalApiCalls,
        totalEstimatedCost,
      },
      gateways: gateways.map(maskIntegration),
      channels: channels.map(maskIntegration),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Integrations API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch integration data" },
      { status: 500 }
    );
  }
}

// ─── Secret preservation ────────────────────────────────────────
// GET returns masked secrets (••••1234). When the UI saves a form that
// still holds the masked value (or empty), keep the stored credential
// instead of overwriting it with garbage.
function preserveSecret(incoming: string | undefined, existing: string | null | undefined): string {
  const v = (incoming ?? "").trim();
  if (!v) return existing ?? "";                 // empty → keep stored
  if (v.startsWith("••••")) return existing ?? ""; // masked → keep stored
  return v;                                       // new value → replace
}

// ─── POST: Save configs, create/toggle/delete webhooks ──────────
export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const body = await req.json();
    const { action } = body;

    if (action === "save_gateway") {
      const { gatewayId, name, provider, apiKey, apiSecret, merchantId, environment, enabled, config, ipAllowlist, costPerRequest, monthlyBudget } = body;

      // Validate IP allowlist if provided
      if (ipAllowlist) {
        const validation = validateIpAllowlist(ipAllowlist);
        if (!validation.valid) {
          return NextResponse.json({ error: validation.message }, { status: 400 });
        }
      }

      const existing = gatewayId ? await db.integrationConfig.findUnique({ where: { id: gatewayId } }) : null;
      const finalApiKey = preserveSecret(apiKey, existing?.apiKey);
      const finalApiSecret = preserveSecret(apiSecret, existing?.apiSecret);
      const finalMerchantId = preserveSecret(merchantId, existing?.merchantId);

      const configData = config ? JSON.stringify(config) : existing?.config ?? "{}";
      const gateway = await db.integrationConfig.upsert({
        where: { id: gatewayId || "" },
        update: {
          name: name || provider || "Payment Gateway",
          provider: provider || "",
          apiKey: finalApiKey,
          apiSecret: finalApiSecret,
          merchantId: finalMerchantId,
          environment: environment || "test",
          enabled: enabled ?? true,
          config: configData,
          ipAllowlist: ipAllowlist || "",
          costPerRequest: costPerRequest ?? 0,
          monthlyBudget: monthlyBudget ?? existing?.monthlyBudget ?? 0,
        },
        create: {
          type: "payment_gateway",
          name: name || provider || "Payment Gateway",
          provider: provider || "",
          apiKey: finalApiKey,
          apiSecret: finalApiSecret,
          merchantId: finalMerchantId,
          environment: environment || "test",
          enabled: enabled ?? true,
          config: configData,
          ipAllowlist: ipAllowlist || "",
          costPerRequest: costPerRequest ?? 0,
        },
      });
      await auditLog(req, "CONFIG_CHANGE", "Integration", gateway.id, { provider, name: name || provider, ipAllowlist, costPerRequest });
      return NextResponse.json({ success: true, gateway: maskIntegration(gateway) });
    }

    if (action === "save_channel") {
      const { channelId, name, provider, apiKey, apiSecret, environment, enabled, config, ipAllowlist, costPerRequest, monthlyBudget } = body;

      if (ipAllowlist) {
        const validation = validateIpAllowlist(ipAllowlist);
        if (!validation.valid) {
          return NextResponse.json({ error: validation.message }, { status: 400 });
        }
      }

      const existing = channelId ? await db.integrationConfig.findUnique({ where: { id: channelId } }) : null;
      const finalApiKey = preserveSecret(apiKey, existing?.apiKey);
      const finalApiSecret = preserveSecret(apiSecret, existing?.apiSecret);

      const configData = config ? JSON.stringify(config) : existing?.config ?? "{}";
      const channel = await db.integrationConfig.upsert({
        where: { id: channelId || "" },
        update: {
          name: name || provider || "Communication Channel",
          provider: provider || "",
          apiKey: finalApiKey,
          apiSecret: finalApiSecret,
          environment: environment || "test",
          enabled: enabled ?? true,
          config: configData,
          ipAllowlist: ipAllowlist || "",
          costPerRequest: costPerRequest ?? 0,
        },
        create: {
          type: "communication",
          name: name || provider || "Communication Channel",
          provider: provider || "",
          apiKey: finalApiKey,
          apiSecret: finalApiSecret,
          environment: environment || "test",
          enabled: enabled ?? true,
          config: configData,
          ipAllowlist: ipAllowlist || "",
          costPerRequest: costPerRequest ?? 0,
          monthlyBudget: monthlyBudget ?? existing?.monthlyBudget ?? 0,
        },
      });
      await auditLog(req, "CONFIG_CHANGE", "Integration", channel.id, { provider, name: name || provider, ipAllowlist, costPerRequest });
      return NextResponse.json({ success: true, channel: maskIntegration(channel) });
    }

    if (action === "create_webhook") {
      const { url, events, secret } = body;
      if (!url || !events || events.length === 0) {
        return NextResponse.json(
          { error: "URL and events are required" },
          { status: 400 }
        );
      }
      const webhook = await db.webhook.create({
        data: {
          url,
          events: JSON.stringify(events),
          secret: secret || `whsec_${Date.now().toString(36)}${process.pid.toString(36)}`,
          enabled: true,
        },
      });
      await auditLog(req, "CONFIG_CHANGE", "Integration", webhook.id, { url, events });
      return NextResponse.json({ success: true, webhook });
    }

    if (action === "toggle_webhook") {
      const { webhookId } = body;
      if (!webhookId) {
        return NextResponse.json(
          { error: "webhookId is required" },
          { status: 400 }
        );
      }
      const current = await db.webhook.findUnique({
        where: { id: webhookId },
      });
      if (!current) {
        return NextResponse.json(
          { error: "Webhook not found" },
          { status: 404 }
        );
      }
      const webhook = await db.webhook.update({
        where: { id: webhookId },
        data: { enabled: !current.enabled },
      });
      await auditLog(req, "CONFIG_CHANGE", "Integration", webhookId, { enabled: !current.enabled });
      return NextResponse.json({
        success: true,
        webhook,
        message: `Webhook ${webhook.enabled ? "activated" : "deactivated"}`,
      });
    }

    if (action === "delete_webhook") {
      const { webhookId } = body;
      if (!webhookId) {
        return NextResponse.json(
          { error: "webhookId is required" },
          { status: 400 }
        );
      }
      await auditLog(req, "DELETE", "Integration", webhookId, {});
      await db.webhook.delete({ where: { id: webhookId } });
      return NextResponse.json({
        success: true,
        message: "Webhook deleted",
      });
    }

    if (action === "update_webhook") {
      const { webhookId, url, events, secret, enabled } = body;
      if (!webhookId) return NextResponse.json({ error: "webhookId is required" }, { status: 400 });
      const existing = await db.webhook.findUnique({ where: { id: webhookId } });
      if (!existing) return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
      const webhook = await db.webhook.update({
        where: { id: webhookId },
        data: {
          url: url ?? existing.url,
          events: events ? JSON.stringify(events) : existing.events,
          secret: secret ?? existing.secret,
          enabled: enabled ?? existing.enabled,
        },
      });
      await auditLog(req, "CONFIG_CHANGE", "Integration", webhookId, { url, events });
      return NextResponse.json({ success: true, webhook });
    }

    if (action === "test_webhook") {
      const { webhookId } = body;
      if (!webhookId) return NextResponse.json({ error: "webhookId is required" }, { status: 400 });
      const hook = await db.webhook.findUnique({ where: { id: webhookId } });
      if (!hook) return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
      const payload = JSON.stringify({
        event: "webhook.test",
        timestamp: new Date().toISOString(),
        source: "cryptsk-nexus",
        data: { message: "This is a signed test delivery from CryptSK Nexus" },
      });
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = signPayload(hook.secret, payload, timestamp);
      const started = Date.now();
      try {
        const res = await fetch(hook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CryptSK-Event": "webhook.test",
            "X-CryptSK-Signature": `t=${timestamp},v1=${signature}`,
          },
          body: payload,
          signal: AbortSignal.timeout(10_000),
        });
        const resText = (await res.text()).slice(0, 300);
        const duration = Date.now() - started;
        await db.webhookDelivery.create({
          data: {
            webhookId: hook.id,
            event: "webhook.test",
            payload,
            statusCode: res.status,
            success: res.ok,
            duration,
            errorMessage: res.ok ? "" : `HTTP ${res.status}: ${resText.slice(0, 200)}`,
          },
        });
        await db.webhook.update({
          where: { id: hook.id },
          data: {
            lastDeliveryAt: new Date(),
            successCount: res.ok ? { increment: 1 } : undefined,
            failureCount: res.ok ? undefined : { increment: 1 },
          },
        });
        await auditLog(req, "TEST_SUCCESS", "Integration", hook.id, { url: hook.url, status: res.status });
        return NextResponse.json({
          success: true,
          result: {
            ok: res.ok,
            statusCode: res.status,
            durationMs: duration,
            response: resText,
            signatureSent: `t=${timestamp},v1=${signature.slice(0, 16)}…`,
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const duration = Date.now() - started;
        await db.webhookDelivery.create({
          data: {
            webhookId: hook.id,
            event: "webhook.test",
            payload,
            statusCode: 0,
            success: false,
            duration,
            errorMessage: msg.slice(0, 250),
          },
        });
        await db.webhook.update({ where: { id: hook.id }, data: { failureCount: { increment: 1 } } });
        return NextResponse.json({ success: true, result: { ok: false, statusCode: 0, durationMs: duration, response: msg } });
      }
    }

    if (action === "retry_delivery") {
      const { deliveryId } = body;
      if (!deliveryId) return NextResponse.json({ error: "deliveryId is required" }, { status: 400 });
      const delivery = await db.webhookDelivery.findUnique({ where: { id: deliveryId }, include: { Webhook: true } });
      if (!delivery) return NextResponse.json({ error: "Delivery not found" }, { status: 404 });
      const hook = delivery.Webhook;
      const started = Date.now();
      try {
        const timestamp = Math.floor(Date.now() / 1000);
        const signature = signPayload(hook.secret, delivery.payload ?? "", timestamp);
        const res = await fetch(hook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CryptSK-Event": delivery.event,
            "X-CryptSK-Signature": `t=${timestamp},v1=${signature}`,
          },
          body: delivery.payload ?? "{}",
          signal: AbortSignal.timeout(10_000),
        });
        const duration = Date.now() - started;
        const retry = await db.webhookDelivery.create({
          data: {
            webhookId: hook.id,
            event: delivery.event,
            payload: delivery.payload,
            statusCode: res.status,
            success: res.ok,
            duration,
            errorMessage: res.ok ? "" : `HTTP ${res.status} (retry of ${delivery.id})`,
          },
        });
        await db.webhook.update({
          where: { id: hook.id },
          data: {
            lastDeliveryAt: new Date(),
            successCount: res.ok ? { increment: 1 } : undefined,
            failureCount: res.ok ? undefined : { increment: 1 },
          },
        });
        return NextResponse.json({ success: true, delivery: retry });
      } catch (err) {
        const duration = Date.now() - started;
        const msg = err instanceof Error ? err.message : String(err);
        const retry = await db.webhookDelivery.create({
          data: {
            webhookId: hook.id,
            event: delivery.event,
            payload: delivery.payload,
            statusCode: 0,
            success: false,
            duration,
            errorMessage: `retry failed: ${msg.slice(0, 200)}`,
          },
        });
        return NextResponse.json({ success: true, delivery: retry });
      }
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Integrations POST error:", error);
    return NextResponse.json(
      { error: "Failed to process action" },
      { status: 500 }
    );
  }
}
