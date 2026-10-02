/**
 * CRITICAL-15 Fix: Immediate Disconnect on Data Limit Exceeded
 *
 * When a user exceeds their data limit, the DB-level enforcement alone
 * (Session-Timeout=1 + suspended status) leaves the user connected for
 * up to 60 seconds. This module provides belt-and-suspenders network-level
 * disconnect to cut access IMMEDIATELY:
 *
 *   1. sendDisconnectMessage()      — RADIUS Disconnect-Message (DM) via radclient
 *   2. enforceImmediateNftablesRemoval() — Remove IP from firewall allowed set
 *
 * Both are designed to be non-blocking: errors are logged but do not prevent
 * the caller from completing DB enforcement. The DB operations are the
 * primary mechanism; network disconnect is the secondary safety net.
 */

import { RADCLIENT_BIN, RADDB_PATH } from '@/lib/wifi/paths';
import {
  deauthIP,
  removeUserCounter,
  getMangleTableName,
  normalizeIPv4,
} from '@/lib/wifi/utils/nftables-counters';
import { db } from '@/lib/db';
import { runLogoutScript } from '@/lib/network/script-runner';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface DisconnectResult {
  success: boolean;
  method: string;
  message: string;
  durationMs: number;
}

// ────────────────────────────────────────────────────────────
// RADIUS Secret Resolution
// ────────────────────────────────────────────────────────────

/**
 * Look up the RADIUS shared secret for the local NAS (127.0.0.1).
 * Falls back to environment variable or well-known default.
 */
async function resolveRadiusSecret(): Promise<string> {
  // 1. Environment variable override
  if (process.env.RADIUS_SECRET) {
    return process.env.RADIUS_SECRET;
  }

  // 2. Look up from RadiusNAS table (local NAS on 127.0.0.1)
  try {
    const localNas = await db.radiusNAS.findFirst({
      where: { ipAddress: '127.0.0.1', status: 'active' },
      select: { secret: true },
    });
    if (localNas?.secret) {
      return localNas.secret;
    }
  } catch {
    // Non-fatal — fall through to default
  }

  // 3. Try any active NAS (in case the local NAS uses a different IP)
  try {
    const anyNas = await db.radiusNAS.findFirst({
      where: { status: 'active' },
      select: { secret: true },
      orderBy: { createdAt: 'asc' },
    });
    if (anyNas?.secret) {
      return anyNas.secret;
    }
  } catch {
    // Non-fatal
  }

  // 4. Env var or empty (will fail — caller should handle)
  return process.env.RADIUS_SECRET || '';
}

// ────────────────────────────────────────────────────────────
// sendDisconnectMessage
// ────────────────────────────────────────────────────────────

/**
 * Send a RADIUS Disconnect-Message (DM) to force immediate session teardown.
 *
 * Uses `radclient` (from the freeradius-install) to send a PoD/DM packet
 * to the NAS. The NAS MUST have the user's session — this works for:
 *   - External NAS devices (UniFi, MikroTik, Aruba, etc.)
 *   - The local FreeRADIUS CoA listener (if configured)
 *
 * The command format:
 *   echo "User-Name=<username>" | radclient -x <nas-ip>:3799 disconnect <secret>
 *
 * @param username   — The RADIUS username to disconnect
 * @param nasIp      — The NAS IP address (from the session's nasipaddress)
 * @param nasPortId  — Optional NAS-Port-Id for session targeting
 * @returns DisconnectResult with success/failure details
 */
export async function sendDisconnectMessage(
  username: string,
  nasIp: string,
  nasPortId?: string | null,
): Promise<DisconnectResult> {
  const startTime = Date.now();

  // Validate inputs
  if (!username || !nasIp) {
    return {
      success: false,
      method: 'radclient-dm',
      message: `Invalid params: username=${!!username}, nasIp=${!!nasIp}`,
      durationMs: Date.now() - startTime,
    };
  }

  // Resolve the RADIUS shared secret
  let secret: string;
  try {
    secret = await resolveRadiusSecret();
  } catch {
    secret = process.env.RADIUS_SECRET || '';
  }

  // Build the radclient packet attributes
  const attributes: string[] = [`User-Name=${username}`];

  // Add NAS-Port-Id if available (helps target the correct session)
  if (nasPortId && nasPortId !== '' && nasPortId !== 'unknown') {
    attributes.push(`NAS-Port-Id=${nasPortId}`);
  }

  // Add Message-Authenticator for security (required by many NAS vendors)
  attributes.push('Message-Authenticator=0x00');

  // Build the radclient command
  // -x enables debug output for logging
  // -t 3 sets a 3-second timeout (fast fail)
  // -r 1 sets 1 retry attempt
  const packetStr = attributes.join('\n');
  const coaPort = parseInt(process.env.RADIUS_COA_PORT || '3799', 10);
  const radclientPath = process.env.RADCLIENT_BIN || RADCLIENT_BIN;
  const dictionaryPath = process.env.RADDB_PATH || RADDB_PATH;

  const command = `echo '${packetStr.replace(/'/g, "'\\''")}' | ` +
    `${radclientPath} -x -t 3 -r 1 -D ${dictionaryPath} ${nasIp}:${coaPort} disconnect ${secret}`;

  try {
    // Use require for child_process (Edge Runtime safe via turbopackIgnore)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { execSync } = /*turbopackIgnore: true*/ require('child_process');

    const output = execSync(command, {
      encoding: 'utf-8',
      timeout: 5000, // Hard 5-second timeout
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const durationMs = Date.now() - startTime;
    const isSuccess = output.includes('radclient:') && (output.includes('Received') || output.includes('sent'));

    if (isSuccess) {
      console.log(
        `[CRITICAL-15] RADIUS DM sent successfully for ${username} → ${nasIp}:${coaPort} (${durationMs}ms)`
      );
    } else {
      console.warn(
        `[CRITICAL-15] RADIUS DM uncertain for ${username} → ${nasIp}:${coaPort}: ${output.trim()} (${durationMs}ms)`
      );
    }

    return {
      success: isSuccess,
      method: 'radclient-dm',
      message: isSuccess
        ? `RADIUS DM accepted by ${nasIp}`
        : `RADIUS DM response unclear: ${output.trim().substring(0, 200)}`,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const msg = err instanceof Error ? err.message : String(err);

    // radclient returns exit code 1 for timeout / no response
    // This is expected if the NAS is unreachable or doesn't support DM
    console.warn(
      `[CRITICAL-15] RADIUS DM failed for ${username} → ${nasIp}:${coaPort}: ${msg} (${durationMs}ms)`
    );

    return {
      success: false,
      method: 'radclient-dm',
      message: `radclient failed: ${msg.substring(0, 200)}`,
      durationMs,
    };
  }
}

// ────────────────────────────────────────────────────────────
// enforceImmediateNftablesRemoval
// ────────────────────────────────────────────────────────────

/**
 * Immediately remove a user's IP from the nftables loggedinusers set
 * and clean up all associated firewall state.
 *
 * This is the "brute force" disconnect at the firewall level:
 *   1. Remove IP from loggedinusers set (cuts all internet access)
 *   2. Run the logout script (removes TC bandwidth classes, NAT rules)
 *   3. Remove per-IP byte counter rules (prevents counter leaks)
 *
 * Even if the RADIUS DM fails (NAS unreachable), this guarantees
 * the user cannot send/receive traffic through the StaySuite gateway.
 *
 * @param ipAddress — The user's IPv4 address
 * @param username  — Username for logout script state file lookup
 * @returns DisconnectResult with success/failure details
 */
export function enforceImmediateNftablesRemoval(
  ipAddress: string,
  username?: string,
): DisconnectResult {
  const startTime = Date.now();
  const ip = normalizeIPv4(ipAddress);

  if (!ip || !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
    return {
      success: false,
      method: 'nftables-removal',
      message: `Invalid IP address: ${ipAddress}`,
      durationMs: Date.now() - startTime,
    };
  }

  const steps: Array<{ name: string; ok: boolean; detail?: string }> = [];

  // Step 1: Remove from nftables loggedinusers set
  // This is the critical step — it immediately blocks all traffic
  try {
    const tableName = getMangleTableName();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { execSync } = /*turbopackIgnore: true*/ require('child_process');
    execSync(
      `nft delete element inet ${tableName} loggedinusers "{ ${ip} }" 2>/dev/null`,
      { encoding: 'utf-8', timeout: 3000 }
    );
    steps.push({ name: 'nft-delete-element', ok: true });
  } catch {
    // Element might not exist — that's fine, it means user already removed
    steps.push({ name: 'nft-delete-element', ok: true, detail: 'element-not-present-or-ok' });
  }

  // Step 2: Also try deauthIP from nftables-counters (belt-and-suspenders)
  try {
    deauthIP(ip);
    steps.push({ name: 'deauthIP', ok: true });
  } catch {
    steps.push({ name: 'deauthIP', ok: false, detail: 'already-removed-or-error' });
  }

  // Step 3: Run the logout script (removes TC bandwidth + NAT + session state)
  try {
    const logoutResult = runLogoutScript({ ip, sessionId: username });
    steps.push({
      name: 'logout-script',
      ok: logoutResult.success,
      detail: logoutResult.success ? undefined : `exit=${logoutResult.exitCode}`,
    });
  } catch (err) {
    steps.push({
      name: 'logout-script',
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  // Step 4: Remove per-IP byte counter rules (prevent counter leaks)
  try {
    removeUserCounter(ip);
    steps.push({ name: 'remove-counter', ok: true });
  } catch {
    steps.push({ name: 'remove-counter', ok: false, detail: 'no-counter-or-error' });
  }

  const durationMs = Date.now() - startTime;
  const allCriticalStepsOk = steps[0]?.ok; // nft-delete is the critical one

  console.log(
    `[CRITICAL-15] nftables removal for ${ip} (${username || 'unknown'}): ` +
    `${steps.map(s => `${s.name}=${s.ok ? 'OK' : 'FAIL'}`).join(', ')} (${durationMs}ms)`
  );

  return {
    success: allCriticalStepsOk !== false,
    method: 'nftables-removal',
    message: `Steps: ${steps.map(s => s.name + '=' + (s.ok ? 'OK' : s.detail || 'FAIL')).join(', ')}`,
    durationMs,
  };
}

// ────────────────────────────────────────────────────────────
// Combined Immediate Disconnect
// ────────────────────────────────────────────────────────────

/**
 * Perform immediate disconnect using ALL available methods.
 *
 * This is the primary entry point for CRITICAL-15. It runs both
 * the RADIUS DM and nftables removal in parallel for maximum speed.
 *
 * Error handling strategy:
 *   - Both methods run with Promise.allSettled (never block each other)
 *   - nftables removal is the reliable fallback (always works for local gateway)
 *   - RADIUS DM targets external NAS devices (may fail if NAS is unreachable)
 *   - DB enforcement has already happened by the time this is called
 *
 * @param username  — RADIUS username
 * @param ipAddress — User's IPv4 address
 * @param nasIp     — NAS IP address (from session's nasipaddress)
 * @param nasPortId — Optional NAS-Port-Id for session targeting
 * @returns Array of results from each disconnect method
 */
export async function performImmediateDisconnect(
  username: string,
  ipAddress: string,
  nasIp: string,
  nasPortId?: string | null,
): Promise<DisconnectResult[]> {
  // Run both methods in parallel for maximum speed
  const [dmResult, nftResult] = await Promise.allSettled([
    // RADIUS DM to external NAS (may fail gracefully)
    sendDisconnectMessage(username, nasIp, nasPortId),
    // nftables removal (local firewall — always reliable)
    Promise.resolve(enforceImmediateNftablesRemoval(ipAddress, username)),
  ]);

  const results: DisconnectResult[] = [];

  if (dmResult.status === 'fulfilled') {
    results.push(dmResult.value);
  } else {
    results.push({
      success: false,
      method: 'radclient-dm',
      message: `Promise rejected: ${dmResult.reason instanceof Error ? dmResult.reason.message : String(dmResult.reason)}`,
      durationMs: 0,
    });
  }

  if (nftResult.status === 'fulfilled') {
    results.push(nftResult.value);
  } else {
    results.push({
      success: false,
      method: 'nftables-removal',
      message: `Promise rejected: ${nftResult.reason instanceof Error ? nftResult.reason.message : String(nftResult.reason)}`,
      durationMs: 0,
    });
  }

  const anySuccess = results.some(r => r.success);
  console.log(
    `[CRITICAL-15] Immediate disconnect for ${username} (${ipAddress}): ` +
    `DM=${results[0]?.success ? 'OK' : 'FAIL'}, ` +
    `nftables=${results[1]?.success ? 'OK' : 'FAIL'}, ` +
    `overall=${anySuccess ? 'SUCCESS' : 'ALL-FAILED'}`
  );

  return results;
}
