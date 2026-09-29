import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/api-auth';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const url = new URL(req.url);
    const { startDate, endDate } = Object.fromEntries(url.searchParams);

    const where: Record<string, unknown> = { reverseCharge: true, status: { notIn: ['DRAFT', 'CANCELLED'] } };
    if (startDate && endDate) {
      where.issueDate = { gte: new Date(startDate), lte: new Date(endDate + 'T23:59:59') };
    } else if (startDate) {
      where.issueDate = { gte: new Date(startDate) };
    }

    const invoices = await db.invoice.findMany({
      where,
      include: {
        Subscriber: { select: { name: true, code: true, gstin: true } },
        Plan: { select: { name: true } },
      },
      orderBy: { issueDate: 'desc' },
      take: 100,
    });

    const totalValue = invoices.reduce((s, i) => s + i.grandTotal, 0);
    const totalTax = invoices.reduce((s, i) => s + i.totalTax, 0);

    return NextResponse.json({
      invoices: invoices.map(inv => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        subscriberName: inv.Subscriber.name,
        subscriberGstin: inv.Subscriber.gstin || '',
        invoiceValue: Math.round(inv.grandTotal * 100) / 100,
        totalTax: Math.round(inv.totalTax * 100) / 100,
        cgst: Math.round(inv.cgstAmount * 100) / 100,
        sgst: Math.round(inv.sgstAmount * 100) / 100,
        igst: Math.round(inv.igstAmount * 100) / 100,
        tdsAmount: Math.round(inv.tdsAmount * 100) / 100,
        tdsDeducted: inv.tdsDeducted,
        status: inv.status,
        issueDate: inv.issueDate,
      })),
      totalInvoices: invoices.length,
      totalValue: Math.round(totalValue * 100) / 100,
      totalTax: Math.round(totalTax * 100) / 100,
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: 'Failed to fetch reverse charge data' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const { invoiceId, reverseCharge } = await req.json();

    if (!invoiceId) {
      return NextResponse.json({ error: 'Invoice ID required' }, { status: 400 });
    }

    const invoice = await db.invoice.update({
      where: { id: invoiceId },
      data: { reverseCharge: !!reverseCharge },
    });

    return NextResponse.json({ invoice, message: `Reverse charge ${reverseCharge ? 'enabled' : 'disabled'}` });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: 'Failed to update reverse charge' }, { status: 500 });
  }
}
