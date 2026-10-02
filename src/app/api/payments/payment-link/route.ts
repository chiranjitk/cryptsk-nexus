import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, permissionFor, AuthError } from "@/lib/api-auth";
import { newReceiptNumber } from "@/lib/services/receipt";
import { sendEmail } from "@/lib/services/email-service";
import { sendSMS } from "@/lib/services/sms-service";
import { sendTest, resolveConfig, type FlatCfg } from "@/lib/integrations/adapters";
import { auditLog } from "@/lib/services/audit-service";
import { fireEventAsync } from "@/lib/services/webhook-service";

// ─────────────────────────────────────────────────────────────────────────────
// [PAYMENTS-NOLEAK] POST/GET/PUT /api/payments/payment-link
//
// One-click hosted payment links for open invoices — the collector never
// handles the money, the gateway does. Supported providers:
//   • Razorpay → Payment Links API (short_url, hosted checkout, SMS/email
//     notification by Razorpay itself, reference_id = our receiptNumber)
//   • Stripe   → Checkout Sessions (hosted session URL, expires 24h)
//
// Lifecycle (all states audit-visible, zero silent money):
//   POST (create)      → PENDING Payment row + gateway link + IntegrationTransaction
//                        ledger row (transactionType "payment_link")
//   POST (action=send) → share the link over EMAIL / SMS / WHATSAPP via the
//                        production channel gateways (Notification row per attempt)
//   PUT (verify)       → PULL-based settlement: fetch live gateway status; when
//                        paid, mark payment VERIFIED + settle invoice balance in
//                        one $transaction + ledger capture + webhooks
//   GET                → list links for an invoice (dialog shows status history)
//
// NOTE: no webhook receiver exists yet — verification is pull-based (staff hits
// "Check status", or the Reconciliation sync backfills). This matches the
// platform's existing pull-based verify design.
// ─────────────────────────────────────────────────────────────────────────────

const NOTES_MARKER = "PAYMENT_LINK";

function inr(n: number): string {
  return `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function basicAuth(apiKey: string, apiSecret: string): string {
  return Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
}

interface GatewayCfg {
  provider: string;
  apiKey: string;
  apiSecret: string;
  environment: "test" | "live";
}

async function getGateway(): Promise<GatewayCfg | null> {
  const gw = await db.integrationConfig.findFirst({
    where: { type: "payment_gateway", enabled: true, apiKey: { not: "" } },
    orderBy: { updatedAt: "desc" },
  });
  if (!gw) return null;
  return {
    provider: gw.provider,
    apiKey: gw.apiKey || "",
    apiSecret: gw.apiSecret || "",
    environment: (gw.environment as "test" | "live") || "test",
  };
}

// ── Provider calls ───────────────────────────────────────────────────────────

async function createRazorpayLink(opts: {
  amountPaise: number; receipt: string; description: string;
  name: string; email?: string; phone?: string; notes: Record<string, string>;
  expireByEpoch: number; cfg: GatewayCfg;
}): Promise<{ id: string; url: string }> {
  const res = await fetch("https://api.razorpay.com/v1/payment_links", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${basicAuth(opts.cfg.apiKey, opts.cfg.apiSecret)}` },
    body: JSON.stringify({
      amount: opts.amountPaise,
      currency: "INR",
      accept_partial: false,
      reference_id: opts.receipt,
      description: opts.description,
      customer: { name: opts.name, ...(opts.email ? { email: opts.email } : {}), ...(opts.phone ? { contact: opts.phone } : {}) },
      notify: { sms: !!opts.phone, email: !!opts.email },
      reminder_enable: true,
      expire_by: opts.expireByEpoch,
      notes: opts.notes,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id || !data.short_url) {
    throw new Error(data?.error?.description || `Razorpay error ${res.status}`);
  }
  return { id: data.id, url: data.short_url };
}

async function createStripeLink(opts: {
  amountPaise: number; description: string; email?: string;
  origin: string; receipt: string; notes: Record<string, string>; cfg: GatewayCfg;
}): Promise<{ id: string; url: string }> {
  const form: Record<string, string> = {
    mode: "payment",
    success_url: `${opts.origin}/?payment=success&receipt=${encodeURIComponent(opts.receipt)}`,
    cancel_url: `${opts.origin}/?payment=cancelled&receipt=${encodeURIComponent(opts.receipt)}`,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "inr",
    "line_items[0][price_data][unit_amount]": String(opts.amountPaise),
    "line_items[0][price_data][product_data][name]": opts.description.slice(0, 120),
    // Stripe Checkout (payment mode) sessions live max 24h
    expires_at: String(Math.floor(Date.now() / 1000) + 24 * 3600),
  };
  if (opts.email) form.customer_email = opts.email;
  for (const [k, v] of Object.entries(opts.notes)) form[`metadata[${k}]`] = v;
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.cfg.apiSecret}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id || !data.url) {
    throw new Error(data?.error?.message || `Stripe error ${res.status}`);
  }
  return { id: data.id, url: data.url };
}

// Pull live status from the gateway for a stored link.
async function fetchLinkStatus(link: { provider: string; linkId: string; cfg: GatewayCfg }): Promise<{
  paid: boolean; gatewayPaymentRef?: string; gatewayPaidAmount?: number; status: string;
}> {
  if (link.provider === "razorpay") {
    const res = await fetch(`https://api.razorpay.com/v1/payment_links/${link.linkId}`, {
      headers: { Authorization: `Basic ${basicAuth(link.cfg.apiKey, link.cfg.apiSecret)}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.description || `Razorpay error ${res.status}`);
    const captured = Array.isArray(data.payments)
      ? data.payments.find((p: { status?: string }) => p.status === "captured" || p.status === "authorized")
      : null;
    return {
      paid: data.status === "paid",
      gatewayPaymentRef: captured?.id,
      gatewayPaidAmount: captured?.amount != null ? captured.amount / 100 : undefined,
      status: String(data.status || "unknown"),
    };
  }
  if (link.provider === "stripe") {
    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${link.linkId}`, {
      headers: { Authorization: `Bearer ${link.cfg.apiSecret}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `Stripe error ${res.status}`);
    return {
      paid: data.payment_status === "paid",
      gatewayPaymentRef: data.payment_intent || undefined,
      gatewayPaidAmount: data.amount_total != null ? data.amount_total / 100 : undefined,
      status: String(data.payment_status || data.status || "unknown"),
    };
  }
  throw new Error(`Payment-link verification not supported for provider: ${link.provider}`);
}

// ── Settlement (shared by PUT verify) ────────────────────────────────────────

async function settlePayment(opts: {
  paymentId: string; invoiceId: string | null; linkId: string; gatewayPaymentRef: string;
  paidAmount: number; method?: string; userId: string;
}): Promise<{ invoiceStatus?: string; alreadySettled: boolean }> {
  return db.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: opts.paymentId }, include: { Invoice: true } });
    if (!payment) throw new Error("Payment row missing");
    if (payment.status === "VERIFIED") return { alreadySettled: true };

    await tx.payment.update({
      where: { id: opts.paymentId },
      data: {
        status: "VERIFIED",
        verifiedById: opts.userId,
        transactionRef: `${opts.linkId}|${opts.gatewayPaymentRef}`,
        notes: payment.notes
          ? `${payment.notes} [auto-settled from payment link ${opts.gatewayPaymentRef}${opts.method ? ` via ${opts.method}` : ""}]`
          : `[auto-settled from payment link ${opts.gatewayPaymentRef}${opts.method ? ` via ${opts.method}` : ""}]`,
      },
    });

    let invoiceStatus: "PAID" | "PARTIALLY_PAID" | undefined;
    if (opts.invoiceId && payment.Invoice) {
      const invoice = payment.Invoice;
      if (invoice.balanceAmount > 0.01) {
        const newPaid = invoice.paidAmount + opts.paidAmount;
        const newBalance = Math.max(0, invoice.grandTotal - newPaid);
        invoiceStatus = newBalance <= 0.01 ? "PAID" : "PARTIALLY_PAID";
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            paidAmount: newPaid,
            balanceAmount: newBalance,
            status: invoiceStatus,
            paidAt: invoiceStatus === "PAID" ? new Date() : invoice.paidAt,
          },
        });
      }
      // else: invoice already settled elsewhere — money is still VERIFIED on the
      // payment row (collector applies credit/refund manually). No silent write.
    }

    // Ledger capture: link the gateway payment entity to our Payment row.
    const existing = await tx.integrationTransaction.findFirst({
      where: { OR: [{ externalRef: opts.gatewayPaymentRef }, { externalRef: opts.linkId }] },
    });
    if (existing) {
      await tx.integrationTransaction.update({
        where: { id: existing.id },
        data: { status: "captured", transactionType: "payment", externalRef: opts.gatewayPaymentRef, paymentId: opts.paymentId },
      });
    } else {
      await tx.integrationTransaction.create({
        data: {
          gatewayType: "payment_link",
          transactionType: "payment",
          amount: opts.paidAmount,
          status: "captured",
          externalRef: opts.gatewayPaymentRef,
          paymentId: opts.paymentId,
        },
      }).catch(() => { /* ledger write must not block settlement */ });
    }

    return { invoiceStatus, alreadySettled: false };
  });
}

// ── Handlers ─────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req);
    await permissionFor(userId, "payments.read");
    const invoiceId = new URL(req.url).searchParams.get("invoiceId");
    if (!invoiceId) return NextResponse.json({ error: "invoiceId is required" }, { status: 400 });

    const txns = await db.integrationTransaction.findMany({
      where: { transactionType: "payment_link", Payment: { is: { invoiceId } } },
      include: {
        Payment: {
          select: { id: true, receiptNumber: true, amount: true, status: true, notes: true, createdAt: true, transactionRef: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    const links = txns
      .filter((t) => t.Payment)
      .map((t) => {
        const notes = t.Payment?.notes || "";
        const url = notes.split(" ").find((tok) => tok.startsWith("http")) || "";
        return {
          txnId: t.id,
          paymentId: t.Payment?.id,
          receiptNumber: t.Payment?.receiptNumber || "",
          amount: t.Payment?.amount || 0,
          status: t.Payment?.status || "PENDING",
          createdAt: t.Payment?.createdAt,
          provider: t.gatewayType,
          linkId: t.externalRef,
          url,
        };
      });

    return NextResponse.json({ links });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("payment-link GET error:", error);
    return NextResponse.json({ error: "Failed to load payment links" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req);
    await permissionFor(userId, "payments.create");
    const body = await req.json();

    // ── Share an existing link over channels ──
    if (body.action === "send") {
      const { paymentId, channels, email, phone } = body;
      if (!paymentId) return NextResponse.json({ error: "paymentId is required" }, { status: 400 });
      const pay = await db.payment.findUnique({
        where: { id: paymentId },
        include: {
          Subscriber: { select: { id: true, name: true, code: true, email: true, phone: true } },
          Invoice: { select: { invoiceNumber: true, balanceAmount: true } },
        },
      });
      if (!pay) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
      const url = (pay.notes || "").split(" ").find((tok) => tok.startsWith("http"));
      if (!url) return NextResponse.json({ error: "No payment link stored on this payment" }, { status: 400 });

      const settings = await db.ispSettings.findUnique({ where: { id: "default" } });
      const company = settings?.companyName || "ISP";
      const chs: string[] = Array.isArray(channels) && channels.length ? channels : ["SMS", "WHATSAPP"];
      const overrideEmail = typeof email === "string" && email.includes("@") ? email.trim() : undefined;
      const overridePhone = typeof phone === "string" && phone.replace(/\D/g, "").length >= 10 ? phone.trim() : undefined;
      const invNum = pay.Invoice?.invoiceNumber || "your invoice";
      const amountTxt = inr(pay.amount);

      const textMessage = [
        `${company}: payment link for invoice ${invNum}`,
        `Amount due: ${amountTxt}`,
        `Pay securely online: ${url}`,
        `Reference: ${pay.receiptNumber}`,
      ].join("\n");

      const htmlMessage = `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
          <div style="background:#0f766e;color:#fff;padding:16px 20px">
            <div style="font-size:18px;font-weight:700">${company}</div>
            <div style="font-size:12px;opacity:.85">Payment Request</div>
          </div>
          <div style="padding:20px;color:#0f172a;font-size:14px;line-height:1.7">
            <div style="font-size:22px;font-weight:800;color:#0f766e;margin-bottom:8px">${amountTxt}</div>
            <div>Invoice <b>${invNum}</b></div>
            <div style="margin:16px 0">
              <a href="${url}" style="background:#0f766e;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:700;display:inline-block">Pay Now</a>
            </div>
            <div style="color:#64748b;font-size:12px">Or copy this secure link: ${url}</div>
          </div>
          <div style="background:#f8fafc;padding:12px 20px;color:#64748b;font-size:12px;border-top:1px solid #e2e8f0">
            ${settings?.receiptFooterText || "This is a computer-generated payment request."}
          </div>
        </div>`;

      const results: Array<{ channel: string; success: boolean; detail: string }> = [];

      if (chs.includes("EMAIL")) {
        const to = overrideEmail || pay.Subscriber?.email || "";
        if (!to) {
          results.push({ channel: "EMAIL", success: false, detail: "No email address on file — provide one in the dialog" });
        } else {
          const r = await sendEmail({ to, subject: `Payment link for invoice ${invNum} — ${company}`, html: htmlMessage, text: textMessage });
          results.push({ channel: "EMAIL", success: r.success, detail: r.success ? `Sent to ${to}` : r.error || "Send failed" });
          await db.notification.create({
            data: { subscriberId: pay.subscriberId, userId, type: "EMAIL", category: "BILL_DUE", title: `Payment link ${invNum}`, message: textMessage, status: r.success ? "SENT" : "FAILED", sentAt: r.success ? new Date() : null },
          }).catch(() => { /* best-effort */ });
        }
      }
      if (chs.includes("SMS")) {
        const to = overridePhone || pay.Subscriber?.phone || "";
        if (!to) {
          results.push({ channel: "SMS", success: false, detail: "No phone number on file — provide one in the dialog" });
        } else {
          const r = await sendSMS(to, textMessage.slice(0, 480));
          results.push({ channel: "SMS", success: r.success, detail: r.success ? `Sent to ${to} via ${r.provider}` : r.error || "Send failed" });
          await db.notification.create({
            data: { subscriberId: pay.subscriberId, userId, type: "SMS", category: "BILL_DUE", title: `Payment link ${invNum}`, message: textMessage, status: r.success ? "SENT" : "FAILED", sentAt: r.success ? new Date() : null },
          }).catch(() => { /* best-effort */ });
        }
      }
      if (chs.includes("WHATSAPP")) {
        const to = overridePhone || pay.Subscriber?.phone || "";
        if (!to) {
          results.push({ channel: "WHATSAPP", success: false, detail: "No phone number on file — provide one in the dialog" });
        } else {
          const waConfig = await db.integrationConfig.findFirst({
            where: { type: "communication", provider: { in: ["twilio-whatsapp", "gupshup", "wati", "meta-whatsapp"] }, enabled: true },
            orderBy: { updatedAt: "desc" },
          });
          if (!waConfig) {
            results.push({ channel: "WHATSAPP", success: false, detail: "No WhatsApp gateway configured — set one up in INTEGRATIONS" });
          } else {
            let cfg: FlatCfg = { apiKey: waConfig.apiKey || "", apiSecret: waConfig.apiSecret || "", merchantId: waConfig.merchantId || "" };
            try { Object.assign(cfg, JSON.parse(waConfig.config || "{}")); } catch { /* ignore */ }
            cfg = resolveConfig(waConfig.provider, cfg);
            const r = await sendTest(waConfig.provider, cfg, { to, message: textMessage.slice(0, 900) });
            results.push({ channel: "WHATSAPP", success: r.ok, detail: r.ok ? `Sent to ${to} via ${waConfig.provider}` : r.message });
            await db.notification.create({
              data: { subscriberId: pay.subscriberId, userId, type: "WHATSAPP", category: "BILL_DUE", title: `Payment link ${invNum}`, message: textMessage, status: r.ok ? "SENT" : "FAILED", sentAt: r.ok ? new Date() : null },
            }).catch(() => { /* best-effort */ });
          }
        }
      }

      const okCount = results.filter((r) => r.success).length;
      await auditLog(req, "CREATE", "Notification", paymentId, {
        action: "payment-link-send", receipt: pay.receiptNumber, channels: chs, okCount, by: userId,
      });
      return NextResponse.json({
        message: okCount === results.length ? `Payment link sent via ${okCount} channel(s)` : `Sent on ${okCount}/${results.length} channel(s) — see per-channel results`,
        results,
      });
    }

    // ── Create a new hosted payment link ──
    const { invoiceId, expiryDays } = body;
    if (!invoiceId) return NextResponse.json({ error: "invoiceId is required" }, { status: 400 });

    const invoice = await db.invoice.findUnique({
      where: { id: invoiceId },
      include: { Subscriber: { select: { id: true, name: true, code: true, email: true, phone: true } } },
    });
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    if (invoice.status === "CANCELLED") return NextResponse.json({ error: "Invoice is cancelled — payment links are disabled" }, { status: 400 });
    if (invoice.balanceAmount <= 0.01) return NextResponse.json({ error: "Invoice has no outstanding balance" }, { status: 400 });
    if (invoice.status === "DRAFT") return NextResponse.json({ error: "Invoice is a draft — mark it as sent before requesting payment" }, { status: 400 });

    const cfg = await getGateway();
    if (!cfg) {
      return NextResponse.json({ error: "No payment gateway configured. Set up Razorpay or Stripe in INTEGRATIONS." }, { status: 400 });
    }
    if (cfg.provider !== "razorpay" && cfg.provider !== "stripe") {
      return NextResponse.json({ error: `Payment links require Razorpay or Stripe (active gateway: ${cfg.provider})` }, { status: 400 });
    }

    const amountPaise = Math.round(invoice.balanceAmount * 100);
    const receiptNumber = newReceiptNumber();
    const description = `Invoice ${invoice.invoiceNumber}`;
    const notes: Record<string, string> = {
      invoice_id: invoice.id,
      invoice_number: invoice.invoiceNumber,
      subscriber_id: invoice.subscriberId,
      receipt: receiptNumber,
    };

    let created: { id: string; url: string };
    let expiresNote = "";
    if (cfg.provider === "razorpay") {
      const days = Math.min(Math.max(Number(expiryDays) || 7, 1), 30);
      created = await createRazorpayLink({
        amountPaise, receipt: receiptNumber, description,
        name: invoice.Subscriber?.name || "Customer",
        email: invoice.Subscriber?.email || undefined,
        phone: invoice.Subscriber?.phone || undefined,
        notes,
        expireByEpoch: Math.floor(Date.now() / 1000) + days * 86400,
        cfg,
      });
      expiresNote = `expires in ${days} day(s)`;
    } else {
      const origin = new URL(req.url).origin;
      created = await createStripeLink({
        amountPaise, description,
        email: invoice.Subscriber?.email || undefined,
        origin, receipt: receiptNumber, notes, cfg,
      });
      expiresNote = "expires in 24h (Stripe limit)";
    }

    // PENDING payment row — will be VERIFIED by pull-verify (PUT) when the
    // customer completes checkout. Collected-by = staff who created the link.
    const payment = await db.payment.create({
      data: {
        subscriberId: invoice.subscriberId,
        invoiceId: invoice.id,
        amount: invoice.balanceAmount,
        paymentMode: "ONLINE",
        transactionRef: created.id,
        receiptNumber,
        status: "PENDING",
        collectedById: userId,
        notes: `${NOTES_MARKER} (${cfg.provider}, ${expiresNote}): ${created.url}`,
      },
    });

    await db.integrationTransaction.create({
      data: {
        gatewayType: cfg.provider,
        transactionType: "payment_link",
        amount: invoice.balanceAmount,
        status: "created",
        externalRef: created.id,
        paymentId: payment.id,
      },
    }).catch(() => { /* ledger write must not block link creation */ });

    fireEventAsync("payment.initiated", {
      paymentId: payment.id,
      receiptNumber,
      amount: invoice.balanceAmount,
      provider: cfg.provider,
      paymentLink: true,
      linkId: created.id,
      Subscriber: invoice.Subscriber,
    });

    await auditLog(req, "CREATE", "Payment", payment.id, {
      action: "payment-link-create", provider: cfg.provider, linkId: created.id,
      invoice: invoice.invoiceNumber, amount: invoice.balanceAmount, by: userId,
    });

    return NextResponse.json({
      success: true,
      link: {
        paymentId: payment.id,
        receiptNumber,
        provider: cfg.provider,
        linkId: created.id,
        url: created.url,
        amount: invoice.balanceAmount,
        expiresNote,
      },
      message: `Payment link created — ${inr(invoice.balanceAmount)} via ${cfg.provider}`,
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("payment-link POST error:", error);
    const msg = error instanceof Error ? error.message : "Failed to create payment link";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req);
    await permissionFor(userId, "payments.create");
    const body = await req.json();
    const { paymentId } = body;
    if (!paymentId) return NextResponse.json({ error: "paymentId is required" }, { status: 400 });

    const payment = await db.payment.findUnique({
      where: { id: paymentId },
      include: { Invoice: { select: { invoiceNumber: true, balanceAmount: true } } },
    });
    if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

    if (payment.status === "VERIFIED") {
      return NextResponse.json({ settled: true, alreadySettled: true, message: `Already settled — receipt ${payment.receiptNumber} is VERIFIED` });
    }
    if (payment.status === "FAILED" || payment.status === "REFUNDED") {
      return NextResponse.json({ error: `Payment is ${payment.status} — verification is not available` }, { status: 400 });
    }

    const linkId = payment.transactionRef;
    if (!linkId) return NextResponse.json({ error: "Payment has no gateway link reference" }, { status: 400 });

    const cfg = await getGateway();
    if (!cfg) return NextResponse.json({ error: "No payment gateway configured" }, { status: 400 });

    const live = await fetchLinkStatus({ provider: cfg.provider, linkId, cfg });

    if (!live.paid) {
      await auditLog(req, "UPDATE", "Payment", payment.id, {
        action: "payment-link-check", linkId, gatewayStatus: live.status, by: userId,
      });
      return NextResponse.json({
        settled: false,
        gatewayStatus: live.status,
        message: `Not paid yet — gateway says "${live.status}". The link stays active until it expires.`,
      });
    }

    const paidAmount = live.gatewayPaidAmount ?? payment.amount;
    const result = await settlePayment({
      paymentId: payment.id,
      invoiceId: payment.invoiceId,
      linkId,
      gatewayPaymentRef: live.gatewayPaymentRef || linkId,
      paidAmount,
      userId,
    });

    if (result.alreadySettled) {
      return NextResponse.json({ settled: true, alreadySettled: true, message: "Already settled" });
    }

    fireEventAsync("payment.received", {
      paymentId: payment.id, receiptNumber: payment.receiptNumber,
      amount: paidAmount, provider: cfg.provider, paymentLink: true,
    });
    if (result.invoiceStatus === "PAID" && payment.invoiceId) {
      fireEventAsync("invoice.paid", {
        invoiceId: payment.invoiceId,
        invoiceNumber: payment.Invoice?.invoiceNumber,
        amount: paidAmount, paymentMode: "ONLINE", provider: cfg.provider,
      });
    }

    await auditLog(req, "UPDATE", "Payment", payment.id, {
      action: "payment-link-settle", linkId, gatewayRef: live.gatewayPaymentRef,
      amount: paidAmount, invoiceStatus: result.invoiceStatus, by: userId,
    });

    return NextResponse.json({
      settled: true,
      invoiceStatus: result.invoiceStatus,
      receiptNumber: payment.receiptNumber,
      message: `Payment received — ${inr(paidAmount)} settled. Receipt ${payment.receiptNumber} is VERIFIED${result.invoiceStatus === "PAID" ? ", invoice fully settled (PAID)" : result.invoiceStatus === "PARTIALLY_PAID" ? ", invoice partially paid" : ""}.`,
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("payment-link PUT error:", error);
    const msg = error instanceof Error ? error.message : "Failed to verify payment link";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
