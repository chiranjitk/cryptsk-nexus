import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth/tenant-context';
import { logWifi } from '@/lib/audit';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/wifi/portal/mappings/[id] - Get single portal mapping
export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const { id } = await params;

    const mapping = await db.portalMapping.findFirst({
// REMOVED:       where: { id, tenantId: user.tenantId },
      include: {
        captivePortal: {
          select: { id: true, name: true },
        },
        property: {
          select: { id: true, name: true },
        },
      },
    });

    if (!mapping) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Portal mapping not found' } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: mapping });
  } catch (error) {
    console.error('Error fetching portal mapping:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch portal mapping' } },
      { status: 500 }
    );
  }
}

// PUT /api/wifi/portal/mappings/[id] - Update portal mapping
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await db.portalMapping.findFirst({
// REMOVED:       where: { id, tenantId: user.tenantId },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Portal mapping not found' } },
        { status: 404 }
      );
    }

    const {
      portalId, vlanId, vlanConfigId, ssid, subnet, priority,
      fallbackPortalId, enabled, ipPoolId,
    } = body;

    // If portalId is being changed, validate the new portal belongs to same tenant
    if (portalId !== undefined && portalId !== existing.portalId) {
      const newPortal = await db.captivePortal.findFirst({
// REMOVED:         where: { id: portalId, tenantId: user.tenantId },
      });
      if (!newPortal) {
        return NextResponse.json(
          { success: false, error: { code: 'NOT_FOUND', message: 'Target portal not found' } },
          { status: 404 }
        );
      }
    }

    // Validate UUID format for all UUID fields to prevent DB type cast errors
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const uuidFields = { portalId, fallbackPortalId, vlanConfigId, ipPoolId };
    for (const [field, value] of Object.entries(uuidFields)) {
      if (value !== undefined && value !== null && !UUID_REGEX.test(value)) {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: `Invalid UUID format for field: ${field}` } },
          { status: 400 }
        );
      }
    }

    const mapping = await db.portalMapping.update({
      where: { id },
      data: {
        ...(portalId !== undefined && { portalId }),
        ...(vlanId !== undefined && { vlanId: vlanId ? parseInt(vlanId, 10) : null }),
        ...(vlanConfigId !== undefined && { vlanConfigId }),
        ...(ssid !== undefined && { ssid }),
        ...(subnet !== undefined && { subnet }),
        ...(ipPoolId !== undefined && { ipPoolId: ipPoolId || null }),
        ...(priority !== undefined && { priority: parseInt(priority, 10) }),
        ...(fallbackPortalId !== undefined && { fallbackPortalId }),
        ...(enabled !== undefined && { enabled }),
      },
    });

    logWifi(request, 'update', 'portal_mapping', id).catch(() => {});
    return NextResponse.json({ success: true, data: mapping });
  } catch (error) {
    console.error('Error updating portal mapping:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update portal mapping' } },
      { status: 500 }
    );
  }
}

// DELETE /api/wifi/portal/mappings/[id] - Delete portal mapping
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const { id } = await params;

    const existing = await db.portalMapping.findFirst({
// REMOVED:       where: { id, tenantId: user.tenantId },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Portal mapping not found' } },
        { status: 404 }
      );
    }

    await db.portalMapping.delete({ where: { id } });

    logWifi(request, 'delete', 'portal_mapping', id).catch(() => {});
    return NextResponse.json({
      success: true,
      message: 'Portal mapping deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting portal mapping:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete portal mapping' } },
      { status: 500 }
    );
  }
}
