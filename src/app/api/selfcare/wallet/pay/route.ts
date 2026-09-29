import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { requireSelfcareAccess } from "@/lib/portal-auth";
import { authOptions } from "@/lib/auth";
import { auditCreateEntity } from "@/lib/audit";
import { isRedirectError } from "../../common";

// ============================================================
// CRYPTSK Nexus — POST /api/selfcare/wallet/pay
// Self-Care "Billing" tab (spec §18): the customer pays an invoice
// IN FULL from their prepaid wallet balance.
// AUTH: requireSelfcareAccess + customer mode ONLY — staff get 403
// (staff record payments in the billing console /api/payments).
// MONEY FLOW (single interactive transaction, retried on
// paymentNumber P2002 races — same pattern as TKT-2026 in
// /api/selfcare/support):
//   invoice ownership check (foreign/unknown → 404, no tenant leak)
//   → payable-status + balanceDue guards
//   → wallet debit (pay-in-full only, exact balanceDue)
//   → WalletTransaction(payment, negative amount)
//   → Payment(PAY-2026-##### , method "wallet", completed)
//   → invoice marked paid (paidAmount += amount, balanceDue 0).
// Audit userId stays NULL — audit_events.user_id FKs to the staff
// users table; the portal identity lives in Payment.createdBy and
// WalletTransaction.createdBy ("portal:<id>").
// ============================================================

export const dynamic = "force-dynamic";

// Only these invoice statuses accept payment (draft isn't billed yet,
// cancelled/void are dead, paid is already settled)
const PAYABLE_STATUSES = ["issued", "sent", "partial", "overdue"];

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSelfcareAccess({});

    // Staff preview stays read-only — payments are recorded from the
    // admin billing console (/api/payments).
    if (ctx.mode !== "customer") {
      return NextResponse.json(
        { error: "Staff accounts record payments in the billing console" },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const invoiceId = typeof body.invoiceId === "string" ? body.invoiceId.trim() : "";
    if (!invoiceId) {
      return NextResponse.json({ error: "Invoice ID is required" }, { status: 400 });
    }

    // Session identity for the money trail — requireSelfcareAccess has
    // already proven this is a live customer login (status re-checked).
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;
    const portalUserId = String(sessionUser?.id ?? "");

    const paidAt = new Date();

    // Whole money flow in one transaction; payment numbers share the
    // billing console's scheme (PAY-2026-#####), so a concurrent staff
    // payment can win the unique race — recompute the count and retry
    // (max 3 attempts, same pattern as portal ticket numbers).
    const payFromWallet = async () => {
      return db.$transaction(async (tx) => {
        const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });

        // Unknown OR another customer's invoice → same 404 (no tenant leak)
        if (!invoice || invoice.customerId !== ctx.customerId) {
          throw new Response(JSON.stringify({ error: "Invoice not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (!PAYABLE_STATUSES.includes(invoice.status) || invoice.balanceDue <= 0) {
          throw new Response(JSON.stringify({ error: "This invoice cannot be paid" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Pay-in-full only — the exact outstanding balance
        const amount = invoice.balanceDue;

        const wallet = await tx.wallet.findUnique({
          where: { customerId: ctx.customerId },
        });
        if (!wallet || wallet.balance < amount) {
          throw new Response(JSON.stringify({ error: "Insufficient wallet balance" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const newBalance = wallet.balance - amount;
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: newBalance },
        });

        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            amount: -amount, // negative = debit
            type: "payment",
            description: `Payment for ${invoice.invoiceNumber}`,
            balanceAfter: newBalance,
            invoiceId: invoice.id,
            createdBy: `portal:${portalUserId}`,
          },
        });

        const count = await tx.payment.count();
        const paymentNumber = `PAY-2026-${String(count + 1).padStart(5, "0")}`;

        const payment = await tx.payment.create({
          data: {
            paymentNumber,
            invoiceId: invoice.id,
            customerId: ctx.customerId,
            amount,
            currency: "INR",
            method: "wallet",
            status: "completed",
            paidAt,
            notes: "Paid from wallet in Self-Care portal",
            createdBy: `portal:${portalUserId}`,
            receivedBy: null, // no staff receiver — self-service payment
          },
          select: {
            id: true,
            paymentNumber: true,
            amount: true,
            method: true,
            status: true,
            paidAt: true,
          },
        });

        const updatedInvoice = await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            paidAmount: invoice.paidAmount + amount,
            balanceDue: 0,
            paymentStatus: "paid",
            status: "paid",
          },
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            paidAmount: true,
            balanceDue: true,
            paymentStatus: true,
          },
        });

        return { payment, invoice: updatedInvoice, balance: newBalance };
      });
    };

    let result: Awaited<ReturnType<typeof payFromWallet>> | null = null;
    for (let attempt = 0; attempt < 3 && !result; attempt++) {
      try {
        result = await payFromWallet();
      } catch (e: any) {
        if (e?.code !== "P2002") throw e; // unique-race only — recompute + retry
      }
    }
    if (!result) {
      throw new Error("paymentNumber collision persisted after 3 attempts");
    }

    // Audit never blocks the response (rbac.ts convention); userId MUST be
    // null — audit_events.user_id is a staff users FK (portal ids would fail).
    try {
      await auditCreateEntity({
        userId: null,
        resource: "payment",
        resourceId: result.payment.id,
        resourceName: result.payment.paymentNumber,
        after: {
          amount: result.payment.amount,
          method: "wallet",
          invoiceNumber: result.invoice.invoiceNumber,
          source: "selfcare_wallet",
        },
        ipAddress: req.headers.get("x-forwarded-for") || "unknown",
      });
    } catch (auditErr) {
      console.error("[/api/selfcare/wallet/pay] failed to audit payment:", auditErr);
    }

    return NextResponse.json({
      payment: result.payment,
      invoice: result.invoice,
      wallet: { balance: result.balance },
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/selfcare/wallet/pay] POST failed:", err);
    return NextResponse.json({ error: "Failed to pay from wallet" }, { status: 500 });
  }
}
