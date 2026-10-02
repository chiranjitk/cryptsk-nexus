/**
 * nftables Per-IP Traffic Counter Helper
 *
 * Reads/writes byte counters from nftables "staysuite_count" table.
 * Each authenticated user gets two counter rules:
 *   - user_in_<ip>:  download bytes (packets destined TO user IP)
 *   - user_out_<ip>: upload bytes (packets FROM user IP)
 *
 * The Session Engine calls these functions every 60s to:
 *   1. Read counters → calculate deltas
 *   2. Write interim-update to radacct
 *   3. Enforce session/idle/data-limit policies
 */

// Node.js-only modules — loaded via require() to avoid Turbopack Edge Runtime analysis.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { execSync, spawn } = /*turbopackIgnore: true*/ require('child_process');
import path from 'path';
import fs from 'fs';
import { STAYSUITE_SCRIPTS_DIR } from '@/lib/wifi/paths';
import { normalizeIPv4 } from '@/lib/utils/ip';

/** Re-export for consumers that import from here */
export { normalizeIPv4 } from '@/lib/utils/ip';

// Counter script path: production uses STAYSUITE_SCRIPTS_DIR (same as login/logout),
// dev/sandbox falls back to project-relative path.
const SCRIPTS_DIR = STAYSUITE_SCRIPTS_DIR;
const COUNTER_SCRIPT_FALLBACK = /*turbopackIgnore: true*/ (() => path.join(process['cwd'](), 'scripts/nftables/staysuite-traffic-counters.sh'))();

function getCounterScript(): string {
  const primary = path.join(SCRIPTS_DIR, 'staysuite-traffic-counters.sh');
  try {
    fs.accessSync(primary, fs.constants.R_OK);
    return primary;
  } catch {
    return COUNTER_SCRIPT_FALLBACK;
  }
}

// Lazy-resolve counter script path (filesystem check only once)
let _resolvedCounterScript: string | null = null;
function getCOUNTER_SCRIPT(): string {
  if (!_resolvedCounterScript) {
    _resolvedCounterScript = getCounterScript();
  }
  return _resolvedCounterScript;
}

// One-time availability check — if nft is missing or nftables table can't be
// created, suppress all subsequent log noise. SessionEngine handles fallback.
let _nftablesAvailable: boolean | null = null;

// Cache for authenticated_users set existence check.
// When the set doesn't exist, isIPAuthenticated() returns true (can't verify)
// to prevent false stale detection.
let _authSetExists: boolean | null = null;
let _authSetCheckedAt = 0;
const AUTH_SET_CHECK_TTL = 60_000; // Re-check every 60 seconds

// Cache for the nft table name that contains the 'loggedinusers' set.
// The shell scripts (staysuite_login.sh, staysuite_logout.sh) all use
// 'inet mangle', but the table name could theoretically differ. We detect
// it dynamically from 'nft list sets' output to avoid hardcoded mismatches.
let _mangleTableName: string | null = null;
let _mangleTableCheckedAt = 0;
const MANGLE_TABLE_CHECK_TTL = 60_000; // Re-detect every 60 seconds

/**
 * Detect the nft table name that contains the 'loggedinusers' set.
 * Parses 'nft list sets' output to find the table declaration that
 * precedes 'set loggedinusers'. Falls back to 'mangle' if detection fails.
 *
 * The result is cached for MANGLE_TABLE_CHECK_TTL to avoid repeated exec calls.
 */
export function getMangleTableName(): string {
  const now = Date.now();
  if (_mangleTableName !== null && (now - _mangleTableCheckedAt) < MANGLE_TABLE_CHECK_TTL) {
    return _mangleTableName;
  }
  try {
    const output = execSync('nft list sets 2>/dev/null', {
      encoding: 'utf-8',
      timeout: 3000,
    });
    // Walk through lines, tracking the current table name.
    // When we find 'set loggedinusers', use the table we're currently in.
    const lines = output.split('\n');
    let currentTable = '';
    for (const line of lines) {
      const tableMatch = line.match(/table inet (\S+)\s*\{/);
      if (tableMatch) currentTable = tableMatch[1];
      if (line.includes('set loggedinusers') && currentTable) {
        _mangleTableName = currentTable;
        _mangleTableCheckedAt = now;
        return currentTable;
      }
    }
  } catch {
    // nft not available — use default
  }
  // Default: matches what staysuite_login.sh / staysuite_logout.sh use
  _mangleTableName = 'mangle';
  _mangleTableCheckedAt = now;
  return 'mangle';
}

function isNftablesAvailable(): boolean {
  if (_nftablesAvailable !== null) return _nftablesAvailable;
  try {
    execSync('which nft 2>/dev/null', { timeout: 2000 });
    const script = getCOUNTER_SCRIPT();
    const result = execSync(`bash ${script} setup 2>&1`, {
      encoding: 'utf-8',
      timeout: 5000,
    });
    _nftablesAvailable = true;
    return true;
  } catch {
    _nftablesAvailable = false;
    return false;
  }
}

export interface IPByteCount {
  ip: string;
  downloadBytes: number;
  uploadBytes: number;
}

export interface AllByteCounts {
  counts: IPByteCount[];
  timestamp: Date;
}

/**
 * Ensure the counter table exists. Safe to call multiple times.
 */
export function setupCounterTable(): boolean {
  if (!isNftablesAvailable()) return false;
  try {
    execSync(`bash ${getCOUNTER_SCRIPT()} setup 2>&1`, {
      encoding: 'utf-8',
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Add counter rules for a user IP.
 * Called after successful authentication.
 */
export function addUserCounter(ip: string): boolean {
  if (!isNftablesAvailable()) return false;
  const cleanIp = normalizeIPv4(ip);
  if (!cleanIp) {
    console.warn(`[Counter] addUserCounter: invalid IP '${ip}' — skipping`);
    return false;
  }
  // Validate format: must be d.d.d.d where d is 0-255
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(cleanIp)) {
    console.warn(`[Counter] addUserCounter: unexpected IP format '${cleanIp}' — skipping`);
    return false;
  }
  try {
    spawn('bash', [getCOUNTER_SCRIPT(), 'add', cleanIp], { stdio: 'ignore' }).on('error', () => {});
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove counter rules for a user IP.
 * Called on logout/disconnect/session cleanup.
 *
 * Logs the script output for debugging — previously failures were
 * silently swallowed making counter leaks impossible to diagnose.
 */
export function removeUserCounter(ip: string): boolean {
  const cleanIp = normalizeIPv4(ip);
  if (!cleanIp || !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(cleanIp)) {
    console.warn(`[Counter] removeUserCounter: invalid IP '${ip}' — skipping`);
    return false;
  }
  if (!isNftablesAvailable()) {
    console.warn(`[Counter] removeUserCounter(${cleanIp}) skipped — nftables not available`);
    return false;
  }

  // Strategy 1: Use the counter script if available
  try {
    const script = getCOUNTER_SCRIPT();
    fs.accessSync(script, fs.constants.R_OK);
    const output = execSync(`bash ${script} remove ${cleanIp} 2>&1`, {
      encoding: 'utf-8',
      timeout: 5000,
    });
    const trimmed = output.trim();
    if (trimmed) {
      console.log(`[Counter] removeUserCounter(${cleanIp}): ${trimmed}`);
    }
    return true;
  } catch (err) {
    console.warn(`[Counter] removeUserCounter(${cleanIp}) script failed, falling back to direct nft: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Strategy 2: Direct nft commands (no dependency on external script)
  try {
    const safeIp = cleanIp.replace(/\./g, '_');
    const handles = execSync(
      `nft -a list chain inet staysuite_count forward 2>/dev/null | grep -E "user_(in|out)_${safeIp}" | grep -oP 'handle \\K[0-9]+' | sort -rn`,
      { encoding: 'utf-8', timeout: 5000 }
    ).trim();

    if (!handles) {
      console.log(`[Counter] removeUserCounter(${cleanIp}): no counter rules found`);
      return true;
    }

    let removed = 0;
    for (const h of handles.split('\n')) {
      const handle = h.trim();
      if (!handle || !/^\d+$/.test(handle)) continue;
      try {
        execSync(`nft delete rule inet staysuite_count forward handle ${handle} 2>/dev/null`, {
          encoding: 'utf-8',
          timeout: 3000,
        });
        removed++;
      } catch {
        // Handle may have shifted — continue with next
      }
    }
    console.log(`[Counter] removeUserCounter(${cleanIp}): removed ${removed} counter rules via direct nft`);
    return removed > 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Counter] removeUserCounter(${cleanIp}) FAILED (all strategies): ${msg}`);
    return false;
  }
}

/**
 * Read byte counters for a single IP.
 * Returns { ip, downloadBytes, uploadBytes }.
 */
export function readUserCounter(ip: string): IPByteCount | null {
  if (!isNftablesAvailable()) return null;
  const cleanIp = normalizeIPv4(ip);
  if (!cleanIp || !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(cleanIp)) {
    console.warn(`[Counter] readUserCounter: invalid IP '${ip}' — returning null`);
    return null;
  }
  try {
    const output = execSync(`bash ${getCOUNTER_SCRIPT()} read ${cleanIp} 2>&1`, {
      encoding: 'utf-8',
      timeout: 5000,
    });
    // Parse: "192.168.1.100 1234567 987654"
    const parts = output.trim().split(/\s+/);
    if (parts.length >= 3) {
      return {
        ip: parts[0],
        downloadBytes: parseInt(parts[1], 10) || 0,
        uploadBytes: parseInt(parts[2], 10) || 0,
      };
    }
    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Read byte counters for ALL tracked user IPs.
 * Returns array of { ip, downloadBytes, uploadBytes }.
 */
export function readAllCounters(): AllByteCounts {
  if (!isNftablesAvailable()) return { counts: [], timestamp: new Date() };
  try {
    const output = execSync(`bash ${getCOUNTER_SCRIPT()} read-all 2>&1`, {
      encoding: 'utf-8',
      timeout: 10000,
    });

    const counts: IPByteCount[] = [];
    const lines = output.trim().split('\n');

    for (const line of lines) {
      // Skip comment lines
      if (line.startsWith('#') || line.trim() === '') continue;

      // Parse: "192.168.1.100 1234567 987654"
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 3 && /^\d+\.\d+\.\d+\.\d+$/.test(parts[0])) {
        counts.push({
          ip: parts[0],
          downloadBytes: parseInt(parts[1], 10) || 0,
          uploadBytes: parseInt(parts[2], 10) || 0,
        });
      }
    }

    return { counts, timestamp: new Date() };
  } catch {
    return { counts: [], timestamp: new Date() };
  }
}

/**
 * Remove all counter rules (keep the table).
 * Used during cleanup/reset.
 */
export function flushAllCounters(): boolean {
  if (!isNftablesAvailable()) return false;
  try {
    execSync(`bash ${getCOUNTER_SCRIPT()} flush 2>&1`, {
      encoding: 'utf-8',
      timeout: 5000,
    });
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Check if the nftables authenticated_users set exists.
 * Result is cached for AUTH_SET_CHECK_TTL to avoid repeated exec calls.
 */
export function doesAuthenticatedSetExist(): boolean {
  const now = Date.now();
  if (_authSetExists !== null && (now - _authSetCheckedAt) < AUTH_SET_CHECK_TTL) {
    return _authSetExists;
  }
  try {
    const output = execSync('nft list sets 2>/dev/null', {
      encoding: 'utf-8',
      timeout: 3000,
    });
    // Check for the actual nft set name used by login/logout scripts.
    // The set is created as 'loggedinusers' in staysuite_login.sh.
    _authSetExists = output.includes('loggedinusers');
  } catch {
    _authSetExists = false;
  }
  _authSetCheckedAt = now;
  return _authSetExists;
}

/**
 * Check if an IP is in the nftables loggedinusers set.
 * Used to verify a session is still active at the firewall level.
 *
 * If the loggedinusers set doesn't exist at all (e.g. nftables not
 * fully configured), returns true to prevent false stale detection —
 * we cannot confirm the IP is NOT authenticated, so we assume it is.
 */
export function isIPAuthenticated(ip: string): boolean {
  // If the set doesn't exist, we can't verify authentication.
  // Return true to avoid false stale detection wiping all sessions.
  if (!doesAuthenticatedSetExist()) {
    return true;
  }

  const cleanIp = normalizeIPv4(ip);
  if (!cleanIp || !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(cleanIp)) {
    console.warn(`[Counter] isIPAuthenticated: invalid IP '${ip}' — returning false`);
    return false;
  }
  // Detect the actual table name dynamically (could be 'mangle', 'staysuite_mangle', etc.)
  const tableName = getMangleTableName();

  try {
    const output = execSync(
      `nft get element inet ${tableName} loggedinusers "{ ${cleanIp} }" 2>&1`,
      { encoding: 'utf-8', timeout: 3000 }
    );
    return output.includes(cleanIp);
  } catch {
    return false;
  }
}

/**
 * Get ALL authenticated IPs from the nftables loggedinusers set in ONE call.
 *
 * Instead of calling isIPAuthenticated(ip) per-session (which spawns a shell
 * process each time), this reads the entire set once and returns a Set for
 * O(1) membership checks. At 5,000 users this saves ~50 seconds per cycle.
 *
 * Returns a Set of IP strings. If the set doesn't exist or nft is unavailable,
 * returns null (caller should treat all IPs as authenticated — safe default).
 */
export function getAllAuthenticatedIPs(): Set<string> | null {
  if (!doesAuthenticatedSetExist()) {
    return null; // Can't verify — assume all authenticated (safe fallback)
  }

  const tableName = getMangleTableName();

  try {
    const output = execSync(
      `nft list set inet ${tableName} loggedinusers 2>&1`,
      { encoding: 'utf-8', timeout: 5000 }
    );

    // Parse IP addresses from nft set output.
    // Format: "elements = { 192.168.1.100, 192.168.1.101, ... }"
    const ips = new Set<string>();
    const lines = output.split('\n');
    let inElements = false;

    for (const line of lines) {
      if (line.includes('elements')) {
        inElements = true;
      }
      if (inElements) {
        // Match IPv4 addresses in the elements block
        const matches = line.matchAll(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g);
        for (const match of matches) {
          ips.add(match[1]);
        }
      }
      if (inElements && line.includes('}')) {
        break;
      }
    }

    return ips;
  } catch {
    return null; // nft failed — assume all authenticated (safe fallback)
  }
}

/**
 * Remove a user IP from the nftables loggedinusers set.
 * This is the "disconnect" action at the firewall level.
 */
export function deauthIP(ip: string): boolean {
  const cleanIp = normalizeIPv4(ip);
  if (!cleanIp || !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(cleanIp)) {
    console.warn(`[Counter] deauthIP: invalid IP '${ip}' — skipping`);
    return false;
  }
  const tableName = getMangleTableName();
  try {
    execSync(
      `nft delete element inet ${tableName} loggedinusers "{ ${cleanIp} }" 2>/dev/null`,
      { encoding: 'utf-8', timeout: 3000 }
    );
    return true;
  } catch {
    return false;
  }
}
