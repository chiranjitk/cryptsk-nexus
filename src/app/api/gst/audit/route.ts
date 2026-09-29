import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { startDate, endDate, page, limit, status, subscriberId } = Object.fromEntries(new URL(req.url).searchParams);
    const p = Math.max(1, parseInt(page) || 1);
    const l = Math.min(100, parseInt(limit) || 50);

    const where: Record<string, unknown> = {};
    if (startDate && endDate) {
      where.issueDate = { gte: new Date(startDate), lte: new Date(endDate + 'T23:59:59') };
    } else if (startDate) {
      where.issueDate = { gte: new Date(startDate) };
    }
    if (status && status !== 'ALL') where.status = status;
    if (subscriberId) where.subscriberId = subscriberId;

    const [invoices, total] = await Promise.all([
      db.invoice.findMany({
        where,
        include: {
          Subscriber: { select: { name: true, code: true, gstin: true, panNumber: true } },
          Plan: { select: { name: true, cgstPercent: true, sgstPercent: true, igstPercent: true } },
        },
        orderBy: { issueDate: 'desc' },
        skip: (p - 1) * l,
        take: l,
      }),
      db.invoice.count({ where }),
    ]);

    const items = invoices.map(inv => {
      const effectiveCgst = inv.cgstRate > 0 ? inv.cgstRate : (inv.Plan?.cgstPercent || 0);
      const effectiveSgst = inv.sgstRate > 0 ? inv.sgstRate : (inv.Plan?.sgstPercent || 0);
      const effectiveIgst = inv.igstRate > 0 ? inv.igstRate : (inv.Plan?.igstPercent || 0);
      const expectedCgst = inv.subtotal * (effectiveCgst / 100);
      const expectedSgst = inv.subtotal * (effectiveSgst / 100);
      const expectedIgst = inv.subtotal * (effectiveIgst / 100);
      const cgstVariance = inv.cgstAmount - expectedCgst;
      const sgstVariance = inv.sgstAmount - expectedSgst;
      const igstVariance = inv.igstAmount - expectedIgst;
      const hasDiscrepancy = Math.abs(cgstVariance) > 0.01 || Math.abs(sgstVariance) > 0.01 || Math.abs(igstVariance) > 0.01;

      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        issueDate: inv.issueDate,
        subscriberName: inv.Subscriber.name,
        subscriberGstin: inv.Subscriber.gstin || '',
        subscriberPan: inv.Subscriber.panNumber || '',
        invoiceValue: inv.grandTotal,
        taxableValue: inv.subtotal,
        cgstRate: effectiveCgst,
        sgstRate: effectiveSgst,
        igstRate: effectiveIgst,
        cgstAmount: inv.cgstAmount,
        sgstAmount: inv.sgstAmount,
        igstAmount: inv.igstAmount,
        expectedCgst: Math.round(expectedCgst * 100) / 100,
        expectedSgst: Math.round(expectedSgst * 100) / 100,
        expectedIgst: Math.round(expectedIgst * 100) / 100,
        cgstVariance: Math.round(cgstVariance * 100) / 100,
        sgstVariance: Math.round(sgstVariance * 100) / 100,
        igstVariance: Math.round(igstVariance * 100) / 100,
        totalTax: inv.totalTax,
        reverseCharge: inv.reverseCharge,
        tdsDeducted: inv.tdsDeducted,
        tdsAmount: inv.tdsAmount,
        tdsRate: inv.tdsRate,
        status: inv.status,
        hasDiscrepancy,
      };
    });

    const discrepancyCount = items.filter(i => i.hasDiscrepancy).length;
    const totalTax = items.reduce((s, i) => s + i.totalTax, 0);

    return NextResponse.json({
      invoices: items,
      total,
      page: p,
      limit: l,
      totalPages: Math.ceil(total / l),
      summary: {
        totalInvoices: total,
        discrepancyCount,
        discrepancyRate: total > 0 ? ((discrepancyCount / total) * 100).toFixed(1) : '0',
        totalTax: Math.round(totalTax * 100) / 100,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}
