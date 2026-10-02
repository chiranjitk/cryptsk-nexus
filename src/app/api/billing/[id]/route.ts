import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, permissionFor, AuthError } from "@/lib/api-auth";

// GET /api/billing/[id] — single invoice detail
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    try {
      await requireAuth(req as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
      throw error; // [SECURITY-FIX] non-auth errors must not bypass authentication
    }
    const { id } = await params;
    const invoice = await db.invoice.findUnique({
      where: { id },
      include: {
        Subscriber: { select: { id: true, name: true, code: true, phone: true, email: true, address: true } },
        Plan: { select: { id: true, name: true, downloadSpeed: true, uploadSpeed: true, speedUnit: true } },
        Payment: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    return NextResponse.json(invoice);
  } catch (error) {
    console.error("Billing GET [id] error:", error);
    return NextResponse.json({ error: "Failed to fetch invoice" }, { status: 500 });
  }
}

// PUT /api/billing/[id] — update invoice (edit fields, cancel, etc)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireAuth(req as unknown as import("next/server").NextRequest); // [SECURITY-FIX] was swallow-and-continue
    const { id } = await params;
    const body = await req.json();

    // [PAYMENTS-NOLEAK] PAID is a money state — it must only be reached through
    // a Payment row (record_payment or the hardened /api/invoices/[id] route).
    // This legacy editor path used to accept status:"PAID" and book revenue
    // with nothing in the payments ledger.
    if (body.status === "PAID") {
      return NextResponse.json(
        { error: "Marking an invoice PAID requires a payment record — use Record Payment (POST /api/billing action=record_payment) so the receipt is booked in the ledger." },
        { status: 400 }
      );
    }

    await permissionFor(userId, "invoices.update");

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
    if (body.dueDate !== undefined) updateData.dueDate = new Date(body.dueDate);
    if (body.description !== undefined) updateData.description = body.description;
    if (body.discountType !== undefined) updateData.discountType = body.discountType;
    if (body.discountValue !== undefined) updateData.discountValue = parseFloat(String(body.discountValue)) || 0;
    if (body.discountAmount !== undefined) updateData.discountAmount = parseFloat(String(body.discountAmount)) || 0;
    if (body.lateFee !== undefined) updateData.lateFee = parseFloat(String(body.lateFee)) || 0;

    // Recalculate grandTotal if discount or lateFee changed
    if (body.discountAmount !== undefined || body.lateFee !== undefined) {
      const discAmt = body.discountAmount !== undefined ? parseFloat(String(body.discountAmount)) || 0 : invoice.discountAmount;
      const lateFee = body.lateFee !== undefined ? parseFloat(String(body.lateFee)) || 0 : invoice.lateFee;
      const baseTotal = invoice.totalAmount - discAmt + lateFee;
      updateData.grandTotal = baseTotal;
      updateData.balanceAmount = baseTotal - invoice.paidAmount;
    }

    const updated = await db.invoice.update({
      where: { id },
      data: updateData,
      include: {
        Subscriber: { select: { id: true, name: true, code: true } },
        Plan: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Billing PUT [id] error:", error);
    return NextResponse.json({ error: "Failed to update invoice" }, { status: 500 });
  }
}
