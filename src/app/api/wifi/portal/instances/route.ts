import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth/tenant-context';

// GET /api/wifi/portal/instances - List all captive portal instances
export async function GET(request: NextRequest) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const searchParams = request.nextUrl.searchParams;
    const partnerId = searchParams.get('partnerId');
    const enabled = searchParams.get('enabled');
    const search = searchParams.get('search');
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');

    const where: Record<string, unknown> = { };

    if (partnerId) {
      where.partnerId = partnerId;
    }

    if (enabled !== null && enabled !== undefined && enabled !== '') {
      where.enabled = enabled === 'true';
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } },
        { slug: { contains: search } },
      ];
    }

    const instances = await db.captivePortal.findMany({
      where,
      include: {
        _count: {
          select: {
            portalMappings: true,
            authMethods: true,
            portalPages: true,
          },
        },
        property: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      ...(limit && { take: parseInt(limit, 10) }),
      ...(offset && { skip: parseInt(offset, 10) }),
    });

    const total = await db.captivePortal.count({ where });
    const activeCount = await db.captivePortal.count({
      where: { ...where, enabled: true },
    });

    return NextResponse.json({
      success: true,
      data: instances,
      pagination: {
        total,
        limit: limit ? parseInt(limit, 10) : null,
        offset: offset ? parseInt(offset, 10) : null,
      },
      summary: {
        totalInstances: total,
        activeInstances: activeCount,
      },
    });
  } catch (error) {
    console.error('Error fetching portal instances:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch portal instances' } },
      { status: 500 }
    );
  }
}

// POST /api/wifi/portal/instances - Create new portal instance
export async function POST(request: NextRequest) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const body = await request.json();
    // tenantId removed (single-tenant)

    const {
      partnerId,
      name,
      description,
      enabled = true,
      maxConcurrent = 1000,
      sessionTimeout = 86400,
      idleTimeout = 3600,
      redirectUrl,
      successMessage,
      failMessage,
      // Zone-based fields
      slug,
      roamingMode,
      allowsRoamingFrom,
      authMethod,
      autoAuthEnabled,
      maxBandwidthDown,
      maxBandwidthUp,
      bandwidthPolicy,
      nasIdentifier,
      ssidList,
    } = body;

    console.log(`[PortalInstances POST] body:`, { partnerId: partnerId || 'MISSING', name: name || 'MISSING', slug: slug || 'none'});

    if (!partnerId || !name) {
      console.warn('[PortalInstances POST] 400: Missing partnerId or name');
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing required fields: partnerId, name' } },
        { status: 400 }
      );
    }

    // Resolve partnerId: if 'default' or invalid UUID, use tenant's first property
    let resolvedPropertyId = partnerId;
    if (partnerId === 'default' || partnerId.length !== 36) {
      console.log(`[PortalInstances POST] Resolving partnerId from "${partnerId}" for tenant ${tenantId}`);
      const firstPartner = await db.partner.findFirst({
        where: {},
        select: { id: true },
      });
      if (!firstPartner) {
        console.error(`[PortalInstances POST] 404: No property found for tenant ${tenantId}`);
        return NextResponse.json(
          { success: false, error: { code: 'NOT_FOUND', message: 'No property found for this tenant' } },
          { status: 404 }
        );
      }
      resolvedPropertyId = firstPartner.id;
    }

    // Verify property belongs to tenant
    const property = await db.partner.findFirst({
      where: { id: resolvedPropertyId},
    });

    if (!property) {
      console.error(`[PortalInstances POST] 404: Partner ${resolvedPropertyId} not found for tenant ${tenantId}`);
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Partner not found' } },
        { status: 404 }
      );
    }

    // Validate slug format (URL-safe: lowercase, hyphens, underscores, numbers)
    if (slug !== undefined) {
      const slugRegex = /^[a-z0-9][a-z0-9\-_]*$/;
      if (!slugRegex.test(slug)) {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: 'Slug must be lowercase, URL-safe (letters, numbers, hyphens, underscores), and must start with a letter or number' } },
          { status: 400 }
        );
      }
    }

    // Validate roamingMode
    const validRoamingModes = ['auth_origin', 'seamless', 'reauth'];
    if (roamingMode !== undefined && !validRoamingModes.includes(roamingMode)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: `roamingMode must be one of: ${validRoamingModes.join(', ')}` } },
        { status: 400 }
      );
    }

    // Validate authMethod
    const validAuthMethods = ['voucher', 'room_number', 'pms_credentials', 'sms_otp', 'social', 'mac_auth', 'open_access'];
    if (authMethod !== undefined && !validAuthMethods.includes(authMethod)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: `authMethod must be one of: ${validAuthMethods.join(', ')}` } },
        { status: 400 }
      );
    }

    // Validate bandwidthPolicy
    const validBandwidthPolicies = ['zone', 'origin', 'minimum'];
    if (bandwidthPolicy !== undefined && !validBandwidthPolicies.includes(bandwidthPolicy)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: `bandwidthPolicy must be one of: ${validBandwidthPolicies.join(', ')}` } },
        { status: 400 }
      );
    }

    // Validate allowsRoamingFrom (must be a JSON array of strings)
    if (allowsRoamingFrom !== undefined) {
      let parsed: unknown;
      try {
        parsed = typeof allowsRoamingFrom === 'string' ? JSON.parse(allowsRoamingFrom) : allowsRoamingFrom;
      } catch {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: 'allowsRoamingFrom must be a JSON array of zone slugs' } },
          { status: 400 }
        );
      }
      if (!Array.isArray(parsed) || !parsed.every((s: unknown) => typeof s === 'string')) {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: 'allowsRoamingFrom must be a JSON array of zone slugs' } },
          { status: 400 }
        );
      }
    }

    // Validate ssidList (must be a JSON array of strings)
    if (ssidList !== undefined) {
      let parsed: unknown;
      try {
        parsed = typeof ssidList === 'string' ? JSON.parse(ssidList) : ssidList;
      } catch {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: 'ssidList must be a JSON array of SSID strings' } },
          { status: 400 }
        );
      }
      if (!Array.isArray(parsed) || !parsed.every((s: unknown) => typeof s === 'string')) {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: 'ssidList must be a JSON array of SSID strings' } },
          { status: 400 }
        );
      }
    }

    // Build zone fields data with proper serialization
    const zoneData: Record<string, unknown> = {};
    if (slug !== undefined) zoneData.slug = slug;
    if (roamingMode !== undefined) zoneData.roamingMode = roamingMode;
    if (allowsRoamingFrom !== undefined) {
      zoneData.allowsRoamingFrom = typeof allowsRoamingFrom === 'string' ? allowsRoamingFrom : JSON.stringify(allowsRoamingFrom);
    }
    if (authMethod !== undefined) zoneData.authMethod = authMethod;
    if (autoAuthEnabled !== undefined) zoneData.autoAuthEnabled = autoAuthEnabled;
    if (maxBandwidthDown !== undefined) zoneData.maxBandwidthDown = parseInt(maxBandwidthDown, 10);
    if (maxBandwidthUp !== undefined) zoneData.maxBandwidthUp = parseInt(maxBandwidthUp, 10);
    if (bandwidthPolicy !== undefined) zoneData.bandwidthPolicy = bandwidthPolicy;
    if (nasIdentifier !== undefined) zoneData.nasIdentifier = nasIdentifier;
    if (ssidList !== undefined) {
      zoneData.ssidList = typeof ssidList === 'string' ? ssidList : JSON.stringify(ssidList);
    }

    const instance = await db.captivePortal.create({
      data: {

        partnerId: resolvedPropertyId,
        name,
        description,
        // Server-level fields kept with defaults for backward compatibility
        listenIp: '0.0.0.0',
        listenPort: 80,
        useSsl: false,
        enabled,
        maxConcurrent: parseInt(maxConcurrent, 10),
        sessionTimeout: parseInt(sessionTimeout, 10),
        idleTimeout: parseInt(idleTimeout, 10),
        redirectUrl,
        successMessage,
        failMessage,
        ...zoneData,
      },
    });

    // Auto-create a default PortalPage using the "Executive Suite" template (non-critical)
    try {
      const defaultDesignSettings = JSON.stringify({
        layoutType: 'card',
        backgroundType: 'solid',
        fontFamily: 'Inter',
        headingFontFamily: 'Inter',
        formStyle: 'square',
        inputStyle: 'rounded',
        buttonStyle: 'rounded',
        buttonSize: 'medium',
        cardShadow: 'medium',
        animationType: 'fade',
        gradientFrom: '#f8fafc',
        gradientTo: '#e2e8f0',
      });

      await db.portalPage.create({
        data: {

          portalId: instance.id,
          language: 'en',
          title: 'Welcome',
          subtitle: 'Connect to WiFi',
          backgroundColor: '#f8fafc',
          textColor: '#1e293b',
          accentColor: '#2563eb',
          designSettings: defaultDesignSettings,
        },
      });
    } catch (pageError) {
      // Non-critical: portal creation should succeed even if page creation fails
      console.error('Auto-creation of default PortalPage failed (non-critical):', pageError);
    }

    return NextResponse.json({ success: true, data: instance }, { status: 201 });
  } catch (error: unknown) {
    // Handle unique constraint violation on slug
    const err = error as { code?: string; message?: string };
    if (err.code === 'P2002') {
      const target = Array.isArray((error as { meta?: { target?: string[] } }).meta?.target)
        ? (error as { meta: { target: string[] } }).meta.target.join(', ')
        : 'slug';
      return NextResponse.json(
        { success: false, error: { code: 'CONFLICT', message: `A portal instance with this ${target} already exists` } },
        { status: 409 }
      );
    }

    console.error('Error creating portal instance:', error);
    logWifi(request, 'create', 'portal_instance', instance.id).catch(() => {});
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create portal instance' } },
      { status: 500 }
    );
  }
}
