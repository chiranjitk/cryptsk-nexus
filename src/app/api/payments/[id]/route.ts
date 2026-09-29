import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { auditStatusChange, auditUpdate, auditDelete } from "@/lib/services/audit-service";
import { requireAuth, requirePermission } from "@/lib/api-auth";

// GET /api/payments/[id] — single payment with ISP settings for receipt
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const payment = await db.payment.findUnique({
      where: { id },
      include: {
        Subscriber: { select: { id: true, name: true, code: true, phone: true, email: true } },
        Invoice: { select: { id: true, invoiceNumber: true, grandTotal: true, status: true } },
        User_Payment_collectedByIdToUser: { select: { id: true, name: true } },
        User_Payment_verifiedByIdToUser: { select: { id: true, name: true } },
      },
    });

    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    // Fetch ISP settings for receipt
    const ispSettings = await db.ispSettings.findUnique({
      where: { id: "default" },
      select: { companyName: true, address: true, city: true, state: true, pincode: true, phone: true, email: true, gstin: true, website: true, receiptFooterText: true },
    });

    return NextResponse.json({
      ...payment,
      ispSettings: ispSettings || { companyName: "My ISP" },
    });
  } catch (error) {
    console.error("Payment GET error:", error);
    return NextResponse.json({ error: "Failed to fetch payment" }, { status: 500 });
  }
}

// PUT /api/payments/[id] — verify/reject payment OR edit PENDING payment
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth(req);
    const { id } = await params;
    const body = await req.json();

    const payment = await db.payment.findUnique({
      where: { id },
      include: {
        Subscriber: { select: { id: true, name: true, code: true } },
        Invoice: { select: { id: true, invoiceNumber: true } },
      },
    });
    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    const newStatus = body.status;

    // ── Status Change (verify/reject/refund) ──
    if (newStatus) {
      if (!["VERIFIED", "FAILED", "REFUNDED"].includes(newStatus)) {
        return NextResponse.json({ error: "Invalid status. Must be VERIFIED, FAILED, or REFUNDED" }, { status: 400 });
      }

      const updated = await db.payment.update({
        where: { id },
        data: {
          status: newStatus,
          verifiedById: newStatus === "VERIFIED" ? userId : undefined,
        },
        include: {
          Subscriber: { select: { id: true, name: true, code: true } },
          Invoice: { select: { id: true, invoiceNumber: true } },
        },
      });

      // If verified and linked to an invoice, update invoice paid amount
      if (newStatus === "VERIFIED" && payment.invoiceId) {
        const invoice = await db.invoice.findUnique({ where: { id: payment.invoiceId } });
        if (invoice) {
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
        }
      }

      await auditStatusChange(req, "Payment", id, payment.status, newStatus, { amount: payment.amount, userId });
      return NextResponse.json(updated);
    }

    // ── Edit PENDING payment fields (amount, mode, notes, transactionRef) ──
    if (payment.status !== "PENDING") {
      return NextResponse.json({ error: "Only PENDING payments can be edited" }, { status: 400 });
    }

    const previousValues = { amount: payment.amount, paymentMode: payment.paymentMode, notes: payment.notes, transactionRef: payment.transactionRef };

    const updateData: Record<string, unknown> = {};
    if (body.amount !== undefined && typeof body.amount === "number" && body.amount > 0) {
      updateData.amount = body.amount;
    }
    if (body.paymentMode !== undefined && ["CASH", "UPI", "ONLINE", "BANK_TRANSFER", "CHEQUE", "WALLET"].includes(body.paymentMode)) {
      updateData.paymentMode = body.paymentMode;
    }
    if (body.notes !== undefined) {
      updateData.notes = String(body.notes);
    }
    if (body.transactionRef !== undefined) {
      updateData.transactionRef = String(body.transactionRef);
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const updated = await db.payment.update({
      where: { id },
      data: updateData,
      include: {
        Subscriber: { select: { id: true, name: true, code: true } },
        Invoice: { select: { id: true, invoiceNumber: true } },
      },
    });

    await auditUpdate(req, "Payment", id, updateData as Record<string, unknown>, previousValues, { userId });
    return NextResponse.json(updated);
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      const authErr = error as { statusCode: number; message: string };
      return NextResponse.json({ error: authErr.message }, { status: authErr.statusCode });
    }
    console.error("Payment PUT error:", error);
    return NextResponse.json({ error: "Failed to update payment" }, { status: 500 });
  }
}

// DELETE /api/payments/[id] — delete PENDING payments only
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth(req);
    const { id } = await params;

    const payment = await db.payment.findUnique({
      where: { id },
      include: {
        Subscriber: { select: { id: true, name: true, code: true } },
        Invoice: { select: { id: true, invoiceNumber: true } },
      },
    });

    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    if (payment.status !== "PENDING") {
      return NextResponse.json({ error: "Only PENDING payments can be deleted" }, { status: 400 });
    }

    // Store details for audit before deleting
    const deletedRecord = {
      receiptNumber: payment.receiptNumber,
      amount: payment.amount,
      paymentMode: payment.paymentMode,
      subscriberName: payment.Subscriber?.name,
      subscriberCode: payment.Subscriber?.code,
    };

    await db.payment.delete({ where: { id } });

    await auditDelete(req, "Payment", id, deletedRecord, { userId });
    return NextResponse.json({ success: true, message: "Payment deleted successfully" });
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      const authErr = error as { statusCode: number; message: string };
      return NextResponse.json({ error: authErr.message }, { status: authErr.statusCode });
    }
    console.error("Payment DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete payment" }, { status: 500 });
  }
}
