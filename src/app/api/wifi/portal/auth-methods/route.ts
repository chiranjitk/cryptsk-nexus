import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth/tenant-context';

// GET /api/wifi/portal/auth-methods - List portal authentication methods
export async function GET(request: NextRequest) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const searchParams = request.nextUrl.searchParams;
    const partnerId = searchParams.get('partnerId');
    const portalId = searchParams.get('portalId');
    const method = searchParams.get('method');
    const enabled = searchParams.get('enabled');
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');

    const where: Record<string, unknown> = { };

    if (partnerId) where.partnerId = partnerId;
    if (portalId) where.portalId = portalId;
    if (method) where.method = method;
    if (enabled !== null && enabled !== undefined && enabled !== '') {
      where.enabled = enabled === 'true';
    }

    const authMethods = await db.portalAuthentication.findMany({
      where,
      include: {
        captivePortal: {
          select: { id: true, name: true },
        },
        partner: {
          select: { id: true, name: true },
        },
      },
      orderBy: [
        { priority: 'asc' },
        { createdAt: 'desc' },
      ],
      ...(limit && { take: parseInt(limit, 10) }),
      ...(offset && { skip: parseInt(offset, 10) }),
    });

    const total = await db.portalAuthentication.count({ where });

    return NextResponse.json({
      success: true,
      data: authMethods,
      pagination: {
        total,
        limit: limit ? parseInt(limit, 10) : null,
        offset: offset ? parseInt(offset, 10) : null,
      },
    });
  } catch (error) {
    console.error('Error fetching portal auth methods:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch portal auth methods' } },
      { status: 500 }
    );
  }
}

// POST /api/wifi/portal/auth-methods - Create portal authentication method
export async function POST(request: NextRequest) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const body = await request.json();
    // tenantId removed (single-tenant)

    const {
      partnerId,
      portalId,
      method = 'voucher',
      enabled = true,
      priority = 0,
      config = '{}',
    } = body;

    if (!portalId) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing required field: portalId' } },
        { status: 400 }
      );
    }

    // Verify portal belongs to same tenant
    const portal = await db.captivePortal.findFirst({
      where: { id: portalId},
    });
    if (!portal) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Portal instance not found' } },
        { status: 404 }
      );
    }

    // Resolve partnerId: prefer body value, fallback to portal's partnerId
    const resolvedPropertyId = partnerId || portal.partnerId;
    if (!resolvedPropertyId) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Cannot determine property for this portal' } },
        { status: 400 }
      );
    }

    // Verify property belongs to tenant — if not found, try auto-resolving from tenant
    let property = await db.partner.findFirst({
      where: { id: resolvedPropertyId},
    });
    if (!property) {
      // Fallback: use portal's own partnerId (always correct since portal belongs to tenant)
      property = await db.partner.findFirst({
        where: { id: portal.partnerId},
      });
      if (!property) {
        console.error(`[auth-methods POST] Partner not found. body.partnerId=${partnerId}, portal.partnerId=${portal.partnerId}, tenantId=${tenantId}`);
        return NextResponse.json(
          { success: false, error: { code: 'NOT_FOUND', message: 'Partner not found' } },
          { status: 404 }
        );
      }
    }

    // Check for duplicate method on same portal (unique constraint)
    const existingAuth = await db.portalAuthentication.findFirst({
      where: { portalId, method},
    });
    if (existingAuth) {
      return NextResponse.json(
        { success: false, error: { code: 'DUPLICATE_METHOD', message: `Auth method '${method}' already exists for this portal` } },
        { status: 400 }
      );
    }

    const authMethod = await db.portalAuthentication.create({
      data: {

        partnerId: partner.id, // Use the verified property ID (may differ from body if fallback resolved)
        portalId,
        method,
        enabled,
        priority: parseInt(priority, 10),
        config: typeof config === 'string' ? config : JSON.stringify(config),
      },
    });

    return NextResponse.json({ success: true, data: authMethod }, { status: 201 });
  } catch (error) {
    console.error('Error creating portal auth method:', error);
    logWifi(request, 'create', 'portal_auth_method', authMethod.id).catch(() => {});
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create portal auth method' } },
      { status: 500 }
    );
  }
}
