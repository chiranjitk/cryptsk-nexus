import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req);
    const body = await req.json();
    const { invoiceId, totalAmount, installments, frequency, startDate } = body;
    if (!invoiceId || !totalAmount || !installments) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

    const instAmount = parseFloat(totalAmount) / parseInt(installments);
    const start = new Date(startDate || new Date().toISOString().split('T')[0]);

    // Look up invoice to get subscriberId (required field)
    const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, select: { subscriberId: true } });
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

    const plan = await db.paymentPlan.create({
      data: { subscriberId: invoice.subscriberId, invoiceId, totalAmount: parseFloat(totalAmount), emiCount: parseInt(installments), emiAmount: Math.round(instAmount * 100) / 100, startDate: start, paidInstallments: 0, status: 'active', notes: '' },
    });
    return NextResponse.json({ plan });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { invoiceId } = Object.fromEntries(new URL(req.url).searchParams);
    const where: Record<string, unknown> = {};
    if (invoiceId) where.invoiceId = invoiceId;
    const plans = await db.paymentPlan.findMany({ where, include: { Invoice: { select: { invoiceNumber: true, grandTotal: true, Subscriber: { select: { name: true, code: true } } } } }, orderBy: { createdAt: 'desc' } });
    return NextResponse.json({ plans });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}
