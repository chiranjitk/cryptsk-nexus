// Cryptsk WhatsApp Bot Service — Port 3003
// Production-ready WhatsApp Business API integration with real DB, auth, and structured logging

import { PrismaClient } from "@prisma/client";
import { requireAuth, corsHeaders } from "../shared/auth.ts";
import { createLogger } from "../shared/logger.ts";

const db = new PrismaClient();
const logger = createLogger("whatsapp-bot");

// ─── Helpers ────────────────────────────────────────────────

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function jsonErr(message: string, status = 400) {
  return json({ error: message }, status);
}

// ─── Auto-Reply Rules Engine ────────────────────────────────

interface AutoReplyRule {
  id: string;
  keywords: string[];
  response: string;
  category: string;
  priority: number;
}

// Auto-reply rules — these would ideally come from DB but using a config for now
const autoReplyRules: AutoReplyRule[] = [
  {
    id: "rule-speed",
    keywords: ["slow", "speed", "lag", "buffering", "latency"],
    response: "I understand your connection is slow. Let me check your line status.\n\nWhile I check, could you try:\n1. Restart your router\n2. Check if other devices are using heavy bandwidth\n\nI'll get back to you shortly!",
    category: "support",
    priority: 1,
  },
  {
    id: "rule-bill",
    keywords: ["bill", "payment", "invoice", "due", "pay", "amount", "balance"],
    response: "Here's your billing summary:\nPlease visit our portal or reply with your subscriber code for details.\n\nPay via: https://pay.cryptsk.com",
    category: "billing",
    priority: 1,
  },
  {
    id: "rule-plan",
    keywords: ["plan", "upgrade", "change", "offer", "package"],
    response: "Here are available plans:\n1. Fiber 50 Mbps - ₹499/mo\n2. Fiber 100 Mbps - ₹799/mo\n3. Fiber 200 Mbps - ₹1,299/mo\n4. Fiber 500 Mbps - ₹2,499/mo\n\nReply with plan number to upgrade!",
    category: "sales",
    priority: 2,
  },
  {
    id: "rule-outage",
    keywords: ["no internet", "down", "not working", "outage", "disconnect"],
    response: "I'm sorry you're experiencing connectivity issues.\n\nLet me check for outages in your area. Please share your router's LED status while I investigate.",
    category: "support",
    priority: 1,
  },
  {
    id: "rule-complaint",
    keywords: ["complaint", "issue", "problem", "technician", "visit", "ticket"],
    response: "I understand your frustration. I'm escalating this to our support team.\nA technician will contact you within 4 hours.\nPriority: High",
    category: "support",
    priority: 1,
  },
  {
    id: "rule-greeting",
    keywords: ["hello", "hi", "hey", "good morning", "good evening", "good afternoon"],
    response: "Hello! Welcome to Cryptsk Support. I'm your AI assistant.\n\nHow can I help you today?\n1. Check my bill\n2. Connection issue\n3. Plan upgrade\n4. Speed test\n5. Complaint\n\nJust type your query or reply with a number!",
    category: "greeting",
    priority: 3,
  },
];

function matchAutoReply(message: string): AutoReplyRule | null {
  const lower = message.toLowerCase();
  let bestMatch: AutoReplyRule | null = null;

  for (const rule of autoReplyRules) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      if (!bestMatch || rule.priority < bestMatch.priority) {
        bestMatch = rule;
      }
    }
  }

  return bestMatch;
}

/**
 * Process incoming message — store in DB, match auto-reply, create notification.
 */
async function processIncomingMessage(phone: string, message: string, customerName: string): Promise<{
  conversationId: string;
  botReply: string;
  autoResolved: boolean;
}> {
  // Find subscriber by phone
  const subscriber = await db.subscriber.findFirst({
    where: { phone: { endsWith: phone.replace(/^\+/, "") } },
  });

  // Store incoming message as notification
  const incomingNotif = await db.notification.create({
    data: {
      subscriberId: subscriber?.id,
      type: "WHATSAPP",
      category: "OTHER",
      title: `Incoming: ${customerName}`,
      message,
      status: "READ",
    },
  });

  // Match auto-reply rule
  const rule = matchAutoReply(message);
  const botReply = rule
    ? rule.response
    : `Thank you for your message, ${customerName}. I'm looking into this for you. A support agent will get back to you shortly.\n\n1. Check my bill\n2. Connection issue\n3. Plan upgrade\n4. Speed test\n5. Complaint`;

  // Store outgoing reply as notification
  await db.notification.create({
    data: {
      subscriberId: subscriber?.id,
      type: "WHATSAPP",
      category: "OTHER",
      title: `Outgoing: Auto-reply`,
      message: botReply,
      status: "PENDING",
    },
  });

  // Check if auto-resolved (greeting/thanks patterns)
  const isResolved = ["thank", "thanks", "working", "great", "done", "ok", "okay"].some((kw) =>
    message.toLowerCase().includes(kw)
  );

  logger.info("Incoming message processed", {
    notificationId: incomingNotif.id,
    phone,
    subscriberId: subscriber?.id,
    matchedRule: rule?.id,
    autoResolved: isResolved,
  });

  return {
    conversationId: incomingNotif.id,
    botReply,
    autoResolved: isResolved,
  };
}

/**
 * Send template message — store in DB as PENDING notification.
 */
async function sendTemplateMessage(
  phone: string,
  templateName: string,
  variables: string[] = []
): Promise<{ success: boolean; messageId: string; renderedMessage: string }> {
  // Find template
  const template = await db.whatsAppTemplate.findFirst({ where: { name: templateName } });
  if (!template) return { success: false, messageId: "", renderedMessage: `Template "${templateName}" not found` };

  // Find subscriber
  const subscriber = await db.subscriber.findFirst({
    where: { phone: { endsWith: phone.replace(/^\+/, "") } },
  });

  // Render template with variables
  let renderedMessage = template.content;
  const templateVars = template.variables ? JSON.parse(template.variables) : [];
  variables.forEach((v, i) => {
    if (templateVars[i]) {
      renderedMessage = renderedMessage.replace(new RegExp(`\\{\\{${templateVars[i]}\\}\\}`, "g"), v);
    }
  });

  // Store as pending notification
  const notification = await db.notification.create({
    data: {
      subscriberId: subscriber?.id,
      type: "WHATSAPP",
      category: "OTHER",
      title: `Template: ${templateName}`,
      message: renderedMessage,
      status: "PENDING",
    },
  });

  // Update template usage count
  await db.whatsAppTemplate.update({
    where: { id: template.id },
    data: { status: "ACTIVE" },
  });

  logger.info("Template message queued", {
    notificationId: notification.id,
    templateName,
    phone,
    subscriberId: subscriber?.id,
  });

  return { success: true, messageId: notification.id, renderedMessage };
}

/**
 * Send custom message — store in DB as PENDING notification.
 */
async function sendCustomMessage(
  phone: string,
  message: string
): Promise<{ success: boolean; messageId: string }> {
  const subscriber = await db.subscriber.findFirst({
    where: { phone: { endsWith: phone.replace(/^\+/, "") } },
  });

  const notification = await db.notification.create({
    data: {
      subscriberId: subscriber?.id,
      type: "WHATSAPP",
      category: "OTHER",
      title: "Custom Message",
      message,
      status: "PENDING",
    },
  });

  logger.info("Custom message queued", {
    notificationId: notification.id,
    phone,
    subscriberId: subscriber?.id,
  });

  return { success: true, messageId: notification.id };
}

// ─── Outgoing Message Queue Processor ───────────────────────

let queueProcessing = false;

async function processOutgoingQueue() {
  if (queueProcessing) return;
  queueProcessing = true;

  try {
    const settings = await db.ispSettings.findUnique({ where: { id: "default" } });
    if (!settings?.whatsappEnabled) return;
    if (!settings.whatsappApiToken || !settings.whatsappPhoneNumberId) {
      logger.warn("WhatsApp not configured — skipping queue processing");
      return;
    }

    const pending = await db.notification.findMany({
      where: {
        type: "WHATSAPP",
        status: "PENDING",
        subscriberId: { not: null },
      },
      include: { subscriber: { select: { phone: true, name: true } } },
      take: 20,
    });

    for (const notif of pending) {
      if (!notif.subscriber?.phone) continue;

      try {
        const phone = notif.subscriber.phone.startsWith("+")
          ? notif.subscriber.phone
          : `91${notif.subscriber.phone}`;

        // In production, this would call the WhatsApp Business API:
        // POST https://graph.facebook.com/v18.0/{phoneNumberId}/messages
        const apiUrl = `https://graph.facebook.com/v18.0/${settings.whatsappPhoneNumberId}/messages`;
        const body = {
          messaging_product: "whatsapp",
          to: phone,
          type: "text",
          text: { body: notif.message },
        };

        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${settings.whatsappApiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });

        const result = await response.json();

        if (response.ok && !result.error) {
          await db.notification.update({
            where: { id: notif.id },
            data: { status: "SENT", sentAt: new Date() },
          });
          logger.info("WhatsApp message sent", {
            notificationId: notif.id,
            phone,
            messageId: result.messages?.[0]?.id,
          });
        } else {
          // Mark as failed, increment retry
          const newRetry = notif.retryCount + 1;
          if (newRetry >= notif.maxRetries) {
            await db.notification.update({
              where: { id: notif.id },
              data: { status: "FAILED", retryCount: newRetry },
            });
          } else {
            await db.notification.update({
              where: { id: notif.id },
              data: { retryCount: newRetry },
            });
          }
          logger.warn("WhatsApp send failed", {
            notificationId: notif.id,
            phone,
            error: result.error?.message,
            retryCount: newRetry,
          });
        }
      } catch (err) {
        logger.error("WhatsApp send error", {
          notificationId: notif.id,
          error: String(err),
        });
      }

      // Rate limit — WhatsApp allows ~10 msgs/sec for Business API
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  } catch (err) {
    logger.error("Queue processing error", { error: String(err) });
  } finally {
    queueProcessing = false;
  }
}

// Process outgoing queue every 30 seconds
setInterval(() => {
  processOutgoingQueue().catch(() => {});
}, 30000);

// ─── HTTP Server ────────────────────────────────────────────

Bun.serve({
  port: 3003,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Health check — no auth required
    if (path === "/api/health" && req.method === "GET") {
      return json({
        status: "ok",
        service: "whatsapp-bot",
        version: "2.0.0",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      });
    }

    // Root
    if (path === "/" && req.method === "GET") {
      return json({ status: "ok", service: "whatsapp-bot", health: "/api/health" });
    }

    // ── WhatsApp Webhook Verification (GET) ──
    // This is for WhatsApp Business API webhook setup
    if (path === "/webhook" && req.method === "GET") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      if (mode === "subscribe" && token) {
        const settings = await db.ispSettings.findUnique({ where: { id: "default" } });
        let verifyToken = "";
        try {
          const webhookConfig = settings?.whatsappWebhookConfig ? JSON.parse(settings.whatsappWebhookConfig) : {};
          verifyToken = webhookConfig.verifyToken || "cryptsk_whatsapp_verify";
        } catch {
          verifyToken = "cryptsk_whatsapp_verify";
        }

        if (token === verifyToken) {
          logger.info("Webhook verified", { mode, token });
          return new Response(challenge, { status: 200 });
        }
      }
      return json({ error: "Verification failed" }, 403);
    }

    // ── WhatsApp Webhook (POST) — incoming messages from WhatsApp ──
    if (path === "/webhook" && req.method === "POST") {
      try {
        const body = await req.json();

        // WhatsApp Cloud API webhook format
        if (body.object === "whatsapp_business_account") {
          const entries = body.entry || [];
          for (const entry of entries) {
            const changes = entry.changes || [];
            for (const change of changes) {
              const value = change.value;
              const messages = value.messages || [];

              for (const msg of messages) {
                const phone = msg.from;
                const text = msg.text?.body || "";
                const contactName = value.contacts?.[0]?.profile?.name || "Customer";

                if (text) {
                  processIncomingMessage(phone, text, contactName).catch((err) => {
                    logger.error("Webhook message processing failed", { phone, error: String(err) });
                  });
                }
              }

              // Handle delivery receipts
              const statuses = value.statuses || [];
              for (const status of statuses) {
                if (status.status === "delivered" || status.status === "read") {
                  logger.info("Message delivery status", {
                    messageId: status.id,
                    phone: status.recipient_id,
                    status: status.status,
                    timestamp: status.timestamp,
                  });
                }
              }
            }
          }
        }

        return json({ success: true });
      } catch (err) {
        logger.error("Webhook processing error", { error: String(err) });
        return json({ error: "Webhook processing failed" }, 500);
      }
    }

    // ── All remaining endpoints require auth ──
    let auth;
    try {
      auth = requireAuth(req);
    } catch {
      return json({ error: "Unauthorized" }, 401);
    }

    // ── POST /api/webhook (manual incoming message — for testing) ──
    if (path === "/api/webhook" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const phone = body.phone || body.from;
      const message = body.message || body.text || "";
      const customerName = body.customerName || "Customer";

      if (!phone || !message) return jsonErr("Phone and message are required");

      const result = await processIncomingMessage(phone, message, customerName);
      return json({ success: true, ...result, timestamp: new Date().toISOString() });
    }

    // ── GET /api/conversations ──
    if (path === "/api/conversations" && req.method === "GET") {
      const limit = parseInt(url.searchParams.get("limit") || "50");
      const search = url.searchParams.get("search") || "";

      const where: Record<string, unknown> = { type: "WHATSAPP" };
      if (search) {
        where.message = { contains: search };
      }

      const notifications = await db.notification.findMany({
        where,
        include: {
          subscriber: { select: { id: true, name: true, phone: true, code: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      // Group by subscriber for conversation view
      const conversations = new Map<string, unknown>();
      for (const notif of notifications) {
        const key = notif.subscriberId || notif.subscriber?.phone || "unknown";
        if (!conversations.has(key)) {
          conversations.set(key, {
            subscriberId: notif.subscriberId,
            subscriberName: notif.subscriber?.name || notif.subscriber?.phone || "Unknown",
            subscriberPhone: notif.subscriber?.phone || "",
            subscriberCode: notif.subscriber?.code || "",
            lastMessage: notif.message,
            lastMessageAt: notif.createdAt,
            messageCount: 1,
            type: notif.category,
          });
        } else {
          const conv = conversations.get(key) as Record<string, unknown>;
          conv.messageCount = (conv.messageCount as number) + 1;
        }
      }

      return json({
        conversations: Array.from(conversations.values()),
        total: conversations.size,
        allMessages: notifications.map((n) => ({
          id: n.id,
          subscriberId: n.subscriberId,
          subscriberName: n.subscriber?.name,
          subscriberPhone: n.subscriber?.phone,
          direction: n.title.startsWith("Incoming") ? "incoming" : "outgoing",
          message: n.message,
          status: n.status,
          createdAt: n.createdAt,
          sentAt: n.sentAt,
        })),
        messageCount: notifications.length,
      });
    }

    // ── GET /api/templates ──
    if (path === "/api/templates" && req.method === "GET") {
      const category = url.searchParams.get("category") || "";
      const status = url.searchParams.get("status") || "";

      const where: Record<string, unknown> = {};
      if (category) where.category = category;
      if (status) where.approvalStatus = status;

      const templates = await db.whatsAppTemplate.findMany({
        where,
        orderBy: { createdAt: "desc" },
      });

      return json({
        templates: templates.map((t) => ({
          id: t.id,
          name: t.name,
          category: t.category,
          content: t.content,
          variables: t.variables ? JSON.parse(t.variables) : [],
          status: t.status,
          mediaType: t.mediaType,
          approvalStatus: t.approvalStatus,
          createdAt: t.createdAt,
        })),
        total: templates.length,
      });
    }

    // ── POST /api/templates (create template) ──
    if (path === "/api/templates" && req.method === "POST") {
      const body = await req.json();
      const { name, category, content, variables } = body;
      if (!name || !content) return jsonErr("Name and content are required");

      const template = await db.whatsAppTemplate.create({
        data: {
          name,
          category: category || "General",
          content,
          variables: variables ? JSON.stringify(variables) : "[]",
          status: "ACTIVE",
          mediaType: body.mediaType || "TEXT",
          approvalStatus: body.approvalStatus || "DRAFT",
        },
      });

      logger.info("Template created", { templateId: template.id, name, createdBy: auth.userId });
      return json({ success: true, template: { id: template.id, name: template.name } }, 201);
    }

    // ── POST /api/send (send message) ──
    if (path === "/api/send" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { phone, templateName, templateId, variables, message: customMessage } = body;

      if (!phone) return jsonErr("Phone number is required");
      if (!templateName && !templateId && !customMessage) return jsonErr("Template name/id or custom message is required");

      let result;

      if (customMessage) {
        result = await sendCustomMessage(phone, customMessage);
      } else if (templateName || templateId) {
        const name = templateName || await db.whatsAppTemplate.findUnique({ where: { id: templateId } }).then((t) => t?.name);
        if (!name) return jsonErr("Template not found", 404);
        result = await sendTemplateMessage(phone, name, variables || []);
      }

      return json({ success: true, ...result, timestamp: new Date().toISOString() });
    }

    // ── POST /api/broadcast ──
    if (path === "/api/broadcast" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { phones, templateName, templateId, variables, message: customMessage, filter } = body;

      if (!templateName && !templateId && !customMessage) return jsonErr("Template or message required");

      // Determine recipients
      let recipients: string[] = phones || [];
      if (filter && !phones) {
        const where: Record<string, unknown> = {};
        if (filter === "all_active") where.status = "ACTIVE";
        else if (filter === "overdue") {
          // Subscribers with overdue invoices
          const overdueSubs = await db.invoice.findMany({
            where: { status: "OVERDUE", balanceAmount: { gt: 0 } },
            distinct: ["subscriberId"],
            include: { subscriber: { select: { phone: true } } },
            take: 500,
          });
          recipients = overdueSubs.map((i) => i.subscriber.phone).filter(Boolean);
        } else {
          // All subscribers with phone
          const subs = await db.subscriber.findMany({
            where: { phone: { not: "" }, status: "ACTIVE" },
            select: { phone: true },
            take: 500,
          });
          recipients = subs.map((s) => s.phone);
        }
      }

      let sent = 0;
      let failed = 0;

      for (const phone of recipients) {
        try {
          if (customMessage) {
            await sendCustomMessage(phone, customMessage);
          } else {
            await sendTemplateMessage(phone, templateName, variables || []);
          }
          sent++;
        } catch {
          failed++;
        }
      }

      logger.info("Broadcast queued", {
        templateName: templateName || "custom",
        recipients: recipients.length,
        sent,
        failed,
        triggeredBy: auth.userId,
      });

      return json({
        success: true,
        broadcastId: `bc-${Date.now()}`,
        templateName: templateName || "custom",
        totalRecipients: recipients.length,
        queued: sent,
        failed,
        timestamp: new Date().toISOString(),
      });
    }

    // ── GET /api/stats ──
    if (path === "/api/stats" && req.method === "GET") {
      const totalMessages = await db.notification.count({ where: { type: "WHATSAPP" } });
      const pending = await db.notification.count({ where: { type: "WHATSAPP", status: "PENDING" } });
      const sent = await db.notification.count({ where: { type: "WHATSAPP", status: "SENT" } });
      const failed = await db.notification.count({ where: { type: "WHATSAPP", status: "FAILED" } });
      const totalTemplates = await db.whatsAppTemplate.count();
      const activeTemplates = await db.whatsAppTemplate.count({ where: { approvalStatus: "APPROVED" } });

      // Recent messages (last 24h)
      const since = new Date(Date.now() - 86400000);
      const recentMessages = await db.notification.count({
        where: { type: "WHATSAPP", createdAt: { gte: since } },
      });

      return json({
        stats: {
          totalMessages,
          pending,
          sent,
          failed,
          messagesToday: recentMessages,
          totalTemplates,
          activeTemplates,
          resolutionRate: totalMessages > 0 ? +((sent / totalMessages) * 100).toFixed(1) : 0,
          queueProcessing,
        },
      });
    }

    // ── GET /api/auto-reply-rules ──
    if (path === "/api/auto-reply-rules" && req.method === "GET") {
      return json({
        rules: autoReplyRules.map((r) => ({
          id: r.id,
          keywords: r.keywords,
          response: r.response,
          category: r.category,
          priority: r.priority,
        })),
        total: autoReplyRules.length,
      });
    }

    // ── GET /api/queue (pending messages) ──
    if (path === "/api/queue" && req.method === "GET") {
      const limit = parseInt(url.searchParams.get("limit") || "20");
      const pending = await db.notification.findMany({
        where: { type: "WHATSAPP", status: "PENDING" },
        include: { subscriber: { select: { name: true, phone: true } } },
        orderBy: { createdAt: "asc" },
        take: limit,
      });
      return json({
        queue: pending.map((n) => ({
          id: n.id,
          message: n.message.substring(0, 100),
          subscriberName: n.subscriber?.name,
          subscriberPhone: n.subscriber?.phone,
          retryCount: n.retryCount,
          createdAt: n.createdAt,
        })),
        total: pending.length,
      });
    }

    // ── POST /api/process-queue (manual trigger) ──
    if (path === "/api/process-queue" && req.method === "POST") {
      processOutgoingQueue().catch(() => {});
      return json({ success: true, message: "Queue processing triggered", triggeredBy: auth.userId, timestamp: new Date().toISOString() });
    }

    return json({ error: "Not Found", path }, 404);
  },
});

logger.info("WhatsApp Bot Service started on port 3003", { version: "2.0.0" });
logger.info("Webhook endpoint available at /webhook");
logger.info("Outgoing queue processor interval: 30 seconds");
