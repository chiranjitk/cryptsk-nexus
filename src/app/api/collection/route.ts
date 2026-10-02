import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { auditCreate } from "@/lib/services/audit-service";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { newReceiptNumber, AUTO_VERIFIED_MARKER } from "@/lib/services/receipt";

export async function GET(req: NextRequest) {
  try {
    try {
      await requireAuth(req as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
      throw error; // [SECURITY-FIX] non-auth errors must not bypass authentication
    }
    const { searchParams } = req.nextUrl;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "25");
    const status = searchParams.get("status");
    const paymentMode = searchParams.get("paymentMode");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const agentId = searchParams.get("agentId");
    const search = searchParams.get("search");

    const where: Record<string, unknown> = {};

    if (status && status !== "ALL") {
      where.status = status;
    }
    if (paymentMode && paymentMode !== "ALL") {
      where.paymentMode = paymentMode;
    }
    if (agentId && agentId !== "ALL") {
      where.collectedById = agentId;
    }
    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    } else if (startDate) {
      where.createdAt = { gte: new Date(startDate) };
    }
    if (search) {
      where.OR = [
        { receiptNumber: { contains: search } },
        { transactionRef: { contains: search } },
        { Subscriber: { name: { contains: search } } },
        { Subscriber: { code: { contains: search } } },
        { Subscriber: { phone: { contains: search } } },
      ];
    }

    const [payments, total] = await Promise.all([
      db.payment.findMany({
        where,
        include: {
          Subscriber: {
            select: { id: true, name: true, code: true, phone: true, Area: { select: { name: true } } },
          },
          Invoice: { select: { id: true, invoiceNumber: true } },
          User_Payment_collectedByIdToUser: { select: { id: true, name: true } },
          User_Payment_verifiedByIdToUser: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.payment.count({ where }),
    ]);

    return NextResponse.json({ payments, total, page, limit });
  } catch (error) {
    console.error("Collection GET error:", error);
    return NextResponse.json({ error: "Failed to fetch collection data" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    let userId: string;
    try {
      userId = await requireAuth(req as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
      throw error; // [SECURITY-FIX] non-auth errors must not bypass authentication
    }
    const body = await req.json();
    const { subscriberId, invoiceId, amount, paymentMode, transactionRef, bankName, chequeNumber, notes, collectedById } = body;

    if (!subscriberId || !amount || !paymentMode) {
      return NextResponse.json({ error: "Missing required fields: subscriberId, amount, paymentMode" }, { status: 400 });
    }

    if (amount <= 0) {
      return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 });
    }

    const subscriber = await db.subscriber.findUnique({ where: { id: subscriberId } });
    if (!subscriber) {
      return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
    }

    const payAmount = parseFloat(amount);

    // [PAYMENTS-NOLEAK] Overpay guard — agent consoles were the one path that
    // could book more money against an invoice than the invoice is worth.
    if (invoiceId) {
      const targetInvoice = await db.invoice.findUnique({ where: { id: invoiceId } });
      if (!targetInvoice) {
        return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
      }
      const balance = (targetInvoice.grandTotal || 0) - (targetInvoice.paidAmount || 0);
      if (payAmount > balance + 0.01) {
        return NextResponse.json(
          { error: `Payment amount (₹${payAmount}) exceeds outstanding balance (₹${Math.max(0, balance).toFixed(2)})` },
          { status: 400 }
        );
      }
    }

    // [PAYMENTS-NOLEAK] Duplicate UTR guard — same guard as /api/payments.
    if (transactionRef && String(transactionRef).trim() !== "") {
      const duplicate = await db.payment.findFirst({
        where: { transactionRef: String(transactionRef).trim(), status: { not: "FAILED" } },
        select: { id: true, receiptNumber: true, amount: true },
      });
      if (duplicate) {
        return NextResponse.json(
          { error: `Duplicate transaction reference "${transactionRef}" — already recorded as ${duplicate.receiptNumber || duplicate.id} (₹${duplicate.amount}).`, duplicateOf: duplicate.id },
          { status: 409 }
        );
      }
    }

    // [PAYMENTS-NOLEAK] Collision-proof receipt (was count-based RCT-00001 —
    // two concurrent agent collections shared a receipt) + single atomic
    // transaction for payment + invoice update + agent counter bumps.
    const receiptNumber = newReceiptNumber();
    const payment = await db.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          subscriberId,
          invoiceId: invoiceId || null,
          amount: payAmount,
          paymentMode,
          transactionRef: transactionRef || "",
          bankName: bankName || "",
          chequeNumber: chequeNumber || "",
          status: "VERIFIED",
          receiptNumber,
          notes: notes ? `${notes} ${AUTO_VERIFIED_MARKER}` : AUTO_VERIFIED_MARKER,
          collectedById: collectedById || userId,
          verifiedById: collectedById || userId,
        },
        include: {
          Subscriber: { select: { id: true, name: true, code: true, phone: true } },
          Invoice: { select: { id: true, invoiceNumber: true } },
          User_Payment_collectedByIdToUser: { select: { id: true, name: true } },
        },
      });

      if (invoiceId) {
        const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
        if (invoice) {
          const newPaid = Math.round((invoice.paidAmount + payAmount) * 100) / 100;
          const newBalance = Math.round((invoice.grandTotal - newPaid) * 100) / 100;
          await tx.invoice.update({
            where: { id: invoiceId },
            data: {
              paidAmount: newPaid,
              balanceAmount: Math.max(0, newBalance),
              paidAt: newBalance <= 0 ? new Date() : invoice.paidAt,
              status: newBalance <= 0 ? "PAID" : "PARTIALLY_PAID",
            },
          });
        }
      }

      // Keep the denormalized CollectionAgent counters alive (were never
      // updated by any route — dashboards drifted from reality).
      const agentId = collectedById || userId;
      if (agentId) {
        await tx.collectionAgent.upsert({
          where: { userId: agentId },
          create: { userId: agentId, name: created.User_Payment_collectedByIdToUser?.name || "Agent", totalCollectedToday: payAmount, totalCollectedMonth: payAmount },
          update: {
            totalCollectedToday: { increment: payAmount },
            totalCollectedMonth: { increment: payAmount },
          },
        }).catch(() => { /* agent row optional */ });
      }

      return created;
    });

    await auditCreate(req, "Payment", payment.id, { amount: parseFloat(amount), paymentMode, subscriberId, collectedById, source: "collection" });
    return NextResponse.json({ payment }, { status: 201 });
  } catch (error) {
    console.error("Collection POST error:", error);
    return NextResponse.json({ error: "Failed to record payment" }, { status: 500 });
  }
}
