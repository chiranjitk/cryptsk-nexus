import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth/tenant-context';
import { logWifi } from '@/lib/audit';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/wifi/portal/instances/[id] - Get single portal instance
export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const { id } = await params;

    const instance = await db.captivePortal.findFirst({
// REMOVED:       where: { id, tenantId: user.tenantId },
      include: {
        property: {
          select: { id: true, name: true },
        },
        portalMappings: {
          orderBy: { priority: 'desc' },
        },
        authMethods: {
          where: { enabled: true },
          orderBy: { priority: 'asc' },
        },
        portalPages: true,
      },
    });

    if (!instance) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Portal instance not found' } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: instance });
  } catch (error) {
    console.error('Error fetching portal instance:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch portal instance' } },
      { status: 500 }
    );
  }
}

// PUT /api/wifi/portal/instances/[id] - Update portal instance
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await db.captivePortal.findFirst({
// REMOVED:       where: { id, tenantId: user.tenantId },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Portal instance not found' } },
        { status: 404 }
      );
    }

    const {
      name, description, enabled, isDefault, maxConcurrent,
      sessionTimeout, idleTimeout, redirectUrl,
      successMessage, failMessage,
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
      // Partner assignment
      partnerId,
      // CAPTCHA (Turnstile) fields
      captchaEnabled,
      captchaSiteKey,
      captchaSecretKey,
    } = body;

    // Validate slug format if provided
    if (slug !== undefined) {
      const slugRegex = /^[a-z0-9][a-z0-9\-_]*$/;
      if (!slugRegex.test(slug)) {
        return NextResponse.json(
          { success: false, error: { code: 'VALIDATION_ERROR', message: 'Slug must be lowercase, URL-safe (letters, numbers, hyphens, underscores), and must start with a letter or number' } },
          { status: 400 }
        );
      }
    }

    // Validate roamingMode if provided
    const validRoamingModes = ['auth_origin', 'seamless', 'reauth'];
    if (roamingMode !== undefined && !validRoamingModes.includes(roamingMode)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: `roamingMode must be one of: ${validRoamingModes.join(', ')}` } },
        { status: 400 }
      );
    }

    // Validate authMethod if provided
    const validAuthMethods = ['voucher', 'room_number', 'pms_credentials', 'sms_otp', 'social', 'mac_auth', 'open_access'];
    if (authMethod !== undefined && !validAuthMethods.includes(authMethod)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: `authMethod must be one of: ${validAuthMethods.join(', ')}` } },
        { status: 400 }
      );
    }

    // Validate bandwidthPolicy if provided
    const validBandwidthPolicies = ['zone', 'origin', 'minimum'];
    if (bandwidthPolicy !== undefined && !validBandwidthPolicies.includes(bandwidthPolicy)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: `bandwidthPolicy must be one of: ${validBandwidthPolicies.join(', ')}` } },
        { status: 400 }
      );
    }

    // Validate allowsRoamingFrom if provided
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

    // Validate ssidList if provided
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

    // If setting as default, unset all other defaults first (only one default per tenant)
    if (isDefault === true) {
      await db.captivePortal.updateMany({
// REMOVED:         where: { tenantId: user.tenantId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const instance = await db.captivePortal.update({
      where: { id },
      data: {
        // Existing fields (backward compatible — only update if provided)
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(enabled !== undefined && { enabled }),
        ...(isDefault !== undefined && { isDefault }),
        ...(maxConcurrent !== undefined && { maxConcurrent: parseInt(maxConcurrent, 10) }),
        ...(sessionTimeout !== undefined && { sessionTimeout: parseInt(sessionTimeout, 10) }),
        ...(idleTimeout !== undefined && { idleTimeout: parseInt(idleTimeout, 10) }),
        ...(redirectUrl !== undefined && { redirectUrl }),
        ...(successMessage !== undefined && { successMessage }),
        ...(failMessage !== undefined && { failMessage }),
        // Zone-based fields (backward compatible — only update if provided)
        ...(slug !== undefined && { slug }),
        ...(roamingMode !== undefined && { roamingMode }),
        ...(allowsRoamingFrom !== undefined && {
          allowsRoamingFrom: typeof allowsRoamingFrom === 'string' ? allowsRoamingFrom : JSON.stringify(allowsRoamingFrom),
        }),
        ...(authMethod !== undefined && { authMethod }),
        ...(autoAuthEnabled !== undefined && { autoAuthEnabled }),
        ...(maxBandwidthDown !== undefined && { maxBandwidthDown: parseInt(maxBandwidthDown, 10) }),
        ...(maxBandwidthUp !== undefined && { maxBandwidthUp: parseInt(maxBandwidthUp, 10) }),
        ...(bandwidthPolicy !== undefined && { bandwidthPolicy }),
        ...(nasIdentifier !== undefined && { nasIdentifier }),
        ...(ssidList !== undefined && {
          ssidList: typeof ssidList === 'string' ? ssidList : JSON.stringify(ssidList),
        }),
        ...(partnerId !== undefined && { partnerId }),
        // CAPTCHA (Turnstile) fields
        ...(captchaEnabled !== undefined && { captchaEnabled }),
        ...(captchaSiteKey !== undefined && { captchaSiteKey }),
        ...(captchaSecretKey !== undefined && { captchaSecretKey }),
      },
    });

    // Audit log
    try {
// REMOVED:       await logWifi(request, 'update', 'portal_instance', id, { name: instance.name, slug: instance.slug, enabled: instance.enabled, authMethod: instance.authMethod }, { tenantId: user.tenantId, userId: user.userId, oldValue: existing as unknown as Record<string, unknown> });
    } catch (auditErr) {
      console.error('Audit log failed for portal instance update:', auditErr);
    }

    return NextResponse.json({ success: true, data: instance });
  } catch (error: unknown) {
    // Handle unique constraint violation on slug
    const err = error as { code?: string; meta?: { target?: string[] } };
    if (err.code === 'P2002') {
      const target = Array.isArray(err.meta?.target)
        ? err.meta.target.join(', ')
        : 'slug';
      return NextResponse.json(
        { success: false, error: { code: 'CONFLICT', message: `A portal instance with this ${target} already exists` } },
        { status: 409 }
      );
    }

    console.error('Error updating portal instance:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update portal instance' } },
      { status: 500 }
    );
  }
}

// DELETE /api/wifi/portal/instances/[id] - Delete portal instance
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const { id } = await params;

    const existing = await db.captivePortal.findFirst({
// REMOVED:       where: { id, tenantId: user.tenantId },
      include: {
        _count: {
          select: {
            portalMappings: true,
            authMethods: true,
            portalPages: true,
          },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Portal instance not found' } },
        { status: 404 }
      );
    }

    // Check for associated resources
    const hasAssociations = existing._count.portalMappings > 0
      || existing._count.authMethods > 0
      || existing._count.portalPages > 0;

    if (hasAssociations) {
      // Disable instead of deleting
      await db.captivePortal.update({
        where: { id },
        data: { enabled: false },
      });

      // Audit log (deactivation)
      try {
// REMOVED:         await logWifi(request, 'update', 'portal_instance', id, { name: existing.name, slug: existing.slug, enabled: false, note: 'deactivated due to associations' }, { tenantId: user.tenantId, userId: user.userId, oldValue: existing as unknown as Record<string, unknown> });
      } catch (auditErr) {
        console.error('Audit log failed for portal instance deactivation:', auditErr);
      }

      return NextResponse.json({
        success: true,
        message: 'Portal instance deactivated (has associated mappings, auth methods, or pages)',
      });
    }

    await db.captivePortal.delete({ where: { id } });

    // Audit log (deletion)
    try {
// REMOVED:       await logWifi(request, 'delete', 'portal_instance', id, { name: existing.name, slug: existing.slug }, { tenantId: user.tenantId, userId: user.userId, oldValue: existing as unknown as Record<string, unknown> });
    } catch (auditErr) {
      console.error('Audit log failed for portal instance delete:', auditErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Portal instance deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting portal instance:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete portal instance' } },
      { status: 500 }
    );
  }
}
