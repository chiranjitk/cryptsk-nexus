/**
 * Cryptsk — FreeRADIUS Table Sync Utilities
 * 
 * Centralized functions to sync subscriber/plan data to FreeRADIUS tables:
 * radcheck, radreply, radusergroup, radgroupcheck, radgroupreply
 */

import { db } from './db';

/**
 * Sync a user to FreeRADIUS tables (radcheck, radreply, radusergroup)
 * Uses parameterized queries where possible, escapes single quotes for identifiers
 */
export async function syncUserToFreeRADIUS(
  username: string,
  password: string,
  groupName: string | null,
  maxSessions: number = 1,
  fallbackRateLimit?: string | null
) {
  const uname = username.replace(/'/g, "''");
  const pwd = password.replace(/'/g, "''");
  const grp = groupName ? groupName.replace(/'/g, "''") : null;

  // Get rate limit from group's radgroupreply, or use fallback from plan speeds
  let rateLimit: string | null = null;
  if (grp) {
    const rows = await db.$queryRawUnsafe<{ value: string }[]>(
      `SELECT value FROM radgroupreply WHERE groupname = '${grp}' AND attribute = 'Mikrotik-Rate-Limit' LIMIT 1`
    );
    rateLimit = rows[0]?.value || null;
  }
  // Fallback: if group has no rate-limit in radgroupreply, use the caller-provided one
  if (!rateLimit && fallbackRateLimit) {
    rateLimit = fallbackRateLimit;
  }

  // Upsert radcheck: Cleartext-Password
  await db.$executeRawUnsafe(`
    INSERT INTO radcheck (username, attribute, op, value) VALUES ('${uname}', 'Cleartext-Password', ':=', '${pwd}')
    ON CONFLICT DO NOTHING
  `);

  // Upsert radcheck: Simultaneous-Use (login limit)
  await db.$executeRawUnsafe(`
    INSERT INTO radcheck (username, attribute, op, value) VALUES ('${uname}', 'Simultaneous-Use', ':=', '${maxSessions}')
    ON CONFLICT DO NOTHING
  `);

  // Upsert radreply: Mikrotik-Rate-Limit from group
  if (rateLimit) {
    const escapedRate = rateLimit.replace(/'/g, "''");
    await db.$executeRawUnsafe(`
      INSERT INTO radreply (username, attribute, op, value) VALUES ('${uname}', 'Mikrotik-Rate-Limit', ':=', '${escapedRate}')
      ON CONFLICT DO NOTHING
    `);
  }

  // Upsert radreply: Framed-IP-Address (if subscriber has static IP — caller can add after)

  // Upsert radusergroup
  if (grp) {
    await db.$executeRawUnsafe(`
      INSERT INTO radusergroup (username, groupname, priority) VALUES ('${uname}', '${grp}', 1)
      ON CONFLICT DO NOTHING
    `);
  }
}

/**
 * Remove a user from FreeRADIUS tables
 */
export async function removeUserFromFreeRADIUS(username: string) {
  const uname = username.replace(/'/g, "''");
  await db.$executeRawUnsafe(`DELETE FROM radcheck WHERE username = '${uname}'`);
  await db.$executeRawUnsafe(`DELETE FROM radreply WHERE username = '${uname}'`);
  await db.$executeRawUnsafe(`DELETE FROM radusergroup WHERE username = '${uname}'`);
}

/**
 * Update a user's group in FreeRADIUS tables
 */
export async function updateUserFreeRADIUSGroup(
  username: string,
  newGroup: string | null
) {
  const uname = username.replace(/'/g, "''");

  // Remove old group assignments
  await db.$executeRawUnsafe(`DELETE FROM radusergroup WHERE username = '${uname}'`);

  if (newGroup) {
    const grp = newGroup.replace(/'/g, "''");

    // Add new group assignment
    await db.$executeRawUnsafe(`
      INSERT INTO radusergroup (username, groupname, priority) VALUES ('${uname}', '${grp}', 1)
      ON CONFLICT DO NOTHING
    `);

    // Update rate limit reply from new group
    const rows = await db.$queryRawUnsafe<{ value: string }[]>(
      `SELECT value FROM radgroupreply WHERE groupname = '${grp}' AND attribute = 'Mikrotik-Rate-Limit' LIMIT 1`
    );
    const rateLimit = rows[0]?.value;

    if (rateLimit) {
      const escapedRate = rateLimit.replace(/'/g, "''");
      await db.$executeRawUnsafe(`
        INSERT INTO radreply (username, attribute, op, value) VALUES ('${uname}', 'Mikrotik-Rate-Limit', ':=', '${escapedRate}')
        ON CONFLICT (username, attribute) DO UPDATE SET value = '${escapedRate}'
      `);
    }
  }
}

/**
 * Sync a RADIUS group's attributes to radgroupcheck and radgroupreply
 * Called when a plan is created/updated with auto RADIUS group.
 *
 * COMPREHENSIVE MAPPING — all Plan fields are mapped to the correct
 * FreeRADIUS attributes, using the same attribute set as the seed data
 * (WISPr + Cryptsk VSA + Mikrotik + ChilliSpot for max NAS compatibility).
 *
 * Unit conversions:
 *   - Plan stores speed in kbps (e.g., 30720 = 30 Mbps)
 *   - kbps → Mbps:  Math.round(kbps / 1024)       → "30M"
 *   - kbps → bps:   Math.round(kbps / 1024) * 1e6 → 30000000
 *   - GB → bytes:   GB * 1024^3                   → 536870912000
 *   - GB → MB:      GB * 1024                     → 512000
 *   - days → sec:   days * 86400                  → 2592000
 */
export async function syncGroupToFreeRADIUS(
  groupName: string,
  options: {
    downloadSpeed?: number;      // kbps
    uploadSpeed?: number;        // kbps
    burstSpeed?: number | null;  // kbps
    burstDuration?: number | null; // seconds
    dataLimitGb?: number | null; // GB
    dataLimitMb?: number | null; // MB (legacy, takes precedence if both set)
    maxSessions?: number;        // Simultaneous-Use
    validityDays?: number;       // Session-Timeout in days
    downloadSpeedFup?: number | null;  // kbps
    uploadSpeedFup?: number | null;    // kbps
    contentionRatio?: string | null;   // "1:10"
    ipv6Enabled?: boolean;
    ipv6PrefixDelegation?: boolean;
    ipv6DefaultPoolId?: string | null;
    idleTimeoutSeconds?: number;  // default 3600 (1 hour)
  }
) {
  const grp = groupName.replace(/'/g, "''");
  const {
    downloadSpeed, uploadSpeed, burstSpeed, burstDuration,
    dataLimitGb, dataLimitMb, maxSessions, validityDays,
    downloadSpeedFup, uploadSpeedFup, contentionRatio,
    ipv6Enabled, ipv6PrefixDelegation, ipv6DefaultPoolId,
    idleTimeoutSeconds = 3600,
  } = options;

  // ── Unit conversions ──────────────────────────────────────────
  const downMbps = downloadSpeed ? Math.round(downloadSpeed / 1024) : 0;
  const upMbps = uploadSpeed ? Math.round(uploadSpeed / 1024) : 0;
  const downBps = downMbps * 1000000;   // WISPr expects bps
  const upBps = upMbps * 1000000;
  const burstMbps = burstSpeed ? Math.round(burstSpeed / 1024) : 0;
  const burstBps = burstMbps * 1000000;

  const fupDownBps = downloadSpeedFup ? Math.round(downloadSpeedFup / 1024) * 1000000 : 0;
  const fupUpBps = uploadSpeedFup ? Math.round(uploadSpeedFup / 1024) * 1000000 : 0;

  // Data limit: prefer MB if explicitly passed, else convert from GB
  const dataLimitBytes = dataLimitMb
    ? dataLimitMb * 1024 * 1024
    : (dataLimitGb ? dataLimitGb * 1024 * 1024 * 1024 : 0);
  const dataLimitMbVal = dataLimitMb ?? (dataLimitGb ? Math.round(dataLimitGb * 1024) : 0);

  const sessionTimeout = validityDays ? validityDays * 86400 : 2592000; // default 30 days

  // ── Build the rate limit string with burst (Mikrotik format) ──
  // Format: rx_max/tx_max rx_burst_max/tx_burst_max burst_time rx_max/tx_max
  // Example: 30M/15M 60M/60M 60s 30M/15M
  let rateLimitStr = "";
  if (downMbps && upMbps) {
    rateLimitStr = `${downMbps}M/${upMbps}M`;
    if (burstMbps && burstDuration) {
      rateLimitStr += ` ${burstMbps}M/${burstMbps}M ${burstDuration}s ${downMbps}M/${upMbps}M`;
    }
  }

  // ── Clear existing attributes for this group ──────────────────
  await db.$executeRawUnsafe(`DELETE FROM radgroupreply WHERE groupname = '${grp}'`);
  await db.$executeRawUnsafe(`DELETE FROM radgroupcheck WHERE groupname = '${grp}'`);

  // ════════════════════════════════════════════════════════════════
  // radgroupreply — attributes sent in Access-Accept (what NAS receives)
  // ════════════════════════════════════════════════════════════════
  const replyAttrs: [string, string][] = [];

  // 1. Mikrotik-Rate-Limit (with burst format)
  if (rateLimitStr) replyAttrs.push(["Mikrotik-Rate-Limit", rateLimitStr]);

  // 2. WISPr bandwidth (for captive portal / hotspot NAS) — in bps
  if (downBps) replyAttrs.push(["WISPr-Bandwidth-Max-Down", String(downBps)]);
  if (upBps) replyAttrs.push(["WISPr-Bandwidth-Max-Up", String(upBps)]);

  // 3. Idle-Timeout (disconnect after X seconds idle)
  replyAttrs.push(["Idle-Timeout", String(idleTimeoutSeconds)]);

  // 4. Session-Timeout (max session duration in seconds)
  replyAttrs.push(["Session-Timeout", String(sessionTimeout)]);

  // 5. IPv6 pools (if IPv6 enabled)
  if (ipv6Enabled && ipv6DefaultPoolId) {
    replyAttrs.push(["Framed-IPv6-Pool", String(ipv6DefaultPoolId)]);
  }
  if (ipv6Enabled && ipv6PrefixDelegation) {
    replyAttrs.push(["Delegated-IPv6-Prefix-Pool", "auto"]);
  }

  // 6. Cryptsk VSA bandwidth (also in reply for NAS that reads reply VSAs)
  if (downBps) replyAttrs.push(["Cryptsk-Bandwidth-Max-Down", String(downBps)]);
  if (upBps) replyAttrs.push(["Cryptsk-Bandwidth-Max-Up", String(upBps)]);
  if (rateLimitStr) replyAttrs.push(["Cryptsk-Rate-Limit", rateLimitStr]);

  // Insert all reply attributes
  for (const [attr, val] of replyAttrs) {
    const escapedVal = val.replace(/'/g, "''");
    await db.$executeRawUnsafe(`
      INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES ('${grp}', '${attr}', ':=', '${escapedVal}')
    `);
  }

  // ════════════════════════════════════════════════════════════════
  // radgroupcheck — attributes checked/enforced at auth time
  // ════════════════════════════════════════════════════════════════
  const checkAttrs: [string, string][] = [];

  // 1. Simultaneous-Use (login limit)
  if (maxSessions && maxSessions > 0) {
    checkAttrs.push(["Simultaneous-Use", String(maxSessions)]);
  }

  // 2. Session-Timeout (also in check for enforcement)
  checkAttrs.push(["Session-Timeout", String(sessionTimeout)]);

  // 3. Cryptsk VSA bandwidth (in check — matching seed convention)
  if (downBps) checkAttrs.push(["Cryptsk-Bandwidth-Max-Down", String(downBps)]);
  if (upBps) checkAttrs.push(["Cryptsk-Bandwidth-Max-Up", String(upBps)]);
  if (rateLimitStr) checkAttrs.push(["Cryptsk-Rate-Limit", rateLimitStr]);

  // 4. Data limit (multiple formats for NAS compatibility)
  if (dataLimitBytes > 0) {
    checkAttrs.push(["ChilliSpot-Max-Total-Octets", String(dataLimitBytes)]);
    checkAttrs.push(["Mikrotik-Recv-Limit", String(Math.floor(dataLimitBytes / 2))]);
    checkAttrs.push(["Mikrotik-Xmit-Limit", String(Math.floor(dataLimitBytes / 2))]);
    checkAttrs.push(["Cryptsk-Data-Limit", String(dataLimitMbVal)]);
  }

  // 5. FUP speeds (if set)
  if (fupDownBps) checkAttrs.push(["Cryptsk-FUP-Speed-Down", String(fupDownBps)]);
  if (fupUpBps) checkAttrs.push(["Cryptsk-FUP-Speed-Up", String(fupUpBps)]);

  // 6. Burst info (if set)
  if (burstBps) checkAttrs.push(["Cryptsk-Burst-Speed", String(burstBps)]);
  if (burstDuration) checkAttrs.push(["Cryptsk-Burst-Duration", String(burstDuration)]);

  // 7. Validity days (informational VSA)
  if (validityDays) checkAttrs.push(["Cryptsk-Validity-Days", String(validityDays)]);

  // 8. Contention ratio (informational VSA)
  if (contentionRatio) checkAttrs.push(["Cryptsk-Contention-Ratio", contentionRatio]);

  // Insert all check attributes
  for (const [attr, val] of checkAttrs) {
    const escapedVal = val.replace(/'/g, "''");
    await db.$executeRawUnsafe(`
      INSERT INTO radgroupcheck (groupname, attribute, op, value) VALUES ('${grp}', '${attr}', ':=', '${escapedVal}')
    `);
  }
}

/**
 * Remove a RADIUS group from FreeRADIUS tables
 */
export async function removeGroupFromFreeRADIUS(groupName: string) {
  const grp = groupName.replace(/'/g, "''");
  await db.$executeRawUnsafe(`DELETE FROM radgroupreply WHERE groupname = '${grp}'`);
  await db.$executeRawUnsafe(`DELETE FROM radgroupcheck WHERE groupname = '${grp}'`);
  await db.$executeRawUnsafe(`DELETE FROM radusergroup WHERE groupname = '${grp}'`);
}

/**
 * Block a user in FreeRADIUS by adding Auth-Type=Reject to radcheck
 * This keeps all other radcheck entries (password, Simultaneous-Use) intact
 */
export async function blockUserInFreeRADIUS(username: string) {
  const uname = username.replace(/'/g, "''");
  // Remove any existing Auth-Type rows first, then add Reject
  await db.$executeRawUnsafe(`DELETE FROM radcheck WHERE username = '${uname}' AND attribute = 'Auth-Type'`);
  await db.$executeRawUnsafe(`
    INSERT INTO radcheck (username, attribute, op, value) VALUES ('${uname}', 'Auth-Type', ':=', 'Reject')
  `);
}

/**
 * Unblock a user in FreeRADIUS by removing Auth-Type=Reject from radcheck
 */
export async function unblockUserInFreeRADIUS(username: string) {
  const uname = username.replace(/'/g, "''");
  await db.$executeRawUnsafe(`DELETE FROM radcheck WHERE username = '${uname}' AND attribute = 'Auth-Type'`);
}

/**
 * Update a user's Simultaneous-Use in radcheck
 */
export async function updateUserSimultaneousUse(username: string, maxSessions: number) {
  const uname = username.replace(/'/g, "''");
  await db.$executeRawUnsafe(`
    INSERT INTO radcheck (username, attribute, op, value) VALUES ('${uname}', 'Simultaneous-Use', ':=', '${maxSessions}')
    ON CONFLICT (username, attribute) DO UPDATE SET value = '${maxSessions}'
  `);
}

/**
 * Update a user's password in radcheck
 */
export async function updateUserPasswordInFreeRADIUS(username: string, newPassword: string) {
  const uname = username.replace(/'/g, "''");
  const pwd = newPassword.replace(/'/g, "''");
  await db.$executeRawUnsafe(`
    UPDATE radcheck SET value = '${pwd}' WHERE username = '${uname}' AND attribute = 'Cleartext-Password'
  `);
}
