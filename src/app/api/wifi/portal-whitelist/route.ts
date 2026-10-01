/**
 * Portal Whitelist API Route
 * 
 * CRUD endpoints for managing the captive portal whitelist.
 * Whitelisted domains bypass authentication for guest convenience.
 * GET: list whitelist entries for a property
 * POST: add a whitelist entry
 * PUT: update a whitelist entry
 * DELETE: delete a whitelist entry
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission, resolvePropertyId } from '@/lib/auth/tenant-context';
import { execFile } from 'child_process';
import path from 'path';
import { logWifi } from '@/lib/audit';

// CP-HIGH-09: Auto-apply walled garden rules after whitelist CRUD.
// Fire-and-forget — does not block the CRUD response.
function autoApplyWalledGarden() {
  const STAYSUITE_SCRIPTS_DIR = process.env.STAYSUITE_SCRIPTS_DIR || '/opt/staysuite/scripts';
  const SCRIPT_PATH = path.join(STAYSUITE_SCRIPTS_DIR, 'walled-garden-apply.sh');

  execFile('bash', [SCRIPT_PATH, 'apply'], { timeout: 30_000 }, (err, stdout, stderr) => {
    if (err) {
      console.warn('[Portal Whitelist] Auto-apply walled garden failed:', err.message, stderr?.trim());
    } else {
      console.log('[Portal Whitelist] Walled garden auto-applied after whitelist change');
    }
  });
}

// GET /api/wifi/portal-whitelist - List portal whitelist entries
export async function GET(request: NextRequest) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const searchParams = request.nextUrl.searchParams;
    const partnerId = await resolvePropertyId(user, searchParams.get('partnerId'));
    const status = searchParams.get('status');
    const protocol = searchParams.get('protocol');
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');
    const exportConfig = searchParams.get('export');

    if (!partnerId) {
      return NextResponse.json(
        { success: false, error: 'No property found. Please create a property first.' },
        { status: 400 }
      );
    }

    const where: Record<string, unknown> = { partnerId };

    if (status) where.status = status;
    if (protocol) where.protocol = protocol;

    const [entries, total] = await Promise.all([
      db.portalWhitelist.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { domain: 'asc' }],
        ...(limit && { take: parseInt(limit, 10) }),
        ...(offset && { skip: parseInt(offset, 10) }),
      }),
      db.portalWhitelist.count({ where }),
    ]);

    // Export mode — generate DNS config
    if (exportConfig === 'dns') {
      const { portalWhitelistService } = await import('@/lib/wifi/services/portal-whitelist-service');
      const dnsConfig = await portalWhitelistService.exportAsDnsConfig(partnerId);
      return NextResponse.json({ success: true, data: dnsConfig });
    }

    return NextResponse.json({
      success: true,
      data: entries,
      pagination: {
        total,
        limit: limit ? parseInt(limit, 10) : null,
        offset: offset ? parseInt(offset, 10) : null,
      },
    });
  } catch (error) {
    console.error('Error fetching portal whitelist:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch portal whitelist' },
      { status: 500 }
    );
  }
}

// POST /api/wifi/portal-whitelist - Add a whitelist entry
export async function POST(request: NextRequest) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const body = await request.json();
    const { domain, path, description, protocol, bypassAuth, priority, status } = body;
    const partnerId = await resolvePropertyId(user, body.partnerId);

    if (!partnerId || !domain) {
      return NextResponse.json(
        { success: false, error: 'No property found. Please create a property first.' },
        { status: 400 }
      );
    }

    // Check for duplicate
    const existing = await db.portalWhitelist.findFirst({
      where: {
        partnerId,
        domain: domain.toLowerCase().trim(),
        path: path || null,
      },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'An entry with this domain and path already exists' },
        { status: 409 }
      );
    }

    const entry = await db.portalWhitelist.create({
      data: {
        partnerId,
        domain: domain.toLowerCase().trim(),
        path: path || null,
        description: description || null,
        protocol: protocol || 'https',
        bypassAuth: bypassAuth ?? true,
        priority: priority || 0,
        status: status || 'active',
      },
    });

    // CP-HIGH-09: Auto-apply walled garden rules
    autoApplyWalledGarden();

    return NextResponse.json({ success: true, data: entry }, { status: 201 });
  } catch (error) {
    console.error('Error creating whitelist entry:', error);
    logWifi(request, 'create', 'portal_whitelist', entry.id).catch(() => {});
    return NextResponse.json(
      { success: false, error: 'Failed to create whitelist entry' },
      { status: 500 }
    );
  }
}

// PUT /api/wifi/portal-whitelist - Update a whitelist entry
export async function PUT(request: NextRequest) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const body = await request.json();
    const { id, domain, path, description, protocol, bypassAuth, priority, status } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Entry ID is required' },
        { status: 400 }
      );
    }

    const existing = await db.portalWhitelist.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Whitelist entry not found' },
        { status: 404 }
      );
    }

    // Verify the entry belongs to a property accessible by this tenant
    const authorizedPropertyId = await resolvePropertyId(user, existing.partnerId);
    if (!authorizedPropertyId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (domain !== undefined) updateData.domain = domain.toLowerCase().trim();
    if (path !== undefined) updateData.path = path;
    if (description !== undefined) updateData.description = description;
    if (protocol !== undefined) updateData.protocol = protocol;
    if (bypassAuth !== undefined) updateData.bypassAuth = bypassAuth;
    if (priority !== undefined) updateData.priority = priority;
    if (status !== undefined) updateData.status = status;

    const updated = await db.portalWhitelist.update({
      where: { id },
      data: updateData,
    });

    // CP-HIGH-09: Auto-apply walled garden rules
    autoApplyWalledGarden();

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error updating whitelist entry:', error);
    logWifi(request, 'update', 'portal_whitelist', id).catch(() => {});
    return NextResponse.json(
      { success: false, error: 'Failed to update whitelist entry' },
      { status: 500 }
    );
  }
}

// DELETE /api/wifi/portal-whitelist - Delete a whitelist entry
export async function DELETE(request: NextRequest) {
  const user = await requirePermission(request, 'wifi.manage');
  if (user instanceof NextResponse) return user;

  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Entry ID is required' },
        { status: 400 }
      );
    }

    const existing = await db.portalWhitelist.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Whitelist entry not found' },
        { status: 404 }
      );
    }

    // Verify the entry belongs to a property accessible by this tenant
    const authorizedPropertyId = await resolvePropertyId(user, existing.partnerId);
    if (!authorizedPropertyId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    await db.portalWhitelist.delete({ where: { id } });

    // CP-HIGH-09: Auto-apply walled garden rules
    autoApplyWalledGarden();

    return NextResponse.json({ success: true, message: 'Whitelist entry deleted' });
  } catch (error) {
    console.error('Error deleting whitelist entry:', error);
    logWifi(request, 'delete', 'portal_whitelist', id).catch(() => {});
    return NextResponse.json(
      { success: false, error: 'Failed to delete whitelist entry' },
      { status: 500 }
    );
  }
}
