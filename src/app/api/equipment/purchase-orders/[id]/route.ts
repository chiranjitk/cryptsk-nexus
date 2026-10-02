import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["APPROVED", "CANCELLED"],
  APPROVED: ["ORDERED", "CANCELLED"],
  ORDERED: ["RECEIVED", "CANCELLED"],
  RECEIVED: [],
  CANCELLED: [],
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const order = await db.purchaseOrder.findUnique({
      where: { id },
      include: { Vendor: true, PurchaseOrderItem: true },
    });
    if (!order) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });
    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("PO detail error:", error);
    return NextResponse.json({ error: "Failed to fetch purchase order" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireAuth(request);
    const { id } = await params;
    const body = await request.json();
    const { status, notes } = body;

    const existing = await db.purchaseOrder.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });

    if (status && status !== existing.status) {
      const allowed = VALID_TRANSITIONS[existing.status as string] || [];
      if (!allowed.includes(status)) {
        return NextResponse.json({ error: `Cannot transition from ${existing.status} to ${status}. Allowed: ${allowed.join(", ")}` }, { status: 400 });
      }
    }

    const data: Record<string, unknown> = {};
    if (status) data.status = status;
    if (notes !== undefined) data.notes = notes;

    const order = await db.purchaseOrder.update({ where: { id }, data, include: { Vendor: true, PurchaseOrderItem: true } });
    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("PO update error:", error);
    return NextResponse.json({ error: "Failed to update purchase order" }, { status: 500 });
  }
}
