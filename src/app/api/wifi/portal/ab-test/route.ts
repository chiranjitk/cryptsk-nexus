import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth/tenant-context';

/**
 * A/B Testing API — Feature #14
 *
 * GET    /api/wifi/portal/ab-test?portalId=xxx        — List A/B tests for a portal
 * POST   /api/wifi/portal/ab-test                     — Create a new A/B test
 * PUT    /api/wifi/portal/ab-test?id=xxx               — Update test status
 * DELETE /api/wifi/portal/ab-test?id=xxx               — Delete a test
 * GET    /api/wifi/portal/ab-test?stats=true&id=xxx    — Get conversion stats
 *
 * Note: track-impression and track-conversion are handled by separate route files.
 */

// GET: List A/B tests for a portal
export async function GET(request: NextRequest) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const searchParams = request.nextUrl.searchParams;
    const portalId = searchParams.get('portalId');
    const stats = searchParams.get('stats');
    const id = searchParams.get('id');

    // Single test stats
    if (id && stats === 'true') {
      const test = await db.portalABTest.findUnique({ where: { id } });
      if (!test) {
        return NextResponse.json({ success: false, error: 'Test not found' }, { status: 404 });
      }
      const totalConversions = test.conversionsA + test.conversionsB;
      const totalImpressions = test.impressionsA + test.impressionsB;
      return NextResponse.json({
        success: true,
        data: {
          ...test,
          totalConversions,
          totalImpressions,
          conversionRateA: test.impressionsA > 0 ? ((test.conversionsA / test.impressionsA) * 100).toFixed(2) : '0.00',
          conversionRateB: test.impressionsB > 0 ? ((test.conversionsB / test.impressionsB) * 100).toFixed(2) : '0.00',
          createdAt: test.createdAt.toISOString(),
          updatedAt: test.updatedAt.toISOString(),
          startDate: test.startDate.toISOString(),
          endDate: test.endDate?.toISOString() || null,
        },
      });
    }

    if (!portalId) {
      return NextResponse.json({ success: false, error: 'portalId is required' }, { status: 400 });
    }

    const tests = await db.portalABTest.findMany({
      where: { portalId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({
      success: true,
      data: tests.map((t) => ({
        id: t.id,
        portalId: t.portalId,
        name: t.name,
        designA: t.designA,
        designB: t.designB,
        trafficSplit: t.trafficSplit,
        status: t.status,
        conversionsA: t.conversionsA,
        conversionsB: t.conversionsB,
        impressionsA: t.impressionsA,
        impressionsB: t.impressionsB,
        startDate: t.startDate.toISOString(),
        endDate: t.endDate?.toISOString() || null,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error('[ABTest] GET error:', err);
    return NextResponse.json({ success: false, error: 'Failed to fetch A/B tests' }, { status: 500 });
  }
}

// POST: Create a new A/B test
export async function POST(request: NextRequest) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const body = await request.json();
    const { portalId, name, designA, designB, trafficSplit, status, startDate, endDate } = body as {
      portalId: string;
      name: string;
      designA: Record<string, unknown>;
      designB: Record<string, unknown>;
      trafficSplit?: number;
      status?: string;
      startDate?: string;
      endDate?: string;
    };

    if (!portalId || !name || !designA || !designB) {
      return NextResponse.json({ success: false, error: 'portalId, name, designA, and designB are required' }, { status: 400 });
    }

    const test = await db.portalABTest.create({
      data: {
        portalId,
        name,
        designA: JSON.parse(JSON.stringify(designA)),
        designB: JSON.parse(JSON.stringify(designB)),
        trafficSplit: trafficSplit || 50,
        status: status || 'active',
        startDate: startDate ? new Date(startDate) : new Date(),
        endDate: endDate ? new Date(endDate) : null,
      },
    });

    logWifi(request, 'create', 'portal_ab_test', test.id).catch(() => {});
    return NextResponse.json({
      success: true,
      data: {
        ...test,
        createdAt: test.createdAt.toISOString(),
        updatedAt: test.updatedAt.toISOString(),
        startDate: test.startDate.toISOString(),
        endDate: test.endDate?.toISOString() || null,
      },
    });
  } catch (err) {
    console.error('[ABTest] POST error:', err);
    return NextResponse.json({ success: false, error: 'Failed to create A/B test' }, { status: 500 });
  }
}

// PUT: Update test (pause/resume/stop)
export async function PUT(request: NextRequest) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
    }

    const body = await request.json();
    const { status, name, trafficSplit, designA, designB, endDate } = body as {
      status?: string;
      name?: string;
      trafficSplit?: number;
      designA?: Record<string, unknown>;
      designB?: Record<string, unknown>;
      endDate?: string | null;
    };

    const updateData: Record<string, unknown> = {};
    if (status) updateData.status = status;
    if (status === 'stopped' && !endDate) updateData.endDate = new Date();
    if (name) updateData.name = name;
    if (trafficSplit !== undefined) updateData.trafficSplit = trafficSplit;
    if (designA) updateData.designA = JSON.parse(JSON.stringify(designA));
    if (designB) updateData.designB = JSON.parse(JSON.stringify(designB));
    if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;

    const test = await db.portalABTest.update({
      where: { id },
      data: updateData,
    });

    logWifi(request, 'update', 'portal_ab_test', id).catch(() => {});
    return NextResponse.json({
      success: true,
      data: {
        ...test,
        createdAt: test.createdAt.toISOString(),
        updatedAt: test.updatedAt.toISOString(),
        startDate: test.startDate.toISOString(),
        endDate: test.endDate?.toISOString() || null,
      },
    });
  } catch (err) {
    console.error('[ABTest] PUT error:', err);
    return NextResponse.json({ success: false, error: 'Failed to update A/B test' }, { status: 500 });
  }
}

// DELETE: Remove an A/B test
export async function DELETE(request: NextRequest) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
    }

    await db.portalABTest.delete({ where: { id } });

    logWifi(request, 'delete', 'portal_ab_test', id).catch(() => {});
    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (err) {
    console.error('[ABTest] DELETE error:', err);
    return NextResponse.json({ success: false, error: 'Failed to delete A/B test' }, { status: 500 });
  }
}
