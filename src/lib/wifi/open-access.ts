/**
 * Open Access Authentication Handler
 *
 * Handles WiFi authentication with no credentials — open/transparent access.
 * Extracted from: src/app/api/v1/wifi/auth/route.ts case 'open_access' (lines 3658-3812)
 *
 * Flow: Validate IP pool → provision temporary user → RADIUS auth → activate firewall
 */

import { randomBytes } from 'crypto';
import type { AuthContext } from './types';
import {
  errorResponse, successResponse, errorResponseWithDeviceData,
  logAuthAttempt, createAccountingSession, getValidatedPool,
  resolveAllowedPoolIds, handleSessionLimitWithDeviceFallback,
  saveGuestInfoAfterAuth, registerUserDevice, logIdentityVerification,
  normalizeIp, addUserCounter, activateUserFirewall, resolveGatewayFwBit,
  resolvePoolNatParams,
  backfillSnatIpInRadacct,
} from './helpers';
import { checkAuthRateLimit } from './auth-rate-limit';
import { radiusAuth, getRejectMessage } from '@/lib/wifi/utils/radius-auth';
import { wifiUserService } from '@/lib/wifi/services/wifi-user-service';
import { db } from '@/lib/db';

export async function handleOpenAccessAuth(ctx: AuthContext) {
  const {
    request, portal, portalSlug, portalSessionTimeoutMin,
    bwDown, bwUp, resolvedClientIp, effectiveMac,
    fingerprintHash, storageToken, externalGateway,
    normalizedGuestInfo, marketingEmailConsent, marketingSmsConsent,
    portalPlanIpPoolId, portalPlanPoolIds, macAddress,
  } = ctx;

  // Per-IP rate limiting via portal preferences
  const openAccessRateCheck = await checkAuthRateLimit(resolvedClientIp, 'open_access', portal?.tenantId, portal?.propertyId);
  if (!openAccessRateCheck.allowed) {
    return errorResponse('RATE_LIMITED', `Too many open access requests. Please try again in ${openAccessRateCheck.retryAfter} seconds.`);
  }

  const pool = await getValidatedPool(request, resolveAllowedPoolIds(portalPlanIpPoolId, undefined, !!portalPlanIpPoolId, portalPlanPoolIds));
  if (!pool) {
    await logAuthAttempt('open-access', 'Access-Reject', request, `IP_NOT_IN_POOL:${resolvedClientIp}`);
    return errorResponse('IP_NOT_IN_POOL', 'Your device is not connected to a managed WiFi network. Please connect to the hotel WiFi and try again.', 403);
  }

  const now = new Date();
  const validUntil = new Date(now.getTime() + portalSessionTimeoutMin * 60 * 1000);
  let wifiUsername: string | null = null;
  let openPassword: string | null = null;
  let openAccessSessionId: string | null = null;

  let openSessionCheck: { limitReached: boolean } | null = null;
  let openPlanDnKbps = bwDown * 1000;  // kbps — declared outside if(portal) so accessible in response
  let openPlanUpKbps = bwUp * 1000;    // kbps

  if (portal) {
    const openSuffix = randomBytes(4).toString('hex');
    const wifiUsernameLocal = `open-${Date.now()}-${openSuffix}`;
    wifiUsername = wifiUsernameLocal;
    openPassword = wifiUsernameLocal;
    openAccessSessionId = wifiUsernameLocal;
    let resolvedPropertyId: string | undefined;

    // M4 FIX: Resolve property ID — fail on error (critical for provisioning)
    try {
      resolvedPropertyId = portal.propertyId
        || await db.property.findFirst({ where: { tenantId: portal.tenantId }, select: { id: true } }).then(p => p?.id);
    } catch (err) {
      console.error('[OpenAccess] Failed to resolve property:', err);
      return errorResponse('SETUP_FAILED', 'Failed to initialize connection. Please try again.');
    }

    if (resolvedPropertyId) {
      // Resolve plan bandwidth for open access users (AAA default plan if configured) — non-critical
      let openDefaultPlanId: string | null = null;
      try {
        const aaaConfig = await db.wiFiAAAConfig.findUnique({
          where: { propertyId: resolvedPropertyId },
          select: { defaultPlanId: true },
        }).catch(() => null);
        openDefaultPlanId = aaaConfig?.defaultPlanId || null;
        if (aaaConfig?.defaultPlanId) {
          const openPlan = await db.wiFiPlan.findUnique({
            where: { id: aaaConfig.defaultPlanId },
            select: { downloadSpeed: true, uploadSpeed: true },
          }).catch(() => null);
          if (openPlan?.downloadSpeed && openPlan.downloadSpeed > 0) {
            openPlanDnKbps = openPlan.downloadSpeed * 1000;  // Mbps → kbps
            openPlanUpKbps = openPlan.uploadSpeed * 1000;
          }
        }
      } catch {
        // Non-critical — use default bandwidth
      }

      // Check concurrent session limit BEFORE provisioning to avoid orphaned users (M-04)
      openSessionCheck = await handleSessionLimitWithDeviceFallback(wifiUsername!, 1, fingerprintHash, storageToken, macAddress);
      if (openSessionCheck.limitReached) {
        await logAuthAttempt(wifiUsername, 'Access-Reject', request, 'MAX_SESSIONS_REACHED');
        return errorResponseWithDeviceData('MAX_SESSIONS_REACHED', 'Maximum concurrent sessions reached. Please disconnect another device first.', wifiUsername, portalSlug);
      }

      // M4 FIX: Provision user — critical, fail on error
      try {
        await wifiUserService.provisionUser({
          tenantId: portal.tenantId,
          propertyId: resolvedPropertyId,
          username: wifiUsername,
          password: openPassword,
          validFrom: now,
          validUntil,
          userType: 'guest',
          downloadSpeed: openPlanDnKbps * 1000,  // kbps → bits/sec for RADIUS
          uploadSpeed: openPlanUpKbps * 1000,
          sessionTimeoutMinutes: portalSessionTimeoutMin,
          idleTimeoutSeconds: portal?.idleTimeout,
        });
      } catch (provisionErr) {
        console.error('[OpenAccess] User provisioning failed:', provisionErr);
        return errorResponse('PROVISION_FAILED', 'Failed to create your session. Please try again.');
      }

      // M4 FIX: RADIUS auth — critical, fail on error
      try {
        const radiusResult = await radiusAuth(wifiUsername, openPassword, resolvedClientIp);
        if (!radiusResult.accepted) {
          await logAuthAttempt(wifiUsername, 'Access-Reject', request, radiusResult.rejectReason || 'AUTH_FAILED');
          return errorResponse(radiusResult.rejectReason || 'AUTH_FAILED', getRejectMessage(radiusResult.rejectReason || 'AUTH_FAILED'));
        }
      } catch (radiusErr) {
        console.error('[OpenAccess] RADIUS auth error:', radiusErr);
        return errorResponse('RADIUS_UNREACHABLE', getRejectMessage('RADIUS_UNREACHABLE'));
      }

      // Non-critical: logging, accounting, identity verification
      try {
        await logAuthAttempt(wifiUsername, 'Access-Accept', request, `pool:${pool.poolName}`);
        openAccessSessionId = await createAccountingSession(wifiUsername, request, 'portal', effectiveMac, pool, resolvedPropertyId);

        logIdentityVerification({
          tenantId: portal?.tenantId || '',
          propertyId: resolvedPropertyId,
          sessionId: openAccessSessionId,
          username: wifiUsername || 'open-access',
          verificationMethod: 'none',
          verificationStatus: 'skipped',
          ipAddress: resolvedClientIp,
          macAddress: effectiveMac,
        });
      } catch (ncErr) {
        console.warn('[OpenAccess] Non-critical post-auth operations failed:', ncErr);
      }

      // M4 FIX: Activate firewall — critical for internal NAS mode, fail on error
      if (!externalGateway) {
        try {
          const openNatParams = await resolvePoolNatParams(pool, resolvedClientIp);
          // Backfill the SNAT IP onto the radacct row created above.
          // openAccessSessionId was awaited, so the INSERT has already committed — safe to UPDATE directly.
          if (openNatParams.snatIp) {
            backfillSnatIpInRadacct(openAccessSessionId, openNatParams.snatIp).catch(() => {});
          }
          const gatewayFwBit = await resolveGatewayFwBit(openDefaultPlanId);
          await activateUserFirewall({
            username: wifiUsername, clientIp: resolvedClientIp,
            propertyId: resolvedPropertyId, sessionId: openAccessSessionId,
            macAddress: effectiveMac,
            dnKbps: openPlanDnKbps,
            upKbps: openPlanUpKbps,
            subnet: pool.subnet,
            ...openNatParams,
            gatewayFwBit,
          });

          // Add per-IP byte counter rules for session engine tracking
          const openCounterIp = normalizeIp(resolvedClientIp);
          if (openCounterIp && openCounterIp !== '0.0.0.0') {
            addUserCounter(openCounterIp);
          }
        } catch (fwErr) {
          console.error('[OpenAccess] Firewall activation failed:', fwErr);
          return errorResponse('FIREWALL_FAILED', 'Connection established but firewall rules could not be applied. Please try again or contact support.');
        }
      }

    }

    // Save guest info from portal form (non-critical)
    if (wifiUsername && resolvedPropertyId) {
    saveGuestInfoAfterAuth({
      wifiUsername,
      propertyId: resolvedPropertyId,
      guestInfo: normalizedGuestInfo,
      marketingConsent: { emailConsent: marketingEmailConsent === 'true', smsConsent: marketingSmsConsent === 'true' },
      portalSlug,
      request,
    }).catch(() => {});
    }

    // Register this device's MAC for the user (non-critical)
    if (wifiUsername) {
      db.wiFiUser.findUnique({ where: { username: wifiUsername }, select: { id: true } })
        .then(openUser => {
          if (openUser) {
            return registerUserDevice({
              wifiUserId: openUser.id,
              tenantId: portal.tenantId,
              propertyId: resolvedPropertyId || '',
              macAddress: effectiveMac,
              request,
              source: 'open_access',
            });
          }
        })
        .catch(() => {}); // Non-critical
    }
  }

  // Log auth for the no-portal case (null username, no RADIUS provisioning)
  if (!portal) {
    await logAuthAttempt('open-access-no-portal', 'Access-Accept', request, `pool:${pool.poolName}`);
  }

  // F-07: When no portal exists, no RADIUS user was provisioned — guest has no actual internet
  if (!wifiUsername) {
    return errorResponse('NO_PORTAL', 'Open access is not configured for this network. Please contact front desk.');
  }

  return successResponse(
    {
      authenticated: true, method: 'open_access', username: wifiUsername,
      sessionTimeout: portalSessionTimeoutMin, bandwidthDown: openPlanDnKbps / 1000, bandwidthUp: openPlanUpKbps / 1000,
      poolName: pool.poolName, message: 'Connected successfully!',
      sessionId: openAccessSessionId,
      guestId: null,
    },
    wifiUsername && openPassword ? { username: wifiUsername, password: openPassword } : undefined,
    externalGateway,
    request,
    resolvedClientIp
  );
}