import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth/tenant-context';

// GET /api/wifi/portal/instances — List all captive portal instances
export async function GET(request: NextRequest) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const searchParams = request.nextUrl.searchParams;
    const partnerId = searchParams.get('partnerId');
    const search = searchParams.get('search');
    const enabled = searchParams.get('enabled');

    const where: Record<string, unknown> = {};
    if (partnerId) where.partnerId = partnerId;
    if (enabled !== null && enabled !== undefined && enabled !== '') {
      where.enabled = enabled === 'true';
    }
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } },
      ];
    }

    // Simple query — NO includes to avoid Prisma relation errors
    const instances = await db.captivePortal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const total = await db.captivePortal.count({ where });
    const activeCount = await db.captivePortal.count({ where: { ...where, enabled: true } });

    // Resolve partner names separately (avoids Prisma include issues)
    const partnerIds = [...new Set(instances.map((i: any) => i.partnerId).filter(Boolean))];
    const partners = partnerIds.length > 0
      ? await db.partner.findMany({ where: { id: { in: partnerIds } }, select: { id: true, name: true } })
      : [];
    const partnerMap = new Map(partners.map((p: any) => [p.id, p.name]));

    const data = instances.map((instance: any) => ({
      ...instance,
      partnerName: instance.partnerId ? (partnerMap.get(instance.partnerId) || 'Unknown') : 'Default',
    }));

    return NextResponse.json({
      success: true,
      data,
      total,
      activeCount,
    });
  } catch (error: any) {
    console.error('[PortalInstances] GET error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: error.message || 'Failed to fetch portal instances' } },
      { status: 500 }
    );
  }
}

// POST /api/wifi/portal/instances — Create new portal instance
export async function POST(request: NextRequest) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const body = await request.json();
    const {
      partnerId,
      name,
      description = '',
      enabled = true,
      maxConcurrent = 1000,
      sessionTimeout = 86400,
      idleTimeout = 3600,
      slug,
      roamingMode = 'auth_origin',
      allowsRoamingFrom = '[]',
      authMethod = 'voucher',
      autoAuthEnabled = true,
      maxBandwidthDown = 5242880,
      maxBandwidthUp = 1048576,
      bandwidthPolicy = 'zone',
      nasIdentifier = '',
      ssidList = '[]',
    } = body;

    if (!partnerId || !name) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing required fields: partnerId, name' } },
        { status: 400 }
      );
    }

    // Resolve partnerId — if 'default' or not a UUID, find the first partner
    let resolvedPartnerId = partnerId;
    if (partnerId === 'default' || partnerId.length !== 36) {
      const firstPartner = await db.partner.findFirst({ select: { id: true } });
      if (!firstPartner) {
        return NextResponse.json(
          { success: false, error: { code: 'NOT_FOUND', message: 'No partner found. Create a partner first.' } },
          { status: 404 }
        );
      }
      resolvedPartnerId = firstPartner.id;
    }

    // Check slug uniqueness
    const existing = await db.captivePortal.findFirst({
      where: { slug: slug || name.toLowerCase().replace(/[^a-z0-9_-]/g, '') },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: 'CONFLICT', message: `Slug "${slug}" already in use` } },
        { status: 409 }
      );
    }

    // Create the portal instance — simple create, no includes
    const newPortal = await db.captivePortal.create({
      data: {
        partnerId: resolvedPartnerId,
        name,
        description,
        enabled,
        maxConcurrent,
        sessionTimeout,
        idleTimeout,
        slug: slug || name.toLowerCase().replace(/[^a-z0-9_-]/g, ''),
        roamingMode,
        allowsRoamingFrom,
        authMethod,
        autoAuthEnabled,
        maxBandwidthDown,
        maxBandwidthUp,
        bandwidthPolicy,
        nasIdentifier,
        ssidList,
      },
    });

    return NextResponse.json({
      success: true,
      data: newPortal,
    }, { status: 201 });
  } catch (error: any) {
    console.error('[PortalInstances] POST error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: error.message || 'Failed to create portal instance' } },
      { status: 500 }
    );
  }
}

// PUT /api/wifi/portal/instances/[id] — Update portal instance
export async function PUT(request: NextRequest) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const body = await request.json();
    const id = new URL(request.url).searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing id parameter' } },
        { status: 400 }
      );
    }

    const updated = await db.captivePortal.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.enabled !== undefined && { enabled: body.enabled }),
        ...(body.slug !== undefined && { slug: body.slug }),
        ...(body.authMethod !== undefined && { authMethod: body.authMethod }),
        ...(body.roamingMode !== undefined && { roamingMode: body.roamingMode }),
        ...(body.autoAuthEnabled !== undefined && { autoAuthEnabled: body.autoAuthEnabled }),
        ...(body.maxConcurrent !== undefined && { maxConcurrent: body.maxConcurrent }),
        ...(body.sessionTimeout !== undefined && { sessionTimeout: body.sessionTimeout }),
        ...(body.idleTimeout !== undefined && { idleTimeout: body.idleTimeout }),
        ...(body.maxBandwidthDown !== undefined && { maxBandwidthDown: body.maxBandwidthDown }),
        ...(body.maxBandwidthUp !== undefined && { maxBandwidthUp: body.maxBandwidthUp }),
        ...(body.bandwidthPolicy !== undefined && { bandwidthPolicy: body.bandwidthPolicy }),
        ...(body.nasIdentifier !== undefined && { nasIdentifier: body.nasIdentifier }),
        ...(body.ssidList !== undefined && { ssidList: body.ssidList }),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('[PortalInstances] PUT error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: error.message || 'Failed to update' } },
      { status: 500 }
    );
  }
}

// DELETE /api/wifi/portal/instances?id=xxx — Delete portal instance
export async function DELETE(request: NextRequest) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing id parameter' } },
        { status: 400 }
      );
    }

    await db.captivePortal.delete({ where: { id } });
    return NextResponse.json({ success: true, message: 'Portal instance deleted' });
  } catch (error: any) {
    console.error('[PortalInstances] DELETE error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: error.message || 'Failed to delete' } },
      { status: 500 }
    );
  }
}
