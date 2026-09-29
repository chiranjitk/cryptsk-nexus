import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req);
    const body = await req.json();
    const { paymentId, amount, reason, mode } = body;
    if (!paymentId || !amount) return NextResponse.json({ error: 'Payment ID and amount required' }, { status: 400 });

    const payment = await db.payment.findUnique({ where: { id: paymentId } });
    if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    if (parseFloat(amount) > payment.amount) return NextResponse.json({ error: 'Refund amount exceeds payment' }, { status: 400 });

    const refund = await db.refund.create({
      data: { paymentId, amount: parseFloat(amount), reason: reason || '', mode: mode || 'Original', notes: '', status: 'PENDING', processedById: userId },
    });
    await db.payment.update({ where: { id: paymentId }, data: { status: 'REFUNDED' } });
    return NextResponse.json({ refund });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}
