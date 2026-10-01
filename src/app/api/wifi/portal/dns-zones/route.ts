import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth/tenant-context';
import { regenerateDnsConfig } from '@/lib/dns/generator';

// GET /api/wifi/portal/dns-zones - List DNS zones
export async function GET(request: NextRequest) {
  const user = await requirePermission(request, 'network.manage');
  if (user instanceof NextResponse) return user;

  try {
    const searchParams = request.nextUrl.searchParams;
    const partnerId = searchParams.get('partnerId');
    const enabled = searchParams.get('enabled');
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');

// REMOVED:     const where: Record<string, unknown> = { tenantId: user.tenantId };

    if (partnerId) where.partnerId = partnerId;
    if (enabled !== null && enabled !== undefined && enabled !== '') {
      where.enabled = enabled === 'true';
    }

    const zones = await db.dnsZone.findMany({
      where,
      include: {
        _count: {
          select: { records: true },
        },
        property: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      ...(limit && { take: parseInt(limit, 10) }),
      ...(offset && { skip: parseInt(offset, 10) }),
    });

    const total = await db.dnsZone.count({ where });

    return NextResponse.json({
      success: true,
      data: zones,
      pagination: {
        total,
        limit: limit ? parseInt(limit, 10) : null,
        offset: offset ? parseInt(offset, 10) : null,
      },
    });
  } catch (error) {
    console.error('Error fetching DNS zones:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch DNS zones' } },
      { status: 500 }
    );
  }
}

// POST /api/wifi/portal/dns-zones - Create DNS zone
export async function POST(request: NextRequest) {
  const user = await requirePermission(request, 'network.manage');
  if (user instanceof NextResponse) return user;

  try {
    const body = await request.json();
// REMOVED:     const tenantId = user.tenantId;

    const {
      partnerId,
      domain,
      description,
      vlanId,
      enabled = true,
    } = body;

    if (!partnerId || !domain) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing required fields: partnerId, domain' } },
        { status: 400 }
      );
    }

    // Verify property belongs to tenant
    const property = await db.partner.findFirst({
// REMOVED:       where: { id: partnerId, tenantId },
    });
    if (!property) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Partner not found' } },
        { status: 404 }
      );
    }

    // Check for duplicate domain within property
    const existingZone = await db.dnsZone.findFirst({
      where: { partnerId, domain },
    });
    if (existingZone) {
      return NextResponse.json(
        { success: false, error: { code: 'DUPLICATE_DOMAIN', message: `DNS zone for domain '${domain}' already exists for this property` } },
        { status: 400 }
      );
    }

    const zone = await db.dnsZone.create({
      data: {
// REMOVED:         tenantId,
        partnerId,
        domain,
        description,
        vlanId: vlanId ? parseInt(vlanId, 10) : null,
        enabled,
      },
    });

    // Regenerate dnsmasq config (fire-and-forget)
    regenerateDnsConfig().catch(() => {});

    return NextResponse.json({ success: true, data: zone }, { status: 201 });
  } catch (error) {
    console.error('Error creating DNS zone:', error);
    logWifi(request, 'create', 'portal_dns_zone', zone.id).catch(() => {});
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create DNS zone' } },
      { status: 500 }
    );
  }
}
