import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/services/audit-service";
import { requireAuth, AuthError } from "@/lib/api-auth";

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
      return NextResponse.json({ gateways });
    }

    if (type === "communication") {
      const channels = await db.integrationConfig.findMany({
        where: { type: "communication" },
        orderBy: { name: "asc" },
      });
      return NextResponse.json({ channels });
    }

    if (type === "webhooks") {
      const webhooks = await db.webhook.findMany({
        include: {
          deliveries: {
            orderBy: { createdAt: "desc" },
            take: 10,
          },
        },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({ webhooks });
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
      gateways,
      channels,
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

// ─── POST: Save configs, create/toggle/delete webhooks ──────────
export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const body = await req.json();
    const { action } = body;

    if (action === "save_gateway") {
      const { gatewayId, name, provider, apiKey, apiSecret, merchantId, environment, enabled, config, ipAllowlist, costPerRequest } = body;

      // Validate IP allowlist if provided
      if (ipAllowlist) {
        const validation = validateIpAllowlist(ipAllowlist);
        if (!validation.valid) {
          return NextResponse.json({ error: validation.message }, { status: 400 });
        }
      }

      const configData = config ? JSON.stringify(config) : "{}";
      const gateway = await db.integrationConfig.upsert({
        where: { id: gatewayId || "" },
        update: {
          name: name || provider || "Payment Gateway",
          provider: provider || "",
          apiKey: apiKey || "",
          apiSecret: apiSecret || "",
          merchantId: merchantId || "",
          environment: environment || "test",
          enabled: enabled ?? true,
          config: configData,
          ipAllowlist: ipAllowlist || "",
          costPerRequest: costPerRequest ?? 0,
        },
        create: {
          type: "payment_gateway",
          name: name || provider || "Payment Gateway",
          provider: provider || "",
          apiKey: apiKey || "",
          apiSecret: apiSecret || "",
          merchantId: merchantId || "",
          environment: environment || "test",
          enabled: enabled ?? true,
          config: configData,
          ipAllowlist: ipAllowlist || "",
          costPerRequest: costPerRequest ?? 0,
        },
      });
      await auditLog(req, "CONFIG_CHANGE", "Integration", gateway.id, { provider, name: name || provider, ipAllowlist, costPerRequest });
      return NextResponse.json({ success: true, gateway });
    }

    if (action === "save_channel") {
      const { channelId, name, provider, apiKey, apiSecret, environment, enabled, config, ipAllowlist, costPerRequest } = body;

      if (ipAllowlist) {
        const validation = validateIpAllowlist(ipAllowlist);
        if (!validation.valid) {
          return NextResponse.json({ error: validation.message }, { status: 400 });
        }
      }

      const configData = config ? JSON.stringify(config) : "{}";
      const channel = await db.integrationConfig.upsert({
        where: { id: channelId || "" },
        update: {
          name: name || provider || "Communication Channel",
          provider: provider || "",
          apiKey: apiKey || "",
          apiSecret: apiSecret || "",
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
          apiKey: apiKey || "",
          apiSecret: apiSecret || "",
          environment: environment || "test",
          enabled: enabled ?? true,
          config: configData,
          ipAllowlist: ipAllowlist || "",
          costPerRequest: costPerRequest ?? 0,
        },
      });
      await auditLog(req, "CONFIG_CHANGE", "Integration", channel.id, { provider, name: name || provider, ipAllowlist, costPerRequest });
      return NextResponse.json({ success: true, channel });
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
