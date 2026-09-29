import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditUpdate } from "@/lib/services/audit-service";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(req);
    const { id } = await params;
    const body = await req.json();
    const { status, notes } = body;

    const existing = await db.purchaseOrder.findUnique({
      where: { id },
      include: { PurchaseOrderItem: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });
    }

    const validStatuses = ["DRAFT", "SUBMITTED", "APPROVED", "ORDERED", "RECEIVED", "CANCELLED"];
    const newStatus = status ? String(status).toUpperCase() : existing.status;
    if (!validStatuses.includes(newStatus)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` }, { status: 400 });
    }

    const updateData: Record<string, unknown> = { status: newStatus };
    if (notes !== undefined) updateData.notes = notes;

    const order = await db.purchaseOrder.update({
      where: { id },
      data: updateData,
      include: {
        Vendor: { select: { id: true, name: true } },
        PurchaseOrderItem: true,
      },
    });

    await auditUpdate(req, "PurchaseOrder", id, { status: newStatus }, { status: existing.status });
    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Purchase order update error:", error);
    return NextResponse.json({ error: "Failed to update purchase order" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(req);
    const { id } = await params;

    const existing = await db.purchaseOrder.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });
    }

    if (existing.status === "ORDERED" || existing.status === "RECEIVED") {
      return NextResponse.json({ error: "Cannot delete an ordered or received purchase order" }, { status: 409 });
    }

    await db.purchaseOrder.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Purchase order delete error:", error);
    return NextResponse.json({ error: "Failed to delete purchase order" }, { status: 500 });
  }
}
