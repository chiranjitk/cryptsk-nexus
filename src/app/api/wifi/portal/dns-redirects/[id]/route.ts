import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth/tenant-context';
import { regenerateDnsConfig } from '@/lib/dns/generator';
import { logWifi } from '@/lib/audit';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/wifi/portal/dns-redirects/[id] - Get single DNS redirect rule
export async function GET(request: NextRequest, { params }: RouteParams) {
  const user = await requirePermission(request, 'network.manage');
  if (user instanceof NextResponse) return user;

  try {
    const { id } = await params;

    const redirect = await db.dnsRedirectRule.findFirst({
      where: { id},
      include: {
        property: {
          select: { id: true, name: true },
        },
      },
    });

    if (!redirect) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'DNS redirect rule not found' } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: redirect });
  } catch (error) {
    console.error('Error fetching DNS redirect rule:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch DNS redirect rule' } },
      { status: 500 }
    );
  }
}

// PUT /api/wifi/portal/dns-redirects/[id] - Update DNS redirect rule
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const user = await requirePermission(request, 'network.manage');
  if (user instanceof NextResponse) return user;

  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await db.dnsRedirectRule.findFirst({
      where: { id},
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'DNS redirect rule not found' } },
        { status: 404 }
      );
    }

    const { name, matchPattern, targetIp, targetUrl, autoDnsmasq, applyTo, priority, enabled, description } = body;

    const redirect = await db.dnsRedirectRule.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(matchPattern !== undefined && { matchPattern }),
        ...(targetIp !== undefined && { targetIp }),
        ...(targetUrl !== undefined && { targetUrl }),
        ...(autoDnsmasq !== undefined && { autoDnsmasq: Boolean(autoDnsmasq) }),
        ...(applyTo !== undefined && { applyTo }),
        ...(priority !== undefined && { priority: parseInt(priority, 10) }),
        ...(enabled !== undefined && { enabled }),
        ...(description !== undefined && { description }),
      },
    });

    // Regenerate dnsmasq config (fire-and-forget)
    regenerateDnsConfig().catch(() => {});

    logWifi(request, 'update', 'portal_dns_redirect', id).catch(() => {});
    return NextResponse.json({ success: true, data: redirect });
  } catch (error) {
    console.error('Error updating DNS redirect rule:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update DNS redirect rule' } },
      { status: 500 }
    );
  }
}

// DELETE /api/wifi/portal/dns-redirects/[id] - Delete DNS redirect rule
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const user = await requirePermission(request, 'network.manage');
  if (user instanceof NextResponse) return user;

  try {
    const { id } = await params;

    const existing = await db.dnsRedirectRule.findFirst({
      where: { id},
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'DNS redirect rule not found' } },
        { status: 404 }
      );
    }

    await db.dnsRedirectRule.delete({ where: { id } });

    // Regenerate dnsmasq config (fire-and-forget)
    regenerateDnsConfig().catch(() => {});

    logWifi(request, 'delete', 'portal_dns_redirect', id).catch(() => {});
    return NextResponse.json({
      success: true,
      message: 'DNS redirect rule deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting DNS redirect rule:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete DNS redirect rule' } },
      { status: 500 }
    );
  }
}
