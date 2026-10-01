import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requirePermission } from "@/lib/api-auth";

// POST /api/payments/[id]/refund — Create a refund for a VERIFIED payment
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requirePermission(req, "payments.update"); // [AUDIT-FIX F-20] refunds move money out — AGENT (payments.create only) must not
    const { id } = await params;
    const body = await req.json();

    const { amount, reason, mode, notes } = body as {
      amount: number;
      reason: string;
      mode?: string;
      notes?: string;
    };

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "Refund amount must be greater than 0" }, { status: 400 });
    }
    if (!reason || reason.trim().length === 0) {
      return NextResponse.json({ error: "Reason is required" }, { status: 400 });
    }

    // Fetch payment with subscriber
    const payment = await db.payment.findUnique({
      where: { id },
      include: {
        Subscriber: { select: { id: true, name: true, balance: true } },
        Invoice: { select: { id: true, invoiceNumber: true, paidAmount: true, balanceAmount: true, grandTotal: true, status: true, paidAt: true } },
      },
    });

    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    if (payment.status !== "VERIFIED") {
      return NextResponse.json(
        { error: "Refunds can only be created for VERIFIED payments" },
        { status: 400 }
      );
    }

    // Validate amount doesn't exceed payment amount
    if (amount > payment.amount) {
      return NextResponse.json(
        { error: `Refund amount cannot exceed payment amount (${payment.amount})` },
        { status: 400 }
      );
    }

    // [AUDIT F-10 tail] Entire money-moving chain runs in ONE transaction — a
    // crash between refund.create and subscriber balance increment previously
    // left books inconsistent (refund recorded but balance not credited, etc.).
    // Also: cumulative refund cap — sum(Refund.amount) for this payment can
    // never exceed payment.amount, even across partial refunds.
    const refundAmount = Math.round(amount * 100) / 100;

    const { refund, refundedTotal } = await db.$transaction(async (tx) => {
      const priorRefunds = await tx.refund.aggregate({
        where: { paymentId: id, status: { not: "CANCELLED" } },
        _sum: { amount: true },
      });
      const alreadyRefunded = priorRefunds._sum.amount || 0;
      const refundedTotal = Math.round((alreadyRefunded + refundAmount) * 100) / 100;

      if (refundedTotal > payment.amount + 0.001) {
        const remaining = Math.max(0, Math.round((payment.amount - alreadyRefunded) * 100) / 100);
        throw Object.assign(new Error(
          `Refund cap exceeded: ₹${alreadyRefunded} already refunded on this payment; at most ₹${remaining} can be refunded`
        ), { statusCode: 409 });
      }

      // Create the refund record
      const refund = await tx.refund.create({
        data: {
          paymentId: id,
          amount: refundAmount,
          reason: reason.trim(),
          mode: mode?.trim() || "Original",
          notes: notes?.trim() || "",
          status: "PROCESSED",
          processedById: userId,
        },
      });

      // Mark payment as refunded (full refund) — partial refunds keep VERIFIED
      // so the remaining balance stays refundable; transition matrix in
      // payments/[id]/route.ts treats REFUNDED as terminal either way.
      if (refundedTotal >= payment.amount - 0.001) {
        await tx.payment.update({
          where: { id },
          data: { status: "REFUNDED" },
        });
      }

      // Add refund amount to subscriber balance
      await tx.subscriber.update({
        where: { id: payment.subscriberId },
        data: {
          balance: {
            increment: refundAmount,
          },
        },
      });

      // If linked to an invoice, reverse the payment effect
      if (payment.invoiceId && payment.Invoice) {
        const invoice = payment.Invoice;
        const newPaidAmount = Math.max(0, invoice.paidAmount - refundAmount);
        const newBalanceAmount = invoice.grandTotal - newPaidAmount;

        let newStatus = invoice.status;
        if (newBalanceAmount > 0 && newPaidAmount > 0) {
          newStatus = "PARTIALLY_PAID";
        } else if (newPaidAmount <= 0) {
          newStatus = "SENT";
        }

        await tx.invoice.update({
          where: { id: payment.invoiceId },
          data: {
            paidAmount: newPaidAmount,
            balanceAmount: Math.max(0, newBalanceAmount),
            status: newStatus,
            paidAt: newStatus === "PAID" ? invoice.paidAt : null,
          },
        });
      }

      return { refund, refundedTotal };
    });

    return NextResponse.json({
      refund,
      refundedTotal,
      message: `Refund of ₹${refundAmount} processed. Added to subscriber balance.`,
    });
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      const authErr = error as { statusCode: number; message: string };
      return NextResponse.json({ error: authErr.message }, { status: authErr.statusCode });
    }
    console.error("Refund POST error:", error);
    return NextResponse.json({ error: "Failed to process refund" }, { status: 500 });
  }
}

// GET /api/payments/[id]/refund — List refunds for a payment
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(req); // [AUDIT-FIX F-07] refund history was readable unauthenticated
    const { id } = await params;

    const refunds = await db.refund.findMany({
      where: { paymentId: id },
      orderBy: { createdAt: "desc" },
      include: {
        User: { select: { name: true } },
      },
    });

    // [BUGFIX] include was `processedBy` — not a valid relation (Prisma relation is
    // `User`); the include itself made this endpoint 500. Map it back for API compat.
    return NextResponse.json({
      refunds: refunds.map((r) => ({
        ...r,
        processedBy: (r as Record<string, unknown> & { User?: { name: string } }).User,
      })),
    });
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      const authErr = error as { statusCode: number; message: string };
      return NextResponse.json({ error: authErr.message }, { status: authErr.statusCode });
    }
    console.error("Refund GET error:", error);
    return NextResponse.json({ error: "Failed to fetch refunds" }, { status: 500 });
  }
}
