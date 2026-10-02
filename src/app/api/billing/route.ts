import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, permissionFor, AuthError } from "@/lib/api-auth";
import { nextInvoiceNumber } from "@/lib/invoice-number";
import { newReceiptNumber, AUTO_VERIFIED_MARKER } from "@/lib/services/receipt";

// GET /api/billing — list invoices with filters + total status counts
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const status = searchParams.get("status") || "";
    const search = searchParams.get("search") || "";
    const subscriberId = searchParams.get("subscriberId") || "";
    const dateFrom = searchParams.get("dateFrom") || "";
    const dateTo = searchParams.get("dateTo") || "";

    const where: Record<string, unknown> = {};

    if (status) where.status = status;
    if (subscriberId) where.subscriberId = subscriberId;

    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search } },
        { Subscriber: { name: { contains: search } } },
        { Subscriber: { code: { contains: search } } },
      ];
    }

    if (dateFrom || dateTo) {
      where.issueDate = {};
      if (dateFrom) (where.issueDate as Record<string, unknown>).gte = new Date(dateFrom);
      if (dateTo) (where.issueDate as Record<string, unknown>).lte = new Date(dateTo);
    }

    const [invoices, total, statusCounts] = await Promise.all([
      db.invoice.findMany({
        where,
        include: {
          Subscriber: { select: { id: true, name: true, code: true } },
          Plan: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.invoice.count({ where }),
      // Count by status (unfiltered — always across ALL invoices regardless of current filters)
      db.invoice.groupBy({
        by: ["status"],
        _count: { status: true },
      }),
    ]);

    // Build status count map
    const counts: Record<string, number> = {
      DRAFT: 0,
      SENT: 0,
      PAID: 0,
      PARTIALLY_PAID: 0,
      OVERDUE: 0,
      CANCELLED: 0,
    };
    for (const sc of statusCounts) {
      counts[sc.status] = sc._count.status;
    }

    return NextResponse.json({
      invoices,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      statusCounts: counts,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Billing GET error:", error);
    return NextResponse.json({ error: "Failed to fetch invoices" }, { status: 500 });
  }
}

// POST /api/billing — generate invoices, send, record payment, bulk send
export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req);
    const body = await req.json();
    const { subscriberId, action } = body;

    // [AUDIT-FIX F-20] Generating/sending invoices is a billing action
    await permissionFor(userId, "invoices.create");

    // Action: bulk send invoices
    if (action === "bulk_send") {
      const { invoiceIds } = body;
      if (!invoiceIds || !Array.isArray(invoiceIds) || invoiceIds.length === 0) {
        return NextResponse.json({ error: "Invoice IDs are required" }, { status: 400 });
      }

      const result = await db.invoice.updateMany({
        where: {
          id: { in: invoiceIds },
          status: { in: ["DRAFT", "SENT"] },
        },
        data: { status: "SENT" },
      });

      return NextResponse.json({
        message: `Sent ${result.count} invoices`,
        count: result.count,
      });
    }

    // Action: send invoice (mark as SENT)
    if (action === "send" && subscriberId) {
      const invoice = await db.invoice.findFirst({
        where: { subscriberId, status: "DRAFT" },
        orderBy: { createdAt: "desc" },
      });

      if (!invoice) {
        return NextResponse.json({ error: "No draft invoice found for this subscriber" }, { status: 404 });
      }

      const updated = await db.invoice.update({
        where: { id: invoice.id },
        data: { status: "SENT" },
        include: {
          Subscriber: { select: { id: true, name: true, code: true } },
          Plan: { select: { id: true, name: true } },
        },
      });

      return NextResponse.json(updated);
    }

    // Action: record payment against invoice
    if (action === "record_payment" && subscriberId) {
      const { invoiceId, amount, paymentMode, transactionRef } = body;

      if (!invoiceId || !amount) {
        return NextResponse.json({ error: "Invoice ID and amount are required" }, { status: 400 });
      }

      const invoice = await db.invoice.findUnique({ where: { id: invoiceId } });
      if (!invoice) {
        return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
      }

      // Overpayment validation
      const outstandingBalance = (invoice.grandTotal || 0) - (invoice.paidAmount || 0);
      if (amount > outstandingBalance + 0.01) {
        return NextResponse.json(
          { error: `Payment amount (₹${amount}) exceeds outstanding balance (₹${Math.max(0, outstandingBalance).toFixed(2)}). Maximum allowed: ₹${Math.max(0, outstandingBalance).toFixed(2)}` },
          { status: 400 }
        );
      }

      // Use transaction to ensure atomicity of payment creation + invoice update
      const newPaidAmount = invoice.paidAmount + amount;
      const newBalanceAmount = invoice.grandTotal - newPaidAmount;
      const newStatus = newBalanceAmount <= 0.01 ? "PAID" : "PARTIALLY_PAID";

      const [payment, updatedInvoice] = await db.$transaction([
        db.payment.create({
          data: {
            subscriberId,
            invoiceId,
            amount,
            paymentMode: paymentMode || "CASH",
            transactionRef: transactionRef || "",
            status: "VERIFIED",
            // [PAYMENTS-NOLEAK] Receipt was never generated here — counter
            // collections were untraceable in the receipts ledger.
            receiptNumber: newReceiptNumber(),
            collectedById: userId,
            verifiedById: userId,
            notes: AUTO_VERIFIED_MARKER,
          },
        }),
        db.invoice.update({
          where: { id: invoiceId },
          data: {
            paidAmount: newPaidAmount,
            balanceAmount: Math.max(0, newBalanceAmount),
            status: newStatus,
            paidAt: newStatus === "PAID" ? new Date() : invoice.paidAt,
          },
          include: {
            Subscriber: { select: { id: true, name: true, code: true } },
            Plan: { select: { id: true, name: true } },
          },
        }),
      ]);

      return NextResponse.json({ payment, invoice: updatedInvoice });
    }

    // Default action: generate invoices for all active subscribers
    const { billingPeriodStart, billingPeriodEnd, dueDate: reqDueDate } = body;

    const activeSubscribers = await db.subscriber.findMany({
      where: {
        status: "ACTIVE",
        planId: { not: null },
      },
      include: { Plan: true },
    });

    if (activeSubscribers.length === 0) {
      return NextResponse.json({ error: "No active subscribers with plans found" }, { status: 400 });
    }

    const now = new Date();
    const periodStart = billingPeriodStart ? new Date(billingPeriodStart) : new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = billingPeriodEnd ? new Date(billingPeriodEnd) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const issueDate = new Date(periodStart);
    const dueDate = reqDueDate ? new Date(reqDueDate) : new Date(periodStart.getFullYear(), periodStart.getMonth(), 10);

    const created = [] as Array<Awaited<ReturnType<typeof db.invoice.create>>>;

    for (const sub of activeSubscribers) {
      if (!sub.Plan) continue;

      // Check if invoice already exists for this period
      const existing = await db.invoice.findFirst({
        where: {
          subscriberId: sub.id,
          periodStart,
          periodEnd,
        },
      });

      if (existing) continue;

      // [AUDIT-FIX F-12] Shared allocator — was `INV<count+offset>` (count-based, race-prone,
      // format incompatible with the rest of the platform).
      const invoiceNum = await nextInvoiceNumber();
      const subtotal = sub.Plan.priceMonthly;
      const cgst = Math.round(subtotal * sub.Plan.cgstPercent) / 100;
      const sgst = Math.round(subtotal * sub.Plan.sgstPercent) / 100;
      const igst = Math.round(subtotal * sub.Plan.igstPercent) / 100;
      const totalTax = cgst + sgst + igst;
      const totalAmount = Math.round(subtotal + totalTax);

      const invoice = await db.invoice.create({
        data: {
          invoiceNumber: invoiceNum,
          subscriberId: sub.id,
          planId: sub.planId,
          issueDate,
          dueDate,
          periodStart,
          periodEnd,
          description: `Internet subscription - ${sub.Plan.name} for ${now.toLocaleString("en-IN", { month: "long", year: "numeric" })}`,
          subtotal,
          cgstAmount: cgst,
          sgstAmount: sgst,
          igstAmount: igst,
          totalTax,
          totalAmount,
          grandTotal: totalAmount,
          paidAmount: 0,
          balanceAmount: totalAmount,
          status: "DRAFT",
        },
      });

      created.push(invoice);
    }

    return NextResponse.json({
      message: `Generated ${created.length} invoices`,
      count: created.length,
      invoices: created,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Billing POST error:", error);
    return NextResponse.json({ error: "Failed to process billing action" }, { status: 500 });
  }
}
