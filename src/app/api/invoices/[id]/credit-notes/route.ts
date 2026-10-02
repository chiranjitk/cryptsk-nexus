import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";

// POST /api/invoices/[id]/credit-notes — Create a credit note (plural alias)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireAuth(req);
    const { id } = await params;
    const body = await req.json();
    const { amount, reason, notes, autoApply } = body as {
      amount: number; reason: string; notes?: string; autoApply?: boolean;
    };

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "Credit note amount must be greater than 0" }, { status: 400 });
    }
    if (!reason?.trim()) {
      return NextResponse.json({ error: "Reason is required" }, { status: 400 });
    }

    const invoice = await db.invoice.findUnique({
      where: { id },
      include: { Subscriber: { select: { id: true, name: true, balance: true } } },
    });

    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    if (!["PAID", "OVERDUE", "PARTIALLY_PAID"].includes(invoice.status)) {
      return NextResponse.json({ error: "Credit notes can only be created for PAID, OVERDUE, or PARTIALLY_PAID invoices" }, { status: 400 });
    }

    const creditNote = await db.creditNote.create({
      data: {
        invoiceId: id,
        amount: Math.round(amount * 100) / 100,
        reason: reason.trim(),
        notes: notes?.trim() || "",
        status: autoApply ? "APPLIED" : "DRAFT",
        createdBy: userId,
      },
    });

    if (autoApply) {
      await db.subscriber.update({
        where: { id: invoice.subscriberId },
        data: { balance: { increment: amount } },
      });
    }

    return NextResponse.json({
      creditNote,
      message: autoApply ? `Credit note of ${amount} applied` : `Credit note created (DRAFT)`,
    });
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) {
      const authErr = error as { statusCode: number; message: string };
      return NextResponse.json({ error: authErr.message }, { status: authErr.statusCode });
    }
    return NextResponse.json({ error: "Failed to create credit note" }, { status: 500 });
  }
}
