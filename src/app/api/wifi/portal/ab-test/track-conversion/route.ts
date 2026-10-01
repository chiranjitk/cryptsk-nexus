import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Track A/B test conversion — PUBLIC endpoint (no auth)
 * POST /api/wifi/portal/ab-test/track-conversion
 * Body: { testId: string, variant: 'A' | 'B' }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { testId, variant } = body as { testId: string; variant: 'A' | 'B' };

    if (!testId || !variant || !['A', 'B'].includes(variant)) {
      return NextResponse.json({ success: false, error: 'testId and variant (A or B) required' }, { status: 400 });
    }

    const field = variant === 'A' ? 'conversionsA' : 'conversionsB';
    await db.portalABTest.update({
      where: { id: testId, status: 'active' },
      data: { [field]: { increment: 1 } },
    });

    logWifi(request, 'update', 'portal_ab_test', undefined).catch(() => {});
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[ABTest] Track conversion error:', err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
