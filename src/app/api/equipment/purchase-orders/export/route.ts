import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "all";

    const where: Record<string, unknown> = {};
    if (status !== "all") where.status = status;

    const orders = await db.purchaseOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { Vendor: { select: { name: true } }, PurchaseOrderItem: true },
    });

    const csvRows = ["PO Number,Vendor,Status,Order Date,Expected Date,Total,Items,Notes"];
    for (const o of orders) {
      const itemsSummary = o.items.map((i) => `${i.name} (${i.quantity}x ${i.unitPrice})`).join("; ");
      const csv = [
        o.orderNumber,
        `"${(o.vendor?.name || "N/A").replace(/"/g, '""')}"`,
        o.status,
        o.orderDate.toISOString().slice(0, 10),
        o.expectedDate?.toISOString().slice(0, 10) || "",
        o.totalAmount.toFixed(2),
        `"${itemsSummary.replace(/"/g, '""')}"`,
        `"${(o.notes || "").replace(/"/g, '""')}"`,
      ].join(",");
      csvRows.push(csv);
    }

    const csvContent = csvRows.join("\n");
    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="purchase-orders-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("PO export error:", error);
    return NextResponse.json({ error: "Failed to export purchase orders" }, { status: 500 });
  }
}
