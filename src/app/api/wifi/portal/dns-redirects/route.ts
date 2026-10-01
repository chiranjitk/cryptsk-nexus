import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth/tenant-context';
import { regenerateDnsConfig } from '@/lib/dns/generator';

// GET /api/wifi/portal/dns-redirects - List DNS redirect rules
export async function GET(request: NextRequest) {
  const user = await requirePermission(request, 'network.manage');
  if (user instanceof NextResponse) return user;

  try {
    const searchParams = request.nextUrl.searchParams;
    const partnerId = searchParams.get('partnerId');
    const applyTo = searchParams.get('applyTo');
    const enabled = searchParams.get('enabled');
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');

// REMOVED:     const where: Record<string, unknown> = { tenantId: user.tenantId };

    if (partnerId) where.partnerId = partnerId;
    if (applyTo) where.applyTo = applyTo;
    if (enabled !== null && enabled !== undefined && enabled !== '') {
      where.enabled = enabled === 'true';
    }

    const redirects = await db.dnsRedirectRule.findMany({
      where,
      include: {
        property: {
          select: { id: true, name: true },
        },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      ...(limit && { take: parseInt(limit, 10) }),
      ...(offset && { skip: parseInt(offset, 10) }),
    });

    const total = await db.dnsRedirectRule.count({ where });

    return NextResponse.json({
      success: true,
      data: redirects,
      pagination: {
        total,
        limit: limit ? parseInt(limit, 10) : null,
        offset: offset ? parseInt(offset, 10) : null,
      },
    });
  } catch (error) {
    console.error('Error fetching DNS redirect rules:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch DNS redirect rules' } },
      { status: 500 }
    );
  }
}

// POST /api/wifi/portal/dns-redirects - Create DNS redirect rule
export async function POST(request: NextRequest) {
  const user = await requirePermission(request, 'network.manage');
  if (user instanceof NextResponse) return user;

  try {
    const body = await request.json();
// REMOVED:     const tenantId = user.tenantId;

    const {
      partnerId,
      name,
      matchPattern,
      targetIp,
      targetUrl,
      autoDnsmasq,
      applyTo = 'unauthenticated',
      priority = 0,
      enabled = true,
      description,
    } = body;

    if (!partnerId || !name || !matchPattern || !targetIp) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing required fields: partnerId, name, matchPattern, targetIp' } },
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

    const redirect = await db.dnsRedirectRule.create({
      data: {
// REMOVED:         tenantId,
        partnerId,
        name,
        matchPattern,
        targetIp,
        targetUrl: targetUrl ?? null,
        autoDnsmasq: autoDnsmasq !== undefined ? Boolean(autoDnsmasq) : true,
        applyTo,
        priority: parseInt(priority, 10),
        enabled,
        description,
      },
    });

    // Regenerate dnsmasq config (fire-and-forget)
    regenerateDnsConfig().catch(() => {});

    return NextResponse.json({ success: true, data: redirect }, { status: 201 });
  } catch (error) {
    console.error('Error creating DNS redirect rule:', error);
    logWifi(request, 'create', 'portal_dns_redirect', redirect.id).catch(() => {});
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create DNS redirect rule' } },
      { status: 500 }
    );
  }
}
