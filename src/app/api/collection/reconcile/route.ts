import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const date = new URL(req.url).searchParams.get('date') || undefined;
    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 86400000);

    const payments = await db.payment.findMany({
      where: { createdAt: { gte: startOfDay, lt: endOfDay } },
      include: { User_Payment_collectedByIdToUser: { select: { id: true, name: true } } },
    });

    const agents = await db.collectionAgent.findMany();
    const cashByAgent = agents.map(a => {
      const agentPayments = payments.filter(p => p.collectedById === a.id && p.paymentMode === 'CASH');
      const total = agentPayments.reduce((s, p) => s + p.amount, 0);
      return { agentId: a.id, agentName: a.name, expectedCash: a.dailyTarget, actualCash: total, difference: a.dailyTarget - total };
    });

    return NextResponse.json({ date: targetDate.toISOString().split('T')[0], cashByAgent, totalExpected: agents.reduce((s, a) => s + a.dailyTarget, 0), totalActual: cashByAgent.reduce((s, c) => s + c.actualCash, 0) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}
