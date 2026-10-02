/**
 * WiFi User Service
 * 
 * Handles provisioning and deprovisioning of WiFi users.
 * This is the PMS-side logic that manages the RADIUS database.
 * 
 * Architecture (PostgreSQL database):
 * ┌─────────────────────────────────────────────────────┐
 * │  PostgreSQL database                                │
 * │  ┌──────────────┐  ┌──────────────┐                 │
 * │  │ WiFiUser     │  │ RadCheck     │                 │
 * │  │ RadReply     │  │ RadUserGroup │                 │
 * │  │ RadGroupCheck│  │ RadGroupReply│                 │
 * │  └──────────────┘  └──────────────┘                 │
 * └──────────┬──────────────────┬───────────────────────┘
 *            │                  │
 *   PMS (Prisma)        FreeRADIUS Service (:3010)
 *   writes RadCheck      reads RadCheck for auth
 *   writes RadReply      reads RadReply for attrs
 * 
 * No sync needed — both services read/write the SAME database.
 * When you move to PostgreSQL, just change DATABASE_URL.
 * 
 * DO: PMS = source of truth for user data
 * DO: Use transaction for provisioning operations
 * DO NOT: Implement RADIUS protocol in Node.js
 * DO NOT: Build DHCP/DNS in PMS
 *
 * SECURITY NOTE (L-34): Passwords stored as Cleartext-Password in radcheck
 * are required by FreeRADIUS PAP authentication (RFC 2865). This is an
 * accepted industry-standard trade-off. Ensure database is segmented from
 * guest networks and all connections use TLS. See provisionUser() L-34
 * block for detailed justification and mitigations.
 */

import { db } from '@/lib/db';
import { randomBytes, randomInt } from 'crypto';
import {
  getActiveNASVendors,
  generateBandwidthAttributes,
  generateSessionAttributes,
  generateIdleTimeoutAttributes,
  readDataLimitBytes,
  BANDWIDTH_ATTRIBUTES,
  DATA_LIMIT_ATTRIBUTES,
  normalizeSpeedToMbps,
} from '@/lib/wifi/utils/vendor-attributes';

const RADIUS_SERVICE_URL = process.env.RADIUS_SERVICE_URL || 'http://127.0.0.1:3010';

// ─── Plan → RADIUS Group Name Conversion ──────────────────────────────
/**
 * Convert a WiFiPlan name to a RADIUS-safe group name.
 * "VIP Suite Plan" → "vip_suite_plan"
 * "Free WiFi" → "free_wifi"
 * "Business Class" → "business_class_p444017d5"
 *
 * The plan ID suffix (first 8 hex chars of the UUID, dashes stripped) ensures
 * globally unique group names even when two tenants have plans with the same
 * name. Without this suffix, "VIP Suite" in tenant A and "VIP Suite" in
 * tenant B would share the same RADIUS group, causing plan changes for one
 * tenant to inadvertently affect the other.
 *
 * IMPORTANT: After introducing the plan ID suffix, existing RADIUS groups
 * (radgroupcheck, radgroupreply, radusergroup) that used the old format without
 * the _p<shortId> suffix will no longer match. A one-time re-sync of all plans
 * is required to update group names in the RADIUS database.
 */
export function planNameToGroupName(planName: string, planId: string): string {
  const base = planName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (!base) throw new Error(`Cannot generate group name from empty plan name: "${planName}"`);
  const shortId = planId.replace(/-/g, '').substring(0, 8);
  return `${base}_p${shortId}`;
}

/**
 * Sync a WiFiPlan's attributes to radgroupcheck/radgroupreply (group-level).
 * Called when a plan is created or updated.
 *
 * Group-level attributes are the PRIMARY source of RADIUS policies.
 * Individual users inherit these via radusergroup. User-level radreply
 * should only contain per-user OVERRIDES (e.g., session timeout based on checkout).
 *
 * radgroupcheck: Session-Timeout, Simultaneous-Use, data limits (access checks)
 * radgroupreply: bandwidth, idle timeout, data limits, Cryptsk VSAs (authorization)
 */
export async function syncRadiusGroup(plan: {
  id: string;
  name: string;
  tenantId: string;
  downloadSpeed: number;
  uploadSpeed: number;
  burstDownloadSpeed?: number | null;
  burstUploadSpeed?: number | null;
  dataLimit?: number | null;
  sessionLimit?: number | null;
  maxDevices?: number | null;
  sessionTimeoutSec?: number | null;
  idleTimeoutSec?: number | null;
}, propertyId?: string, parentTx?: any): Promise<void> {
  const groupName = planNameToGroupName(plan.name, plan.id);
  const vendors = await getActiveNASVendors(propertyId);
  const downloadMbps = plan.downloadSpeed || 10;
  const uploadMbps = plan.uploadSpeed || 5;
  const sessionTimeoutSec = plan.sessionTimeoutSec || 0;
  const idleTimeoutSec = plan.idleTimeoutSec || 0;
  const dataLimitMB = plan.dataLimit || 0;
  // maxDevices takes priority over sessionLimit for Simultaneous-Use
  const sessionLimit = plan.maxDevices || plan.sessionLimit || 0;

  const runInTx = parentTx
    ? async (fn: (tx: any) => Promise<void>) => fn(parentTx) // Reuse parent transaction (no nesting)
    : async (fn: (tx: any) => Promise<void>) => db.$transaction(fn);

  await runInTx(async (tx) => {
    // ── Delete old group entries ──
    await tx.radGroupCheck.deleteMany({ where: { groupname: groupName } });
    await tx.radGroupReply.deleteMany({ where: { groupname: groupName } });

    // ── radgroupcheck: Access control attributes ──
    const groupChecks: Array<{ attribute: string; op: string; value: string; priority: number }> = [];

    // Session-Timeout (check: reject if exceeded)
    if (sessionTimeoutSec > 0) {
      groupChecks.push({ attribute: 'Session-Timeout', op: ':=', value: String(sessionTimeoutSec), priority: 10 });
    }

    // Simultaneous-Use (check: max concurrent sessions)
    if (sessionLimit > 0) {
      groupChecks.push({ attribute: 'Simultaneous-Use', op: ':=', value: String(sessionLimit), priority: 20 });
    }

    // Cryptsk-Vendor-Specific checks (only when Cryptsk is active NAS)
    if (vendors.includes('cryptsk')) {
      // Cryptsk bandwidth check attrs
      groupChecks.push(
        { attribute: 'Cryptsk-Rate-Limit', op: ':=', value: `${downloadMbps}M/${uploadMbps}M`, priority: 30 },
        { attribute: 'Cryptsk-Bandwidth-Max-Down', op: ':=', value: String(downloadMbps * 1000000), priority: 31 },
        { attribute: 'Cryptsk-Bandwidth-Max-Up', op: ':=', value: String(uploadMbps * 1000000), priority: 32 },
      );

      if (sessionTimeoutSec > 0) {
        groupChecks.push({ attribute: 'Cryptsk-Session-Timeout', op: ':=', value: String(sessionTimeoutSec), priority: 33 });
      }
      if (dataLimitMB > 0) {
        groupChecks.push({ attribute: 'Cryptsk-Total-Limit', op: ':=', value: String(dataLimitMB * 1024 * 1024), priority: 34 });
      }
    }

    // ── radgroupreply: Authorization attributes (returned to NAS on Access-Accept) ──
    const groupReplies: Array<{ attribute: string; op: string; value: string; priority: number }> = [];

    // WISPr bandwidth (universal baseline)
    groupReplies.push(
      { attribute: 'WISPr-Bandwidth-Max-Down', op: ':=', value: String(downloadMbps * 1000000), priority: 0 },
      { attribute: 'WISPr-Bandwidth-Max-Up', op: ':=', value: String(uploadMbps * 1000000), priority: 1 },
    );

    // Session attributes (RFC standard)
    if (sessionTimeoutSec > 0) {
      groupReplies.push({ attribute: 'Session-Timeout', op: ':=', value: String(sessionTimeoutSec), priority: 10 });
    }
    if (idleTimeoutSec > 0) {
      groupReplies.push({ attribute: 'Idle-Timeout', op: ':=', value: String(idleTimeoutSec), priority: 11 });
    }
    // Termination-Action: RADIUS-Request (allows re-auth after disconnect)
    groupReplies.push({ attribute: 'Termination-Action', op: ':=', value: 'RADIUS-Request', priority: 12 });
    // Acct-Interim-Interval: default 60s
    groupReplies.push({ attribute: 'Acct-Interim-Interval', op: ':=', value: '60', priority: 13 });

    // NOTE: Max-Total-Octets / Max-Input-Octets / Max-Output-Octets are NOT
    // defined in any FreeRADIUS dictionary and cause SQL module failures.
    // Data limits are handled via vendor-specific attributes below.

    // Cryptsk VSAs (only when Cryptsk is active NAS)
    if (vendors.includes('cryptsk')) {
      if (idleTimeoutSec > 0) {
        groupReplies.push({ attribute: 'Cryptsk-Idle-Timeout', op: ':=', value: String(idleTimeoutSec), priority: 30 });
      }
      groupReplies.push(
        { attribute: 'Cryptsk-User-Profile', op: ':=', value: groupName, priority: 40 },
        { attribute: 'Cryptsk-Plan-Name', op: ':=', value: plan.name, priority: 41 },
      );
      // Burst ceil (0 or null = no burst, ceil = rate)
      const burstDownVal = (plan.burstDownloadSpeed && plan.burstDownloadSpeed > 0) ? plan.burstDownloadSpeed * 1000000 : 0;
      const burstUpVal = (plan.burstUploadSpeed && plan.burstUploadSpeed > 0) ? plan.burstUploadSpeed * 1000000 : 0;
      if (burstDownVal > 0) {
        groupReplies.push({ attribute: 'Cryptsk-Bandwidth-Ceil-Down', op: ':=', value: String(burstDownVal), priority: 44 });
      }
      if (burstUpVal > 0) {
        groupReplies.push({ attribute: 'Cryptsk-Bandwidth-Ceil-Up', op: ':=', value: String(burstUpVal), priority: 45 });
      }

      if (dataLimitMB > 0) {
        const dataLimitBytes = dataLimitMB * 1024 * 1024;
        groupReplies.push(
          { attribute: 'Cryptsk-Max-Input-Octets', op: ':=', value: String(dataLimitBytes), priority: 46 },
          { attribute: 'Cryptsk-Max-Output-Octets', op: ':=', value: String(dataLimitBytes), priority: 47 },
        );
      }
    }

    // MikroTik vendor attrs
    if (vendors.includes('mikrotik')) {
      groupReplies.push({ attribute: 'Mikrotik-Rate-Limit', op: ':=', value: `${uploadMbps}M/${downloadMbps}M`, priority: 50 });
      if (dataLimitMB > 0) {
        groupReplies.push({ attribute: 'Mikrotik-Total-Limit', op: ':=', value: String(dataLimitMB * 1024 * 1024), priority: 51 });
      }
    }

    // ChilliSpot/Coova vendor attrs (fallback for unknown vendors)
    if (vendors.includes('chillispot') || vendors.includes('other')) {
      groupReplies.push(
        { attribute: 'ChilliSpot-Bandwidth-Max-Down', op: ':=', value: String(downloadMbps * 1000000), priority: 60 },
        { attribute: 'ChilliSpot-Bandwidth-Max-Up', op: ':=', value: String(uploadMbps * 1000000), priority: 61 },
      );
      if (dataLimitMB > 0) {
        const dataLimitBytes = dataLimitMB * 1024 * 1024;
        groupReplies.push(
          { attribute: 'ChilliSpot-Max-Total-Octets', op: ':=', value: String(dataLimitBytes), priority: 62 },
          { attribute: 'ChilliSpot-Max-Input-Octets', op: ':=', value: String(dataLimitBytes), priority: 63 },
          { attribute: 'ChilliSpot-Max-Output-Octets', op: ':=', value: String(dataLimitBytes), priority: 64 },
        );
      }
    }

    // ── Bulk insert ──
    if (groupChecks.length > 0) {
      await tx.radGroupCheck.createMany({
        data: groupChecks.map(c => ({ groupname: groupName, ...c })),
      });
    }
    if (groupReplies.length > 0) {
      await tx.radGroupReply.createMany({
        data: groupReplies.map(r => ({ groupname: groupName, ...r })),
      });
    }

    console.log(`[RADIUS Group] Synced group "${groupName}" (${groupChecks.length} checks, ${groupReplies.length} replies)`);
  });
}

/**
 * Delete a RADIUS group's entries from radgroupcheck/radgroupreply.
 * Called when a plan is deleted.
 * Also removes radusergroup mappings that point to this group.
 */
export async function deleteRadiusGroup(planName: string, planId: string): Promise<void> {
  const groupName = planNameToGroupName(planName, planId);
  await db.$transaction(async (tx) => {
    await tx.radGroupCheck.deleteMany({ where: { groupname: groupName } });
    await tx.radGroupReply.deleteMany({ where: { groupname: groupName } });
    await tx.radUserGroup.deleteMany({ where: { groupname: groupName } });
    // Also clean up any legacy suffixed group names (e.g. "business_class_c7c7c7aa")
    await tx.radGroupCheck.deleteMany({ where: { groupname: { startsWith: groupName + '_' } } });
    await tx.radGroupReply.deleteMany({ where: { groupname: { startsWith: groupName + '_' } } });
    await tx.radUserGroup.deleteMany({ where: { groupname: { startsWith: groupName + '_' } } });
    console.log(`[RADIUS Group] Deleted group "${groupName}" (including legacy suffixed variants)`);
  });
}

/** Prisma unique constraint violation error code */
const PRISMA_UNIQUE_VIOLATION = 'P2002';

/**
 * Helper to call the freeradius-service API
 */
async function freeradiusRequest(endpoint: string, options: RequestInit = {}) {
  const url = `${RADIUS_SERVICE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!response.ok) {
    const errorBody = await response.text();
    let parsedError: Record<string, unknown>;
    try {
      parsedError = JSON.parse(errorBody);
    } catch {
      parsedError = { error: errorBody };
    }
    return { success: false, status: response.status, ...parsedError };
  }
  return response.json();
}

export interface WiFiUserCreateInput {
  tenantId: string;
  propertyId: string;
  guestId?: string;
  bookingId?: string;
  username?: string;
  password?: string;
  planId?: string;
  planName?: string; // Plan name for Cryptsk-Plan-Name and Cryptsk-User-Profile VSA
  validFrom: Date;
  validUntil: Date;
  userType?: 'guest' | 'staff' | 'admin' | 'service';
  downloadSpeed?: number;
  uploadSpeed?: number;
  sessionTimeoutMinutes?: number; // RADIUS Session-Timeout in minutes (from plan validityDays)
  idleTimeoutSeconds?: number; // Cryptsk-Idle-Timeout in seconds (from CaptivePortal.idleTimeout)
  sessionLimit?: number; // Max concurrent sessions (Simultaneous-Use RADIUS attribute)
  dataLimit?: number; // Data cap in MB (from plan dataLimit)
}

export interface WiFiUserUpdateInput {
  validUntil?: Date;
  downloadSpeed?: number;
  uploadSpeed?: number;
  sessionTimeoutMinutes?: number; // RADIUS Session-Timeout in minutes
  idleTimeoutSeconds?: number; // Cryptsk-Idle-Timeout in seconds
  sessionLimit?: number; // Max concurrent sessions
  dataLimit?: number;
  status?: 'active' | 'suspended' | 'expired' | 'revoked';
}

export class WiFiUserService {
  /**
   * Create a new WiFi user with RADIUS credentials
   * 
   * Since both PMS and FreeRADIUS service use the SAME PostgreSQL database,
   * writing to RadCheck/RadReply/RadUserGroup via Prisma is all that's needed.
   * The FreeRADIUS service will immediately see the new user.
   * 
   * Flow:
   * 1. Create WiFiUser record
   * 2. Create RadCheck (authentication) — same table FreeRADIUS reads
   * 3. Create RadReply (authorization policies) — same table FreeRADIUS reads
   * 4. Create RadUserGroup (plan group mapping) — links user to plan group
   */
  async provisionUser(input: WiFiUserCreateInput) {
    // Retry loop with fresh randomBytes on P2002 unique constraint error.
    // Only retry when username/password are auto-generated. If the caller
    // provides a specific username (e.g. voucher code), retrying with the
    // same username is pointless — skip retries and fail immediately so
    // the caller can handle recovery (e.g. reactivate existing user).
    const MAX_RETRIES = 3;
    const usernameExternallyProvided = !!input.username;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      // Regenerate random username on each retry (only when not externally provided)
      const username = input.username || this.generateUsername(input.propertyId);
      const password = input.password || this.generatePassword();

      try {
        return await db.$transaction(async (tx) => {
          // Resolve plan group name (radusergroup maps username → groupname)
          let groupName: string | null = null;
          let resolvedPlanName: string | null = null; // Human-readable plan name (for Cryptsk-Plan-Name)
          let planIdleTimeoutSec = 0;
          if (input.planId) {
            const plan = await tx.wiFiPlan.findUnique({
              where: { id: input.planId },
              select: { name: true, idleTimeoutSec: true, sessionTimeoutSec: true },
            });
            if (plan) {
              resolvedPlanName = plan.name;
              // Convert plan name to a RADIUS-safe group name (lowercase, underscores)
              groupName = planNameToGroupName(plan.name, input.planId);
              // Auto-read idle timeout from plan if not explicitly provided
              if (!input.idleTimeoutSeconds && plan.idleTimeoutSec) {
                planIdleTimeoutSec = plan.idleTimeoutSec;
              }
            }
          }
          const effectiveIdleTimeout = input.idleTimeoutSeconds || planIdleTimeoutSec;

          // 1. Create WiFiUser
          //    maxSessions comes from the plan's maxDevices (via sessionLimit param).
          //    This ensures the app-level session check (isSessionLimitReached) uses
          //    the plan's value, not the schema default of 1.
          const wifiUser = await tx.wiFiUser.create({
            data: {
              tenantId: input.tenantId,
              propertyId: input.propertyId,
              username,
              password,
              guestId: input.guestId,
              bookingId: input.bookingId,
              planId: input.planId,
              validFrom: input.validFrom,
              validUntil: input.validUntil,
              userType: input.userType || 'guest',
              maxSessions: input.sessionLimit || 1,
              status: 'active',
              radiusSynced: true, // Same DB — always synced
              radiusSyncedAt: new Date(),
            },
          });

          // 2. Create RadCheck (authentication — FreeRADIUS reads this table directly)
          //
          // SECURITY JUSTIFICATION (L-34): Cleartext password storage in radcheck
          // -------------------------------------------------------------------
          // FreeRADIUS uses the PAP (Password Authentication Protocol) which
          // requires the password in cleartext to perform the auth check. The
          // RADIUS server reads the "Cleartext-Password" attribute directly from
          // the radcheck table, hashes it with the request's password, and
          // compares the hashes. Storing only a hash would break this mechanism.
          //
          // Accepted risk: This is a documented, industry-standard trade-off
          // for RADIUS deployments (RFC 2865 §2.2). Mitigations:
          //   • Network segmentation: The PostgreSQL database holding radcheck
          //     MUST NOT be accessible from the guest network. Only the
          //     FreeRADIUS service and the PMS backend may connect.
          //   • Database-level permissions: Use a dedicated RADIUS DB role
          //     with SELECT-only access to radcheck/radreply tables.
          //   • TLS encryption: All connections between NAS ↔ RADIUS and
          //     RADIUS ↔ PostgreSQL should use TLS (RadSec / pg SSL).
          //   • Audit trail: WiFiUser.password field is only used internally
          //     and never exposed via API responses.
          await tx.radCheck.create({
            data: {
              wifiUserId: wifiUser.id,
              username,
              attribute: 'Cleartext-Password',
              op: ':=',
              value: password,
              isActive: true,
            },
          });

          // 3. Ensure group-level attributes exist (sync from plan → radgroupcheck/radgroupreply)
          //    FreeRADIUS reads group attrs via radusergroup → radgroupcheck/radgroupreply.
          //    This is the PRIMARY source of bandwidth, data limits, session policy.
          if (input.planId) {
            const planFull = await tx.wiFiPlan.findUnique({
              where: { id: input.planId },
            });
            if (planFull) {
              // Check if group already has entries (avoid re-sync on every provision)
              const existingGroupEntries = groupName
                ? await tx.radGroupCheck.count({ where: { groupname: groupName } })
                : 0;
              if (existingGroupEntries === 0 && groupName) {
                // Sync group attributes within the SAME transaction (no nesting)
                await syncRadiusGroup({
                  id: planFull.id,
                  name: planFull.name,
                  tenantId: planFull.tenantId,
                  downloadSpeed: planFull.downloadSpeed,
                  uploadSpeed: planFull.uploadSpeed,
                  burstDownloadSpeed: planFull.burstDownloadSpeed,
                  burstUploadSpeed: planFull.burstUploadSpeed,
                  dataLimit: planFull.dataLimit,
                  sessionLimit: planFull.sessionLimit,
                  sessionTimeoutSec: planFull.sessionTimeoutSec,
                  idleTimeoutSec: planFull.idleTimeoutSec,
                }, input.propertyId, tx);
              }
            }
          }

          // 4. Create per-user RadReply OVERRIDES only (not plan-level attributes)
          //    Group-level attrs (bandwidth, data limits, idle timeout) come from radgroupreply.
          //    User-level radreply should only contain:
          //      - Session-Timeout override (based on checkout date, not plan validity)
          //      - Cryptsk-Plan-Name / Cryptsk-User-Profile (per-user identity VSAs)
          //    DO NOT duplicate bandwidth/data-limit/idle-timeout here — they're in the group.
          const vendors = await getActiveNASVendors(input.propertyId);
          const userReplies: Array<{ attribute: string; value: string }> = [];

          // Per-user Session-Timeout override: based on booking checkout, NOT plan default
          // Group already has Session-Timeout from plan. This user-level override takes
          // precedence in FreeRADIUS (user attrs > group attrs).
          if (input.sessionTimeoutMinutes && input.sessionTimeoutMinutes > 0) {
            const sessionTimeoutSec = input.sessionTimeoutMinutes * 60;
            userReplies.push({ attribute: 'Session-Timeout', value: String(sessionTimeoutSec) });

            // Cryptsk mirror
            if (vendors.includes('cryptsk')) {
              userReplies.push({ attribute: 'Cryptsk-Session-Timeout', value: String(sessionTimeoutSec) });
            }
          }

          // Cryptsk per-user identity VSAs (always at user level — identifies THIS user)
          if (vendors.includes('cryptsk') && groupName) {
            // Cryptsk-User-Profile: plan group name (for policy matching)
            userReplies.push({ attribute: 'Cryptsk-User-Profile', value: groupName });
            // Cryptsk-Plan-Name: human-readable plan name (for display/audit)
            userReplies.push({ attribute: 'Cryptsk-Plan-Name', value: input.planName || resolvedPlanName || groupName });
          }

          // Create user-level reply entries
          for (const reply of userReplies) {
            await tx.radReply.create({
              data: {
                wifiUserId: wifiUser.id,
                username,
                attribute: reply.attribute,
                op: ':=',
                value: reply.value,
                isActive: true,
              },
            });
          }

          // 5. Create RadUserGroup — maps username to plan group
          //    FreeRADIUS reads group-level attrs via this mapping.
          //    radusergroup → radgroupcheck (access checks) + radgroupreply (authorization)
          //    Only create if a real plan group was resolved (no hardcoded fallbacks)
          if (groupName) {
            await tx.radUserGroup.create({
              data: {
                username,
                groupname: groupName,
                priority: 0,
              },
            });
          }

          // 6. Per-user Simultaneous-Use override in radcheck
          //    FREE_RADIUS_IS_AUTHORITY: Do NOT create per-user Simultaneous-Use when
          //    a plan is assigned — the group-level Simultaneous-Use (radgroupcheck,
          //    synced via syncRadiusGroup) is the authority. Per-user overrides take
          //    PRECEDENCE in FreeRADIUS and would shadow the group value, causing
          //    stale data on plan changes.
          //    Only create per-user Simultaneous-Use when there is NO plan (manual user)
          //    or when the sessionLimit explicitly differs from the plan's group value.
          let shouldCreateUserSimUse = false;
          if (input.sessionLimit && input.sessionLimit > 0) {
            if (!input.planId) {
              // No plan → no group → must create per-user Simultaneous-Use
              shouldCreateUserSimUse = true;
            } else {
              // Has plan: only create if different from plan's group value
              const planForSim = await tx.wiFiPlan.findUnique({
                where: { id: input.planId },
                select: { maxDevices: true, sessionLimit: true },
              });
              const groupSimUse = planForSim?.maxDevices || planForSim?.sessionLimit || 0;
              if (input.sessionLimit !== groupSimUse) {
                shouldCreateUserSimUse = true;
                console.log(`[WiFi Provisioning] Creating per-user Simultaneous-Use=${input.sessionLimit} for ${username} (differs from group ${groupSimUse})`);
              }
            }
          }
          if (shouldCreateUserSimUse) {
            await tx.radCheck.create({
              data: {
                wifiUserId: wifiUser.id,
                username,
                attribute: 'Simultaneous-Use',
                op: ':=',
                value: String(input.sessionLimit),
                isActive: true,
              },
            });
          }

          console.log(`[WiFi Provisioning] User ${username} created in shared DB (booking: ${input.bookingId || 'manual'}, group: ${groupName})`);

          return {
            wifiUser,
            credentials: {
              username,
              password,
              validFrom: input.validFrom,
              validUntil: input.validUntil,
            },
            groupName,
          };
        });
      } catch (error: unknown) {
        // Check for Prisma unique constraint violation (P2002)
        const isUniqueViolation = (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          (error as { code: string }).code === PRISMA_UNIQUE_VIOLATION
        );

        if (isUniqueViolation && attempt < MAX_RETRIES - 1 && !usernameExternallyProvided) {
          console.warn(`[WiFi Provisioning] Username collision on attempt ${attempt + 1}, retrying with fresh random bytes...`);
          lastError = error as unknown as Error;
          continue; // retry with fresh randomBytes in next iteration
        }
        throw error; // re-throw if not a unique violation or max retries exhausted
      }
    }

    throw lastError || new Error('Failed to provision user after retries');
  }

  /**
   * Update WiFi user
   *
   * Speed units (downloadSpeed / uploadSpeed):
   * Auto-detects units based on magnitude:
   *   - value > 100000  → assumed to be bits/sec (bps), converted to Mbps
   *   - value <= 100000 → assumed to be kbps, converted to Mbps
   * This accommodates callers that may pass bps, kbps, or Mbps.
   */
  async updateUser(userId: string, input: WiFiUserUpdateInput) {
    return db.$transaction(async (tx) => {
      const wifiUser = await tx.wiFiUser.findUnique({
        where: { id: userId },
      });

      if (!wifiUser) {
        throw new Error('WiFi user not found');
      }

      // Bug 10 Fix: Explicitly map each field instead of spreading raw input
      const updated = await tx.wiFiUser.update({
        where: { id: userId },
        data: {
          ...(input.validUntil !== undefined && { validUntil: input.validUntil }),
          ...(input.downloadSpeed !== undefined && { /* downloadSpeed stored in RadReply, not WiFiUser */ }),
          ...(input.uploadSpeed !== undefined && { /* uploadSpeed stored in RadReply, not WiFiUser */ }),
          ...(input.sessionTimeoutMinutes !== undefined && { /* sessionTimeout stored in RadReply, not WiFiUser */ }),
          ...(input.idleTimeoutSeconds !== undefined && { /* idleTimeout stored in RadReply, not WiFiUser */ }),
          ...(input.sessionLimit !== undefined && { /* sessionLimit stored in RadCheck, not WiFiUser */ }),
          ...(input.dataLimit !== undefined && { /* dataLimit stored in RadReply, not WiFiUser */ }),
          ...(input.status !== undefined && { status: input.status }),
          radiusSynced: true,
          radiusSyncedAt: new Date(),
        },
      });

      // Update RadReply entries (same DB — changes are immediate)
      // Vendor-aware: delete ALL old bandwidth attrs, write new vendor-appropriate ones
      if (input.downloadSpeed || input.uploadSpeed) {
        const vendors = await getActiveNASVendors(wifiUser.propertyId);
        // H5 FIX: Auto-detect speed units using shared helper
        const downloadMbps = input.downloadSpeed ? normalizeSpeedToMbps(input.downloadSpeed) : 10;
        const uploadMbps = input.uploadSpeed ? normalizeSpeedToMbps(input.uploadSpeed) : 5;

        // Delete old bandwidth attributes (all known vendor names)
        for (const attr of BANDWIDTH_ATTRIBUTES) {
          await tx.radReply.deleteMany({ where: { username: wifiUser.username, attribute: attr } });
        }

        // Write new vendor-appropriate bandwidth attributes
        const bwAttrs = generateBandwidthAttributes(vendors, downloadMbps, uploadMbps);
        for (const reply of bwAttrs) {
          await tx.radReply.create({
            data: {
              wifiUserId: wifiUser.id,
              username: wifiUser.username,
              attribute: reply.attribute,
              op: ':=',
              value: reply.value,
              isActive: true,
            },
          });
        }
      }

      // Bug 1 Fix: Update data-limit RadReply attributes (mirrors the bandwidth update block)
      if (input.dataLimit !== undefined) {
        const vendors = await getActiveNASVendors(wifiUser.propertyId);

        // Delete old data-limit attributes (all known vendor names)
        for (const attr of DATA_LIMIT_ATTRIBUTES) {
          await tx.radReply.deleteMany({ where: { username: wifiUser.username, attribute: attr } });
        }

        // Write new vendor-appropriate data-limit attributes if dataLimit > 0
        if (input.dataLimit > 0) {
          const dataLimitAttrs = generateSessionAttributes(vendors, 0, input.dataLimit);
          for (const reply of dataLimitAttrs) {
            await tx.radReply.create({
              data: {
                wifiUserId: wifiUser.id,
                username: wifiUser.username,
                attribute: reply.attribute,
                op: ':=',
                value: reply.value,
                isActive: true,
              },
            });
          }
        }
      }

      // Update session timeout (from sessionTimeoutMinutes, not sessionLimit)
      if (input.sessionTimeoutMinutes !== undefined) {
        const existingTimeout = await tx.radReply.findFirst({
          where: {
            username: wifiUser.username,
            attribute: 'Session-Timeout',
          },
        });

        if (existingTimeout) {
          if (input.sessionTimeoutMinutes > 0) {
            await tx.radReply.update({
              where: { id: existingTimeout.id },
              data: { value: String(input.sessionTimeoutMinutes * 60) },
            });
          } else {
            // Remove session timeout if set to 0
            await tx.radReply.delete({ where: { id: existingTimeout.id } });
          }
        } else if (input.sessionTimeoutMinutes > 0) {
          await tx.radReply.create({
            data: {
              wifiUserId: wifiUser.id,
              username: wifiUser.username,
              attribute: 'Session-Timeout',
              op: ':=',
              value: String(input.sessionTimeoutMinutes * 60),
              isActive: true,
            },
          });
        }

        // Also update Cryptsk-Session-Timeout
        const existingCryptskTimeout = await tx.radReply.findFirst({
          where: {
            username: wifiUser.username,
            attribute: 'Cryptsk-Session-Timeout',
          },
        });

        if (existingCryptskTimeout) {
          if (input.sessionTimeoutMinutes > 0) {
            await tx.radReply.update({
              where: { id: existingCryptskTimeout.id },
              data: { value: String(input.sessionTimeoutMinutes * 60) },
            });
          } else {
            await tx.radReply.delete({ where: { id: existingCryptskTimeout.id } });
          }
        } else if (input.sessionTimeoutMinutes > 0) {
          await tx.radReply.create({
            data: {
              wifiUserId: wifiUser.id,
              username: wifiUser.username,
              attribute: 'Cryptsk-Session-Timeout',
              op: ':=',
              value: String(input.sessionTimeoutMinutes * 60),
              isActive: true,
            },
          });
        }
      }

      // Update Idle-Timeout if idleTimeoutSeconds changed
      // Updates BOTH standard RFC Idle-Timeout (all NAS) and Cryptsk-Idle-Timeout (Cryptsk only)
      if (input.idleTimeoutSeconds !== undefined) {
        const vendors = await getActiveNASVendors(wifiUser.propertyId);

        // Standard RFC Idle-Timeout — recognized by ALL NAS devices
        const existingIdleTimeout = await tx.radReply.findFirst({
          where: {
            username: wifiUser.username,
            attribute: 'Idle-Timeout',
          },
        });

        if (input.idleTimeoutSeconds > 0) {
          if (existingIdleTimeout) {
            await tx.radReply.update({
              where: { id: existingIdleTimeout.id },
              data: { value: String(input.idleTimeoutSeconds) },
            });
          } else {
            await tx.radReply.create({
              data: {
                wifiUserId: wifiUser.id,
                username: wifiUser.username,
                attribute: 'Idle-Timeout',
                op: ':=',
                value: String(input.idleTimeoutSeconds),
                isActive: true,
              },
            });
          }
        } else if (existingIdleTimeout) {
          // Remove idle timeout if set to 0
          await tx.radReply.delete({ where: { id: existingIdleTimeout.id } });
        }

        // Cryptsk-Idle-Timeout — only when Cryptsk is an active vendor
        if (vendors.includes('cryptsk')) {
          const existingCryptskIdleTimeout = await tx.radReply.findFirst({
            where: {
              username: wifiUser.username,
              attribute: 'Cryptsk-Idle-Timeout',
            },
          });

          if (input.idleTimeoutSeconds > 0) {
            if (existingCryptskIdleTimeout) {
              await tx.radReply.update({
                where: { id: existingCryptskIdleTimeout.id },
                data: { value: String(input.idleTimeoutSeconds) },
              });
            } else {
              await tx.radReply.create({
                data: {
                  wifiUserId: wifiUser.id,
                  username: wifiUser.username,
                  attribute: 'Cryptsk-Idle-Timeout',
                  op: ':=',
                  value: String(input.idleTimeoutSeconds),
                  isActive: true,
                },
              });
            }
          } else if (existingCryptskIdleTimeout) {
            await tx.radReply.delete({ where: { id: existingCryptskIdleTimeout.id } });
          }
        }
      }

      // Update Simultaneous-Use (max concurrent sessions) if sessionLimit changed
      if (input.sessionLimit !== undefined) {
        const existingSimUse = await tx.radCheck.findFirst({
          where: {
            username: wifiUser.username,
            attribute: 'Simultaneous-Use',
          },
        });

        if (input.sessionLimit > 0) {
          if (existingSimUse) {
            await tx.radCheck.update({
              where: { id: existingSimUse.id },
              data: { value: String(input.sessionLimit) },
            });
          } else {
            await tx.radCheck.create({
              data: {
                wifiUserId: wifiUser.id,
                username: wifiUser.username,
                attribute: 'Simultaneous-Use',
                op: ':=',
                value: String(input.sessionLimit),
                isActive: true,
              },
            });
          }
        } else if (existingSimUse) {
          // Remove Simultaneous-Use if set to 0/undefined
          await tx.radCheck.delete({ where: { id: existingSimUse.id } });
        }
      }

      return updated;
    });
  }

  /**
   * Deprovision (disable) WiFi user — SOFT-DISABLE approach.
   * This is called on checkout or cancellation.
   *
   * Instead of hard-deleting all RadCheck entries (which causes FreeRADIUS to
   * return "User not found" on re-auth attempts), we:
   *   1. Delete all RadCheck entries EXCEPT Cleartext-Password
   *   2. Set Cleartext-Password to "__DISABLED__" (prevents login with real password)
   *   3. Add a RadReply: Reply-Message = "Account disabled. Please contact front desk"
   *   4. Delete RadReply bandwidth/session attributes (keep only the disabled message)
   *   5. Delete RadUserGroup entries (removes plan group membership)
   *
   * This way, FreeRADIUS still finds the user but rejects auth with a helpful
   * message instead of a generic "User not found" error.
   * The WiFiUser record is preserved for audit purposes (status = 'revoked').
   */
  async deprovisionUser(userId: string) {
    return db.$transaction(async (tx) => {
      const wifiUser = await tx.wiFiUser.findUnique({
        where: { id: userId },
      });

      if (!wifiUser) {
        throw new Error('WiFi user not found');
      }

      // Update user status (preserves audit trail)
      // Bug 9 Fix: Set radiusSynced: true since deactivation IS the synced state (same DB architecture)
      await tx.wiFiUser.update({
        where: { id: userId },
        data: {
          status: 'revoked',
          radiusSynced: true,
          radiusSyncedAt: new Date(),
        },
      });

      // SOFT-DISABLE: Delete all RadCheck entries EXCEPT Cleartext-Password
      await tx.radCheck.deleteMany({
        where: {
          username: wifiUser.username,
          attribute: { not: 'Cleartext-Password' },
        },
      });

      // Set Cleartext-Password to "__DISABLED__" so the real password no longer works
      // NOTE: RadCheck has no @@unique on (username, attribute), so we use findFirst + update/create
      const existingPwd = await tx.radCheck.findFirst({
        where: { username: wifiUser.username, attribute: 'Cleartext-Password' },
      });
      if (existingPwd) {
        await tx.radCheck.update({
          where: { id: existingPwd.id },
          data: { value: '__DISABLED__', op: ':=' },
        });
      } else {
        await tx.radCheck.create({
          data: {
            username: wifiUser.username,
            attribute: 'Cleartext-Password',
            op: ':=',
            value: '__DISABLED__',
          },
        });
      }

      // Delete all RadReply entries (bandwidth, session attrs, etc.)
      await tx.radReply.deleteMany({
        where: { username: wifiUser.username },
      });

      // Add a helpful Reply-Message so FreeRADIUS tells the guest what happened
      // NOTE: RadReply has no @@unique on (username, attribute), so we use findFirst + update/create
      const existingReply = await tx.radReply.findFirst({
        where: { username: wifiUser.username, attribute: 'Reply-Message' },
      });
      if (existingReply) {
        await tx.radReply.update({
          where: { id: existingReply.id },
          data: { value: 'Account disabled. Please contact front desk', op: '=' },
        });
      } else {
        await tx.radReply.create({
          data: {
            username: wifiUser.username,
            attribute: 'Reply-Message',
            op: '=',
            value: 'Account disabled. Please contact front desk',
          },
        });
      }

      // Remove group membership (plan access)
      await tx.radUserGroup.deleteMany({
        where: { username: wifiUser.username },
      });

      console.log(`[WiFi Provisioning] User ${wifiUser.username} deprovisioned (soft-disabled: Cleartext-Password=__DISABLED__, status: revoked)`);

      return { success: true };
    });
  }

  /**
   * Suspend WiFi user (temporary)
   * Uses HARD DELETE on RadCheck — on resume, credentials will be re-created.
   */
  async suspendUser(userId: string) {
    return db.$transaction(async (tx) => {
      const wifiUser = await tx.wiFiUser.findUnique({
        where: { id: userId },
      });

      if (!wifiUser) {
        throw new Error('WiFi user not found');
      }

      // Update status
      await tx.wiFiUser.update({
        where: { id: userId },
        data: { status: 'suspended', radiusSynced: false },
      });

      // DELETE RADIUS credentials to prevent authentication
      await tx.radCheck.deleteMany({
        where: { username: wifiUser.username },
      });

      await tx.radReply.deleteMany({
        where: { username: wifiUser.username },
      });

      // FIX #31: Verify group entries before deleting — the plan may have been deleted
      // while the user was active, leaving orphaned or missing group entries.
      const existingGroups = await tx.radUserGroup.findMany({
        where: { username: wifiUser.username },
        select: { groupname: true },
      });

      if (existingGroups.length === 0) {
        console.warn(`[WiFi Suspend] No RadUserGroup entries found for ${wifiUser.username} — user may have had their plan deleted. Continuing suspend.`);
      } else {
        // Log group names for audit — if any group doesn't exist in radgroupcheck/radgroupreply,
        // the plan was likely deleted but the user's group membership remained.
        for (const g of existingGroups) {
          const groupExists = await tx.radGroupCheck.count({ where: { groupname: g.groupname } });
          if (groupExists === 0) {
            console.warn(`[WiFi Suspend] RadUserGroup "${g.groupname}" for ${wifiUser.username} has no corresponding radgroupcheck entries — plan may have been deleted. Proceeding with delete.`);
          }
        }
      }

      await tx.radUserGroup.deleteMany({
        where: { username: wifiUser.username },
      });

      return { success: true };
    });
  }

  /**
   * Resume suspended WiFi user
   * Re-creates RadCheck/RadReply credentials from WiFiUser.password and WiFiPlan.
   */
  async resumeUser(userId: string) {
    return db.$transaction(async (tx) => {
      const wifiUser = await tx.wiFiUser.findUnique({
        where: { id: userId },
        include: { plan: true },
      });

      if (!wifiUser) {
        throw new Error('WiFi user not found');
      }

      // Update status
      await tx.wiFiUser.update({
        where: { id: userId },
        data: { status: 'active', radiusSynced: true, radiusSyncedAt: new Date() },
      });

      // Re-create RadCheck (password) if not exists
      // SECURITY (L-34): Cleartext-Password is required by FreeRADIUS PAP auth.
      // See provisionUser() for full security justification and mitigation notes.
      const existingCheck = await tx.radCheck.findFirst({
        where: { username: wifiUser.username },
      });
      if (!existingCheck) {
        await tx.radCheck.create({
          data: {
            wifiUserId: wifiUser.id,
            username: wifiUser.username,
            attribute: 'Cleartext-Password',
            op: ':=',
            value: wifiUser.password,
            isActive: true,
          },
        });
      }

      // Re-create per-user RadReply only (plan attrs come from group via radusergroup)
      const existingReplyCount = await tx.radReply.count({
        where: { username: wifiUser.username },
      });
      if (existingReplyCount === 0) {
        const vendors = await getActiveNASVendors(wifiUser.propertyId);

        // Resolve plan group name
        let groupName: string | null = null;
        let planName = 'unknown';

        if (wifiUser.plan) {
          groupName = planNameToGroupName(wifiUser.plan.name, wifiUser.plan.id);
          planName = wifiUser.plan.name;

          // FIX #29: Always re-sync group attributes on resume.
          // The plan may have been updated while the user was suspended (e.g., bandwidth
          // limits changed, data cap adjusted, session timeout modified). Re-syncing
          // ensures the RADIUS group reflects the current plan configuration.
          await syncRadiusGroup({
            id: wifiUser.plan.id,
            name: wifiUser.plan.name,
            tenantId: wifiUser.plan.tenantId,
            downloadSpeed: wifiUser.plan.downloadSpeed,
            uploadSpeed: wifiUser.plan.uploadSpeed,
            burstDownloadSpeed: wifiUser.plan.burstDownloadSpeed,
            burstUploadSpeed: wifiUser.plan.burstUploadSpeed,
            dataLimit: wifiUser.plan.dataLimit,
            sessionLimit: wifiUser.plan.sessionLimit,
            sessionTimeoutSec: wifiUser.plan.sessionTimeoutSec,
            idleTimeoutSec: wifiUser.plan.idleTimeoutSec,
          }, wifiUser.propertyId, tx);
        }

        // Only write per-user identity VSAs (not plan attributes — those are in the group)
        const replies: Array<{ attribute: string; value: string }> = [];
        if (vendors.includes('cryptsk') && groupName) {
          replies.push(
            { attribute: 'Cryptsk-User-Profile', value: groupName },
            { attribute: 'Cryptsk-Plan-Name', value: planName },
          );
        }

        // Bug 2 Fix: Use op: ':=' (not '=') to match provisionUser behavior
        for (const reply of replies) {
          await tx.radReply.create({
            data: {
              wifiUserId: wifiUser.id,
              username: wifiUser.username,
              attribute: reply.attribute,
              op: ':=',
              value: reply.value,
              isActive: true,
            },
          });
        }

        // Simultaneous-Use is handled at group level (radgroupcheck) — no user-level needed
      }

      // Re-create RadUserGroup if not exists — only if a real plan group can be resolved
      const existingGroup = await tx.radUserGroup.findFirst({
        where: { username: wifiUser.username },
      });
      if (!existingGroup) {
        const resumeGroupName = wifiUser.plan
          ? planNameToGroupName(wifiUser.plan.name, wifiUser.plan.id)
          : null;
        if (resumeGroupName) {
          await tx.radUserGroup.create({
            data: { username: wifiUser.username, groupname: resumeGroupName, priority: 0 },
          });
        }
      }

      return { success: true };
    });
  }

  /**
   * Get WiFi user by booking ID
   * Returns the most recent active WiFi user (skips revoked/expired)
   */
  async getUserByBooking(bookingId: string) {
    return db.wiFiUser.findFirst({
      where: { bookingId, status: { in: ['active', 'suspended'] } },
      include: {
        radCheck: { where: { isActive: true } },
        radReply: { where: { isActive: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get WiFi user by guest ID
   */
  async getUsersByGuest(guestId: string) {
    return db.wiFiUser.findMany({
      where: { guestId },
      include: {
        radCheck: { where: { isActive: true } },
        radReply: { where: { isActive: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Enforce simultaneous use limit for a user
   * Adds a Simultaneous-Use check attribute in RadCheck
   */
  async enforceSimultaneousUse(username: string, maxSessions: number): Promise<{ success: boolean; error?: string }> {
    try {
      await db.$transaction(async (tx) => {
        // Lock the row to prevent concurrent duplicate creation
        const existing = await tx.radCheck.findFirst({
          where: {
            username,
            attribute: 'Simultaneous-Use',
            isActive: true,
          },
        });

        if (existing) {
          await tx.radCheck.update({
            where: { id: existing.id },
            data: { value: String(maxSessions) },
          });
        } else {
          const wifiUser = await tx.wiFiUser.findUnique({ where: { username } });
          await tx.radCheck.create({
            data: {
              wifiUserId: wifiUser?.id,
              username,
              attribute: 'Simultaneous-Use',
              op: ':=',
              value: String(maxSessions),
              isActive: true,
            },
          });
        }
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to enforce simultaneous use',
      };
    }
  }

  /**
   * Get data cap status for a user
   * Fetches from accounting API to check usage vs cap
   */
  async getDataCapStatus(username: string): Promise<{
    username: string;
    totalBytesIn: number;
    totalBytesOut: number;
    totalBytes: number;
    dataLimitBytes: number;
    usagePercent: number;
    isOverCap: boolean;
    isApproachingCap: boolean; // > 80%
    activeSessions: number;
  }> {
    // Get user's data limit from RadReply (vendor-agnostic — checks all known data-limit attrs)
    const allReplies = await db.radReply.findMany({
      where: { username, isActive: true },
    });
    const attrsMap: Record<string, string> = {};
    for (const r of allReplies) {
      attrsMap[r.attribute] = r.value;
    }
    const dataLimitBytes = readDataLimitBytes(attrsMap) || 0;

    // Get usage from accounting
    let totalBytesIn = 0;
    let totalBytesOut = 0;
    let activeSessions = 0;

    try {
      const result = await freeradiusRequest(`/api/accounting?username=${encodeURIComponent(username)}&limit=100`);
      if (result && result.sessions) {
        for (const session of result.sessions) {
          totalBytesIn += Number(session.acctInputOctets || session.inputOctets || 0);
          totalBytesOut += Number(session.acctOutputOctets || session.outputOctets || 0);
          if (!session.acctStopTime) {
            activeSessions++;
          }
        }
      }
    } catch {
      // Fallback: check RadAcct table directly
      const acctRecords = await db.radAcct.findMany({
        where: { username },
      });
      for (const record of acctRecords) {
        totalBytesIn += record.acctinputoctets;
        totalBytesOut += record.acctoutputoctets;
        if (!record.acctstoptime) {
          activeSessions++;
        }
      }
    }

    const totalBytes = totalBytesIn + totalBytesOut;
    // dataLimitBytes = 0 means unlimited — never over cap
    const isUnlimited = dataLimitBytes <= 0;
    const usagePercent = isUnlimited ? 0 : (totalBytes / dataLimitBytes) * 100;

    return {
      username,
      totalBytesIn,
      totalBytesOut,
      totalBytes,
      dataLimitBytes,
      usagePercent: Math.round(usagePercent * 100) / 100,
      isOverCap: isUnlimited ? false : totalBytes >= dataLimitBytes,
      isApproachingCap: isUnlimited ? false : usagePercent >= 80,
      activeSessions,
    };
  }

  /**
   * Disconnect a user's active session via CoA
   * Routes through freeradius-service API (radclient CLI)
   */
  async disconnectUser(username: string, sessionId?: string): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    try {
      // If no sessionId provided, find the active one from accounting
      let targetSessionId = sessionId;
      if (!targetSessionId) {
        const result = await freeradiusRequest(`/api/accounting?username=${encodeURIComponent(username)}&status=active&limit=1`);
        if (result?.sessions?.length > 0) {
          targetSessionId = result.sessions[0].acctSessionId || result.sessions[0].sessionId;
        }
      }

      if (!targetSessionId) {
        return {
          success: false,
          error: 'No active session found for user',
        };
      }

      const result = await freeradiusRequest('/api/coa/disconnect', {
        method: 'POST',
        body: JSON.stringify({ username, sessionId: targetSessionId }),
      });

      return {
        success: result.success !== false,
        message: result.message || 'Disconnect sent',
        error: result.error,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Disconnect failed',
      };
    }
  }

  /**
   * Change a user's bandwidth via CoA
   * Routes through freeradius-service API (radclient CLI)
   */
  async changeUserBandwidth(
    username: string,
    downloadMbps: number,
    uploadMbps: number
  ): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    try {
      // Update RadReply for persistent change
      const downloadBps = downloadMbps * 1000000;
      const uploadBps = uploadMbps * 1000000;

      // Vendor-aware: delete ALL old bandwidth attrs, write new vendor-appropriate ones
      const wifiUser = await db.wiFiUser.findUnique({ where: { username } });
      const vendors = wifiUser ? await getActiveNASVendors(wifiUser.propertyId) : ['other' as const];
      const bwAttrs = generateBandwidthAttributes(vendors, downloadMbps, uploadMbps);

      await db.$transaction(async (tx) => {
        // Delete all known bandwidth attributes
        for (const attr of BANDWIDTH_ATTRIBUTES) {
          await tx.radReply.deleteMany({ where: { username, attribute: attr } });
        }
        // Bug 5 Fix: Set wifiUserId on new RadReply entries
        for (const reply of bwAttrs) {
          await tx.radReply.create({
            data: {
              wifiUserId: wifiUser?.id,
              username,
              attribute: reply.attribute,
              op: ':=',
              value: reply.value,
              isActive: true,
            },
          });
        }
      });

      // Send CoA to apply immediately to active session
      const result = await freeradiusRequest('/api/coa/bandwidth', {
        method: 'POST',
        body: JSON.stringify({
          username,
          downloadMbps,
          uploadMbps,
        }),
      });

      return {
        success: true,
        message: `Bandwidth updated to ${downloadMbps}M/${uploadMbps}M`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Bandwidth change failed',
      };
    }
  }

  /**
   * Bulk create event WiFi users
   * Creates multiple RADIUS users for event attendees
   */
  async createEventUsers(params: {
    eventId: string;
    eventName: string;
    count: number;
    bandwidthDown: number; // Mbps
    bandwidthUp: number;   // Mbps
    dataLimitMb?: number;
    validHours?: number;
    propertyId: string;
    tenantId: string;
  }): Promise<{
    success: boolean;
    created: number;
    failed: number;
    // Bug 11 Fix: Correct array nesting — was Array<...>[] (array of arrays)
    users?: Array<{ username: string; password: string }>;
    error?: string;
  }> {
    const {
      tenantId, propertyId, eventId, eventName, count,
      bandwidthDown, bandwidthUp, dataLimitMb = 512, validHours = 24,
    } = params;

    const results: Array<{ username: string; password: string }> = [];
    let created = 0;
    let failed = 0;

    const validUntil = new Date(Date.now() + validHours * 60 * 60 * 1000);
    const downloadSpeed = bandwidthDown * 1000000; // Mbps to bps
    const uploadSpeed = bandwidthUp * 1000000;

    // Bug 12 Fix: Process in parallel batches of 10 instead of sequentially
    const BATCH_SIZE = 10;
    const batchPromises: Promise<void>[] = [];

    for (let i = 0; i < count; i++) {
      const username = `evt_${eventId.slice(-6)}_${String(i + 1).padStart(3, '0')}`;
      const password = this.generatePassword(6);

      const promise = this.provisionUser({
        tenantId,
        propertyId,
        username,
        password,
        validFrom: new Date(),
        validUntil,
        userType: 'guest',
        downloadSpeed,
        uploadSpeed,
        dataLimit: dataLimitMb,
      })
        .then(() => {
          results.push({ username, password });
          created++;
        })
        .catch(() => {
          failed++;
        });

      batchPromises.push(promise);

      // Execute in parallel batches
      if (batchPromises.length >= BATCH_SIZE || i === count - 1) {
        await Promise.all(batchPromises.splice(0));
      }
    }

    // Also create via backend for tracking
    try {
      await freeradiusRequest('/api/event-users/bulk', {
        method: 'POST',
        body: JSON.stringify({
          eventId,
          eventName,
          count,
          propertyId,
          bandwidthDown,
          bandwidthUp,
          dataLimitMb,
          validHours,
          credentials: results,
        }),
      });
    } catch {
      // Best effort — credentials are already in the DB
    }

    return {
      success: created > 0,
      created,
      failed,
      users: results,
    };
  }

  /**
   * Revoke an event user and deprovision
   */
  async revokeEventUser(eventUserId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // Revoke via backend API
      const result = await freeradiusRequest(`/api/event-users/${encodeURIComponent(eventUserId)}/revoke`, {
        method: 'POST',
      });

      return {
        success: result.success !== false,
        error: result.error,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Revoke failed',
      };
    }
  }

  /**
   * Add a MAC address for auto-authentication
   * Adds to the MAC authentication whitelist
   */
  async addMacAuth(params: {
    propertyId: string;
    macAddress: string;
    username?: string;
    guestId?: string;
    description?: string;
  }): Promise<{
    success: boolean;
    macAuthId?: string;
    error?: string;
  }> {
    try {
      // Create via backend API
      const result = await freeradiusRequest('/api/mac-auth', {
        method: 'POST',
        body: JSON.stringify(params),
      });

      return {
        success: result.success !== false,
        macAuthId: result.id,
        error: result.error,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add MAC auth',
      };
    }
  }

  /**
   * Remove a MAC address from auto-authentication whitelist
   */
  async removeMacAuth(macAuthId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const result = await freeradiusRequest(`/api/mac-auth/${encodeURIComponent(macAuthId)}`, {
        method: 'DELETE',
      });

      return {
        success: result.success !== false,
        error: result.error,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove MAC auth',
      };
    }
  }

  /**
   * Persist a provisioning log to the database
   * Used for audit trail of all WiFi provisioning operations.
   * Writes to RadiusProvisioningLog table (NOT AuditLog).
   */
  async logProvisioning(params: {
    action: string;
    username: string;
    propertyId: string;
    tenantId?: string;
    guestId?: string;
    bookingId?: string;
    userId?: string;
    result: 'success' | 'failed' | 'partial';
    details?: string;
    error?: string;
    durationMs?: number;
  }): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
      const logEntry = await db.radiusProvisioningLog.create({
        data: {
          propertyId: params.propertyId,
          action: params.action,
          username: params.username,
          guestId: params.guestId || null,
          bookingId: params.bookingId || null,
          userId: params.userId || null,
          result: params.result,
          details: params.details || null,
          error: params.error || null,
          durationMs: params.durationMs || null,
        },
      });

      console.log(`[WiFi Provisioning Log] ${params.action}: ${params.username} - ${params.result}${params.error ? ` (${params.error})` : ''}`);

      return { success: true, id: logEntry.id };
    } catch (error) {
      console.error('[WiFi Provisioning Log] Failed to persist log:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to persist provisioning log',
      };
    }
  }

  /**
   * Generate username
   * Format: guest_{property_code}_{random}
   */
  private generateUsername(propertyId: string): string {
    const random = randomBytes(4).toString('hex');
    return `guest_${propertyId.slice(-4)}_${random}`;
  }

  /**
   * Generate random password
   * Bug 8 Fix: Use crypto.randomInt instead of modulo to avoid modulo bias
   */
  private generatePassword(length: number = 8): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < length; i++) {
      const idx = randomInt(chars.length);
      password += chars[idx];
    }
    return password;
  }
}

// Singleton instance
export const wifiUserService = new WiFiUserService();
