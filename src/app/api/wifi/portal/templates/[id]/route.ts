import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth/tenant-context';
import { logWifi } from '@/lib/audit';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/wifi/portal/templates/[id] - Get single portal template
export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const { id } = await params;

    const template = await db.portalTemplate.findFirst({
      where: { id},
    });

    if (!template) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Portal template not found' } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: template });
  } catch (error) {
    console.error('Error fetching portal template:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch portal template' } },
      { status: 500 }
    );
  }
}

// PUT /api/wifi/portal/templates/[id] - Update portal template
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await db.portalTemplate.findFirst({
      where: { id},
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Portal template not found' } },
        { status: 404 }
      );
    }

    // Prevent modification of built-in templates
    if (existing.isBuiltIn) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Cannot modify built-in templates' } },
        { status: 403 }
      );
    }

    const { name, description, category, thumbnail, htmlContent, cssContent } = body;

    const template = await db.portalTemplate.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(category !== undefined && { category }),
        ...(thumbnail !== undefined && { thumbnail }),
        ...(htmlContent !== undefined && { htmlContent }),
        ...(cssContent !== undefined && { cssContent }),
      },
    });

    logWifi(request, 'update', 'portal_template', id).catch(() => {});
    return NextResponse.json({ success: true, data: template });
  } catch (error) {
    console.error('Error updating portal template:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update portal template' } },
      { status: 500 }
    );
  }
}

// DELETE /api/wifi/portal/templates/[id] - Delete portal template
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const { id } = await params;

    const existing = await db.portalTemplate.findFirst({
      where: { id},
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Portal template not found' } },
        { status: 404 }
      );
    }

    // Prevent deletion of built-in templates
    if (existing.isBuiltIn) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Cannot delete built-in templates' } },
        { status: 403 }
      );
    }

    await db.portalTemplate.delete({ where: { id } });

    logWifi(request, 'delete', 'portal_template', id).catch(() => {});
    return NextResponse.json({
      success: true,
      message: 'Portal template deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting portal template:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete portal template' } },
      { status: 500 }
    );
  }
}
