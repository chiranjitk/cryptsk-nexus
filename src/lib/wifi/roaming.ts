import { db } from '@/lib/db';
import { auditLogService } from '@/lib/services/audit-service';

export interface RoamingCheckResult {
  allowed: boolean;
  mode: 'auth_origin' | 'seamless' | 'reauth';
  originZone?: string;
  targetZone: string;
  bandwidthPolicy: 'zone' | 'origin' | 'minimum';
  bandwidthDown?: number;
  bandwidthUp?: number;
  reason?: string;
}

/**
 * Check if a device can roam from originZone to targetZone.
 *
 * Rules:
 *   - Same zone → always allowed
 *   - auth_origin → only allowed if origin === target (cross-zone roaming blocked)
 *   - seamless / reauth → allowed only if origin slug is in the target's allowsRoamingFrom list
 */
export async function checkRoamingPermission(params: {
  tenantId: string;
  originZoneSlug: string;
  targetZoneSlug: string;
}): Promise<RoamingCheckResult> {
  // 1. Get target portal config
  const targetPortal = await db.captivePortal.findFirst({
    where: { tenantId: params.tenantId, slug: params.targetZoneSlug, enabled: true },
  });

  if (!targetPortal) {
    return {
      allowed: false,
      mode: 'auth_origin',
      targetZone: params.targetZoneSlug,
      bandwidthPolicy: 'zone',
      reason: 'Target zone not found or disabled',
    };
  }

  const roamingMode = targetPortal.roamingMode as 'auth_origin' | 'seamless' | 'reauth';

  // 2. Same zone → always allow
  if (params.originZoneSlug === params.targetZoneSlug) {
    return {
      allowed: true,
      mode: roamingMode,
      originZone: params.originZoneSlug,
      targetZone: params.targetZoneSlug,
      bandwidthPolicy: targetPortal.bandwidthPolicy as 'zone' | 'origin' | 'minimum',
      bandwidthDown: targetPortal.maxBandwidthDown,
      bandwidthUp: targetPortal.maxBandwidthUp,
    };
  }

  // 3. auth_origin mode: only allow auth from the original zone
  if (roamingMode === 'auth_origin') {
    return {
      allowed: false,
      mode: 'auth_origin',
      originZone: params.originZoneSlug,
      targetZone: params.targetZoneSlug,
      bandwidthPolicy: targetPortal.bandwidthPolicy as 'zone' | 'origin' | 'minimum',
      bandwidthDown: targetPortal.maxBandwidthDown,
      bandwidthUp: targetPortal.maxBandwidthUp,
      reason: 'auth_origin mode: must authenticate at original zone',
    };
  }

  // 4. Check allowsRoamingFrom whitelist
  const allowsFrom: string[] = parseJsonArray(targetPortal.allowsRoamingFrom);
  if (!allowsFrom.includes(params.originZoneSlug)) {
    return {
      allowed: false,
      mode: roamingMode,
      originZone: params.originZoneSlug,
      targetZone: params.targetZoneSlug,
      bandwidthPolicy: targetPortal.bandwidthPolicy as 'zone' | 'origin' | 'minimum',
      bandwidthDown: targetPortal.maxBandwidthDown,
      bandwidthUp: targetPortal.maxBandwidthUp,
      reason: `Roaming from ${params.originZoneSlug} not allowed in ${params.targetZoneSlug}`,
    };
  }

  // 5. seamless mode: allow with optional bandwidth adjustment
  if (roamingMode === 'seamless') {
    return {
      allowed: true,
      mode: 'seamless',
      originZone: params.originZoneSlug,
      targetZone: params.targetZoneSlug,
      bandwidthPolicy: targetPortal.bandwidthPolicy as 'zone' | 'origin' | 'minimum',
      bandwidthDown: targetPortal.maxBandwidthDown,
      bandwidthUp: targetPortal.maxBandwidthUp,
    };
  }

  // 6. reauth mode: allow but signal that re-authentication is needed
  if (roamingMode === 'reauth') {
    return {
      allowed: true,
      mode: 'reauth',
      originZone: params.originZoneSlug,
      targetZone: params.targetZoneSlug,
      bandwidthPolicy: targetPortal.bandwidthPolicy as 'zone' | 'origin' | 'minimum',
      bandwidthDown: targetPortal.maxBandwidthDown,
      bandwidthUp: targetPortal.maxBandwidthUp,
      reason: 'reauth mode: guest must re-authenticate',
    };
  }

  return {
    allowed: false,
    mode: 'auth_origin',
    targetZone: params.targetZoneSlug,
    bandwidthPolicy: 'zone',
    reason: 'Unknown roaming mode',
  };
}

/**
 * Calculate effective bandwidth based on roaming policy.
 *
 * - zone: use the target zone's bandwidth limits
 * - origin: use the origin portal's bandwidth limits
 * - minimum: use the lower of origin and target limits
 */
export function calculateRoamingBandwidth(
  roamingResult: RoamingCheckResult,
  originPortal?: { maxBandwidthDown: number; maxBandwidthUp: number },
): { downloadBps: number; uploadBps: number } {
  const { bandwidthPolicy, bandwidthDown, bandwidthUp } = roamingResult;
  const target = { down: bandwidthDown || 5242880, up: bandwidthUp || 1048576 };

  if (bandwidthPolicy === 'zone') {
    return { downloadBps: target.down, uploadBps: target.up };
  }

  if (bandwidthPolicy === 'origin' && originPortal) {
    return {
      downloadBps: originPortal.maxBandwidthDown,
      uploadBps: originPortal.maxBandwidthUp,
    };
  }

  if (bandwidthPolicy === 'minimum') {
    const origin = originPortal || { maxBandwidthDown: Infinity, maxBandwidthUp: Infinity };
    return {
      downloadBps: Math.min(target.down, origin.maxBandwidthDown),
      uploadBps: Math.min(target.up, origin.maxBandwidthUp),
    };
  }

  return { downloadBps: target.down, uploadBps: target.up };
}

/**
 * Log a roaming event to the AuditLog table for audit trail.
 *
 * Uses only fields that exist on AuditLog:
 *   tenantId, userId (null for guest), module, action,
 *   entityType, entityId (null), oldValue, newValue, ipAddress
 */
export async function logRoamingEvent(params: {
  tenantId: string;
  sessionId?: string;
  username?: string;
  macAddress?: string;
  originZone: string;
  targetZone: string;
  mode: string;
  allowed: boolean;
  ipAddress?: string;
}): Promise<void> {
  try {
    await auditLogService.log({
      tenantId: params.tenantId,
      module: 'wifi',
      action: 'session_start', // reuse existing enum value
      entityType: 'session',
      oldValue: `${params.originZone}|${params.sessionId || ''}|${params.macAddress || ''}|${params.username || ''}`,
      newValue: { targetZone: params.targetZone, mode: params.mode, allowed: params.allowed },
      ipAddress: params.ipAddress,
    });
  } catch {
    // Audit logging must never break the roaming flow
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Safely parse a JSON array string, returning [] on failure. */
function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
