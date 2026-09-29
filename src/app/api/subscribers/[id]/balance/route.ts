import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/subscribers/[id]/balance — Get subscriber's outstanding balance + pending invoices
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    try {
      await requireAuth(req as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const { id } = await params;

    const subscriber = await db.subscriber.findUnique({
      where: { id },
      select: { id: true, name: true },
    });

    if (!subscriber) {
      return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
    }

    // Get all unpaid invoices
    const pendingInvoices = await db.invoice.findMany({
      where: {
        subscriberId: id,
        status: { in: ["DRAFT", "SENT", "PARTIALLY_PAID", "OVERDUE"] },
      },
      select: {
        id: true,
        invoiceNumber: true,
        grandTotal: true,
        paidAmount: true,
        balanceAmount: true,
        status: true,
        dueDate: true,
      },
      orderBy: { dueDate: "asc" },
    });

    const outstandingBalance = pendingInvoices.reduce((sum, inv) => sum + inv.balanceAmount, 0);

    return NextResponse.json({
      Subscriber: { id: subscriber.id, name: subscriber.name },
      outstandingBalance,
      pendingInvoiceCount: pendingInvoices.length,
      pendingInvoices,
    });
  } catch (error) {
    console.error("Subscriber balance error:", error);
    return NextResponse.json({ error: "Failed to fetch balance" }, { status: 500 });
  }
}
