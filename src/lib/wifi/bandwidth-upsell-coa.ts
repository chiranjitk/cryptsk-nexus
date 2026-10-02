/**
 * Bandwidth Upsell CoA Service (F1)
 *
 * Provides real Change of Authorization (CoA) bandwidth changes for the
 * StaySuite Bandwidth Upsell feature. Instead of just recording a DB entry
 * with a hardcoded coaStatus, this service actually pushes bandwidth changes
 * to the network — either via TC (local NAS) or RADIUS CoA (external NAS).
 *
 * Exports:
 *   - applyUpsellBandwidth()  — upgrade a user to a higher-speed plan
 *   - revertUpsellBandwidth() — downgrade back to the original plan (refund path)
 *
 * Architecture:
 *   1. Fetch target plan bandwidth values (WiFiPlan table)
 *   2. Find active session(s) from radacct
 *   3. Local NAS (127.0.0.1) → TC HTB in-place update (non-disruptive)
 *   4. External NAS → RADIUS CoA via proxy route (vendor-specific attributes)
 *   5. Update WiFiBandwidthUpgrade.coaStatus + activatedAt in DB
 */

import type { BwUpdateResult } from '@/lib/network/tc-bw-update';
import { updateUserBandwidthLive } from '@/lib/network/tc-bw-update';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { normalizeVendor } from '@/lib/wifi/utils/vendor-attributes';

// ─── Types ─────────────────────────────────────────────────────────

export interface UpsellCoAParams {
  tenantId: string;
  username: string;
  toPlanId: string;   // Target plan with new bandwidth
  upgradeId: string;  // WiFiBandwidthUpgrade record ID
}

export interface RevertUpsellParams {
  tenantId: string;
  username: string;
  fromPlanId: string; // Original plan to revert to
  upgradeId: string;
}

export interface UpsellCoAResult {
  success: boolean;
  coaStatus: 'applied' | 'failed' | 'partial';
  method: 'tc' | 'radius_coa' | 'both' | 'none';
  tcResult?: BwUpdateResult | null;
  coaResult?: CoAProxyResult | null;
  message: string;
}

interface CoAProxyResult {
  success: boolean;
  status?: number;
  error?: string;
  data?: unknown;
}

interface ActiveSession {
  framedipaddress: string;
  nasipaddress: string;
  acctsessionid?: string;
}

// ─── Internal Helpers ──────────────────────────────────────────────

/**
 * Fetch bandwidth values for a WiFi plan.
 */
async function fetchPlanBandwidth(planId: string): Promise<{
  downloadSpeed: number;
  uploadSpeed: number;
  burstDownloadSpeed: number | null;
  burstUploadSpeed: number | null;
  sessionTimeoutSec: number | null;
} | null> {
  const plan = await db.wiFiPlan.findUnique({
    where: { id: planId },
    select: {
      downloadSpeed: true,
      uploadSpeed: true,
      burstDownloadSpeed: true,
      burstUploadSpeed: true,
      sessionTimeoutSec: true,
    },
  });

  if (!plan) return null;

  return {
    downloadSpeed: plan.downloadSpeed,
    uploadSpeed: plan.uploadSpeed,
    burstDownloadSpeed: plan.burstDownloadSpeed && plan.burstDownloadSpeed > 0
      ? plan.burstDownloadSpeed
      : null,
    burstUploadSpeed: plan.burstUploadSpeed && plan.burstUploadSpeed > 0
      ? plan.burstUploadSpeed
      : null,
    sessionTimeoutSec: plan.sessionTimeoutSec,
  };
}

/**
 * Find active sessions for a user from radacct.
 * Returns all active sessions (a user may have multiple devices).
 */
async function findActiveSessions(username: string): Promise<ActiveSession[]> {
  const sessions = await db.$queryRaw<ActiveSession[]>(Prisma.sql`
    SELECT framedipaddress, nasipaddress, acctsessionid
    FROM radacct
    WHERE username = ${username}
      AND acctstoptime IS NULL
      AND (acctstatus IS NULL OR acctstatus = '' OR acctstatus = 'start')
      AND framedipaddress IS NOT NULL
      AND framedipaddress != '0.0.0.0'
  `);

  return sessions;
}

/**
 * Update bandwidth on the local NAS via TC (in-place HTB class update).
 * Non-disruptive — no re-authentication needed.
 */
async function applyLocalTC(
  username: string,
  downloadMbps: number,
  uploadMbps: number,
  downloadCeilMbps?: number,
  uploadCeilMbps?: number,
): Promise<BwUpdateResult | null> {
  return updateUserBandwidthLive(
    username,
    downloadMbps,
    uploadMbps,
    downloadCeilMbps ?? undefined,
    uploadCeilMbps ?? undefined,
  );
}

/**
 * Build vendor-specific RADIUS CoA attributes for bandwidth change.
 */
function buildCoAAttributes(
  nasType: string,
  downloadMbps: number,
  uploadMbps: number,
): Record<string, string> {
  const vendor = normalizeVendor(nasType);
  const downloadBps = downloadMbps * 1_000_000;
  const uploadBps = uploadMbps * 1_000_000;
  const attrs: Record<string, string> = {};

  switch (vendor) {
    case 'mikrotik':
      // MikroTik Rate-Limit format: rx(NAS→client=upload)/tx(NAS→internet=download)
      attrs['Mikrotik-Rate-Limit'] = `${uploadMbps}M/${downloadMbps}M`;
      // Always include WISPr as universal fallback
      attrs['WISPr-Bandwidth-Max-Down'] = String(downloadBps);
      attrs['WISPr-Bandwidth-Max-Up'] = String(uploadBps);
      break;

    case 'cisco': {
      // Dual-format for maximum Cisco compatibility (IOS/ISG + Meraki)
      const ciscoDownKbps = Math.ceil(downloadBps / 1000);
      const ciscoUpKbps = Math.ceil(uploadBps / 1000);
      attrs['Cisco-AVPair'] = `sub:Ingress-Committed-Data-Rate=${downloadBps}\nsub:Egress-Committed-Data-Rate=${uploadBps}`;
      attrs['Cisco-AVPair-0'] = `bandwidth-limit-down=${ciscoDownKbps}kbps;bandwidth-limit-up=${ciscoUpKbps}kbps`;
      attrs['WISPr-Bandwidth-Max-Down'] = String(downloadBps);
      attrs['WISPr-Bandwidth-Max-Up'] = String(uploadBps);
      break;
    }

    case 'chillispot':
      attrs['ChilliSpot-Bandwidth-Max-Down'] = String(downloadBps);
      attrs['ChilliSpot-Bandwidth-Max-Up'] = String(uploadBps);
      attrs['WISPr-Bandwidth-Max-Down'] = String(downloadBps);
      attrs['WISPr-Bandwidth-Max-Up'] = String(uploadBps);
      break;

    case 'cryptsk':
      attrs['Cryptsk-Rate-Limit'] = `${downloadMbps}M/${uploadMbps}M`;
      attrs['Cryptsk-Bandwidth-Max-Down'] = String(downloadBps);
      attrs['Cryptsk-Bandwidth-Max-Up'] = String(uploadBps);
      attrs['WISPr-Bandwidth-Max-Down'] = String(downloadBps);
      attrs['WISPr-Bandwidth-Max-Up'] = String(uploadBps);
      break;

    default:
      // Generic: WISPr (recognized by virtually all WiFi gateways)
      attrs['WISPr-Bandwidth-Max-Down'] = String(downloadBps);
      attrs['WISPr-Bandwidth-Max-Up'] = String(uploadBps);
      break;
  }

  return attrs;
}

/**
 * Send RADIUS CoA to external NAS via the proxy route.
 * Uses our own Next.js API route `/api/wifi/radius` with action `coa-bandwidth`.
 */
async function sendExternalCoA(
  username: string,
  nasIpAddress: string,
  nasType: string,
  coaPort: number,
  secret: string,
  downloadMbps: number,
  uploadMbps: number,
  sessionId?: string,
): Promise<CoAProxyResult> {
  const attrs = buildCoAAttributes(nasType, downloadMbps, uploadMbps);

  const payload: Record<string, unknown> = {
    action: 'coa-bandwidth',
    username,
    nasIp: nasIpAddress,
    coaPort,
    secret,
    attrs,
  };

  // Include session ID if available for targeted CoA
  if (sessionId) {
    payload.sessionId = sessionId;
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/wifi/radius`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal': 'true',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000), // 15s timeout for CoA
    });

    const data = await response.json().catch(() => ({ success: false }));

    return {
      success: data?.success === true,
      status: response.status,
      error: data?.error,
      data,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Update the WiFiBandwidthUpgrade record in the database.
 */
async function updateUpgradeRecord(
  upgradeId: string,
  coaStatus: string,
  activated: boolean,
): Promise<void> {
  await db.wiFiBandwidthUpgrade.update({
    where: { id: upgradeId },
    data: {
      coaStatus,
      ...(activated ? { activatedAt: new Date() } : {}),
    },
  });
}

// ─── Internal: radreply sync ──────────────────────────────────────

/**
 * Sync radreply WISPr bandwidth attributes for a user.
 *
 * H8 FIX: This is called ONLY AFTER CoA/TC succeeds. If CoA fails,
 * radreply is never touched — no inconsistent state possible.
 * Previously, if radreply was updated before CoA and CoA failed,
 * the user would have new bandwidth in radreply but old bandwidth
 * on their live session (inconsistent state until reconnection).
 *
 * Uses WISPr attributes (universal) — recognized by virtually all
 * WiFi gateways. Vendor-specific attributes are left untouched
 * (they get refreshed on next full authentication).
 */
async function syncRadReplyBandwidth(
  username: string,
  downloadMbps: number,
  uploadMbps: number,
  sessionTimeoutSec?: number | null,
): Promise<void> {
  try {
    const downloadBps = String(downloadMbps * 1_000_000);
    const uploadBps = String(uploadMbps * 1_000_000);

    // Delete existing WISPr bandwidth entries for this user
    await db.radReply.deleteMany({
      where: {
        username,
        attribute: { in: ['WISPr-Bandwidth-Max-Down', 'WISPr-Bandwidth-Max-Up'] },
      },
    });

    // Insert new WISPr entries (universal fallback for all NAS vendors)
    await db.radReply.createMany({
      data: [
        { username, attribute: 'WISPr-Bandwidth-Max-Down', op: ':=', value: downloadBps },
        { username, attribute: 'WISPr-Bandwidth-Max-Up', op: ':=', value: uploadBps },
      ],
      skipDuplicates: true,
    });

    // CP-MED-03: Update Session-Timeout in radreply when plan changes
    if (sessionTimeoutSec && sessionTimeoutSec > 0) {
      await db.radReply.upsert({
        where: { username_attribute: { username, attribute: 'Session-Timeout' } },
        update: { value: String(sessionTimeoutSec) },
        create: { username, attribute: 'Session-Timeout', op: ':=', value: String(sessionTimeoutSec) },
      });
    }

    console.log(`[Upsell-CoA] radreply synced for ${username}: ${downloadMbps}/${uploadMbps} Mbps (WISPr)${sessionTimeoutSec ? ` + Session-Timeout ${sessionTimeoutSec}s` : ''}`);
  } catch (err) {
    // Non-critical: radreply sync failure does not affect the live session
    // (which already has new bandwidth via TC/CoA). It only affects reconnection.
    console.warn(`[Upsell-CoA] radreply sync failed (non-critical): ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ─── Public API ────────────────────────────────────────────────────

/**
 * Apply bandwidth upsell — push real bandwidth changes to the network.
 *
 * Logic:
 *   1. Fetch target plan bandwidth values
 *   2. Find active session(s) from radacct
 *   3. Local NAS (127.0.0.1) → TC HTB in-place update
 *   4. External NAS → RADIUS CoA via proxy route
 *   5. Update WiFiBandwidthUpgrade.coaStatus + activatedAt
 *
 * @returns UpsellCoAResult with detailed status
 */
export async function applyUpsellBandwidth(
  params: UpsellCoAParams,
): Promise<UpsellCoAResult> {
  const { tenantId, username, toPlanId, upgradeId } = params;

  console.log(`[Upsell-CoA] Applying bandwidth upgrade for ${username} → plan ${toPlanId}`);

  // ── Step 1: Fetch target plan bandwidth ──
  const plan = await fetchPlanBandwidth(toPlanId);
  if (!plan) {
    console.error(`[Upsell-CoA] Target plan ${toPlanId} not found`);
    await updateUpgradeRecord(upgradeId, 'failed', false);
    return {
      success: false,
      coaStatus: 'failed',
      method: 'none',
      message: `Target plan ${toPlanId} not found`,
    };
  }

  const {
    downloadSpeed,
    uploadSpeed,
    burstDownloadSpeed: ceilDl,
    burstUploadSpeed: ceilUl,
    sessionTimeoutSec: newSessionTimeout,
  } = plan;

  console.log(
    `[Upsell-CoA] Plan bandwidth: ${downloadSpeed}/${uploadSpeed} Mbps` +
    (ceilDl || ceilUl ? ` (ceil: ${ceilDl ?? downloadSpeed}/${ceilUl ?? uploadSpeed})` : '') +
    (newSessionTimeout ? ` timeout: ${newSessionTimeout}s` : ''),
  );

  // ── Step 2: Find active sessions ──
  const sessions = await findActiveSessions(username);

  if (sessions.length === 0) {
    console.log(`[Upsell-CoA] No active session for ${username} — marking as applied (takes effect on next login)`);
    // User is not currently online — CoA is not possible, but the plan change
    // will take effect on next authentication. Mark as applied.
    // H8: Sync radreply now so next login picks up new bandwidth.
    await syncRadReplyBandwidth(username, downloadSpeed, uploadSpeed, newSessionTimeout);
    await updateUpgradeRecord(upgradeId, 'applied', true);
    return {
      success: true,
      coaStatus: 'applied',
      method: 'none',
      message: 'User not currently online. Bandwidth upgrade will take effect on next login.',
    };
  }

  console.log(`[Upsell-CoA] Found ${sessions.length} active session(s) for ${username}`);

  // ── Step 3: Route to TC or RADIUS CoA based on NAS ──
  const localSessions = sessions.filter(
    s => s.nasipaddress === '127.0.0.1' || s.nasipaddress === null || s.nasipaddress === '',
  );
  const externalSessions = sessions.filter(
    s => s.nasipaddress !== '127.0.0.1' && s.nasipaddress !== null && s.nasipaddress !== '',
  );

  let tcResult: BwUpdateResult | null = null;
  let tcSuccess = true;
  const coaResults: CoAProxyResult[] = [];
  let coaSuccess = true;
  const errors: string[] = [];

  // ── Local NAS path: TC bandwidth update ──
  if (localSessions.length > 0) {
    console.log(`[Upsell-CoA] Processing ${localSessions.length} local session(s) via TC`);
    tcResult = await applyLocalTC(
      username,
      downloadSpeed,
      uploadSpeed,
      ceilDl ?? undefined,
      ceilUl ?? undefined,
    );

    if (!tcResult || !tcResult.success) {
      tcSuccess = false;
      errors.push(`TC update failed: ${tcResult?.message ?? 'tc not available'}`);
      console.error(`[Upsell-CoA] TC update failed: ${tcResult?.message}`);
    } else {
      console.log(`[Upsell-CoA] TC update succeeded: ${tcResult.message}`);
    }
  }

  // ── External NAS path: RADIUS CoA ──
  if (externalSessions.length > 0) {
    console.log(`[Upsell-CoA] Processing ${externalSessions.length} external session(s) via RADIUS CoA`);

    // Group by NAS IP to avoid duplicate NAS lookups
    const nasGrouped = new Map<string, ActiveSession[]>();
    for (const session of externalSessions) {
      const key = session.nasipaddress;
      if (!nasGrouped.has(key)) nasGrouped.set(key, []);
      nasGrouped.get(key)!.push(session);
    }

    for (const [nasIp, nasSessions] of nasGrouped) {
      // Look up NAS record for secret, CoA port, and vendor type
      let nasRecord: { secret: string; coaPort: number; type: string; coaEnabled: boolean } | null = null;
      try {
        nasRecord = await db.radiusNAS.findFirst({
          where: {
            ipAddress: nasIp,
            status: 'active',
          },
          select: {
            secret: true,
            coaPort: true,
            type: true,
            coaEnabled: true,
          },
        });
      } catch {
        // RadiusNAS table may not exist in all deployments
      }

      if (!nasRecord) {
        errors.push(`NAS ${nasIp} not found or inactive in RadiusNAS table`);
        coaSuccess = false;
        console.error(`[Upsell-CoA] NAS ${nasIp} not found in RadiusNAS table`);
        continue;
      }

      if (!nasRecord.coaEnabled) {
        errors.push(`CoA disabled for NAS ${nasIp}`);
        coaSuccess = false;
        console.warn(`[Upsell-CoA] CoA is disabled for NAS ${nasIp}`);
        continue;
      }

      // Send CoA for each session on this NAS
      for (const session of nasSessions) {
        const result = await sendExternalCoA(
          username,
          nasIp,
          nasRecord.type,
          nasRecord.coaPort,
          nasRecord.secret,
          downloadSpeed,
          uploadSpeed,
          session.acctsessionid,
        );
        coaResults.push(result);

        if (!result.success) {
          errors.push(`RADIUS CoA failed for ${nasIp}: ${result.error ?? `HTTP ${result.status}`}`);
          coaSuccess = false;
          console.error(`[Upsell-CoA] RADIUS CoA failed for NAS ${nasIp}: ${result.error}`);
        } else {
          console.log(`[Upsell-CoA] RADIUS CoA succeeded for NAS ${nasIp}`);
        }
      }
    }
  }

  // ── Step 4: Determine overall result ──
  const method: UpsellCoAResult['method'] =
    localSessions.length > 0 && externalSessions.length > 0 ? 'both' :
    localSessions.length > 0 ? 'tc' :
    externalSessions.length > 0 ? 'radius_coa' :
    'none';

  const hasTc = localSessions.length > 0;
  const hasCoa = externalSessions.length > 0;

  let coaStatus: UpsellCoAResult['coaStatus'];
  let success: boolean;

  if (method === 'none') {
    // No sessions to update — user is offline (handled above, but defensive)
    coaStatus = 'applied';
    success = true;
  } else if (hasTc && hasCoa) {
    // Both paths: succeed only if both succeed, partial if one fails
    if (tcSuccess && coaSuccess) {
      coaStatus = 'applied';
      success = true;
    } else if (tcSuccess || coaSuccess) {
      coaStatus = 'partial';
      success = true; // Partial is still useful
    } else {
      coaStatus = 'failed';
      success = false;
    }
  } else if (hasTc) {
    coaStatus = tcSuccess ? 'applied' : 'failed';
    success = tcSuccess;
  } else {
    coaStatus = coaSuccess ? 'applied' : 'failed';
    success = coaSuccess;
  }

  // ── Step 5: Sync radreply bandwidth (ONLY on success — H8 fix) ──
  // radreply is updated AFTER CoA/TC succeeds to prevent inconsistent state.
  // If CoA fails, radreply is untouched — no stale new-bandwidth values.
  if (coaStatus === 'applied' || coaStatus === 'partial') {
    await syncRadReplyBandwidth(username, downloadSpeed, uploadSpeed, newSessionTimeout);
  }

  // ── Step 6: Update DB record ──
  const shouldActivate = success || coaStatus === 'partial';
  await updateUpgradeRecord(upgradeId, coaStatus, shouldActivate);

  const message = success
    ? `Bandwidth upgrade applied via ${method}${errors.length > 0 ? ` (warnings: ${errors.join('; ')})` : ''}`
    : `Bandwidth upgrade failed: ${errors.join('; ')}`;

  console.log(`[Upsell-CoA] Result for ${username}: coaStatus=${coaStatus}, method=${method}, success=${success}`);

  return {
    success,
    coaStatus,
    method,
    tcResult,
    coaResult: coaResults.length > 0
      ? coaResults.length === 1 ? coaResults[0] : { success: coaSuccess, data: coaResults }
      : null,
    message,
  };
}

/**
 * Revert bandwidth upsell — downgrade user back to original plan.
 *
 * Same logic as applyUpsellBandwidth but uses the original plan's bandwidth.
 * Called when a refund is processed for the bandwidth upsell.
 *
 * @returns UpsellCoAResult with detailed status
 */
export async function revertUpsellBandwidth(
  params: RevertUpsellParams,
): Promise<UpsellCoAResult> {
  const { tenantId: _tenantId, username, fromPlanId, upgradeId } = params;

  console.log(`[Upsell-CoA] Reverting bandwidth for ${username} → plan ${fromPlanId} (refund)`);

  // ── Step 1: Fetch original plan bandwidth ──
  const plan = await fetchPlanBandwidth(fromPlanId);
  if (!plan) {
    console.error(`[Upsell-CoA] Original plan ${fromPlanId} not found for revert`);
    await updateUpgradeRecord(upgradeId, 'failed', false);
    return {
      success: false,
      coaStatus: 'failed',
      method: 'none',
      message: `Original plan ${fromPlanId} not found for revert`,
    };
  }

  const {
    downloadSpeed,
    uploadSpeed,
    burstDownloadSpeed: ceilDl,
    burstUploadSpeed: ceilUl,
    sessionTimeoutSec: revertSessionTimeout,
  } = plan;

  console.log(
    `[Upsell-CoA] Reverting to plan bandwidth: ${downloadSpeed}/${uploadSpeed} Mbps` +
    (ceilDl || ceilUl ? ` (ceil: ${ceilDl ?? downloadSpeed}/${ceilUl ?? uploadSpeed})` : '') +
    (revertSessionTimeout ? ` timeout: ${revertSessionTimeout}s` : ''),
  );

  // ── Step 2: Find active sessions ──
  const sessions = await findActiveSessions(username);

  if (sessions.length === 0) {
    console.log(`[Upsell-CoA] No active session for ${username} — revert recorded (takes effect on next login)`);
    // H8: Sync radreply now so next login picks up reverted bandwidth.
    await syncRadReplyBandwidth(username, downloadSpeed, uploadSpeed, revertSessionTimeout);
    await updateUpgradeRecord(upgradeId, 'applied', false);
    return {
      success: true,
      coaStatus: 'applied',
      method: 'none',
      message: 'User not currently online. Bandwidth revert will take effect on next login.',
    };
  }

  // ── Step 3: Route to TC or RADIUS CoA ──
  const localSessions = sessions.filter(
    s => s.nasipaddress === '127.0.0.1' || s.nasipaddress === null || s.nasipaddress === '',
  );
  const externalSessions = sessions.filter(
    s => s.nasipaddress !== '127.0.0.1' && s.nasipaddress !== null && s.nasipaddress !== '',
  );

  let tcResult: BwUpdateResult | null = null;
  let tcSuccess = true;
  const coaResults: CoAProxyResult[] = [];
  let coaSuccess = true;
  const errors: string[] = [];

  // ── Local NAS path: TC revert ──
  if (localSessions.length > 0) {
    console.log(`[Upsell-CoA] Reverting ${localSessions.length} local session(s) via TC`);
    tcResult = await applyLocalTC(
      username,
      downloadSpeed,
      uploadSpeed,
      ceilDl ?? undefined,
      ceilUl ?? undefined,
    );

    if (!tcResult || !tcResult.success) {
      tcSuccess = false;
      errors.push(`TC revert failed: ${tcResult?.message ?? 'tc not available'}`);
      console.error(`[Upsell-CoA] TC revert failed: ${tcResult?.message}`);
    } else {
      console.log(`[Upsell-CoA] TC revert succeeded: ${tcResult.message}`);
    }
  }

  // ── External NAS path: RADIUS CoA revert ──
  if (externalSessions.length > 0) {
    console.log(`[Upsell-CoA] Reverting ${externalSessions.length} external session(s) via RADIUS CoA`);

    const nasGrouped = new Map<string, ActiveSession[]>();
    for (const session of externalSessions) {
      const key = session.nasipaddress;
      if (!nasGrouped.has(key)) nasGrouped.set(key, []);
      nasGrouped.get(key)!.push(session);
    }

    for (const [nasIp, nasSessions] of nasGrouped) {
      let nasRecord: { secret: string; coaPort: number; type: string; coaEnabled: boolean } | null = null;
      try {
        nasRecord = await db.radiusNAS.findFirst({
          where: {
            ipAddress: nasIp,
            status: 'active',
          },
          select: {
            secret: true,
            coaPort: true,
            type: true,
            coaEnabled: true,
          },
        });
      } catch {
        // RadiusNAS table may not exist
      }

      if (!nasRecord) {
        errors.push(`NAS ${nasIp} not found or inactive in RadiusNAS table`);
        coaSuccess = false;
        console.error(`[Upsell-CoA] NAS ${nasIp} not found during revert`);
        continue;
      }

      if (!nasRecord.coaEnabled) {
        errors.push(`CoA disabled for NAS ${nasIp}`);
        coaSuccess = false;
        continue;
      }

      for (const session of nasSessions) {
        const result = await sendExternalCoA(
          username,
          nasIp,
          nasRecord.type,
          nasRecord.coaPort,
          nasRecord.secret,
          downloadSpeed,
          uploadSpeed,
          session.acctsessionid,
        );
        coaResults.push(result);

        if (!result.success) {
          errors.push(`RADIUS CoA revert failed for ${nasIp}: ${result.error ?? `HTTP ${result.status}`}`);
          coaSuccess = false;
          console.error(`[Upsell-CoA] RADIUS CoA revert failed for ${nasIp}: ${result.error}`);
        } else {
          console.log(`[Upsell-CoA] RADIUS CoA revert succeeded for ${nasIp}`);
        }
      }
    }
  }

  // ── Step 4: Determine overall result ──
  const method: UpsellCoAResult['method'] =
    localSessions.length > 0 && externalSessions.length > 0 ? 'both' :
    localSessions.length > 0 ? 'tc' :
    externalSessions.length > 0 ? 'radius_coa' :
    'none';

  const hasTc = localSessions.length > 0;
  const hasCoa = externalSessions.length > 0;

  let coaStatus: UpsellCoAResult['coaStatus'];
  let success: boolean;

  if (method === 'none') {
    coaStatus = 'applied';
    success = true;
  } else if (hasTc && hasCoa) {
    if (tcSuccess && coaSuccess) {
      coaStatus = 'applied';
      success = true;
    } else if (tcSuccess || coaSuccess) {
      coaStatus = 'partial';
      success = true;
    } else {
      coaStatus = 'failed';
      success = false;
    }
  } else if (hasTc) {
    coaStatus = tcSuccess ? 'applied' : 'failed';
    success = tcSuccess;
  } else {
    coaStatus = coaSuccess ? 'applied' : 'failed';
    success = coaSuccess;
  }

  // ── Step 5: Sync radreply bandwidth (ONLY on success — H8 fix) ──
  if (coaStatus === 'applied' || coaStatus === 'partial') {
    await syncRadReplyBandwidth(username, downloadSpeed, uploadSpeed, revertSessionTimeout);
  }

  // ── Step 6: Update DB record (revert does not re-activate) ──
  // On revert, we update coaStatus to reflect the revert result.
  // The upgrade is being undone, so activatedAt stays as-is.
  await db.wiFiBandwidthUpgrade.update({
    where: { id: upgradeId },
    data: {
      coaStatus,
    },
  });

  const message = success
    ? `Bandwidth revert applied via ${method}${errors.length > 0 ? ` (warnings: ${errors.join('; ')})` : ''}`
    : `Bandwidth revert failed: ${errors.join('; ')}`;

  console.log(`[Upsell-CoA] Revert result for ${username}: coaStatus=${coaStatus}, method=${method}, success=${success}`);

  return {
    success,
    coaStatus,
    method,
    tcResult,
    coaResult: coaResults.length > 0
      ? coaResults.length === 1 ? coaResults[0] : { success: coaSuccess, data: coaResults }
      : null,
    message,
  };
}
