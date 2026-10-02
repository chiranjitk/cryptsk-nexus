import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth/tenant-context';
import { regenerateDnsConfig } from '@/lib/dns/generator';
import { logWifi } from '@/lib/audit';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/wifi/portal/dns-zones/[id] - Get single DNS zone with records
export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await requirePermission(request, 'network.manage');
  if (user instanceof NextResponse) return user;

  try {
    const { id } = await params;

    const zone = await db.dnsZone.findFirst({
      where: { id},
      include: {
        records: {
          orderBy: [{ type: 'asc' }, { name: 'asc' }],
        },
        property: {
          select: { id: true, name: true },
        },
      },
    });

    if (!zone) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'DNS zone not found' } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: zone });
  } catch (error) {
    console.error('Error fetching DNS zone:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch DNS zone' } },
      { status: 500 }
    );
  }
}

// PUT /api/wifi/portal/dns-zones/[id] - Update DNS zone
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const user = await requirePermission(request, 'network.manage');
  if (user instanceof NextResponse) return user;

  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await db.dnsZone.findFirst({
      where: { id},
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'DNS zone not found' } },
        { status: 404 }
      );
    }

    const { domain, description, vlanId, enabled } = body;

    // If changing domain, check for duplicates
    if (domain && domain !== existing.domain) {
      const duplicate = await db.dnsZone.findFirst({
        where: { partnerId: existing.partnerId, domain },
      });
      if (duplicate) {
        return NextResponse.json(
          { success: false, error: { code: 'DUPLICATE_DOMAIN', message: `DNS zone for domain '${domain}' already exists for this property` } },
          { status: 400 }
        );
      }
    }

    const zone = await db.dnsZone.update({
      where: { id },
      data: {
        ...(domain !== undefined && { domain }),
        ...(description !== undefined && { description }),
        ...(vlanId !== undefined && { vlanId: vlanId ? parseInt(vlanId, 10) : null }),
        ...(enabled !== undefined && { enabled }),
      },
    });

    // Regenerate dnsmasq config (fire-and-forget)
    regenerateDnsConfig().catch(() => {});

    logWifi(request, 'update', 'portal_dns_zone', id).catch(() => {});
    return NextResponse.json({ success: true, data: zone });
  } catch (error) {
    console.error('Error updating DNS zone:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update DNS zone' } },
      { status: 500 }
    );
  }
}

// DELETE /api/wifi/portal/dns-zones/[id] - Delete DNS zone (cascades to records)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const user = await requirePermission(request, 'network.manage');
  if (user instanceof NextResponse) return user;

  try {
    const { id } = await params;

    const existing = await db.dnsZone.findFirst({
      where: { id},
      include: {
        _count: {
          select: { records: true },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'DNS zone not found' } },
        { status: 404 }
      );
    }

    // Cascade delete will remove all associated records
    await db.dnsZone.delete({ where: { id } });

    // Regenerate dnsmasq config (fire-and-forget)
    regenerateDnsConfig().catch(() => {});

    logWifi(request, 'delete', 'portal_dns_zone', id).catch(() => {});
    return NextResponse.json({
      success: true,
      message: `DNS zone deleted (including ${existing._count.records} records)`,
    });
  } catch (error) {
    console.error('Error deleting DNS zone:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete DNS zone' } },
      { status: 500 }
    );
  }
}
