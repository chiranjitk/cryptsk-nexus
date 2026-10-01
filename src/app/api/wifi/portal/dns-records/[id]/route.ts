import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth/tenant-context';
import { regenerateDnsConfig } from '@/lib/dns/generator';
import { logWifi } from '@/lib/audit';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/wifi/portal/dns-records/[id] - Get single DNS record
export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await requirePermission(request, 'network.manage');
  if (user instanceof NextResponse) return user;

  try {
    const { id } = await params;

    const record = await db.dnsRecord.findFirst({
// REMOVED:       where: { id, tenantId: user.tenantId },
      include: {
        dnsZone: {
          select: { id: true, domain: true, partnerId: true },
        },
      },
    });

    if (!record) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'DNS record not found' } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: record });
  } catch (error) {
    console.error('Error fetching DNS record:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch DNS record' } },
      { status: 500 }
    );
  }
}

// PUT /api/wifi/portal/dns-records/[id] - Update DNS record
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const user = await requirePermission(request, 'network.manage');
  if (user instanceof NextResponse) return user;

  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await db.dnsRecord.findFirst({
// REMOVED:       where: { id, tenantId: user.tenantId },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'DNS record not found' } },
        { status: 404 }
      );
    }

    const { name, type, value, ttl, priority, enabled } = body;

    // If changing name or type, check for duplicates
    if (name || type) {
      const newName = name || existing.name;
      const newType = type || existing.type;
      if (newName !== existing.name || newType !== existing.type) {
        const duplicate = await db.dnsRecord.findFirst({
          where: { zoneId: existing.zoneId, name: newName, type: newType },
        });
        if (duplicate) {
          return NextResponse.json(
            { success: false, error: { code: 'DUPLICATE_RECORD', message: `A ${newType} record for '${newName}' already exists in this zone` } },
            { status: 400 }
          );
        }
      }
    }

    const record = await db.dnsRecord.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(type !== undefined && { type }),
        ...(value !== undefined && { value }),
        ...(ttl !== undefined && { ttl: parseInt(ttl, 10) }),
        ...(priority !== undefined && { priority: priority !== null ? parseInt(priority, 10) : null }),
        ...(enabled !== undefined && { enabled }),
      },
    });

    // Regenerate dnsmasq config (fire-and-forget)
    regenerateDnsConfig().catch(() => {});

    logWifi(request, 'update', 'portal_dns_record', id).catch(() => {});
    return NextResponse.json({ success: true, data: record });
  } catch (error) {
    console.error('Error updating DNS record:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update DNS record' } },
      { status: 500 }
    );
  }
}

// DELETE /api/wifi/portal/dns-records/[id] - Delete DNS record
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const user = await requirePermission(request, 'network.manage');
  if (user instanceof NextResponse) return user;

  try {
    const { id } = await params;

    const existing = await db.dnsRecord.findFirst({
// REMOVED:       where: { id, tenantId: user.tenantId },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'DNS record not found' } },
        { status: 404 }
      );
    }

    await db.dnsRecord.delete({ where: { id } });

    // Regenerate dnsmasq config (fire-and-forget)
    regenerateDnsConfig().catch(() => {});

    logWifi(request, 'delete', 'portal_dns_record', id).catch(() => {});
    return NextResponse.json({
      success: true,
      message: 'DNS record deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting DNS record:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete DNS record' } },
      { status: 500 }
    );
  }
}
