import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "all";
    const search = searchParams.get("search") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20")));

    const where: Record<string, unknown> = {};
    if (status !== "all") where.status = status;
    if (search) {
      where.OR = [
        { orderNumber: { contains: search } },
        { notes: { contains: search } },
        { Vendor: { name: { contains: search } } },
      ];
    }

    const [orders, total] = await Promise.all([
      db.purchaseOrder.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: { Vendor: { select: { id: true, name: true, contactPerson: true, phone: true } }, PurchaseOrderItem: true },
      }),
      db.purchaseOrder.count({ where }),
    ]);

    return NextResponse.json({
      items: orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        vendorId: o.vendorId,
        status: o.status,
        orderDate: o.orderDate.toISOString(),
        expectedDate: o.expectedDate?.toISOString() || null,
        totalAmount: o.totalAmount,
        notes: o.notes,
        vendor: o.vendor,
        items: o.items,
        createdAt: o.createdAt.toISOString(),
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("PO list error:", error);
    return NextResponse.json({ error: "Failed to fetch purchase orders" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth(request);
    const body = await request.json();
    const { vendorId, items, expectedDate, notes } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "At least one item is required" }, { status: 400 });
    }

    const totalAmount = items.reduce((sum: number, item: { quantity: number; unitPrice: number }) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0);
    const orderDate = new Date();
    const count = await db.purchaseOrder.count();
    const orderNumber = `PO-${String(count + 1).padStart(5, "0")}`;

    const order = await db.purchaseOrder.create({
      data: {
        orderNumber,
        vendorId: vendorId || null,
        status: "DRAFT",
        orderDate,
        expectedDate: expectedDate ? new Date(expectedDate) : null,
        totalAmount,
        notes: notes || "",
        createdBy: userId,
        PurchaseOrderItem: {
          create: items.map((item: { name: string; category: string; quantity: number; unitPrice: number; total: number; notes: string }) => ({
            name: item.name || "",
            category: item.category || "",
            quantity: Number(item.quantity) || 1,
            unitPrice: Number(item.unitPrice) || 0,
            total: (Number(item.quantity) || 1) * (Number(item.unitPrice) || 0),
            notes: item.notes || "",
          })),
        },
      },
      include: { Vendor: true, PurchaseOrderItem: true },
    });

    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("PO create error:", error);
    return NextResponse.json({ error: "Failed to create purchase order" }, { status: 500 });
  }
}
