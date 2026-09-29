import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditCreateEntity } from "@/lib/audit";

// GET /api/payments — list payments
export async function GET(req: NextRequest) {
  try {
    await requirePermission("billing.payment", "read");

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";
    const customerId = searchParams.get("customerId") || "";

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    if (search) {
      where.OR = [
        { paymentNumber: { contains: search } },
        { transactionId: { contains: search } },
        { customer: { displayName: { contains: search } } },
      ];
    }

    const payments = await db.payment.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      take: 100,
      include: {
        customer: { select: { id: true, displayName: true, customerCode: true } },
        invoice: { select: { id: true, invoiceNumber: true, total: true } },
      },
    });

    return NextResponse.json({ payments });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

// POST /api/payments — record a payment
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("billing.payment", "create");
    const body = await req.json();
    const { invoiceId, customerId, amount, method, transactionId, notes } = body;

    if (!customerId || !amount || !method) {
      return NextResponse.json({ error: "customerId, amount, method required" }, { status: 400 });
    }

    // Generate payment number
    const count = await db.payment.count();
    const paymentNumber = `PAY-2026-${String(count + 1).padStart(5, "0")}`;

    const payment = await db.payment.create({
      data: {
        paymentNumber,
        invoiceId: invoiceId || null,
        customerId,
        amount: Number(amount),
        method,
        status: "completed",
        transactionId: transactionId || null,
        paidAt: new Date(),
        receivedBy: user.id,
        createdBy: user.id,
        notes,
      },
      include: {
        customer: { select: { displayName: true, customerCode: true } },
        invoice: { select: { invoiceNumber: true, total: true, balanceDue: true } },
      },
    });

    // If linked to invoice, update invoice paid amount + status
    if (invoiceId) {
      const invoice = await db.invoice.findUnique({ where: { id: invoiceId } });
      if (invoice) {
        const newPaid = invoice.paidAmount + Number(amount);
        const newBalance = invoice.total - newPaid;
        const newStatus = newBalance <= 0 ? "paid" : "partial";
        const newPayStatus = newBalance <= 0 ? "paid" : "partial";

        await db.invoice.update({
          where: { id: invoiceId },
          data: {
            paidAmount: newPaid,
            balanceDue: Math.max(0, newBalance),
            paymentStatus: newPayStatus,
            status: newStatus === "paid" ? "paid" : invoice.status,
          },
        });
      }
    }

    await auditCreateEntity({
      userId: user.id,
      action: "create",
      resource: "payment",
      resourceId: payment.id,
      resourceName: payment.paymentNumber,
      after: { paymentNumber, amount, method, invoiceId },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ payment }, { status: 201 });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
