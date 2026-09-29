import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { auditCreate } from "@/lib/services/audit-service";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  try {
    try {
      await requireAuth(req as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
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
    try {
      await requireAuth(req as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
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

    // Generate receipt number
    const count = await db.payment.count();
    const receiptNumber = `RCT-${String(count + 1).padStart(5, "0")}`;

    const payment = await db.payment.create({
      data: {
        subscriberId,
        invoiceId: invoiceId || null,
        amount: parseFloat(amount),
        paymentMode,
        transactionRef: transactionRef || "",
        bankName: bankName || "",
        chequeNumber: chequeNumber || "",
        status: "VERIFIED",
        receiptNumber,
        notes: notes || "",
        collectedById: collectedById || null,
        verifiedById: collectedById || null,
      },
      include: {
        Subscriber: { select: { id: true, name: true, code: true, phone: true } },
        Invoice: { select: { id: true, invoiceNumber: true } },
        User_Payment_collectedByIdToUser: { select: { id: true, name: true } },
      },
    });

    // Update invoice paid amount if linked
    if (invoiceId) {
      const invoice = await db.invoice.findUnique({ where: { id: invoiceId } });
      if (invoice) {
        const newPaid = Math.round((invoice.paidAmount + parseFloat(amount)) * 100) / 100;
        const newBalance = Math.round((invoice.grandTotal - newPaid) * 100) / 100;

        await db.invoice.update({
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

    await auditCreate(req, "Payment", payment.id, { amount: parseFloat(amount), paymentMode, subscriberId, collectedById, source: "collection" });
    return NextResponse.json({ payment }, { status: 201 });
  } catch (error) {
    console.error("Collection POST error:", error);
    return NextResponse.json({ error: "Failed to record payment" }, { status: 500 });
  }
}
