import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

// GET /api/invoices/[id] — get single invoice with lines + payments
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("billing.invoice", "read");
    const { id } = await params;

    const invoice = await db.invoice.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, displayName: true, customerCode: true, email: true, phone: true } },
        subscription: { select: { id: true, subscriptionCode: true } },
        lines: { orderBy: { sortOrder: "asc" } },
        payments: { orderBy: { receivedAt: "desc" } },
      },
    });

    if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ invoice });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
