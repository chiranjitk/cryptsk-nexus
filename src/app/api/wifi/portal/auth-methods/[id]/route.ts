import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth/tenant-context';
import { logWifi } from '@/lib/audit';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/wifi/portal/auth-methods/[id] - Get single auth method
export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const { id } = await params;

    const authMethod = await db.portalAuthentication.findFirst({
      where: { id},
      include: {
        captivePortal: {
          select: { id: true, name: true },
        },
        property: {
          select: { id: true, name: true },
        },
      },
    });

    if (!authMethod) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Auth method not found' } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: authMethod });
  } catch (error) {
    console.error('Error fetching auth method:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch auth method' } },
      { status: 500 }
    );
  }
}

// PUT /api/wifi/portal/auth-methods/[id] - Update auth method
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await db.portalAuthentication.findFirst({
      where: { id},
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Auth method not found' } },
        { status: 404 }
      );
    }

    const { enabled, priority, config } = body;

    const authMethod = await db.portalAuthentication.update({
      where: { id },
      data: {
        ...(enabled !== undefined && { enabled }),
        ...(priority !== undefined && { priority: parseInt(priority, 10) }),
        ...(config !== undefined && { config: typeof config === 'string' ? config : JSON.stringify(config) }),
      },
    });

    logWifi(request, 'update', 'portal_auth_method', id).catch(() => {});
    return NextResponse.json({ success: true, data: authMethod });
  } catch (error) {
    console.error('Error updating auth method:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update auth method' } },
      { status: 500 }
    );
  }
}

// DELETE /api/wifi/portal/auth-methods/[id] - Delete auth method
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const { id } = await params;

    const existing = await db.portalAuthentication.findFirst({
      where: { id},
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Auth method not found' } },
        { status: 404 }
      );
    }

    await db.portalAuthentication.delete({ where: { id } });

    logWifi(request, 'delete', 'portal_auth_method', id).catch(() => {});
    return NextResponse.json({
      success: true,
      message: 'Auth method deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting auth method:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete auth method' } },
      { status: 500 }
    );
  }
}
