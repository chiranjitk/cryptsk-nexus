/**
 * WiFi Auth Handler Helpers
 *
 * All shared helper functions extracted from the WiFi auth route.
 * These are pure utility functions used by multiple auth handler modules.
 *
 * Extracted from: src/app/api/v1/wifi/auth/route.ts (lines 37-1450, 5378-6191)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getClientIp } from '@/lib/utils/ip';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { createPortalSessionToken } from '@/lib/wifi/portal-session-token';
import { wifiUserService } from '@/lib/wifi/services/wifi-user-service';
import { normalizePhoneNumber } from '@/lib/adapters/sms';
import { randomUUID, randomInt, createHash } from 'crypto';
import { addUserCounter } from '@/lib/wifi/utils/nftables-counters';
import { getLocalNasConfig } from '@/lib/wifi/local-nas-config';
import { activateUserFirewall } from '@/lib/wifi/shared/radius-utils';
import {
  otpGet, otpSet, otpDelete, otpIncrementAttempts, otpCleanup,
  otpRateLimit, otpRateCleanup,
} from '@/lib/wifi/services/pg-otp-store';
import type { OtpEntry } from '@/lib/wifi/services/pg-otp-store';
import { getExternalGatewayConfig, buildGatewayAuthResponse, type ExternalGatewayConfig } from '@/lib/wifi/utils/external-gateway';
import type { GuestInfoPayload, MarketingConsent, MatchedPool } from './types';
import { allocateSnatIp } from '@/lib/wifi/snat-allocator';

// ══════════════════════════════════════════════════════════════
// Lazy imports
// ══════════════════════════════════════════════════════════════

async function getLdapjs() {
  try {
    return await import('ldapjs');
  } catch {
    throw new Error('ldapjs package is not installed');
  }
}

// ══════════════════════════════════════════════════════════════
// Device Info Helpers
// ══════════════════════════════════════════════════════════════

export function parseDeviceTypeFromUA(ua: string): string {
  if (/iPhone/i.test(ua)) return 'mobile';
  if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && /WebKit/i.test(ua) && !/Safari/i.test(ua))) return 'tablet';
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? 'mobile' : 'tablet';
  if (/SmartTV|InternetTV|APPLETV/i.test(ua)) return 'tv';
  if (/Windows|Macintosh|Linux|CrOS/i.test(ua)) return 'desktop';
  return 'unknown';
}

export function parseDeviceNameFromUA(ua: string): string {
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? 'Android Phone' : 'Android Tablet';
  if (/Windows/i.test(ua)) return 'Windows PC';
  if (/Macintosh/i.test(ua)) return 'Mac';
  if (/CrOS/i.test(ua)) return 'Chromebook';
  if (/Linux/i.test(ua)) return 'Linux PC';
  if (/SmartTV/i.test(ua)) return 'Smart TV';
  return 'Unknown Device';
}

export function syntheticFingerprintFromMac(mac: string): string {
  const normalized = mac.replace(/[:\-\.\s]/g, '').toUpperCase();
  return createHash('sha256')
    .update(`syn-mac:${normalized}`)
    .digest('hex');
}

// ══════════════════════════════════════════════════════════════
// Device Profile Management
// ══════════════════════════════════════════════════════════════

export async function upsertDeviceProfileWithFingerprint(params: {
  wifiUserId: string;
  tenantId: string;
  propertyId: string;
  guestId?: string | null;
  username: string;
  request: NextRequest;
  macAddress?: string | null;
  fingerprintHash?: string | null;
  storageToken?: string | null;
}) {
  const { wifiUserId, tenantId, propertyId, guestId, username, request, macAddress, fingerprintHash, storageToken } = params;

  const normalizedMac = macAddress
    ? macAddress.replace(/[:\-\.\s]/g, '').toUpperCase()
    : null;
  const formattedMac = normalizedMac && normalizedMac.length === 12
    ? normalizedMac.match(/.{2}/g)?.join(':') || null
    : null;

  let effectiveFingerprint = fingerprintHash;
  let isSynthetic = false;
  if (!effectiveFingerprint && formattedMac) {
    effectiveFingerprint = syntheticFingerprintFromMac(formattedMac);
    isSynthetic = true;
  }

  if (!effectiveFingerprint) {
    console.log(`[Auth] No client fingerprint or MAC address — skipping DeviceProfile creation (deferred to auto-auth) [fp=${fingerprintHash || 'null'} mac=${macAddress || 'null'}]`);
    if (formattedMac) {
      await upsertWiFiDeviceRegistry({
        tenantId, guestId, propertyId, macAddress: formattedMac,
        deviceName: parseDeviceNameFromUA(request.headers.get('user-agent') || ''),
        deviceType: parseDeviceTypeFromUA(request.headers.get('user-agent') || ''),
        ipAddress: getClientIp(request) || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      });
    }
    return;
  }

  if (formattedMac) {
    const autoAuthDisabled = await isDeviceAutoAuthDisabled(tenantId, formattedMac);
    if (autoAuthDisabled) {
      console.log(`[Auth] Device ${formattedMac} has autoAuth=DISABLED — skipping DeviceProfile creation (manual auth still allowed)`);
      await upsertWiFiDeviceRegistry({
        tenantId, guestId, propertyId, macAddress: formattedMac,
        deviceName: parseDeviceNameFromUA(request.headers.get('user-agent') || ''),
        deviceType: parseDeviceTypeFromUA(request.headers.get('user-agent') || ''),
        ipAddress: getClientIp(request) || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      });
      return;
    }
  }

  console.log(`[Auth] DeviceProfile upsert for ${username}: fp=${effectiveFingerprint ? effectiveFingerprint.substring(0, 16) + '...' : 'none'} mac=${formattedMac || 'none'} synthetic=${isSynthetic}`);

  try {
    const clientIp = getClientIp(request) || 'unknown';
    const userAgent = request.headers.get('user-agent') || '';
    const deviceType = parseDeviceTypeFromUA(userAgent);
    const deviceName = parseDeviceNameFromUA(userAgent);

    if (storageToken) {
      try {
        const cleared = await db.deviceProfile.updateMany({
          where: {
            storageToken,
            propertyId,
            fingerprintHash: { not: effectiveFingerprint },
          },
          data: { storageToken: null },
        });
        if (cleared.count > 0) {
          console.log(`[Auth] Cleared storageToken collision: ${cleared.count} old profile(s) for property ${propertyId.substring(0, 8)}...`);
        }
      } catch (clearErr) {
        console.warn('[Auth] storageToken pre-clear failed:', clearErr instanceof Error ? clearErr.message : clearErr);
      }
    }

    const deviceProfilePromise = db.deviceProfile.upsert({
      where: {
        fingerprintHash_propertyId: {
          fingerprintHash: effectiveFingerprint,
          propertyId,
        },
      },
      create: {
        tenantId,
        propertyId,
        wifiUserId,
        guestId: guestId || undefined,
        fingerprintHash: effectiveFingerprint,
        storageToken: storageToken || undefined,
        ipAddress: clientIp,
        userAgent: userAgent.substring(0, 500),
        macAddress: formattedMac || undefined,
        deviceType,
        deviceName,
        authCount: 1,
        lastAuthAt: new Date(),
        lastSeenAt: new Date(),
        isActive: true,
      },
      update: {
        ...(fingerprintHash && isSynthetic === false ? { fingerprintHash } : {}),
        wifiUserId,
        guestId: guestId || undefined,
        storageToken: storageToken || undefined,
        ipAddress: clientIp,
        userAgent: userAgent.substring(0, 500),
        ...(formattedMac ? { macAddress: formattedMac } : {}),
        deviceType,
        deviceName,
        isActive: true,
        authCount: { increment: 1 },
        lastAuthAt: new Date(),
        lastSeenAt: new Date(),
      },
    });

    const wifiDevicePromise = formattedMac
      ? upsertWiFiDeviceRegistry({
          tenantId, guestId, propertyId, macAddress: formattedMac,
          deviceName, deviceType,
          ipAddress: clientIp,
          userAgent: userAgent.substring(0, 500),
        })
      : Promise.resolve();

    await Promise.all([deviceProfilePromise, wifiDevicePromise]);

    if (isSynthetic) {
      console.log(`[Auth] DeviceProfile upserted for ${username} (synthetic-fingerprint from MAC: ${formattedMac})`);
    } else {
      console.log(`[Auth] DeviceProfile upserted for ${username} (fingerprint: ${fingerprintHash!.substring(0, 12)}...)`);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (storageToken && errMsg.includes('Unique constraint') && errMsg.includes('storageToken')) {
      console.warn(`[Auth] DeviceProfile upsert failed on storageToken — retrying without storageToken for ${username}`);
      try {
        const clientIp = getClientIp(request) || 'unknown';
        const userAgent = request.headers.get('user-agent') || '';
        const deviceType = parseDeviceTypeFromUA(userAgent);
        const deviceName = parseDeviceNameFromUA(userAgent);

        await db.deviceProfile.upsert({
          where: {
            fingerprintHash_propertyId: {
              fingerprintHash: effectiveFingerprint,
              propertyId,
            },
          },
          create: {
            tenantId,
            propertyId,
            wifiUserId,
            guestId: guestId || undefined,
            fingerprintHash: effectiveFingerprint,
            ipAddress: clientIp,
            userAgent: userAgent.substring(0, 500),
            macAddress: formattedMac || undefined,
            deviceType,
            deviceName,
            authCount: 1,
            lastAuthAt: new Date(),
            lastSeenAt: new Date(),
            isActive: true,
          },
          update: {
            ...(fingerprintHash && isSynthetic === false ? { fingerprintHash } : {}),
            wifiUserId,
            guestId: guestId || undefined,
            ipAddress: clientIp,
            userAgent: userAgent.substring(0, 500),
            ...(formattedMac ? { macAddress: formattedMac } : {}),
            deviceType,
            deviceName,
            isActive: true,
            authCount: { increment: 1 },
            lastAuthAt: new Date(),
            lastSeenAt: new Date(),
          },
        });
        console.log(`[Auth] DeviceProfile upserted for ${username} (no storageToken — collision resolved)`);
      } catch (retryErr) {
        console.warn('[Auth] DeviceProfile upsert retry failed (non-critical):', retryErr instanceof Error ? retryErr.message : retryErr);
      }
    } else {
      console.warn('[Auth] DeviceProfile upsert failed (non-critical):', errMsg);
    }
  }
}

// ══════════════════════════════════════════════════════════════
// WiFiDevice Registry Sync
// ══════════════════════════════════════════════════════════════

export async function upsertWiFiDeviceRegistry(params: {
  tenantId: string;
  guestId?: string | null;
  propertyId: string;
  macAddress?: string | null;
  deviceName?: string;
  deviceType?: string;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  if (!params.macAddress) return;

  const normalizedMac = params.macAddress.replace(/[:\-\.\s]/g, '').toUpperCase();
  if (!/^[0-9A-F]{12}$/.test(normalizedMac)) return;
  const formattedMac = normalizedMac.match(/.{2}/g)?.join(':') || null;
  if (!formattedMac) return;

  try {
    const existing = await db.wiFiDevice.findUnique({
      where: { tenantId_macAddress: { tenantId: params.tenantId, macAddress: formattedMac } },
      select: { id: true },
    });

    if (existing) {
      await db.wiFiDevice.update({
        where: { id: existing.id },
        data: {
          lastSeen: new Date(),
          ipAddress: params.ipAddress || undefined,
          userAgent: params.userAgent?.substring(0, 500),
          deviceName: params.deviceName || undefined,
          deviceType: params.deviceType || undefined,
          propertyId: params.propertyId,
        },
      });
      console.log(`[Auth] WiFiDevice registry updated: ${formattedMac}`);
    } else {
      try {
        await db.wiFiDevice.create({
          data: {
            tenantId: params.tenantId,
            guestId: params.guestId || null,
            propertyId: params.propertyId,
            macAddress: formattedMac,
            deviceName: params.deviceName || null,
            deviceType: params.deviceType || 'unknown',
            ipAddress: params.ipAddress || null,
            userAgent: params.userAgent?.substring(0, 500),
            isApproved: true,
            autoAuth: true,
            firstSeen: new Date(),
            lastSeen: new Date(),
          },
        });
        console.log(`[Auth] WiFiDevice registry created: ${formattedMac}`);
      } catch (createErr) {
        console.warn('[Auth] WiFiDevice registry creation failed (non-critical):', createErr instanceof Error ? createErr.message : createErr);
      }
    }
  } catch (err) {
    console.warn('[Auth] WiFiDevice registry upsert failed (non-critical):', err instanceof Error ? err.message : err);
  }
}

export async function isDeviceAutoAuthDisabled(tenantId: string, macAddress: string | null | undefined): Promise<boolean> {
  if (!macAddress) return false;
  const normalized = macAddress.replace(/[:\-\.\s]/g, '').toUpperCase();
  const formatted = /^[0-9A-F]{12}$/.test(normalized) ? normalized.match(/.{2}/g)?.join(':') : null;
  if (!formatted) return false;

  try {
    const device = await db.wiFiDevice.findUnique({
      where: { tenantId_macAddress: { tenantId, macAddress: formatted } },
      select: { autoAuth: true },
    });
    return device ? !device.autoAuth : false;
  } catch {
    return false;
  }
}

// ══════════════════════════════════════════════════════════════
// WiFiUserDevice Registration (MAC Binding)
// ══════════════════════════════════════════════════════════════

export async function registerUserDevice(params: {
  wifiUserId: string;
  tenantId: string;
  propertyId: string;
  guestId?: string | null;
  macAddress: string | null | undefined;
  request: NextRequest;
  source?: string;
  bodyIp?: string | null;
}): Promise<void> {
  if (!params.macAddress) return;

  const normalized = params.macAddress.replace(/[:\-\.\s]/g, '').toUpperCase();
  if (!/^[0-9A-F]{12}$/.test(normalized)) return;
  const formattedMac = normalized.match(/.{2}/g)?.join(':');
  if (!formattedMac) return;

  const { wifiUserId, tenantId, propertyId, guestId, request, source = 'login' } = params;
  const clientIp = getClientIpString(request, params.bodyIp);
  const userAgent = request.headers.get('user-agent') || '';
  const deviceType = parseDeviceTypeFromUA(userAgent);
  const deviceName = parseDeviceNameFromUA(userAgent);

  try {
    const existingOwner = await db.wiFiUserDevice.findFirst({
      where: {
        macAddress: formattedMac,
        wifiUserId: { not: wifiUserId },
      },
      include: {
        wifiUser: { select: { id: true, username: true, status: true, validUntil: true } },
      },
    });
    if (existingOwner) {
      const owner = existingOwner.wifiUser;
      const now = new Date();
      const ownerActive = owner.status === 'active' && new Date(owner.validUntil) > now;

      if (ownerActive) {
        // Also verify the owner has an actual active RADIUS session (radacct).
        // If the session was disconnected but the WiFiUser validUntil hasn't expired yet,
        // allow the MAC to be transferred to the new user.
        let hasActiveRadacct = false;
        try {
          const activeSession = await db.$queryRaw<Array<{ count: bigint }>>`
            SELECT COUNT(*)::bigint as count FROM radacct
            WHERE username = ${owner.username} AND acctstoptime IS NULL
          `;
          hasActiveRadacct = (Number(activeSession[0]?.count) || 0) > 0;
        } catch {
          // If radacct check fails, assume owner is active (safe default)
          hasActiveRadacct = true;
        }

        if (hasActiveRadacct) {
          console.warn(`[Auth:Device] MAC ${formattedMac} is owned by active user (owner: ${owner.username}). Rejecting duplicate registration for ${wifiUserId}.`);
          logIdentityVerification({
            tenantId, propertyId,
            username: wifiUserId,
            verificationMethod: source,
            verificationStatus: 'failed',
            failureReason: `MAC_CONFLICT: ${formattedMac} already registered to active user (${owner.username})`,
            ipAddress: clientIp, macAddress: formattedMac,
          });
          return;
        }

        // Owner has no active RADIUS session — safe to transfer MAC
        console.log(`[Auth:Device] MAC ${formattedMac} owner ${owner.username} has no active RADIUS session. Transferring to ${wifiUserId}.`);
      }

      console.log(`[Auth:Device] MAC ${formattedMac} previous owner ${owner.username} is inactive. Transferring to ${wifiUserId} (safety net).`);
      await db.wiFiUserDevice.update({
        where: { id: existingOwner.id },
        data: {
          wifiUserId,
          tenantId,
          propertyId,
          guestId: guestId || undefined,
          lastSeen: new Date(),
          source: 'mac_transfer_safety',
          ipAddress: clientIp,
          userAgent: userAgent.substring(0, 500),
        },
      });
      console.log(`[Auth:Device] Transferred MAC ${formattedMac} to ${wifiUserId} (source: ${source})`);
      return;
    }

    const existingCount = await db.wiFiUserDevice.count({
      where: { wifiUserId, isActive: true },
    });
    const isPrimary = existingCount === 0;

    await db.wiFiUserDevice.upsert({
      where: {
        wifiUserId_macAddress: {
          wifiUserId,
          macAddress: formattedMac,
        },
      },
      create: {
        tenantId,
        propertyId,
        wifiUserId,
        guestId: guestId || undefined,
        macAddress: formattedMac,
        deviceName,
        deviceType,
        userAgent: userAgent.substring(0, 500),
        ipAddress: clientIp,
        isPrimary,
        source,
        lastSeen: new Date(),
      },
      update: {
        ipAddress: clientIp,
        userAgent: userAgent.substring(0, 500),
        deviceName,
        deviceType,
        lastSeen: new Date(),
        source,
      },
    });

    console.log(`[Auth:Device] Registered ${formattedMac} for ${wifiUserId} (source: ${source}, primary: ${isPrimary})`);
  } catch (err) {
    console.warn('[Auth:Device] Failed to register device (non-critical):', err instanceof Error ? err.message : err);
  }
}

// ══════════════════════════════════════════════════════════════
// MAC Binding Enforcement
// ══════════════════════════════════════════════════════════════

export async function isMacBindingEnforced(propertyId: string, tenantId: string): Promise<boolean> {
  try {
    const settings = await db.wiFiSettings.findFirst({
      where: { propertyId, tenantId, key: 'wifi_settings' },
      select: { value: true },
    });

    if (settings?.value) {
      const config = JSON.parse(settings.value);
      return config.mac_binding === true || config.macBinding === true;
    }
    return false;
  } catch (err) {
    console.error('[MacBinding] Failed to check MAC binding enforcement:', err);
    return process.env.NODE_ENV === 'production'; // fail-closed in prod
  }
}

export async function isMacRegisteredForUser(wifiUserId: string, macAddress: string): Promise<boolean> {
  if (!macAddress) return false;

  const normalized = macAddress.replace(/[:\-\.\s]/g, '').toUpperCase();
  if (!/^[0-9A-F]{12}$/.test(normalized)) return false;
  const formattedMac = normalized.match(/.{2}/g)?.join(':');
  if (!formattedMac) return false;

  try {
    const device = await db.wiFiUserDevice.findUnique({
      where: {
        wifiUserId_macAddress: { wifiUserId, macAddress: formattedMac },
      },
      select: { isActive: true },
    });
    return device?.isActive === true;
  } catch {
    return false;
  }
}

export async function isDeviceBlocked(wifiUserId: string, macAddress: string): Promise<boolean> {
  if (!macAddress) return false;

  const normalized = macAddress.replace(/[:\-\.\s]/g, '').toUpperCase();
  if (!/^[0-9A-F]{12}$/.test(normalized)) return false;
  const formattedMac = normalized.match(/.{2}/g)?.join(':');
  if (!formattedMac) return false;

  try {
    const device = await db.wiFiUserDevice.findUnique({
      where: {
        wifiUserId_macAddress: { wifiUserId, macAddress: formattedMac },
      },
      select: { isActive: true },
    });
    return device !== null && device.isActive === false;
  } catch (err) {
    console.error('[DeviceBlock] Failed to check device block status:', err);
    return process.env.NODE_ENV === 'production'; // fail-closed in prod
  }
}

export interface MacOwnershipResult {
  allowed: boolean;
  transferred?: boolean;
  previousOwnerUsername?: string;
}

export async function resolveMacOwnership(
  macAddress: string | null | undefined,
  currentWifiUserId: string,
  tenantId?: string | null,
  propertyId?: string | null,
  guestId?: string | null,
): Promise<MacOwnershipResult> {
  if (!macAddress) return { allowed: true };

  const normalized = macAddress.replace(/[:\-\.\s]/g, '').toUpperCase();
  if (!/^[0-9A-F]{12}$/.test(normalized)) return { allowed: true };
  const formattedMac = normalized.match(/.{2}/g)?.join(':');
  if (!formattedMac) return { allowed: true };

  try {
    const existingDevice = await db.wiFiUserDevice.findFirst({
      where: {
        macAddress: formattedMac,
        wifiUserId: { not: currentWifiUserId },
      },
      include: {
        wifiUser: {
          select: { id: true, username: true, status: true, validUntil: true },
        },
      },
    });

    if (!existingDevice) return { allowed: true };

    const owner = existingDevice.wifiUser;
    const now = new Date();
    const ownerActive = owner.status === 'active' && new Date(owner.validUntil) > now;

    if (ownerActive) {
      console.warn(
        `[Auth:MAC] Cross-user MAC conflict: ${formattedMac} is owned by active user "${owner.username}" (${owner.id}). ` +
        `Login attempt by user ${currentWifiUserId} is REJECTED.`
      );
      return { allowed: false, previousOwnerUsername: owner.username };
    }

    console.log(
      `[Auth:MAC] Transferring MAC ownership: ${formattedMac} from inactive user "${owner.username}" (${owner.id}) ` +
      `to current user ${currentWifiUserId}. Previous owner status: ${owner.status}, validUntil: ${owner.validUntil}`
    );

    await db.wiFiUserDevice.update({
      where: { id: existingDevice.id },
      data: {
        wifiUserId: currentWifiUserId,
        tenantId: tenantId || undefined,
        propertyId: propertyId || undefined,
        guestId: guestId || undefined,
        lastSeen: new Date(),
        source: 'mac_transfer',
      },
    });

    return { allowed: true, transferred: true, previousOwnerUsername: owner.username };
  } catch (err) {
    console.error('[Auth:MAC] resolveMacOwnership failed (non-critical):', err instanceof Error ? err.message : err);
    return { allowed: true };
  }
}

// ══════════════════════════════════════════════════════════════
// OTP Store (PG-backed)
// ══════════════════════════════════════════════════════════════

console.log('[OTP] Using PostgreSQL-backed OTP store (multi-instance safe)');

// H15 fix: Prevent duplicate timers across PM2 workers
if (!(globalThis as any).__otpCleanupStarted) {
  (globalThis as any).__otpCleanupStarted = true;
  setInterval(() => {
    otpCleanup().then((n) => {
      if (n > 0) console.log(`[OTP:PG] Cleaned up ${n} expired entries`);
    }).catch(() => {});
  }, 5 * 60_000).unref();
}

export function generateOtp(): string {
  return randomInt(100000, 999999).toString();
}

// ══════════════════════════════════════════════════════════════
// OTP Rate Limiting
// ══════════════════════════════════════════════════════════════

export const OTP_MAX_REQUESTS = 5;
export const OTP_WINDOW_MS = 15 * 60 * 1000;
export const OTP_MAX_VERIFY_ATTEMPTS = parseInt(process.env.WIFI_OTP_MAX_ATTEMPTS || '5', 10);

export async function checkOtpRateLimit(phone: string): Promise<{ allowed: boolean; retryAfterSec: number }> {
  return otpRateLimit(phone, OTP_MAX_REQUESTS, OTP_WINDOW_MS);
}

// H15 fix: Prevent duplicate timers across PM2 workers
if (!(globalThis as any).__otpRateCleanupStarted) {
  (globalThis as any).__otpRateCleanupStarted = true;
  setInterval(() => {
    otpRateCleanup().catch(() => {});
  }, 60_000).unref();
}

// ══════════════════════════════════════════════════════════════
// Phone / Email Validation
// ══════════════════════════════════════════════════════════════

export function isValidPhoneNumber(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

export function normalizePhoneNumberLocal(phone: string): string {
  return normalizePhoneNumber(phone, process.env.SMS_DEFAULT_COUNTRY_CODE || process.env.DEFAULT_COUNTRY_CODE || undefined);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function maskEmailAddr(email: string): string {
  const atIdx = email.indexOf('@');
  if (atIdx <= 1) return '****';
  const local = email.slice(0, atIdx);
  return local[0] + '***' + email.slice(atIdx);
}

// ══════════════════════════════════════════════════════════════
// Identity Verification Logging
// ══════════════════════════════════════════════════════════════

export function logIdentityVerification(params: {
  tenantId: string;
  propertyId?: string | null;
  sessionId?: string | null;
  username: string;
  verificationMethod: string;
  verifiedIdentity?: string | null;
  verificationStatus: 'verified' | 'failed' | 'skipped';
  ipAddress: string;
  macAddress?: string | null;
  failureReason?: string | null;
}): void {
  db.wiFiIdentityLog.create({
    data: {
      tenantId: params.tenantId,
      propertyId: params.propertyId || null,
      sessionId: params.sessionId || null,
      username: params.username,
      verificationMethod: params.verificationMethod,
      verifiedIdentity: params.verifiedIdentity || null,
      verificationStatus: params.verificationStatus,
      ipAddress: params.ipAddress,
      macAddress: params.macAddress || null,
      failureReason: params.failureReason || null,
      verifiedAt: params.verificationStatus === 'verified' ? new Date() : null,
    },
  }).catch(err => {
    console.warn('[IdentityLog] Failed to create identity log:', err instanceof Error ? err.message : err);
  });
}

// ══════════════════════════════════════════════════════════════
// IP Pool Validation
// ══════════════════════════════════════════════════════════════

/** Strip IPv6-mapped prefix and normalize to plain IPv4 */
export function normalizeIp(raw: string | null): string | null {
  if (!raw) return null;
  let ip = raw.trim();
  if (ip.startsWith('[') && ip.includes(']')) {
    ip = ip.slice(1, ip.indexOf(']'));
  }
  const v4Match = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (v4Match) return v4Match[1];
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) return ip;
  if (ip === '::1' || ip === '127.0.0.1') return null;
  return null;
}

export function extractClientIp(request: NextRequest): string | null {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const firstIp = xff.split(',')[0].trim();
    if (firstIp) return firstIp;
  }
  const xRealIp = request.headers.get('x-real-ip');
  if (xRealIp) return xRealIp.trim();
  return null;
}

export function getClientIpString(request: NextRequest, bodyIp?: string | null | undefined): string {
  const headerIp = normalizeIp(extractClientIp(request));
  if (headerIp) return headerIp;
  if (bodyIp) {
    const normalizedBodyIp = normalizeIp(bodyIp);
    if (normalizedBodyIp) return normalizedBodyIp;
  }
  return '0.0.0.0';
}

async function validateClientIpInPool(
  clientIp: string,
  allowedPoolIds?: string[] | 'ANY' | null
): Promise<MatchedPool | null> {
  try {
    const hasPoolFilter = Array.isArray(allowedPoolIds) && allowedPoolIds.length > 0;

    const result = await db.$queryRaw<Array<{
      id: string;
      name: string;
      subnet: string | null;
      gateway: string | null;
      "isDefault": boolean;
      "natMode": string;
      "snatAlgorithm": string | null;
      "snatRanges": any;
      "natWanInterface": string | null;
      "hairpinNat": boolean;
      "snatStickyMinutes": number;
    }>>(Prisma.sql`
      SELECT DISTINCT ON (ip.id)
        ip.id, ip.name, ip.subnet::text as subnet, ip.gateway::text as gateway,
        ip."captivePortal", ip."isDefault",
        ip."natMode", ip."snatAlgorithm", ip."snatRanges", ip."natWanInterface", ip."hairpinNat", ip."snatStickyMinutes"
      FROM "IpPoolRange" r
      JOIN "IpPool" ip ON ip.id = r."poolId"
      WHERE ${clientIp}::inet BETWEEN r."startIp" AND r."endIp"
        AND ip.enabled = true
        ${hasPoolFilter ? Prisma.sql`AND ip.id = ANY(${allowedPoolIds}::uuid[])` : Prisma.sql`AND true`}
      ORDER BY ip.id, ip."isDefault" DESC
      LIMIT 1
    `);

    if (result.length === 0) return null;

    const pool = result[0];
    return {
      poolId: pool.id,
      poolName: pool.name,
      subnet: pool.subnet,
      gateway: pool.gateway,
      captivePortal: true,
      isDefault: pool["isDefault"],
      natMode: pool["natMode"] || 'private_masq',
      snatAlgorithm: pool["snatAlgorithm"],
      snatRanges: pool["snatRanges"] as { startIp: string; endIp: string }[] | null,
      natWanInterface: pool["natWanInterface"] || null,
      hairpinNat: pool["hairpinNat"] || false,
      snatStickyMinutes: pool["snatStickyMinutes"] || 0,
    };
  } catch (err) {
    console.error('[IP Pool Validation] Query failed:', err);
    return null;
  }
}

/**
 * Resolve NAT parameters from a matched IP pool.
 *
 * For SNAT pools, allocates a SNAT IP from the pool's SNAT ranges.
 * If allocation fails (exhausted, bad config), falls back to masquerade.
 *
 * Returns { natMode, snatIp } to spread into activateUserFirewall().
 */
export async function resolvePoolNatParams(
  pool: MatchedPool,
  clientIp: string,
): Promise<{ natMode: string; snatIp?: string; natWanInterface?: string | null; hairpinNat?: boolean; snatStickyMinutes?: number }> {
  const natMode = pool.natMode || 'private_masq';

  if (natMode === 'private_snat' && pool.poolId !== 'sandbox') {
    const snatIp = await allocateSnatIp(
      pool.poolId,
      clientIp,
      pool.snatAlgorithm,
      pool.snatRanges,
    );
    if (!snatIp) {
      console.warn(`[NAT] SNAT pool exhausted for pool ${pool.poolId}, falling back to masquerade for ${clientIp}`);
      return { natMode: 'private_masq', natWanInterface: pool.natWanInterface };
    }
    return { natMode: 'private_snat', snatIp, natWanInterface: pool.natWanInterface, hairpinNat: pool.hairpinNat, snatStickyMinutes: pool.snatStickyMinutes };
  }

  return { natMode, natWanInterface: pool.natWanInterface, hairpinNat: pool.hairpinNat, snatStickyMinutes: pool.snatStickyMinutes };
}

/**
 * Backfill the `snatIp` column on an existing radacct row after SNAT allocation.
 *
 * Why this exists: `createAccountingSession()` is typically called BEFORE SNAT
 * allocation completes (the SNAT IP is resolved by `resolvePoolNatParams()`
 * which runs later in the auth flow). The INSERT therefore writes `snatIp = NULL`,
 * and we need a follow-up UPDATE to populate the audit trail.
 *
 * The UPDATE is idempotent: `AND "snatIp" IS NULL` prevents overwriting a
 * value that was already set (e.g. by a concurrent login of the same IP).
 *
 * Failure is non-fatal — the audit trail is best-effort. The function catches
 * all errors and logs them at warn level.
 */
export async function backfillSnatIpInRadacct(
  acctSessionId: string | null | undefined,
  snatIp: string | null | undefined,
): Promise<void> {
  if (!acctSessionId || !snatIp) return;
  try {
    await db.$executeRaw(Prisma.sql`
      UPDATE radacct
      SET "snatIp" = ${snatIp}::inet,
          updatedat = NOW(),
          acctupdatetime = NOW()
      WHERE acctsessionid = ${acctSessionId}
        AND "snatIp" IS NULL
    `);
  } catch (err) {
    console.warn(`[NAT Audit] Failed to backfill snatIp=${snatIp} for acctsessionid=${acctSessionId}:`, err instanceof Error ? err.message : err);
  }
}

export function resolveAllowedPoolIds(
  planIpPoolId?: string | null,
  userIpPoolId?: string | null,
  hasPlan?: boolean,
  planPoolIds?: string[],
): string[] | 'ANY' | null {
  if (userIpPoolId) return [userIpPoolId];
  if (planPoolIds && planPoolIds.length > 0) return planPoolIds;
  if (planIpPoolId) return [planIpPoolId];
  if (hasPlan) return 'ANY';
  return 'ANY';
}

export async function getValidatedPool(request: NextRequest, allowedPoolIds?: string[] | 'ANY' | null): Promise<MatchedPool | null> {
  const rawIp = extractClientIp(request);
  const clientIp = normalizeIp(rawIp);

  if (!clientIp) {
    if (process.env.NODE_ENV === 'production') {
      console.warn(`[Guest Auth] IP pool check REJECTED: client IP is ${rawIp || 'null'} (normalized to null)`);
      return null;
    }
    console.warn(`[Guest Auth] IP pool check: client IP is ${rawIp || 'null'} (dev/sandbox env) — allowing with sandbox pool`);
    return {
      poolId: 'sandbox',
      poolName: 'Sandbox',
      subnet: null,
      gateway: null,
      captivePortal: true,
      isDefault: true,
      natMode: 'private_masq',
      snatAlgorithm: null,
      snatRanges: null,
      natWanInterface: null,
      hairpinNat: false,
      snatStickyMinutes: 0,
    };
  }

  if (allowedPoolIds === null) {
    allowedPoolIds = 'ANY';
  }

  const pool = await validateClientIpInPool(clientIp, allowedPoolIds);
  if (!pool) {
    if (Array.isArray(allowedPoolIds)) {
      console.warn(`[Guest Auth] IP pool check REJECTED: ${clientIp} is not in any allowed pool (allowed: [${allowedPoolIds.join(', ')}])`);
    } else {
      console.warn(`[Guest Auth] IP pool check REJECTED: ${clientIp} is not in any allocated IP pool`);
    }
    return null;
  }

  console.log(`[Guest Auth] IP pool check PASSED: ${clientIp} → pool "${pool.poolName}" (${pool.subnet || 'no subnet'})${Array.isArray(allowedPoolIds) ? ' [plan-restricted]' : ''}`);
  return pool;
}

// ══════════════════════════════════════════════════════════════
// Session Limit Checks
// ══════════════════════════════════════════════════════════════

/**
 * Check if a user has reached their concurrent session limit.
 *
 * Uses a non-blocking advisory lock pattern:
 *   1. Try pg_try_advisory_xact_lock — if available, count with full TOCTOU protection
 *   2. If lock is busy (concurrent login), count WITHOUT the lock — the tiny TOCTOU
 *      window is acceptable because RADIUS Simultaneous-Use provides secondary enforcement
 *   3. No blocking wait → no P2028 transaction timeout under high concurrency
 *
 * Previous implementation used pg_advisory_xact_lock (blocking) inside a transaction
 * with the default 5000ms timeout. Under high concurrency (e.g., 161+ simultaneous
 * logins for the same user), the blocking lock serialized all requests, causing
 * queued transactions to exceed the 5s timeout → P2028 error → legitimate logins
 * rejected with "Session limit reached".
 */
export async function isSessionLimitReached(username: string, maxSessions: number): Promise<{ limitReached: boolean; releaseLock: () => Promise<void> }> {
  const noop = async () => {};
  if (maxSessions <= 0) return { limitReached: false, releaseLock: noop };

  try {
    const result = await db.$transaction(async (tx) => {
      // Non-blocking lock attempt: returns true if lock acquired, false if busy
      const lockResult = await tx.$queryRaw<Array<{ pg_try_advisory_xact_lock: boolean }>>(
        Prisma.sql`SELECT pg_try_advisory_xact_lock(hashtext(${username}::text)) as pg_try_advisory_xact_lock`
      );
      const lockAcquired = lockResult[0]?.pg_try_advisory_xact_lock ?? false;

      if (!lockAcquired) {
        // Expected under concurrency — RADIUS Simultaneous-Use provides secondary enforcement
        // Only log at debug level to avoid noise under load
        if (process.env.DEBUG_SESSION_LIMIT === 'true') {
          console.warn(`[Session Limit] Advisory lock busy for ${username}, counting without lock (RADIUS Simultaneous-Use is secondary enforcement)`);
        }
      }

      // Count active sessions regardless — lock prevents TOCTOU when acquired,
      // RADIUS Simultaneous-Use covers the brief window when not acquired
      return await tx.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint as count
        FROM radacct
        WHERE username = ${username}
          AND acctstoptime IS NULL
          AND (acctstatus IS NULL OR acctstatus = '' OR acctstatus = 'start')
          AND acctterminatecause IS NULL
      `);
    }, { maxWait: 5000, timeout: 15000 });

    const activeCount = Number(result[0]?.count ?? 0);
    return { limitReached: activeCount >= maxSessions, releaseLock: noop };
  } catch (err) {
    console.error('[Session Limit] Failed to count active sessions:', err);
    // Fail-open on DB error: allow login since the error is likely transient
    // (e.g., DB connectivity), not a real limit condition. RADIUS Simultaneous-Use
    // provides secondary enforcement. Failing closed under high concurrency
    // caused P2028 timeouts to block all legitimate logins.
    return { limitReached: false, releaseLock: noop };
  }
}

async function findDeviceProfileForUser(
  username: string,
  fingerprintHash?: string | null,
  storageToken?: string | null,
  macAddress?: string | null,
): Promise<{ wifiUserId: string; deviceProfileId: string } | null> {
  try {
    const wifiUser = await db.wiFiUser.findUnique({
      where: { username },
      select: { id: true },
    });
    if (!wifiUser) return null;

    const strategies: Prisma.DeviceProfileWhereInput[] = [];

    if (storageToken) {
      strategies.push({ storageToken, isActive: true, wifiUserId: wifiUser.id });
    }
    if (fingerprintHash) {
      strategies.push({ fingerprintHash, isActive: true, wifiUserId: wifiUser.id });
    }
    if (macAddress) {
      const stripped = macAddress.replace(/[:\-\.\s]/g, '').toUpperCase();
      const formattedMac = stripped.length === 12
        ? stripped.match(/.{2}/g)?.join(':') || null
        : null;
      if (formattedMac) {
        strategies.push({ macAddress: formattedMac, isActive: true, wifiUserId: wifiUser.id });
      }
    }

    if (strategies.length === 0) return null;

    const profile = await db.deviceProfile.findFirst({
      where: { OR: strategies },
      select: { id: true, wifiUserId: true },
    });

    if (profile) {
      return { wifiUserId: profile.wifiUserId, deviceProfileId: profile.id };
    }

    return null;
  } catch (err) {
    console.warn('[Auth] findDeviceProfileForUser failed (non-critical):', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function handleSessionLimitWithDeviceFallback(
  username: string,
  maxSessions: number,
  fingerprintHash?: string | null,
  storageToken?: string | null,
  macAddress?: string | null,
): Promise<{ limitReached: boolean }> {
  const check = await isSessionLimitReached(username, maxSessions);
  if (!check.limitReached) return { limitReached: false };

  if (macAddress) {
    const normalizedMac = macAddress.replace(/[:\-\.\s]/g, '').toUpperCase();
    const formattedMac = normalizedMac.length === 12
      ? normalizedMac.match(/.{2}/g)?.join(':') || null
      : null;

    if (formattedMac) {
      try {
        const closedCount = await db.$executeRaw(Prisma.sql`
          UPDATE radacct SET acctstoptime = NOW(), acctterminatecause = 'Device-Reauth-Roaming',
           acctstatus = 'stop', acctupdatetime = NOW(), updatedat = NOW()
           WHERE username = ${username} AND acctstoptime IS NULL AND callingstationid = ${formattedMac}
        `);
        if (closedCount > 0) {
          console.log(`[Auth:DeviceReauth] Closed ${closedCount} session(s) for ${username} — same MAC ${formattedMac} (device roam/reconnect)`);
          const recheck = await isSessionLimitReached(username, maxSessions);
          if (!recheck.limitReached) {
            console.log(`[Auth:DeviceReauth] Session limit now clear for ${username} — proceeding with login`);
          }
          return recheck;
        }
      } catch (err) {
        console.error('[Auth:DeviceReauth] Failed to close MAC-matched session:', err);
      }
    }
  }

  if (maxSessions > 1) {
    console.warn(`[Auth:DeviceReauth] Session limit reached for ${username} (maxDevices=${maxSessions}), no MAC match — rejecting new device`);
    return { limitReached: true };
  }

  const deviceMatch = await findDeviceProfileForUser(username, fingerprintHash, storageToken, macAddress);
  if (!deviceMatch) {
    console.warn(`[Auth:DeviceReauth] Session limit reached for ${username}, no device signature match — rejecting`);
    return { limitReached: true };
  }

  try {
    const closedCount = await db.$executeRaw(Prisma.sql`
      UPDATE radacct SET acctstoptime = NOW(), acctterminatecause = 'Device-Reauth-Roaming',
       acctstatus = 'stop', acctupdatetime = NOW(), updatedat = NOW()
       WHERE username = ${username} AND acctstoptime IS NULL
    `);

    await db.$executeRaw(Prisma.sql`
      UPDATE "WiFiSession" SET status = 'disconnected', "endTime" = NOW(), "updatedAt" = NOW()
       WHERE status = 'active' AND username = ${username}
    `);

    console.log(`[Auth:DeviceReauth] Closed ${closedCount} active session(s) for ${username} — single-device plan, fingerprint match (device replaced)`);
  } catch (err) {
    console.error('[Auth:DeviceReauth] Failed to close sessions for device reauth:', err);
  }

  const recheck = await isSessionLimitReached(username, maxSessions);
  if (!recheck.limitReached) {
    console.log(`[Auth:DeviceReauth] Session limit now clear for ${username} — proceeding with login`);
  }
  return recheck;
}

// ══════════════════════════════════════════════════════════════
// MAC Address Resolution
// ══════════════════════════════════════════════════════════════

export async function resolveMacFromHeaders(request: NextRequest): Promise<string | null> {
  const headerSources = [
    'x-mac-address',
    'client-mac',
    'mac',
    'nas-mac',
    'calling-station-id',
    'x-client-mac',
    'x-forwarded-mac',
  ];
  for (const header of headerSources) {
    const value = request.headers.get(header);
    if (value) {
      const macMatch = value.match(/([0-9A-Fa-f]{2}[:\-\.]){5}[0-9A-Fa-f]{2}/);
      if (macMatch) {
        const normalized = macMatch[0].replace(/[:\-\.\s]/g, '').toUpperCase();
        if (/^[0-9A-F]{12}$/.test(normalized)) {
          return normalized.match(/.{2}/g)?.join(':') || null;
        }
      }
    }
  }
  return null;
}

export async function resolveMacAddress(
  request: NextRequest,
  bodyMac?: string,
  clientIp?: string,
): Promise<string | null> {
  if (bodyMac) {
    const normalized = bodyMac.replace(/[:\-\.\s]/g, '').toUpperCase();
    if (/^[0-9A-F]{12}$/.test(normalized)) {
      return normalized.match(/.{2}/g)?.join(':') || null;
    }
  }

  const headerSources = [
    'x-mac-address',
    'client-mac',
    'mac',
    'nas-mac',
    'calling-station-id',
    'x-client-mac',
    'x-forwarded-mac',
  ];
  for (const header of headerSources) {
    const value = request.headers.get(header);
    if (value) {
      const macMatch = value.match(/([0-9A-Fa-f]{2}[:\-\.]){5}[0-9A-Fa-f]{2}/);
      if (macMatch) {
        const normalized = macMatch[0].replace(/[:\-\.\s]/g, '').toUpperCase();
        if (/^[0-9A-F]{12}$/.test(normalized)) {
          return normalized.match(/.{2}/g)?.join(':') || null;
        }
      }
    }
  }

  if (clientIp && clientIp !== '0.0.0.0' && clientIp !== 'unknown') {
    try {
      const leaseResult = await db.$queryRaw<Array<{ "macAddress": string | null }>>(Prisma.sql`
        SELECT "macAddress" FROM "DhcpLease"
        WHERE "ipAddress" = ${clientIp} AND state = 'active'
        ORDER BY "lastSeenAt" DESC
        LIMIT 1
      `);

      if (leaseResult.length > 0 && leaseResult[0].macAddress) {
        const normalized = leaseResult[0].macAddress.replace(/[:\-\.\s]/g, '').toUpperCase();
        if (/^[0-9A-F]{12}$/.test(normalized)) {
          console.log(`[MAC] Resolved from DHCP lease: IP=${clientIp} → MAC=${normalized.match(/.{2}/g)?.join(':')}`);
          return normalized.match(/.{2}/g)?.join(':') || null;
        }
      }
    } catch (err) {
      console.warn('[MAC] DHCP lease lookup failed:', err instanceof Error ? err.message : err);
    }
  }

  return null;
}

// ══════════════════════════════════════════════════════════════
// LDAP Authentication
// ══════════════════════════════════════════════════════════════

/**
 * Escapes a value for safe interpolation into an LDAP search filter (RFC 4515).
 * All RFC 4515 special characters are escaped as \xx (two-digit hex).
 */
function escapeLdapFilter(value: string): string {
  return value.replace(
    /[\x00()*\\&|!~<>"';+/=?]/g,
    (ch) => `\\${ch.charCodeAt(0).toString(16).padStart(2, '0')}`
  );
}

export async function authenticateViaLdap(params: {
  serverUrl: string;
  baseDn: string;
  bindDn: string;
  bindPassword: string;
  usernameAttr: string;
  username: string;
  password: string;
  useTls: boolean;
  timeout: number;
  filterGroup?: string | null;
}): Promise<{ userDn: string; userAttributes: Record<string, string | string[]> }> {
  const ldapjs = await getLdapjs();
  let client: InstanceType<typeof ldapjs.Client> | null = null;
  let userClient: InstanceType<typeof ldapjs.Client> | null = null;

  try {
    client = ldapjs.createClient({
      url: params.serverUrl,
      connectTimeout: params.timeout * 1000,
      timeout: params.timeout * 1000,
      tlsOptions: params.useTls ? { rejectUnauthorized: process.env.NODE_ENV !== 'development' } : undefined,
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`LDAP connection timeout after ${params.timeout}s`)), params.timeout * 1000);
      client!.on('connectError', (err: Error) => { clearTimeout(timer); reject(err); });
      client!.on('error', (err: Error) => { clearTimeout(timer); reject(err); });
      client!.on('connect', () => {
        client!.bind(params.bindDn, params.bindPassword, (bindErr) => {
          clearTimeout(timer);
          if (bindErr) reject(new Error(`Service account bind failed: ${bindErr.message}`));
          else resolve();
        });
      });
    });

    const safeUsername = escapeLdapFilter(params.username);
    const filter = params.filterGroup
      ? `(&(${params.usernameAttr}=${safeUsername})(memberOf=${params.filterGroup}))`
      : `(${params.usernameAttr}=${safeUsername})`;

    const searchEntries: InstanceType<typeof ldapjs.SearchEntry>[] = [];
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`LDAP search timeout after ${params.timeout}s`)), params.timeout * 1000);
      client!.search(params.baseDn, { filter, scope: 'sub' }, (searchErr, res) => {
        if (searchErr) { clearTimeout(timer); reject(new Error(`Search failed: ${searchErr.message}`)); return; }
        res.on('searchEntry', (entry: any) => { searchEntries.push(entry); });
        res.on('end', () => { clearTimeout(timer); resolve(); });
        res.on('error', (err: Error) => { clearTimeout(timer); reject(new Error(`Search error: ${err.message}`)); });
      });
    });

    if (searchEntries.length === 0) throw new Error('User not found');

    const userDn = searchEntries[0].objectName;
    const userAttributes: Record<string, string | string[]> = {};
    const attrs = searchEntries[0].attributes;
    for (const attr of attrs) {
      const vals = Array.isArray(attr.vals) ? attr.vals : [attr.vals];
      if (vals.length === 1) userAttributes[attr.type] = vals[0].toString('utf8');
      else if (vals.length > 1) userAttributes[attr.type] = vals.map((v) => v.toString('utf8'));
    }

    userClient = ldapjs.createClient({
      url: params.serverUrl,
      connectTimeout: params.timeout * 1000,
      timeout: params.timeout * 1000,
      tlsOptions: params.useTls ? { rejectUnauthorized: process.env.NODE_ENV !== 'development' } : undefined,
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`LDAP bind timeout after ${params.timeout}s`)), params.timeout * 1000);
      userClient!.on('connectError', (err: Error) => { clearTimeout(timer); reject(err); });
      userClient!.on('error', (err: Error) => { clearTimeout(timer); reject(err); });
      userClient!.on('connect', () => {
        userClient!.bind(userDn, params.password, (bindErr) => {
          clearTimeout(timer);
          if (bindErr) reject(new Error(`User bind failed: ${bindErr.message}`));
          else resolve();
        });
      });
    });

    return { userDn, userAttributes };
  } finally {
    const close = async (c: InstanceType<typeof ldapjs.Client> | null) => {
      if (!c) return;
      try { await new Promise<void>((r) => c.unbind(() => r())); } catch { /* ignore */ }
      try { c.destroy(); } catch { /* ignore */ }
    };
    await close(client);
    await close(userClient);
  }
}

// ══════════════════════════════════════════════════════════════
// Response Helpers
// ══════════════════════════════════════════════════════════════

export function successResponse(
  data: Record<string, unknown>,
  gatewayCreds?: { username: string; password: string },
  gateway?: ExternalGatewayConfig | null,
  request?: NextRequest | null,
  overrideIp?: string | null
) {
  const gatewayFields = gatewayCreds && gateway
    ? buildGatewayAuthResponse(gateway, gatewayCreds.username, gatewayCreds.password)
    : {};
  const clientIp = overrideIp || (request ? getClientIpString(request) : undefined);
  return NextResponse.json({ success: true, data: { ...data, ...(clientIp && clientIp !== '0.0.0.0' ? { clientIp } : {}), ...gatewayFields } });
}

export function errorResponse(code: string, message: string, status = 400) {
  const correlationId = `err_${Date.now().toString(36)}_${randomInt(1000, 9999)}`;
  return NextResponse.json(
    { success: false, error: { code, message, correlationId } },
    { status }
  );
}

// ══════════════════════════════════════════════════════════════
// Enriched Error with Device Data
// ══════════════════════════════════════════════════════════════

interface ActiveDevice {
  sessionId: string;
  acctUniqueId: string;
  mac: string | null;
  ip: string | null;
  deviceName: string | null;
  startTime: string;
  userAgent: string | null;
}

export async function errorResponseWithDeviceData(
  code: string,
  message: string,
  username: string,
  portalSlug: string | undefined,
  status = 400
) {
  const correlationId = `err_${Date.now().toString(36)}_${randomInt(1000, 9999)}`;

  const activeDevices: ActiveDevice[] = [];
  let deviceManagementEnabled = false;

  try {
    const sessions = await db.$queryRaw<Array<{
      acctuniqueid: string;
      acctsessionid: string;
      callingstationid: string | null;
      framedipaddress: string | null;
      acctstarttime: Date;
      "loginType": string | null;
    }>>(Prisma.sql`
      SELECT acctuniqueid, acctsessionid, callingstationid, framedipaddress,
             acctstarttime, "loginType"
      FROM radacct
      WHERE username = ${username} AND acctstoptime IS NULL
      ORDER BY acctstarttime DESC
    `);

    const macs = sessions.map(s => s.callingstationid).filter((m): m is string => !!m);

    let deviceInfoByMac: Record<string, { deviceName: string | null; deviceType: string | null; userAgent: string | null }> = {};
    if (macs.length > 0) {
      try {
        const deviceRows = await db.$queryRaw<Array<{
          "macAddress": string;
          "deviceName": string | null;
          "deviceType": string | null;
          "userAgent": string | null;
        }>>(Prisma.sql`
          SELECT "macAddress", "deviceName", "deviceType", "userAgent"
          FROM "WiFiDevice"
          WHERE "macAddress" = ANY(${macs}::text[])
        `);
        for (const row of deviceRows) {
          deviceInfoByMac[row.macAddress] = {
            deviceName: row.deviceName,
            deviceType: row.deviceType,
            userAgent: row.userAgent,
          };
        }
      } catch { /* non-fatal */ }
    }

    for (const s of sessions) {
      const macAddr = s.callingstationid || null;
      const info = macAddr ? deviceInfoByMac[macAddr] : null;
      activeDevices.push({
        sessionId: s.acctsessionid,
        acctUniqueId: s.acctuniqueid,
        mac: macAddr,
        ip: s.framedipaddress,
        deviceName: info?.deviceName || null,
        startTime: s.acctstarttime.toISOString(),
        userAgent: info?.userAgent || null,
      });
    }

    // Check if device management is enabled for this portal
    if (portalSlug) {
      try {
        const portalConfig = await db.captivePortal.findFirst({
          where: { slug: portalSlug },
          select: { id: true },
        });
        if (portalConfig) {
          const portalPage = await db.portalPage.findFirst({
            where: { portalId: portalConfig.id, language: 'en' },
            select: { designSettings: true },
          });
          if (portalPage?.designSettings) {
            try {
              const ds = typeof portalPage.designSettings === 'string'
                ? JSON.parse(portalPage.designSettings) : portalPage.designSettings;
              deviceManagementEnabled = !!ds.deviceManagement;
            } catch { /* ignore parse errors */ }
          }
        }
      } catch { /* non-fatal */ }
    }
  } catch (err) {
    console.error('[DeviceData] Failed to fetch active devices:', err);
  }

  // Generate a one-time disconnect token so the unauthenticated new device
  // can disconnect an existing session from the device management popup.
  const disconnectToken = deviceManagementEnabled && activeDevices.length > 0
    ? createPortalSessionToken({ username, ttlSeconds: 300 })
    : undefined;

  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        correlationId,
        activeDevices: deviceManagementEnabled ? activeDevices : undefined,
        deviceManagementEnabled,
        disconnectToken,
      },
    },
    { status }
  );
}

// ══════════════════════════════════════════════════════════════
// Guest Info Persistence
// ══════════════════════════════════════════════════════════════

export async function saveGuestInfoAfterAuth(params: {
  wifiUserId?: string | null;
  wifiUsername?: string | null;
  tenantId?: string;
  propertyId?: string;
  guestId?: string | null;
  bookingId?: string | null;
  guestInfo?: GuestInfoPayload;
  marketingConsent?: MarketingConsent;
  portalSlug?: string | null;
  request?: NextRequest;
}): Promise<void> {
  const { wifiUserId, wifiUsername, tenantId, propertyId, guestId: existingGuestId, bookingId: existingBookingId, guestInfo, marketingConsent, portalSlug, request } = params;

  if (!guestInfo && !marketingConsent) return;

  try {
    let resolvedTenantId = tenantId;
    let resolvedPropertyId = propertyId;
    let resolvedGuestId = existingGuestId;
    let resolvedBookingId = existingBookingId;
    let resolvedWifiUserId = wifiUserId;

    if (!resolvedWifiUserId && wifiUsername) {
      const userByUname = await db.wiFiUser.findUnique({
        where: { username: wifiUsername },
        select: { id: true, tenantId: true, propertyId: true, guestId: true, bookingId: true },
      });
      if (userByUname) {
        resolvedWifiUserId = userByUname.id;
        resolvedTenantId = resolvedTenantId || userByUname.tenantId;
        resolvedPropertyId = resolvedPropertyId || userByUname.propertyId;
        resolvedGuestId = resolvedGuestId || userByUname.guestId;
        resolvedBookingId = resolvedBookingId || userByUname.bookingId;
      }
    }

    if (resolvedWifiUserId && (!resolvedTenantId || !resolvedPropertyId || !resolvedGuestId)) {
      const wifiUser = await db.wiFiUser.findUnique({
        where: { id: resolvedWifiUserId },
        select: { tenantId: true, propertyId: true, guestId: true, bookingId: true },
      });
      if (wifiUser) {
        resolvedTenantId = resolvedTenantId || wifiUser.tenantId;
        resolvedPropertyId = resolvedPropertyId || wifiUser.propertyId;
        resolvedGuestId = resolvedGuestId || wifiUser.guestId;
        resolvedBookingId = resolvedBookingId || wifiUser.bookingId;
      }
    }

    if (!resolvedTenantId || !resolvedPropertyId) {
      console.warn('[GuestInfo] Skipped — no tenantId/propertyId resolved');
      return;
    }

    const updates: Record<string, unknown> = {};
    const createData: Record<string, unknown> = { tenantId: resolvedTenantId, firstName: '', lastName: '' };

    if (guestInfo) {
      if (guestInfo.firstName?.trim()) {
        updates.firstName = guestInfo.firstName.trim();
        createData.firstName = guestInfo.firstName.trim();
      }
      if (guestInfo.lastName?.trim()) {
        updates.lastName = guestInfo.lastName.trim();
        createData.lastName = guestInfo.lastName.trim();
      }
      if (guestInfo.email?.trim()) updates.email = guestInfo.email.trim();
      if (guestInfo.phone?.trim()) updates.phone = guestInfo.phone.trim();
      if (guestInfo.passport?.trim()) {
        updates.idNumber = guestInfo.passport.trim();
        updates.idType = 'passport';
      }
      if (guestInfo.bookingId?.trim()) resolvedBookingId = guestInfo.bookingId.trim();
    }

    if (marketingConsent) {
      if (marketingConsent.emailConsent === true) updates.emailOptIn = true;
      if (marketingConsent.smsConsent === true) updates.smsOptIn = true;
    }

    if (resolvedBookingId && resolvedWifiUserId) {
      await db.wiFiUser.update({
        where: { id: resolvedWifiUserId },
        data: { bookingId: resolvedBookingId },
      }).catch(() => {});
    }

    if (resolvedGuestId) {
      const updateFields: Record<string, unknown> = { ...updates };
      await db.guest.update({
        where: { id: resolvedGuestId },
        data: updateFields,
      }).catch(() => {});
    } else {
      const email = guestInfo?.email?.trim() || null;
      const phone = guestInfo?.phone?.trim() || null;
      const firstName = guestInfo?.firstName?.trim() || '';
      const lastName = guestInfo?.lastName?.trim() || '';

      if (email || phone) {
        const existingGuest = email
          ? await db.guest.findFirst({ where: { tenantId: resolvedTenantId, email } })
          : null;

        if (existingGuest) {
          const updateFields: Record<string, unknown> = { ...updates };
          await db.guest.update({
            where: { id: existingGuest.id },
            data: updateFields,
          }).catch(() => {});

          await db.wiFiUser.update({
            where: { username: wifiUsername },
            data: { guestId: existingGuest.id },
          }).catch(() => {});
        } else {
          const newGuest = await db.guest.create({
            data: {
              ...createData,
              tenantId: resolvedTenantId,
              email: email || undefined,
              phone: phone || undefined,
            },
          }).catch(() => null);

          if (newGuest) {
            await db.wiFiUser.update({
              where: { username: wifiUsername },
              data: { guestId: newGuest.id },
            }).catch(() => {});
          }
        }
      }
    }
  } catch (err) {
    console.error('[GuestInfo] Failed to save guest info:', err);
  }
}

// ══════════════════════════════════════════════════════════════
// User Provisioning
// ══════════════════════════════════════════════════════════════

export async function provisionOrResumeUser(
  wifiUsername: string,
  now: Date,
  validUntil: Date,
  params: {
    tenantId: string;
    propertyId: string;
    guestId?: string;
    bookingId?: string;
    username: string;
    password: string;
    planId?: string;
    planName?: string;
    downloadSpeed: number;
    uploadSpeed: number;
    sessionTimeoutMinutes: number;
    idleTimeoutSeconds?: number;
    sessionLimit?: number;
    dataLimit?: number;
  }
) {
  let provisionErr: Error | null = null;
  try {
    await wifiUserService.provisionUser({ ...params, validFrom: now, validUntil });
  } catch (err) {
    provisionErr = err instanceof Error ? err : new Error(String(err));
    console.error('[Guest Auth] RADIUS provisioning failed:', provisionErr);
    try {
      const existingUser = await db.wiFiUser.findUnique({ where: { username: wifiUsername } });
      if (existingUser) {
        // Sync the password to radcheck to ensure RADIUS auth works
        // (provisionUser may have partially failed before writing radcheck)
        if (params.password) {
          try {
            const updated = await db.radCheck.updateMany({
              where: { username: wifiUsername, attribute: 'Cleartext-Password' },
              data: { value: params.password, isActive: true },
            });
            if (updated.count === 0) {
              await db.radCheck.create({
                data: { username: wifiUsername, attribute: 'Cleartext-Password', op: ':=', value: params.password, isActive: true },
              });
            }
            console.log(`[Guest Auth] Synced radcheck password for ${wifiUsername} during recovery`);
          } catch (syncErr: any) {
            console.warn('[Guest Auth] Failed to sync radcheck during recovery:', syncErr);
          }
        }
        await db.wiFiUser.update({
          where: { id: existingUser.id },
          data: {
            status: 'active',
            validFrom: now,
            validUntil,
            radiusSynced: true,
            radiusSyncedAt: now,
          },
        });
        console.warn(`[Guest Auth] Provision failed, recovered by reactivating existing user ${wifiUsername} — radcheck synced`);
        provisionErr = null;
      }
    } catch (recoveryErr) {
      console.error('[Guest Auth] Recovery also failed:', recoveryErr);
    }
  }
  if (provisionErr) {
    throw provisionErr;
  }
}

// ══════════════════════════════════════════════════════════════
// Auth Logging
// ══════════════════════════════════════════════════════════════

function getRejectMessageFromCode(code: string): string | null {
  if (code.startsWith('IP_NOT_IN_POOL:')) return `Client IP not in managed WiFi pool: ${code.replace('IP_NOT_IN_POOL:', '')}`;
  if (code === 'IP_NOT_IN_POOL') return 'Client device is not connected to a managed WiFi network';
  if (code === 'IP_NOT_DETERMINED') return 'Could not determine client IP address';
  if (code === 'MAX_SESSIONS_REACHED' || code.startsWith('MAX_SESSION')) return 'Maximum concurrent sessions reached — disconnect another device first';
  if (code === 'MAC_NOT_REGISTERED_FOR_USER') return 'MAC address not registered for this user account';
  if (code === 'MAC_NOT_REGISTERED') return 'MAC address not found in system whitelist';
  if (code === 'MAC_EXPIRED') return 'MAC registration has expired — contact front desk';
  if (code === 'MAC_NOT_DETECTED') return 'Device MAC address could not be detected';
  if (code.startsWith('MAC_')) return `MAC violation: ${code.replace(/_/g, ' ').toLowerCase()}`;
  if (code === 'ACCOUNT_INACTIVE') return 'WiFi account is inactive — contact front desk';
  if (code === 'ACCOUNT_EXPIRED') return 'WiFi session has expired — contact front desk to renew';
  if (code === 'VOUCHER_USED') return 'Voucher code has already been used';
  if (code === 'VOUCHER_EXPIRED') return 'Voucher code has expired';
  if (code === 'VOUCHER_NOT_YET_VALID') return 'Voucher code is not yet valid';
  if (code === 'INVALID_VOUCHER') return 'Invalid or expired voucher code';
  if (code === 'MISSING_VOUCHER') return 'No voucher code provided';
  if (code.startsWith('VOUCHER_')) return `Voucher error: ${code.replace(/_/g, ' ').toLowerCase()}`;
  if (code === 'OTP_INVALID') return 'Invalid OTP code — verify and try again';
  if (code === 'OTP_EXPIRED') return 'OTP code has expired — request a new one';
  if (code === 'OTP_NOT_FOUND') return 'No active OTP found — request a new one';
  if (code === 'OTP_MAX_ATTEMPTS') return 'Too many incorrect OTP attempts — request a new OTP';
  if (code.startsWith('OTP_')) return `OTP error: ${code.replace(/_/g, ' ').toLowerCase()}`;
  if (code === 'INVALID_CREDENTIALS') return 'Invalid username or password';
  if (code === 'AUTH_FAILED') return 'Authentication failed';
  if (code === 'RADIUS_UNREACHABLE') return 'RADIUS authentication server is unreachable';
  if (code.startsWith('LDAP:') || code === 'LDAP_AUTH_FAILED' || code === 'LDAP_NOT_CONFIGURED') return `LDAP authentication ${code.startsWith('LDAP:') ? 'failed: ' + code.replace('LDAP:', '') : 'error'}`;
  if (code.startsWith('SOCIAL_')) return `Social login ${code.replace(/_/g, ' ').toLowerCase()}`;
  if (code === 'RATE_LIMITED') return 'Too many authentication attempts — try again later';
  if (code === 'ROOM_NOT_FOUND') return 'No active guest found for this room and name';
  if (code === 'MISSING_ROOM') return 'Room number is required';
  if (code === 'MISSING_NAME') return 'Guest last name is required';
  if (code === 'NO_ACTIVE_BOOKING') return 'No active booking found for this guest';
  if (code === 'ALREADY_CONNECTED') return 'Device is already connected to WiFi';
  if (code === 'NO_PROPERTY' || code === 'CONFIG_ERROR') return 'Portal configuration error — contact front desk';
  if (code === 'CONSENT_REQUIRED') return 'Terms acceptance is required to connect';
  if (code === 'TENANT_MISMATCH') return 'Voucher is not valid for this property';
  if (code === 'VOUCHER_ALREADY_CLAIMED') return 'Voucher has already been claimed by another device';
  if (code === 'MISSING_PHONE') return 'Phone number is required for authentication';
  if (code === 'INVALID_PHONE') return 'Invalid phone number format';
  if (code === 'MISSING_EMAIL') return 'Email address is required for authentication';
  if (code === 'INVALID_EMAIL') return 'Invalid email address format';
  if (code === 'EMAIL_NOT_REGISTERED') return 'Email address is not registered for WiFi access';
  if (code.startsWith('SMS_OTP') || code.startsWith('EMAIL_OTP')) return `${code.replace(/_/g, ' ').toLowerCase()} for this property`;
  if (code === 'MISSING_METHOD') return 'No authentication method specified';
  if (code === 'INVALID_METHOD') return `Unsupported authentication method: ${code.replace('INVALID_METHOD', '').trim() || 'unknown'}`;
  if (code === 'MISSING_USERNAME') return 'Username is required';
  if (code === 'MISSING_PASSWORD') return 'Password is required';
  if (code === 'MISSING_SOCIAL_TOKEN') return 'Social login token is missing';
  if (code === 'MISSING_PROVIDER') return 'Social login provider not specified';
  if (code === 'INVALID_PROVIDER') return 'Unsupported social login provider';
  if (code.startsWith('INVALID_') || code.startsWith('MISSING_') || code.startsWith('AUTH_') || code.startsWith('ACCOUNT_')) return code.replace(/_/g, ' ').toLowerCase();
  if (code.startsWith('pool:')) return code;
  if (code.startsWith('LDAP_AUTH_OK')) return code;
  if (code.startsWith('MAC_') && code.includes('AUTH')) return code;
  if (code.startsWith('SOCIAL_') && code.includes('OK')) return code;
  return null;
}

export async function logAuthAttempt(
  username: string,
  reply: string,
  request: NextRequest,
  extraInfo?: string,
  macAddress?: string,
) {
  try {
    const clientIp = getClientIp(request) || '';

    let effectiveMac = macAddress || null;
    if (!effectiveMac) {
      try {
        const wifiUser = await db.wiFiUser.findUnique({ where: { username }, select: { id: true } });
        if (wifiUser) {
          const dp = await db.deviceProfile.findFirst({
            where: { wifiUserId: wifiUser.id, isActive: true, macAddress: { not: null } },
            select: { macAddress: true },
            orderBy: { lastSeenAt: 'desc' },
          });
          if (dp?.macAddress) effectiveMac = dp.macAddress;
        }
      } catch { /* non-fatal */ }
    }

    await db.$executeRaw(
      Prisma.sql`INSERT INTO radpostauth (username, pass, reply, authdate, clientipaddress, "nasIpAddress", callingstationid, "replyMessage")
       VALUES (${username}, ${extraInfo || ''}, ${reply}, NOW(), ${clientIp}, '127.0.0.1', ${effectiveMac}, ${extraInfo ? getRejectMessageFromCode(extraInfo) : null})`
    );
  } catch (err) {
    console.error('[Guest Auth] Failed to write auth log:', err);
  }
}

// ══════════════════════════════════════════════════════════════
// Accounting Session Creation
// ══════════════════════════════════════════════════════════════

/**
 * Create an accounting session in RadAcct AND WiFiSession tables.
 * Both records feed the v_active_sessions view → Active Users dashboard tab.
 */
export async function createAccountingSession(
  username: string,
  request: NextRequest,
  loginType: string = 'portal',
  macAddress?: string,
  pool?: MatchedPool | null,
  propertyId?: string,
  natMode?: string,
  snatIp?: string
): Promise<string> {
  try {
    const clientIp = getClientIp(request) || '0.0.0.0';

    const now = new Date();
    const acctSessionId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const acctUniqueId = randomUUID();

    const normalizedMac = macAddress
      ? macAddress.replace(/[:\-\.\s]/g, '').toUpperCase()
      : null;
    let formattedMac = normalizedMac && normalizedMac.length === 12
      ? normalizedMac.match(/.{2}/g)?.join(':') || null
      : null;

    const connectInfoStart = pool
      ? `pool_id=${pool.poolId}|pool_name=${pool.poolName}|subnet=${pool.subnet || 'none'}|gateway=${pool.gateway || 'none'}`
      : '';

    const localNas = propertyId ? await getLocalNasConfig(propertyId) : { enabled: false, calledStationId: '00:00:00:00:00:01', nasIpAddress: '127.0.0.1', nasIdentifier: 'Cryptsk-Gateway' };

    await db.$executeRaw(
      Prisma.sql`INSERT INTO radacct (
         acctuniqueid, acctsessionid, username,
         nasipaddress, nasporttype, acctstarttime, acctupdatetime,
         acctauthentic, framedipaddress, acctstatus,
         acctinputoctets, acctoutputoctets, acctsessiontime,
         calledstationid, callingstationid, nasidentifier,
         "loginType", connectinfo_start, "natMode", "snatIp", createdat, updatedat
       ) VALUES (
         ${acctUniqueId}, ${acctSessionId}, ${username},
         ${localNas.nasIpAddress}, 'Wireless-802.11', ${now}, ${now},
         'PAP', ${clientIp}, 'start',
         0, 0, 0,
         ${localNas.calledStationId}, ${formattedMac}, ${localNas.nasIdentifier || 'cryptsk-gateway'},
         ${loginType}, ${connectInfoStart}, ${natMode || null}, ${snatIp || null}::inet, NOW(), NOW()
       )`
    );

    // ── Also create a WiFiSession record ──
    // This is the application-level session that the Active Users tab queries.
    // Without this record, sessions only exist in radacct (RADIUS-level) and
    // the v_active_sessions view won't show them unless the session engine
    // creates a matching WiFiSession. In sandbox/testing environments without
    // a real RADIUS server, the radacct record alone isn't enough.
    try {
      const wifiUser = await db.wiFiUser.findUnique({
        where: { username },
        select: { tenantId: true, planId: true, guestId: true, bookingId: true },
      });
      if (wifiUser) {
        await db.wiFiSession.create({
          data: {
            tenant: { connect: { id: wifiUser.tenantId } },
...(wifiUser.planId ? { plan: { connect: { id: wifiUser.planId } } } : {}),
            guestId: wifiUser.guestId,
            bookingId: wifiUser.bookingId,
            username,
            acctUniqueId,
            ...(formattedMac ? { macAddress: formattedMac } : {}),
            ipAddress: clientIp,
            authMethod: loginType,
            status: 'active',
            startTime: now,
          },
        });
        console.log(`[Guest Auth] Created WiFiSession for ${username} (acctUniqueId=${acctUniqueId})`);
      } else {
        console.warn(`[Guest Auth] WiFiUser not found for username=${username} — skipping WiFiSession creation`);
      }
    } catch (sessionErr) {
      console.error('[Guest Auth] Failed to create WiFiSession (non-fatal):', sessionErr);
    }

    return acctSessionId;
  } catch (err) {
    console.error('[Guest Auth] Failed to create accounting session:', err);
    return null;
  }
}

// Re-export OTP functions for handlers that use them directly
export { otpGet, otpSet, otpDelete, otpIncrementAttempts } from '@/lib/wifi/services/pg-otp-store';

// Re-export firewall / counter / bandwidth utilities used by auth handlers
export { activateUserFirewall, resolveGatewayFwBit, resolvePlanBandwidthKbps } from '@/lib/wifi/shared/radius-utils';
export { addUserCounter } from '@/lib/wifi/utils/nftables-counters';


