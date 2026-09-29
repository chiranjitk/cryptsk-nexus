import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/invoices/export — CSV export of invoices with all filters
export async function GET(req: NextRequest) {
  try {
    try {
      await requireAuth(req as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const { searchParams } = req.nextUrl;
    const status = searchParams.get("status");
    const subscriberId = searchParams.get("subscriberId");
    const areaId = searchParams.get("areaId");
    const planId = searchParams.get("planId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const search = searchParams.get("search");

    const where: Record<string, unknown> = {};

    if (status && status !== "ALL") where.status = status;
    if (subscriberId) where.subscriberId = subscriberId;
    if (planId) where.planId = planId;
    if (areaId) where.Subscriber = { ...where.Subscriber as Record<string, unknown>, areaId };

    if (startDate && endDate) {
      where.issueDate = { gte: new Date(startDate), lte: new Date(endDate) };
    } else if (startDate) {
      where.issueDate = { gte: new Date(startDate) };
    } else if (endDate) {
      where.issueDate = { lte: new Date(endDate) };
    }

    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search } },
        { Subscriber: { name: { contains: search } } },
        { Subscriber: { code: { contains: search } } },
      ];
    }

    const invoices = await db.invoice.findMany({
      where,
      include: {
        Subscriber: { select: { id: true, name: true, code: true, phone: true, Area: { select: { name: true } } } },
        Plan: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10000,
    });

    const headers = [
      "Invoice #", "Subscriber", "Code", "Area", "Plan",
      "Issue Date", "Due Date", "Period Start", "Period End",
      "Subtotal", "CGST", "SGST", "IGST", "Total Tax",
      "Discount", "Late Fee", "Grand Total", "Paid", "Balance", "Status", "Notes",
    ];

    const formatINR = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
    const fmt = (d: Date) => new Date(d).toLocaleDateString("en-IN");

    const rows = invoices.map((inv) => [
      inv.invoiceNumber,
      inv.Subscriber?.name || "",
      inv.Subscriber?.code || "",
      inv.Subscriber?.Area?.name || "",
      inv.Plan?.name || "",
      fmt(inv.issueDate),
      fmt(inv.dueDate),
      fmt(inv.periodStart),
      fmt(inv.periodEnd),
      inv.subtotal,
      inv.cgstAmount,
      inv.sgstAmount,
      inv.igstAmount,
      inv.totalTax,
      inv.discountAmount,
      inv.lateFee,
      inv.grandTotal,
      inv.paidAmount,
      inv.balanceAmount,
      inv.status,
      (inv.notes || "").replace(/"/g, '""'),
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\n");
    const bom = "\uFEFF";
    const csvBuffer = Buffer.from(bom + csvContent, "utf-8");

    return new NextResponse(csvBuffer, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="invoices_export_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    console.error("Invoices export error:", error);
    return NextResponse.json({ error: "Failed to export invoices" }, { status: 500 });
  }
}
