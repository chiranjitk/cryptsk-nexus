import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/api-auth';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const url = new URL(req.url);
    const { period, status } = Object.fromEntries(url.searchParams);

    const where: Record<string, unknown> = {};
    if (period) where.period = period;
    if (status && status !== 'ALL') where.status = status;

    const entries = await db.tdsEntry.findMany({
      where,
      include: {
        Invoice: { select: { invoiceNumber: true, issueDate: true, grandTotal: true } },
        Subscriber: { select: { name: true, code: true, gstin: true, panNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Summary aggregation
    const allEntries = await db.tdsEntry.findMany({ where });
    const totalDeducted = allEntries
      .filter(e => e.status === 'DEDUCTED' || e.status === 'DEPOSITED')
      .reduce((s, e) => s + e.tdsAmount, 0);
    const totalDeposited = allEntries
      .filter(e => e.status === 'DEPOSITED')
      .reduce((s, e) => s + e.tdsAmount, 0);
    const totalPending = totalDeducted - totalDeposited;

    // Group by section
    const sectionSummary: Record<string, { section: string; count: number; totalAmount: number; deposited: number }> = {};
    for (const e of allEntries) {
      const sec = e.section || 'Other';
      if (!sectionSummary[sec]) sectionSummary[sec] = { section: sec, count: 0, totalAmount: 0, deposited: 0 };
      sectionSummary[sec].count++;
      sectionSummary[sec].totalAmount += e.tdsAmount;
      if (e.status === 'DEPOSITED') sectionSummary[sec].deposited += e.tdsAmount;
    }

    return NextResponse.json({
      entries: entries.map(e => ({
        id: e.id,
        type: e.type,
        section: e.section,
        description: e.description,
        invoiceNumber: e.Invoice?.invoiceNumber || '',
        subscriberName: e.Subscriber?.name || '',
        subscriberGstin: e.Subscriber?.gstin || '',
        panNumber: e.panNumber || e.Subscriber?.panNumber || '',
        baseAmount: e.baseAmount,
        tdsRate: e.tdsRate,
        tdsAmount: Math.round(e.tdsAmount * 100) / 100,
        status: e.status,
        depositedDate: e.depositedDate,
        challanNumber: e.challanNumber,
        period: e.period,
        invoiceDate: e.Invoice?.issueDate,
        notes: e.notes,
        createdAt: e.createdAt,
      })),
      summary: {
        totalDeducted: Math.round(totalDeducted * 100) / 100,
        totalDeposited: Math.round(totalDeposited * 100) / 100,
        totalPending: Math.round(totalPending * 100) / 100,
      },
      sectionSummary: Object.values(sectionSummary).map(s => ({
        ...s,
        totalAmount: Math.round(s.totalAmount * 100) / 100,
        deposited: Math.round(s.deposited * 100) / 100,
      })),
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: 'Failed to fetch TDS/TCS data' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const body = await req.json();
    const { action, id, type, section, description, invoiceId, subscriberId, panNumber, baseAmount, tdsRate, tdsAmount, status, depositedDate, challanNumber, period, notes } = body;

    if (action === 'create') {
      if (!baseAmount || !tdsRate) {
        return NextResponse.json({ error: 'Base amount and TDS rate are required' }, { status: 400 });
      }
      const amount = tdsAmount || (baseAmount * tdsRate / 100);
      const entry = await db.tdsEntry.create({
        data: {
          type: type || 'TDS',
          section: section || '',
          description: description || '',
          invoiceId: invoiceId || null,
          subscriberId: subscriberId || null,
          panNumber: panNumber || '',
          baseAmount,
          tdsRate,
          tdsAmount: Math.round(amount * 100) / 100,
          status: status || 'DEDUCTED',
          depositedDate: depositedDate ? new Date(depositedDate) : null,
          challanNumber: challanNumber || '',
          period: period || '',
          notes: notes || '',
        },
      });
      return NextResponse.json({ entry, message: 'TDS/TCS entry created' });
    }

    if (action === 'update') {
      if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });
      const entry = await db.tdsEntry.update({
        where: { id },
        data: {
          ...(type && { type }),
          ...(section !== undefined && { section }),
          ...(description !== undefined && { description }),
          ...(panNumber !== undefined && { panNumber }),
          ...(baseAmount !== undefined && { baseAmount }),
          ...(tdsRate !== undefined && { tdsRate }),
          ...(tdsAmount !== undefined && { tdsAmount: Math.round(tdsAmount * 100) / 100 }),
          ...(status && { status }),
          ...(depositedDate !== undefined && { depositedDate: depositedDate ? new Date(depositedDate) : null }),
          ...(challanNumber !== undefined && { challanNumber }),
          ...(period !== undefined && { period }),
          ...(notes !== undefined && { notes }),
        },
      });
      return NextResponse.json({ entry, message: 'TDS/TCS entry updated' });
    }

    if (action === 'delete') {
      if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });
      await db.tdsEntry.delete({ where: { id } });
      return NextResponse.json({ message: 'TDS/TCS entry deleted' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: 'Failed to process TDS/TCS request' }, { status: 500 });
  }
}
