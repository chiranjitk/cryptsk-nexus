import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, permissionFor, AuthError } from "@/lib/api-auth";
import { sendEmail } from "@/lib/services/email-service";
import { sendSMS } from "@/lib/services/sms-service";
import { sendTest, resolveConfig, type FlatCfg } from "@/lib/integrations/adapters";
import { auditLog } from "@/lib/services/audit-service";

// ─────────────────────────────────────────────────────────────────────────────
// [PAYMENTS-NOLEAK] POST /api/payments/receipt-send
//
// Sends a payment receipt to the subscriber over EMAIL / SMS / WHATSAPP using
// the production channel gateways:
//   EMAIL    → email-service (SMTP from IntegrationConfig or IspSettings)
//   SMS      → sms-service (msg91 / twilio)
//   WHATSAPP → integrations adapters (twilio-whatsapp / gupshup), reusing the
//              real generic send path built for the INTEGRATIONS module.
//
// Every attempted channel is recorded as a Notification row so the audit trail
// shows what was told to the customer, not just what was booked in the ledger.
//
// Request:  { paymentId, channels: ["EMAIL","SMS","WHATSAPP"], email?, phone? }
// Response: { results: [{channel, success, detail}], message }
// ─────────────────────────────────────────────────────────────────────────────

const CHANNEL_LABEL: Record<string, string> = {
  CASH: "Cash", UPI: "UPI", ONLINE: "Online", BANK_TRANSFER: "Bank Transfer",
  CHEQUE: "Cheque", WALLET: "Wallet",
};

function inr(n: number): string {
  return `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}
function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req);
    await permissionFor(userId, "payments.create");

    const body = await req.json();
    const { paymentId } = body;
    const channels: string[] = Array.isArray(body.channels) && body.channels.length
      ? body.channels
      : ["EMAIL", "SMS"];
    const overrideEmail: string | undefined = typeof body.email === "string" && body.email.includes("@") ? body.email.trim() : undefined;
    const overridePhone: string | undefined = typeof body.phone === "string" && body.phone.replace(/\D/g, "").length >= 10 ? body.phone.trim() : undefined;

    if (!paymentId) {
      return NextResponse.json({ error: "paymentId is required" }, { status: 400 });
    }

    const payment = await db.payment.findUnique({
      where: { id: paymentId },
      include: {
        Subscriber: { select: { id: true, name: true, code: true, email: true, phone: true } },
        Invoice: { select: { id: true, invoiceNumber: true, grandTotal: true, paidAmount: true, balanceAmount: true, status: true } },
      },
    });
    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    const settings = await db.ispSettings.findUnique({ where: { id: "default" } });
    const company = settings?.companyName || "ISP";

    const receiptNo = payment.receiptNumber || payment.id.slice(0, 8).toUpperCase();
    const invoice = payment.Invoice;
    const balance = invoice ? Math.max(0, invoice.balanceAmount) : null;

    const textMessage = [
      `Receipt ${receiptNo}`,
      `${inr(payment.amount)} received from ${payment.Subscriber?.name || "customer"} via ${CHANNEL_LABEL[payment.paymentMode] || payment.paymentMode}.`,
      invoice ? `Invoice ${invoice.invoiceNumber}: paid ${inr(invoice.paidAmount)} of ${inr(invoice.grandTotal)}${balance !== null && balance > 0.01 ? `, balance ${inr(balance)}` : " (fully settled)"}.` : "",
      `Date: ${fmtDate(payment.createdAt)}.`,
      `Thank you — ${company}.`,
    ].filter(Boolean).join("\n");

    const htmlMessage = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
        <div style="background:#0f766e;color:#fff;padding:16px 20px">
          <div style="font-size:18px;font-weight:700">${company}</div>
          <div style="font-size:12px;opacity:.85">Payment Receipt</div>
        </div>
        <div style="padding:20px;color:#0f172a;font-size:14px;line-height:1.7">
          <div style="font-size:22px;font-weight:800;color:#0f766e;margin-bottom:8px">${inr(payment.amount)}</div>
          <div><b>Receipt</b> ${receiptNo}</div>
          <div><b>Customer</b> ${payment.Subscriber?.name || "-"} (${payment.Subscriber?.code || "-"})</div>
          <div><b>Mode</b> ${CHANNEL_LABEL[payment.paymentMode] || payment.paymentMode}</div>
          ${payment.transactionRef ? `<div><b>Reference</b> ${payment.transactionRef}</div>` : ""}
          ${invoice ? `<div><b>Invoice</b> ${invoice.invoiceNumber} — paid ${inr(invoice.paidAmount)} of ${inr(invoice.grandTotal)}${balance !== null && balance > 0.01 ? `, balance due ${inr(balance)}` : ", fully settled"}</div>` : ""}
          <div><b>Date</b> ${fmtDate(payment.createdAt)}</div>
          ${payment.notes ? `<div style="margin-top:8px;color:#475569">${payment.notes}</div>` : ""}
        </div>
        <div style="background:#f8fafc;padding:12px 20px;color:#64748b;font-size:12px;border-top:1px solid #e2e8f0">
          ${settings?.receiptFooterText || "This is a computer-generated receipt."}
        </div>
      </div>`;

    const results: Array<{ channel: string; success: boolean; detail: string }> = [];

    // ── EMAIL ──
    if (channels.includes("EMAIL")) {
      const to = overrideEmail || payment.Subscriber?.email || "";
      if (!to) {
        results.push({ channel: "EMAIL", success: false, detail: "Subscriber has no email address on file — provide one in the dialog" });
      } else {
        const res = await sendEmail({
          to,
          subject: `Payment receipt ${receiptNo} — ${company}`,
          html: htmlMessage,
          text: textMessage,
        });
        results.push({ channel: "EMAIL", success: res.success, detail: res.success ? `Sent to ${to}${res.messageId ? ` (id ${res.messageId})` : ""}` : res.error || "Send failed" });
        await db.notification.create({
          data: {
            subscriberId: payment.subscriberId,
            userId,
            type: "EMAIL",
            category: "PAYMENT_CONFIRM",
            title: `Payment receipt ${receiptNo}`,
            message: textMessage,
            status: res.success ? "SENT" : "FAILED",
            sentAt: res.success ? new Date() : null,
          },
        }).catch(() => { /* notification log is best-effort */ });
      }
    }

    // ── SMS ──
    if (channels.includes("SMS")) {
      const to = overridePhone || payment.Subscriber?.phone || "";
      if (!to) {
        results.push({ channel: "SMS", success: false, detail: "Subscriber has no phone number on file — provide one in the dialog" });
      } else {
        const res = await sendSMS(to, textMessage.slice(0, 480));
        results.push({ channel: "SMS", success: res.success, detail: res.success ? `Sent to ${to} via ${res.provider}` : res.error || "Send failed" });
        await db.notification.create({
          data: {
            subscriberId: payment.subscriberId,
            userId,
            type: "SMS",
            category: "PAYMENT_CONFIRM",
            title: `Payment receipt ${receiptNo}`,
            message: textMessage,
            status: res.success ? "SENT" : "FAILED",
            sentAt: res.success ? new Date() : null,
          },
        }).catch(() => { /* best-effort */ });
      }
    }

    // ── WHATSAPP (via INTEGRATIONS adapters — real send path) ──
    if (channels.includes("WHATSAPP")) {
      const to = overridePhone || payment.Subscriber?.phone || "";
      if (!to) {
        results.push({ channel: "WHATSAPP", success: false, detail: "Subscriber has no phone number on file — provide one in the dialog" });
      } else {
        const waConfig = await db.integrationConfig.findFirst({
          where: { type: "communication", provider: { in: ["twilio-whatsapp", "gupshup", "wati", "meta-whatsapp"] }, enabled: true },
          orderBy: { updatedAt: "desc" },
        });
        if (!waConfig) {
          results.push({ channel: "WHATSAPP", success: false, detail: "No WhatsApp gateway configured — set one up in INTEGRATIONS" });
        } else {
          let cfg: FlatCfg = {
            apiKey: waConfig.apiKey || "",
            apiSecret: waConfig.apiSecret || "",
            merchantId: waConfig.merchantId || "",
          };
          try { Object.assign(cfg, JSON.parse(waConfig.config || "{}")); } catch { /* ignore */ }
          cfg = resolveConfig(waConfig.provider, cfg);
          const res = await sendTest(waConfig.provider, cfg, { to, message: textMessage.slice(0, 900) });
          results.push({
            channel: "WHATSAPP",
            success: res.ok,
            detail: res.ok ? `Sent to ${to} via ${waConfig.provider}${res.latencyMs ? ` (${res.latencyMs}ms)` : ""}` : res.message,
          });
          await db.notification.create({
            data: {
              subscriberId: payment.subscriberId,
              userId,
              type: "WHATSAPP",
              category: "PAYMENT_CONFIRM",
              title: `Payment receipt ${receiptNo}`,
              message: textMessage,
              status: res.ok ? "SENT" : "FAILED",
              sentAt: res.ok ? new Date() : null,
            },
          }).catch(() => { /* best-effort */ });
        }
      }
    }

    const okCount = results.filter((r) => r.success).length;
    await auditLog(req, "CREATE", "Notification", paymentId, {
      action: "receipt-send", receipt: receiptNo, channels, okCount, by: userId,
    });

    return NextResponse.json({
      message: okCount === results.length
        ? `Receipt sent via ${okCount} channel(s)`
        : `Sent on ${okCount}/${results.length} channel(s) — see per-channel results`,
      results,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Receipt-send POST error:", error);
    return NextResponse.json({ error: "Failed to send receipt" }, { status: 500 });
  }
}
