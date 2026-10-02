/**
 * Room Number Authentication Handler
 *
 * Handles WiFi authentication via room number + last name lookup in PMS.
 * Extracted from: src/app/api/v1/wifi/auth/route.ts case 'room_number' (lines 2042-2511)
 *
 * Flow: Validate room/name → lookup booking in PMS → reuse existing user or create room-{number} → RADIUS auth
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
import { wifiUserService } from '@/lib/wifi/services/wifi-user-service';
import { db } from '@/lib/db';

export async function handleRoomNumberAuth(ctx: AuthContext) {
  const {
    request, portal, portalSlug, portalSessionTimeoutMin,
    bwDown, bwUp, resolvedClientIp, effectiveMac,
    fingerprintHash, storageToken, externalGateway,
    normalizedGuestInfo, marketingEmailConsent, marketingSmsConsent,
    roomNumber, lastName, macAddress,
  } = ctx;

  if (!roomNumber?.trim()) {
    await logAuthAttempt('room-auth', 'Access-Reject', request, 'MISSING_ROOM');
    return errorResponse('MISSING_ROOM', 'Please enter your room number');
  }
  if (!lastName?.trim()) {
    await logAuthAttempt('room-auth', 'Access-Reject', request, 'MISSING_NAME');
    return errorResponse('MISSING_NAME', 'Please enter your last name');
  }
  if (roomNumber.trim().length > 20) {
    return errorResponse('MISSING_ROOM', 'Room number is too long');
  }
  if (lastName.trim().length > 100) {
    return errorResponse('MISSING_NAME', 'Last name is too long');
  }

  // Per-IP rate limiting via portal preferences
  const roomRateCheck = await checkAuthRateLimit(resolvedClientIp, 'room', portal?.tenantId);
  if (!roomRateCheck.allowed) {
    await logAuthAttempt('room-auth', 'Access-Reject', request, 'RATE_LIMITED');
    return errorResponse('RATE_LIMITED', `Too many room auth attempts. Please try again in ${roomRateCheck.retryAfter} seconds.`);
  }

  const bookingWhere: any = { room: { number: roomNumber.trim().toUpperCase() }, status: 'checked_in' };
  const effectiveTenantId = portal?.tenantId;
  if (effectiveTenantId) {
    bookingWhere.tenantId = effectiveTenantId;
  }
  const bookings = await db.booking.findMany({
    where: bookingWhere,
    include: { primaryGuest: true, room: true, roomType: { select: { wifiPlanId: true } } },
    take: 10,
  });

  // Case-insensitive lastName comparison (CITEXT handles this in SQL,
  // but this is a JS in-memory filter after Prisma already returned results).
  const inputLastName = lastName.trim().toLowerCase();
  const match = bookings.find(
    (b) => b.primaryGuest.lastName.toLowerCase() === inputLastName
  );

  if (!match) {
    await logAuthAttempt(`room-${roomNumber.trim().toLowerCase()}`, 'Access-Reject', request, 'ROOM_NOT_FOUND');
    logIdentityVerification({
      tenantId: effectiveTenantId || '',
      propertyId: null,
      sessionId: null,
      username: `room-${roomNumber.trim().toLowerCase()}`,
      verificationMethod: 'room_number',
      verifiedIdentity: roomNumber.trim(),
      verificationStatus: 'failed',
      ipAddress: resolvedClientIp,
      macAddress: effectiveMac,
      failureReason: 'Room number not found in PMS',
    });
    return errorResponse('ROOM_NOT_FOUND', 'No active guest found for this room number and last name. Please verify and try again.');
  }

  // ── Credentials valid — now resolve plan ──
  // Priority: roomType's WiFi plan → property's default AAA plan
  let roomPlanIpPoolId: string | null = null;
  let roomPlanPoolIds: string[] = [];
  let roomPlanId: string | null = match.roomType?.wifiPlanId ?? null;

  if (roomPlanId) {
    const roomPlan = await db.wiFiPlan.findUnique({
      where: { id: roomPlanId },
      select: { ipPoolId: true, planPools: { select: { poolId: true }, orderBy: { priority: 'asc' } } },
    });
    roomPlanIpPoolId = roomPlan?.ipPoolId ?? null;
    roomPlanPoolIds = roomPlan?.planPools?.map((pp: any) => pp.poolId) || [];
  } else {
    // No plan on room type — fall back to property's default AAA plan
    const aaaConfig = await db.wiFiAAAConfig.findUnique({
      where: { propertyId: match.propertyId },
      select: { defaultPlanId: true },
    });
    if (aaaConfig?.defaultPlanId) {
      roomPlanId = aaaConfig.defaultPlanId;
      const defaultPlan = await db.wiFiPlan.findUnique({
        where: { id: roomPlanId },
        select: { ipPoolId: true, planPools: { select: { poolId: true }, orderBy: { priority: 'asc' } } },
      });
      roomPlanIpPoolId = defaultPlan?.ipPoolId ?? null;
      roomPlanPoolIds = defaultPlan?.planPools?.map((pp: any) => pp.poolId) || [];
    }
  }

  const now = new Date();

  // ── Look for existing PMS-provisioned WiFiUser ──
  const existingByBooking = await db.wiFiUser.findFirst({
    where: { bookingId: match.id, status: { in: ['active', 'suspended'] } },
    include: { plan: { select: { ipPoolId: true, maxDevices: true, validityMinutes: true, validityDays: true, downloadSpeed: true, uploadSpeed: true, name: true, planPools: { select: { poolId: true }, orderBy: { priority: 'asc' } } } } },
  });

  const existingByGuest = !existingByBooking
    ? await db.wiFiUser.findFirst({
        where: { guestId: match.primaryGuestId, status: 'active', propertyId: match.propertyId },
        include: { plan: { select: { ipPoolId: true, maxDevices: true, validityMinutes: true, validityDays: true, downloadSpeed: true, uploadSpeed: true, name: true, planPools: { select: { poolId: true }, orderBy: { priority: 'asc' } } } } },
      })
    : null;

  const existingUser = existingByBooking || existingByGuest;
  const reuseExisting = !!existingUser;
  let pmsReuseSessionId: string | null = null;
  let pmsGuestId: string | null = null;

  if (reuseExisting) {
    // ── Reuse existing PMS-provisioned user ──
    const pmsUser = existingUser!;
    pmsGuestId = pmsUser.guestId || null;

    if (pmsUser.status !== 'active') {
      await logAuthAttempt(pmsUser.username, 'Access-Reject', request, 'ACCOUNT_INACTIVE');
      return errorResponse('ACCOUNT_INACTIVE', 'Your WiFi account is not active. Please contact front desk.');
    }

    if (new Date(pmsUser.validUntil) < now) {
      await logAuthAttempt(pmsUser.username, 'Access-Reject', request, 'ACCOUNT_EXPIRED');
      return errorResponse('ACCOUNT_EXPIRED', 'Your WiFi session has expired. Please contact front desk to renew.');
    }

    const pmsPlanPoolIds = pmsUser.plan?.planPools?.map((pp: any) => pp.poolId) || [];
    const allowedPools = resolveAllowedPoolIds(pmsUser.plan?.ipPoolId || roomPlanIpPoolId, pmsUser.ipPoolId, !!(pmsUser.plan?.ipPoolId || roomPlanIpPoolId), pmsPlanPoolIds);
    const pmsMaxSessions = pmsUser.plan?.maxDevices || pmsUser.plan?.sessionLimit || pmsUser.maxSessions || 1;

    const [pool, existingCheck, pmsSessionCheck, macBindingEnforced, macOwnership] = await Promise.all([
      getValidatedPool(request, allowedPools),
      db.radCheck.findFirst({ where: { username: pmsUser.username } }),
      handleSessionLimitWithDeviceFallback(pmsUser.username, pmsMaxSessions, fingerprintHash, storageToken, macAddress),
      effectiveMac ? isMacBindingEnforced(pmsUser.propertyId, pmsUser.tenantId) : Promise.resolve(false),
      resolveMacOwnership(effectiveMac, pmsUser.id, pmsUser.tenantId, pmsUser.propertyId, pmsUser.guestId),
    ]);

    if (!pool) {
      await logAuthAttempt(pmsUser.username, 'Access-Reject', request, `IP_NOT_IN_POOL:${resolvedClientIp}`);
      return errorResponse('IP_NOT_IN_POOL', 'Your device is not connected to a managed WiFi network. Please connect to the hotel WiFi and try again.', 403);
    }

    if (!existingCheck) {
      try { await wifiUserService.resumeUser(pmsUser.id); } catch { /* best effort */ }
    }

    if (pmsSessionCheck.limitReached) {
      await logAuthAttempt(pmsUser.username, 'Access-Reject', request, 'MAX_SESSIONS_REACHED');
      return errorResponseWithDeviceData('MAX_SESSIONS_REACHED', 'Maximum concurrent sessions reached. Please disconnect another device first.', pmsUser.username, portalSlug);
    }

    if (!macOwnership.allowed) {
      console.warn(`[Auth:MAC] Rejecting login for ${pmsUser.username}: MAC ${effectiveMac} owned by active user ${macOwnership.previousOwnerUsername}`);
      await logAuthAttempt(pmsUser.username, 'Access-Reject', request, 'MAC_OWNED_BY_OTHER_USER', effectiveMac);
      return errorResponse('MAC_OWNED_BY_OTHER_USER', 'This device is already registered to another active user. Please contact the front desk if you believe this is an error.', 403);
    }

    if (effectiveMac) {
      const deviceBlocked = await isDeviceBlocked(pmsUser.id, effectiveMac);
      if (deviceBlocked) {
        console.warn(`[Auth:Device] MAC ${effectiveMac} is deactivated for user ${pmsUser.username} — rejecting`);
        await logAuthAttempt(pmsUser.username, 'Access-Reject', request, 'DEVICE_BLOCKED', effectiveMac);
        return errorResponse('DEVICE_BLOCKED', 'This device has been deactivated by the administrator. Please contact the front desk.');
      }
    }

    if (effectiveMac && macBindingEnforced) {
      const macRegistered = await isMacRegisteredForUser(pmsUser.id, effectiveMac);
      if (!macRegistered) {
        console.warn(`[Auth:MAC] MAC ${effectiveMac} not registered for user ${pmsUser.username} — rejecting`);
        await logAuthAttempt(pmsUser.username, 'Access-Reject', request, 'MAC_NOT_REGISTERED_FOR_USER', effectiveMac);
        return errorResponse('MAC_NOT_REGISTERED', 'This device is not registered for your account. Please contact the front desk to register your device.');
      }
    }

    const radiusResult = await radiusAuth(pmsUser.username, pmsUser.password, resolvedClientIp);
    if (!radiusResult.accepted) {
      await logAuthAttempt(pmsUser.username, 'Access-Reject', request, radiusResult.rejectReason || 'AUTH_FAILED');
      return errorResponse(radiusResult.rejectReason || 'AUTH_FAILED', getRejectMessage(radiusResult.rejectReason || 'AUTH_FAILED'));
    }

    // ── Calculate remaining validity (NEVER reset validUntil) ──
    const planValidityMin = pmsUser.plan?.validityMinutes
      || (pmsUser.plan?.validityDays ? pmsUser.plan.validityDays * 1440 : null)
      || portalSessionTimeoutMin;
    const remainingMs = new Date(pmsUser.validUntil).getTime() - now.getTime();
    const remainingMinutes = Math.max(0, Math.ceil(remainingMs / 60000));
    const remainingSeconds = Math.max(0, Math.floor(remainingMs / 1000));

    const cappedSessionTimeoutSec = Math.min(planValidityMin * 60, remainingSeconds);
    await db.radReply.deleteMany({ where: { username: pmsUser.username, attribute: 'Session-Timeout' } });
    await db.radReply.create({
      data: {
        wifiUserId: pmsUser.id, username: pmsUser.username,
        attribute: 'Session-Timeout', op: ':=',
        value: String(cappedSessionTimeoutSec), isActive: true,
      },
    });

    await db.wiFiUser.update({ where: { id: pmsUser.id }, data: { validFrom: now } });

    const pmsBwDown = pmsUser.plan?.downloadSpeed || bwDown;
    const pmsBwUp = pmsUser.plan?.uploadSpeed || bwUp;

    await logAuthAttempt(pmsUser.username, 'Access-Accept', request, `pool:${pool.poolName} reuse:pms plan:${pmsUser.plan?.name || 'none'}`);
    pmsReuseSessionId = await createAccountingSession(pmsUser.username, request, 'portal', effectiveMac, pool, match.propertyId);

    logIdentityVerification({
      tenantId: pmsUser.tenantId,
      propertyId: match.propertyId,
      sessionId: pmsReuseSessionId,
      username: pmsUser.username,
      verificationMethod: 'room_number',
      verifiedIdentity: match.room?.number
        ? (match.room.number.length > 1 ? `Room ${'*'.repeat(match.room.number.length - 1)}${match.room.number.slice(-1)}` : 'Room ****')
        : 'Room ****',
      verificationStatus: 'verified',
      ipAddress: resolvedClientIp,
      macAddress: effectiveMac,
    });

    if (!externalGateway) {
      const pmsBw = await resolvePlanBandwidthKbps(
        pmsUser.planId, pmsUser.username,
        portal?.maxBandwidthDown, portal?.maxBandwidthUp,
      );
      const pmsNatParams = await resolvePoolNatParams(pool, resolvedClientIp);
      // Backfill the SNAT IP onto the radacct row created above.
      // pmsReuseSessionId was awaited, so the INSERT has already committed — safe to UPDATE directly.
      if (pmsNatParams.snatIp) {
        backfillSnatIpInRadacct(pmsReuseSessionId, pmsNatParams.snatIp).catch(() => {});
      }
      const gatewayFwBit = await resolveGatewayFwBit(pmsUser.planId);
      await activateUserFirewall({
        username: pmsUser.username, clientIp: resolvedClientIp,
        propertyId: match.propertyId, sessionId: pmsReuseSessionId,
        macAddress: effectiveMac, userId: pmsUser.id,
        dnKbps: pmsBw.dn,
        upKbps: pmsBw.up,
        dnCeilKbps: pmsBw.dnCeil,
        upCeilKbps: pmsBw.upCeil,
        subnet: pool.subnet,
        ...pmsNatParams,
        gatewayFwBit,
      });

      const pmsCounterIp = normalizeIp(resolvedClientIp);
      if (pmsCounterIp && pmsCounterIp !== '0.0.0.0') {
        addUserCounter(pmsCounterIp);
      }
    }

    Promise.allSettled([
      upsertDeviceProfileWithFingerprint({
        wifiUserId: pmsUser.id, tenantId: pmsUser.tenantId,
        propertyId: pmsUser.propertyId, guestId: pmsUser.guestId,
        username: pmsUser.username, request,
        macAddress: effectiveMac, fingerprintHash, storageToken,
      }),
      saveGuestInfoAfterAuth({
        wifiUserId: pmsUser.id,
        guestId: pmsUser.guestId,
        bookingId: match.id,
        guestInfo: normalizedGuestInfo,
        marketingConsent: { emailConsent: marketingEmailConsent === 'true', smsConsent: marketingSmsConsent === 'true' },
        portalSlug,
        request,
      }),
      registerUserDevice({
        wifiUserId: pmsUser.id,
        tenantId: pmsUser.tenantId,
        propertyId: pmsUser.propertyId,
        guestId: pmsUser.guestId,
        macAddress: effectiveMac,
        request,
        source: 'room_number',
      }),
    ]).catch(() => {});

    return successResponse(
      {
        authenticated: true, method: 'room_number', username: pmsUser.username,
        sessionTimeout: planValidityMin, remainingMinutes,
        bandwidthDown: pmsBwDown, bandwidthUp: pmsBwUp,
        poolName: pool.poolName, planName: pmsUser.plan?.name || null,
        message: 'Connected successfully!',
        sessionId: pmsReuseSessionId,
        guestId: pmsGuestId,
      },
      { username: pmsUser.username, password: pmsUser.password },
      externalGateway,
      request,
      resolvedClientIp
    );
  }

  // ── No PMS user found — fallback: create room-{number} user ──
  console.log(`[Room Auth] No PMS user found for booking ${match.id} / guest ${match.primaryGuestId} — falling back to room-${match.room?.number?.toLowerCase() || roomNumber.trim().toLowerCase()}`);

  const validUntil = new Date(now.getTime() + portalSessionTimeoutMin * 60 * 1000);
  const wifiUsername = `room-${match.room?.number?.toLowerCase() || roomNumber.trim().toLowerCase()}`;
  const userPassword = `${match.primaryGuest.lastName}-${match.id.slice(0, 8)}`;

  let roomMaxDevices = 1;
  let roomDataLimit: number | undefined;
  let roomPlanDnKbps = bwDown * 1000;
  let roomPlanUpKbps = bwUp * 1000;

  const [pool, planAttrs] = await Promise.all([
    getValidatedPool(request, resolveAllowedPoolIds(roomPlanIpPoolId, undefined, !!roomPlanIpPoolId, roomPlanPoolIds)),
    roomPlanId
      ? db.wiFiPlan.findUnique({
          where: { id: roomPlanId },
          select: { maxDevices: true, dataLimit: true, downloadSpeed: true, uploadSpeed: true },
        })
      : Promise.resolve(null),
  ]);

  if (!pool) {
    await logAuthAttempt(`room-${roomNumber.trim().toLowerCase()}`, 'Access-Reject', request, `IP_NOT_IN_POOL:${resolvedClientIp}`);
    return errorResponse('IP_NOT_IN_POOL', 'Your device is not connected to a managed WiFi network. Please connect to the hotel WiFi and try again.', 403);
  }

  if (planAttrs) {
    if (planAttrs.maxDevices && planAttrs.maxDevices > 0) roomMaxDevices = planAttrs.maxDevices;
    if (planAttrs.dataLimit && planAttrs.dataLimit > 0) roomDataLimit = planAttrs.dataLimit;
    if (planAttrs.downloadSpeed && planAttrs.downloadSpeed > 0) {
      roomPlanDnKbps = planAttrs.downloadSpeed * 1000;
      roomPlanUpKbps = planAttrs.uploadSpeed * 1000;
    }
  }

  const roomSessionCheck = await handleSessionLimitWithDeviceFallback(wifiUsername, roomMaxDevices, fingerprintHash, storageToken, macAddress);
  if (roomSessionCheck.limitReached) {
    await logAuthAttempt(wifiUsername, 'Access-Reject', request, 'MAX_SESSIONS_REACHED');
    return errorResponseWithDeviceData('MAX_SESSIONS_REACHED', 'Maximum concurrent sessions reached. Please disconnect another device first.', wifiUsername, portalSlug);
  }

  await provisionOrResumeUser(wifiUsername, now, validUntil, {
    tenantId: match.tenantId,
    propertyId: match.propertyId,
    guestId: match.primaryGuestId,
    bookingId: match.id,
    username: wifiUsername,
    password: userPassword,
    planId: roomPlanId ?? undefined,
    downloadSpeed: roomPlanDnKbps * 1000,
    uploadSpeed: roomPlanUpKbps * 1000,
    sessionTimeoutMinutes: portalSessionTimeoutMin,
    idleTimeoutSeconds: portal?.idleTimeout,
    sessionLimit: roomMaxDevices,
    dataLimit: roomDataLimit,
  });

  if (effectiveMac) {
    const roomFallbackWifiUser = await db.wiFiUser.findUnique({ where: { username: wifiUsername }, select: { id: true, tenantId: true, propertyId: true } });
    if (roomFallbackWifiUser) {
      const deviceBlocked = await isDeviceBlocked(roomFallbackWifiUser.id, effectiveMac);
      if (deviceBlocked) {
        console.warn(`[Auth:Device] MAC ${effectiveMac} is deactivated for user ${wifiUsername} — rejecting`);
        await logAuthAttempt(wifiUsername, 'Access-Reject', request, 'DEVICE_BLOCKED', effectiveMac);
        return errorResponse('DEVICE_BLOCKED', 'This device has been deactivated by the administrator. Please contact the front desk.');
      }
      const macOwnership = await resolveMacOwnership(effectiveMac, roomFallbackWifiUser.id, roomFallbackWifiUser.tenantId, roomFallbackWifiUser.propertyId, match.primaryGuestId);
      if (!macOwnership.allowed) {
        console.warn(`[Auth:MAC] Rejecting login for ${wifiUsername}: MAC ${effectiveMac} owned by active user ${macOwnership.previousOwnerUsername}`);
        await logAuthAttempt(wifiUsername, 'Access-Reject', request, 'MAC_OWNED_BY_OTHER_USER', effectiveMac);
        return errorResponse('MAC_OWNED_BY_OTHER_USER', 'This device is already registered to another active user. Please contact the front desk if you believe this is an error.', 403);
      }
    }
  }

  if (effectiveMac) {
    const roomFallbackWifiUser = await db.wiFiUser.findUnique({ where: { username: wifiUsername }, select: { id: true, tenantId: true, propertyId: true } });
    if (roomFallbackWifiUser) {
      const macBinding = await isMacBindingEnforced(roomFallbackWifiUser.propertyId, roomFallbackWifiUser.tenantId);
      if (macBinding) {
        const macRegistered = await isMacRegisteredForUser(roomFallbackWifiUser.id, effectiveMac);
        if (!macRegistered) {
          console.warn(`[Auth:MAC] MAC ${effectiveMac} not registered for user ${wifiUsername} — rejecting`);
          await logAuthAttempt(wifiUsername, 'Access-Reject', request, 'MAC_NOT_REGISTERED_FOR_USER', effectiveMac);
          return errorResponse('MAC_NOT_REGISTERED', 'This device is not registered for your account. Please contact the front desk to register your device.');
        }
      }
    }
  }

  const radiusResult = await radiusAuth(wifiUsername, userPassword, resolvedClientIp);
  if (!radiusResult.accepted) {
    await logAuthAttempt(wifiUsername, 'Access-Reject', request, radiusResult.rejectReason || 'AUTH_FAILED');
    return errorResponse(radiusResult.rejectReason || 'AUTH_FAILED', getRejectMessage(radiusResult.rejectReason || 'AUTH_FAILED'));
  }

  await logAuthAttempt(wifiUsername, 'Access-Accept', request, `pool:${pool.poolName} fallback:room_user`);
  let roomSessionId: string | null = null;
  roomSessionId = await createAccountingSession(wifiUsername, request, 'portal', effectiveMac, pool, match.propertyId);

  logIdentityVerification({
    tenantId: match.tenantId,
    propertyId: match.propertyId,
    sessionId: roomSessionId,
    username: wifiUsername,
    verificationMethod: 'room_number',
    verifiedIdentity: match.room?.number
      ? (match.room.number.length > 1 ? `Room ${'*'.repeat(match.room.number.length - 1)}${match.room.number.slice(-1)}` : 'Room ****')
      : 'Room ****',
    verificationStatus: 'verified',
    ipAddress: resolvedClientIp,
    macAddress: effectiveMac,
  });

  if (!externalGateway) {
    const roomNatParams = await resolvePoolNatParams(pool, resolvedClientIp);
    // Backfill the SNAT IP onto the radacct row created above.
    // roomSessionId was awaited, so the INSERT has already committed — safe to UPDATE directly.
    if (roomNatParams.snatIp) {
      backfillSnatIpInRadacct(roomSessionId, roomNatParams.snatIp).catch(() => {});
    }
    const gatewayFwBit = await resolveGatewayFwBit(roomPlanId);
    await activateUserFirewall({
      username: wifiUsername, clientIp: resolvedClientIp,
      propertyId: match.propertyId, sessionId: roomSessionId,
      macAddress: effectiveMac,
      dnKbps: roomPlanDnKbps,
      upKbps: roomPlanUpKbps,
      dnCeilKbps: Math.ceil(roomPlanDnKbps * 1.2),
      upCeilKbps: Math.ceil(roomPlanUpKbps * 1.2),
      subnet: pool.subnet,
      ...roomNatParams,
      gatewayFwBit,
    });

    const roomCounterIp = normalizeIp(resolvedClientIp);
    if (roomCounterIp && roomCounterIp !== '0.0.0.0') {
      addUserCounter(roomCounterIp);
    }
  }

  try {
    const roomUser = await db.wiFiUser.findUnique({ where: { username: wifiUsername }, select: { id: true, tenantId: true, propertyId: true, guestId: true } });
    if (roomUser) {
      await Promise.allSettled([
        upsertDeviceProfileWithFingerprint({ wifiUserId: roomUser.id, tenantId: roomUser.tenantId, propertyId: roomUser.propertyId, guestId: roomUser.guestId, username: wifiUsername, request, macAddress: effectiveMac, fingerprintHash, storageToken }),
        saveGuestInfoAfterAuth({
          wifiUserId: roomUser.id,
          guestId: roomUser.guestId,
          bookingId: match.id,
          guestInfo: normalizedGuestInfo,
          marketingConsent: { emailConsent: marketingEmailConsent === 'true' || marketingEmailConsent === true, smsConsent: marketingSmsConsent === 'true' || marketingSmsConsent === true },
          portalSlug,
          request,
        }),
        registerUserDevice({
          wifiUserId: roomUser.id,
          tenantId: roomUser.tenantId,
          propertyId: roomUser.propertyId,
          guestId: roomUser.guestId,
          macAddress: effectiveMac,
          request,
          source: 'room_number',
        }),
      ]);
    }
  } catch { /* best effort */ }

  return successResponse(
    {
      authenticated: true, method: 'room_number', username: wifiUsername,
      sessionTimeout: portalSessionTimeoutMin, bandwidthDown: roomPlanDnKbps / 1000, bandwidthUp: roomPlanUpKbps / 1000,
      poolName: pool.poolName, message: 'Connected successfully!',
      sessionId: roomSessionId,
      guestId: match.primaryGuestId || null,
    },
    { username: wifiUsername, password: userPassword },
    externalGateway,
    request,
    resolvedClientIp
  );
}
