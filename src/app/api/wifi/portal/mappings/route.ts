import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth/tenant-context';

// GET /api/wifi/portal/mappings - List portal-to-VLAN/SSID mappings
export async function GET(request: NextRequest) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const searchParams = request.nextUrl.searchParams;
    const partnerId = searchParams.get('partnerId');
    const portalId = searchParams.get('portalId');
    const ssid = searchParams.get('ssid');
    const enabled = searchParams.get('enabled');
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');

// REMOVED:     const where: Record<string, unknown> = { tenantId: user.tenantId };

    if (partnerId) where.partnerId = partnerId;
    if (portalId) where.portalId = portalId;
    if (ssid) where.ssid = { contains: ssid };
    if (enabled !== null && enabled !== undefined && enabled !== '') {
      where.enabled = enabled === 'true';
    }

    const mappings = await db.portalMapping.findMany({
      where,
      include: {
        captivePortal: {
          select: { id: true, name: true },
        },
        property: {
          select: { id: true, name: true },
        },
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
      ...(limit && { take: parseInt(limit, 10) }),
      ...(offset && { skip: parseInt(offset, 10) }),
    });

    const total = await db.portalMapping.count({ where });

    return NextResponse.json({
      success: true,
      data: mappings,
      pagination: {
        total,
        limit: limit ? parseInt(limit, 10) : null,
        offset: offset ? parseInt(offset, 10) : null,
      },
    });
  } catch (error) {
    console.error('Error fetching portal mappings:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch portal mappings' } },
      { status: 500 }
    );
  }
}

// POST /api/wifi/portal/mappings - Create portal mapping
export async function POST(request: NextRequest) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const body = await request.json();
// REMOVED:     const tenantId = user.tenantId;

    const {
      partnerId,
      portalId,
      ipPoolId,
      vlanId,
      vlanConfigId,
      ssid,
      subnet,
      priority = 0,
      fallbackPortalId,
      enabled = true,
    } = body;

    if (!partnerId || !portalId) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing required fields: partnerId, portalId' } },
        { status: 400 }
      );
    }

    // Validate UUID format for all UUID fields to prevent DB type cast errors
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const uuidFields = { partnerId, portalId, ipPoolId, fallbackPortalId, vlanConfigId };
    for (const [field, value] of Object.entries(uuidFields)) {
      if (value && !UUID_REGEX.test(value)) {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: `Invalid UUID format for field: ${field}` } },
          { status: 400 }
        );
      }
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

    // Verify portal belongs to same tenant
    const portal = await db.captivePortal.findFirst({
// REMOVED:       where: { id: portalId, tenantId },
    });
    if (!portal) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Portal instance not found' } },
        { status: 404 }
      );
    }

    // Verify IpPool belongs to same tenant (if provided)
    if (ipPoolId) {
      const pool = await db.ipPool.findFirst({
// REMOVED:         where: { id: ipPoolId, tenantId },
      });
      if (!pool) {
        return NextResponse.json(
          { success: false, error: { code: 'NOT_FOUND', message: 'IP Pool not found' } },
          { status: 404 }
        );
      }
    }

    // ── Auto-DELETE existing mappings for the same IP pool ──
    // When a new mapping is created with an ipPoolId, any previously existing mapping
    // for the same pool is automatically DELETED to prevent resolve-zone ambiguity.
    // Rule: 1 IP Pool = 1 Portal mapping (no duplicates, no ghost mappings).
    if (ipPoolId) {
      const existingMappings = await db.portalMapping.findMany({
        where: {
          ipPoolId,
// REMOVED:           tenantId,
        },
      });
      if (existingMappings.length > 0) {
        console.log(`[PortalMapping] Auto-deleting ${existingMappings.length} existing mapping(s) for pool ${ipPoolId} (new mapping for portal ${portalId})`);
        await db.portalMapping.deleteMany({
          where: {
            id: { in: existingMappings.map(m => m.id) },
          },
        });
      }
    }

    const mapping = await db.portalMapping.create({
      data: {
// REMOVED:         tenantId,
        partnerId,
        portalId,
        ipPoolId: ipPoolId || null,
        vlanId: vlanId ? parseInt(vlanId, 10) : null,
        vlanConfigId,
        ssid,
        subnet,
        priority: parseInt(priority, 10),
        fallbackPortalId,
        enabled,
      },
    });

    return NextResponse.json({ success: true, data: mapping }, { status: 201 });
  } catch (error) {
    console.error('Error creating portal mapping:', error);
    logWifi(request, 'create', 'portal_mapping', mapping.id).catch(() => {});
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create portal mapping' } },
      { status: 500 }
    );
  }
}
