import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth/tenant-context';

/**
 * Design History API — Feature #13: Template Versioning
 *
 * GET  /api/wifi/portal/design-history?portalId=xxx  — List history entries (max 50)
 * POST /api/wifi/portal/design-history                   — Save a new design snapshot
 * DELETE /api/wifi/portal/design-history?id=xxx         — Delete a specific entry
 */

// GET: List design history entries for a portal
export async function GET(request: NextRequest) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const searchParams = request.nextUrl.searchParams;
    const portalId = searchParams.get('portalId');

    if (!portalId) {
      return NextResponse.json({ success: false, error: 'portalId is required' }, { status: 400 });
    }

    const entries = await db.portalDesignHistory.findMany({
      where: {
        portalId,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        portalId: true,
        portalPageId: true,
        name: true,
        description: true,
        designSettings: true,
        createdBy: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: entries.map((e) => ({
        ...e,
        createdAt: e.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error('[DesignHistory] GET error:', err);
    return NextResponse.json({ success: false, error: 'Failed to fetch design history' }, { status: 500 });
  }
}

// POST: Save a new design snapshot
export async function POST(request: NextRequest) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const body = await request.json();
    const { portalId, portalPageId, name, description, designSettings } = body as {
      portalId: string;
      portalPageId?: string;
      name: string;
      description?: string;
      designSettings: Record<string, unknown>;
    };

    if (!portalId || !name) {
      return NextResponse.json({ success: false, error: 'portalId and name are required' }, { status: 400 });
    }

    if (!designSettings || typeof designSettings !== 'object') {
      return NextResponse.json({ success: false, error: 'designSettings must be a valid object' }, { status: 400 });
    }

    const entry = await db.portalDesignHistory.create({
      data: {
        portalId,
        portalPageId: portalPageId || null,
        name,
        description: description || null,
        designSettings: JSON.parse(JSON.stringify(designSettings)),
        createdBy: user.userId || null,
      },
    });

    logWifi(request, 'create', 'portal_design', entry.id).catch(() => {});
    return NextResponse.json({
      success: true,
      data: {
        ...entry,
        createdAt: entry.createdAt.toISOString(),
      },
    });
  } catch (err) {
    console.error('[DesignHistory] POST error:', err);
    return NextResponse.json({ success: false, error: 'Failed to save design snapshot' }, { status: 500 });
  }
}

// DELETE: Remove a design history entry
export async function DELETE(request: NextRequest) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
    }

    await db.portalDesignHistory.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (err) {
    console.error('[DesignHistory] DELETE error:', err);
    return NextResponse.json({ success: false, error: 'Failed to delete design snapshot' }, { status: 500 });
  }
}
