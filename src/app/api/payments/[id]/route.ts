import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { auditStatusChange, auditUpdate, auditDelete } from "@/lib/services/audit-service";
import { requireAuth, requirePermission, permissionFor, AuthError } from "@/lib/api-auth";

// GET /api/payments/[id] — single payment with ISP settings for receipt
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(req); // [AUDIT-FIX F-07] this endpoint leaked payment + subscriber PII unauthenticated
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

    // Prisma relation keys are capitalized but the client contract is lowercase —
    // remap and drop the capitalized keys (mirrors the list route in api/payments/route.ts).
    const { Subscriber, Invoice, User_Payment_collectedByIdToUser, User_Payment_verifiedByIdToUser, ...rest } = payment;

    return NextResponse.json({
      ...rest,
      subscriber: Subscriber ?? null,
      invoice: Invoice ?? null,
      collectedBy: User_Payment_collectedByIdToUser ?? null,
      verifiedBy: User_Payment_verifiedByIdToUser ?? null,
      ispSettings: ispSettings || { companyName: "My ISP" },
    });
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      const authErr = error as { statusCode: number; message: string };
      return NextResponse.json({ error: authErr.message }, { status: authErr.statusCode });
    }
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
      // [AUDIT-FIX F-20] Verification (money approval) needs payments.verify;
      // reject/refund transitions need payments.update. AGENT/VIEWER have neither.
      await permissionFor(userId, newStatus === "VERIFIED" ? "payments.verify" : "payments.update");

      // [AUDIT-FIX F-01/F-03] Enforce a legal status-transition matrix:
      //  - PENDING → VERIFIED | FAILED        (normal verify/reject)
      //  - FAILED  → VERIFIED | PENDING       (recover a failed entry)
      //  - VERIFIED → REFUNDED                (only via the refund endpoint, kept here for admin correction)
      //  - REFUNDED is TERMINAL — flipping back to VERIFIED re-enabled the over-refund exploit
      //  - VERIFIED → VERIFIED is a no-op request, reject explicitly so invoice math can never double-count
      const legalTransitions: Record<string, string[]> = {
        PENDING: ["VERIFIED", "FAILED", "REFUNDED"],
        FAILED: ["PENDING", "VERIFIED"],
        VERIFIED: ["REFUNDED"],
        REFUNDED: [], // terminal
      };
      if (payment.status === newStatus) {
        return NextResponse.json(
          { error: `Payment is already ${newStatus}. No transition performed.` },
          { status: 409 }
        );
      }
      if (!legalTransitions[payment.status]?.includes(newStatus)) {
        return NextResponse.json(
          { error: `Illegal status transition ${payment.status} → ${newStatus}. REFUNDED payments are terminal.` },
          { status: 409 }
        );
      }

      // [AUDIT-FIX F-10] Wrap payment + invoice updates in a single transaction so a
      // crash between the two writes can never leave books inconsistent.
      const updated = await db.$transaction(async (tx) => {
        const updatedPayment = await tx.payment.update({
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

        // If verified and linked to an invoice, update invoice paid amount —
        // guarded by the transition matrix above, so this arithmetic runs exactly once.
        if (newStatus === "VERIFIED" && payment.invoiceId) {
          const invoice = await tx.invoice.findUnique({ where: { id: payment.invoiceId } });
          if (invoice) {
            const newPaidAmount = invoice.paidAmount + payment.amount;
            const newBalanceAmount = invoice.grandTotal - newPaidAmount;
            const newInvoiceStatus = newBalanceAmount <= 0 ? "PAID" : "PARTIALLY_PAID";

            await tx.invoice.update({
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

        return updatedPayment;
      });

      await auditStatusChange(req, "Payment", id, payment.status, newStatus, { amount: payment.amount, userId });
      return NextResponse.json(updated);
    }

    // ── Edit PENDING payment fields (amount, mode, notes, transactionRef) ──
    if (payment.status !== "PENDING") {
      return NextResponse.json({ error: "Only PENDING payments can be edited" }, { status: 400 });
    }

    // [AUDIT-FIX F-20] Editing recorded money requires payments.update
    await permissionFor(userId, "payments.update");

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
    const userId = await requirePermission(req, "payments.delete"); // [AUDIT-FIX F-20]
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
