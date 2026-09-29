import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { search, status, page = '1', limit = '50' } = Object.fromEntries(new URL(req.url).searchParams);
    const where: Record<string, unknown> = {};
    if (search) where.OR = [
      { subscriberName: { contains: search } }, { subscriberCode: { contains: search } },
      { invoiceNumber: { contains: search } }, { description: { contains: search } },
    ];
    if (status) where.status = status;

    const [disputes, total] = await Promise.all([
      db.dispute.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (parseInt(page) - 1) * parseInt(limit), take: parseInt(limit), include: { Subscriber: { select: { name: true, code: true } }, resolvedBy: { select: { name: true } } } }),
      db.dispute.count({ where }),
    ]);
    return NextResponse.json({ disputes, total });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}
