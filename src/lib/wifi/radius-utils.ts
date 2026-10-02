/**
 * Shared WiFi RADIUS Utilities
 *
 * Functions used by both the primary auth route and the auto-auth route
 * to avoid code duplication and ensure consistent behavior.
 *
 * Exported:
 *   - cleanupPerUserRadiusOverrides: Removes session-specific per-user RADIUS entries on disconnect
 *   - activateUserFirewall: Activates nftables + TC bandwidth shaping after auth
 *   - resolvePlanBandwidthKbps: Resolves per-user bandwidth from plan/RADIUS/portal
 *   - lookupWifiSessionForDisconnect: HIGH-022 fix — safe session lookup with fallback chain
 */

import { normalizeIPv4 } from '@/lib/utils/ip';
import {
  runLoginScript,
  generateClassIds,
  lookupBandwidthPool,
  type LoginScriptParams,
} from '@/lib/network/script-runner';
import { db } from '@/lib/db';

// ────────────────────────────────────────────────────────────
// Per-User RADIUS Override Cleanup
// ────────────────────────────────────────────────────────────

/**
 * Attributes that are SESSION-SPECIFIC and should be deleted on disconnect.
 *
 * These are set during login/provisioning/accounting to override group-level
 * policy for the duration of the session only. After disconnect, they become
 * stale and shadow the group-level attrs on re-login.
 *
 * Identity VSAs (Cryptsk-User-Profile, Cryptsk-Plan-Name) are NOT in this
 * list — they persist across sessions and are only set during provisioning.
 */
const SESSION_POLICY_ATTRS = [
  // Session/Idle timeouts (auth route caps to remaining validity; data-limit sets kill value)
  'Session-Timeout',
  'Cryptsk-Session-Timeout',
  'Idle-Timeout',
  'Cryptsk-Idle-Timeout',
  // Bandwidth (should be group-level only, but cleanup any stale per-user entries)
  'WISPr-Bandwidth-Max-Down',
  'WISPr-Bandwidth-Max-Up',
  'Cryptsk-Bandwidth-Max-Down',
  'Cryptsk-Bandwidth-Max-Up',
  'Cryptsk-Rate-Limit',
  // Data limits
  'Cryptsk-Data-Limit',
  'Cryptsk-Total-Limit',
  'Cryptsk-Max-Input-Octets',
  'Cryptsk-Max-Output-Octets',
  'Mikrotik-Total-Limit',
  'ChilliSpot-Max-Total-Octets',
  'ChilliSpot-Max-Input-Octets',
  'ChilliSpot-Max-Output-Octets',
  // Accounting interval
  'Acct-Interim-Interval',
] as const;

/**
 * Clean up per-user RADIUS overrides after session disconnect.
 *
 * FREE_RADIUS_IS_AUTHORITY: Per-user radreply entries take PRECEDENCE over
 * group-level attrs in FreeRADIUS. When a session ends, any session-specific
 * per-user overrides (Session-Timeout caps, kill values, bandwidth overrides)
 * must be deleted to prevent stale values from shadowing group policy.
 *
 * This is the single point of cleanup for ALL disconnect flows:
 *   - Portal self-disconnect  (/api/v1/wifi/disconnect)
 *   - Admin force-disconnect   (/api/wifi/radius → live-sessions-disconnect)
 *   - Session engine policy    (timeout, idle, data-limit enforcement)
 *   - No-show guest cleanup    (session-engine cron)
 *
 * Identity VSAs (Cryptsk-User-Profile, Cryptsk-Plan-Name) are preserved —
 * they're set during provisioning and are not session-specific.
 *
 * @param username - RADIUS username to clean up
 * @param logPrefix - Optional tag for log messages (default: '[RadiusCleanup]')
 * @returns Number of deleted entries (0 if none)
 */
export async function cleanupPerUserRadiusOverrides(
  username: string,
  logPrefix = '[RadiusCleanup]'
): Promise<number> {
  try {
    let totalDeleted = 0;
    for (const attr of SESSION_POLICY_ATTRS) {
      const result = await db.radReply.deleteMany({
        where: { username, attribute: attr },
      });
      totalDeleted += result.count;
    }
    if (totalDeleted > 0) {
      console.log(`${logPrefix} Deleted ${totalDeleted} stale per-user radreply entries for ${username}`);
    }
    return totalDeleted;
  } catch (err) {
    console.error(`${logPrefix} Failed to cleanup radreply for ${username}:`, err instanceof Error ? err.message : String(err));
    return 0;
  }
}

// ────────────────────────────────────────────────────────────
// HIGH-008: Transaction-safe RADIUS Override Cleanup
// ────────────────────────────────────────────────────────────

/**
 * Same as cleanupPerUserRadiusOverrides but operates within a Prisma
 * transaction client. Used by the disconnect route's compensation
 * transaction pattern (HIGH-008) where all DB changes must be atomic.
 *
 * @param tx - Prisma transaction client
 * @param username - RADIUS username to clean up
 * @param logPrefix - Optional tag for log messages
 * @returns Number of deleted entries (0 if none)
 */
export async function cleanupPerUserRadiusOverridesInTx(
  tx: Parameters<ReturnType<typeof db.radReply.deleteMany>>[0],
  username: string,
  logPrefix = '[RadiusCleanup:Tx]'
): Promise<number> {
  // The tx parameter is intentionally typed loosely to accept any Prisma transaction client
  // or the default db client. The function only uses .radReply.deleteMany() which is
  // available on both.
  const client = tx;
  try {
    let totalDeleted = 0;
    for (const attr of SESSION_POLICY_ATTRS) {
      const result = await client.radReply.deleteMany({
        where: { username, attribute: attr },
      });
      totalDeleted += result.count;
    }
    if (totalDeleted > 0) {
      console.log(`${logPrefix} Deleted ${totalDeleted} stale per-user radreply entries for ${username} (in tx)`);
    }
    return totalDeleted;
  } catch (err) {
    console.error(`${logPrefix} Failed to cleanup radreply for ${username}:`, err instanceof Error ? err.message : err);
    return 0;
  }
}

// ────────────────────────────────────────────────────────────
// Firewall Activation
// ────────────────────────────────────────────────────────────

/**
 * Activate firewall + bandwidth shaping for a user after successful RADIUS auth.
 * Calls staysuite_login.sh which:
 *   - Adds IP to nft loggedinusers set (unblocks traffic)
 *   - Inserts fwmark rules in prerouting
 *   - Adds NAT masquerade rule
 *   - Creates TC HTB classes + fw filters on ifb0/ifb1
 *
 * Runs synchronously but with a 15s timeout.
 * Errors are logged but do NOT block the auth response —
 * the user is authenticated regardless of firewall state.
 * The recovery script will catch up if this fails.
 *
 * @param logPrefix - Tag for log messages (e.g. '[Firewall]' or '[AutoAuth Firewall]')
 */
export async function activateUserFirewall(params: {
  username: string;
  clientIp: string;
  propertyId: string;
  sessionId?: string;
  macAddress?: string;
  userId?: string;
  /** Download bandwidth in kbps (e.g. 5000 = 5 Mbps) */
  dnKbps?: number;
  /** Upload bandwidth in kbps (e.g. 2000 = 2 Mbps) */
  upKbps?: number;
  /** Download burst ceil in kbps (0 or undefined = ceil = rate) */
  dnCeilKbps?: number;
  /** Upload burst ceil in kbps (0 or undefined = ceil = rate) */
  upCeilKbps?: number;
  subnet?: string | null;
  /** Log prefix for log messages (default: '[Firewall]') */
  logPrefix?: string;
  // ── NAT control from IP pool ──
  /** NAT mode: 'private_masq' | 'private_snat' | 'public' */
  natMode?: string;
  /** For SNAT: the pre-resolved public IP to translate to */
  snatIp?: string;
  /** WAN interface to pin masquerade to (e.g. 'eth1'). Null/undefined = auto. */
  natWanInterface?: string | null;
  /** Enable hairpin NAT (DNAT for return traffic to SNAT IPs). Only applies to private_snat mode. */
  hairpinNat?: boolean;
  /** Gateway routing fwmark bit from plan's gateway assignment.
   *  0 = no gateway (use default DGD routing),
   *  0x20000000 = GW-1, 0x40000000 = GW-2, 0x80000000 = GW-3 */
  gatewayFwBit?: number;
}) {
  const logPrefix = params.logPrefix || '[Firewall]';
  try {
    const clientIp = normalizeIPv4(params.clientIp);
    if (!clientIp || clientIp === '0.0.0.0') {
      console.warn(`${logPrefix} Skipping activation — no valid client IP`);
      return;
    }

    // Warn if sessionId is empty — means radacct creation failed
    // The firewall will still work, but session engine can't track this user
    if (!params.sessionId) {
      console.warn(`${logPrefix} No sessionId for ${params.username} — radacct creation may have failed. Session engine will NOT track this user.`);
    }

    // Generate deterministic class IDs from username + IP.
    // Per-IP classids ensure each device gets its own HTB leaf class.
    const classIds = generateClassIds(params.username, clientIp);

    // Bandwidth in kbps — passed directly from caller (no conversion needed)
    const dnKbps = params.dnKbps || 0;
    const upKbps = params.upKbps || 0;

    // Look up BandwidthPool for pool-level rate limiting
    const poolBw = await lookupBandwidthPool(params.propertyId, params.subnet);

    // ── Resolve NAT action from pool config ──
    let natAction: string;
    let snatTarget: string | undefined;

    switch (params.natMode) {
      case 'public':
        natAction = 'accept';
        break;
      case 'private_snat':
        natAction = 'snat';
        snatTarget = params.snatIp;
        break;
      case 'private_masq':
      default:
        natAction = 'masq';
        break;
    }

    const scriptParams: LoginScriptParams = {
      ip: clientIp,
      action: natAction,
      snatIp: snatTarget,
      poolId: poolBw.poolId,
      poolRateDn: poolBw.poolRateDn,
      poolCeilDn: poolBw.poolCeilDn,
      poolRateUp: poolBw.poolRateUp,
      poolCeilUp: poolBw.poolCeilUp,
      dnClassid: classIds.dn,
      upClassid: classIds.up,
      dnKbps,
      upKbps,
      dnCeilKbps: params.dnCeilKbps,
      upCeilKbps: params.upCeilKbps,
      sessionId: params.sessionId,
      macAddress: params.macAddress,
      userId: params.userId,
      natWanInterface: params.natWanInterface,
      hairpinNat: params.hairpinNat,
      gatewayFwBit: params.gatewayFwBit,
    };

    const result = await runLoginScript(scriptParams);

    if (result.success) {
      console.log(
        `${logPrefix} Login OK: ${params.username} ip=${clientIp} cls=${classIds.dn}/${classIds.up} pool=${poolBw.poolId} nat=${natAction}${snatTarget ? ` snat=${snatTarget}` : ''} dn=${dnKbps}k up=${upKbps}k${params.gatewayFwBit ? ` gwFwBit=0x${params.gatewayFwBit.toString(16)}` : ''} (${result.durationMs}ms)`
      );
    } else {
      console.error(
        `${logPrefix} Login FAIL: ${params.username} ip=${clientIp} exit=${result.exitCode} pool=${poolBw.poolId} nat=${natAction} stderr=${result.stderr || '(none)'} (${result.durationMs}ms)`
      );
    }
  } catch (err) {
    // Non-fatal — firewall activation failure should not block authentication
    console.error(`${logPrefix} Exception activating firewall:`, err);
  }
}

// ────────────────────────────────────────────────────────────
// Gateway Fwmark Resolution
// ────────────────────────────────────────────────────────────

/**
 * Resolve the gateway fwmark bit for a given plan.
 * Returns 0 if the plan has no gateway assignment or gateway has no fwmarkBit.
 */
export async function resolveGatewayFwBit(planId?: string | null): Promise<number> {
  if (!planId) return 0;
  try {
    const { db } = await import('@/lib/db');
    const plan = await db.wiFiPlan.findUnique({
      where: { id: planId },
      select: { gatewayId: true, gateway: { select: { fwmarkBit: true } } },
    });
    if (plan?.gatewayId && plan.gateway?.fwmarkBit) {
      return plan.gateway.fwmarkBit;
    }
  } catch {
    // Non-fatal
  }
  return 0;
}

// ────────────────────────────────────────────────────────────
// Bandwidth Resolution
// ────────────────────────────────────────────────────────────

/**
 * Resolve per-user bandwidth in kbps from the user's WiFi plan.
 *
 * FREE_RADIUS_IS_AUTHORITY: Per-user radreply bandwidth entries take PRECEDENCE
 * over group-level attrs in FreeRADIUS. If a user has stale per-user bandwidth
 * overrides (e.g., from provisioning or old seed data), reading them here would
 * return incorrect values after a plan change. To prevent this, we read from the
 * WiFiPlan (source of truth) FIRST, and only fall back to radreply for explicit
 * per-user overrides that don't shadow group policy.
 *
 * Priority:
 *   1. WiFiPlan.downloadSpeed/uploadSpeed (plan-level, in Mbps → *1000 = kbps)
 *   2. Portal maxBandwidthDown/Up (zone-level default, in bytes/sec → *8/1000 = kbps) [optional]
 *   3. Hardcoded fallback (5000 kbps down / 1000 kbps up)
 *
 * NOTE: Per-user radreply bandwidth is NOT used here. Those entries shadow
 * group-level attrs and are cleaned up on plan changes. If a user needs a
 * different bandwidth from the plan, it should be handled via a separate plan
 * or a custom bandwidth override mechanism — not via stale radreply entries.
 *
 * UNIT REFERENCE:
 *   WiFiPlan.downloadSpeed = 5 means 5 Mbps
 *   WISPr-Bandwidth-Max-Down = 5000000 means 5,000,000 bits/sec = 5000 kbps
 *   CaptivePortal.maxBandwidthDown = 5242880 means bytes/sec (legacy, ~40 Mbps)
 *   TC login script expects kbps (e.g. -D 5000 = 5 Mbps)
 */
export async function resolvePlanBandwidthKbps(
  planId: string | null | undefined,
  username?: string,
  portalDownBytes?: number,
  portalUpBytes?: number,
): Promise<{ dn: number; up: number; dnCeil: number; upCeil: number }> {
  // Priority 1: WiFi plan bandwidth (downloadSpeed/uploadSpeed are in Mbps → *1000 = kbps)
  // FREE_RADIUS_IS_AUTHORITY: Read directly from WiFiPlan, NOT from per-user radreply.
  // Per-user radreply bandwidth can be stale after plan changes (shadow group attrs).
  if (planId) {
    try {
      const plan = await db.wiFiPlan.findUnique({
        where: { id: planId },
        select: { downloadSpeed: true, uploadSpeed: true, burstDownloadSpeed: true, burstUploadSpeed: true },
      });
      if (plan && plan.downloadSpeed > 0 && plan.uploadSpeed > 0) {
        const dn = plan.downloadSpeed * 1000;
        const up = plan.uploadSpeed * 1000;
        const dnCeil = (plan.burstDownloadSpeed && plan.burstDownloadSpeed > 0) ? plan.burstDownloadSpeed * 1000 : dn;
        const upCeil = (plan.burstUploadSpeed && plan.burstUploadSpeed > 0) ? plan.burstUploadSpeed * 1000 : up;
        console.log(`[BW] Plan speed: ${plan.downloadSpeed}Mbps/${plan.uploadSpeed}Mbps burst:${plan.burstDownloadSpeed || 'none'}/${plan.burstUploadSpeed || 'none'} → ${dn}/${up}kbps ceil=${dnCeil}/${upCeil}kbps`);
        return { dn, up, dnCeil, upCeil };
      }
    } catch { /* non-critical */ }
  }

  // Priority 2: Portal default (bytes/sec → bits/sec → kbps)
  if (portalDownBytes && portalUpBytes) {
    const dn = Math.round(portalDownBytes * 8 / 1000);
    const up = Math.round(portalUpBytes * 8 / 1000);
    return { dn, up, dnCeil: dn, upCeil: up };
  }

  // Priority 3: Hardcoded fallback (5 Mbps / 1 Mbps)
  return { dn: 5000, up: 1000, dnCeil: 5000, upCeil: 1000 };
}

// ────────────────────────────────────────────────────────────
// WiFi Session Lookup — HIGH-022 Fix
// ────────────────────────────────────────────────────────────

/**
 * Result of a WiFiSession lookup for disconnect.
 * `session` is the matched session (or null if no match / ambiguous).
 * `matchMethod` describes how the match was found (for audit logging).
 * `ambiguous` is true if multiple candidates were found (logged, NOT auto-closed).
 */
export interface SessionLookupResult {
  session: { id: string; username: string | null; macAddress: string } | null;
  matchMethod: 'acctUniqueId' | 'mac+username' | 'ip+username' | 'none';
  ambiguous: boolean;
}

/**
 * Check if the new WiFi lifecycle (HIGH-022 fix) is enabled.
 *
 * When USE_NEW_WIFI_LIFECYCLE=true, session disconnect uses a safe
 * username-based fallback chain instead of MAC-only lookup.
 * When false (or unset), the old MAC-only behavior is preserved.
 */
export function isNewWifiLifecycleEnabled(): boolean {
  const value = process.env.USE_NEW_WIFI_LIFECYCLE;
  return value === 'true' || value === '1';
}

/**
 * Look up a WiFiSession for disconnect using a SAFE fallback chain.
 *
 * HIGH-022 Fix: The old code used MAC-only lookup:
 *   `findFirst({ where: { macAddress: callingstationid || 'unknown', status: 'active' } })`
 * This is dangerous because multiple guests can share the same MAC (e.g., 'unknown')
 * or a device may have been transferred between guests.
 *
 * New lookup chain (most specific → least specific):
 *   1. **Primary**: RADIUS username + acctUniqueId — unique per session
 *   2. **Fallback 1**: RADIUS username + MAC address — unique when MAC is known
 *   3. **Fallback 2**: RADIUS username + IP address — fallback when MAC is unknown
 *   4. **Ambiguous**: If multiple candidates match, log a warning and return null
 *      (do NOT auto-close — wrong session could be closed)
 *
 * @param params - Lookup parameters from the radacct session
 * @param logPrefix - Tag for log messages
 */
export async function lookupWifiSessionForDisconnect(
  params: {
    username: string;
    acctUniqueId?: string | null;
    macAddress?: string | null;
    ipAddress?: string | null;
  },
  logPrefix = '[SessionLookup]'
): Promise<SessionLookupResult> {
  const { username, acctUniqueId, macAddress, ipAddress } = params;
  const mac = macAddress && macAddress !== '' ? macAddress : null;
  const ip = ipAddress && ipAddress !== '' && ipAddress !== '0.0.0.0' ? ipAddress : null;

  // ── Primary: acctUniqueId — most specific, unique per session ──
  if (acctUniqueId) {
    try {
      const sessions = await db.wiFiSession.findMany({
        where: { username, acctUniqueId, status: 'active' },
        select: { id: true, username: true, macAddress: true },
        take: 5,
      });
      if (sessions.length === 1) {
        return { session: sessions[0], matchMethod: 'acctUniqueId', ambiguous: false };
      }
      if (sessions.length > 1) {
        console.warn(
          `${logPrefix} AMBIGUOUS: ${sessions.length} active WiFiSessions for ${username} with acctUniqueId=${acctUniqueId}. ` +
          `Session IDs: [${sessions.map(s => s.id).join(', ')}]. NOT auto-closing — manual review needed.`
        );
        return { session: null, matchMethod: 'acctUniqueId', ambiguous: true };
      }
      // 0 matches — acctUniqueId not linked to WiFiSession (radacct-only session), fall through
      console.log(`${logPrefix} No WiFiSession with acctUniqueId=${acctUniqueId} for ${username} — trying fallbacks`);
    } catch (err) {
      console.warn(`${logPrefix} acctUniqueId lookup failed:`, err instanceof Error ? err.message : err);
    }
  }

  // ── Fallback 1: username + MAC address ──
  if (mac && mac !== 'unknown') {
    try {
      const sessions = await db.wiFiSession.findMany({
        where: { username, macAddress: mac, status: 'active' },
        select: { id: true, username: true, macAddress: true },
        take: 5,
      });
      if (sessions.length === 1) {
        return { session: sessions[0], matchMethod: 'mac+username', ambiguous: false };
      }
      if (sessions.length > 1) {
        console.warn(
          `${logPrefix} AMBIGUOUS: ${sessions.length} active WiFiSessions for ${username} with mac=${mac}. ` +
          `Session IDs: [${sessions.map(s => s.id).join(', ')}]. NOT auto-closing — manual review needed.`
        );
        return { session: null, matchMethod: 'mac+username', ambiguous: true };
      }
      // 0 matches — fall through to next fallback
    } catch (err) {
      console.warn(`${logPrefix} MAC+username lookup failed:`, err instanceof Error ? err.message : err);
    }
  }

  // ── Fallback 2: username + IP address ──
  if (ip) {
    try {
      const sessions = await db.wiFiSession.findMany({
        where: { username, ipAddress: ip, status: 'active' },
        select: { id: true, username: true, macAddress: true },
        take: 5,
      });
      if (sessions.length === 1) {
        return { session: sessions[0], matchMethod: 'ip+username', ambiguous: false };
      }
      if (sessions.length > 1) {
        console.warn(
          `${logPrefix} AMBIGUOUS: ${sessions.length} active WiFiSessions for ${username} with ip=${ip}. ` +
          `Session IDs: [${sessions.map(s => s.id).join(', ')}]. NOT auto-closing — manual review needed.`
        );
        return { session: null, matchMethod: 'ip+username', ambiguous: true };
      }
    } catch (err) {
      console.warn(`${logPrefix} IP+username lookup failed:`, err instanceof Error ? err.message : err);
    }
  }

  // ── No match found through any fallback ──
  console.log(
    `${logPrefix} No unique WiFiSession found for ${username} ` +
    `(acctUniqueId=${acctUniqueId || 'none'}, mac=${mac || 'none'}, ip=${ip || 'none'}). ` +
    `Session may be radacct-only or already closed.`
  );
  return { session: null, matchMethod: 'none', ambiguous: false };
}
