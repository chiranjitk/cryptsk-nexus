import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditCreate } from "@/lib/services/audit-service";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "all";
    const vendorId = searchParams.get("vendorId") || "";

    const where: Record<string, unknown> = {};
    if (status !== "all") where.status = status;
    if (vendorId) where.vendorId = vendorId;

    const orders = await db.purchaseOrder.findMany({
      where,
      orderBy: { orderDate: "desc" },
      include: {
        Vendor: { select: { id: true, name: true, contactPerson: true, phone: true } },
        PurchaseOrderItem: true,
      },
    });

    return NextResponse.json({ orders });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Purchase orders GET error:", error);
    return NextResponse.json({ error: "Failed to fetch purchase orders" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req);
    const body = await req.json();
    const { vendorId, items, totalAmount, notes, expectedDate } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "At least one item is required" }, { status: 400 });
    }

    const orderNumber = `PO-${Date.now().toString(36).toUpperCase()}`;

    const order = await db.purchaseOrder.create({
      data: {
        orderNumber,
        vendorId: vendorId || null,
        status: "DRAFT",
        orderDate: new Date(),
        expectedDate: expectedDate ? new Date(expectedDate) : null,
        totalAmount: totalAmount || items.reduce((s: number, i: { total: number }) => s + (i.total || 0), 0),
        notes: notes || "",
        createdBy: userId,
        PurchaseOrderItem: {
          create: items.map((item: { name: string; category: string; quantity: number; unitPrice: number; total: number; notes: string }) => ({
            name: item.name || "",
            category: item.category || "",
            quantity: item.quantity || 1,
            unitPrice: item.unitPrice || 0,
            total: item.total || 0,
            notes: item.notes || "",
          })),
        },
      },
      include: {
        Vendor: { select: { id: true, name: true } },
        PurchaseOrderItem: true,
      },
    });

    await auditCreate(req, "PurchaseOrder", order.id, { orderNumber, totalAmount: order.totalAmount });
    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Purchase orders POST error:", error);
    return NextResponse.json({ error: "Failed to create purchase order" }, { status: 500 });
  }
}
