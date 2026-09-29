import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";

// POST /api/payments/[id]/refund — Create a refund for a VERIFIED payment
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth(req);
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

    // Create the refund record
    const refund = await db.refund.create({
      data: {
        paymentId: id,
        amount: Math.round(amount * 100) / 100,
        reason: reason.trim(),
        mode: mode?.trim() || "Original",
        notes: notes?.trim() || "",
        status: "PROCESSED",
        processedById: userId,
      },
    });

    // Mark payment as refunded
    await db.payment.update({
      where: { id },
      data: { status: "REFUNDED" },
    });

    // Add refund amount to subscriber balance
    await db.subscriber.update({
      where: { id: payment.subscriberId },
      data: {
        balance: {
          increment: amount,
        },
      },
    });

    // If linked to an invoice, reverse the payment effect
    if (payment.invoiceId && payment.Invoice) {
      const invoice = payment.Invoice;
      const newPaidAmount = Math.max(0, invoice.paidAmount - amount);
      const newBalanceAmount = invoice.grandTotal - newPaidAmount;

      let newStatus = invoice.status;
      if (newBalanceAmount > 0 && newPaidAmount > 0) {
        newStatus = "PARTIALLY_PAID";
      } else if (newPaidAmount <= 0) {
        newStatus = "SENT";
      }

      await db.invoice.update({
        where: { id: payment.invoiceId },
        data: {
          paidAmount: newPaidAmount,
          balanceAmount: Math.max(0, newBalanceAmount),
          status: newStatus,
          paidAt: newStatus === "PAID" ? invoice.paidAt : null,
        },
      });
    }

    return NextResponse.json({
      refund,
      message: `Refund of ${amount} processed. Added to subscriber balance.`,
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
    const { id } = await params;

    const refunds = await db.refund.findMany({
      where: { paymentId: id },
      orderBy: { createdAt: "desc" },
      include: {
        processedBy: { select: { name: true } },
      },
    });

    return NextResponse.json({ refunds });
  } catch (error) {
    console.error("Refund GET error:", error);
    return NextResponse.json({ error: "Failed to fetch refunds" }, { status: 500 });
  }
}
