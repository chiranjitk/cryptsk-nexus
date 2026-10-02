/**
 * FreeRADIUS NAS Table & clients.conf Sync Utility
 *
 * Shared between:
 *   - src/app/api/wifi/nas/route.ts        (NAS Clients CRUD)
 *   - src/app/api/integrations/wifi-gateways/route.ts  (WiFi Controller auto-create)
 *
 * Performs:
 *   1. INSERT/UPDATE/DELETE on the FreeRADIUS native `nas` table
 *   2. Update the StaySuite reference section in /etc/raddb/clients.conf
 *      (documentation only — actual clients are loaded via read_clients=yes in SQL)
 *   3. Reload FreeRADIUS (systemctl restart or SIGHUP)
 */

import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { CLIENTS_CONF, RADDB_PATH } from '@/lib/wifi/paths';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { promises as fsp } from 'fs';
import * as path from 'path';

// Section markers for StaySuite reference block in clients.conf
const STAYSUITE_CLIENT_BEGIN = '# >>> StaySuite Managed NAS Clients BEGIN <<<';
const STAYSUITE_CLIENT_END = '# >>> StaySuite Managed NAS Clients END <<<';

/**
 * Insert a NAS client into the FreeRADIUS native `nas` table.
 * Returns true on success, false on failure (never throws).
 */
export async function insertFreeRadiusNas(opts: {
  ipAddress: string;
  shortname?: string;
  type?: string;
  secret: string;
  coaPort?: number;
  description?: string;
}): Promise<boolean> {
  try {
    await db.$executeRaw(Prisma.sql`
      INSERT INTO nas (nasname, shortname, type, ports, secret, server, community, description)
      VALUES (${opts.ipAddress}, ${opts.shortname || opts.ipAddress}, ${opts.type || 'other'}, ${opts.coaPort || 3799}, ${opts.secret}, NULL, NULL, ${opts.description || opts.ipAddress})
    `);
    return true;
  } catch (err) {
    console.warn('[NAS-Sync] Failed to insert into FreeRADIUS nas table:', err);
    return false;
  }
}

/**
 * Delete a NAS client from the FreeRADIUS native `nas` table by IP.
 * Returns true on success, false on failure (never throws).
 */
export async function deleteFreeRadiusNas(ipAddress: string): Promise<boolean> {
  try {
    await db.$executeRaw(Prisma.sql`DELETE FROM nas WHERE nasname = ${ipAddress}`);
    return true;
  } catch (err) {
    console.warn('[NAS-Sync] Failed to delete from FreeRADIUS nas table:', err);
    return false;
  }
}

/**
 * Update a NAS client in the FreeRADIUS native `nas` table.
 * Returns true on success, false on failure (never throws).
 */
export async function updateFreeRadiusNas(
  oldIpAddress: string,
  opts: {
    ipAddress?: string;
    shortname?: string;
    type?: string;
    secret?: string;
    coaPort?: number;
    description?: string;
  }
): Promise<boolean> {
  try {
    await db.$executeRaw(Prisma.sql`
      UPDATE nas SET nasname = ${opts.ipAddress || oldIpAddress}, shortname = ${opts.shortname || opts.ipAddress || oldIpAddress}, type = ${opts.type || 'other'}, ports = ${opts.coaPort || 3799}, secret = ${opts.secret || 'changeme'}, description = ${opts.description || opts.ipAddress || oldIpAddress}
      WHERE nasname = ${oldIpAddress}
    `);
    return true;
  } catch (err) {
    console.warn('[NAS-Sync] Failed to update FreeRADIUS nas table:', err);
    return false;
  }
}

/**
 * Update the StaySuite reference section in clients.conf from PostgreSQL nas table.
 *
 * IMPORTANT: Since read_clients = yes is set in mods-enabled/sql, FreeRADIUS loads
 * ALL NAS clients directly from the `nas` table in PostgreSQL. We do NOT write
 * actual client blocks here — that would cause "Failed to add duplicate client"
 * errors. This section is for documentation/auditing only.
 *
 * Called after every NAS create/update/delete to keep the reference in sync.
 */
export async function syncClientsConf(): Promise<boolean> {
  try {
    // Read all NAS clients from PostgreSQL nas table
    const rows = await db.$queryRaw<Array<{
      nasname: string; shortname: string; type: string; ports: number; secret: string; description: string;
    }>>(Prisma.sql`SELECT nasname, shortname, type, ports, secret, description FROM nas ORDER BY id`);

    // Build reference-only section (NO actual client blocks — loaded via read_clients=yes from SQL)
    const lines: string[] = [STAYSUITE_CLIENT_BEGIN];
    lines.push('# NAS clients are loaded from SQL (nas table) via read_clients = yes.');
    lines.push('# DO NOT add client definitions here — they will duplicate the SQL entries.');
    if (rows.length > 0) {
      const names = rows.map(r => {
        const desc = r.description || r.shortname || r.nasname;
        return `${desc} (${r.nasname})`;
      }).join(', ');
      lines.push(`# Active clients: ${names}`);
    } else {
      lines.push('# Active clients: (none)');
    }
    lines.push(STAYSUITE_CLIENT_END);
    const managedSection = lines.join('\n');

    // Read existing clients.conf or start empty
    let existingContent = '';
    try {
      existingContent = readFileSync(CLIENTS_CONF, 'utf-8');
    } catch {
      // File doesn't exist yet — create with header
      existingContent = `# clients.conf — StaySuite RADIUS Clients
#
# NOTE: NAS clients are loaded from SQL (nas table) via read_clients = yes
# in mods-enabled/sql. Static client definitions here are only used as
# fallback when SQL is unavailable.
#
# DO NOT add a catch-all localnet — it conflicts with SQL-loaded NAS entries
# and causes shared secret mismatches. Each NAS must have its exact secret
# defined in the nas table.
\n`;
    }

    // Replace or append our managed section
    let newContent: string;
    const beginIdx = existingContent.indexOf(STAYSUITE_CLIENT_BEGIN);
    const endIdx = existingContent.indexOf(STAYSUITE_CLIENT_END);

    if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
      newContent = existingContent.slice(0, beginIdx) + managedSection + existingContent.slice(endIdx + STAYSUITE_CLIENT_END.length);
    } else {
      newContent = existingContent + (existingContent.length > 0 ? '\n' : '') + managedSection + '\n';
    }

    writeFileSync(CLIENTS_CONF, newContent, 'utf-8');

    // Set ownership for production
    try {
      execSync(`chown radiusd:radiusd "${CLIENTS_CONF}" && chmod 640 "${CLIENTS_CONF}"`, { timeout: 3000 });
    } catch {
      // Sandbox or non-root — ignore
    }

    // Reload FreeRADIUS to pick up changes (radiusd on Rocky/RHEL/CentOS)
    const restartCmds = [
      'systemctl restart radiusd',
    ];
    let restarted = false;
    for (const cmd of restartCmds) {
      try {
        execSync(cmd, { timeout: 10000 });
        restarted = true;
        break;
      } catch { /* try next */ }
    }
    if (!restarted) {
      // Fallback: try SIGHUP to existing process (both process names)
      try {
        const pid = execSync("pgrep -x radiusd | head -1 || pgrep -x freeradius | head -1", { encoding: 'utf-8', timeout: 3000 }).trim();
        if (pid) process.kill(Number(pid), 'SIGHUP');
      } catch { /* ignore */ }
    }

    console.log(`[NAS-Sync] Synced ${rows.length} NAS clients reference to ${CLIENTS_CONF}`);
    return true;
  } catch (error) {
    console.error('[NAS-Sync] Failed to sync clients.conf:', error);
    return false;
  }
}

// ── EAP Module Toggle ─────────────────────────────────────────────

/** EAP-related auth method prefixes to detect (used by syncEapStatus) */
const EAP_AUTH_METHODS = ['eap', 'eap-tls', 'eap-ttls', 'eap-peap', 'eap-md5'];

/** Path to the EAP module symlink in mods-enabled */
const EAP_SYMLINK_PATH = path.join(RADDB_PATH, 'mods-enabled', 'eap');

/**
 * Enable or disable the FreeRADIUS EAP module by managing the symlink
 * in mods-enabled/.  Returns true on success, false on failure (never throws).
 */
export async function setEapModuleEnabled(enabled: boolean): Promise<boolean> {
  try {
    if (enabled) {
      // Ensure symlink exists: mods-enabled/eap → mods-available/eap
      try {
        const existingTarget = await fsp.readlink(EAP_SYMLINK_PATH);
        if (existingTarget) return true; // already linked
      } catch {
        // readlink failed — symlink doesn't exist, create it
      }
      await fsp.symlink('../mods-available/eap', EAP_SYMLINK_PATH);
      console.log('[NAS-Sync] EAP module enabled (symlink created)');
    } else {
      // Remove symlink to disable EAP
      try {
        await fsp.unlink(EAP_SYMLINK_PATH);
        console.log('[NAS-Sync] EAP module disabled (symlink removed)');
      } catch (err: unknown) {
        if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
          // Already removed — not an error
          return true;
        }
        throw err;
      }
    }
    return true;
  } catch (err) {
    console.warn('[NAS-Sync] Failed to toggle EAP module symlink:', err);
    return false;
  }
}

/**
 * Check whether ANY active NAS client for a given property uses EAP auth methods.
 * Automatically enables/disables the FreeRADIUS EAP module symlink accordingly.
 *
 * This prevents unnecessary EAP overhead when all NAS clients use PAP/CHAP only.
 * Called after every NAS create/update/delete operation.
 *
 * @param propertyId - The property UUID to check NAS clients for.
 *   If null/undefined, checks ALL NAS clients across all properties.
 */
export async function syncEapStatus(propertyId?: string): Promise<void> {
  try {
    // Query active NAS clients for the property (or all if no propertyId)
    const rows = await db.$queryRaw<Array<{ authMethods: string | null }>>(
      propertyId
        ? Prisma.sql`SELECT "authMethods" FROM "RadiusNAS" WHERE "propertyId" = ${propertyId}::uuid AND status = 'active'`
        : Prisma.sql`SELECT "authMethods" FROM "RadiusNAS" WHERE status = 'active'`
    );

    // Check if ANY NAS uses EAP-related auth methods
    const needsEap = rows.some(row => {
      if (!row.authMethods) return false;
      const methods = row.authMethods.toLowerCase().split(',').map(s => s.trim());
      return methods.some(m => EAP_AUTH_METHODS.includes(m));
    });

    await setEapModuleEnabled(needsEap);
    console.log(`[NAS-Sync] EAP auto-sync: needsEap=${needsEap} (checked ${rows.length} NAS clients${propertyId ? ` for property ${propertyId}` : ''})`);
  } catch (err) {
    console.error('[NAS-Sync] syncEapStatus failed:', err);
    // Never throw — EAP toggle is best-effort
  }
}
