/**
 * SDCP — Staff Device Credential Protection
 *
 * Core policy engine: checks if a device is a known staff device when
 * a guest credential is used. Only runs when the SDCP feature flag is
 * enabled for the tenant.
 *
 * Feature flag: stored in Tenant.features JSON as { "sdcp": true }
 * Flag file on disk: /opt/staysuite/data/sdcp-enabled.flag
 * (checked by the dnsmasq dhcp-script to avoid unnecessary API calls)
 */

import { db } from '@/lib/db';
import { createHash } from 'crypto';

// ── Types ────────────────────────────────────────────────────────────────

export interface SDCPCheckResult {
  blocked: boolean;
  alerted: boolean;
  deviceCategory: string;
  confidenceScore: number;
  reason: string;
  eventType?: string;
  deviceProfileId?: string;
}

export const SDCP_EVENT_TYPES = {
  STAFF_GUEST_CREDENTIAL: 'STAFF_DEVICE_GUEST_CREDENTIAL_ATTEMPT',
  STAFF_CORRELATED_GUEST: 'STAFF_DEVICE_CORRELATED_GUEST_ATTEMPT',
  CROSS_GUEST_REUSE: 'CROSS_GUEST_DEVICE_REUSE',
  DEVICE_PROFILE_CREATED: 'DEVICE_PROFILE_CREATED',
  STAFF_DEVICE_ENROLLED: 'STAFF_DEVICE_ENROLLED',
  STAFF_DEVICE_REVOKED: 'STAFF_DEVICE_REVOKED',
  DEVICE_PROFILE_UPDATED: 'DEVICE_PROFILE_UPDATED',
  DEVICE_CORRELATION_DETECTED: 'DEVICE_CORRELATION_DETECTED',
} as const;

// ── Feature Flag ─────────────────────────────────────────────────────────

/** Check if SDCP is enabled for a tenant. Reads from Tenant.features JSON. */
export async function isSDCPEnabled(tenantId: string): Promise<boolean> {
  try {
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { features: true },
    });
    if (!tenant?.features) return false;
    const features = JSON.parse(tenant.features) as Record<string, unknown>;
    return features.sdcp === true;
  } catch {
    return false;
  }
}

/** Write or remove the flag file on disk (for the dnsmasq dhcp-script to check). */
export async function setSDCPFlagFile(enabled: boolean): Promise<void> {
  // The flag file path — must match the dhcp-fingerprint.sh script
  const flagPath = '/opt/staysuite/data/sdcp-enabled.flag';
  try {
    const fs = await import('fs');
    if (enabled) {
      fs.writeFileSync(flagPath, new Date().toISOString());
    } else {
      try { fs.unlinkSync(flagPath); } catch { /* file may not exist */ }
    }
  } catch {
    // Non-critical — the API still checks the DB flag
  }
}

// ── DHCP Signature ───────────────────────────────────────────────────────

/**
 * Normalize DHCP fingerprint from dnsmasq env vars into a SHA-256 hash.
 * Combines: option 55 (requested options) + vendor class + client ID type.
 */
export function normalizeDhcpSignature(params: {
  requestedOptions?: string;
  vendorClass?: string;
  clientId?: string;
  hostname?: string;
}): { signature: string; raw: Record<string, string> } {
  const raw: Record<string, string> = {
    requestedOptions: params.requestedOptions || '',
    vendorClass: params.vendorClass || '',
    clientId: params.clientId || '',
    hostname: params.hostname || '',
  };
  // The signature is the hash of the three primary signals (NOT hostname — too volatile)
  const signalString = `${raw.requestedOptions}|${raw.vendorClass}|${raw.clientId}`;
  const signature = createHash('sha256').update(signalString).digest('hex');
  return { signature, raw };
}

/**
 * Compute the combined device identity hash from browser fingerprint + DHCP signature.
 */
export function computeDeviceIdentityHash(fingerprintHash: string, dhcpSignature?: string | null): string {
  const combined = dhcpSignature ? `${fingerprintHash}|${dhcpSignature}` : fingerprintHash;
  return createHash('sha256').update(combined).digest('hex');
}

// ── Correlation Scoring ──────────────────────────────────────────────────

export const SDCP_DEFAULT_WEIGHTS = {
  dhcpMatch: 60,
  dhcpOptionMatch: 15,
  browserFingerprintMatch: 25,
};

export const SDCP_DEFAULT_THRESHOLD = 60; // Staff correlation threshold

/**
 * Calculate confidence score for a device match.
 * Weighted: DHCP match=+60, DHCP option match=+15, browser FP=+25.
 */
export function calculateConfidence(params: {
  dhcpMatch: boolean;
  dhcpOptionMatch: boolean;
  browserFingerprintMatch: boolean;
}): number {
  let score = 0;
  if (params.dhcpMatch) score += SDCP_DEFAULT_WEIGHTS.dhcpMatch;
  if (params.dhcpOptionMatch) score += SDCP_DEFAULT_WEIGHTS.dhcpOptionMatch;
  if (params.browserFingerprintMatch) score += SDCP_DEFAULT_WEIGHTS.browserFingerprintMatch;
  return Math.min(score, 100);
}

// ── SDCP Policy Check ───────────────────────────────────────────────────

/**
 * Run the SDCP policy check during guest authentication.
 *
 * Called from /api/v1/wifi/auth and /api/v1/wifi/auto-auth AFTER the
 * DeviceProfile is resolved, BEFORE RADIUS authentication.
 *
 * Returns:
 *   blocked=true  → deny the auth, create security event
 *   alerted=true  → allow auth but create a CROSS_GUEST_DEVICE_REUSE alert
 *   both false   → allow auth (not a staff device, no cross-guest reuse)
 */
export async function checkSDCPPolicy(params: {
  tenantId: string;
  propertyId: string;
  deviceProfileId: string;
  wifiUserId: string;       // the user being authenticated (guest)
  guestAccountId?: string | null;
  roomNumber?: string | null;
  dhcpSignature?: string | null;
  fingerprintHash: string;
  isStaffUser: boolean;     // is the authenticating user a staff member?
}): Promise<SDCPCheckResult> {
  const { tenantId, propertyId, deviceProfileId, wifiUserId, guestAccountId, roomNumber } = params;

  // If the authenticating user IS staff → enroll the device, don't block
  if (params.isStaffUser) {
    // Mark the device as STAFF
    await db.deviceProfile.update({
      where: { id: deviceProfileId },
      data: {
        deviceCategory: 'STAFF',
        staffId: wifiUserId,
        dhcpSignature: params.dhcpSignature || undefined,
      },
    });

    // Create enrollment event
    await createSecurityEvent({
      tenantId,
      propertyId,
      deviceProfileId,
      wifiUserId,
      eventType: SDCP_EVENT_TYPES.STAFF_DEVICE_ENROLLED,
      action: 'ENROLLED',
      reason: `Staff device enrolled: user ${wifiUserId}`,
    });

    return {
      blocked: false,
      alerted: false,
      deviceCategory: 'STAFF',
      confidenceScore: 100,
      reason: 'Staff device enrolled',
    };
  }

  // The user is a GUEST — check if this device is a known staff device
  const deviceProfile = await db.deviceProfile.findUnique({
    where: { id: deviceProfileId },
    select: {
      id: true,
      deviceCategory: true,
      staffId: true,
      confidenceScore: true,
      fingerprintHash: true,
      dhcpSignature: true,
      revokedAt: true,
    },
  });

  if (!deviceProfile) {
    return { blocked: false, alerted: false, deviceCategory: 'UNKNOWN', confidenceScore: 0, reason: 'No device profile' };
  }

  // Check 1: Known STAFF device (not revoked)
  if (deviceProfile.deviceCategory === 'STAFF' && !deviceProfile.revokedAt) {
    await createSecurityEvent({
      tenantId,
      propertyId,
      deviceProfileId,
      wifiUserId,
      guestAccountId: guestAccountId || undefined,
      roomNumber: roomNumber || undefined,
      eventType: SDCP_EVENT_TYPES.STAFF_GUEST_CREDENTIAL,
      action: 'BLOCKED',
      reason: `Staff device ${deviceProfile.id} attempted guest credential ${wifiUserId}`,
      dhcpMatch: !!params.dhcpSignature && deviceProfile.dhcpSignature === params.dhcpSignature,
      browserMatch: deviceProfile.fingerprintHash === params.fingerprintHash,
      staffId: deviceProfile.staffId || undefined,
      confidenceScore: 100,
    });

    return {
      blocked: true,
      alerted: false,
      deviceCategory: 'STAFF',
      confidenceScore: 100,
      reason: 'Staff device blocked from using guest credentials',
      eventType: SDCP_EVENT_TYPES.STAFF_GUEST_CREDENTIAL,
      deviceProfileId: deviceProfile.id,
    };
  }

  // Check 2: DHCP signature correlation with STAFF devices
  if (params.dhcpSignature) {
    const staffDeviceByDhcp = await db.deviceProfile.findFirst({
      where: {
        tenantId,
        deviceCategory: 'STAFF',
        dhcpSignature: params.dhcpSignature,
        revokedAt: null,
      },
      select: { id: true, staffId: true, deviceCategory: true },
    });

    if (staffDeviceByDhcp) {
      const score = calculateConfidence({
        dhcpMatch: true,
        dhcpOptionMatch: false,
        browserFingerprintMatch: deviceProfile.fingerprintHash === params.fingerprintHash,
      });

      await createSecurityEvent({
        tenantId,
        propertyId,
        deviceProfileId: deviceProfile.id,
        wifiUserId,
        guestAccountId: guestAccountId || undefined,
        roomNumber: roomNumber || undefined,
        eventType: SDCP_EVENT_TYPES.STAFF_CORRELATED_GUEST,
        action: 'BLOCKED',
        reason: `DHCP signature matches staff device ${staffDeviceByDhcp.id}`,
        dhcpMatch: true,
        browserMatch: deviceProfile.fingerprintHash === params.fingerprintHash,
        staffId: staffDeviceByDhcp.staffId || undefined,
        confidenceScore: score,
      });

      // Update the device profile to STAFF_CORRELATED
      await db.deviceProfile.update({
        where: { id: deviceProfile.id },
        data: { deviceCategory: 'STAFF_CORRELATED', confidenceScore: score },
      });

      return {
        blocked: true,
        alerted: false,
        deviceCategory: 'STAFF_CORRELATED',
        confidenceScore: score,
        reason: `DHCP signature correlation with staff device (score: ${score})`,
        eventType: SDCP_EVENT_TYPES.STAFF_CORRELATED_GUEST,
        deviceProfileId: deviceProfile.id,
      };
    }
  }

  // Check 3: Cross-guest device reuse (was this device used by a different guest before?)
  if (guestAccountId) {
    const previousAssociations = await db.deviceGuestHistory.findMany({
      where: {
        deviceProfileId: deviceProfile.id,
        guestAccountId: { not: guestAccountId },
        associationStatus: { in: ['ACTIVE', 'EXPIRED'] },
      },
      take: 5,
      orderBy: { lastSeen: 'desc' },
      select: { guestAccountId: true, roomNumber: true, firstSeen: true, lastSeen: true },
    });

    if (previousAssociations.length > 0) {
      const prevGuests = previousAssociations.map(a => a.guestAccountId.substring(0, 8)).join(', ');
      await createSecurityEvent({
        tenantId,
        propertyId,
        deviceProfileId: deviceProfile.id,
        wifiUserId,
        guestAccountId: guestAccountId || undefined,
        roomNumber: roomNumber || undefined,
        eventType: SDCP_EVENT_TYPES.CROSS_GUEST_REUSE,
        action: 'ALERTED',
        reason: `Device previously associated with other guests: ${prevGuests}`,
        browserMatch: true,
        confidenceScore: 25,
      });

      return {
        blocked: false,
        alerted: true,
        deviceCategory: deviceProfile.deviceCategory,
        confidenceScore: 25,
        reason: `Cross-guest device reuse detected (previously used by: ${prevGuests})`,
        eventType: SDCP_EVENT_TYPES.CROSS_GUEST_REUSE,
        deviceProfileId: deviceProfile.id,
      };
    }
  }

  // Not a staff device, no cross-guest reuse — allow
  // Mark the device as GUEST if it was UNKNOWN
  if (deviceProfile.deviceCategory === 'UNKNOWN') {
    await db.deviceProfile.update({
      where: { id: deviceProfile.id },
      data: { deviceCategory: 'GUEST' },
    });
  }

  // Create/update guest device association
  if (guestAccountId) {
    await db.deviceGuestHistory.upsert({
      where: {
        id: `${deviceProfile.id}-${guestAccountId}`, // deterministic ID for upsert
      },
      create: {
        id: `${deviceProfile.id}-${guestAccountId}`,
        tenantId,
        propertyId,
        deviceProfileId: deviceProfile.id,
        guestAccountId,
        roomNumber: roomNumber || null,
        associationStatus: 'ACTIVE',
      },
      update: {
        lastSeen: new Date(),
        roomNumber: roomNumber || undefined,
        associationStatus: 'ACTIVE',
      },
    }).catch(() => {
      // Upsert with custom ID may fail if the record doesn't exist yet — try create
      // (the catch is a safety net; the upsert should work)
    });
  }

  return {
    blocked: false,
    alerted: false,
    deviceCategory: deviceProfile.deviceCategory === 'UNKNOWN' ? 'GUEST' : deviceProfile.deviceCategory,
    confidenceScore: 0,
    reason: 'Guest device — allowed',
  };
}

// ── Security Event Helper ───────────────────────────────────────────────

export async function createSecurityEvent(params: {
  tenantId: string;
  propertyId: string;
  deviceProfileId: string;
  wifiUserId?: string;
  guestAccountId?: string;
  staffId?: string;
  roomNumber?: string;
  eventType: string;
  action: string;
  reason?: string;
  dhcpMatch?: boolean;
  browserMatch?: boolean;
  confidenceScore?: number;
}): Promise<void> {
  try {
    await db.deviceSecurityEvent.create({
      data: {
        tenantId: params.tenantId,
        propertyId: params.propertyId,
        deviceProfileId: params.deviceProfileId,
        wifiUserId: params.wifiUserId || null,
        guestAccountId: params.guestAccountId || null,
        staffId: params.staffId || null,
        roomNumber: params.roomNumber || null,
        eventType: params.eventType,
        action: params.action,
        reason: params.reason || null,
        dhcpMatch: params.dhcpMatch || false,
        browserMatch: params.browserMatch || false,
        confidenceScore: params.confidenceScore || 0,
      },
    });
  } catch (err) {
    console.error('[SDCP] Failed to create security event:', err);
  }
}
