/**
 * SNAT IP Allocator
 *
 * Assigns public SNAT IPs to internal (LAN) client IPs based on the
 * algorithm configured on the IpPool: round_robin, hash_ip, or first_available.
 *
 * Uses the SnatAssignment table for persistent tracking (round_robin mode).
 * All functions are non-blocking and fall back gracefully on errors.
 */

import { db } from '@/lib/db';

export interface SnatRange {
  startIp: string;
  endIp: string;
}

/**
 * Allocate a SNAT IP for a client based on the pool's algorithm.
 *
 * @returns The assigned SNAT IP string, or null if allocation failed (pool exhausted, bad config, etc.)
 */
export async function allocateSnatIp(
  poolId: string,
  clientIp: string,
  algorithm: string | null,
  snatRanges: SnatRange[] | null,
): Promise<string | null> {
  if (!snatRanges || snatRanges.length === 0) {
    console.warn(`[SNAT] No SNAT ranges configured for pool ${poolId}`);
    return null;
  }

  switch (algorithm) {
    case 'hash_ip':
      return allocateByHash(clientIp, snatRanges);
    case 'first_available':
      return allocateFirstAvailable(snatRanges);
    case 'round_robin':
    default:
      return allocateRoundRobin(poolId, clientIp, snatRanges);
  }
}

/**
 * Round-robin: assign the first unassigned IP from the SNAT ranges.
 * Tracks assignments in SnatAssignment table for persistence.
 */
async function allocateRoundRobin(
  poolId: string,
  clientIp: string,
  snatRanges: SnatRange[],
): Promise<string | null> {
  try {
    // 1. Check if this client already has an active assignment — reuse it
    const existing = await db.snatAssignment.findUnique({
      where: { clientIp },
    });
    if (existing && (!existing.expiresAt || existing.expiresAt > new Date())) {
      return existing.snatIp;
    }

    // 2. Flatten all ranges into a list of IPs (as strings for comparison)
    const allIps = flattenRanges(snatRanges);
    if (allIps.length === 0) return null;

    // 3. Find already-assigned SNAT IPs for this pool (active assignments only)
    const assigned = await db.snatAssignment.findMany({
      where: {
        poolId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { snatIp: true },
    });
    const assignedSet = new Set(
      assigned.map((a) => a.snatIp),
    );

    // 4. Pick first unassigned IP
    const available = allIps.find((ip) => !assignedSet.has(ip));
    if (!available) {
      console.warn(
        `[SNAT] Pool ${poolId} exhausted: all ${allIps.length} SNAT IPs assigned. ` +
          `Client ${clientIp} will fall back to masquerade.`,
      );
      return null;
    }

    // 5. Persist assignment (upsert in case of race condition)
    await db.snatAssignment.upsert({
      where: { clientIp },
      create: {
        poolId,
        clientIp,
        snatIp: available,
      },
      update: {
        snatIp: available,
        assignedAt: new Date(),
        expiresAt: null,
      },
    });

    console.log(
      `[SNAT] Allocated ${available} to ${clientIp} (pool ${poolId}, round-robin)`,
    );
    return available;
  } catch (err) {
    console.error(`[SNAT] Round-robin allocation failed for pool ${poolId}:`, err);
    return null;
  }
}

/**
 * Hash-based: deterministic mapping from client IP to SNAT IP.
 * Same client IP always gets the same SNAT IP. No table tracking needed.
 */
function allocateByHash(
  clientIp: string,
  snatRanges: SnatRange[],
): string | null {
  const allIps = flattenRanges(snatRanges);
  if (allIps.length === 0) return null;

  // Use a fast integer hash (FNV-1a inspired) — avoids siphash24 which may not be available in all Node builds
  let hash = 0x811c9dc5;
  for (let i = 0; i < clientIp.length; i++) {
    hash ^= clientIp.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const index = (hash >>> 0) % allIps.length;

  console.log(
    `[SNAT] Hash-allocated ${allIps[index]} to ${clientIp} (hash=${hash}, index=${index}/${allIps.length})`,
  );
  return allIps[index];
}

/**
 * First-available: all clients share the first IP in the SNAT ranges.
 * Effectively SNAT to a single fixed public IP (like masquerade but with a specific IP).
 */
function allocateFirstAvailable(snatRanges: SnatRange[]): string | null {
  if (!snatRanges[0]?.startIp) return null;
  return snatRanges[0].startIp;
}

/**
 * Release a SNAT assignment for a client IP (called on logout).
 * Marks the assignment as expired so the IP becomes available for reuse.
 *
 * If the pool has snatStickyMinutes > 0, the assignment is deferred:
 * expiresAt is set to now + snatStickyMinutes. During the sticky window,
 * a re-login for the same clientIp will reuse the same SNAT IP.
 *
 * @param clientIp - The internal IP to release
 * @param reason - Audit reason string
 * @param stickyMinutes - Override sticky minutes. If 0 (default), looks up
 *   from the pool's snatStickyMinutes config automatically.
 */
export async function releaseSnatIp(clientIp: string, reason: string = 'logout', stickyMinutes?: number): Promise<void> {
  try {
    // If no explicit sticky override, look up from pool config
    let effectiveSticky = stickyMinutes ?? 0;
    if (effectiveSticky === 0) {
      const assignment = await db.snatAssignment.findFirst({
        where: { clientIp, expiresAt: null },
        select: { poolId: true },
      });
      if (assignment) {
        const pool = await db.ipPool.findUnique({
          where: { id: assignment.poolId },
          select: { snatStickyMinutes: true },
        });
        effectiveSticky = pool?.snatStickyMinutes ?? 0;
      }
    }

    const expiresAt = effectiveSticky > 0
      ? new Date(Date.now() + effectiveSticky * 60 * 1000)
      : new Date();

    const result = await db.snatAssignment.updateMany({
      where: { clientIp, expiresAt: null },
      data: { expiresAt, releaseReason: reason },
    });
    if (result.count > 0) {
      console.log(`[SNAT] Released SNAT assignment for ${clientIp} (reason: ${reason}${effectiveSticky > 0 ? `, sticky=${effectiveSticky}m` : ''})`);
    }
  } catch (err) {
    console.error(`[SNAT] Failed to release assignment for ${clientIp}:`, err);
  }
}

// ── Helpers ──────────────────────────────────────────────────

/** Convert IP string to 32-bit number */
function ipToNum(ip: string): number {
  return ip
    .split('.')
    .reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

/** Flatten SNAT ranges into an array of IP strings (e.g. ["203.0.113.10", "203.0.113.11", ...]) */
function flattenRanges(ranges: SnatRange[]): string[] {
  const ips: string[] = [];
  for (const range of ranges) {
    if (!range.startIp || !range.endIp) continue;
    const start = ipToNum(range.startIp);
    const end = ipToNum(range.endIp);
    // Cap at 65536 IPs per pool to prevent unbounded memory use
    const maxIps = Math.min(end - start + 1, 65536);
    for (let i = 0; i < maxIps; i++) {
      const num = start + i;
      const a = (num >>> 24) & 0xff;
      const b = (num >>> 16) & 0xff;
      const c = (num >>> 8) & 0xff;
      const d = num & 0xff;
      ips.push(`${a}.${b}.${c}.${d}`);
    }
  }
  return ips;
}

/**
 * Get SNAT usage statistics for a pool.
 */
export async function getSnatUsage(poolId: string): Promise<{
  total: number;
  assigned: number;
  available: number;
}> {
  try {
    const pool = await db.ipPool.findUnique({
      where: { id: poolId },
      select: { snatRanges: true },
    });
    if (!pool?.snatRanges) return { total: 0, assigned: 0, available: 0 };

    const ranges = pool.snatRanges as SnatRange[];
    const total = ranges.reduce((acc, r) => {
      const s = ipToNum(r.startIp);
      const e = ipToNum(r.endIp);
      return acc + Math.min(e - s + 1, 65536);
    }, 0);

    const assigned = await db.snatAssignment.count({
      where: {
        poolId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });

    return { total, assigned, available: total - assigned };
  } catch {
    return { total: 0, assigned: 0, available: 0 };
  }
}