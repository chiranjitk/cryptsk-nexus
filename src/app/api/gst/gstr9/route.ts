import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/api-auth';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const url = new URL(req.url);
    const { year } = Object.fromEntries(url.searchParams);
    const now = new Date();
    const fy = year ? parseInt(year) : now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;

    const startDate = new Date(fy, 3, 1); // April 1
    const endDate = new Date(fy + 1, 2, 31, 23, 59, 59); // March 31

    const invoices = await db.invoice.findMany({
      where: {
        issueDate: { gte: startDate, lte: endDate },
        status: { notIn: ['DRAFT', 'CANCELLED'] },
      },
      include: {
        Subscriber: { select: { name: true, code: true, gstin: true } },
        Plan: { select: { name: true } },
      },
      orderBy: { issueDate: 'asc' },
    });

    // Aggregate by month
    const monthlyData: Record<string, { month: string; outward: number; tax: number; count: number; igst: number; cgst: number; sgst: number }> = {};
    for (const inv of invoices) {
      const d = new Date(inv.issueDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
      if (!monthlyData[key]) monthlyData[key] = { month: monthLabel, outward: 0, tax: 0, count: 0, igst: 0, cgst: 0, sgst: 0 };
      monthlyData[key].outward += inv.subtotal;
      monthlyData[key].tax += inv.totalTax;
      monthlyData[key].count += 1;
      monthlyData[key].igst += inv.igstAmount;
      monthlyData[key].cgst += inv.cgstAmount;
      monthlyData[key].sgst += inv.sgstAmount;
    }

    const totalOutward = invoices.reduce((s, i) => s + i.subtotal, 0);
    const totalTax = invoices.reduce((s, i) => s + i.totalTax, 0);
    const totalCgst = invoices.reduce((s, i) => s + i.cgstAmount, 0);
    const totalSgst = invoices.reduce((s, i) => s + i.sgstAmount, 0);
    const totalIgst = invoices.reduce((s, i) => s + i.igstAmount, 0);
    const totalTds = invoices.reduce((s, i) => s + i.tdsAmount, 0);

    // Reverse charge invoices
    const rcInvoices = invoices.filter(i => i.reverseCharge);
    const rcTotal = rcInvoices.reduce((s, i) => s + i.totalTax, 0);

    // Credit notes
    const creditNotes = invoices.filter(i => i.status === 'CREDIT_NOTE');
    const creditNoteTotal = creditNotes.reduce((s, i) => s + i.totalAmount, 0);

    // Get ISP settings
    const settings = await db.ispSettings.findUnique({ where: { id: 'default' } });

    // Quarterly breakdown
    const quarters: Record<string, { quarter: string; tax: number; count: number }> = {};
    for (const [key, data] of Object.entries(monthlyData)) {
      const monthNum = parseInt(key.split('-')[1]);
      const qNum = Math.ceil(monthNum / 3);
      const qKey = `Q${qNum}`;
      if (!quarters[qKey]) quarters[qKey] = { quarter: qKey, tax: 0, count: 0 };
      quarters[qKey].tax += data.tax;
      quarters[qKey].count += data.count;
    }

    return NextResponse.json({
      financialYear: `${fy}-${fy + 1}`,
      gstin: settings?.gstin || '',
      companyName: settings?.companyName || '',
      compositeScheme: settings?.compositeScheme || false,
      compositeSchemeRate: settings?.compositeSchemeRate || 0,
      totalOutward: Math.round(totalOutward * 100) / 100,
      totalTax: Math.round(totalTax * 100) / 100,
      totalCgst: Math.round(totalCgst * 100) / 100,
      totalSgst: Math.round(totalSgst * 100) / 100,
      totalIgst: Math.round(totalIgst * 100) / 100,
      totalTds: Math.round(totalTds * 100) / 100,
      totalInvoices: invoices.length,
      reverseChargeTotal: Math.round(rcTotal * 100) / 100,
      reverseChargeCount: rcInvoices.length,
      creditNoteTotal: Math.round(creditNoteTotal * 100) / 100,
      creditNoteCount: creditNotes.length,
      netTaxPayable: Math.round((totalTax - creditNoteTotal) * 100) / 100,
      monthlyBreakdown: Object.entries(monthlyData).map(([, data]) => ({
        ...data,
        outward: Math.round(data.outward * 100) / 100,
        tax: Math.round(data.tax * 100) / 100,
        igst: Math.round(data.igst * 100) / 100,
        cgst: Math.round(data.cgst * 100) / 100,
        sgst: Math.round(data.sgst * 100) / 100,
      })),
      quarterlyBreakdown: Object.values(quarters).map(q => ({
        ...q,
        tax: Math.round(q.tax * 100) / 100,
      })),
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: 'Failed to generate GSTR-9 report' }, { status: 500 });
  }
}
