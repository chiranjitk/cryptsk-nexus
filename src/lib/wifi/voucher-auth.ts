/**
 * Voucher Authentication Handler
 *
 * Handles WiFi authentication via voucher code.
 * Extracted from: src/app/api/v1/wifi/auth/route.ts case 'voucher' (lines 1795-2031)
 *
 * Flow: Validate voucher → check pool/session → provision user → claim voucher (atomic lock) → RADIUS auth → session
 */

import type { AuthContext } from './types';
import { checkAuthRateLimit } from './auth-rate-limit';
import {
  errorResponse, successResponse, errorResponseWithDeviceData,
  logAuthAttempt, createAccountingSession, getValidatedPool,
  resolveAllowedPoolIds, handleSessionLimitWithDeviceFallback,
  isMacBindingEnforced, isMacRegisteredForUser, isDeviceBlocked,
  resolveMacOwnership, provisionOrResumeUser,
  upsertDeviceProfileWithFingerprint, saveGuestInfoAfterAuth,
  registerUserDevice, logIdentityVerification, normalizeIp,
  addUserCounter, activateUserFirewall, resolveGatewayFwBit, resolvePlanBandwidthKbps,
  resolvePoolNatParams,
  backfillSnatIpInRadacct,
} from './helpers';
import { radiusAuth, getRejectMessage } from '@/lib/wifi/utils/radius-auth';
import { db } from '@/lib/db';

export async function handleVoucherAuth(ctx: AuthContext) {
  const {
    request, voucherCode, portal, portalSlug, portalSessionTimeoutMin,
    bwDown, bwUp, resolvedClientIp, effectiveMac, deviceMac,
    fingerprintHash, storageToken, externalGateway,
    normalizedGuestInfo, marketingEmailConsent, marketingSmsConsent,
  } = ctx;

  if (!voucherCode?.trim()) {
    await logAuthAttempt('voucher-auth', 'Access-Reject', request, 'MISSING_VOUCHER');
    return errorResponse('MISSING_VOUCHER', 'Please enter a voucher code');
  }
  if (voucherCode.trim().length > 64) {
    return errorResponse('MISSING_VOUCHER', 'Voucher code is too long');
  }

  // Per-IP rate limiting via portal preferences
  const voucherRateCheck = await checkAuthRateLimit(resolvedClientIp, 'voucher', portal?.tenantId);
  if (!voucherRateCheck.allowed) {
    await logAuthAttempt('voucher-auth', 'Access-Reject', request, 'RATE_LIMITED');
    return errorResponse('RATE_LIMITED', `Too many voucher attempts. Please try again in ${voucherRateCheck.retryAfter} seconds.`);
  }

  const voucher = await db.wiFiVoucher.findUnique({
    where: { code: voucherCode.trim().toUpperCase() },
    include: { plan: { include: { planPools: { select: { poolId: true }, orderBy: { priority: 'asc' } } } } },
  });

  if (!voucher) {
    await logAuthAttempt(voucherCode.trim(), 'Access-Reject', request, 'INVALID_VOUCHER');
    return errorResponse('INVALID_VOUCHER', 'Invalid or expired voucher code');
  }

  const resolvedTenantId = portal?.tenantId ?? voucher.tenantId;
  if (voucher.tenantId !== resolvedTenantId) {
    await logAuthAttempt(`voucher-${voucher.code.toLowerCase()}`, 'Access-Reject', request, 'TENANT_MISMATCH');
    return errorResponse('INVALID_VOUCHER', 'Invalid voucher code');
  }

  if (voucher.status !== 'active' || voucher.isUsed) {
    await logAuthAttempt(`voucher-${voucher.code.toLowerCase()}`, 'Access-Reject', request, 'VOUCHER_USED');
    return errorResponse('VOUCHER_USED', 'This voucher has already been used');
  }

  const now = new Date();
  if (voucher.validFrom && now < voucher.validFrom) {
    await logAuthAttempt(`voucher-${voucher.code.toLowerCase()}`, 'Access-Reject', request, 'VOUCHER_NOT_YET_VALID');
    return errorResponse('VOUCHER_NOT_YET_VALID', 'This voucher is not yet valid. It becomes active at a later date.');
  }
  if (voucher.validUntil && voucher.validUntil < now) {
    // Lazy-update status in DB for consistency with admin dashboard
    await db.wiFiVoucher.update({ where: { id: voucher.id }, data: { status: 'expired' } }).catch(() => {});
    await logAuthAttempt(`voucher-${voucher.code.toLowerCase()}`, 'Access-Reject', request, 'VOUCHER_EXPIRED');
    return errorResponse('VOUCHER_EXPIRED', 'This voucher has expired. Please contact front desk for a new one.');
  }

  const voucherPlanPoolIds = voucher.plan?.planPools?.map((pp: any) => pp.poolId) || [];
  const allowedPools = resolveAllowedPoolIds(voucher.plan?.ipPoolId, undefined, !!voucher.plan, voucherPlanPoolIds);
  const wifiUsername = `voucher-${voucher.code.toLowerCase()}`;
  const maxSessions = voucher.plan?.maxDevices || 1;

  const [pool, resolvedPropertyId, sessionCheck, macBindingEnforced] = await Promise.all([
    getValidatedPool(request, allowedPools),
    voucher.plan?.propertyId
      ? Promise.resolve(voucher.plan.propertyId)
      : db.property.findFirst({ where: { tenantId: voucher.tenantId }, select: { id: true } }).then(p => p?.id ?? null),
    handleSessionLimitWithDeviceFallback(wifiUsername, maxSessions, fingerprintHash, storageToken, ctx.macAddress),
    effectiveMac ? isMacBindingEnforced(
      voucher.plan?.propertyId || '',
      voucher.tenantId,
    ) : Promise.resolve(false),
  ]);

  if (!pool) {
    await logAuthAttempt(`voucher-${voucher.code.toLowerCase()}`, 'Access-Reject', request, `IP_NOT_IN_POOL:${resolvedClientIp}`);
    return errorResponse('IP_NOT_IN_POOL', 'Your device is not connected to a managed WiFi network. Please connect to the hotel WiFi and try again.', 403);
  }

  if (!resolvedPropertyId) {
    await logAuthAttempt(`voucher-${voucher.code.toLowerCase()}`, 'Access-Reject', request, 'NO_PROPERTY');
    return errorResponse('NO_PROPERTY', 'No property configured. Please contact front desk.');
  }

  if (sessionCheck.limitReached) {
    await logAuthAttempt(wifiUsername, 'Access-Reject', request, 'MAX_SESSIONS_REACHED');
    return errorResponseWithDeviceData('MAX_SESSIONS_REACHED', 'Maximum concurrent sessions reached. Please disconnect another device first.', wifiUsername, portalSlug);
  }

  const planValidityMin = voucher.plan?.validityMinutes || (voucher.plan?.validityDays ? voucher.plan.validityDays * 1440 : null);
  const voucherSessionTimeoutMin = planValidityMin || portalSessionTimeoutMin;
  const validUntil = new Date(now.getTime() + voucherSessionTimeoutMin * 60 * 1000);
  const dataLimitMb = voucher.plan?.dataLimit ?? undefined;

  // Bandwidth unit chain: DB stores Mbps → * 1000 = kbps → * 1000 = bps (for RADIUS)
  // Response converts back: kbps / 1000 = Mbps (for client display)
  const planDnKbps = (voucher.plan?.downloadSpeed || bwDown) * 1000;
  const planUpKbps = (voucher.plan?.uploadSpeed || bwUp) * 1000;

  await provisionOrResumeUser(wifiUsername, now, validUntil, {
    tenantId: voucher.tenantId,
    propertyId: resolvedPropertyId,
    guestId: voucher.guestId ?? undefined,
    bookingId: voucher.bookingId ?? undefined,
    username: wifiUsername,
    password: voucher.code,
    planId: voucher.planId ?? undefined,
    planName: voucher.plan?.name,
    downloadSpeed: planDnKbps * 1000,
    uploadSpeed: planUpKbps * 1000,
    sessionTimeoutMinutes: voucherSessionTimeoutMin,
    idleTimeoutSeconds: portal?.idleTimeout,
    sessionLimit: voucher.plan?.maxDevices,
    dataLimit: dataLimitMb,
  });

  if (effectiveMac) {
    const voucherWifiUser = await db.wiFiUser.findUnique({ where: { username: wifiUsername }, select: { id: true, tenantId: true, propertyId: true } });
    if (voucherWifiUser) {
      const deviceBlocked = await isDeviceBlocked(voucherWifiUser.id, effectiveMac);
      if (deviceBlocked) {
        console.warn(`[Auth:Device] MAC ${effectiveMac} is deactivated for user ${wifiUsername} — rejecting`);
        await logAuthAttempt(wifiUsername, 'Access-Reject', request, 'DEVICE_BLOCKED', effectiveMac);
        return errorResponse('DEVICE_BLOCKED', 'This device has been deactivated by the administrator. Please contact the front desk.');
      }
      const macOwnership = await resolveMacOwnership(effectiveMac, voucherWifiUser.id, voucherWifiUser.tenantId, voucherWifiUser.propertyId, voucher.guestId);
      if (!macOwnership.allowed) {
        console.warn(`[Auth:MAC] Rejecting voucher login for ${wifiUsername}: MAC ${effectiveMac} owned by active user ${macOwnership.previousOwnerUsername}`);
        await logAuthAttempt(wifiUsername, 'Access-Reject', request, 'MAC_OWNED_BY_OTHER_USER', effectiveMac);
        return errorResponse('MAC_OWNED_BY_OTHER_USER', 'This device is already registered to another active user. Please contact the front desk if you believe this is an error.', 403);
      }
    }
  }

  if (effectiveMac && macBindingEnforced) {
    const voucherWifiUser = await db.wiFiUser.findUnique({ where: { username: wifiUsername }, select: { id: true } });
    if (voucherWifiUser) {
      const macRegistered = await isMacRegisteredForUser(voucherWifiUser.id, effectiveMac);
      if (!macRegistered) {
        console.warn(`[Auth:MAC] MAC ${effectiveMac} not registered for user ${wifiUsername} — rejecting`);
        await logAuthAttempt(wifiUsername, 'Access-Reject', request, 'MAC_NOT_REGISTERED_FOR_USER', effectiveMac);
        return errorResponse('MAC_NOT_REGISTERED', 'This device is not registered for your account. Please contact the front desk to register your device.');
      }
    }
  }

  // Claim voucher atomically BEFORE RADIUS auth to prevent TOCTOU race condition.
  // Two concurrent requests must not both pass RADIUS auth before either claims the voucher.
  const updatedVoucher = await db.wiFiVoucher.updateMany({
    where: { id: voucher.id, isUsed: false },
    data: { isUsed: true, usedAt: new Date(), status: 'used' },
  });
  if (updatedVoucher.count === 0) {
    console.warn(`[Auth:Voucher] Concurrent claim detected for ${voucher.code}, aborting session for ${wifiUsername}`);
    await logAuthAttempt(wifiUsername, 'Access-Reject', request, 'VOUCHER_ALREADY_CLAIMED');
    return errorResponse('VOUCHER_ALREADY_CLAIMED', 'Voucher already used by another session', 409);
  }
  console.log(`[Auth:Voucher] Voucher ${voucher.code} claimed successfully before RADIUS auth for ${wifiUsername}`);

  const radiusResult = await radiusAuth(wifiUsername, voucher.code, resolvedClientIp);
  if (!radiusResult.accepted) {
    // Roll back voucher claim since RADIUS auth failed
    await db.wiFiVoucher.update({
      where: { id: voucher.id },
      data: { isUsed: false, usedAt: null, status: 'active' },
    }).catch(() => {});
    // Also clean up the provisioned WiFiUser to prevent orphans
    try {
      await db.wiFiUser.deleteMany({ where: { username: wifiUsername, status: 'active' } });
    } catch (cleanupErr) {
      console.warn('[VoucherAuth] Failed to cleanup WiFiUser after RADIUS failure:', cleanupErr);
    }
    await logAuthAttempt(wifiUsername, 'Access-Reject', request, radiusResult.rejectReason || 'AUTH_FAILED');
    return errorResponse(radiusResult.rejectReason || 'AUTH_FAILED', getRejectMessage(radiusResult.rejectReason || 'AUTH_FAILED'));
  }

  await logAuthAttempt(wifiUsername, 'Access-Accept', request, `pool:${pool.poolName}`);
  let voucherSessionId: string | null = null;
  voucherSessionId = await createAccountingSession(wifiUsername, request, 'portal', effectiveMac, pool, resolvedPropertyId);

  logIdentityVerification({
    tenantId: voucher.tenantId,
    propertyId: resolvedPropertyId,
    sessionId: voucherSessionId,
    username: wifiUsername,
    verificationMethod: 'none',
    verifiedIdentity: voucher.code.length > 4 ? `****${voucher.code.slice(-4)}` : '****',
    verificationStatus: 'verified',
    ipAddress: resolvedClientIp,
    macAddress: effectiveMac,
  });

  if (!externalGateway) {
    const voucherBw = await resolvePlanBandwidthKbps(
      voucher.planId, wifiUsername,
      portal?.maxBandwidthDown, portal?.maxBandwidthUp,
    );
    const natParams = await resolvePoolNatParams(pool, resolvedClientIp);
    // Backfill the SNAT IP onto the radacct row created above.
    // voucherSessionId was awaited, so the INSERT has already committed — safe to UPDATE directly.
    if (natParams.snatIp) {
      backfillSnatIpInRadacct(voucherSessionId, natParams.snatIp).catch(() => {});
    }
    const gatewayFwBit = await resolveGatewayFwBit(voucher.planId);
    await activateUserFirewall({
      username: wifiUsername, clientIp: resolvedClientIp,
      propertyId: resolvedPropertyId, sessionId: voucherSessionId,
      macAddress: effectiveMac,
      dnKbps: voucherBw.dn,
      upKbps: voucherBw.up,
      dnCeilKbps: voucherBw.dnCeil,
      upCeilKbps: voucherBw.upCeil,
      subnet: pool.subnet,
      ...natParams,
      gatewayFwBit,
    });

    const voucherCounterIp = normalizeIp(resolvedClientIp);
    if (voucherCounterIp && voucherCounterIp !== '0.0.0.0') {
      addUserCounter(voucherCounterIp);
    }
  }

  try {
    const voucherUser = await db.wiFiUser.findUnique({ where: { username: wifiUsername }, select: { id: true, tenantId: true, propertyId: true, guestId: true } });
    if (voucherUser) {
      await Promise.allSettled([
        upsertDeviceProfileWithFingerprint({ wifiUserId: voucherUser.id, tenantId: voucherUser.tenantId, propertyId: voucherUser.propertyId, guestId: voucherUser.guestId, username: wifiUsername, request, macAddress: effectiveMac, fingerprintHash, storageToken }),
        saveGuestInfoAfterAuth({
          wifiUserId: voucherUser.id,
          guestId: voucherUser.guestId,
          bookingId: voucher.bookingId,
          guestInfo: normalizedGuestInfo,
          marketingConsent: { emailConsent: marketingEmailConsent === 'true' || marketingEmailConsent === true, smsConsent: marketingSmsConsent === 'true' || marketingSmsConsent === true },
          portalSlug,
          request,
        }),
        registerUserDevice({
          wifiUserId: voucherUser.id,
          tenantId: voucherUser.tenantId,
          propertyId: voucherUser.propertyId,
          guestId: voucherUser.guestId,
          macAddress: effectiveMac,
          request,
          source: 'voucher',
        }),
      ]);
    }
  } catch { /* best effort */ }

  return successResponse(
    {
      authenticated: true, method: 'voucher', username: wifiUsername,
      sessionTimeout: voucherSessionTimeoutMin, bandwidthDown: voucher.plan?.downloadSpeed || bwDown, bandwidthUp: voucher.plan?.uploadSpeed || bwUp,
      poolName: pool.poolName, message: 'Connected successfully!',
      sessionId: voucherSessionId,
      guestId: voucher.guestId || null,
    },
    { username: wifiUsername, password: voucher.code },
    externalGateway,
    request,
    resolvedClientIp
  );
}
