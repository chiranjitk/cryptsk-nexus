import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditCreateEntity } from "@/lib/audit";

// GET /api/invoices — list invoices
export async function GET(req: NextRequest) {
  try {
    await requirePermission("billing.invoice", "read");

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";
    const customerId = searchParams.get("customerId") || "";

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search } },
        { customer: { displayName: { contains: search } } },
      ];
    }

    const invoices = await db.invoice.findMany({
      where,
      orderBy: { issueDate: "desc" },
      take: 100,
      include: {
        customer: { select: { id: true, displayName: true, customerCode: true, email: true } },
        subscription: { select: { id: true, subscriptionCode: true } },
        _count: { select: { lines: true, payments: true } },
      },
    });

    return NextResponse.json({ invoices });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

// POST /api/invoices — create invoice
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("billing.invoice", "create");
    const body = await req.json();
    const { customerId, subscriptionId, dueDate, lines, notes, taxRate, discountPercent } = body;

    if (!customerId || !dueDate || !lines?.length) {
      return NextResponse.json({ error: "customerId, dueDate, lines required" }, { status: 400 });
    }

    // Generate invoice number
    const count = await db.invoice.count();
    const invoiceNumber = `INV-2026-${String(count + 1).padStart(5, "0")}`;

    // Calculate totals
    const tr = taxRate || 18.0;
    const dp = discountPercent || 0;

    let subtotal = 0;
    let totalTax = 0;
    let totalAmount = 0;

    for (const line of lines) {
      const amount = (line.quantity || 1) * line.unitPrice;
      const taxAmt = amount * (tr / 100);
      const lineTotal = amount + taxAmt;
      subtotal += amount;
      totalTax += taxAmt;
      totalAmount += lineTotal;
    }

    const discountAmt = subtotal * (dp / 100);
    const taxableAmt = subtotal - discountAmt;
    const taxAmt = taxableAmt * (tr / 100);
    const grandTotal = taxableAmt + taxAmt;

    // Create invoice + lines in a transaction
    const invoice = await db.invoice.create({
      data: {
        invoiceNumber,
        customerId,
        subscriptionId: subscriptionId || null,
        dueDate: new Date(dueDate),
        subtotal,
        discountPercent: dp,
        discountAmount: discountAmt,
        taxableAmount: taxableAmt,
        taxRate: tr,
        taxAmount: taxAmt,
        total: grandTotal,
        balanceDue: grandTotal,
        status: "issued",
        paymentStatus: "unpaid",
        notes,
        createdBy: user.id,
        updatedBy: user.id,
        lines: {
          create: lines.map((l: any, i: number) => ({
            description: l.description,
            quantity: l.quantity || 1,
            unitPrice: l.unitPrice,
            amount: (l.quantity || 1) * l.unitPrice,
            taxRate: tr,
            taxAmount: (l.quantity || 1) * l.unitPrice * (tr / 100),
            total: (l.quantity || 1) * l.unitPrice * (1 + tr / 100),
            lineType: l.lineType || "charge",
            planId: l.planId || null,
            sortOrder: i,
          })),
        },
      },
      include: {
        lines: true,
        customer: { select: { displayName: true, customerCode: true } },
      },
    });

    await auditCreateEntity({
      userId: user.id,
      action: "create",
      resource: "invoice",
      resourceId: invoice.id,
      resourceName: invoice.invoiceNumber,
      after: { invoiceNumber, total: grandTotal, customerId },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ invoice }, { status: 201 });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
