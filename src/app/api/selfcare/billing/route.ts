import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSelfcareAccess } from "@/lib/portal-auth";
import { isRedirectError } from "../common";

// ============================================================
// CRYPTSK Nexus — GET /api/selfcare/billing?customerId=<cuid>
// Self-Care "Billing" + "Payments" tabs (spec §18).
// AUTH: requireSelfcareAccess — customer logins have customerId
// FORCED from their session (a differing query customerId → 404);
// staff pass ?customerId= (RBAC: subscriber.list).
// Real invoices + payments for exactly one customer — so the response
// can never contain another tenant's data.
//   • invoices: latest 50 with line-item count
//   • payments: latest 50 with invoice number
//   • totals: invoiced (Σ invoice.total), paid (Σ completed payments),
//     outstanding (Σ invoice.balanceDue on still-open invoices)
// Read-only.
// ============================================================

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ctx = await requireSelfcareAccess({
      customerId: searchParams.get("customerId"),
      subscriberId: searchParams.get("subscriberId"),
    });

    if (!ctx.customerId) {
      return ctx.mode === "staff"
        ? NextResponse.json({ error: "customerId is required" }, { status: 400 })
        : NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }
    const customerId = ctx.customerId;

    // Never leak another customer's ledger — unknown id → 404, not empty data
    const customer = await db.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const [invoices, payments, invoicedAgg, paidAgg, outstandingAgg] = await Promise.all([
      db.invoice.findMany({
        where: { customerId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          subtotal: true,
          discountAmount: true,
          taxAmount: true,
          total: true,
          paidAmount: true,
          balanceDue: true,
          dueDate: true,
          createdAt: true,
          _count: { select: { lines: true } },
        },
      }),
      db.payment.findMany({
        where: { customerId },
        orderBy: { receivedAt: "desc" },
        take: 50,
        select: {
          id: true,
          paymentNumber: true,
          amount: true,
          method: true,
          status: true,
          paidAt: true,
          receivedAt: true,
          invoiceId: true,
          invoice: { select: { invoiceNumber: true } },
        },
      }),
      db.invoice.aggregate({ where: { customerId }, _sum: { total: true } }),
      // PaymentStatus real values: pending | completed | failed | refunded |
      // partially_refunded — "completed" is the collected-money status
      db.payment.aggregate({ where: { customerId, status: "completed" }, _sum: { amount: true } }),
      // InvoiceStatus real values: draft | issued | sent | paid | partial |
      // overdue | cancelled | void — closed/cancelled ledgers excluded
      db.invoice.aggregate({
        where: { customerId, status: { notIn: ["paid", "cancelled", "void"] } },
        _sum: { balanceDue: true },
      }),
    ]);

    return NextResponse.json({
      invoices: invoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        status: inv.status,
        subtotal: inv.subtotal,
        discountAmount: inv.discountAmount,
        taxAmount: inv.taxAmount,
        total: inv.total,
        paidAmount: inv.paidAmount,
        balanceDue: inv.balanceDue,
        dueDate: inv.dueDate,
        createdAt: inv.createdAt,
        // InvoiceItem model = InvoiceLine in this schema
        itemCount: inv._count.lines,
      })),
      payments: payments.map((p) => ({
        id: p.id,
        paymentNumber: p.paymentNumber,
        amount: p.amount,
        method: p.method,
        status: p.status,
        paidAt: p.paidAt,
        receivedAt: p.receivedAt,
        invoiceId: p.invoiceId,
        invoiceNumber: p.invoice?.invoiceNumber ?? null,
      })),
      totals: {
        invoiced: Number(invoicedAgg._sum.total ?? 0),
        paid: Number(paidAgg._sum.amount ?? 0),
        outstanding: Number(outstandingAgg._sum.balanceDue ?? 0),
      },
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/selfcare/billing] GET failed:", err);
    return NextResponse.json({ error: "Failed to load billing data" }, { status: 500 });
  }
}
