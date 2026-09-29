import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/api-auth';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const settings = await db.ispSettings.findUnique({ where: { id: 'default' } });

    // Get current financial year turnover to check eligibility
    const now = new Date();
    const fy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const startDate = new Date(fy, 3, 1);
    const endDate = new Date(fy + 1, 2, 31, 23, 59, 59);

    const turnoverResult = await db.invoice.aggregate({
      where: {
        issueDate: { gte: startDate, lte: endDate },
        status: { notIn: ['DRAFT', 'CANCELLED'] },
      },
      _sum: { grandTotal: true },
    });

    const currentTurnover = turnoverResult._sum.grandTotal || 0;
    const turnoverLimit = 1500000; // Rs 1.5 Cr for services (ISP)

    return NextResponse.json({
      compositeScheme: settings?.compositeScheme || false,
      compositeSchemeRate: settings?.compositeSchemeRate || 6,
      gstin: settings?.gstin || '',
      companyName: settings?.companyName || '',
      currentTurnover: Math.round(currentTurnover * 100) / 100,
      turnoverLimit,
      isEligible: currentTurnover <= turnoverLimit,
      itcAvailable: false, // ITC not available under composite scheme
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: 'Failed to fetch composite scheme data' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const body = await req.json();
    const { compositeScheme, compositeSchemeRate } = body;

    if (typeof compositeScheme !== 'boolean') {
      return NextResponse.json({ error: 'compositeScheme is required (boolean)' }, { status: 400 });
    }

    await db.ispSettings.upsert({
      where: { id: 'default' },
      update: {
        compositeScheme,
        ...(compositeSchemeRate !== undefined ? { compositeSchemeRate: Number(compositeSchemeRate) || 6 } : {}),
      },
      create: {
        id: 'default',
        compositeScheme,
        compositeSchemeRate: Number(compositeSchemeRate) || 6,
      },
    });

    return NextResponse.json({
      message: compositeScheme
        ? `Enrolled in composite scheme at ${compositeSchemeRate || 6}%`
        : 'Opted out of composite scheme',
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: 'Failed to update composite scheme' }, { status: 500 });
  }
}
