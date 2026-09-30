/**
 * Cryptsk — FreeRADIUS Table Sync Utilities
 * 
 * Centralized functions to sync subscriber/plan data to FreeRADIUS tables:
 * radcheck, radreply, radusergroup, radgroupcheck, radgroupreply
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
  const uname = username.replace(/'/g, "''");
  const attr = attribute.replace(/'/g, "''");
  const val = value.replace(/'/g, "''");
  const updated = await db.$executeRawUnsafe(
    `UPDATE ${table} SET value = '${val}', op = '${op}' WHERE username = '${uname}' AND attribute = '${attr}'`
  );
  if (updated === 0) {
    await db.$executeRawUnsafe(
      `INSERT INTO ${table} (username, attribute, op, value) VALUES ('${uname}', '${attr}', '${op}', '${val}')`
    );
  }
}

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
  await upsertUserRow("radcheck", uname, "Cleartext-Password", ":=", pwd);

  // Upsert radcheck: Simultaneous-Use (login limit)
  await upsertUserRow("radcheck", uname, "Simultaneous-Use", ":=", String(maxSessions));

  // Upsert radreply: Mikrotik-Rate-Limit from group
  if (rateLimit) {
    await upsertUserRow("radreply", uname, "Mikrotik-Rate-Limit", ":=", rateLimit);
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
      await upsertUserRow("radreply", uname, "Mikrotik-Rate-Limit", ":=", rateLimit);
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
  const grp = groupName.replace(/'/g, "''");
  const { downloadSpeed, uploadSpeed, dataLimitMb, maxSessions } = options;

  // Clear existing attributes for this group
  await db.$executeRawUnsafe(`DELETE FROM radgroupreply WHERE groupname = '${grp}'`);
  await db.$executeRawUnsafe(`DELETE FROM radgroupcheck WHERE groupname = '${grp}'`);

  // Add Mikrotik-Rate-Limit to radgroupreply
  // Input is in Mbps — format directly as Xm/Ym for Mikrotik
  if (downloadSpeed && uploadSpeed) {
    await db.$executeRawUnsafe(`
      INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES ('${grp}', 'Mikrotik-Rate-Limit', ':=', '${downloadSpeed}M/${uploadSpeed}M')
    `);
  }

  // Add data limit as ChilliSpot-Max-Total-Octets if specified
  if (dataLimitMb && dataLimitMb > 0) {
    const bytes = dataLimitMb * 1024 * 1024;
    await db.$executeRawUnsafe(`
      INSERT INTO radgroupcheck (groupname, attribute, op, value) VALUES ('${grp}', 'ChilliSpot-Max-Total-Octets', ':=', '${bytes}')
    `);
  }

  // Add Simultaneous-Use (login limit) to radgroupcheck
  if (maxSessions && maxSessions > 0) {
    await db.$executeRawUnsafe(`
      INSERT INTO radgroupcheck (groupname, attribute, op, value) VALUES ('${grp}', 'Simultaneous-Use', ':=', '${maxSessions}')
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
  await upsertUserRow("radcheck", uname, "Simultaneous-Use", ":=", String(maxSessions));
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
