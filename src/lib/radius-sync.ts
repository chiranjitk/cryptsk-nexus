/**
 * Cryptsk — FreeRADIUS Table Sync Utilities
 *
 * Centralized functions to sync subscriber/plan data to FreeRADIUS tables:
 * radcheck, radreply, radusergroup, radgroupcheck, radgroupreply
 *
 * [AUDIT-FIX F-18] All statements now use Prisma tagged-template raw queries
 * ($executeRaw / $queryRaw) with REAL parameter binding — the previous
 * hand-rolled quote-doubling (`value.replace(/'/g, "''")`) was injection-safe
 * only by convention, and one missed escape would have been an incident.
 */

import { db } from './db';

/**
 * Upsert a single-valued radcheck/radreply row (UPDATE first, INSERT if absent).
 * NOTE: radcheck/radreply only have NON-unique indexes on (username, attribute),
 * so `ON CONFLICT (username, attribute)` fails with PG 42P10 — an UPDATE-first
 * upsert is the safe pattern here. This previously caused silent stale
 * Mikrotik-Rate-Limit replies after plan changes.
 */
async function upsertUserRow(table: "radcheck" | "radreply", username: string, attribute: string, op: string, value: string) {
  // Table name is from a fixed union type (never user input) — safe to interpolate.
  // All values are bound via $n placeholders (true parameterization, no escaping).
  const updated = await db.$executeRawUnsafe(
    `UPDATE ${table} SET value = $1, op = $2 WHERE username = $3 AND attribute = $4`,
    value, op, username, attribute
  );
  if (updated === 0) {
    await db.$executeRawUnsafe(
      `INSERT INTO ${table} (username, attribute, op, value) VALUES ($1, $2, $3, $4)`,
      username, attribute, op, value
    );
  }
}

/**
 * Sync a user to FreeRADIUS tables (radcheck, radreply, radusergroup)
 */
export async function syncUserToFreeRADIUS(
  username: string,
  password: string,
  groupName: string | null,
  maxSessions: number = 1,
  fallbackRateLimit?: string | null
) {
  // Get rate limit from group's radgroupreply, or use fallback from plan speeds
  let rateLimit: string | null = null;
  if (groupName) {
    const rows = await db.$queryRawUnsafe<{ value: string }[]>(
      `SELECT value FROM radgroupreply WHERE groupname = $1 AND attribute = 'Mikrotik-Rate-Limit' LIMIT 1`,
      groupName
    );
    rateLimit = rows[0]?.value || null;
  }
  // Fallback: if group has no rate-limit in radgroupreply, use the caller-provided one
  if (!rateLimit && fallbackRateLimit) {
    rateLimit = fallbackRateLimit;
  }

  // Upsert radcheck: Cleartext-Password
  await upsertUserRow("radcheck", username, "Cleartext-Password", ":=", password);

  // Upsert radcheck: Simultaneous-Use (login limit)
  await upsertUserRow("radcheck", username, "Simultaneous-Use", ":=", String(maxSessions));

  // Upsert radreply: Mikrotik-Rate-Limit from group
  if (rateLimit) {
    await upsertUserRow("radreply", username, "Mikrotik-Rate-Limit", ":=", rateLimit);
  }

  // Upsert radreply: Framed-IP-Address (if subscriber has static IP — caller can add after)

  // Upsert radusergroup
  if (groupName) {
    await db.$executeRaw`
      INSERT INTO radusergroup (username, groupname, priority) VALUES (${username}, ${groupName}, 1)
      ON CONFLICT DO NOTHING
    `;
  }
}

/**
 * Remove a user from FreeRADIUS tables
 */
export async function removeUserFromFreeRADIUS(username: string) {
  await db.$executeRaw`DELETE FROM radcheck WHERE username = ${username}`;
  await db.$executeRaw`DELETE FROM radreply WHERE username = ${username}`;
  await db.$executeRaw`DELETE FROM radusergroup WHERE username = ${username}`;
}

/**
 * Update a user's group in FreeRADIUS tables
 */
export async function updateUserFreeRADIUSGroup(
  username: string,
  newGroup: string | null
) {
  // Remove old group assignments
  await db.$executeRaw`DELETE FROM radusergroup WHERE username = ${username}`;

  if (newGroup) {
    // Add new group assignment
    await db.$executeRaw`
      INSERT INTO radusergroup (username, groupname, priority) VALUES (${username}, ${newGroup}, 1)
      ON CONFLICT DO NOTHING
    `;

    // Update rate limit reply from new group
    const rows = await db.$queryRawUnsafe<{ value: string }[]>(
      `SELECT value FROM radgroupreply WHERE groupname = $1 AND attribute = 'Mikrotik-Rate-Limit' LIMIT 1`,
      newGroup
    );
    const rateLimit = rows[0]?.value;

    if (rateLimit) {
      await upsertUserRow("radreply", username, "Mikrotik-Rate-Limit", ":=", rateLimit);
    }
  }
}

/**
 * Sync a RADIUS group's attributes to radgroupcheck and radgroupreply
 * Called when a plan is created/updated with auto RADIUS group
 */
export async function syncGroupToFreeRADIUS(
  groupName: string,
  options: {
    downloadSpeed?: number;  // in kbps
    uploadSpeed?: number;    // in kbps
    dataLimitMb?: number;   // in MB
    maxSessions?: number;   // Simultaneous-Use
  }
) {
  const { downloadSpeed, uploadSpeed, dataLimitMb, maxSessions } = options;

  // Clear existing attributes for this group
  await db.$executeRaw`DELETE FROM radgroupreply WHERE groupname = ${groupName}`;
  await db.$executeRaw`DELETE FROM radgroupcheck WHERE groupname = ${groupName}`;

  // Add Mikrotik-Rate-Limit to radgroupreply
  // Input is in Mbps — format directly as Xm/Ym for Mikrotik
  if (downloadSpeed && uploadSpeed) {
    const rateLimit = `${downloadSpeed}M/${uploadSpeed}M`;
    await db.$executeRaw`
      INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES (${groupName}, 'Mikrotik-Rate-Limit', ':=', ${rateLimit})
    `;
  }

  // Add data limit as ChilliSpot-Max-Total-Octets if specified
  if (dataLimitMb && dataLimitMb > 0) {
    const bytes = dataLimitMb * 1024 * 1024;
    await db.$executeRaw`
      INSERT INTO radgroupcheck (groupname, attribute, op, value) VALUES (${groupName}, 'ChilliSpot-Max-Total-Octets', ':=', ${bytes})
    `;
  }

  // Add Simultaneous-Use (login limit) to radgroupcheck
  if (maxSessions && maxSessions > 0) {
    await db.$executeRaw`
      INSERT INTO radgroupcheck (groupname, attribute, op, value) VALUES (${groupName}, 'Simultaneous-Use', ':=', ${maxSessions})
    `;
  }
}

/**
 * Remove a RADIUS group from FreeRADIUS tables
 */
export async function removeGroupFromFreeRADIUS(groupName: string) {
  await db.$executeRaw`DELETE FROM radgroupreply WHERE groupname = ${groupName}`;
  await db.$executeRaw`DELETE FROM radgroupcheck WHERE groupname = ${groupName}`;
  await db.$executeRaw`DELETE FROM radusergroup WHERE groupname = ${groupName}`;
}

/**
 * Block a user in FreeRADIUS by adding Auth-Type=Reject to radcheck
 * This keeps all other radcheck entries (password, Simultaneous-Use) intact
 */
export async function blockUserInFreeRADIUS(username: string) {
  // Remove any existing Auth-Type rows first, then add Reject
  await db.$executeRaw`DELETE FROM radcheck WHERE username = ${username} AND attribute = 'Auth-Type'`;
  await db.$executeRaw`
    INSERT INTO radcheck (username, attribute, op, value) VALUES (${username}, 'Auth-Type', ':=', 'Reject')
  `;
}

/**
 * Unblock a user in FreeRADIUS by removing Auth-Type=Reject from radcheck
 */
export async function unblockUserInFreeRADIUS(username: string) {
  await db.$executeRaw`DELETE FROM radcheck WHERE username = ${username} AND attribute = 'Auth-Type'`;
}

/**
 * Update a user's Simultaneous-Use in radcheck
 */
export async function updateUserSimultaneousUse(username: string, maxSessions: number) {
  await upsertUserRow("radcheck", username, "Simultaneous-Use", ":=", String(maxSessions));
}

/**
 * Update a user's password in radcheck
 */
export async function updateUserPasswordInFreeRADIUS(username: string, newPassword: string) {
  await db.$executeRaw`
    UPDATE radcheck SET value = ${newPassword} WHERE username = ${username} AND attribute = 'Cleartext-Password'
  `;
}
