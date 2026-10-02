import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Unified A/B Test Tracking — PUBLIC endpoint (no auth)
 * POST /api/wifi/portal/ab-test/track
 * Body: { testId: string, variant: 'A' | 'B', type: 'impression' | 'conversion' }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { testId, variant, type } = body as {
      testId: string;
      variant: 'A' | 'B';
      type: 'impression' | 'conversion';
    };

    if (!testId || !variant || !['A', 'B'].includes(variant)) {
      return NextResponse.json(
        { success: false, error: 'testId and variant (A or B) required' },
        { status: 400 },
      );
    }

    if (!type || !['impression', 'conversion'].includes(type)) {
      return NextResponse.json(
        { success: false, error: 'type must be "impression" or "conversion"' },
        { status: 400 },
      );
    }

    const field =
      type === 'impression'
        ? variant === 'A'
          ? 'impressionsA'
          : 'impressionsB'
        : variant === 'A'
          ? 'conversionsA'
          : 'conversionsB';

    const result = await db.portalABTest.update({
      where: { id: testId, status: 'active' },
      data: { [field]: { increment: 1 } },
    });

    // Silently ignore if test not found or not active (normal for deleted/expired tests)
    if (result.count === 0) {
      return NextResponse.json({ success: true, tracked: false });
    }

    logWifi(request, 'create', 'portal_ab_test', result.id).catch(() => {});
    return NextResponse.json({ success: true, tracked: true });
  } catch (err) {
    console.error('[ABTest] Track error:', err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}