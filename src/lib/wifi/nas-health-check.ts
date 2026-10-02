/**
 * StaySuite NAS Health Check Service
 *
 * Probes all registered NAS devices (from RadiusNAS table) and writes
 * health status to NasHealthLog. Runs every 60 seconds via scheduler.
 *
 * Probes:
 *   1. ICMP ping → latency + isOnline (requires cap_net_raw on production)
 *   2. TCP port check → RADIUS auth port (1812) + acct port (1813)
 *   3. Live session count from LiveSession table
 *   4. Auth stats from RadiusAuthLog
 *
 * Graceful degradation:
 *   - If ICMP not available (sandbox/no-cap) → TCP-only check
 *   - If NAS IP is localhost → skip ICMP, just check ports
 *   - If NAS is marked inactive → skip probe
 */

import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
// Node.js-only modules — loaded via require() to avoid Turbopack Edge Runtime analysis.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { exec } = /*turbopackIgnore: true*/ require('child_process');
import { promisify } from 'util';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const net = /*turbopackIgnore: true*/ require('net');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const dgram = /*turbopackIgnore: true*/ require('dgram');
import * as SELog from './session-engine-logger';

const execAsync = promisify(exec);

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

interface NasConfig {
  id: string;
  tenantId: string;
  propertyId: string;
  name: string;
  shortname: string;
  ipAddress: string;
  type: string;
  authPort: number;
  acctPort: number;
  coaEnabled: boolean;
  coaPort: number;
  status: string;
}

interface ProbeResult {
  nasId: string;
  nasIp: string;
  nasName: string;
  tenantId: string;
  propertyId: string;

  /** True if any probe succeeded */
  isOnline: boolean;

  /** ICMP round-trip time in ms (null if ICMP unavailable) */
  icmpLatencyMs: number | null;

  /** Time to connect to RADIUS auth port in ms (null if failed) */
  authPortLatencyMs: number | null;

  /** Time to connect to RADIUS acct port in ms (null if failed) */
  acctPortLatencyMs: number | null;

  /** Best available latency for display (ICMP preferred, then TCP) */
  avgLatencyMs: number | null;

  /** Number of active sessions for this NAS */
  liveUsers: number;

  /** Total auth attempts */
  totalAuths: number;

  /** Failed auth attempts */
  failedAuths: number;

  /** Which probes succeeded */
  probesUsed: string[];

  /** Error message if all probes failed */
  error?: string;

  /** Timestamp of this probe */
  probedAt: Date;
}

export interface NasHealthCheckResult {
  /** Total NAS devices found */
  totalNas: number;
  /** NAS devices actually probed (active ones) */
  probed: number;
  /** Devices that responded */
  online: number;
  /** Devices that didn't respond */
  offline: number;
  /** Devices with high latency (>200ms) */
  degraded: number;
  /** Total errors during probe */
  errors: number;
  /** Duration of the full check in ms */
  durationMs: number;
  /** Per-NAS results */
  results: ProbeResult[];
}

// ────────────────────────────────────────────────────────────
// Probe Functions
// ────────────────────────────────────────────────────────────

const LOCALHOST_IPS = new Set(['127.0.0.1', '::1', 'localhost', '0.0.0.0']);

/**
 * ICMP ping: returns round-trip time in ms, or null if unavailable.
 * Uses system `ping` command (requires cap_net_raw or setuid).
 */
async function icmpPing(ip: string, timeoutMs: number = 3000): Promise<number | null> {
  try {
    const { stdout } = await execAsync(
      `ping -c 1 -W ${Math.ceil(timeoutMs / 1000)} ${ip} 2>&1`,
      { timeout: timeoutMs + 1000 }
    );

    // Parse Linux ping output: "time=42.3 ms" or "time=42.324 ms"
    const match = stdout.match(/time[=<]([0-9.]+)\s*ms/);
    if (match) {
      return parseFloat(match[1]);
    }

    return null;
  } catch {
    // Ping failed (device offline, permission denied, etc.)
    return null;
  }
}

/**
 * Check if ICMP is available (has permission to send raw packets).
 * Runs a single test ping to localhost.
 */
async function checkIcmpAvailable(): Promise<boolean> {
  try {
    const { stdout } = await execAsync('ping -c 1 -W 1 127.0.0.1 2>&1', {
      timeout: 3000,
    });
    // If we got "time=" in output, ICMP works
    return /time[=<]/.test(stdout);
  } catch {
    return false;
  }
}

/**
 * UDP port check: sends a RADIUS Status-Server request to detect if the
 * port is reachable. RADIUS uses UDP (not TCP), so we use dgram.
 *
 * For non-RADIUS ports, we use a simple UDP connect approach:
 * send empty datagram, check if we get any response or no ICMP error.
 *
 * Returns latency in ms if port responded, null if unreachable.
 */
function udpPortCheck(ip: string, port: number, timeoutMs: number = 3000): Promise<number | null> {
  return new Promise((resolve) => {
    const start = Date.now();
    let resolved = false;

    const socket = dgram.createSocket('udp4');
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        socket.close();
        resolve(null);
      }
    }, timeoutMs);

    socket.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        socket.close();
        // "ECONNREFUSED" means the port is actually open but no RADIUS listener responded
        // "EHOSTUNREACH" / "ENETUNREACH" means host/port not reachable
        if (err.code === 'ECONNREFUSED') {
          // Port exists but didn't accept our packet — still means "reachable"
          resolve(Date.now() - start);
        } else {
          resolve(null);
        }
      }
    });

    socket.on('message', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        socket.close();
        resolve(Date.now() - start);
      }
    });

    // Send a minimal RADIUS Status-Server packet (Access-Request with empty fields)
    // RADIUS packet format: Code(1) + Identifier(1) + Length(2) + Authenticator(16) = 20 bytes
    // Code 12 = Status-Server
    const buffer = Buffer.alloc(20);
    buffer[0] = 12; // Status-Server
    buffer[1] = 0;  // Identifier
    buffer.writeUInt16BE(20, 2); // Length
    // Authenticator left as zeros

    socket.send(buffer, port, ip, (err) => {
      if (err && !resolved) {
        resolved = true;
        clearTimeout(timer);
        socket.close();
        resolve(null);
      }
    });
  });
}

/**
 * TCP port check: tries to connect to host:port, returns latency in ms.
 * Used as fallback for non-RADIUS services.
 */
function tcpPortCheck(ip: string, port: number, timeoutMs: number = 3000): Promise<number | null> {
  return new Promise((resolve) => {
    const start = Date.now();

    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);

    socket.connect(port, ip, () => {
      const latency = Date.now() - start;
      socket.destroy();
      resolve(latency);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(null);
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(null);
    });
  });
}

/**
 * Probe a single NAS device.
 */
async function probeNas(
  nas: NasConfig,
  icmpAvailable: boolean,
  liveUsers: number,
  authStats: { totalAuths: number; failedAuths: number }
): Promise<ProbeResult> {
  const result: ProbeResult = {
    nasId: nas.id,
    nasIp: nas.ipAddress,
    nasName: nas.name || nas.shortname,
    tenantId: nas.tenantId,
    propertyId: nas.propertyId,
    isOnline: false,
    icmpLatencyMs: null,
    authPortLatencyMs: null,
    acctPortLatencyMs: null,
    avgLatencyMs: null,
    liveUsers,
    totalAuths: authStats.totalAuths,
    failedAuths: authStats.failedAuths,
    probesUsed: [],
    probedAt: new Date(),
  };

  const probes: Promise<void>[] = [];
  const isLocalhost = LOCALHOST_IPS.has(nas.ipAddress);

  // ── 0. Self/Localhost NAS — always online (StaySuite IS the gateway) ──
  // When the NAS IP is 127.0.0.1, this IS the local machine. No need to probe.
  if (isLocalhost) {
    result.isOnline = true;
    result.avgLatencyMs = 0;
    result.probesUsed.push('self:localhost');
    return result;
  }

  // ── 1. ICMP Ping ──
  if (icmpAvailable) {
    probes.push(
      (async () => {
        const latency = await icmpPing(nas.ipAddress);
        result.icmpLatencyMs = latency;
        if (latency !== null) {
          result.isOnline = true;
          result.probesUsed.push('icmp');
        }
      })()
    );
  }

  // ── 2. UDP Auth Port Check (RADIUS uses UDP, not TCP) ──
  probes.push(
    (async () => {
      const latency = await udpPortCheck(nas.ipAddress, nas.authPort, 3000);
      result.authPortLatencyMs = latency;
      if (latency !== null) {
        result.isOnline = true;
        result.probesUsed.push(`udp:${nas.authPort}`);
      }
    })()
  );

  // ── 3. UDP Acct Port Check ──
  probes.push(
    (async () => {
      const latency = await udpPortCheck(nas.ipAddress, nas.acctPort, 2000);
      result.acctPortLatencyMs = latency;
      if (latency !== null && !result.probesUsed.includes(`udp:${nas.acctPort}`)) {
        result.probesUsed.push(`udp:${nas.acctPort}`);
      }
    })()
  );

  // ── Run all probes in parallel ──
  await Promise.allSettled(probes);

  // ── Calculate best latency ──
  const latencies = [
    result.icmpLatencyMs,
    result.authPortLatencyMs,
    result.acctPortLatencyMs,
  ].filter((l): l is number => l !== null);

  if (latencies.length > 0) {
    // Use ICMP if available (most accurate), otherwise average of TCP
    if (result.icmpLatencyMs !== null) {
      result.avgLatencyMs = result.icmpLatencyMs;
    } else {
      result.avgLatencyMs = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
    }
  }

  // ── Error message for offline ──
  if (!result.isOnline) {
    if (!icmpAvailable && isLocalhost) {
      result.error = 'ICMP unavailable (sandbox) + localhost ports closed';
    } else if (!icmpAvailable) {
      result.error = `UDP ports ${nas.authPort}/${nas.acctPort} not responding (ICMP unavailable)`;
    } else {
      result.error = `All probes failed: ICMP unreachable, UDP ${nas.authPort}/${nas.acctPort} no response`;
    }
  }

  return result;
}

// ────────────────────────────────────────────────────────────
// Main Health Check Runner
// ────────────────────────────────────────────────────────────

let icmpAvailable: boolean | null = null;
let lastCheckResult: NasHealthCheckResult | null = null;

/**
 * Run a full NAS health check cycle.
 * Probes all active NAS devices and writes to NasHealthLog.
 */
export async function runNasHealthCheck(): Promise<NasHealthCheckResult> {
  const startTime = Date.now();
  const result: NasHealthCheckResult = {
    totalNas: 0,
    probed: 0,
    online: 0,
    offline: 0,
    degraded: 0,
    errors: 0,
    durationMs: 0,
    results: [],
  };

  try {
    // ── Step 1: Check ICMP availability (cached) ──
    if (icmpAvailable === null) {
      icmpAvailable = await checkIcmpAvailable();
      SELog.info(`ICMP ping available: ${icmpAvailable}`);
    }

    // ── Step 2: Get all active NAS devices ──
    const nasList = await db.$queryRaw<NasConfig[]>(Prisma.sql`
      SELECT id, "tenantId", "propertyId", name, shortname, "ipAddress", type,
             "authPort", "acctPort", "coaEnabled", "coaPort", status
      FROM "RadiusNAS"
      WHERE status = 'active'
        AND "ipAddress" IS NOT NULL
        AND "ipAddress" != ''
        AND "ipAddress" != '0.0.0.0'
    `);

    result.totalNas = nasList.length;

    if (nasList.length === 0) {
      SELog.info('No active NAS devices to probe');
      lastCheckResult = result;
      return result;
    }

    // ── Step 3: Batch-fetch live sessions and auth stats from radacct ──
    const nasIps = nasList.map((n) => n.ipAddress);

    // Active sessions from radacct (acctstoptime IS NULL)
    const liveSessionRows = await db.$queryRaw<Array<{ nasipaddress: string; cnt: number }>>(Prisma.sql`
      SELECT nasipaddress, COUNT(*)::int as cnt
      FROM radacct
      WHERE acctstoptime IS NULL
        AND nasipaddress = ANY(${nasIps}::text[])
      GROUP BY nasipaddress
    `);

    const liveSessionMap: Record<string, number> = {};
    for (const row of liveSessionRows) {
      liveSessionMap[row.nasipaddress] = row.cnt;
    }

    // Failed auths from radpostauth
    const authRows = await db.$queryRaw<Array<{
      nasIpAddress: string;
      totalAuths: number;
      failedAuths: number;
    }>>(Prisma.sql`
      SELECT "nasIpAddress",
             COUNT(*)::int as "totalAuths",
             COUNT(*) FILTER (WHERE reply = 'Reject')::int as "failedAuths"
      FROM radpostauth
      WHERE "nasIpAddress" = ANY(${nasIps}::text[])
      GROUP BY "nasIpAddress"
    `);

    const authMap: Record<string, { totalAuths: number; failedAuths: number }> = {};
    for (const row of authRows) {
      authMap[row.nasIpAddress] = { totalAuths: row.totalAuths, failedAuths: row.failedAuths };
    }

    // ── Step 4: Probe each NAS (in parallel, max 5 concurrent) ──
    result.probed = nasList.length;
    const CONCURRENCY = 5;

    for (let i = 0; i < nasList.length; i += CONCURRENCY) {
      const batch = nasList.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.allSettled(
        batch.map((nas) =>
          probeNas(
            nas,
            icmpAvailable!,
            liveSessionMap[nas.ipAddress] || 0,
            authMap[nas.ipAddress] || { totalAuths: 0, failedAuths: 0 }
          )
        )
      );

      for (const settled of batchResults) {
        if (settled.status === 'fulfilled') {
          const probe = settled.value;
          result.results.push(probe);

          if (probe.isOnline) {
            result.online++;
            if (probe.avgLatencyMs !== null && probe.avgLatencyMs > 200) {
              result.degraded++;
            }
          } else {
            result.offline++;
          }
        } else {
          result.errors++;
        }
      }
    }

    // ── Step 5: Write results to NasHealthLog ──
    // Each cycle creates a new row (audit trail). The GET endpoint uses
    // DISTINCT ON to fetch only the latest per NAS IP.
    for (const probe of result.results) {
      try {
        await db.nasHealthLog.create({
          data: {
            tenantId: probe.tenantId,
            propertyId: probe.propertyId,
            nasIpAddress: probe.nasIp,
            nasName: probe.nasName,
            isOnline: probe.isOnline,
            liveUsers: probe.liveUsers,
            totalAuths: probe.totalAuths,
            totalAccts: 0,
            avgLatencyMs: probe.avgLatencyMs,
            lastSeenAt: probe.isOnline ? new Date() : null,
            checkIntervalSec: 60,
          },
        });
      } catch {
        // Skip on error (e.g. missing property/tenant FK)
      }
    }

    // ── Step 6: Detect state transitions & update RadiusNAS ──
    // For each probed NAS, compare current probe result with previous health log.
    // Transitions: offline→online (set lastWentOnlineAt), online→offline (set lastWentOfflineAt)
    const now = new Date();

    for (const probe of result.results) {
      try {
        // Get previous health state for this NAS IP
        const prevRows = await db.$queryRaw<Array<{ isOnline: boolean }>>(Prisma.sql`
          SELECT "isOnline"
          FROM "NasHealthLog"
          WHERE "nasIpAddress" = ${probe.nasIp}
          ORDER BY "createdAt" DESC
          LIMIT 1 OFFSET 1
        `); // OFFSET 1 skips the one we just wrote in Step 5

        const wasOnline = prevRows.length > 0 ? prevRows[0].isOnline : null;

        if (probe.isOnline && wasOnline === false) {
          // Transition: offline → online
          await db.$executeRaw(Prisma.sql`
            UPDATE "RadiusNAS"
            SET "lastSeenAt" = NOW(),
                "lastWentOnlineAt" = NOW()
            WHERE "ipAddress" = ${probe.nasIp}
          `);
          SELog.info(`NAS state change: ${probe.nasName} (${probe.nasIp}) — offline → online`);
        } else if (probe.isOnline && wasOnline === null) {
          // First health check ever — assume it was always online if currently online
          await db.$executeRaw(Prisma.sql`
            UPDATE "RadiusNAS"
            SET "lastSeenAt" = NOW(),
                "lastWentOnlineAt" = COALESCE("lastWentOnlineAt", NOW())
            WHERE "ipAddress" = ${probe.nasIp}
              AND "lastWentOnlineAt" IS NULL
          `);
        } else if (!probe.isOnline && wasOnline === true) {
          // Transition: online → offline
          await db.$executeRaw(Prisma.sql`
            UPDATE "RadiusNAS"
            SET "lastWentOfflineAt" = NOW()
            WHERE "ipAddress" = ${probe.nasIp}
          `);
          SELog.warn(`NAS state change: ${probe.nasName} (${probe.nasIp}) — online → offline`);
        } else if (probe.isOnline) {
          // Still online — just update lastSeenAt
          await db.$executeRaw(Prisma.sql`
            UPDATE "RadiusNAS"
            SET "lastSeenAt" = NOW()
            WHERE "ipAddress" = ${probe.nasIp}
          `);
        }
        // If offline and was offline → no update needed
      } catch (err) {
        SELog.error(`Failed to update state transition for ${probe.nasIp}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // ── Step 7: Cleanup old health logs (keep 7 days) ──
    try {
      await db.$executeRaw(Prisma.sql`
        DELETE FROM "NasHealthLog"
        WHERE "createdAt" < NOW() - INTERVAL '7 days'
      `);
    } catch {
      // Non-fatal
    }

    // ── Step 8: Log summary ──
    result.durationMs = Date.now() - startTime;

    SELog.info(
      `NAS health check: ${result.probed} probed, ` +
      `${result.online} online, ${result.offline} offline, ` +
      `${result.degraded} degraded, ${result.errors} errors, ` +
      `${result.durationMs}ms (ICMP: ${icmpAvailable ? 'yes' : 'no'})`
    );

    // Log individual offline devices
    for (const probe of result.results) {
      if (!probe.isOnline) {
        SELog.warn(`NAS offline: ${probe.nasName} (${probe.nasIp}) — ${probe.error}`);
      }
    }

  } catch (err) {
    SELog.error(`NAS health check fatal error: ${err instanceof Error ? err.message : String(err)}`);
    result.errors++;
  }

  lastCheckResult = result;
  return result;
}

/**
 * Get the last NAS health check result (from memory).
 */
export function getLastNasHealthCheck(): NasHealthCheckResult | null {
  return lastCheckResult;
}

/**
 * Check if ICMP is currently available.
 */
export function isIcmpAvailable(): boolean {
  return icmpAvailable === true;
}
