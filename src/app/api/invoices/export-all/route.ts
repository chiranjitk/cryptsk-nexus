import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/invoices/export-all — CSV export of all invoices with simplified columns
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "";
    const fromDate = searchParams.get("fromDate") || "";
    const toDate = searchParams.get("toDate") || "";

    const where: Record<string, unknown> = {};

    if (status && status !== "ALL") {
      where.status = status;
    }

    if (fromDate && toDate) {
      where.issueDate = { gte: new Date(fromDate), lte: new Date(toDate) };
    } else if (fromDate) {
      where.issueDate = { gte: new Date(fromDate) };
    } else if (toDate) {
      where.issueDate = { lte: new Date(toDate) };
    }

    const invoices = await db.invoice.findMany({
      where,
      include: {
        Subscriber: { select: { id: true, name: true, code: true, phone: true } },
        Plan: { select: { id: true, name: true } },
        Payment: {
          select: { paymentMode: true, status: true },
          where: { status: "VERIFIED" },
          take: 1,
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10000,
    });

    const fmt = (d: Date) => new Date(d).toLocaleDateString("en-IN");

    const headers = [
      "Invoice Number", "Subscriber Code", "Subscriber Name", "Plan",
      "Issue Date", "Due Date", "Subtotal", "Tax", "Grand Total",
      "Paid Amount", "Balance", "Status", "Payment Mode",
    ];

    const rows = invoices.map((inv) => [
      inv.invoiceNumber,
      inv.Subscriber?.code || "",
      inv.Subscriber?.name || "",
      inv.Plan?.name || "",
      fmt(inv.issueDate),
      fmt(inv.dueDate),
      String(inv.subtotal),
      String(inv.totalTax),
      String(inv.grandTotal),
      String(inv.paidAmount),
      String(inv.balanceAmount),
      inv.status,
      (inv.payments && inv.payments.length > 0) ? (inv.payments[0].paymentMode || "") : "",
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");

    const bom = "\uFEFF";
    const csvBuffer = Buffer.from(bom + csvContent, "utf-8");

    return new NextResponse(csvBuffer, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="invoices-export-all.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Invoices export-all error:", error);
    return NextResponse.json({ error: "Failed to export invoices" }, { status: 500 });
  }
}
