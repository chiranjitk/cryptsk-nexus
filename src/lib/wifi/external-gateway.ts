import { db } from '@/lib/db';

/**
 * External gateway configuration returned when a property has
 * a MikroTik WiFi Controller with external portal mode enabled.
 */
export interface ExternalGatewayConfig {
  /** The MikroTik hotspot login URL, e.g. "http://192.168.1.1/login" */
  portalCallbackUrl: string;
  /** The MikroTik RouterOS IP address */
  mikrotikIp: string;
}

// ─────────────────────────────────────────────────────────────
// CIDR Matching (IPv4 only — same algorithm as resolve-zone)
// ─────────────────────────────────────────────────────────────

function ipToInt(ip: string): number {
  const parts = ip.split('.');
  return ((parts[0] ?? 0) << 24) | ((parts[1] ?? 0) << 16) | ((parts[2] ?? 0) << 8) | (parts[3] ?? 0);
}

function matchesCIDR(ip: string, cidr: string): boolean {
  const parts = cidr.split('/');
  if (parts.length !== 2) return false;

  const range = parts[0];
  const bits = parseInt(parts[1], 10);
  if (isNaN(bits) || bits < 0 || bits > 32) return false;

  const mask = ~((1 << (32 - bits)) - 1);
  const ipNum = ipToInt(ip);
  const rangeNum = ipToInt(range);
  return (ipNum & mask) === (rangeNum & mask);
}

/**
 * Look up the external MikroTik gateway that should handle a guest's
 * authentication, based on which subnet the guest's IP belongs to.
 *
 * Resolution strategy (in priority order):
 *
 * 1. **Subnet match** — If `clientIp` is provided and the Integration's
 *    `config_wifi.subnet` (CIDR) matches, that gateway is selected.
 *    This supports multi-gateway deployments where different MikroTik
 *    devices manage different subnets/zones (Lobby, Pool, Conference, etc.)
 *
 * 2. **SSID match** — If `ssid` is provided and matches the Integration's
 *    `config_wifi.ssid`, that gateway is selected.
 *
 * 3. **Fallback (single gateway)** — If no subnet or SSID match is found,
 *    returns the first MikroTik gateway with externalPortalMode=true for
 *    the given tenant. This maintains backward compatibility with
 *    single-gateway deployments.
 *
 * @param propertyId - The property UUID to check
 * @param tenantId   - The tenant UUID (required for tenant scoping)
 * @param clientIp   - The guest's client IP address (for subnet-based routing)
 * @param ssid       - The SSID the guest is connected to (for SSID-based routing)
 */
export async function getExternalGatewayConfig(
  propertyId: string,
  tenantId?: string | null,
  clientIp?: string | null,
  ssid?: string | null
): Promise<ExternalGatewayConfig | null> {
  try {
    // Query all MikroTik wifi_gateway integrations with external portal mode.
    // We include 'error' status because the auto-sync job marks unreachable
    // devices as 'error', but the external portal config should still work.
    const integrations = await db.integration.findMany({
      where: {
        type: 'wifi_gateway',
        provider: 'mikrotik',
        status: { in: ['active', 'error'] },
      },
      select: {
        tenantId: true,
        config: true,
      },
    });

    let subnetMatch: ExternalGatewayConfig | null = null;
    let ssidMatch: ExternalGatewayConfig | null = null;
    let fallback: ExternalGatewayConfig | null = null;

    for (const integration of integrations) {
      // Skip if tenant doesn't match
      if (tenantId && integration.tenantId !== tenantId) continue;

      let parsed: Record<string, unknown>;
      try {
        parsed = typeof integration.config === 'string'
          ? JSON.parse(integration.config)
          : integration.config as Record<string, unknown>;
      } catch {
        continue;
      }

      const wifiConfig = parsed.config_wifi as Record<string, unknown> | undefined;
      if (!wifiConfig?.externalPortalMode) continue;

      const portalCallbackUrl = wifiConfig.portalCallbackUrl as string;
      const mikrotikIp = parsed.ipAddress as string;
      const gatewaySubnet = wifiConfig.subnet as string | undefined;
      const gatewaySsid = wifiConfig.ssid as string | undefined;

      if (!portalCallbackUrl || !mikrotikIp) continue;

      const config: ExternalGatewayConfig = { portalCallbackUrl, mikrotikIp };

      // Priority 1: Subnet-based routing (exact CIDR match on client IP)
      if (clientIp && gatewaySubnet && matchesCIDR(clientIp, gatewaySubnet)) {
        subnetMatch = config;
        // Don't break — check all for highest priority, but subnet match wins
      }

      // Priority 2: SSID-based routing
      if (ssid && gatewaySsid && ssid === gatewaySsid && !subnetMatch) {
        ssidMatch = config;
      }

      // Priority 3: First gateway as fallback (single-gateway compat)
      if (!fallback) {
        fallback = config;
      }
    }

    // Return in priority order: subnet > SSID > fallback
    if (subnetMatch) {
      console.log(`[ExternalGateway] Subnet match: client ${clientIp} → ${subnetMatch.mikrotikIp} (${subnetMatch.portalCallbackUrl})`);
      return subnetMatch;
    }
    if (ssidMatch) {
      console.log(`[ExternalGateway] SSID match: ssid "${ssid}" → ${ssidMatch.mikrotikIp} (${ssidMatch.portalCallbackUrl})`);
      return ssidMatch;
    }
    if (fallback) {
      console.log(`[ExternalGateway] Fallback: → ${fallback.mikrotikIp} (${fallback.portalCallbackUrl})`);
      return fallback;
    }
  } catch (err) {
    console.error('[ExternalGateway] Failed to lookup gateway config:', err);
  }

  return null;
}

/**
 * Build the external gateway response fields that get appended to
 * successResponse data in both auth and auto-auth routes.
 *
 * When gateway is null (internal NAS), returns an empty object —
 * the portal will not redirect and nftables activation proceeds normally.
 */
export function buildGatewayAuthResponse(
  gateway: ExternalGatewayConfig | null,
  radiusUsername: string,
  radiusPassword: string
): Record<string, unknown> {
  if (!gateway) return {};

  return {
    needGatewayLogin: true,
    gatewayCallbackUrl: gateway.portalCallbackUrl,
    gatewayType: 'mikrotik',
    radiusUsername,
    radiusPassword,
  };
}
