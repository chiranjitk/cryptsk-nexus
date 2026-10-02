/**
 * WiFi Accounting Sync Service
 * 
 * Syncs RADIUS accounting data (RadAcct) to WiFi sessions and updates usage stats.
 * Reads from RadAcct table (written by FreeRADIUS SQL module via detail files)
 * and updates WiFiSession + WiFiUser.totalBytesIn/totalBytesOut.
 * 
 * Architecture (PostgreSQL database):
 * ┌──────────────────────────────────────────────────────┐
 * │  PostgreSQL database                                  │
 * │  ┌──────────┐  ┌──────────────┐  ┌──────────────┐   │
 * │  │ RadAcct  │→ │ WiFiSession  │  │ WiFiUser     │   │
 * │  │ (source) │  │ (enriched)   │  │ (totals)     │   │
 * │  └──────────┘  └──────────────┘  └──────────────┘   │
 * └──────────────────────────────────────────────────────┘
 * 
 * IMPORTANT: FreeRADIUS writes to RadAcct via SQL module or detail file parser.
 * This service READS RadAcct and updates WiFiSession/WiFiUser.
 * 
 * Key design decisions:
 * - dataUsed on WiFiSession stores BYTES (not MB) as BigInt
 * - Session matching uses acctUniqueId (primary), username+MAC (fallback)
 * - Data limit enforcement uses hard delete on RadCheck (FreeRADIUS ignores isActive)
 * - Interim updates increment WiFiUser totals by delta (not cumulative)
 */

import { db } from '@/lib/db';

export interface AccountingSyncResult {
  processed: number;
  created: number;
  updated: number;
  closed: number;
  skipped: number;
  errors: number;
  lastRadAcctId: string;
  dataLimitEnforced: number;
}

export class WiFiAccountingSyncService {
  /**
   * Sync accounting data from RadAcct to WiFiSession + WiFiUser.
   * 
   * Uses cursor-based pagination (lastRadAcctId) for efficiency.
   * Matches records by username → WiFiUser → updates session + user stats.
   * 
   * @param tenantId - Optional tenant filter
   */
  async syncAccounting(tenantId?: string): Promise<AccountingSyncResult> {
    const result: AccountingSyncResult = {
      processed: 0,
      created: 0,
      updated: 0,
      closed: 0,
      skipped: 0,
      errors: 0,
      lastRadAcctId: '',
      dataLimitEnforced: 0,
    };

    // M7: Acquire advisory lock to prevent concurrent sync processing.
    // Both /api/wifi/sync/route.ts and this service can run concurrently,
    // causing the same radacct records to be processed twice (double-counting bytes).
    // pg_try_advisory_lock returns true if acquired, false if already held.
    let lockAcquired = false;
    try {
      const lockResult = await db.$queryRaw`SELECT pg_try_advisory_lock(5432100) as lock`;
      lockAcquired = Boolean(lockResult?.[0]?.lock);
      if (!lockAcquired) {
        console.log('[AccountingSync] M7: Another sync is already running, skipping');
        return result;
      }
    } catch {
      // If advisory lock query fails (e.g., not PostgreSQL), proceed without lock
      console.warn('[AccountingSync] M7: Advisory lock query failed, proceeding without lock');
    }

    try {
      // 1. Get the last synced cursor position
      const syncRecord = await db.wiFiAccountingSync.findFirst({
        orderBy: { lastSyncedAt: 'desc' },
      });

      const lastSyncedId = syncRecord?.lastRadAcctId || '';

      // Bug 10 fix: If tenantId is provided, pre-fetch tenant usernames to filter RadAcct
      // RadAcct does not have a tenantId field, so we filter via WiFiUser.username
      let usernameFilter: string[] | undefined;
      if (tenantId) {
        const tenantUsers = await db.wiFiUser.findMany({
          where: { tenantId },
          select: { username: true },
        });
        usernameFilter = tenantUsers.map(u => u.username);
        if (usernameFilter.length === 0) {
          return result; // No users for this tenant — nothing to sync
        }
      }

      // 2. Fetch new records AFTER the last synced ID (cursor-based)
      const newRecords = await db.radAcct.findMany({
        where: {
          ...(lastSyncedId ? { radacctid: { gt: BigInt(lastSyncedId) } } : {}),
          // Bug 10: Filter by tenant usernames when tenantId is provided
          ...(usernameFilter ? { username: { in: usernameFilter } } : {}),
        },
        orderBy: { radacctid: 'asc' },
        take: 1000,
      });

      if (newRecords.length === 0) {
        return result;
      }

      // 3. Batch-load all WiFiUsers for the records (eliminates N+1)
      const usernames = [...new Set(newRecords.map(r => r.username))];
      const wifiUsers = await db.wiFiUser.findMany({
        where: { username: { in: usernames } },
      });
      const wifiUserMap = new Map(wifiUsers.map(u => [u.username, u]));

      // 4. Process each accounting record
      for (const record of newRecords) {
        try {
          result.processed++;
          // Store radacctid as string (it's BigInt in RadAcct)
          result.lastRadAcctId = String(record.radacctid);

          // Look up WiFi user from pre-loaded map (O(1), no DB query)
          const wifiUser = wifiUserMap.get(record.username);

          if (!wifiUser) {
            result.skipped++;
            continue;
          }

          const acctStatus = record.acctstatus?.toLowerCase() || '';

          // C-10 FIX: Normalize numeric Acct-Status-Type values.
          // Some NAS devices (e.g., MikroTik, older Cisco) may send the numeric
          // RADIUS Acct-Status-Type attribute value (1=Start, 2=Stop, 3=Interim-Update,
          // 4=Accounting-On, 5=Accounting-Off) instead of the string name.
          const normalizedStatus = (() => {
            const s = acctStatus.trim();
            if (s === 'start' || s === '1' || s === 'accounting-on' || s === '4') return 'start';
            if (s === 'stop' || s === '2' || s === 'accounting-off' || s === '5') return 'stop';
            if (s === 'interim' || s === 'interim-update' || s === '3') return 'interim-update';
            return s;
          })();

          if (normalizedStatus === 'start') {
            // Create new WiFi session from accounting Start
            await this.createSession(record, wifiUser);
            result.created++;
          } else if (normalizedStatus === 'interim-update') {
            // C-10 FIX: Handle Acct-Interim-Update messages to update session usage data.
            // External NAS devices (e.g., Cisco WLC, Aruba, UniFi) send Interim-Update
            // accounting messages at regular intervals (typically every 60-600 seconds).
            // These contain updated byte counts (Acct-Input-Octets, Acct-Output-Octets)
            // and session duration (Acct-Session-Time) that reflect live traffic usage.
            //
            // This handler:
            //   1. Finds the active session matching this interim record
            //   2. Updates session.dataUsed with the latest cumulative byte counts
            //   3. Updates session.duration with the latest session time
            //   4. Increments WiFiUser cumulative totals by the DELTA (not cumulative)
            //      to prevent double-counting when multiple interim records arrive
            //   5. Updates lastAccountingAt on WiFiUser for freshness tracking
            //
            // FreeRADIUS stores Acct-Status-Type = 3 as "Interim-Update" in acctstatus.
            // Some NAS devices may send status = "3" (numeric) — we normalize to lowercase.
            console.log(
              `[AccountingSync] Interim-Update: user=${record.username}, ` +
              `bytesIn=${Number(record.acctinputoctets || 0)}, bytesOut=${Number(record.acctoutputoctets || 0)}, ` +
              `sessionTime=${Number(record.acctsessiontime || 0)}s`
            );
            await this.updateSession(record, wifiUser);
            result.updated++;
          } else if (normalizedStatus === 'stop') {
            // Close session and update user stats
            await this.closeSession(record, wifiUser);
            result.closed++;
          } else {
            result.skipped++;
          }
        } catch (error) {
          result.errors++;
          console.error(`[AccountingSync] Error processing record ${record.radacctid}:`, error);
        }
      }

      // 5. Check data limits for all active sessions
      try {
        const enforced = await this.enforceDataLimits();
        result.dataLimitEnforced = enforced;
      } catch (error) {
        console.error('[AccountingSync] Data limit enforcement error:', error);
      }

      // 6. Save sync cursor position
      if (result.lastRadAcctId) {
        if (syncRecord) {
          await db.wiFiAccountingSync.update({
            where: { id: syncRecord.id },
            data: {
              lastRadAcctId: result.lastRadAcctId,
              lastSyncedAt: new Date(),
              recordsProcessed: { increment: result.processed },
              errors: { increment: result.errors },
            },
          });
        } else {
          await db.wiFiAccountingSync.create({
            data: {
              lastRadAcctId: result.lastRadAcctId,
              lastSyncedAt: new Date(),
              recordsProcessed: result.processed,
              errors: result.errors,
            },
          });
        }
      }

      console.log(`[AccountingSync] Synced ${result.processed} records: ${result.created} created, ${result.updated} updated, ${result.closed} closed, ${result.skipped} skipped, ${result.errors} errors`);

      return result;
    } catch (error) {
      console.error('[AccountingSync] Fatal error:', error);
      throw error;
    } finally {
      // M7: Release advisory lock
      if (lockAcquired) {
        try {
          await db.$executeRaw`SELECT pg_advisory_unlock(5432100)`;
        } catch { /* non-critical */ }
      }
    }
  }

  /**
   * Create a new WiFi session from accounting Start record.
   * 
   * Bug 7 fix: Matches by acctUniqueId (primary), then by username+MAC (fallback)
   * to avoid multi-property collision when same MAC appears on different properties.
   */
  private async createSession(record: any, wifiUser: any) {
    // Bug 11: Primary match by acctUniqueId
    if (record.acctuniqueid) {
      const existingByAcctId = await db.wiFiSession.findFirst({
        where: { acctUniqueId: record.acctuniqueid },
      });
      if (existingByAcctId) {
        return this.updateSession(record, wifiUser);
      }
    }

    // Bug 7: Fallback match by username + MAC + status to avoid cross-property collision
    // Skip all-zeros MAC — NAS often sends 00:00:00:00:00:00 when it can't detect client MAC.
    const safeMac = (record.callingstationid && record.callingstationid !== '00:00:00:00:00:00' && record.callingstationid !== '00-00-00-00-00-00')
      ? record.callingstationid
      : null;
    const existing = await db.wiFiSession.findFirst({
      where: {
        ...(safeMac ? { macAddress: safeMac } : {}),
        username: wifiUser.username,
        status: 'active',
      },
    });

    if (existing) {
      // Session already exists — update it instead
      return this.updateSession(record, wifiUser);
    }

    return db.wiFiSession.create({
      data: {
        tenant: { connect: { id: wifiUser.tenantId || '' } },
...(wifiUser.planId ? { plan: { connect: { id: wifiUser.planId } } } : {}),
        guestId: wifiUser.guestId,
        bookingId: wifiUser.bookingId,
        username: wifiUser.username,
        acctUniqueId: record.acctuniqueid || null,
        ...(safeMac ? { macAddress: safeMac } : {}),
        ipAddress: record.framedipaddress,
        startTime: record.acctstarttime,
        endTime: null,
        dataUsed: 0,
        duration: 0,
        authMethod: 'portal',
        status: 'active',
      },
    });
  }

  /**
   * Update existing session from interim update.
   * 
   * Bug 1 fix: BigInt fields (acctinputoctets, acctoutputoctets, acctsessiontime) are
   * converted to Number before arithmetic to avoid TypeError.
   * Bug 5 fix: Stores raw bytes in dataUsed (not MB) for precision.
   * Bug 8 fix: Also increments WiFiUser totals by delta from interim records.
   * Bug 11 fix: Matches by acctUniqueId first, then username+MAC.
   */
  private async updateSession(record: any, wifiUser: any) {
    // Bug 1: Convert BigInt fields to Number before arithmetic
    const inputOctets = Number(record.acctinputoctets || BigInt(0));
    const outputOctets = Number(record.acctoutputoctets || BigInt(0));
    const totalBytes = inputOctets + outputOctets;
    const duration = Number(record.acctsessiontime || BigInt(0));

    // Bug 11: Primary match by acctUniqueId
    let existingSession = record.acctuniqueid
      ? await db.wiFiSession.findFirst({
          where: { acctUniqueId: record.acctuniqueid },
        })
      : null;

    // Bug 7: Fallback match by username + MAC (skip all-zeros MAC from NAS)
    if (!existingSession) {
      const safeMac = (record.callingstationid && record.callingstationid !== '00:00:00:00:00:00' && record.callingstationid !== '00-00-00-00-00-00')
        ? record.callingstationid : null;
      existingSession = await db.wiFiSession.findFirst({
        where: {
          ...(safeMac ? { macAddress: safeMac } : {}),
          username: wifiUser.username,
          status: 'active',
        },
      });
    }

    if (!existingSession) {
      // No active session found — create one from this interim
      return this.createSession(record, wifiUser);
    }

    // Bug 5: Store bytes directly (not MB) — dataUsed is BigInt in schema
    // Bug 8: Calculate delta for user stats increment (interim bytes)
    // M5: Counter-reset resilience — when a router reboots, byte counters reset to 0,
    // making newTotal < prevTotal. Math.max(0, ...) clamps delta to 0, so the user's
    // cumulative total (WiFiUser.totalBytesIn/Out) stays where it was. Since we use
    // delta-based increments (not cumulative overwrites), a counter reset cannot
    // reduce the user's recorded usage — the "free pass" scenario is prevented.
    const prevDataUsed = Number(existingSession.dataUsed || BigInt(0));
    const deltaBytes = Math.max(0, totalBytes - prevDataUsed);

    const sessionUpdate = db.wiFiSession.update({
      where: { id: existingSession.id },
      data: {
        // Enrich with acctUniqueId if not yet stored
        ...(record.acctuniqueid && !existingSession.acctUniqueId
          ? { acctUniqueId: record.acctuniqueid }
          : {}),
        dataUsed: totalBytes,
        duration,
        ipAddress: record.framedipaddress || existingSession.ipAddress,
        updatedAt: new Date(),
      },
    });

    // Bug 8: Increment WiFiUser totals by delta from interim update (not cumulative)
    // This ensures bytes aren't lost if the session never receives a Stop record
    let userUpdate: Promise<any> | null = null;
    if (deltaBytes > 0) {
      // Split delta proportionally by input/output ratio
      const inputRatio = totalBytes > 0 ? inputOctets / totalBytes : 0.5;
      const deltaIn = Math.round(deltaBytes * inputRatio);
      const deltaOut = deltaBytes - deltaIn;

      userUpdate = db.wiFiUser.update({
        where: { id: wifiUser.id },
        data: {
          totalBytesIn: { increment: deltaIn },
          totalBytesOut: { increment: deltaOut },
          lastAccountingAt: new Date(),
        },
      });
    }

    // Execute updates in parallel
    await Promise.all([sessionUpdate, ...(userUpdate ? [userUpdate] : [])]);
  }

  /**
   * Close session from accounting Stop record + update user stats.
   * 
   * Bug 1 fix: BigInt to Number conversion.
   * Bug 5 fix: Stores bytes (not MB) in session dataUsed.
   * Bug 8 fix: Increments user totals by delta (handles case where interim
   *   updates already incremented some bytes, avoiding double-counting).
   * Bug 11 fix: Matches by acctUniqueId first.
   */
  private async closeSession(record: any, wifiUser: any) {
    // Bug 1: Convert BigInt fields to Number
    const inputOctets = Number(record.acctinputoctets || BigInt(0));
    const outputOctets = Number(record.acctoutputoctets || BigInt(0));
    const totalBytes = inputOctets + outputOctets;
    const duration = Number(record.acctsessiontime || BigInt(0));

    // Bug 11: Primary match by acctUniqueId
    let existingSession = record.acctuniqueid
      ? await db.wiFiSession.findFirst({
          where: { acctUniqueId: record.acctuniqueid },
        })
      : null;

    // Bug 7: Fallback match by username + MAC
    if (!existingSession) {
      const safeMac = (record.callingstationid && record.callingstationid !== '00:00:00:00:00:00' && record.callingstationid !== '00-00-00-00-00-00')
        ? record.callingstationid : null;
      existingSession = await db.wiFiSession.findFirst({
        where: {
          ...(safeMac ? { macAddress: safeMac } : {}),
          username: wifiUser.username,
          status: 'active',
        },
      });
    }

    if (!existingSession) {
      return null;
    }

    // Bug 5: Store bytes directly (not MB)
    // Bug 8: Calculate delta — only increment user totals for bytes not yet counted
    // (interim updates may have already incremented some of these bytes)
    const prevDataUsed = Number(existingSession.dataUsed || BigInt(0));
    const deltaBytes = Math.max(0, totalBytes - prevDataUsed);

    // Close the session
    await db.wiFiSession.update({
      where: { id: existingSession.id },
      data: {
        endTime: record.acctstoptime || new Date(),
        dataUsed: totalBytes,
        duration,
        status: 'ended',
        updatedAt: new Date(),
      },
    });

    // Bug 8: Update WiFiUser cumulative stats by DELTA only
    // This prevents double-counting when interim updates already incremented bytes
    if (deltaBytes > 0) {
      const inputRatio = totalBytes > 0 ? inputOctets / totalBytes : 0.5;
      const deltaIn = Math.round(deltaBytes * inputRatio);
      const deltaOut = deltaBytes - deltaIn;

      await db.wiFiUser.update({
        where: { id: wifiUser.id },
        data: {
          totalBytesIn: { increment: deltaIn },
          totalBytesOut: { increment: deltaOut },
          lastAccountingAt: new Date(),
        },
      });
    }
  }

  /**
   * Check and enforce data limits for all active sessions.
   * When a session exceeds its plan's data limit, terminate it via Session-Timeout.
   * 
   * Bug 2 fix: Uses HARD DELETE on RadCheck (FreeRADIUS ignores isActive).
   * Bug 3 fix: Deletes existing Session-Timeout before inserting kill value.
   * Bug 4 fix: Matches user by session.username instead of OR on guestId/bookingId.
   * Bug 5 fix: Compares bytes directly (session.dataUsed is in bytes, not MB).
   * Bug 6 fix: Wraps per-user enforcement in db.$transaction().
   */
  private async enforceDataLimits(): Promise<number> {
    let enforced = 0;

    // Get all active sessions with their WiFi user's plan
    const activeSessions = await db.wiFiSession.findMany({
      where: { status: 'active' },
      include: {
        plan: {
          select: { dataLimit: true },
        },
      },
    });

    // Batch-load all WiFiUsers for active sessions (eliminates N+1)
    const sessionUsernames = [...new Set(activeSessions.map(s => s.username).filter(Boolean))];
    const wifiUsers = sessionUsernames.length > 0
      ? await db.wiFiUser.findMany({ where: { username: { in: sessionUsernames } } })
      : [];
    const wifiUserMap = new Map(wifiUsers.map(u => [u.username, u]));

    for (const session of activeSessions) {
      if (!session.plan?.dataLimit || session.plan.dataLimit <= 0) continue;

      // Look up WiFiUser from pre-loaded map (O(1), no DB query)
      const wifiUser = session.username ? wifiUserMap.get(session.username) : null;

      if (!wifiUser) continue;

      // Bug 5: All byte values are already in bytes — direct comparison
      const dataLimitBytes = Number(session.plan.dataLimit) * 1024 * 1024;
      const userTotalBytes = Number((wifiUser.totalBytesIn || BigInt(0)) + (wifiUser.totalBytesOut || BigInt(0)));
      // C5 FIX: userTotalBytes already includes current session bytes (from interim delta increments)
      // Do NOT add session.dataUsed — that would double-count
      // M5: Counter-reset resilience — userTotalBytes is built from delta increments, so
      // a router counter reset (which clamps interim delta to 0) cannot reduce this total.
      const totalUsageBytes = userTotalBytes;

      if (totalUsageBytes >= dataLimitBytes) {
        console.log(
          `[AccountingSync] Data limit exceeded for user ${wifiUser.username}: ` +
          `${Math.round(totalUsageBytes / (1024 * 1024))}MB used of ${session.plan.dataLimit}MB limit`
        );

        // Bug 6: Wrap all enforcement operations in a transaction
        await db.$transaction(async (tx) => {
          // Close the session
          await tx.wiFiSession.update({
            where: { id: session.id },
            data: {
              status: 'terminated',
              endTime: new Date(),
              updatedAt: new Date(),
            },
          });

          // Suspend the WiFi user
          await tx.wiFiUser.update({
            where: { id: wifiUser.id },
            data: { status: 'suspended' },
          });

          // Bug 2: HARD DELETE RadCheck — FreeRADIUS doesn't filter by isActive,
          // so soft-delete (isActive: false) has no effect. Remove credentials entirely
          // so FreeRADIUS returns "User not found" and rejects further access.
          await tx.radCheck.deleteMany({
            where: { username: wifiUser.username },
          });

          // Bug 3: Delete any existing Session-Timeout before inserting the kill value
          // to avoid duplicate key errors and ensure only our kill timeout is active
          await tx.radReply.deleteMany({
            where: {
              username: wifiUser.username,
              attribute: 'Session-Timeout',
            },
          });

          // Add Session-Timeout = 1 to RadReply to immediately kick the user
          await tx.radReply.create({
            data: {
              wifiUserId: wifiUser.id,
              username: wifiUser.username,
              attribute: 'Session-Timeout',
              op: ':=',
              value: '1',
              isActive: true,
            },
          });
        });

        enforced++;
      }
    }

    return enforced;
  }

  /**
   * Get active sessions count for a property
   */
  async getActiveSessionsCount(propertyId: string): Promise<number> {
    return db.wiFiSession.count({
      where: { status: 'active', propertyId },
    });
  }

  /**
   * Get bandwidth usage summary for a time period.
   * Note: dataUsed stores bytes, so we convert to MB for the response.
   */
  async getBandwidthUsage(propertyId: string, startDate: Date, endDate: Date) {
    const sessions = await db.wiFiSession.findMany({
      where: {
        startTime: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        dataUsed: true,
        duration: true,
      },
    });

    // Bug 5 follow-up: dataUsed is now in bytes, convert to MB for reporting
    const totalDataBytes = sessions.reduce((sum, s) => {
      return sum + Number(s.dataUsed || BigInt(0));
    }, 0);

    return {
      totalDataMB: Math.floor(totalDataBytes / 1048576),
      totalDurationSeconds: sessions.reduce((sum, s) => sum + s.duration, 0),
      sessionCount: sessions.length,
    };
  }

  /**
   * Cleanup old ended sessions (retention period).
   * 
   * Bug 9 fix: Only deletes sessions whose RadAcct counterpart has acctstoptime set
   * (i.e., RADIUS has confirmed the session ended). This prevents deleting sessions
   * that might have in-flight accounting records.
   */
  async cleanupOldSessions(retentionDays: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    // Get candidate sessions that are old enough and properly ended
    const candidateSessions = await db.wiFiSession.findMany({
      where: {
        endTime: { lt: cutoffDate },
        status: { in: ['ended', 'terminated'] },
      },
      select: { id: true, macAddress: true },
    });

    if (candidateSessions.length === 0) return 0;

    // Bug 9: Find sessions whose RadAcct counterpart still has no acctstoptime
    // (i.e., RADIUS hasn't confirmed the stop — these could have in-flight records)
    const macAddresses = [...new Set(candidateSessions.map(s => s.macAddress))];

    const openAcctRecords = await db.radAcct.findMany({
      where: {
        callingstationid: { in: macAddresses },
        acctstoptime: null,
      },
      select: { callingstationid: true },
    });

    // Set of MAC addresses that still have open RadAcct records
    const openMacs = new Set(openAcctRecords.map(r => r.callingstationid));

    // Only delete sessions whose RadAcct has acctstoptime (not null)
    const safeToDeleteIds = candidateSessions
      .filter(s => !openMacs.has(s.macAddress))
      .map(s => s.id);

    if (safeToDeleteIds.length === 0) return 0;

    const result = await db.wiFiSession.deleteMany({
      where: { id: { in: safeToDeleteIds } },
    });

    return result.count;
  }
}

// Singleton instance
export const wifiAccountingSyncService = new WiFiAccountingSyncService();
