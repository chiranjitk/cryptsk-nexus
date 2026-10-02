import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { search, category, startDate, endDate, page = '1', limit = '50' } = Object.fromEntries(new URL(req.url).searchParams);
    const where: Record<string, unknown> = {};
    if (search) where.OR = [{ description: { contains: search } }, { reference: { contains: search } }];
    if (category && category !== 'ALL') where.category = category;
    if (startDate) where.date = { gte: new Date(startDate) };
    if (endDate) where.date = { lte: new Date(endDate + 'T23:59:59') };

    const [expenses, total] = await Promise.all([
      db.expense.findMany({ where, orderBy: { date: 'desc' }, skip: (parseInt(page) - 1) * parseInt(limit), take: parseInt(limit) }),
      db.expense.count({ where }),
    ]);
    const totalAmount = await db.expense.aggregate({ _sum: { amount: true }, where });
    return NextResponse.json({ expenses, total, totalAmount: totalAmount._sum.amount || 0 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch expenses' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireAuth(req);
    const body = await req.json();
    const { category, description, amount, date, reference } = body;
    if (!amount || !date) return NextResponse.json({ error: 'Amount and date required' }, { status: 400 });
    const expense = await db.expense.create({
      data: { category: category || 'Operational', description: description || '', amount: parseFloat(amount), date: new Date(date), reference: reference || '', createdBy: userId },
    });
    return NextResponse.json({ expense });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to create expense' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireAuth(req);
    const { search } = Object.fromEntries(new URL(req.url).searchParams);
    if (!search) return NextResponse.json({ error: 'Provide search params for deletion' }, { status: 400 });
    const count = await db.expense.deleteMany({ where: { OR: [{ description: { contains: search } }, { reference: { contains: search } }] } });
    return NextResponse.json({ deleted: count });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed' }, { status: 500 });
  }
}
