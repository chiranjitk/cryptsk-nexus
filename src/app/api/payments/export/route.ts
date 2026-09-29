import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/payments/export — CSV export of payments with all filters
export async function GET(req: NextRequest) {
  try {
    try {
      await requireAuth(req as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const { searchParams } = req.nextUrl;
    const status = searchParams.get("status");
    const mode = searchParams.get("mode");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const search = searchParams.get("search");

    const where: Record<string, unknown> = {};

    if (status) where.status = status;
    if (mode) where.paymentMode = mode;

    if (search) {
      where.OR = [
        { receiptNumber: { contains: search } },
        { transactionRef: { contains: search } },
        { Subscriber: { name: { contains: search } } },
        { Subscriber: { code: { contains: search } } },
      ];
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) (where.createdAt as Record<string, unknown>).gte = new Date(dateFrom);
      if (dateTo) (where.createdAt as Record<string, unknown>).lte = new Date(dateTo);
    }

    const payments = await db.payment.findMany({
      where,
      include: {
        Subscriber: { select: { id: true, name: true, code: true } },
        Invoice: { select: { id: true, invoiceNumber: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10000,
    });

    const headers = [
      "Receipt #", "Subscriber", "Code", "Invoice", "Amount",
      "Payment Mode", "Reference", "Status", "Date", "Notes",
    ];

    const fmt = (d: Date) => new Date(d).toLocaleString("en-IN");

    const rows = payments.map((p) => [
      p.receiptNumber || "",
      p.Subscriber?.name || "",
      p.Subscriber?.code || "",
      p.Invoice?.invoiceNumber || "",
      p.amount,
      p.paymentMode,
      p.transactionRef || "",
      p.status,
      fmt(p.createdAt),
      (p.notes || "").replace(/"/g, '""'),
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\n");
    const bom = "\uFEFF";
    const csvBuffer = Buffer.from(bom + csvContent, "utf-8");

    return new NextResponse(csvBuffer, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="payments_export_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    console.error("Payments export error:", error);
    return NextResponse.json({ error: "Failed to export payments" }, { status: 500 });
  }
}
