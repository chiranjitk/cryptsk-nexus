import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth/tenant-context';
import { regenerateDnsConfig } from '@/lib/dns/generator';

// GET /api/wifi/portal/dns-records - List DNS records
export async function GET(request: NextRequest) {
  const user = await requirePermission(request, 'network.manage');
  if (user instanceof NextResponse) return user;

  try {
    const searchParams = request.nextUrl.searchParams;
    const zoneId = searchParams.get('zoneId');
    const type = searchParams.get('type');
    const name = searchParams.get('name');
    const enabled = searchParams.get('enabled');
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');

// REMOVED:     const where: Record<string, unknown> = { tenantId: user.tenantId };

    if (zoneId) where.zoneId = zoneId;
    if (type) where.type = type;
    if (name) where.name = { contains: name };
    if (enabled !== null && enabled !== undefined && enabled !== '') {
      where.enabled = enabled === 'true';
    }

    const records = await db.dnsRecord.findMany({
      where,
      include: {
        dnsZone: {
          select: { id: true, domain: true },
        },
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      ...(limit && { take: parseInt(limit, 10) }),
      ...(offset && { skip: parseInt(offset, 10) }),
    });

    const total = await db.dnsRecord.count({ where });

    return NextResponse.json({
      success: true,
      data: records,
      pagination: {
        total,
        limit: limit ? parseInt(limit, 10) : null,
        offset: offset ? parseInt(offset, 10) : null,
      },
    });
  } catch (error) {
    console.error('Error fetching DNS records:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch DNS records' } },
      { status: 500 }
    );
  }
}

// POST /api/wifi/portal/dns-records - Create DNS record
export async function POST(request: NextRequest) {
  const user = await requirePermission(request, 'network.manage');
  if (user instanceof NextResponse) return user;

  try {
    const body = await request.json();
// REMOVED:     const tenantId = user.tenantId;

    const {
      zoneId,
      name,
      type = 'A',
      value,
      ttl = 300,
      priority,
      enabled = true,
    } = body;

    if (!zoneId || !name || !value) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing required fields: zoneId, name, value' } },
        { status: 400 }
      );
    }

    // Verify zone belongs to tenant
    const zone = await db.dnsZone.findFirst({
// REMOVED:       where: { id: zoneId, tenantId },
    });
    if (!zone) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'DNS zone not found' } },
        { status: 404 }
      );
    }

    // Check for duplicate record (zoneId + name + type unique constraint)
    const existingRecord = await db.dnsRecord.findFirst({
      where: { zoneId, name, type },
    });
    if (existingRecord) {
      return NextResponse.json(
        { success: false, error: { code: 'DUPLICATE_RECORD', message: `A ${type} record for '${name}' already exists in this zone` } },
        { status: 400 }
      );
    }

    const record = await db.dnsRecord.create({
      data: {
// REMOVED:         tenantId,
        zoneId,
        name,
        type,
        value,
        ttl: parseInt(ttl, 10),
        priority: priority !== undefined ? parseInt(priority, 10) : null,
        enabled,
      },
    });

    // Regenerate dnsmasq config (fire-and-forget)
    regenerateDnsConfig().catch(() => {});

    return NextResponse.json({ success: true, data: record }, { status: 201 });
  } catch (error) {
    console.error('Error creating DNS record:', error);
    logWifi(request, 'create', 'portal_dns_record', record.id).catch(() => {});
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create DNS record' } },
      { status: 500 }
    );
  }
}
