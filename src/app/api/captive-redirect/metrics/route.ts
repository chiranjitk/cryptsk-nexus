import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, hasAnyPermission } from '@/lib/auth/tenant-context';

/**
 * GET /api/captive-redirect/metrics
 *
 * Proxies metrics from the captive-redirect mini-service (port 8888).
 * Returns real-time redirect stats, per-OS breakdown, cache size, whitelist, uptime.
 */
export async function GET(request: NextRequest) {
  const user = await requireAuth(request);
  if (user instanceof NextResponse) return user;

  // Permission check: only allow network/wifi/admin access to metrics
  if (!hasAnyPermission(user, ['network.view', 'wifi.view', 'wifi.manage', 'admin.*', '*'])) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } },
      { status: 403 }
    );
  }

  try {
    const res = await fetch('http://127.0.0.1:8888/api/metrics', {
      signal: AbortSignal.timeout(5000), // 5s timeout
    });

    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: { message: 'Captive redirect service not reachable' } },
        { status: 503 }
      );
    }

    const data = await res.json();
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.debug('[captive-redirect/metrics] Proxy error:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { success: false, error: { message: 'Captive redirect service offline' } },
      { status: 503 }
    );
  }
}
