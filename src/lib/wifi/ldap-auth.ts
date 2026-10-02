/**
 * LDAP / Active Directory Authentication Handler
 *
 * Handles WiFi authentication via LDAP/AD directory bind.
 * Extracted from: src/app/api/v1/wifi/auth/route.ts case 'ldap' (lines 3818-4066)
 *
 * Flow: Validate credentials → LDAP bind → create/update WiFiUser → RADIUS auth → firewall
 */

import { randomBytes } from 'crypto';
import type { AuthContext } from './types';
import {
  errorResponse, successResponse,
  logAuthAttempt, createAccountingSession,
  isMacBindingEnforced, isMacRegisteredForUser, isDeviceBlocked,
  authenticateViaLdap, parseDeviceTypeFromUA, registerUserDevice,
  logIdentityVerification,
  getValidatedPool, handleSessionLimitWithDeviceFallback, resolveAllowedPoolIds,
} from './helpers';
import { checkAuthRateLimit } from './auth-rate-limit';
import { radiusAuth, getRejectMessage } from '@/lib/wifi/utils/radius-auth';
import {
  activateUserFirewall,
  resolveGatewayFwBit,
} from '@/lib/wifi/shared/radius-utils';
import { addUserCounter } from '@/lib/wifi/utils/nftables-counters';
import { resolvePoolNatParams, normalizeIp } from './helpers';
import { getLocalNasConfig } from '@/lib/wifi/local-nas-config';
import { db } from '@/lib/db';

export async function handleLdapAuth(ctx: AuthContext) {
  const {
    request, portal, portalSlug,
    bwDown, bwUp, resolvedClientIp, effectiveMac,
    fingerprintHash, storageToken, externalGateway,
    username, password, portalSessionTimeoutMin,
  } = ctx;

  if (!username?.trim()) {
    return errorResponse('MISSING_USERNAME', 'Please enter your username');
  }
  if (!password?.trim()) {
    return errorResponse('MISSING_PASSWORD', 'Please enter your password');
  }

  // Per-IP rate limiting via portal preferences
  const ldapRateCheck = await checkAuthRateLimit(resolvedClientIp, 'ldap', portal?.tenantId, portal?.propertyId);
  if (!ldapRateCheck.allowed) {
    await logAuthAttempt(username?.trim() || 'unknown', 'Access-Reject', request, 'RATE_LIMITED');
    return errorResponse('RATE_LIMITED', `Too many LDAP login attempts. Please try again in ${ldapRateCheck.retryAfter} seconds.`);
  }

  // Look up LDAP config — by propertyId from portal, or first active config
  let ldapConfig = portal?.propertyId
    ? await db.radiusLDAPConfig.findUnique({ where: { propertyId: portal.propertyId } })
    : await db.radiusLDAPConfig.findFirst({ where: { enabled: true } });

  if (!ldapConfig || !ldapConfig.enabled) {
    if (portal?.propertyId) {
      ldapConfig = await db.radiusLDAPConfig.findFirst({ where: { enabled: true } });
    }
    if (!ldapConfig) {
      return errorResponse('LDAP_NOT_CONFIGURED', 'LDAP authentication is not configured. Please contact your administrator.');
    }
  }

  // Authenticate against LDAP
  let ldapResult: { userDn: string; userAttributes: Record<string, string | string[]> };
  try {
    ldapResult = await authenticateViaLdap({
      serverUrl: ldapConfig.serverUrl,
      baseDn: ldapConfig.baseDn,
      bindDn: ldapConfig.bindDn,
      bindPassword: ldapConfig.bindPassword,
      usernameAttr: ldapConfig.usernameAttr || 'uid',
      username: username.trim(),
      password,
      useTls: ldapConfig.useTls,
      timeout: ldapConfig.timeout || 30,
      filterGroup: ldapConfig.filterGroup,
    });
  } catch (ldapErr) {
    const errMsg = ldapErr instanceof Error ? ldapErr.message : 'LDAP authentication failed';
    const ldapUsername = username.trim();
    await logAuthAttempt(ldapUsername, 'Access-Reject', request, `LDAP:${errMsg}`);
    logIdentityVerification({
      tenantId: ldapConfig.tenantId,
      propertyId: ldapConfig.propertyId,
      sessionId: null,
      username: ldapUsername,
      verificationMethod: 'ldap',
      verifiedIdentity: ldapUsername,
      verificationStatus: 'failed',
      ipAddress: resolvedClientIp,
      macAddress: effectiveMac,
      failureReason: errMsg,
    });
    return errorResponse('LDAP_AUTH_FAILED', errMsg, 401);
  }

  const ldapUsername = username.trim();
  const now = new Date();
  const ldapValidUntil = new Date(now.getTime() + portalSessionTimeoutMin * 60 * 1000);

  // Placeholder password stored in DB for RADIUS PAP auth — must match what FreeRADIUS sees
  const ldapRadiusPassword = `__ldap_${randomBytes(16).toString('hex')}`;

  // Create or update WiFiUser record
  let upsertOk = false;
  try {
    await db.wiFiUser.upsert({
      where: { username: ldapUsername },
      update: {
        status: 'active',
        userType: 'ldap',
        validFrom: now,
        validUntil: ldapValidUntil,
        radiusSynced: true,
        radiusSyncedAt: now,
      },
      create: {
        tenantId: ldapConfig.tenantId,
        propertyId: ldapConfig.propertyId,
        username: ldapUsername,
        password: ldapRadiusPassword,
        status: 'active',
        userType: 'ldap',
        validFrom: now,
        validUntil: ldapValidUntil,
        radiusSynced: true,
        radiusSyncedAt: now,
      },
    });
    upsertOk = true;
  } catch (dbErr) {
    console.error('[Auth:LDAP] WiFiUser upsert failed:', dbErr);
  }
  if (!upsertOk) {
    return errorResponse('AUTH_FAILED', 'Unable to create user record. Please try again.');
  }

  // ── Security checks: IP pool + session limit (Bug #2/#3 fix) ──
  const ldapWifiUserForChecks = await db.wiFiUser.findUnique({
    where: { username: ldapUsername },
    select: { 
      id: true, tenantId: true, propertyId: true,
      plan: { 
        select: { 
          maxDevices: true, ipPoolId: true,
          validFrom: true, validUntil: true,
          planPools: { select: { poolId: true }, orderBy: { priority: 'asc' } } 
        } 
      } 
    },
  });

  if (ldapWifiUserForChecks) {
    // F-25: Check plan validity dates
    if (ldapWifiUserForChecks.plan?.validFrom && ldapWifiUserForChecks.plan.validFrom > now) {
      await logAuthAttempt(ldapUsername, 'Access-Reject', request, 'PLAN_NOT_YET_ACTIVE');
      return errorResponse('PLAN_NOT_ACTIVE', 'Your WiFi plan has not started yet. Please contact the front desk.');
    }
    if (ldapWifiUserForChecks.plan?.validUntil && ldapWifiUserForChecks.plan.validUntil < now) {
      await logAuthAttempt(ldapUsername, 'Access-Reject', request, 'PLAN_EXPIRED');
      return errorResponse('PLAN_EXPIRED', 'Your WiFi plan has expired. Please contact the front desk to renew.');
    }

    // IP pool validation
    const ldapPlanPoolIds = ldapWifiUserForChecks.plan?.planPools?.map((pp: any) => pp.poolId) || [];
    const ldapAllowedPools = resolveAllowedPoolIds(
      ldapWifiUserForChecks.plan?.ipPoolId, 
      undefined, 
      !!ldapWifiUserForChecks.plan?.ipPoolId, 
      ldapPlanPoolIds
    );
    const ldapPool = await getValidatedPool(request, ldapAllowedPools);
    if (!ldapPool) {
      await logAuthAttempt(ldapUsername, 'Access-Reject', request, `IP_NOT_IN_POOL:${resolvedClientIp}`);
      return errorResponse('IP_NOT_IN_POOL', 'Your device is not connected to a managed WiFi network. Please connect to the hotel WiFi and try again.', 403);
    }

    // Session limit enforcement
    const ldapMaxSessions = ldapWifiUserForChecks.plan?.maxDevices || 1;
    const ldapSessionCheck = await handleSessionLimitWithDeviceFallback(
      ldapUsername, ldapMaxSessions, fingerprintHash, storageToken, effectiveMac
    );
    if (ldapSessionCheck.limitReached) {
      await logAuthAttempt(ldapUsername, 'Access-Reject', request, 'MAX_SESSIONS_REACHED');
      return errorResponse('MAX_SESSIONS_REACHED', 'Maximum concurrent sessions reached. Please disconnect another device first.', 403);
    }
  }

  // Device block check (always enforced — deactivated devices can never login)
  if (effectiveMac) {
    const ldapWifiUser = await db.wiFiUser.findUnique({ where: { username: ldapUsername }, select: { id: true, tenantId: true, propertyId: true } });
    if (ldapWifiUser) {
      const deviceBlocked = await isDeviceBlocked(ldapWifiUser.id, effectiveMac);
      if (deviceBlocked) {
        console.warn(`[Auth:Device] MAC ${effectiveMac} is deactivated for user ${ldapUsername} — rejecting`);
        await logAuthAttempt(ldapUsername, 'Access-Reject', request, 'DEVICE_BLOCKED', effectiveMac);
        return errorResponse('DEVICE_BLOCKED', 'This device has been deactivated by the administrator. Please contact the front desk.');
      }
    }
  }

  // MAC binding enforcement: check if this MAC is registered for the user
  if (effectiveMac) {
    const ldapWifiUser = await db.wiFiUser.findUnique({ where: { username: ldapUsername }, select: { id: true, tenantId: true, propertyId: true } });
    if (ldapWifiUser) {
      const macBinding = await isMacBindingEnforced(ldapWifiUser.propertyId, ldapWifiUser.tenantId);
      if (macBinding) {
        const macRegistered = await isMacRegisteredForUser(ldapWifiUser.id, effectiveMac);
        if (!macRegistered) {
          console.warn(`[Auth:MAC] MAC ${effectiveMac} not registered for user ${ldapUsername} — rejecting`);
          await logAuthAttempt(ldapUsername, 'Access-Reject', request, 'MAC_NOT_REGISTERED_FOR_USER', effectiveMac);
          return errorResponse('MAC_NOT_REGISTERED', 'This device is not registered for your account. Please contact the front desk to register your device.');
        }
      }
    }
  }

  // Log successful auth
  await logAuthAttempt(ldapUsername, 'Access-Accept', request, 'LDAP_AUTH_OK');
  logIdentityVerification({
    tenantId: ldapConfig.tenantId,
    propertyId: ldapConfig.propertyId,
    sessionId: null,
    username: ldapUsername,
    verificationMethod: 'ldap',
    verifiedIdentity: ldapResult.userDn,
    verificationStatus: 'verified',
    ipAddress: resolvedClientIp,
    macAddress: effectiveMac,
  });

  // Create RadiusAuthLog entry
  try {
    await db.radiusAuthLog.create({
      data: {
        propertyId: ldapConfig.propertyId,
        username: ldapUsername,
        authResult: 'Access-Accept',
        authType: 'PAP',
        replyMessage: 'LDAP authentication successful',
        timestamp: now,
      },
    });
  } catch { /* best effort */ }

  const ldapSessionId = `ldap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Attempt RADIUS auth + firewall for LDAP user
  try {
    const radiusResult = await radiusAuth(ldapUsername, ldapRadiusPassword, resolvedClientIp, ldapSessionId);
    if (!radiusResult.accepted) {
      console.warn(`[Auth:LDAP] RADIUS rejected ${ldapUsername}: ${radiusResult.rejectReason}`);
      return errorResponse(radiusResult.rejectReason || 'AUTH_FAILED', getRejectMessage(radiusResult.rejectReason || 'AUTH_FAILED'));
    }
    const localNas = await getLocalNasConfig(portal?.propertyId || '00000000-0000-0000-0000-000000000000');
    if (localNas.enabled) {
      // Resolve NAT params from pool (SNAT allocation if needed)
      const ldapPool = ldapWifiUserForChecks ? await getValidatedPool(request, ldapAllowedPools) : null;
      const ldapNatParams = ldapPool ? await resolvePoolNatParams(ldapPool, resolvedClientIp) : { natMode: 'private_masq' };

      await activateUserFirewall({
        username: ldapUsername, clientIp: resolvedClientIp,
        propertyId: portal?.propertyId || ldapConfig.propertyId, sessionId: ldapSessionId,
        macAddress: effectiveMac,
        dnKbps: bwDown, upKbps: bwUp,
        subnet: ldapPool?.subnet || null,
        ...ldapNatParams,
        gatewayFwBit: 0, // LDAP has no plan
      });

      // Add per-IP byte counter rules for session engine tracking
      const ldapCounterIp = normalizeIp(resolvedClientIp);
      if (ldapCounterIp && ldapCounterIp !== '0.0.0.0') {
        addUserCounter(ldapCounterIp);
      }
    }
  } catch (radiusErr) {
    console.error('[Auth:LDAP] RADIUS/firewall activation failed:', radiusErr);
    return errorResponse('RADIUS_UNREACHABLE', getRejectMessage('RADIUS_UNREACHABLE'));
  }

  // Create accounting session
  try {
    await createAccountingSession(ldapUsername, request, 'ldap', effectiveMac);
  } catch { /* best effort */ }

  // Create DeviceProfile
  if (fingerprintHash && ldapConfig.propertyId) {
    try {
      const ldapWifiUser = await db.wiFiUser.findUnique({ where: { username: ldapUsername } });
      if (ldapWifiUser) {
        await db.deviceProfile.upsert({
          where: {
            fingerprintHash_storageToken_propertyId: {
              fingerprintHash,
              storageToken: storageToken || fingerprintHash,
              propertyId: ldapConfig.propertyId,
            },
          },
          update: {
            macAddress: effectiveMac,
            ipAddress: resolvedClientIp,
            lastAuthAt: now,
            authCount: { increment: 1 },
          },
          create: {
            tenantId: ldapConfig.tenantId,
            propertyId: ldapConfig.propertyId,
            wifiUserId: ldapWifiUser.id,
            fingerprintHash,
            storageToken: storageToken || fingerprintHash,
            macAddress: effectiveMac,
            ipAddress: resolvedClientIp,
            lastAuthAt: now,
            deviceType: parseDeviceTypeFromUA(request.headers.get('user-agent') || ''),
            authCount: 1,
          },
        });
      }
    } catch (dpErr) {
      console.warn('[Auth:LDAP] DeviceProfile upsert failed (non-critical):', dpErr);
    }
  }

  // Register this device's MAC for the user
  if (ldapConfig.propertyId) {
    db.wiFiUser.findUnique({ where: { username: ldapUsername }, select: { id: true } })
      .then(ldapUser => {
        if (ldapUser) {
          return registerUserDevice({
            wifiUserId: ldapUser.id,
            tenantId: ldapConfig.tenantId,
            propertyId: ldapConfig.propertyId,
            macAddress: effectiveMac,
            request,
            source: 'ldap',
          });
        }
      })
      .catch(() => {}); // Non-critical
  }

  return successResponse(
    {
      authenticated: true,
      method: 'ldap',
      username: ldapUsername,
      sessionTimeout: portalSessionTimeoutMin,
      bandwidthDown: bwDown,
      bandwidthUp: bwUp,
      message: 'LDAP authentication successful',
      sessionId: ldapSessionId,
      guestId: null,
    },
    { username: ldapUsername, password },
    externalGateway,
    request,
    resolvedClientIp
  );
}
