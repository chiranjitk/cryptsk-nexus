import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/services/audit-service";

// POST /api/collection/refund
// [PAYMENTS-NOLEAK] This route used to create a PENDING Refund row and then
// IMMEDIATELY mark the payment REFUNDED — without reversing the invoice, never
// crediting the subscriber balance, and with no cumulative refund cap. Three
// independent ways to lose track of refunded money in one endpoint.
//
// It now enforces the exact same guarded money-movement as the canonical
// /api/payments/[id]/refund: cumulative cap, invoice reversal, balance credit,
// single atomic transaction.

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req);
    const body = await req.json();
    const { paymentId, amount, reason, mode, notes } = body;
    if (!paymentId || !amount || Number(amount) <= 0) {
      return NextResponse.json({ error: "Payment ID and a positive amount are required" }, { status: 400 });
    }

    const refundAmount = Math.round(Number(amount) * 100) / 100;

    const payment = await db.payment.findUnique({
      where: { id: paymentId },
      include: {
        Invoice: { select: { id: true, paidAmount: true, balanceAmount: true, grandTotal: true, status: true, paidAt: true } },
      },
    });
    if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    if (payment.status !== "VERIFIED") {
      return NextResponse.json({ error: "Refunds can only be created for VERIFIED payments" }, { status: 400 });
    }

    const { refund, refundedTotal } = await db.$transaction(async (tx) => {
      const priorRefunds = await tx.refund.aggregate({
        where: { paymentId, status: { not: "CANCELLED" } },
        _sum: { amount: true },
      });
      const alreadyRefunded = priorRefunds._sum.amount || 0;
      const total = Math.round((alreadyRefunded + refundAmount) * 100) / 100;
      if (total > payment.amount + 0.001) {
        throw Object.assign(new Error(
          `Refund cap exceeded: ₹${alreadyRefunded} already refunded; at most ₹${Math.max(0, Math.round((payment.amount - alreadyRefunded) * 100) / 100)} refundable`
        ), { statusCode: 409 });
      }

      const refund = await tx.refund.create({
        data: {
          paymentId,
          amount: refundAmount,
          reason: reason || "",
          mode: mode || "Original",
          notes: notes || "",
          status: "PROCESSED",
          processedById: userId,
        },
      });

      if (total >= payment.amount - 0.001) {
        await tx.payment.update({ where: { id: paymentId }, data: { status: "REFUNDED" } });
      }

      // Credit subscriber wallet (same policy as the canonical refund path)
      await tx.subscriber.update({
        where: { id: payment.subscriberId },
        data: { balance: { increment: refundAmount } },
      });

      // Reverse the invoice effect
      if (payment.invoiceId && payment.Invoice) {
        const invoice = payment.Invoice;
        const newPaid = Math.max(0, invoice.paidAmount - refundAmount);
        const newBalance = invoice.grandTotal - newPaid;
        let newStatus = invoice.status;
        if (newBalance > 0 && newPaid > 0) newStatus = "PARTIALLY_PAID";
        else if (newPaid <= 0) newStatus = "SENT";
        await tx.invoice.update({
          where: { id: payment.invoiceId },
          data: {
            paidAmount: newPaid,
            balanceAmount: Math.max(0, newBalance),
            status: newStatus,
            paidAt: newStatus === "PAID" ? invoice.paidAt : null,
          },
        });
      }

      return { refund, refundedTotal: total };
    });

    await auditLog(req, "CREATE", "Refund", refund.id, {
      paymentId, amount: refundAmount, refundedTotal, source: "collection", by: userId,
    });

    return NextResponse.json({
      refund,
      refundedTotal,
      message: `Refund of ₹${refundAmount} processed — invoice reversed and subscriber balance credited.`,
    });
  } catch (error: unknown) {
    const statusCode = (error as { statusCode?: number })?.statusCode;
    if (statusCode === 409) {
      return NextResponse.json({ error: (error as Error).message }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
