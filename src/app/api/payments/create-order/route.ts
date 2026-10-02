import { NextRequest, NextResponse } from "next/server";
import { createPaymentOrder, verifyPayment } from "@/lib/services/payment-service";
import { db } from "@/lib/db";
import { fireEventAsync } from "@/lib/services/webhook-service";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { newReceiptNumber } from "@/lib/services/receipt";

// POST /api/payments/create-order — create a payment order via configured gateway
export async function POST(req: NextRequest) {
  try {
    try {
      await requireAuth(req as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
      throw error; // [SECURITY-FIX] non-auth errors must not bypass authentication
    }
    const body = await req.json();
    const { subscriberId, amount, currency, invoiceId } = body;

    if (!subscriberId || !amount || amount <= 0) {
      return NextResponse.json({ error: "Subscriber ID and valid amount are required" }, { status: 400 });
    }

    const subscriber = await db.subscriber.findUnique({
      where: { id: subscriberId },
      select: { id: true, name: true, code: true, email: true, phone: true },
    });

    if (!subscriber) {
      return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
    }

    // Create payment record
    // [PAYMENTS-NOLEAK] Receipt was `RCT<count+1>` (collision-prone) — unified allocator.
    const receiptNumber = newReceiptNumber();

    const payment = await db.payment.create({
      data: {
        subscriberId,
        invoiceId: invoiceId || null,
        amount,
        paymentMode: "ONLINE",
        transactionRef: "",
        receiptNumber,
        status: "PENDING",
      },
    });

    // Create order with payment gateway
    const result = await createPaymentOrder({
      amount,
      currency: currency || "INR",
      receipt: receiptNumber,
      subscriberId: subscriber.id,
      subscriberName: subscriber.name,
      invoiceId: invoiceId || "",
    });

    if (!result.success) {
      // If order creation fails, update payment status
      await db.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED", notes: result.error },
      });
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Update payment with gateway order ID
    await db.payment.update({
      where: { id: payment.id },
      data: { transactionRef: result.orderId },
    });

    // [PAYMENTS-NOLEAK] Order creation is now the FIRST ingest point — the
    // IntegrationTransaction ledger is written in real time (was never written
    // anywhere, making reconciliation impossible).
    await db.integrationTransaction.create({
      data: {
        gatewayType: result.provider,
        transactionType: "order",
        amount,
        status: "created",
        externalRef: result.orderId,
        paymentId: payment.id,
      },
    }).catch(() => { /* ledger write must not block checkout */ });

    // Fire webhook event
    fireEventAsync("payment.initiated", {
      paymentId: payment.id,
      receiptNumber,
      amount,
      currency: result.currency,
      gatewayOrderId: result.orderId,
      provider: result.provider,
      Subscriber: { id: subscriber.id, name: subscriber.name, code: subscriber.code },
    });

    return NextResponse.json({
      success: true,
      payment: {
        id: payment.id,
        receiptNumber,
        amount,
      },
      order: {
        id: result.orderId,
        amount: result.amount,
        currency: result.currency,
        provider: result.provider,
      },
    });
  } catch (error) {
    console.error("Payment order creation error:", error);
    return NextResponse.json({ error: "Failed to create payment order" }, { status: 500 });
  }
}

// POST /api/payments/verify — verify a payment from gateway callback
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { provider, orderId, paymentId, signature } = body;

    if (!provider || !orderId || !paymentId) {
      return NextResponse.json({ error: "Provider, orderId, and paymentId are required" }, { status: 400 });
    }

    // Find payment by transaction ref (gateway order ID)
    const payment = await db.payment.findFirst({
      where: { transactionRef: orderId, status: "PENDING" },
      include: {
        Subscriber: { select: { id: true, name: true, code: true } },
        Invoice: true,
      },
    });

    if (!payment) {
      return NextResponse.json({ error: "Payment not found or already processed" }, { status: 404 });
    }

    // Verify with gateway
    const result = await verifyPayment({
      provider,
      orderId,
      paymentId,
      signature,
    });

    if (!result.success || !result.verified) {
      await db.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED", notes: result.error || "Verification failed" },
      });
      return NextResponse.json({ error: result.error || "Payment verification failed" }, { status: 400 });
    }

    // Mark as verified and update invoice
    await db.payment.update({
      where: { id: payment.id },
      data: {
        status: "VERIFIED",
        transactionRef: `${orderId}|${paymentId}`,
      },
    });

    // [PAYMENTS-NOLEAK] Real-time capture ingest: upsert the gateway payment
    // transaction and link it to the local payment (reconciliation ledger).
    const capturedTxn = await db.integrationTransaction.findFirst({
      where: { OR: [{ externalRef: paymentId }, { externalRef: orderId }] },
    });
    if (capturedTxn) {
      await db.integrationTransaction.update({
        where: { id: capturedTxn.id },
        data: { status: "captured", externalRef: paymentId, paymentId: payment.id, transactionType: "payment" },
      });
    } else {
      await db.integrationTransaction.create({
        data: {
          gatewayType: provider,
          transactionType: "payment",
          amount: payment.amount,
          status: "captured",
          externalRef: paymentId,
          paymentId: payment.id,
        },
      }).catch(() => { /* ledger write must not block verification */ });
    }

    // Update linked invoice balance
    if (payment.invoiceId && payment.Invoice) {
      const invoice = payment.Invoice;
      const newPaidAmount = invoice.paidAmount + payment.amount;
      const newBalanceAmount = invoice.grandTotal - newPaidAmount;
      const newInvoiceStatus = newBalanceAmount <= 0 ? "PAID" : "PARTIALLY_PAID";

      await db.invoice.update({
        where: { id: payment.invoiceId },
        data: {
          paidAmount: newPaidAmount,
          balanceAmount: Math.max(0, newBalanceAmount),
          status: newInvoiceStatus,
          paidAt: newInvoiceStatus === "PAID" ? new Date() : invoice.paidAt,
        },
      });

      // Fire webhook
      fireEventAsync("invoice.paid", {
        invoiceId: payment.invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        amount: payment.amount,
        subscriber: payment.Subscriber,
        paymentMode: "ONLINE",
        provider,
      });
    }

    // Fire payment.received webhook
    fireEventAsync("payment.received", {
      paymentId: payment.id,
      receiptNumber: payment.receiptNumber,
      amount: payment.amount,
      provider,
      subscriber: payment.Subscriber,
    });

    return NextResponse.json({
      success: true,
      verified: true,
      paymentId: payment.id,
      receiptNumber: payment.receiptNumber,
    });
  } catch (error) {
    console.error("Payment verification error:", error);
    return NextResponse.json({ error: "Payment verification failed" }, { status: 500 });
  }
}
