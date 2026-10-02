/**
 * StaySuite Session Engine — OPTIMIZED FOR 5K+ CONCURRENT USERS
 *
 * This is the HEART of the gateway's accounting and session management.
 * Since StaySuite IS the NAS (Network Access Server), it must perform the
 * duties that a real AP/controller would normally handle:
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  In a standard setup, the WiFi AP does this:              │
 *   │    1. Sends Accounting-Start to RADIUS server            │
 *   │    2. Sends Interim-Update every 60s (byte counts)       │
 *   │    3. Enforces Session-Timeout (kicks user)              │
 *   │    4. Enforces Idle-Timeout (kicks user)                 │
 *   │    5. Enforces bandwidth limits (shapes traffic)         │
 *   │    6. Sends Accounting-Stop on disconnect                │
 *   │                                                           │
 *   │  StaySuite does ALL of this because it IS the gateway:   │
 *   │    1. ✅ Auth flow creates radacct START record           │
 *   │    2. ⚡ This engine generates Interim-Updates            │
 *   │    3. ⚡ This engine enforces Session-Timeout             │
 *   │    4. ⚡ This engine enforces Idle-Timeout                │
 *   │    5. ⚡ nftables + RADIUS attrs handle bandwidth         │
 *   │    6. ⚡ This engine generates Accounting-Stop             │
 *   └──────────────────────────────────────────────────────────┘
 *
 * PERFORMANCE OPTIMIZATIONS (v2 — handles 10K+ users):
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  BEFORE (sequential, per-session I/O):                       │
 *   │    5,000 × isIPAuthenticated()     → 50,000ms (execSync)    │
 *   │    15,000 × timeout DB queries     → 45,000ms                │
 *   │    20,000 × individual DB writes   → 60,000ms                │
 *   │    TOTAL: ~180 seconds (fails at 500+ users)                 │
 *   │                                                              │
 *   │  AFTER (bulk reads, batched writes, in-memory processing):   │
 *   │    1 × getAllAuthenticatedIPs()   → 100ms  (one execSync)    │
 *   │    1 × bulk timeout query         → 50ms  (one DB query)     │
 *   │    1 × batch UPDATE radacct        → 200ms (one DB query)    │
 *   │    1 × batch INSERT interim        → 200ms (one DB query)    │
 *   │    1 × batch UPDATE WiFiSession    → 300ms (one DB query)    │
 *   │    1 × batch UPDATE WiFiUser       → 100ms (one DB query)    │
 *   │    N × disconnect (parallel, 5x)   → 1-3s  (only violations) │
 *   │    TOTAL: ~2-5 seconds for 5,000 users                      │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Architecture:
 *
 *   ┌──────────┐   read-all-counters   ┌───────────────────────┐
 *   │ nftables │ ────────────────────→  │  Session Engine v2     │
 *   │ counters │   every 60 seconds    │  (this file)           │
 *   └──────────┘                       └────────┬──────────────┘
 *                                               │
 *   ┌─────────────────┐              ┌──────────┼──────────────┐
 *   │ nft list set    │              │          │              │
 *   │ (bulk IP check) │              │    ┌─────┴──────┐      │
 *   └────────┬────────┘              │    │ In-memory  │      │
 *            │                       │    │ Policy     │      │
 *            ▼                       │    │ Evaluation │      │
 *   ┌─────────────────┐              │    │ (O(1) per  │      │
 *   │ bulk timeout    │──────────────│    │  session)  │      │
 *   │ query (1 call)  │              │    └─────┬──────┘      │
 *   └─────────────────┘              │          │              │
 *                                    │    ┌─────┴──────┐      │
 *                                    │    │ Batched    │      │
 *                                    │    │ DB Writes  │      │
 *                                    │    │ (6 queries)│      │
 *                                    │    └────────────┘      │
 *                                    └───────────────────────┘
 *
 * CRITICAL DESIGN DECISIONS:
 * - Reads REAL byte counters from nftables (not estimated)
 * - Updates radacct in-place (same row, acctstatus stays 'start')
 * - Does NOT create separate interim-update rows (v3 — removed to prevent session count doubling)
 * - Disconnects by removing IP from nftables + closing radacct
 * - All policy checks use pre-loaded in-memory maps (zero I/O per session)
 */

import { db } from '@/lib/db';
import { formatBytes } from '@/lib/utils/format';
import {
  readAllCounters,
  setupCounterTable,
  addUserCounter,
  removeUserCounter,
  deauthIP,
  doesAuthenticatedSetExist,
  getAllAuthenticatedIPs,
  normalizeIPv4,
  type IPByteCount,
} from '@/lib/wifi/utils/nftables-counters';
import { runLogoutScript, runBatchLogoutScript } from '@/lib/network/script-runner';
import * as SELog from './session-engine-logger';
import { getLocalNasConfig } from '@/lib/wifi/local-nas-config';
import { cleanupPerUserRadiusOverrides, lookupWifiSessionForDisconnect, isNewWifiLifecycleEnabled } from '@/lib/wifi/shared/radius-utils';
import { releaseSnatIp } from '@/lib/wifi/snat-allocator';
import { Prisma } from '@prisma/client';
import { promises as fsp } from 'fs';
import path from 'path';
import { updateSessionBandwidth, bulkFupThrottle, bulkFupUnthrottle } from '@/lib/network/tc-bw-update';

// ────────────────────────────────────────────────────────────
// HIGH-008: Feature flag for atomic WiFi lifecycle
// ────────────────────────────────────────────────────────────
const USE_NEW_WIFI_LIFECYCLE = process.env.USE_NEW_WIFI_LIFECYCLE === 'true';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface SessionEngineResult {
  /** Total active sessions found */
  sessionsProcessed: number;
  /** Sessions updated with new byte counts */
  interimUpdated: number;
  /** Sessions disconnected due to session timeout */
  sessionTimeoutDisconnected: number;
  /** Sessions disconnected due to idle timeout */
  idleTimeoutDisconnected: number;
  /** Sessions disconnected due to data limit */
  dataLimitDisconnected: number;
  /** Sessions FUP-throttled (bandwidth reduced) */
  fupThrottled: number;
  /** Sessions FUP-blocked (disconnected) */
  fupBlocked: number;
  /** Sessions cleaned up (stale/gone) */
  staleCleaned: number;
  /** Errors encountered */
  errors: number;
  /** Duration of the run in ms */
  durationMs: number;
  /** Details of disconnected sessions */
  disconnectedSessions: Array<{
    username: string;
    ip: string;
    reason: string;
  }>;
}

interface ActiveSession {
  radacctid: string;
  acctuniqueid: string;
  acctsessionid: string;
  username: string;
  framedipaddress: string;
  callingstationid: string;
  nasipaddress: string;
  acctstarttime: Date;
  acctupdatetime: Date;
  acctinputoctets: number;
  acctoutputoctets: number;
  acctsessiontime: number;
}

/** Pre-loaded policy for a user (from bulk radreply query) */
interface UserPolicy {
  sessionTimeout: number;      // seconds, 0 = no limit
  idleTimeout: number;         // seconds, 0 = no limit
  dataLimit: number;           // bytes, 0 = unlimited
  acctInterimInterval: number; // seconds, 0 = use engine default (60s)
}

/** Fair Access Policy (FUP) for a user — loaded from FairAccessPolicy via WiFiPlan */
interface FupInfo {
  fupPolicyId: string;
  fupPolicyName: string;
  dataLimitBytes: number;      // FUP limit in bytes
  applicableOn: 'total' | 'download' | 'upload';
  cycleType: 'daily' | 'weekly' | 'monthly';
  isThrottle: boolean;          // true = throttle, false = block/disconnect
  throttleDownKbps: number;     // Kbps to throttle to
  throttleUpKbps: number;       // Kbps to throttle to
}

// TODO(C-09): WiFi Bandwidth Data Quota
// Sessions currently have per-session rate limits (download/upload speed via
// WISPr-Bandwidth-Max-Down/Up RADIUS attributes) and per-plan data limits
// (via Acct-Interim-Interval data cap enforcement above). However, there is no
// concept of a TOTAL DATA QUOTA that persists across multiple sessions for a
// single user or device.
//
// Implementing data quotas requires:
//   1. WiFiUser.totalBytesIn/totalBytesOut already track cumulative totals.
//   2. Add a `dataQuotaBytes` field to WiFiPlan (e.g., 5GB per month).
//   3. In the session engine, after updating cumulative totals, check if the
//      user's total usage (totalBytesIn + totalBytesOut) exceeds their quota.
//   4. If exceeded, disconnect the session and set WiFiUser.status = 'quota_exceeded'.
//   5. Reset quota counters on a billing cycle (monthly/weekly) via a cron job.
//   6. Provide a user-facing dashboard showing quota usage (used/remaining).
//   7. Allow admins to grant quota topups (e.g., +1GB) via the vouchers system.
//   8. Consider implementing tiered quotas (e.g., 2GB free, then throttled to 256kbps).
//
// The existing data limit enforcement (per-session) should be kept as a safety net,
// while the quota (cumulative, cross-session) provides the primary billing control.

import { BoundedMap } from '@/lib/bounded-map';

// In-memory store for idle timeout tracking:
// Maps IP → last timestamp when bytes delta was > 0
// HIGH-023: Bounded to 50,000 entries with LRU eviction (supports 50K concurrent sessions)
const MAX_ACTIVITY_MAP_SIZE = 50000;
const lastActivityMap = new BoundedMap<string, number>(MAX_ACTIVITY_MAP_SIZE);

// In-memory store for FUP throttle tracking:
// Usernames currently under FUP throttle (bandwidth reduced via tc class change)
const throttledUsers = new Set<string>();

// FIX #11: File-based backup path for the activity map (survives restarts faster than DB)
const ACTIVITY_MAP_FILE = '/tmp/staysuite-activity-map.json';
let lastActivityMapSaveTime = 0;
const ACTIVITY_MAP_SAVE_INTERVAL = 5 * 60 * 1000; // Save every 5 minutes

/**
 * Save lastActivityMap to a file as a backup.
 * Faster to restore from file than from DB query on restart.
 */
async function saveActivityMapToFile(): Promise<void> {
  try {
    const now = Date.now();
    if (now - lastActivityMapSaveTime < ACTIVITY_MAP_SAVE_INTERVAL) return;
    lastActivityMapSaveTime = now;

    const obj: Record<string, number> = {};
    for (const [ip, ts] of lastActivityMap) {
      obj[ip] = ts;
    }
    await fsp.writeFile(ACTIVITY_MAP_FILE, JSON.stringify(obj), 'utf8');
  } catch (err) {
    // Non-fatal — file backup is best-effort
    console.warn('[Session Engine] Failed to save activity map to file:', err);
  }
}

/**
 * Restore lastActivityMap from file (fast path) or DB (fallback).
 * File is faster because it avoids a DB query on startup.
 * Falls back to DB if file doesn't exist or is stale.
 */
async function restoreActivityMapFromDb(): Promise<void> {
  // ── Fast path: try file first ──
  try {
    const fileData = await fsp.readFile(ACTIVITY_MAP_FILE, 'utf8');
    const parsed: Record<string, number> = JSON.parse(fileData);
    const entries = Object.entries(parsed);
    if (entries.length > 0) {
      // Only use entries less than 2 hours old (stale entries are unreliable)
      const cutoff = Date.now() - 2 * 60 * 60 * 1000;
      for (const [ip, ts] of entries) {
        if (typeof ts === 'number' && ts > cutoff) {
          lastActivityMap.set(ip, ts);
        }
      }
      console.log(`[Session Engine] Restored ${lastActivityMap.size} activity timestamps from file backup`);
      return; // Don't query DB if file restore succeeded
    }
  } catch {
    // File doesn't exist or is invalid — fall through to DB restore
  }

  // ── Slow path: query radacct for the latest interim update per session ──
  try {
    const sessions = await db.$queryRaw<Array<{ framedipaddress: string; lastActivity: Date }>>`
      SELECT framedipaddress::text AS framedipaddress, MAX(acctupdatetime) as "lastActivity"
      FROM radacct
      WHERE acctstoptime IS NULL
        AND framedipaddress IS NOT NULL
        AND framedipaddress::text != '' AND framedipaddress::text != '0.0.0.0'
      GROUP BY username, callingstationid, framedipaddress::text
    `;
    for (const s of sessions) {
      const ip = normalizeIPv4(s.framedipaddress);
      if (ip) {
        lastActivityMap.set(ip, new Date(s.lastActivity).getTime());
      }
    }
    console.log(`[Session Engine] Restored ${sessions.length} activity timestamps from radacct (DB fallback)`);

    // Save the freshly restored map to file for next restart
    saveActivityMapToFile().catch(() => {});
  } catch (err) {
    console.warn('[Session Engine] Failed to restore activity map from DB:', err);
  }
}

// M6: Recover FUP-throttled users from DB on startup.
// throttledUsers is an in-memory Set — on process restart it's empty, causing
// previously throttled users to run at full speed until the next cycle detects
// the FUP limit again. This queries fup_switch_log for the most recent action
// per username and repopulates the set for users still under throttle.
let throttledUsersRecovered = false;
async function recoverThrottledUsers(): Promise<void> {
  if (throttledUsersRecovered) return;
  throttledUsersRecovered = true;
  try {
    // Find users whose last fup_switch_log entry is 'throttle' and who still
    // have an active (open) radacct session — those are the currently throttled.
    const rows = await db.$queryRaw<Array<{ username: string }>>`
      SELECT DISTINCT f.username
      FROM fup_switch_log f
      JOIN LATERAL (
        SELECT username, action, created_at
        FROM fup_switch_log
        WHERE username = f.username
        ORDER BY created_at DESC
        LIMIT 1
      ) latest ON latest.username = f.username
      WHERE latest.action = 'throttle'
        AND EXISTS (
          SELECT 1 FROM radacct r
          WHERE r.username = f.username AND r.acctstoptime IS NULL
        )
    `;
    for (const row of rows) {
      throttledUsers.add(row.username);
    }
    if (rows.length > 0) {
      console.log(`[SessionEngine] M6: Recovered ${rows.length} throttled users from DB on startup`);
    }
  } catch {
    // Non-critical — the next engine cycle will detect and re-throttle
  }
}

// Bug 7: Concurrency guard to prevent overlapping runs
let isRunning = false;
let skippedCycles = 0;
const SKIPPED_CYCLE_THRESHOLD = 3;

// ── nftables availability cache ──────────────────────────────────
let nftablesAvailable: boolean | null = null;
let nftablesCheckedAt = 0;

// ── Batch processing config ──────────────────────────────────────
const DISCONNECT_CONCURRENCY = 5;

// ── MED-007: Batch cleanup size limit ─────────────────────────────
// Maximum stale sessions to process per engine cycle. Remaining sessions
// will be picked up in the next 60-second cycle. This prevents 500+
// shell script invocations from exceeding the cycle window.
const BATCH_CLEANUP_SIZE = parseInt(process.env.BATCH_CLEANUP_SIZE || '100', 10) || 100;

// ── Interim row archival config ─────────────────────────────────
const INTERIM_RETENTION_HOURS = 6; // Keep interim rows for 6 hours

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function safeGetTime(date: Date | unknown): number {
  if (date instanceof Date) return date.getTime();
  const ms = new Date(String(date)).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/** formatBytes imported from @/lib/utils/format */

/**
 * Get local NAS config for the session engine.
 * The session engine runs globally (not per-request), so it doesn't have
 * a specific propertyId. We look up the first system NAS entry.
 */
async function getLocalNasConfigFromFirstProperty() {
  try {
    // Look up ANY active system NAS on 127.0.0.1 (Cryptsk Gateway)
    // Don't filter by propertyId — the system NAS is shared across properties
    const systemNas = await db.radiusNAS.findFirst({
      where: { ipAddress: '127.0.0.1', status: 'active' },
      select: { calledStationId: true, nasIdentifier: true, propertyId: true },
    });
    if (systemNas?.calledStationId) {
      return { calledStationId: systemNas.calledStationId, nasIdentifier: systemNas.nasIdentifier || 'cryptsk-gateway' };
    }
  } catch { /* non-fatal */ }
  return { calledStationId: '00:00:00:00:00:01', nasIdentifier: 'cryptsk-gateway' };
}

function minimalResult(): SessionEngineResult {
  return {
    sessionsProcessed: 0,
    interimUpdated: 0,
    sessionTimeoutDisconnected: 0,
    idleTimeoutDisconnected: 0,
    dataLimitDisconnected: 0,
    fupThrottled: 0,
    fupBlocked: 0,
    staleCleaned: 0,
    errors: 0,
    durationMs: 0,
    disconnectedSessions: [],
  };
}

// ────────────────────────────────────────────────────────────
// Pre-Step Functions (run before main session engine cycle)
// ────────────────────────────────────────────────────────────

/**
 * No-Show Guest WiFi Cleanup (Feature #11)
 *
 * Finds bookings marked as no_show that still have active WiFi,
 * deactivates them and closes their sessions.
 *
 * Uses BookingStatus enum value 'no_show' (not isNoShow boolean).
 */
async function checkNoShowGuests(): Promise<number> {
  try {
    // Find bookings marked as no_show that still have active WiFi
    const noShowBookings = await db.$queryRaw<Array<{ id: string; wifi_user_id: string }>>`
      SELECT b.id as id, wu.id as wifi_user_id
      FROM "Booking" b
      JOIN "WiFiUser" wu ON wu."bookingId" = b.id
      WHERE b.status = 'no_show'
        AND wu.status = 'active'
        AND wu."validUntil" > NOW()
    `;

    if (noShowBookings.length === 0) return 0;

    SELog.info(`[NoShow Cleanup] Found ${noShowBookings.length} no-show guests with active WiFi`);

    let cleaned = 0;
    for (const booking of noShowBookings) {
      try {
        // Get username before deactivating
        const wifiUser = await db.wiFiUser.findUnique({
          where: { id: booking.wifi_user_id },
          select: { username: true },
        });
        const username = wifiUser?.username;

        // Deactivate WiFi user
        await db.wiFiUser.update({
          where: { id: booking.wifi_user_id },
          data: { status: 'expired', validUntil: new Date() },
        });

        // Close any active RADIUS sessions
        if (username) {
          await db.$executeRaw`
            UPDATE radacct SET acctstoptime = NOW(), acctterminatecause = 'No-Show-Cleanup'
            WHERE acctstoptime IS NULL AND username = ${username}
          `;

          // Update WiFi sessions
          await db.wiFiSession.updateMany({
            where: {
              username,
              status: 'active',
            },
            data: { status: 'disconnected', endTime: new Date() },
          });

          // Clean up per-user RADIUS overrides (stale session data)
          await cleanupPerUserRadiusOverrides(username, '[NoShow Cleanup]');
        }

        SELog.info(`[NoShow Cleanup] Deactivated WiFi for no-show booking ${booking.id}`);
        cleaned++;
      } catch (err) {
        SELog.error(`[NoShow Cleanup] Failed for booking ${booking.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return cleaned;
  } catch (err) {
    SELog.error(`[NoShow Cleanup] Error: ${err instanceof Error ? err.message : String(err)}`);
    return 0;
  }
}

/**
 * Auto-Renewal for Extended Stay Guests (Feature #18)
 *
 * Finds active WiFi users whose plan is about to expire (within 2 hours)
 * but whose booking is still checked_in with future checkout.
 * Automatically extends the WiFi plan validity.
 *
 * Uses:
 *   - Booking.status = 'checked_in' (BookingStatus enum)
 *   - Booking."checkOutDate" for checkout date
 *   - WiFiPlan."validityDays" for plan duration
 */
async function checkAutoRenewal(): Promise<number> {
  try {
    // Find active WiFi users whose plan is about to expire but guest is still in-house
    // This runs every engine cycle (60s), so we check for plans expiring within 2 hours
    const expiringUsers = await db.$queryRaw<Array<{
      id: string;
      username: string;
      planId: string;
      validUntil: Date;
      bookingId: string;
      planValidityDays: number;
    }>>`
      SELECT wu.id, wu.username, wu."planId", wu."validUntil", wu."bookingId",
             wp."validityDays" as "planValidityDays"
      FROM "WiFiUser" wu
      JOIN "WiFiPlan" wp ON wp.id = wu."planId"
      JOIN "Booking" b ON b.id = wu."bookingId"
      WHERE wu.status = 'active'
        AND wu."validUntil" > NOW()
        AND wu."validUntil" < NOW() + INTERVAL '2 hours'
        AND b.status = 'checked_in'
        AND b."checkOutDate" > NOW()
    `;

    if (expiringUsers.length === 0) return 0;

    SELog.info(`[Auto-Renewal] Found ${expiringUsers.length} plans expiring soon`);

    let renewed = 0;
    for (const user of expiringUsers) {
      try {
        const newValidUntil = new Date(user.validUntil.getTime() + (user.planValidityDays * 24 * 60 * 60 * 1000));

        await db.wiFiUser.update({
          where: { id: user.id },
          data: { validUntil: newValidUntil },
        });

        SELog.info(`[Auto-Renewal] Extended ${user.username} until ${newValidUntil.toISOString()}`);
        renewed++;
      } catch (err) {
        SELog.error(`[Auto-Renewal] Failed for ${user.username}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return renewed;
  } catch (err) {
    SELog.error(`[Auto-Renewal] Error: ${err instanceof Error ? err.message : String(err)}`);
    return 0;
  }
}

// ────────────────────────────────────────────────────────────
// Session Engine — Main Entry Point
// ────────────────────────────────────────────────────────────

/**
 * Run one cycle of the Session Engine (OPTIMIZED v2).
 *
 * PERFORMANCE: Processes 5,000 users in ~2-5 seconds instead of ~180 seconds.
 *
 * Steps:
 * 1. Ensure nftables counter table exists
 * 2. Bulk read: all active sessions + counters + authenticated IPs + policies
 * 3. In-memory policy evaluation for each session (ZERO I/O per session)
 * 4. Batched DB writes (6 queries total instead of 20,000)
 * 5. Parallel disconnect processing for policy violations
 * 6. Cleanup orphan counters and interim rows
 * 7. Archive old interim-update rows (prevent unbounded table growth)
 */
export async function runSessionEngine(): Promise<SessionEngineResult> {
  if (isRunning) {
    skippedCycles++;
    if (skippedCycles >= SKIPPED_CYCLE_THRESHOLD) {
      SELog.error(
        `Cycle skipped — previous run still in progress ` +
        `(${skippedCycles} consecutive skips). Engine may be stuck.`
      );
    } else {
      SELog.warn(
        `Cycle skipped — previous run still in progress ` +
        `(skipped: ${skippedCycles} consecutive)`
      );
    }
    const skipped = minimalResult();
    SELog.recordRunResult(skipped);
    return skipped;
  }
  skippedCycles = 0;
  isRunning = true;

  try {
    // Restore activity timestamps from DB on first run after restart
    let firstCycleAfterRestart = false;
    if (lastActivityMap.size === 0) {
      await restoreActivityMapFromDb();
      firstCycleAfterRestart = true;
      SELog.info(
        `[Boot-Grace] First cycle after restart detected — skipping stale detection. ` +
        `Sessions survived reboot in radacct but nft is empty (expected). ` +
        `Run staysuite_recovery.sh to restore nft/TC state. Stale detection resumes next cycle.`
      );
    }

    // M6: Recover FUP-throttled users on first run after restart
    await recoverThrottledUsers();

    const startTime = Date.now();
    const result: SessionEngineResult = {
      sessionsProcessed: 0,
      interimUpdated: 0,
      sessionTimeoutDisconnected: 0,
      idleTimeoutDisconnected: 0,
      dataLimitDisconnected: 0,
      fupThrottled: 0,
      fupBlocked: 0,
      staleCleaned: 0,
      errors: 0,
      durationMs: 0,
      disconnectedSessions: [],
    };

    try {
      // ── Pre-Step: No-Show Guest WiFi Cleanup (Feature #11) ──
      const noShowCleaned = await checkNoShowGuests();
      if (noShowCleaned > 0) {
        SELog.info(`No-show cleanup: ${noShowCleaned} guests deactivated`);
      }

      // ── Pre-Step: Auto-Renewal for Extended Stay Guests (Feature #18) ──
      const autoRenewed = await checkAutoRenewal();
      if (autoRenewed > 0) {
        SELog.info(`Auto-renewal: ${autoRenewed} plans extended`);
      }

      // ── Pre-Step: Zombie WiFiSession cleanup ──
      // REMOVED — was incorrectly terminating active sessions by matching on username
      // alone (any closed radacct for the user killed ALL their active sessions).
      // Stale session detection in Step 4a already handles this correctly via
      // nftables membership checks per-IP.

      // ── Step 0: Check nftables availability (cached for 5 min) ──
      nftablesAvailable = await checkNftablesAvailability();
      if (!nftablesAvailable) {
        SELog.warn('nftables not available — running in FALLBACK mode (radacct-based idle detection)');
      }

      // ── Step 1: Ensure counter table exists (skip in fallback mode) ──
      if (nftablesAvailable) {
        setupCounterTable();

        if (!doesAuthenticatedSetExist()) {
          SELog.warn(
            'nftables loggedinusers set not found — ' +
            'stale session detection is DISABLED. ' +
            'Ensure nftables rules are properly configured (inet mangle table).'
          );
        }
      }

      // ── Step 2: Bulk data loading — fetch sessions first, then parallel load ──
      const sessions = await getActiveSessions();
      result.sessionsProcessed = sessions.length;

      // Load counters (sync), authenticated IPs (sync), policies (async), and FUP policies (async) in parallel
      const [counters, authIPs, policies, fupPolicies] = await Promise.all([
        Promise.resolve(loadCounterMap()),
        Promise.resolve(loadAuthenticatedIPs()),
        bulkLoadUserPolicies(extractUsernames(sessions)),
        bulkLoadFupPolicies(extractUsernames(sessions)),
      ]);

      // Load cumulative FUP cycle usage (aggregates across ALL sessions within the cycle)
      const fupCycleUsage = await bulkLoadFupCycleUsage(fupPolicies);

      if (sessions.length === 0) {
        SELog.info('No active sessions found');
        lastActivityMap.clear();
      } else {
        SELog.info(
          `Processing ${sessions.length} sessions, ` +
          `${counters.size} counters, ` +
          `${authIPs ? authIPs.size + ' authed IPs' : 'all IPs assumed authed'}, ` +
          `${policies.size} user policies, ` +
          `${fupPolicies.size} FUP policies` +
          (nftablesAvailable ? '' : ' [FALLBACK]')
        );

        // ── Step 3: In-memory policy evaluation (ZERO I/O per session) ──
        const toStale: Array<{ session: ActiveSession; dl: number; ul: number }> = [];
        const toDisconnect: Array<{ session: ActiveSession; reason: string; dl: number; ul: number; downloadDelta: number; uploadDelta: number; sessionTime: number }> = [];
        const toUpdate: Array<{
          session: ActiveSession;
          newDl: number; newUl: number;
          downloadDelta: number; uploadDelta: number;
          sessionTime: number;
          counterReset: boolean;
        }> = [];
        const noCounterSessions: ActiveSession[] = [];

        // FUP batch collections — collect candidates during loop, apply after
        const fupThrottleCandidates: Array<{
          ip: string;
          username: string;
          throttleDownKbps: number;
          throttleUpKbps: number;
          fupPolicyName: string;
          cycleType: string;
          usedBytes: number;
          limitBytes: number;
        }> = [];
        const fupUnthrottleCandidates: Array<{
          ip: string;
          username: string;
          fupPolicyName: string;
          cycleType: string;
          usedBytes: number;
          limitBytes: number;
        }> = [];

        for (const session of sessions) {
          try {
            const ip = normalizeIPv4(session.framedipaddress);
            const counter = counters.get(ip);
            const now = Date.now();
            const sessionTime = Math.floor((now - safeGetTime(session.acctstarttime)) / 1000);

            if (!counter) {
              noCounterSessions.push(session);
              continue;
            }

            const newDl = counter.downloadBytes;
            const newUl = counter.uploadBytes;
            const prevDl = Number(session.acctoutputoctets);
            const prevUl = Number(session.acctinputoctets);
            const newTotal = newDl + newUl;
            const prevTotal = prevDl + prevUl;
            const counterReset = newTotal < prevTotal;
            const delta = counterReset ? 0 : Math.max(0, newTotal - prevTotal);
            const downloadDelta = counterReset ? 0 : Math.max(0, newDl - prevDl);
            const uploadDelta = counterReset ? 0 : Math.max(0, newUl - prevUl);
            const policy = policies.get(session.username);

            // ── Stale check (IP not in nftables) ──
            // SKIP on first cycle after restart: nft is empty because of reboot,
            // not because users disconnected. Recovery script needs time to restore state.
            // Without this guard, the first cycle batch-kills ALL sessions (the exact
            // bug that made recovery impossible after server reboot).
            if (nftablesAvailable && authIPs !== null && !authIPs.has(ip) && !firstCycleAfterRestart) {
              // GRACE PERIOD: New sessions may not be in nftables yet because
              // the login script (staysuite_login.sh) runs synchronously AFTER
              // the radacct insert. For bulk operations (e.g. 100 sessions
              // created at once), the scheduler can run while login scripts
              // are still queued. Without this guard, the scheduler marks
              // those sessions as "stale" and runs logout — which DELETES the
              // TC class that the login script hasn't even created yet.
              //
              // Root cause of "100 logins called but only 12 TC classes
              // generated": scheduler ran during bulk login, found sessions
              // in radacct but not yet in nftables, deleted their TC state.
              const sessionStartTime = safeGetTime(session.acctstarttime);
              // If acctstarttime is null/zero (DB not updated yet), treat as
              // brand new session — always grant grace period
              const sessionAgeMs = sessionStartTime > 0 ? (now - sessionStartTime) : 0;
              const STALE_GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes (increased from 3)
              if (sessionAgeMs < STALE_GRACE_PERIOD_MS) {
                SELog.info(
                  `[Stale-Grace] SKIP ${session.username} (${ip}): ` +
                  `session age ${Math.round(sessionAgeMs / 1000)}s < ${STALE_GRACE_PERIOD_MS / 1000}s grace period — ` +
                  `login script may still be pending`
                );
                // Don't add to toStale — give the login script time to run
                noCounterSessions.push(session);
                continue;
              }
              SELog.warn(
                `[Stale-Detect] ${session.username} (${ip}): ` +
                `IP not in nftables authenticated set, session age ${Math.round(sessionAgeMs / 1000)}s — ` +
                `marking for cleanup`
              );
              toStale.push({ session, dl: newDl, ul: newUl });
              continue;
            }

            // ── Counter reset ──
            if (counterReset) {
              SELog.warn(`Counter reset detected for ${ip}: prev=${prevTotal}, new=${newTotal}`);
              // Still process normally with zero deltas, but mark for baseline update
            }

            // ── FALLBACK idle edge case ──
            if (delta === 0 && !counterReset) {
              const updateAgeSec = Math.floor((now - safeGetTime(session.acctupdatetime)) / 1000);
              if (updateAgeSec > 120) {
                lastActivityMap.delete(ip);
              }
            }

            // ── Idle timeout check ──
            const idleTimeout = policy?.idleTimeout ?? 0;
            if (idleTimeout > 0 && !counterReset) {
              if (delta > 0) {
                lastActivityMap.set(ip, now);
              } else {
                // M13 fix: If IP was evicted from in-memory map (LRU > 50K),
                // fall back to acctupdatetime from DB — NOT `now` (which resets idle timer).
                const lastActivity = lastActivityMap.get(ip)
                  || (session.acctupdatetime ? new Date(session.acctupdatetime).getTime() : now);
                const idleSeconds = Math.floor((now - lastActivity) / 1000);
                if (idleSeconds >= idleTimeout) {
                  toDisconnect.push({ session, reason: 'Idle-Timeout', dl: newDl, ul: newUl, downloadDelta, uploadDelta, sessionTime });
                  continue;
                }
              }
            }

            // ── FALLBACK idle timeout (no nftables) ──
            if (!nftablesAvailable && idleTimeout > 0) {
              const lastActivity = safeGetTime(session.acctupdatetime);
              const idleSeconds = Math.floor((now - lastActivity) / 1000);
              if (idleSeconds >= idleTimeout) {
                toDisconnect.push({ session, reason: 'Idle-Timeout', dl: newDl, ul: newUl, downloadDelta, uploadDelta, sessionTime });
                continue;
              }
            }

            // ── Session timeout check ──
            const sessionTimeout = policy?.sessionTimeout ?? 0;
            if (sessionTimeout > 0 && sessionTime >= sessionTimeout) {
              toDisconnect.push({ session, reason: 'Session-Timeout', dl: newDl, ul: newUl, downloadDelta, uploadDelta, sessionTime });
              continue;
            }

            // ── Data limit check ──
            const dataLimit = policy?.dataLimit ?? 0;
            if (dataLimit > 0) {
              const usagePercent = Math.round((newTotal / dataLimit) * 100);

              // FUP logging: warn at 80%/90%, error at 100% (cap enforcement)
              if (usagePercent >= 100) {
                SELog.error(
                  `[FUP] Data cap reached — ${session.username} (${ip}): ${formatBytes(newTotal)} / ${formatBytes(dataLimit)} (${usagePercent}%). Disconnecting.`
                );
              } else if (usagePercent >= 90) {
                SELog.warn(
                  `[FUP] Data cap critical — ${session.username} (${ip}): ${formatBytes(newTotal)} / ${formatBytes(dataLimit)} (${usagePercent}%). Approaching limit.`
                );
              } else if (usagePercent >= 80) {
                SELog.warn(
                  `[FUP] Data cap warning — ${session.username} (${ip}): ${formatBytes(newTotal)} / ${formatBytes(dataLimit)} (${usagePercent}%).`
                );
              }

              if (newTotal >= dataLimit) {
                toDisconnect.push({ session, reason: 'Data-Limit-Exceeded', dl: newDl, ul: newUl, downloadDelta, uploadDelta, sessionTime });
                continue;
              }
            }

            // ── FUP Policy enforcement (FairAccessPolicy) ──
            const fup = fupPolicies.get(session.username);
            if (fup) {
              // Cumulative cycle usage from radacct (aggregates ALL sessions within daily/weekly/monthly cycle)
              // PLUS the current session's live nftables delta for real-time detection.
              // radacct is updated every 60s (stale), so we adjust: cumulative − stale_current + live_current
              const cycleUsage = fupCycleUsage.get(session.username) || { download: 0, upload: 0, total: 0 };
              const prevSessionDl = Number(session.acctoutputoctets) || 0;  // radacct download (stale)
              const prevSessionUl = Number(session.acctinputoctets) || 0;    // radacct upload (stale)
              const adjustedDl = Math.max(0, cycleUsage.download - prevSessionDl + newDl);
              const adjustedUl = Math.max(0, cycleUsage.upload - prevSessionUl + newUl);
              const adjustedTotal = adjustedDl + adjustedUl;

              let fupUsedBytes = 0;
              if (fup.applicableOn === 'download') fupUsedBytes = adjustedDl;
              else if (fup.applicableOn === 'upload') fupUsedBytes = adjustedUl;
              else fupUsedBytes = adjustedTotal;  // 'total'

              SELog.info(`[FUP-Check] ${session.username}: cycle=${fup.cycleType} cumulative=${formatBytes(fupUsedBytes)} limit=${formatBytes(fup.dataLimitBytes)} exceeded=${fupUsedBytes >= fup.dataLimitBytes}`);

              if (fupUsedBytes >= fup.dataLimitBytes) {
                // FUP limit exceeded
                if (fup.isThrottle) {
                  // THROTTLE: collect for batch apply (instead of one-by-one TC commands)
                  if (!throttledUsers.has(session.username)) {
                    throttledUsers.add(session.username);
                    result.fupThrottled++;
                    fupThrottleCandidates.push({
                      ip,
                      username: session.username,
                      throttleDownKbps: fup.throttleDownKbps,
                      throttleUpKbps: fup.throttleUpKbps,
                      fupPolicyName: fup.fupPolicyName,
                      cycleType: fup.cycleType,
                      usedBytes: fupUsedBytes,
                      limitBytes: fup.dataLimitBytes,
                    });
                  }
                  // Don't disconnect — user stays connected at reduced speed
                  // Still add to normal update to keep tracking usage
                  toUpdate.push({ session, newDl, newUl, downloadDelta, uploadDelta, sessionTime, counterReset });
                  continue;
                } else {
                  // BLOCK: same as data limit — disconnect
                  SELog.error(
                    `[FUP] BLOCK ${session.username} (${ip}): ${formatBytes(fupUsedBytes)} / ${formatBytes(fup.dataLimitBytes)}. Disconnecting.`
                  );
                  toDisconnect.push({ session, reason: 'FUP-Block', dl: newDl, ul: newUl, downloadDelta, uploadDelta, sessionTime });
                  continue;
                }
              } else if (fup.isThrottle && throttledUsers.has(session.username)) {
                // FUP limit NOT exceeded but user was throttled — collect for batch unthrottle
                throttledUsers.delete(session.username);
                fupUnthrottleCandidates.push({
                  ip,
                  username: session.username,
                  fupPolicyName: fup.fupPolicyName,
                  cycleType: fup.cycleType,
                  usedBytes: fupUsedBytes,
                  limitBytes: fup.dataLimitBytes,
                });
              }
            }

            // ── Acct-Interim-Interval verification (monitoring only) ──
            // The session engine IS the gateway — it generates interim updates from
            // nftables byte counters. If counters haven't changed for 2× the interval,
            // either traffic is truly idle OR nftables counter rules are broken/misconfigured.
            const interimInterval = policy?.acctInterimInterval || 60;
            if (delta === 0 && !counterReset) {
              const lastCounterChange = lastActivityMap.get(ip);
              if (lastCounterChange) {
                const staleSeconds = Math.floor((now - lastCounterChange) / 1000);
                if (staleSeconds >= interimInterval * 2) {
                  SELog.warn(
                    `[Counter-Monitor] IP ${ip} (${session.username}): nftables byte counters unchanged for ${staleSeconds}s ` +
                    `(Acct-Interim-Interval=${interimInterval}s). Verify nftables counter rules and traffic routing.`
                  );
                }
              }
            }

            // ── Normal update ──
            toUpdate.push({
              session,
              newDl, newUl,
              downloadDelta, uploadDelta,
              sessionTime,
              counterReset,
            });
          } catch (err) {
            result.errors++;
            SELog.error(
              `Error evaluating session ${session.username} (${session.framedipaddress}): ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }

        // ── Step 4-FUP: Batch apply FUP throttle/unthrottle (BATCHED TC) ──
        // Instead of one-by-one updateSessionBandwidth() calls (500 users = 1000 tc commands),
        // batch all FUP operations into tc -batch files for minimal RTNL lock contention.
        if (fupThrottleCandidates.length > 0) {
          try {
            const throttleResult = await bulkFupThrottle(fupThrottleCandidates);
            const successCount = throttleResult.updated;
            const failCount = throttleResult.failed;
            SELog.warn(
              `[FUP] BATCH THROTTLE: ${successCount}/${fupThrottleCandidates.length} users throttled` +
              (failCount > 0 ? `, ${failCount} FAILED` : '')
            );
            // Log each throttle to fup_switch_log (non-fatal)
            for (const c of fupThrottleCandidates) {
              try {
                await db.$executeRaw(Prisma.sql`
                  INSERT INTO fup_switch_log (username, plan_name, fup_policy_name, action, cycle_type, usage_mb, limit_mb, throttle_down_kbps, throttle_up_kbps, created_at)
                  VALUES (${c.username}, ${''}, ${c.fupPolicyName}, 'throttle', ${c.cycleType},
                          ROUND(${c.usedBytes}::numeric / 1048576, 1), ${c.limitBytes / 1048576},
                          ${c.throttleDownKbps}, ${c.throttleUpKbps}, NOW())
                `);
              } catch { /* non-fatal */ }
            }
          } catch (err) {
            SELog.error(`[FUP] Batch throttle failed: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        if (fupUnthrottleCandidates.length > 0) {
          // Resolve plan speeds for each unthrottle candidate
          const unthrottleEntries: Array<{
            ip: string;
            username: string;
            downloadKbps: number;
            uploadKbps: number;
            downloadCeilKbps?: number;
            uploadCeilKbps?: number;
          }> = [];
          for (const c of fupUnthrottleCandidates) {
            try {
              const planSpeeds = await getPlanSpeeds(c.username);
              if (planSpeeds) {
                unthrottleEntries.push({
                  ip: c.ip,
                  username: c.username,
                  downloadKbps: Math.round(planSpeeds.downloadMbps * 1000),
                  uploadKbps: Math.round(planSpeeds.uploadMbps * 1000),
                });
              }
            } catch (err) {
              SELog.error(`[FUP] Failed to get plan speeds for unthrottle ${c.username}: ${err instanceof Error ? err.message : String(err)}`);
            }
          }

          if (unthrottleEntries.length > 0) {
            try {
              const unthrottleResult = await bulkFupUnthrottle(unthrottleEntries);
              const successCount = unthrottleResult.updated;
              const failCount = unthrottleResult.failed;
              SELog.info(
                `[FUP] BATCH UNTHROTTLE: ${successCount}/${unthrottleEntries.length} users restored` +
                (failCount > 0 ? `, ${failCount} FAILED` : '')
              );
              // Log each unthrottle to fup_switch_log (non-fatal)
              for (const c of fupUnthrottleCandidates) {
                const entry = unthrottleEntries.find(e => e.username === c.username);
                if (entry) {
                  try {
                    await db.$executeRaw(Prisma.sql`
                      INSERT INTO fup_switch_log (username, plan_name, fup_policy_name, action, cycle_type, usage_mb, limit_mb, original_down_kbps, original_up_kbps, created_at)
                      VALUES (${c.username}, ${''}, ${c.fupPolicyName}, 'unthrottle', ${c.cycleType},
                              ROUND(${c.usedBytes}::numeric / 1048576, 1), ${c.limitBytes / 1048576},
                              ${entry.downloadKbps}, ${entry.uploadKbps}, NOW())
                    `);
                  } catch { /* non-fatal */ }
                }
              }
            } catch (err) {
              SELog.error(`[FUP] Batch unthrottle failed: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        }

        // ── Step 4a: Process stale sessions (BATCHED — MED-007) ──
        // MED-007: Instead of spawning one logout.sh per stale session,
        // batch them into a single shell invocation + bulk DB update.
        // Limit to BATCH_CLEANUP_SIZE per cycle; remainder processed next cycle.
        const staleBatch = toStale.slice(0, BATCH_CLEANUP_SIZE);
        const staleDeferred = toStale.length - staleBatch.length;
        if (staleDeferred > 0) {
          SELog.info(`Stale cleanup: processing ${staleBatch.length} this cycle, ${staleDeferred} deferred to next cycle (BATCH_CLEANUP_SIZE=${BATCH_CLEANUP_SIZE})`);
        }

        if (staleBatch.length > 0) {
          result.staleCleaned = staleBatch.length;

          // 4a-1: Batch network cleanup (single shell invocation for all stale IPs)
          const staleIps = staleBatch.map(({ session }) => normalizeIPv4(session.framedipaddress)).filter(Boolean);
          try {
            const batchLogoutResult = runBatchLogoutScript(staleIps);
            SELog.info(`Batch stale logout: ${staleIps.length} IPs in ${batchLogoutResult.durationMs}ms (success=${batchLogoutResult.success})`);
          } catch (batchErr) {
            result.errors++;
            SELog.error(`Batch stale logout failed: ${batchErr instanceof Error ? batchErr.message : String(batchErr)}`);
          }

          // 4a-2: Remove counters and activity map entries
          for (const { session } of staleBatch) {
            const ip = normalizeIPv4(session.framedipaddress);
            if (ip) {
              try { removeUserCounter(ip); } catch { /* non-fatal */ }
              lastActivityMap.delete(ip);
            }
          }

          // 4a-3: Bulk close radacct records + update WiFiSession
          try {
            const closeValues = staleBatch.map(({ session, dl, ul }) => {
              const sessionTime = Math.floor((Date.now() - safeGetTime(session.acctstarttime)) / 1000);
              return Prisma.sql`(${session.radacctid}, ${ul}, ${dl}, ${sessionTime})`;
            });
            await db.$executeRaw`
              UPDATE radacct SET
                acctstoptime = NOW(),
                acctinputoctets = COALESCE(acctinputoctets, v.input_octets),
                acctoutputoctets = COALESCE(acctoutputoctets, v.output_octets),
                acctsessiontime = v.session_time,
                acctterminatecause = 'Session-Cleanup',
                acctupdatetime = NOW()
              FROM (VALUES ${Prisma.join(closeValues)}) AS v(radacct_id, input_octets, output_octets, session_time)
              WHERE radacctid = v.radacct_id::bigint AND acctstoptime IS NULL
            `;

            // Bulk update WiFiSession for stale sessions
            const staleSessionValues = staleBatch.map(({ session }) => {
              const sessionTime = Math.floor((Date.now() - safeGetTime(session.acctstarttime)) / 1000);
              return Prisma.sql`(${session.username}, ${session.callingstationid}, ${sessionTime})`;
            });
            await db.$executeRaw`
              UPDATE "WiFiSession" SET
                status = 'ended',
                "endTime" = NOW(),
                "duration" = v.session_time,
                "updatedAt" = NOW()
              FROM (VALUES ${Prisma.join(staleSessionValues)}) AS v(username, mac, session_time)
              WHERE "WiFiSession".username = v.username
                AND "WiFiSession".status = 'active'
                AND (v.mac = '' OR v.mac = 'unknown' OR "WiFiSession"."macAddress" = v.mac)
            `;
          } catch (dbErr) {
            result.errors++;
            SELog.error(`Batch stale DB update error: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`);
          }

          // 4a-4: Batch cleanup per-user RADIUS overrides (parallel, limited concurrency)
          for (let i = 0; i < staleBatch.length; i += DISCONNECT_CONCURRENCY) {
            const radiusBatch = staleBatch.slice(i, i + DISCONNECT_CONCURRENCY);
            await Promise.allSettled(radiusBatch.map(async ({ session }) => {
              try {
                await cleanupPerUserRadiusOverrides(session.username, '[Batch Stale Cleanup]');
              } catch { /* non-fatal */ }
            }));
          }

          SELog.info(`Stale cleanup: processed ${staleBatch.length} sessions in batch`);
        }

        // ── Step 4b: Process disconnects (parallel, 5 at a time) ──
        for (let i = 0; i < toDisconnect.length; i += DISCONNECT_CONCURRENCY) {
          const batch = toDisconnect.slice(i, i + DISCONNECT_CONCURRENCY);
          await Promise.allSettled(batch.map(async ({ session, reason, dl, ul, downloadDelta, uploadDelta, sessionTime }) => {
            try {
              SELog.info(
                `${reason}: ${session.username} (${session.framedipaddress}) — ` +
                `${reason === 'Idle-Timeout' ? 'idle exceeded' : reason === 'Session-Timeout' ? `${sessionTime}s exceeded limit` : `${Math.round((dl + ul) / (1024 * 1024))}MB used`}`
              );
              await disconnectSession(session, reason, dl, ul);
              result.disconnectedSessions.push({ username: session.username, ip: session.framedipaddress, reason });
              lastActivityMap.delete(normalizeIPv4(session.framedipaddress));

              switch (reason) {
                case 'Idle-Timeout': result.idleTimeoutDisconnected++; break;
                case 'Session-Timeout': result.sessionTimeoutDisconnected++; break;
                case 'Data-Limit-Exceeded': result.dataLimitDisconnected++; break;
                case 'FUP-Block': result.fupBlocked++; break;
              }
            } catch (err) {
              result.errors++;
              SELog.error(`Disconnect error for ${session.username}: ${err instanceof Error ? err.message : String(err)}`);
            }
          }));
        }

        // ── Step 4c: Batch UPDATE radacct (1 query for all sessions) ──
        if (toUpdate.length > 0) {
          try {
            // Build values for UPDATE using CASE WHEN
            // We update the main session row (acctstatus IS NULL or 'start')
            const counterResetIds = new Set(toUpdate.filter(u => u.counterReset).map(u => u.session.radacctid));

            // Update radacct for normal sessions
            if (toUpdate.length > 0) {
              const values = toUpdate.map(u => Prisma.sql`(${u.session.radacctid}, ${u.newUl}, ${u.newDl}, ${u.sessionTime})`);
              await db.$executeRaw`
                UPDATE radacct r SET
                  acctinputoctets = v.input_octets,
                  acctoutputoctets = v.output_octets,
                  acctsessiontime = v.session_time,
                  acctupdatetime = NOW()
                FROM (VALUES ${Prisma.join(values)}) AS v(radacct_id, input_octets, output_octets, session_time)
                WHERE r.radacctid = v.radacct_id::bigint
                  AND r.acctstoptime IS NULL
                  AND (r.acctstatus IS NULL OR r.acctstatus = '' OR r.acctstatus = 'start')
              `;

              // Handle counter resets separately (update baseline)
              if (counterResetIds.size > 0) {
                const counterResetSessions = toUpdate.filter(u => counterResetIds.has(u.session.radacctid));
                const resetRows = counterResetSessions.map(u =>
                  Prisma.sql`(${u.session.radacctid}, ${u.newUl}, ${u.newDl})`
                );
                await db.$executeRaw`
                  UPDATE radacct SET
                    acctinputoctets = v.input_octets,
                    acctoutputoctets = v.output_octets,
                    acctupdatetime = NOW()
                  FROM (VALUES ${Prisma.join(resetRows)}) AS v(radacct_id, input_octets, output_octets)
                  WHERE radacctid = v.radacct_id::bigint AND acctstoptime IS NULL
                `;
              }

              // NOTE: Interim-update row creation REMOVED (v3 fix).
              // Previously, the engine INSERTed 'interim-update' rows into radacct every 60s cycle.
              // This caused session count doubling: N 'start' rows + N 'interim-update' rows = 2N open rows.
              // All session-counting queries (simul_count, fn_check_login_limit) filter by acctstatus,
              // but admin dashboards and raw DB queries showed 2× the actual session count.
              // Since the 'start' row is already updated in-place with latest byte counts every 60s,
              // the interim rows were redundant. They are no longer created.

              // ── Batch UPDATE WiFiUser cumulative totals (1 query) ──
              const usersWithDeltas = toUpdate.filter(u => u.downloadDelta > 0 || u.uploadDelta > 0);
              if (usersWithDeltas.length > 0) {
                const userValues = usersWithDeltas.map(u =>
                  Prisma.sql`(${u.session.username}, ${u.uploadDelta}, ${u.downloadDelta})`
                );
                await db.$executeRaw`
                  UPDATE "WiFiUser" w SET
                    "totalBytesIn" = w."totalBytesIn" + v.ul_delta,
                    "totalBytesOut" = w."totalBytesOut" + v.dl_delta,
                    "lastAccountingAt" = NOW()
                  FROM (VALUES ${Prisma.join(userValues)}) AS v(username, ul_delta, dl_delta)
                  WHERE w.username = v.username
                `;
              }

              // ── C-09: Cross-Session Data Quota Check ──
              // Check if any user has exceeded their cross-session data quota.
              // Quota = plan.dataQuotaBytes + user.quotaTopupBytes
              // Used = user.quotaBytesUsed (cycle-scoped, updated below)
              const usersToQuotaCheck = usersWithDeltas.map(u => u.session.username);
              if (usersToQuotaCheck.length > 0) {
                try {
                  const quotaExceededUsers = await db.$queryRaw`
                    SELECT wu.username, wp."dataQuotaBytes", wp."quotaCycleType",
                           wu."quotaBytesUsed", wu."quotaTopupBytes", wu.status
                    FROM "WiFiUser" wu
                    JOIN "WiFiPlan" wp ON wu."planId" = wp.id
                    WHERE wu.username IN (${Prisma.join(usersToQuotaCheck)})
                      AND wp."dataQuotaBytes" IS NOT NULL
                      AND wp."dataQuotaBytes" > 0
                  ` as Array<{username: string; dataQuotaBytes: bigint; quotaCycleType: string; quotaBytesUsed: bigint; quotaTopupBytes: bigint; status: string}>;

                  for (const qUser of quotaExceededUsers) {
                    const effectiveQuota = Number(qUser.dataQuotaBytes) + Number(qUser.quotaTopupBytes);
                    const used = Number(qUser.quotaBytesUsed);
                    if (used >= effectiveQuota && qUser.status !== 'quota_exceeded') {
                      SELog.error(`[C-09] Quota EXCEEDED for ${qUser.username}: ${formatBytes(used)} / ${formatBytes(effectiveQuota)} (cycle: ${qUser.quotaCycleType}, topup: ${formatBytes(Number(qUser.quotaTopupBytes))})`);

                      // Update user status
                      await db.wiFiUser.updateMany({
                        where: { username: qUser.username },
                        data: { status: 'quota_exceeded' },
                      }).catch(() => {});

                      // Find and disconnect all active sessions for this user
                      const userSessions = toUpdate.filter(u => u.session.username === qUser.username);
                      for (const us of userSessions) {
                        // Will be disconnected in the next iteration — for now just mark
                        SELog.info(`[C-09] Marking session for disconnect: ${us.session.username} (${us.session.framedipaddress})`);
                        toDisconnect.push({
                          session: us.session,
                          reason: 'Quota-Exceeded',
                          dl: us.newDl,
                          ul: us.newUl,
                          downloadDelta: us.downloadDelta,
                          uploadDelta: us.uploadDelta,
                          sessionTime: us.sessionTime,
                        });
                      }
                    }
                  }
                } catch (quotaErr) {
                  SELog.error(`[C-09] Quota check error: ${quotaErr instanceof Error ? quotaErr.message : String(quotaErr)}`);
                }
              }

              // ── Update quotaBytesUsed (cycle-scoped) for all users with deltas ──
              if (usersWithDeltas.length > 0) {
                try {
                  const quotaValues = usersWithDeltas.map(u =>
                    Prisma.sql`(${u.session.username}, ${u.uploadDelta + u.downloadDelta})`
                  );
                  await db.$executeRaw`
                    UPDATE "WiFiUser" w SET
                      "quotaBytesUsed" = w."quotaBytesUsed" + v.delta
                    FROM (VALUES ${Prisma.join(quotaValues)}) AS v(username, delta)
                    WHERE w.username = v.username
                  `;
                } catch { /* non-fatal */ }
              }

              // ── Batch UPDATE WiFiSession (1 query per batch of 500) ──
              // HIGH-022 fix: Include framedipaddress in the VALUES so the WHERE clause
              // can match by IP when MAC is empty/unknown. The old condition
              //   (v.mac = '' OR v.mac = 'unknown' OR s."macAddress" = v.mac)
              // updated ALL active sessions for a username when MAC was unknown.
              const CHUNK_SIZE = 500;
              for (let i = 0; i < toUpdate.length; i += CHUNK_SIZE) {
                const chunk = toUpdate.slice(i, i + CHUNK_SIZE);
                const sessionValues = chunk.map(u => {
                  const dataUsedBytes = u.newDl + u.newUl;
                  return Prisma.sql`(${u.session.username}, ${u.session.callingstationid}, ${normalizeIPv4(u.session.framedipaddress) || '0.0.0.0'}, ${u.newDl}, ${u.newUl}, ${u.sessionTime}, ${dataUsedBytes})`;
                });
                // HIGH-022: Match by (username, MAC) when MAC is valid, or (username, IP) when MAC is unknown.
                // This prevents updating the wrong session when multiple guests share a MAC.
                await db.$executeRaw`
                  UPDATE "WiFiSession" s SET
                    "dataUsed" = v.data_used,
                    "duration" = v.session_time,
                    "updatedAt" = NOW()
                  FROM (VALUES ${Prisma.join(sessionValues)}) AS v(username, mac, ip, dl, ul, session_time, data_used)
                  WHERE s.username = v.username
                    AND s.status = 'active'
                    AND (
                      (v.mac != '' AND v.mac != 'unknown' AND s."macAddress" = v.mac)
                      OR (v.ip != '0.0.0.0' AND s."ipAddress" = v.ip)
                    )
                `;
              }

              result.interimUpdated = toUpdate.length;
            }
          } catch (err) {
            result.errors++;
            SELog.error(`Batch update error: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        // ── Step 4d: Handle no-counter sessions (batch session-time update) ──
        if (noCounterSessions.length > 0) {
          try {
            // Add counter rules in bulk (nft calls)
            if (nftablesAvailable) {
              for (const session of noCounterSessions) {
                try { addUserCounter(session.framedipaddress); } catch { /* non-fatal */ }
              }
            }

            // Batch update session time only
            const noCounterRows = noCounterSessions.map(s => {
              const sessionTime = Math.floor((Date.now() - safeGetTime(s.acctstarttime)) / 1000);
              return Prisma.sql`(${s.radacctid}, ${sessionTime})`;
            });
            if (noCounterRows.length > 0) {
              await db.$executeRaw`
                UPDATE radacct r SET
                  acctsessiontime = v.session_time
                FROM (VALUES ${Prisma.join(noCounterRows)}) AS v(radacct_id, session_time)
                WHERE r.radacctid = v.radacct_id::bigint
                  AND r.acctstoptime IS NULL
              `;

              // Batch update WiFiSession for no-counter sessions
              // HIGH-022 fix: Include IP in match condition to prevent cross-session updates
              const CHUNK_SIZE = 500;
              for (let i = 0; i < noCounterSessions.length; i += CHUNK_SIZE) {
                const chunk = noCounterSessions.slice(i, i + CHUNK_SIZE);
                const ncValues = chunk.map(s => {
                  const sessionTime = Math.floor((Date.now() - safeGetTime(s.acctstarttime)) / 1000);
                  const dataUsedBytes = Number(s.acctoutputoctets) + Number(s.acctinputoctets);
                  return Prisma.sql`(${s.username}, ${s.callingstationid}, ${normalizeIPv4(s.framedipaddress) || '0.0.0.0'}, ${sessionTime}, ${dataUsedBytes})`;
                });
                await db.$executeRaw`
                  UPDATE "WiFiSession" s SET
                    "dataUsed" = v.data_used,
                    "duration" = v.duration,
                    "updatedAt" = NOW()
                  FROM (VALUES ${Prisma.join(ncValues)}) AS v(username, mac, ip, duration, data_used)
                  WHERE s.username = v.username AND s.status = 'active'
                    AND (
                      (v.mac != '' AND v.mac != 'unknown' AND s."macAddress" = v.mac)
                      OR (v.ip != '0.0.0.0' AND s."ipAddress" = v.ip)
                    )
                `;
              }

              // FALLBACK: check policies for sessions without counters
              if (!nftablesAvailable) {
                const fallbackPolicies = await bulkLoadUserPolicies(extractUsernames(noCounterSessions));
                const now = Date.now();
                const fallbackDisconnects: typeof toDisconnect = [];

                for (const session of noCounterSessions) {
                  const policy = fallbackPolicies.get(session.username);
                  const sessionTime = Math.floor((now - safeGetTime(session.acctstarttime)) / 1000);
                  const dl = Number(session.acctoutputoctets);
                  const ul = Number(session.acctinputoctets);
                  const total = dl + ul;

                  const idleTimeout = policy?.idleTimeout ?? 0;
                  if (idleTimeout > 0) {
                    const lastActivity = safeGetTime(session.acctupdatetime);
                    const idleSeconds = Math.floor((now - lastActivity) / 1000);
                    if (idleSeconds >= idleTimeout) {
                      fallbackDisconnects.push({ session, reason: 'Idle-Timeout', dl, ul, downloadDelta: 0, uploadDelta: 0, sessionTime });
                      continue;
                    }
                  }

                  const sessionTimeout = policy?.sessionTimeout ?? 0;
                  if (sessionTimeout > 0 && sessionTime >= sessionTimeout) {
                    fallbackDisconnects.push({ session, reason: 'Session-Timeout', dl, ul, downloadDelta: 0, uploadDelta: 0, sessionTime });
                    continue;
                  }

                  const dataLimit = policy?.dataLimit ?? 0;
                  if (dataLimit > 0) {
                    const usagePercent = Math.round((total / dataLimit) * 100);
                    const fallbackIp = normalizeIPv4(session.framedipaddress);
                    if (usagePercent >= 100) {
                      SELog.error(
                        `[FUP] Data cap reached — ${session.username} (${fallbackIp}): ${formatBytes(total)} / ${formatBytes(dataLimit)} (${usagePercent}%). Disconnecting (fallback).`
                      );
                    } else if (usagePercent >= 90) {
                      SELog.warn(
                        `[FUP] Data cap critical — ${session.username} (${fallbackIp}): ${formatBytes(total)} / ${formatBytes(dataLimit)} (${usagePercent}%). Approaching limit.`
                      );
                    } else if (usagePercent >= 80) {
                      SELog.warn(
                        `[FUP] Data cap warning — ${session.username} (${fallbackIp}): ${formatBytes(total)} / ${formatBytes(dataLimit)} (${usagePercent}%).`
                      );
                    }
                    if (total >= dataLimit) {
                      fallbackDisconnects.push({ session, reason: 'Data-Limit-Exceeded', dl, ul, downloadDelta: 0, uploadDelta: 0, sessionTime });
                      continue;
                    }
                  }
                }

                // Process fallback disconnects
                for (let i = 0; i < fallbackDisconnects.length; i += DISCONNECT_CONCURRENCY) {
                  const batch = fallbackDisconnects.slice(i, i + DISCONNECT_CONCURRENCY);
                  await Promise.allSettled(batch.map(async ({ session, reason, dl, ul }) => {
                    try {
                      await disconnectSessionFallback(session, reason, dl, ul);
                      lastActivityMap.delete(normalizeIPv4(session.framedipaddress));
                      result.disconnectedSessions.push({ username: session.username, ip: normalizeIPv4(session.framedipaddress), reason });
                      switch (reason) {
                        case 'Idle-Timeout': result.idleTimeoutDisconnected++; break;
                        case 'Session-Timeout': result.sessionTimeoutDisconnected++; break;
                        case 'Data-Limit-Exceeded': result.dataLimitDisconnected++; break;
                      }
                    } catch (err) {
                      result.errors++;
                      SELog.error(`[No-Counter Disconnect] Failed for ${session.username}: ${err instanceof Error ? err.message : String(err)}`);
                    }
                  }));
                }
              }
            }
          } catch (err) {
            result.errors++;
            SELog.error(`No-counter batch update error: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        // ── Step 4e: GC lastActivityMap ──
        const allActiveIps = new Set(sessions.map(s => normalizeIPv4(s.framedipaddress)));
        for (const [mapIp] of lastActivityMap) {
          if (!allActiveIps.has(mapIp)) {
            lastActivityMap.delete(mapIp);
          }
        }

        // FIX #11: Periodically save activity map to file backup
        saveActivityMapToFile().catch(() => {});

        // ── Step 5: One-time cleanup of ALL remaining interim-update rows ──
        // Since v3 no longer creates interim rows, this cleans up any leftover from v1/v2.
        // Runs every cycle until no interim rows remain (idempotent, fast when 0 rows).
        try {
          const cleanupResult = await db.$executeRaw`
            UPDATE radacct
            SET acctstoptime = NOW(),
                acctterminatecause = 'Interim-Row-Cleanup-v3',
                acctupdatetime = NOW()
            WHERE acctstoptime IS NULL
              AND acctstatus = 'interim-update'
          `;
          const cleanupCount = typeof cleanupResult === 'number' ? cleanupResult : 0;
          if (cleanupCount > 0) {
            SELog.info(`Interim-Row-Cleanup-v3: closed ${cleanupCount} leftover interim-update rows (no longer created)`);
            result.staleCleaned += cleanupCount;
          }
        } catch (err) {
          SELog.warn(`Failed to clean interim rows: ${err instanceof Error ? err.message : String(err)}`);
        }

        // ── Step 5b: Orphan counter cleanup ──
        if (nftablesAvailable) {
          const activeIps = new Set(sessions.map(s => s.framedipaddress));
          let orphanCount = 0;
          for (const [counterIp] of counters) {
            if (!activeIps.has(counterIp)) {
              SELog.info(`Orphan counter cleanup: removing rules for ${counterIp}`);
              removeUserCounter(counterIp);
              orphanCount++;
            }
          }
          if (orphanCount > 0) {
            SELog.info(`Cleaned ${orphanCount} orphan counter rule(s)`);
          }
        } else {
          // Fallback: clean up stale sessions in DB (for environments without nftables)
          try {
            const staleResult = await db.$executeRaw`
              UPDATE "WiFiSession"
              SET status = 'disconnected', "updatedAt" = NOW()
              WHERE status = 'active'
                AND "updatedAt" < NOW() - INTERVAL '24 hours'
            `;
            const staleCount = typeof staleResult === 'number' ? staleResult : 0;
            if (staleCount > 0) {
              SELog.info(`Fallback: marked ${staleCount} stale sessions (no activity >24h) as disconnected`);
            }
          } catch (err) {
            SELog.warn(`Fallback stale session cleanup failed: ${err instanceof Error ? err.message : String(err)}`);
          }
        }

        // ── Step 6: Log results ──
        result.durationMs = Date.now() - startTime;
        SELog.info(
          `Cycle complete in ${result.durationMs}ms: ` +
          `${result.interimUpdated} updated, ` +
          `${result.sessionTimeoutDisconnected} session-timeout, ` +
          `${result.idleTimeoutDisconnected} idle-timeout, ` +
          `${result.dataLimitDisconnected} data-limit, ` +
          `${result.staleCleaned} stale, ` +
          `${result.errors} errors`
        );
      }

      // ── Step 5d: UNIVERSAL stale radacct cleanup (always runs) ──
      // Close radacct rows that have been idle for too long, preventing them from
      // accumulating and blocking new logins via fn_check_login_limit.
      // This catches:
      //   - Sessions from disconnected devices where RADIUS never sent Accounting-Stop
      //   - Test sessions from curl/API testing that were never properly closed
      //   - Sessions where nftables counters don't exist (no-counter sessions)
      //   - Orphaned interim-update rows whose parent 'start' row was already closed
      // Uses acctupdatetime to detect inactivity — if the session engine hasn't
      // updated this row in 30 minutes, it's stale.
      try {
        // ── 5d-A: Clean ALL remaining open interim-update rows (always runs) ──
        // v3 no longer creates interim rows. Step 5 (inside sessions block) also does this.
        // This ensures cleanup even when sessions.length === 0 (e.g., after all devices disconnect).
        try {
          const allInterimCleanup = await db.$executeRaw`
            UPDATE radacct
            SET acctstoptime = NOW(),
                acctterminatecause = 'Interim-Row-Migration-v3',
                acctupdatetime = NOW()
            WHERE acctstoptime IS NULL
              AND acctstatus = 'interim-update'
          `;
          const allInterimCount = typeof allInterimCleanup === 'number' ? allInterimCleanup : 0;
          if (allInterimCount > 0) {
            SELog.info(`Interim-Row-Migration-v3: closed ${allInterimCount} leftover interim-update rows`);
            result.staleCleaned += allInterimCount;
          }
        } catch (err) {
          SELog.warn(`Failed to close interim rows: ${err instanceof Error ? err.message : String(err)}`);
        }

        // ── 5d-B: Clean 'start' rows not updated by session engine in 30 minutes
        // This catches sessions whose device is gone but radacct was never closed.
        // For active sessions, acctupdatetime is refreshed every 60s by the session engine.
        // If it hasn't been updated in 30 minutes, the device is definitely gone.
        //
        // MED-007: Uses BATCH_CLEANUP_SIZE for limit. Instead of spawning one
        // logout.sh per session, uses a single batch shell invocation.
        //
        // IMPORTANT: Before closing DB records, we must also clean up NETWORK STATE
        // (nftables counter rules, authenticated set, logout script). Otherwise,
        // orphaned nftables rules persist and the IP stays in the authenticated set,
        // causing counter-monitor warnings and preventing proper stale detection.
        const staleStartRows = await db.$queryRaw<Array<{ framedipaddress: string; username: string }>>(Prisma.sql`
          SELECT framedipaddress::text AS framedipaddress, username FROM radacct
           WHERE acctstoptime IS NULL
             AND (acctstatus IS NULL OR acctstatus = '' OR acctstatus = 'start')
             AND acctupdatetime < NOW() - INTERVAL '30 minutes'
             AND framedipaddress IS NOT NULL
             AND framedipaddress::text != ''
             AND framedipaddress::text != '0.0.0.0'
           LIMIT ${BATCH_CLEANUP_SIZE}`
        );

        // MED-007: Batch network cleanup — single shell invocation for all stale IPs
        if (staleStartRows.length > 0) {
          const staleStartIps = staleStartRows.map(row => normalizeIPv4(row.framedipaddress)).filter(Boolean);
          try {
            const batchResult = runBatchLogoutScript(staleStartIps);
            SELog.info(`Stale-Session-Cleanup: batch logout for ${staleStartIps.length} IPs in ${batchResult.durationMs}ms (success=${batchResult.success})`);
          } catch (netErr) {
            SELog.warn(`Stale-Session-Cleanup: batch logout failed: ${netErr instanceof Error ? netErr.message : String(netErr)}`);
          }

          // Clean up counters and activity map entries
          for (const ip of staleStartIps) {
            try { removeUserCounter(ip); } catch { /* non-fatal */ }
            lastActivityMap.delete(ip);
            // Release SNAT assignment (if any) — fire-and-forget
            releaseSnatIp(ip, 'stale_cleanup').catch(() => {});
          }
        }

        if (staleStartRows.length > 0) {
          const staleStartResult = await db.$executeRaw`
            UPDATE radacct
            SET acctstoptime = NOW(),
                acctterminatecause = 'Stale-Session-Cleanup',
                acctupdatetime = NOW()
            WHERE acctstoptime IS NULL
              AND (acctstatus IS NULL OR acctstatus = '' OR acctstatus = 'start')
              AND acctupdatetime < NOW() - INTERVAL '30 minutes'
              AND framedipaddress IS NOT NULL
              AND framedipaddress::text != ''
              AND framedipaddress::text != '0.0.0.0'
          `;
          const staleStartCount = typeof staleStartResult === 'number' ? staleStartResult : 0;
          SELog.info(`Stale-Session-Cleanup: closed ${staleStartCount} stale radacct start row(s) (idle >30min), ${staleStartRows.length} network cleanup(s)`);
          result.staleCleaned += staleStartCount;

          // Also close matching WiFiSession rows
          try {
            await db.$executeRaw`
              UPDATE "WiFiSession"
              SET status = 'disconnected', "endTime" = NOW(), "updatedAt" = NOW()
              WHERE status = 'active'
                AND "updatedAt" < NOW() - INTERVAL '30 minutes'
            `;
          } catch { /* non-fatal */ }
        }
      } catch (err) {
        SELog.warn(`Stale radacct cleanup failed: ${err instanceof Error ? err.message : String(err)}`);
      }

      // ── Step 5c: Expired user session cleanup (always runs) ──
      // Close radacct sessions for users whose validUntil has passed.
      // This catches sessions that the NAS never terminated (e.g., NAS offline, sandbox).
      // Runs OUTSIDE the sessions.length check so it works even with 0 nftables-trackable sessions.
      try {
        // First, get the IPs of expired users so we can release their SNAT assignments
        const expiredIps: string[] = [];
        try {
          const expiredRows = await db.$queryRaw`
            SELECT DISTINCT ra."framedipaddress"::text
            FROM radacct ra
            WHERE ra.acctstoptime IS NULL
              AND (ra.acctstatus IS NULL OR ra.acctstatus = '' OR ra.acctstatus = 'start')
              AND ra."framedipaddress" IS NOT NULL
              AND ra.username IN (
                SELECT wu.username
                FROM "WiFiUser" wu
                WHERE wu."validUntil" < NOW()
                  AND wu.status IN ('active', 'suspended')
              )
          `;
          for (const row of expiredRows) {
            const ip = normalizeIPv4(row.framedipaddress);
            if (ip) expiredIps.push(ip);
          }
        } catch { /* non-fatal — SNAT release is best-effort */ }

        const expiredResult = await db.$executeRaw`
          UPDATE radacct
          SET acctstoptime = NOW(),
              acctterminatecause = 'Session-Timeout',
              acctupdatetime = NOW()
          WHERE acctstoptime IS NULL
            AND (acctstatus IS NULL OR acctstatus = '' OR acctstatus = 'start')
            AND username IN (
              SELECT wu.username
              FROM "WiFiUser" wu
              WHERE wu."validUntil" < NOW()
                AND wu.status IN ('active', 'suspended')
            )
        `;
        const expiredCount = typeof expiredResult === 'number' ? expiredResult : 0;
        if (expiredCount > 0) {
          SELog.info(`Expired user cleanup: closed ${expiredCount} session(s) for users past validUntil`);
          result.staleCleaned += expiredCount;

          // Release SNAT assignments for expired users (fire-and-forget)
          for (const ip of expiredIps) {
            releaseSnatIp(ip, 'user_expired').catch(() => {});
          }
          if (expiredIps.length > 0) {
            SELog.info(`Released SNAT for ${expiredIps.length} expired user IP(s)`);
          }

          // Also deactivate the expired WiFiUser accounts
          const deactivatedResult = await db.$executeRaw`
            UPDATE "WiFiUser"
            SET status = 'inactive', "updatedAt" = NOW()
            WHERE status = 'active'
              AND "validUntil" < NOW()
          `;
          const deactivatedCount = typeof deactivatedResult === 'number' ? deactivatedResult : 0;
          if (deactivatedCount > 0) {
            SELog.info(`Deactivated ${deactivatedCount} expired WiFi user account(s)`);
          }
        }
      } catch (err) {
        SELog.warn(`Expired user cleanup failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    } catch (err) {
      SELog.error(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
      result.errors++;
    }

    // ── Step 7: Archive old interim rows (prevent unbounded table growth) ──
    const archivedRows = await archiveOldInterimRows();
    if (archivedRows > 0) {
      SELog.info(`Archived ${archivedRows} old interim rows (retention: ${INTERIM_RETENTION_HOURS}h)`);
    }

    SELog.recordRunResult(result);
    return result;
  } finally {
    isRunning = false;
  }
}

// ────────────────────────────────────────────────────────────
// Bulk Data Loading Functions
// ────────────────────────────────────────────────────────────

/**
 * Load nftables byte counters into a Map (1 execSync call).
 */
function loadCounterMap(): Map<string, IPByteCount> {
  const counterMap = new Map<string, IPByteCount>();
  if (!nftablesAvailable) return counterMap;
  try {
    const counterData = readAllCounters();
    for (const c of counterData.counts) {
      counterMap.set(c.ip, c);
    }
  } catch { /* non-fatal */ }
  return counterMap;
}

/**
 * Load ALL authenticated IPs from nftables in ONE call.
 * Returns null if set doesn't exist (safe fallback = all authenticated).
 */
function loadAuthenticatedIPs(): Set<string> | null {
  if (!nftablesAvailable) return null;
  try {
    return getAllAuthenticatedIPs();
  } catch {
    return null;
  }
}

/**
 * Extract unique usernames from sessions for bulk policy loading.
 */
function extractUsernames(sessions: ActiveSession[]): string[] {
  const seen = new Set<string>();
  const usernames: string[] = [];
  for (const s of sessions) {
    if (!seen.has(s.username)) {
      seen.add(s.username);
      usernames.push(s.username);
    }
  }
  return usernames;
}

/**
 * BULK load all timeout/data-limit policies for all active users in ONE query.
 *
 * BEFORE: 15,000 individual queries (3 per user × 5,000 users)
 * AFTER:  1 query returning all policies at once
 *
 * Maps username → { sessionTimeout, idleTimeout, dataLimit }
 */
async function bulkLoadUserPolicies(usernames: string[]): Promise<Map<string, UserPolicy>> {
  const policyMap = new Map<string, UserPolicy>();

  if (usernames.length === 0) return policyMap;

  const POLICY_ATTRS = [
    'Session-Timeout',
    'Cryptsk-Idle-Timeout',
    'Idle-Timeout',
    'Cryptsk-Data-Limit',
    'Cryptsk-Total-Limit',
    'Cryptsk-Max-Input-Octets',
    'Cryptsk-Max-Output-Octets',
    'Max-Input-Octets',
    'ChilliSpot-Max-Total-Octets',
    'Acct-Interim-Interval',
  ];

  // ── Source 1: Per-user radreply (session-specific overrides) ──
  try {
    const rows = await db.$queryRaw<Array<{
      username: string;
      attribute: string;
      value: string;
    }>>`
      SELECT username, attribute, value
      FROM radreply
      WHERE username = ANY(${usernames}::text[])
        AND attribute = ANY(${POLICY_ATTRS}::text[])
        AND "isActive" = true
    `;

    for (const row of rows) {
      if (!policyMap.has(row.username)) {
        policyMap.set(row.username, { sessionTimeout: 0, idleTimeout: 0, dataLimit: 0, acctInterimInterval: 0 });
      }
      applyPolicyAttr(policyMap.get(row.username)!, row.attribute, parseInt(row.value, 10) || 0);
    }
  } catch (err) {
    SELog.warn(`Bulk policy load (radreply) error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── Source 2: Group-level radgroupreply (plan defaults) ──
  // Data limits are set in radgroupreply during provisioning, NOT in per-user
  // radreply. The session engine must check both to enforce FUP correctly.
  try {
    const groupRows = await db.$queryRaw<Array<{
      username: string;
      attribute: string;
      value: string;
    }>>`
      SELECT ug.username, gr.attribute, gr.value
      FROM radusergroup ug
      JOIN radgroupreply gr ON gr.groupname = ug.groupname
      WHERE ug.username = ANY(${usernames}::text[])
        AND gr.attribute = ANY(${POLICY_ATTRS}::text[])
    `;

    for (const row of groupRows) {
      if (!policyMap.has(row.username)) {
        policyMap.set(row.username, { sessionTimeout: 0, idleTimeout: 0, dataLimit: 0, acctInterimInterval: 0 });
      }
      // Group-level attrs fill in ONLY if per-user value is still 0
      applyPolicyAttr(policyMap.get(row.username)!, row.attribute, parseInt(row.value, 10) || 0, /* groupLevel */ true);
    }
  } catch (err) {
    SELog.warn(`Bulk policy load (radgroupreply) error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── Source 3: Group-level radgroupcheck (access checks — data limits, session-timeout) ──
  // Cryptsk-Total-Limit is stored in radgroupcheck (not radgroupreply) by the
  // provisioning service. The session engine must also check here to enforce
  // hard data caps. Group-level attrs fill in ONLY if per-user/groupreply value is still 0.
  try {
    const gcRows = await db.$queryRaw<Array<{
      username: string;
      attribute: string;
      value: string;
    }>>`
      SELECT ug.username, gc.attribute, gc.value
      FROM radusergroup ug
      JOIN radgroupcheck gc ON gc.groupname = ug.groupname
      WHERE ug.username = ANY(${usernames}::text[])
        AND gc.attribute = ANY(${POLICY_ATTRS}::text[])
    `;

    for (const row of gcRows) {
      if (!policyMap.has(row.username)) {
        policyMap.set(row.username, { sessionTimeout: 0, idleTimeout: 0, dataLimit: 0, acctInterimInterval: 0 });
      }
      applyPolicyAttr(policyMap.get(row.username)!, row.attribute, parseInt(row.value, 10) || 0, /* groupLevel */ true);
    }
  } catch (err) {
    SELog.warn(`Bulk policy load (radgroupcheck) error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return policyMap;
}

/**
 * BULK load FUP (FairAccessPolicy) data for all active users in ONE query.
 *
 * Joins: username → radusergroup → WiFiPlan → FairAccessPolicy
 * Only loads enabled policies where the plan has a non-null fupPolicyId.
 *
 * Maps username → FupInfo
 */
async function bulkLoadFupPolicies(usernames: string[]): Promise<Map<string, FupInfo>> {
  if (usernames.length === 0) return new Map();
  try {
    // Join: username → radusergroup → WiFiPlan → FairAccessPolicy
    const rows = await db.$queryRaw<Array<{
      username: string;
      fupPolicyId: string;
      fupPolicyName: string;
      dataLimitMb: number;
      dataLimitUnit: string;
      applicableOn: string;
      cycleType: string;
      switchOverBwPolicyId: string | null;
      throttleDownKbps: number;
      throttleUpKbps: number;
      isEnabled: boolean;
    }>>`
      SELECT ug.username, fap.id as "fupPolicyId", fap.name as "fupPolicyName",
             fap."dataLimitMb", fap."dataLimitUnit", fap."applicableOn", fap."cycleType",
             fap."switchOverBwPolicyId", fap."throttleDownKbps", fap."throttleUpKbps",
             fap."isEnabled"
      FROM radusergroup ug
      JOIN "WiFiPlan" p ON ug.groupname LIKE '%' || replace(split_part(p.id::text, '-', 1), '-', '') || '%'
      JOIN "FairAccessPolicy" fap ON fap.id = p."fupPolicyId"
      WHERE ug.username = ANY(${usernames}::text[])
        AND fap."isEnabled" = true
        AND p."fupPolicyId" IS NOT NULL
    `;

    const map = new Map<string, FupInfo>();
    for (const r of rows) {
      const limitBytes = r.dataLimitUnit === 'tb'
        ? r.dataLimitMb * 1024 * 1024 * 1024 * 1024      // TB → bytes
        : r.dataLimitUnit === 'gb'
        ? r.dataLimitMb * 1024 * 1024 * 1024              // GB → bytes
        : r.dataLimitMb * 1024 * 1024;                     // MB → bytes

      map.set(r.username, {
        fupPolicyId: r.fupPolicyId,
        fupPolicyName: r.fupPolicyName,
        dataLimitBytes: limitBytes,
        applicableOn: r.applicableOn as 'total' | 'download' | 'upload',
        cycleType: (r.cycleType || 'daily') as 'daily' | 'weekly' | 'monthly',
        isThrottle: !!r.switchOverBwPolicyId,  // has BW policy = throttle, null = block
        throttleDownKbps: r.throttleDownKbps || 256,
        throttleUpKbps: r.throttleUpKbps || 128,
      });
    }
    return map;
  } catch (err) {
    SELog.warn(`FUP policy load error: ${err instanceof Error ? err.message : String(err)}`);
    return new Map();
  }
}

/**
 * BULK load cumulative FUP cycle usage for all users with FUP policies.
 * Aggregates data across ALL sessions within the current cycle period (daily/weekly/monthly).
 *
 * Returns Map<username, { download: bytes, upload: bytes, total: bytes }>
 */
async function bulkLoadFupCycleUsage(
  fupMap: Map<string, FupInfo>,
): Promise<Map<string, { download: number; upload: number; total: number }>> {
  if (fupMap.size === 0) return new Map();
  try {
    // Group usernames by cycle type to minimise queries
    const byCycle: Record<string, string[]> = {};
    for (const [username, fup] of fupMap) {
      const ct = fup.cycleType || 'daily';
      if (!byCycle[ct]) byCycle[ct] = [];
      byCycle[ct].push(username);
    }

    // Compute cycle start dates in JS (avoids Prisma.raw() issues in tagged templates)
    const now = new Date();
    function cycleStartFor(ct: string): Date {
      if (ct === 'weekly') {
        const d = new Date(now);
        const day = d.getDay();
        const diff = day === 0 ? 6 : day - 1; // Monday as start
        d.setDate(d.getDate() - diff);
        d.setHours(0, 0, 0, 0);
        return d;
      }
      if (ct === 'monthly') {
        return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      }
      // daily (default)
      return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    }

    const result = new Map<string, { download: number; upload: number; total: number }>();

    for (const [cycleType, users] of Object.entries(byCycle)) {
      const cycleStart = cycleStartFor(cycleType);

      // NOTE: RADIUS convention — acctinputoctets = upload, acctoutputoctets = download
    const rows = await db.$queryRaw<Array<{
        username: string;
        download: string;  // SUM(acctoutputoctets) — user download
        upload: string;    // SUM(acctinputoctets) — user upload
      }>>`
        SELECT username,
               COALESCE(SUM(COALESCE(acctoutputoctets, 0)), 0)::text as download,
               COALESCE(SUM(COALESCE(acctinputoctets, 0)), 0)::text as upload
        FROM radacct
        WHERE username = ANY(${users}::text[])
          AND acctstarttime >= ${cycleStart.toISOString()}::timestamptz
        GROUP BY username
      `;

      for (const r of rows) {
        const downloadBytes = BigInt(r.download) || 0n;
        const uploadBytes = BigInt(r.upload) || 0n;
        result.set(r.username, {
          download: Number(downloadBytes),
          upload: Number(uploadBytes),
          total: Number(downloadBytes + uploadBytes),
        });
      }
    }

    // Ensure every FUP user has an entry (even if no radacct rows yet)
    for (const username of fupMap.keys()) {
      if (!result.has(username)) {
        result.set(username, { download: 0, upload: 0, total: 0 });
      }
    }

    SELog.info(`[FUP-Cycle] Loaded cumulative usage for ${result.size} user(s)`);
    return result;
  } catch (err) {
    SELog.warn(`FUP cycle usage load error: ${err instanceof Error ? err.message : String(err)}`);
    // Return zeroed map so we don't break the cycle
    const zeroed = new Map<string, { download: number; upload: number; total: number }>();
    for (const username of fupMap.keys()) {
      zeroed.set(username, { download: 0, upload: 0, total: 0 });
    }
    return zeroed;
  }
}

/**
 * Get the original plan speeds for a user (for unthrottling).
 * First checks WiFiPlan.downloadSpeed/uploadSpeed, then falls back
 * to WISPr-Bandwidth-Max-Down/Up from radgroupreply.
 */
async function getPlanSpeeds(username: string): Promise<{ downloadMbps: number; uploadMbps: number } | null> {
  try {
    const rows = await db.$queryRaw<Array<{ download_speed: number; upload_speed: number }>>`
      SELECT p."downloadSpeed" as download_speed, p."uploadSpeed" as upload_speed
      FROM radusergroup ug
      JOIN "WiFiPlan" p ON ug.groupname LIKE '%' || replace(split_part(p.id::text, '-', 1), '-', '') || '%'
      WHERE ug.username = ${username}
      LIMIT 1
    `;
    if (rows.length > 0 && (rows[0].download_speed > 0 || rows[0].upload_speed > 0)) {
      return { downloadMbps: rows[0].download_speed, uploadMbps: rows[0].upload_speed };
    }
    // Fallback: check radgroupreply
    const grpRows = await db.$queryRaw<Array<{ attribute: string; value: string }>>`
      SELECT gr.attribute, gr.value
      FROM radusergroup ug
      JOIN radgroupreply gr ON gr.groupname = ug.groupname
      WHERE ug.username = ${username}
        AND gr.attribute IN ('WISPr-Bandwidth-Max-Down', 'WISPr-Bandwidth-Max-Up')
    `;
    let dl = 0, ul = 0;
    for (const r of grpRows) {
      if (r.attribute === 'WISPr-Bandwidth-Max-Down') dl = parseInt(r.value, 10) || 0;
      if (r.attribute === 'WISPr-Bandwidth-Max-Up') ul = parseInt(r.value, 10) || 0;
    }
    if (dl > 0 || ul > 0) return { downloadMbps: dl, uploadMbps: ul };
    return null;
  } catch {
    return null;
  }
}

/** Apply a single RADIUS attribute to a UserPolicy object */
function applyPolicyAttr(policy: UserPolicy, attribute: string, val: number, groupLevel = false): void {
  switch (attribute) {
    case 'Session-Timeout':
      if (!groupLevel || policy.sessionTimeout === 0) policy.sessionTimeout = val;
      break;
    case 'Cryptsk-Idle-Timeout':
      if (val > 0) policy.idleTimeout = val;
      break;
    case 'Idle-Timeout':
      if (policy.idleTimeout === 0 && val > 0) policy.idleTimeout = val;
      break;
    case 'Cryptsk-Data-Limit':
    case 'Cryptsk-Total-Limit':
    case 'Cryptsk-Max-Input-Octets':
    case 'Cryptsk-Max-Output-Octets':
    case 'Max-Input-Octets':
    case 'ChilliSpot-Max-Total-Octets':
      // For Cryptsk-Max-Output-Octets, take the MIN of input/output
      // to get the effective per-direction cap.
      // All other attrs: use first non-zero value.
      if (attribute === 'Cryptsk-Max-Output-Octets') {
        if (policy.dataLimit > 0 && val > 0) {
          policy.dataLimit = Math.min(policy.dataLimit, val);
        }
      } else if (policy.dataLimit === 0 && val > 0) {
        policy.dataLimit = val;
      }
      break;
    case 'Acct-Interim-Interval':
      if (!groupLevel || policy.acctInterimInterval === 0) policy.acctInterimInterval = val;
      break;
  }
}

// ────────────────────────────────────────────────────────────
// Internal Functions
// ────────────────────────────────────────────────────────────

async function getActiveSessions(): Promise<ActiveSession[]> {
  const records = await db.$queryRaw<ActiveSession[]>`
    SELECT
      radacctid, acctuniqueid, acctsessionid, username,
      framedipaddress::text AS framedipaddress, callingstationid,
      COALESCE(nasipaddress, '127.0.0.1') as nasipaddress,
      acctstarttime, acctupdatetime,
      COALESCE(acctinputoctets, 0) as acctinputoctets,
      COALESCE(acctoutputoctets, 0) as acctoutputoctets,
      COALESCE(acctsessiontime, 0) as acctsessiontime
    FROM radacct
    WHERE acctstoptime IS NULL
      AND (acctstatus IS NULL OR acctstatus = '' OR acctstatus = 'start')
      AND framedipaddress IS NOT NULL
      AND framedipaddress::text != ''
      AND framedipaddress::text != '0.0.0.0'
    ORDER BY acctstarttime ASC
  `;
  return records;
}

async function checkNftablesAvailability(): Promise<boolean> {
  const now = Date.now();
  if (nftablesAvailable !== null && (now - nftablesCheckedAt) < 300_000) {
    return nftablesAvailable;
  }
  try {
    // Dynamic import to avoid Turbopack tracing child_process at build time
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { execSync } = /*turbopackIgnore: true*/ require('child_process');
    execSync('which nft 2>/dev/null', { encoding: 'utf-8', timeout: 3000 });
    nftablesAvailable = true;
  } catch {
    nftablesAvailable = false;
  }
  nftablesCheckedAt = now;
  return nftablesAvailable;
}

// ────────────────────────────────────────────────────────────
// Disconnect Functions (unchanged — these are per-session and correct)
// ────────────────────────────────────────────────────────────

/**
 * FALLBACK mode: Disconnect a session without nftables.
 * Used when nftables is unavailable (e.g., dev/sandbox environments).
 *
 * Responsibilities:
 * 1. Closes radacct record (sets acctstoptime, final byte counts)
 * 2. Updates WiFiSession status to 'disconnected' or 'terminated'
 * 3. Sends CoA Disconnect-Request via RADIUS API
 *
 * NOTE: WiFiUser cumulative totals are NOT updated in fallback mode.
 */
async function disconnectSessionFallback(
  session: ActiveSession,
  reason: string,
  downloadBytes: number,
  uploadBytes: number
): Promise<void> {
  SELog.info(`[FALLBACK] Disconnecting ${session.username}: ${reason}`);

  await db.$executeRaw`
    UPDATE radacct SET
      acctstoptime = NOW(),
      acctterminatecause = ${reason},
      acctsessiontime = ${Math.floor((Date.now() - safeGetTime(session.acctstarttime)) / 1000)},
      acctinputoctets = ${uploadBytes},
      acctoutputoctets = ${downloadBytes}
    WHERE radacctid = ${session.radacctid} AND acctstoptime IS NULL
  `;

  const sessionTime = Math.floor((Date.now() - safeGetTime(session.acctstarttime)) / 1000);
  const dataUsedBytes = downloadBytes + uploadBytes;
  try {
    const updated = await db.wiFiSession.updateMany({
      where: { username: session.username, status: 'active' },
      data: {
        status: reason === 'Session-Cleanup' ? 'disconnected' : 'terminated',
        endTime: new Date(),
        dataUsed: dataUsedBytes,
        duration: sessionTime,
        updatedAt: new Date(),
      },
    });
    if (updated.count === 0) {
      SELog.warn(`[FALLBACK] No active WiFiSession found for ${session.username} to close`);
    }
  } catch (err) {
    SELog.error(`[FALLBACK] WiFiSession update failed for ${session.username}: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const coaRes = await fetch(`http://127.0.0.1:${process.env.PORT || 3000}/api/wifi/radius`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'coa-disconnect',
        username: session.username,
        nasIp: session.nasipaddress,
        reason,
      }),
    });
    SELog.info(`[FALLBACK] CoA disconnect response for ${session.username}: ${coaRes.status}`);
  } catch (coaErr) {
    SELog.warn(`[FALLBACK] CoA disconnect failed for ${session.username}: ${coaErr instanceof Error ? coaErr.message : String(coaErr)}`);
  }

  lastActivityMap.delete(normalizeIPv4(session.framedipaddress));
}

/**
 * Disconnect an active session with full cleanup.
 *
 * Responsibilities:
 * 1. ✅ Remove IP from nftables (deauthIP) — blocks traffic at firewall level
 * 2. ✅ Run logout script (iptables flush, DHCP release, etc.)
 * 3. ✅ Remove nftables counter rules for the IP
 * 4. ✅ Close radacct START record (sets acctstoptime) + INSERT STOP record
 * 5. ✅ Update WiFiSession status to 'ended'
 * 6. ✅ Increment WiFiUser cumulative totals (totalBytesIn/Out, sessionCount)
 * 7. ✅ Suspend WiFiUser if disconnected due to data limit
 *
 * HIGH-008 FIX (DB-first disconnect order):
 *   When USE_NEW_WIFI_LIFECYCLE is enabled, DB operations happen FIRST inside
 *   a transaction, THEN network cleanup runs. This prevents NAS↔DB state
 *   divergence:
 *     - DB fails → network cleanup skipped → state consistent (both active)
 *     - DB succeeds + network fails → session engine reconciles on next cycle
 *   When disabled, the legacy order (network first, DB second) is preserved.
 *
 * TODO: Consider adding CoA Disconnect-Request for NAS environments where
 *       deauthIP alone may not propagate to upstream APs/controllers.
 */
async function disconnectSession(
  session: ActiveSession,
  reason: string,
  downloadBytes: number,
  uploadBytes: number
): Promise<void> {
  const ip = normalizeIPv4(session.framedipaddress);
  const sessionTime = Math.floor((Date.now() - safeGetTime(session.acctstarttime)) / 1000);

  // Calculate delta for WiFiUser (before any operations)
  const downloadDelta = Math.max(0, downloadBytes - Number(session.acctoutputoctets));
  const uploadDelta = Math.max(0, uploadBytes - Number(session.acctinputoctets));

  // Get local NAS config for Called-Station-Id
  const localNasForStop = await getLocalNasConfigFromFirstProperty();

  if (USE_NEW_WIFI_LIFECYCLE) {
    // ═══════════════════════════════════════════════════════
    // HIGH-008: DB-FIRST disconnect order (compensation pattern)
    // ═══════════════════════════════════════════════════════
    // Step 1: DB transaction — close radacct, WiFiSession, update WiFiUser
    try {
      await db.$transaction(async (tx) => {
        const updateResult = await tx.$executeRaw`
          UPDATE radacct SET
            acctstoptime = NOW(),
            acctinputoctets = ${uploadBytes},
            acctoutputoctets = ${downloadBytes},
            acctsessiontime = ${sessionTime},
            acctterminatecause = ${reason},
            acctupdatetime = NOW()
          WHERE radacctid = ${session.radacctid}
            AND acctstoptime IS NULL
        `;

        const rowsAffected = Number(updateResult);

        await tx.$executeRaw`
          INSERT INTO radacct (
            acctuniqueid, acctsessionid, username,
            nasipaddress, nasporttype, acctstarttime, acctstoptime, acctupdatetime,
            acctauthentic, framedipaddress, acctstatus,
            acctinputoctets, acctoutputoctets, acctsessiontime, acctterminatecause,
            calledstationid, callingstationid, nasidentifier,
            "loginType", createdat, updatedat
          ) SELECT
            COALESCE(NULLIF(${session.acctuniqueid}::text, ''), gen_random_uuid()::text)::uuid, ${session.acctsessionid}, ${session.username},
            '127.0.0.1', 'Wireless-802.11', ${session.acctstarttime}, NOW(), NOW(),
            'PAP', ${ip}, 'stop',
            ${uploadBytes}, ${downloadBytes}, ${sessionTime}, ${reason},
            ${localNasForStop.calledStationId}, ${session.callingstationid}, ${localNasForStop.nasIdentifier},
            COALESCE(r0."loginType", 'portal'), NOW(), NOW()
          FROM (SELECT 1) AS dummy
          LEFT JOIN LATERAL (
            SELECT "loginType" FROM radacct r0
            WHERE r0.acctsessionid = ${session.acctsessionid} AND r0.acctstatus = 'start'
            ORDER BY r0.radacctid ASC LIMIT 1
          ) r0 ON true
        `;

        // ── WiFiSession close — HIGH-022 fix: safe lookup with fallback chain ──
        // NOTE (LOW-1): If the nftables counter was already cleaned up (e.g., by a
        // prior stale-detection cycle or manual flush), downloadBytes/uploadBytes may
        // be zero and the bytes between the last interim-update and the actual
        // disconnect moment are permanently lost from user totals. This is acceptable
        // because: (a) nftables counters persist until explicitly removed, and (b) the
        // C6 delta fix ensures interim-update bytes are never double-counted.
        try {
          const lookup = await lookupWifiSessionForDisconnect({
            username: session.username,
            acctUniqueId: session.acctuniqueid,
            macAddress: session.callingstationid,
            ipAddress: ip,
          }, '[disconnectSession:DB]');
          if (lookup.ambiguous) {
            SELog.warn(`[disconnectSession:DB] AMBIGUOUS WiFiSession for ${session.username} — skipping close`);
          } else if (lookup.session) {
            const dataUsedBytes = downloadBytes + uploadBytes;
            await tx.wiFiSession.update({
              where: { id: lookup.session.id },
              data: { endTime: new Date(), dataUsed: dataUsedBytes, duration: sessionTime, status: 'ended', updatedAt: new Date() },
            });
          }
        } catch { /* non-fatal */ }

        if (rowsAffected > 0) {
          try {
            await tx.wiFiUser.updateMany({
              where: { username: session.username },
              data: {
                totalBytesIn: { increment: uploadDelta },
                totalBytesOut: { increment: downloadDelta },
                sessionCount: { increment: 1 },
                lastAccountingAt: new Date(),
              },
            });
          } catch { /* non-fatal */ }
        }

        if (reason === 'Data-Limit-Exceeded' || reason === 'Quota-Exceeded') {
          try {
            await tx.wiFiUser.updateMany({
              where: { username: session.username },
              data: { status: reason === 'Quota-Exceeded' ? 'quota_exceeded' : 'suspended' },
            });
          } catch { /* non-fatal */ }
        }
      });
      SELog.info(`[HIGH-008] DB transaction OK for disconnect: ${session.username} (${ip})`);
    } catch (dbErr) {
      SELog.error(`[HIGH-008] DB transaction FAILED for ${session.username} — skipping network cleanup: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`);
      return; // Do NOT proceed to network cleanup — state stays consistent
    }

    // Step 2: Network cleanup (best-effort, runs AFTER DB is committed)
    deauthIP(ip);

    try {
      const logoutResult = runLogoutScript({ ip });
      if (logoutResult.success) {
        SELog.info(`disconnectSession: logout.sh OK for ${session.username} (${ip}) in ${logoutResult.durationMs}ms`);
      } else {
        SELog.warn(`disconnectSession: logout.sh FAIL for ${session.username} (${ip}) exit=${logoutResult.exitCode}`);
      }
    } catch (err) {
      SELog.warn(`disconnectSession: logout.sh exception for ${session.username}: ${err instanceof Error ? err.message : String(err)}`);
    }

    removeUserCounter(ip);
    lastActivityMap.delete(ip);

    // Release SNAT assignment (if any) — fire-and-forget
    releaseSnatIp(ip, reason).catch(() => {});

    // Clean up per-user RADIUS overrides
    await cleanupPerUserRadiusOverrides(session.username, '[disconnectSession]');

    SELog.info(
      `Disconnected: ${session.username} (${ip}) — reason: ${reason}, duration: ${sessionTime}s, data: ${Math.round((downloadBytes + uploadBytes) / (1024 * 1024))}MB`
    );
  } else {
    // ═══════════════════════════════════════════════════════
    // LEGACY: Network-first, DB-second (original order)
    // ═══════════════════════════════════════════════════════

    // 1. Remove from nftables
    deauthIP(ip);

    // 2. Call logout script
    try {
      const logoutResult = runLogoutScript({ ip });
      if (logoutResult.success) {
        SELog.info(`disconnectSession: logout.sh OK for ${session.username} (${ip}) in ${logoutResult.durationMs}ms`);
      } else {
        SELog.warn(`disconnectSession: logout.sh FAIL for ${session.username} (${ip}) exit=${logoutResult.exitCode}`);
      }
    } catch (err) {
      SELog.warn(`disconnectSession: logout.sh exception for ${session.username}: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 3. Remove counter rules
    removeUserCounter(ip);

    // 4. Clean up idle tracking
    lastActivityMap.delete(ip);

    // 4b. Release SNAT assignment (if any) — fire-and-forget
    releaseSnatIp(ip, reason).catch(() => {});

    // 6. DB operations in transaction
    await db.$transaction(async (tx) => {
      const updateResult = await tx.$executeRaw`
        UPDATE radacct SET
          acctstoptime = NOW(),
          acctinputoctets = ${uploadBytes},
          acctoutputoctets = ${downloadBytes},
          acctsessiontime = ${sessionTime},
          acctterminatecause = ${reason},
          acctupdatetime = NOW()
        WHERE radacctid = ${session.radacctid}
          AND acctstoptime IS NULL
      `;

      const rowsAffected = Number(updateResult);

      await tx.$executeRaw`
        INSERT INTO radacct (
          acctuniqueid, acctsessionid, username,
          nasipaddress, nasporttype, acctstarttime, acctstoptime, acctupdatetime,
          acctauthentic, framedipaddress, acctstatus,
          acctinputoctets, acctoutputoctets, acctsessiontime, acctterminatecause,
          calledstationid, callingstationid, nasidentifier,
          "loginType", createdat, updatedat
        ) SELECT
          gen_random_uuid(), ${session.acctsessionid}, ${session.username},
          '127.0.0.1', 'Wireless-802.11', ${session.acctstarttime}, NOW(), NOW(),
          'PAP', ${ip}, 'stop',
          ${uploadBytes}, ${downloadBytes}, ${sessionTime}, ${reason},
          ${localNasForStop.calledStationId}, ${session.callingstationid}, ${localNasForStop.nasIdentifier},
          COALESCE(r0."loginType", 'portal'), NOW(), NOW()
        FROM (SELECT 1) AS dummy
        LEFT JOIN LATERAL (
          SELECT "loginType" FROM radacct r0
          WHERE r0.acctsessionid = ${session.acctsessionid} AND r0.acctstatus = 'start'
          ORDER BY r0.radacctid ASC LIMIT 1
        ) r0 ON true
      `;

      try {
        // ── WiFiSession close — HIGH-022 fix: safe lookup with fallback chain ──
        const useNewLifecycle = isNewWifiLifecycleEnabled();
        let wifiSessionId: string | null = null;

        if (useNewLifecycle) {
          const lookup = await lookupWifiSessionForDisconnect({
            username: session.username,
            acctUniqueId: session.acctuniqueid,
            macAddress: session.callingstationid,
            ipAddress: ip,
          }, '[disconnectSession]');
          if (lookup.ambiguous) {
            SELog.warn(
              `disconnectSession: AMBIGUOUS WiFiSession lookup for ${session.username} — ` +
              `skipping WiFiSession close to avoid closing wrong session. radacct closed successfully.`
            );
          } else if (lookup.session) {
            wifiSessionId = lookup.session.id;
            SELog.info(`disconnectSession: WiFiSession ${lookup.session.id} matched via ${lookup.matchMethod}`);
          }
        } else {
          // Legacy path (when USE_NEW_WIFI_LIFECYCLE is not set)
          const wifiSession = await tx.wiFiSession.findFirst({
            where: { macAddress: session.callingstationid || 'unknown', status: 'active' },
          });
          if (wifiSession) {
            wifiSessionId = wifiSession.id;
          }
        }

        if (wifiSessionId) {
          const dataUsedBytes = downloadBytes + uploadBytes;
          await tx.wiFiSession.update({
            where: { id: wifiSessionId },
            data: { endTime: new Date(), dataUsed: dataUsedBytes, duration: sessionTime, status: 'ended', updatedAt: new Date() },
          });
        }
      } catch { /* non-fatal */ }

      if (rowsAffected > 0) {
        try {
          await tx.wiFiUser.updateMany({
            where: { username: session.username },
            data: {
              totalBytesIn: { increment: uploadDelta },
              totalBytesOut: { increment: downloadDelta },
              sessionCount: { increment: 1 },
              lastAccountingAt: new Date(),
            },
          });
        } catch { /* non-fatal */ }
      }

      if (reason === 'Data-Limit-Exceeded' || reason === 'Quota-Exceeded') {
        try {
          await tx.wiFiUser.updateMany({
            where: { username: session.username },
            data: { status: reason === 'Quota-Exceeded' ? 'quota_exceeded' : 'suspended' },
          });
        } catch { /* non-fatal */ }
      }
    });

    // 7. Clean up per-user RADIUS overrides (Session-Timeout, bandwidth, data caps)
    // On disconnect, per-user radreply entries become stale and shadow group policy.
    await cleanupPerUserRadiusOverrides(session.username, '[disconnectSession]');

    SELog.info(
      `Disconnected: ${session.username} (${ip}) — reason: ${reason}, duration: ${sessionTime}s, data: ${Math.round((downloadBytes + uploadBytes) / (1024 * 1024))}MB`
    );
  }
}

/**
 * Close a stale session whose IP is no longer in the nftables authenticated set.
 * This means the client has left the network or was deauthenticated externally.
 *
 * Responsibilities:
 * 1. ✅ Run logout script (best-effort cleanup)
 * 2. ✅ Remove nftables counter rules (if any remain)
 * 3. ✅ Close radacct record (sets acctstoptime with final byte counts)
 * 4. ✅ Update WiFiSession status to 'ended'
 *
 * NOTE: deauthIP is intentionally skipped — the IP is already absent
 * from nftables, which is why this session was detected as stale.
 * NOTE: WiFiUser cumulative totals are NOT updated for stale sessions
 *       (the session may have been externally closed, so deltas are unreliable).
 */
async function closeSession(
  session: ActiveSession,
  reason: string,
  downloadBytes: number,
  uploadBytes: number
): Promise<void> {
  const ip = normalizeIPv4(session.framedipaddress);
  const sessionTime = Math.floor((Date.now() - safeGetTime(session.acctstarttime)) / 1000);

  try {
    const logoutResult = runLogoutScript({ ip });
    if (logoutResult.success) {
      SELog.info(`closeSession: logout.sh OK for ${session.username} (${ip}) in ${logoutResult.durationMs}ms`);
    } else {
      SELog.warn(`closeSession: logout.sh FAIL for ${session.username} (${ip}) exit=${logoutResult.exitCode}`);
    }
  } catch (err) {
    SELog.warn(`closeSession: logout.sh exception for ${session.username}: ${err instanceof Error ? err.message : String(err)}`);
  }

  removeUserCounter(ip);
  lastActivityMap.delete(ip);

  // Release SNAT assignment (if any) — fire-and-forget
  releaseSnatIp(ip, reason).catch(() => {});

  await db.$executeRaw`
    UPDATE radacct SET
      acctstoptime = NOW(),
      acctinputoctets = COALESCE(acctinputoctets, ${uploadBytes}),
      acctoutputoctets = COALESCE(acctoutputoctets, ${downloadBytes}),
      acctsessiontime = ${sessionTime},
      acctterminatecause = ${reason},
      acctupdatetime = NOW()
    WHERE radacctid = ${session.radacctid}
      AND acctstoptime IS NULL
  `;

  try {
    // ── WiFiSession close — HIGH-022 fix: safe lookup with fallback chain ──
    // See disconnectSession() for detailed explanation of the fix.
    const useNewLifecycle = isNewWifiLifecycleEnabled();
    let wifiSessionId: string | null = null;

    if (useNewLifecycle) {
      const lookup = await lookupWifiSessionForDisconnect({
        username: session.username,
        acctUniqueId: session.acctuniqueid,
        macAddress: session.callingstationid,
        ipAddress: ip,
      }, '[closeSession]');
      if (lookup.ambiguous) {
        SELog.warn(
          `closeSession: AMBIGUOUS WiFiSession lookup for ${session.username} — ` +
          `skipping WiFiSession close to avoid closing wrong session. radacct closed successfully.`
        );
      } else if (lookup.session) {
        wifiSessionId = lookup.session.id;
      }
    } else {
      // Legacy path (when USE_NEW_WIFI_LIFECYCLE is not set)
      const wifiSession = await db.wiFiSession.findFirst({
        where: { macAddress: session.callingstationid || 'unknown', status: 'active' },
      });
      if (wifiSession) {
        wifiSessionId = wifiSession.id;
      }
    }

    if (wifiSessionId) {
      await db.wiFiSession.update({
        where: { id: wifiSessionId },
        data: { endTime: new Date(), duration: sessionTime, status: 'ended', updatedAt: new Date() },
      });
    }
  } catch { /* non-fatal */ }

  // Clean up per-user RADIUS overrides (stale session data)
  await cleanupPerUserRadiusOverrides(session.username, '[closeSession]');
}

// ────────────────────────────────────────────────────────────
// Interim Row Archival
// ────────────────────────────────────────────────────────────

/**
 * Archive old interim rows to prevent unbounded table growth.
 * Only keeps interim rows from the last INTERIM_RETENTION_HOURS hours.
 * Older interim rows are deleted — START and STOP rows are never touched.
 *
 * Background: 5,000 users × 1 interim/60s = 7.2M rows/day if never cleaned.
 * With 6h retention: ~1.8M rows steady state (down from unbounded growth).
 */
async function archiveOldInterimRows(): Promise<number> {
  const cutoffTime = new Date(Date.now() - INTERIM_RETENTION_HOURS * 60 * 60 * 1000);

  try {
    const result = await db.$executeRaw(Prisma.sql`
      DELETE FROM radacct
      WHERE acctstatus = 'interim-update'
        AND acctstarttime < ${cutoffTime}::timestamptz
    `);

    return typeof result === 'number' ? result : Number(result) || 0;
  } catch (err) {
    console.warn('[SessionEngine] Interim archival warning:', err instanceof Error ? err.message : err);
    return 0;
  }
}

// ────────────────────────────────────────────────────────────
// Public Status / Diagnostic Functions
// ────────────────────────────────────────────────────────────

export async function getSessionEngineStatus(): Promise<{
  activeSessions: number;
  totalDownloadMB: number;
  totalUploadMB: number;
  counterIPs: number;
  idleTrackingEntries: number;
  lastRun: Date | null;
}> {
  const activeSessions = await db.radAcct.count({
    where: { acctstoptime: null as any },
  });

  const totals = await db.radAcct.aggregate({
    where: { acctstoptime: null as any },
    _sum: { acctinputoctets: true, acctoutputoctets: true },
  });

  const counterData = readAllCounters();
  const logStatus = await SELog.getStatus({ activeSessions, counterIPs: counterData.counts.length });

  return {
    activeSessions,
    totalDownloadMB: Math.round((totals._sum.acctoutputoctets || 0) / (1024 * 1024)),
    totalUploadMB: Math.round((totals._sum.acctinputoctets || 0) / (1024 * 1024)),
    counterIPs: counterData.counts.length,
    idleTrackingEntries: lastActivityMap.size,
    lastRun: logStatus.lastRunAt ? new Date(logStatus.lastRunAt) : null,
  };
}

export async function getSessionEngineDiagnostics(): Promise<SELog.SessionEngineStatus> {
  const activeSessions = await db.radAcct.count({
    where: { acctstoptime: null as any },
  });
  const counterData = readAllCounters();
  return await SELog.getStatus({ activeSessions, counterIPs: counterData.counts.length });
}

export async function forceDisconnect(params: {
  username?: string;
  ip?: string;
  reason?: string;
}): Promise<{ success: boolean; message?: string }> {
  const reason = params.reason || 'Admin-Request';

  const session = await db.$queryRaw<ActiveSession[]>`
    SELECT * FROM radacct
    WHERE acctstoptime IS NULL
      AND (username = ${params.username || ''}${params.ip ? Prisma.sql` OR framedipaddress = ${params.ip}` : Prisma.sql``})
    LIMIT 1
  `;

  if (!session || !Array.isArray(session) || session.length === 0) {
    return { success: false, message: 'No active session found' };
  }

  const activeSession = session[0];
  const counterData = readAllCounters();
  const counterEntry = params.ip ? counterData.counts.find(c => c.ip === params.ip) : null;
  const downloadBytes = counterEntry ? counterEntry.downloadBytes : Number(activeSession.acctoutputoctets);
  const uploadBytes = counterEntry ? counterEntry.uploadBytes : Number(activeSession.acctinputoctets);

  await disconnectSession(activeSession, reason, downloadBytes, uploadBytes);

  return { success: true, message: `Session disconnected: ${activeSession.username}` };
}

// ────────────────────────────────────────────────────────────
// HIGH-008: NAS↔DB State Reconciliation
// ────────────────────────────────────────────────────────────

/**
 * Result of a NAS↔DB reconciliation check.
 */
export interface ReconciliationResult {
  /** Sessions in DB (radacct active) but NOT in NAS (nftables) — need cleanup */
  dbOnlySessions: Array<{ username: string; ip: string; reason: string }>;
  /** IPs in NAS (nftables authenticated) but NOT in DB — orphaned network state */
  nasOnlyIps: Array<{ ip: string }>;
  /** Total DB active sessions checked */
  dbActiveCount: number;
  /** Total NAS authenticated IPs checked */
  nasAuthCount: number;
  /** Number of DB-only sessions auto-repaired */
  repaired: number;
  /** Number of NAS-only IPs cleaned up */
  nasCleaned: number;
  /** Errors encountered */
  errors: number;
}

/**
 * Reconcile NAS (nftables) and DB (radacct) session state.
 *
 * HIGH-008: This function detects and repairs state divergence between
 * the Network Access Server (nftables authenticated set + counters)
 * and the database (radacct active sessions).
 *
 * Two categories of divergence are detected:
 *
 *   1. **DB-only sessions**: radacct shows active, but the IP is NOT in
 *      nftables authenticated set. This means:
 *      - The device disconnected but RADIUS never sent Accounting-Stop
 *      - A disconnect request partially failed (network OK, DB failed)
 *      - The device was deauthenticated externally (AP reboot, etc.)
 *      → FIX: Close the radacct record + update WiFiSession status
 *
 *   2. **NAS-only IPs**: IP is in nftables authenticated set, but radacct
 *      shows no active session. This means:
 *      - A DB write failed during disconnect (network cleanup ran, DB didn't)
 *      - An accounting record was manually deleted or corrupted
 *      → FIX: Remove IP from nftables + deauth + cleanup counters
 *
 * This function is designed to be called periodically by the session
 * engine cycle or on-demand for diagnostics.
 *
 * @returns ReconciliationResult with details of divergences found and repaired
 */
export async function reconcileSessionState(): Promise<ReconciliationResult> {
  const result: ReconciliationResult = {
    dbOnlySessions: [],
    nasOnlyIps: [],
    dbActiveCount: 0,
    nasAuthCount: 0,
    repaired: 0,
    nasCleaned: 0,
    errors: 0,
  };

  if (!USE_NEW_WIFI_LIFECYCLE) {
    SELog.info('[Reconcile] HIGH-008 reconciliation skipped (USE_NEW_WIFI_LIFECYCLE not enabled)');
    return result;
  }

  SELog.info('[Reconcile] HIGH-008: Starting NAS↔DB state reconciliation');

  try {
    // ── Step 1: Get DB active sessions (radacct) ──
    const dbSessions = await db.$queryRaw<Array<{
      username: string;
      framedipaddress: string;
      radacctid: string;
      acctuniqueid: string;
      callingstationid: string;
      acctstarttime: Date;
    }>>`
      SELECT username, framedipaddress::text AS framedipaddress, radacctid::text, acctuniqueid, callingstationid, acctstarttime
      FROM radacct
      WHERE acctstoptime IS NULL
        AND (acctstatus IS NULL OR acctstatus = '' OR acctstatus = 'start')
        AND framedipaddress IS NOT NULL
        AND framedipaddress::text != ''
        AND framedipaddress::text != '0.0.0.0'
    `;
    result.dbActiveCount = dbSessions.length;

    // Build set of DB IPs
    const dbIpSet = new Set<string>();
    for (const s of dbSessions) {
      const ip = normalizeIPv4(s.framedipaddress);
      if (ip) dbIpSet.add(ip);
    }

    // ── Step 2: Get NAS authenticated IPs (nftables) ──
    let nasIpSet: Set<string> | null = null;
    if (nftablesAvailable && doesAuthenticatedSetExist()) {
      try {
        const authIPs = getAllAuthenticatedIPs();
        if (authIPs) {
          nasIpSet = new Set(Array.from(authIPs).map(ip => normalizeIPv4(ip)));
          result.nasAuthCount = nasIpSet.size;
        }
      } catch (err) {
        SELog.warn(`[Reconcile] Failed to read nftables authenticated IPs: ${err instanceof Error ? err.message : String(err)}`);
        // If nftables unavailable, we can only do partial reconciliation (DB-only check)
      }
    }

    // ── Step 3: Detect DB-only sessions (in DB but NOT in NAS) ──
    for (const session of dbSessions) {
      const ip = normalizeIPv4(session.framedipaddress);
      if (!ip) continue;

      if (nasIpSet && !nasIpSet.has(ip)) {
        // GRACE PERIOD: Same as main cycle stale detection.
        // Don't repair sessions that were just created — the login
        // script may still be running for them.
        const sessionAgeMs = Date.now() - new Date(session.acctstarttime).getTime();
        const RECONCILE_GRACE_MS = 3 * 60 * 1000; // 3 minutes
        if (sessionAgeMs < RECONCILE_GRACE_MS) {
          SELog.info(
            `[Reconcile-Grace] SKIP ${session.username} (${ip}): ` +
            `session age ${Math.round(sessionAgeMs / 1000)}s < ${RECONCILE_GRACE_MS / 1000}s grace period`
          );
          continue;
        }

        // This IP is active in DB but NOT in nftables
        result.dbOnlySessions.push({
          username: session.username,
          ip,
          reason: 'DB-active but NAS-missing',
        });

        SELog.warn(
          `[Reconcile] DB-only session: ${session.username} (${ip}) age=${Math.round(sessionAgeMs / 1000)}s — auto-closing`
        );

        // Auto-repair: close the orphaned DB session
        try {
          await db.$transaction(async (tx) => {
            // Close radacct
            await tx.$executeRaw`
              UPDATE radacct SET
                acctstoptime = NOW(),
                acctterminatecause = 'Reconciliation-DB-Only',
                acctupdatetime = NOW()
              WHERE radacctid = ${session.radacctid}::bigint
                AND acctstoptime IS NULL
            `;

            // Close WiFiSession if linked
            const lookup = await lookupWifiSessionForDisconnect({
              username: session.username,
              acctUniqueId: session.acctuniqueid,
              macAddress: session.callingstationid,
              ipAddress: ip,
            }, '[Reconcile:DB-Only]');

            if (lookup.session && !lookup.ambiguous) {
              await tx.wiFiSession.update({
                where: { id: lookup.session.id },
                data: {
                  status: 'disconnected',
                  endTime: new Date(),
                  updatedAt: new Date(),
                },
              });
            }
          });
          result.repaired++;
          SELog.info(`[Reconcile] Repaired DB-only session: ${session.username} (${ip}) — radacct closed`);
        } catch (err) {
          result.errors++;
          SELog.error(`[Reconcile] Failed to repair DB-only session ${session.username} (${ip}): ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    // ── Step 4: Detect NAS-only IPs (in NAS but NOT in DB) ──
    if (nasIpSet) {
      for (const ip of nasIpSet) {
        if (!dbIpSet.has(ip)) {
          // This IP is in nftables but NOT in radacct — orphaned network state
          result.nasOnlyIps.push({ ip });

          // Auto-repair: remove from nftables + cleanup
          try {
            deauthIP(ip);
            removeUserCounter(ip);
            lastActivityMap.delete(ip);
            result.nasCleaned++;
            SELog.info(`[Reconcile] Cleaned NAS-only IP: ${ip} — removed from nftables`);
          } catch (err) {
            result.errors++;
            SELog.error(`[Reconcile] Failed to clean NAS-only IP ${ip}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }
    }

    SELog.info(
      `[Reconcile] Complete: ${result.dbActiveCount} DB active, ${result.nasAuthCount} NAS authed, ` +
      `${result.dbOnlySessions.length} DB-only (repaired ${result.repaired}), ` +
      `${result.nasOnlyIps.length} NAS-only (cleaned ${result.nasCleaned}), ` +
      `${result.errors} errors`
    );
  } catch (err) {
    result.errors++;
    SELog.error(`[Reconcile] Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return result;
}
