import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { auditCreate, auditBulk } from "@/lib/services/audit-service";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/payments — list payments with filters + summary + pendingVerifyCount
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const status = searchParams.get("status") || "";
    const mode = searchParams.get("mode") || "";
    const dateFrom = searchParams.get("dateFrom") || "";
    const dateTo = searchParams.get("dateTo") || "";
    const search = searchParams.get("search") || "";
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    // Validate sort params
    const allowedSortFields = ["createdAt", "amount", "paymentMode", "status", "receiptNumber"];
    const validSortBy = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";
    const validSortOrder = sortOrder === "asc" ? "asc" : "desc";

    const where: Record<string, unknown> = {};

    if (status) where.status = status;
    if (mode) where.paymentMode = mode;

    if (search) {
      where.OR = [
        { receiptNumber: { contains: search } },
        { transactionRef: { contains: search } },
        { Subscriber: { name: { contains: search } } },
        { Subscriber: { code: { contains: search } } },
      ];
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) (where.createdAt as Record<string, unknown>).gte = new Date(dateFrom);
      if (dateTo) (where.createdAt as Record<string, unknown>).lte = new Date(dateTo);
    }

    const [payments, total, pendingVerifyCount, todayVerifiedCount, todayVerifiedTotal, todayPendingCount, todayPendingTotal] = await Promise.all([
      db.payment.findMany({
        where,
        include: {
          Subscriber: { select: { id: true, name: true, code: true } },
          Invoice: { select: { id: true, invoiceNumber: true } },
        },
        orderBy: { [validSortBy]: validSortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.payment.count({ where }),
      // Total pending count across ALL payments (not page-limited)
      db.payment.count({ where: { status: "PENDING" } }),
      // Today's summary
      db.payment.count({ where: { status: "VERIFIED", createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
      db.payment.aggregate({
        where: { status: "VERIFIED", createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
        _sum: { amount: true },
      }),
      db.payment.count({ where: { status: "PENDING", createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
      db.payment.aggregate({
        where: { status: "PENDING", createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
        _sum: { amount: true },
      }),
    ]);

    return NextResponse.json({
      payments,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      pendingVerifyCount,
      summary: {
        todayCount: todayVerifiedCount,
        todayTotal: Math.round(todayVerifiedTotal._sum.amount || 0),
        todayPendingCount: todayPendingCount,
        todayPendingAmount: Math.round(todayPendingTotal._sum.amount || 0),
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Payments GET error:", error);
    return NextResponse.json({ error: "Failed to fetch payments" }, { status: 500 });
  }
}

// POST /api/payments — collect payment
export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req);
    const body = await req.json();

    // Bulk verify/reject action (supports both 'verify'/'reject' and 'bulk_verify'/'bulk_reject')
    const effectiveAction = body.action === 'verify' ? 'bulk_verify'
      : body.action === 'reject' ? 'bulk_reject'
      : body.action;

    if (effectiveAction === "bulk_verify" || effectiveAction === "bulk_reject") {
      const { paymentIds } = body;
      if (!paymentIds || !Array.isArray(paymentIds) || paymentIds.length === 0) {
        return NextResponse.json({ error: "Payment IDs are required" }, { status: 400 });
      }

      const targetStatus = effectiveAction === "bulk_verify" ? "VERIFIED" : "FAILED";

      // Find all payments to update invoice balances for verified ones
      const paymentsToUpdate = await db.payment.findMany({
        where: { id: { in: paymentIds }, status: "PENDING" },
        include: { Invoice: true },
      });

      const result = await db.payment.updateMany({
        where: { id: { in: paymentIds }, status: "PENDING" },
        data: { status: targetStatus },
      });

      // If verifying, update linked invoice balances
      if (targetStatus === "VERIFIED") {
        for (const p of paymentsToUpdate) {
          if (p.invoiceId && p.Invoice) {
            const invoice = p.Invoice;
            const newPaidAmount = invoice.paidAmount + p.amount;
            const newBalanceAmount = invoice.grandTotal - newPaidAmount;
            // Use 0.01 tolerance for float precision
            const newInvoiceStatus = newBalanceAmount <= 0.01 ? "PAID" : "PARTIALLY_PAID";
            await db.invoice.update({
              where: { id: p.invoiceId },
              data: {
                paidAmount: newPaidAmount,
                balanceAmount: Math.max(0, Math.round(newBalanceAmount * 100) / 100),
                status: newInvoiceStatus,
                paidAt: newInvoiceStatus === "PAID" ? new Date() : invoice.paidAt,
              },
            });
          }
        }
      }

      await auditBulk(req, targetStatus === "VERIFIED" ? "BULK_UPDATE" : "BULK_DELETE", "Payment", result.count, paymentIds);
      return NextResponse.json({
        message: `${targetStatus === "VERIFIED" ? "Verified" : "Rejected"} ${result.count} payment(s)`,
        count: result.count,
      });
    }

    const { subscriberId, amount, paymentMode, transactionRef, notes, invoiceId } = body;

    if (!subscriberId || !amount || amount <= 0) {
      return NextResponse.json({ error: "Subscriber and valid amount are required" }, { status: 400 });
    }

    const subscriber = await db.subscriber.findUnique({ where: { id: subscriberId } });
    if (!subscriber) {
      return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
    }

    // B5 FIX: Validate payment amount doesn't exceed invoice balance
    if (invoiceId) {
      const invoice = await db.invoice.findUnique({ where: { id: invoiceId } });
      if (!invoice) {
        return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
      }
      const balance = (invoice.grandTotal || 0) - (invoice.paidAmount || 0);
      if (amount > balance) {
        return NextResponse.json(
          { error: `Payment amount (₹${amount}) exceeds outstanding balance (₹${Math.max(0, balance)}). Maximum allowed: ₹${Math.max(0, balance)}` },
          { status: 400 }
        );
      }
    }

    const payCount = await db.payment.count();
    const receiptNumber = `RCT${String(payCount + 1).padStart(6, "0")}`;

    const payment = await db.payment.create({
      data: {
        subscriberId,
        invoiceId: invoiceId || null,
        amount,
        paymentMode: paymentMode || "CASH",
        transactionRef: transactionRef || "",
        notes: notes || "",
        receiptNumber,
        status: "PENDING",
      },
      include: {
        Subscriber: { select: { id: true, name: true, code: true } },
        Invoice: { select: { id: true, invoiceNumber: true } },
      },
    });

    await auditCreate(req, "Payment", payment.id, { amount, mode: paymentMode, subscriberId }, { userId });
    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Payments POST error:", error);
    return NextResponse.json({ error: "Failed to create payment" }, { status: 500 });
  }
}
