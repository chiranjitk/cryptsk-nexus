import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { auditUpdate, auditDelete } from "@/lib/services/audit-service";
import { requireAuth, requirePermission, permissionFor } from "@/lib/api-auth";
import { newReceiptNumber, AUTO_VERIFIED_MARKER } from "@/lib/services/receipt";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(req); // [AUDIT-FIX F-07] invoice financials (GSTIN/PAN) were readable unauthenticated
    const { id } = await params;

    const invoice = await db.invoice.findUnique({
      where: { id },
      include: {
        Subscriber: {
          select: {
            id: true, name: true, code: true, email: true, phone: true,
            address: true, Area: { select: { name: true } },
            gstin: true, panNumber: true,
          },
        },
        Plan: {
          select: {
            id: true, name: true, downloadSpeed: true, uploadSpeed: true,
            speedUnit: true, validityDays: true, priceMonthly: true,
          },
        },
        InvoiceLineItem: { orderBy: { sortOrder: "asc" } },
        Payment: {
          orderBy: { createdAt: "desc" },
          include: {
            User_Payment_collectedByIdToUser: { select: { name: true } },
            User_Payment_verifiedByIdToUser: { select: { name: true } },
          },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    return NextResponse.json({ invoice });
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      const authErr = error as { statusCode: number; message: string };
      return NextResponse.json({ error: authErr.message }, { status: authErr.statusCode });
    }
    console.error("Invoice GET [id] error:", error);
    return NextResponse.json({ error: "Failed to fetch invoice" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireAuth(req);
    // [AUDIT-FIX F-20] Invoice edits (status/discount/ledger-affecting) need invoices.update
    await permissionFor(userId, "invoices.update");
    const { id } = await params;
    const body = await req.json();

    const invoice = await db.invoice.findUnique({ where: { id } });
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    // Handle cancellation
    if (body.status === "CANCELLED") {
      if (invoice.status === "PAID") {
        return NextResponse.json({ error: "Cannot cancel a paid invoice" }, { status: 400 });
      }
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (body.status !== undefined) updateData.status = body.status;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.dueDate !== undefined) updateData.dueDate = new Date(body.dueDate);
    if (body.periodStart !== undefined) updateData.periodStart = new Date(body.periodStart);
    if (body.periodEnd !== undefined) updateData.periodEnd = new Date(body.periodEnd);

    // Discount fields
    if (body.discountType !== undefined) updateData.discountType = body.discountType === "" ? null : body.discountType;
    if (body.discountValue !== undefined) updateData.discountValue = parseFloat(String(body.discountValue)) || 0;
    if (body.discountAmount !== undefined) updateData.discountAmount = parseFloat(String(body.discountAmount)) || 0;

    // Late fee
    if (body.lateFee !== undefined) updateData.lateFee = parseFloat(String(body.lateFee)) || 0;

    // Handle paid status
    // [PAYMENTS-NOLEAK] Marking an invoice PAID without a Payment row used to be
    // the biggest ledger hole — revenue appeared on the invoice but was invisible
    // in the payments ledger, collections reports and collector stats. Now every
    // rupee booked here materializes as a VERIFIED Payment with a receipt number,
    // written atomically with the invoice update.
    let autoPaidPayment: { amount: number; mode: string; receipt: string } | null = null;
    if (body.status === "PAID" && !invoice.paidAt && invoice.balanceAmount > 0.01) {
      updateData.paidAt = new Date();
      updateData.paidAmount = invoice.grandTotal;
      updateData.balanceAmount = 0;
      autoPaidPayment = {
        amount: invoice.balanceAmount,
        mode: body.paymentMode || "ONLINE",
        receipt: newReceiptNumber(),
      };
    }

    // Handle payment recording
    let counterPayment: { amount: number; mode: string; receipt: string } | null = null;
    if (body.paymentAmount !== undefined && body.paymentAmount > 0) {
      const payAmount = parseFloat(String(body.paymentAmount));
      if (!Number.isFinite(payAmount) || payAmount <= 0) {
        return NextResponse.json({ error: "Invalid payment amount" }, { status: 400 });
      }
      if (payAmount > invoice.balanceAmount + 0.01) {
        return NextResponse.json(
          { error: `Payment amount (₹${payAmount}) exceeds outstanding balance (₹${Math.max(0, invoice.balanceAmount).toFixed(2)})` },
          { status: 400 }
        );
      }
      const newPaid = (invoice.paidAmount || 0) + payAmount;
      const newBalance = Math.max(0, invoice.grandTotal - newPaid);
      updateData.paidAmount = Math.round(newPaid * 100) / 100;
      updateData.balanceAmount = Math.round(newBalance * 100) / 100;

      if (newBalance <= 0) {
        updateData.status = "PAID";
        updateData.paidAt = new Date();
      }

      if (body.paymentMode) {
        updateData.paymentMode = body.paymentMode;
      }
      counterPayment = {
        amount: payAmount,
        mode: body.paymentMode || "CASH",
        receipt: newReceiptNumber(),
      };
    }

    // Recalculate grandTotal if discount or lateFee changed
    if (body.discountAmount !== undefined || body.lateFee !== undefined) {
      const discAmt = body.discountAmount !== undefined ? parseFloat(String(body.discountAmount)) || 0 : invoice.discountAmount;
      const lateFee = body.lateFee !== undefined ? parseFloat(String(body.lateFee)) || 0 : invoice.lateFee;
      const baseTotal = invoice.totalAmount - discAmt + lateFee;
      updateData.grandTotal = baseTotal;
      if (body.status !== "PAID") {
        updateData.balanceAmount = Math.max(0, baseTotal - invoice.paidAmount);
      }
    }

    // Handle line items update (replace all)
    if (body.lineItems !== undefined && Array.isArray(body.lineItems)) {
      // Delete existing line items
      await db.invoiceLineItem.deleteMany({ where: { invoiceId: id } });

      // Create new line items
      const itemsData = body.lineItems.map((item: { description?: string; quantity?: number; rate?: number; amount?: number }, idx: number) => ({
        description: item.description || "",
        quantity: item.quantity || 1,
        rate: item.rate || 0,
        amount: item.amount || (item.quantity || 1) * (item.rate || 0),
        sortOrder: idx,
      }));

      if (itemsData.length > 0) {
        await db.invoiceLineItem.createMany({
          data: itemsData.map(item => ({ ...item, invoiceId: id })),
        });
      }
    }

    // [PAYMENTS-NOLEAK] Invoice update + any payment rows are written in ONE
    // transaction — a mid-write crash can no longer book money on one side only.
    const updated = await db.$transaction(async (tx) => {
      if (autoPaidPayment) {
        await tx.payment.create({
          data: {
            subscriberId: invoice.subscriberId,
            invoiceId: id,
            amount: autoPaidPayment.amount,
            paymentMode: autoPaidPayment.mode as never,
            transactionRef: body.transactionRef || "",
            status: "VERIFIED",
            receiptNumber: autoPaidPayment.receipt,
            collectedById: userId,
            verifiedById: userId,
            notes: `${body.paymentNotes || ""} ${AUTO_VERIFIED_MARKER} Marked PAID from invoice edit.`.trim(),
          },
        });
      }
      if (counterPayment) {
        await tx.payment.create({
          data: {
            subscriberId: invoice.subscriberId,
            invoiceId: id,
            amount: counterPayment.amount,
            paymentMode: counterPayment.mode as never,
            transactionRef: body.transactionRef || "",
            status: "VERIFIED",
            receiptNumber: counterPayment.receipt,
            collectedById: userId,
            verifiedById: userId,
            notes: `${body.paymentNotes || ""} ${AUTO_VERIFIED_MARKER}`.trim(),
          },
        });
      }
      return tx.invoice.update({
        where: { id },
        data: updateData,
        include: {
          Subscriber: { select: { id: true, name: true, code: true, phone: true, Area: { select: { id: true, name: true } } } },
          Plan: { select: { id: true, name: true } },
          InvoiceLineItem: { orderBy: { sortOrder: "asc" } },
          Payment: { orderBy: { createdAt: "desc" } },
        },
      });
    });

    await auditUpdate(req, "Invoice", id, {
      ...body,
      ...(autoPaidPayment ? { _autoPayment: autoPaidPayment } : {}),
      ...(counterPayment ? { _counterPayment: counterPayment } : {}),
    }, invoice, { userId });
    return NextResponse.json({ invoice: updated });
  } catch (error) {
    console.error("Invoice PUT error:", error);
    return NextResponse.json({ error: "Failed to update invoice" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requirePermission(req, "invoices.delete"); // [AUDIT-FIX F-20]
    const { id } = await params;

    const invoice = await db.invoice.findUnique({ where: { id } });
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (invoice.status === "PAID" || invoice.status === "PARTIALLY_PAID") {
      return NextResponse.json({ error: "Cannot delete a paid or partially paid invoice" }, { status: 400 });
    }

    const deletedRecord = { ...invoice }; // [BUGFIX] was `{ ...Invoice }` — undefined identifier, 500 after delete
    await db.invoice.delete({ where: { id } });
    await auditDelete(req, "Invoice", id, deletedRecord, { userId });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Invoice DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete invoice" }, { status: 500 });
  }
}
