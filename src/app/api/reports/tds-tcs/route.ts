import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = req.nextUrl;
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const now = new Date();
    const start = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = endDate ? new Date(endDate + "T23:59:59") : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // Fetch invoices with TDS deducted
    const invoices = await db.invoice.findMany({
      where: {
        tdsDeducted: true,
        createdAt: { gte: start, lte: end },
      },
      include: {
        Subscriber: { select: { name: true, code: true, panNumber: true, gstin: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Summary totals
    const totalTDS = invoices.reduce((s, i) => s + (i.tdsAmount || 0), 0);
    const totalInvoiceAmount = invoices.reduce((s, i) => s + i.grandTotal, 0);
    const totalCGST = invoices.reduce((s, i) => s + (i.cgstAmount || 0), 0);
    const totalSGST = invoices.reduce((s, i) => s + (i.sgstAmount || 0), 0);
    const totalIGST = invoices.reduce((s, i) => s + (i.igstAmount || 0), 0);
    const totalTax = totalCGST + totalSGST + totalIGST;

    // Group by TDS rate
    const byRate: Record<string, { count: number; tdsAmount: number; invoiceAmount: number }> = {};
    for (const inv of invoices) {
      const rate = String(inv.tdsRate || 0);
      if (!byRate[rate]) byRate[rate] = { count: 0, tdsAmount: 0, invoiceAmount: 0 };
      byRate[rate].count++;
      byRate[rate].tdsAmount += inv.tdsAmount || 0;
      byRate[rate].invoiceAmount += inv.grandTotal;
    }
    const rateBreakdown = Object.entries(byRate).map(([rate, data]) => ({
      rate: parseFloat(rate),
      count: data.count,
      tdsAmount: Math.round(data.tdsAmount),
      invoiceAmount: Math.round(data.invoiceAmount),
    })).sort((a, b) => a.rate - b.rate);

    // Monthly TDS trend (last 12 months)
    const monthlyTDS: { month: string; tdsAmount: number; invoiceCount: number }[] = [];
    for (let m = 11; m >= 0; m--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const mEnd = new Date(now.getFullYear(), now.getMonth() - m + 1, 0, 23, 59, 59);
      const label = mStart.toLocaleString("en-IN", { month: "short", year: "2-digit" });

      const monthInvoices = await db.invoice.findMany({
        where: {
          tdsDeducted: true,
          createdAt: { gte: mStart, lte: mEnd },
        },
        select: { tdsAmount: true },
      });
      monthlyTDS.push({
        month: label,
        tdsAmount: Math.round(monthInvoices.reduce((s, i) => s + (i.tdsAmount || 0), 0)),
        invoiceCount: monthInvoices.length,
      });
    }

    return NextResponse.json({
      invoices: invoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        subscriberName: inv.Subscriber?.name || "",
        subscriberCode: inv.Subscriber?.code || "",
        panNumber: inv.Subscriber?.panNumber || "",
        gstin: inv.Subscriber?.gstin || "",
        invoiceAmount: inv.grandTotal,
        tdsRate: inv.tdsRate || 0,
        tdsAmount: inv.tdsAmount || 0,
        cgst: inv.cgstAmount || 0,
        sgst: inv.sgstAmount || 0,
        igst: inv.igstAmount || 0,
        paidAmount: inv.paidAmount,
        balanceAmount: inv.balanceAmount,
        issueDate: inv.issueDate,
        paidAt: inv.paidAt,
        status: inv.status,
      })),
      summary: {
        totalTDS: Math.round(totalTDS),
        totalInvoiceAmount: Math.round(totalInvoiceAmount),
        totalTax: Math.round(totalTax),
        totalCGST: Math.round(totalCGST),
        totalSGST: Math.round(totalSGST),
        totalIGST: Math.round(totalIGST),
        invoiceCount: invoices.length,
      },
      rateBreakdown,
      monthlyTDS,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("TDS/TCS Reports API error:", error);
    return NextResponse.json({ error: "Failed to fetch TDS/TCS report" }, { status: 500 });
  }
}
