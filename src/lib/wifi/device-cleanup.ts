/**
 * Device Cleanup Service
 *
 * Deletes stale WiFiDevice records based on per-tenant cleanup settings.
 * A device is considered stale when its `lastSeen` timestamp is older than
 * the configured `autoCleanupDays` threshold (default 30 days).
 *
 * Only devices whose associated guest has checked out (no active booking) or
 * where the device has not been seen for a very long time are cleaned up,
 * protecting devices belonging to in-house guests.
 *
 * Settings are read from WiFiSettings table (key: 'device_management')
 * via getWifiSettings() — the same source as the GUI at
 * Sidebar → WiFi → Multi-Device Registration → Settings tab.
 */

import { db } from '@/lib/db';
import { getWifiSettings, type DeviceManagementSettings } from '@/lib/wifi-settings';

export interface DeviceCleanupResult {
  deleted: number;
  byTenant: Record<string, number>;
  settingsUsed: Record<string, number>; // tenantId → autoCleanupDays used
}

const DEFAULT_CLEANUP_DAYS = 30;
const BATCH_SIZE = 100;

/**
 * Clean up stale WiFiDevice records.
 *
 * Strategy:
 * 1. Fetch all unique tenants that have WiFiDevice records.
 * 2. For each tenant, read their autoCleanupDays from WiFiSettings
 *    (same settings the GUI writes to).
 * 3. Find devices whose `lastSeen` is older than the threshold.
 * 4. Among those, only delete devices where the associated guest has no
 *    active (confirmed / checked_in) booking, OR the device hasn't been
 *    seen in more than 2x the cleanup threshold (very stale).
 * 5. Delete in batches of 100 to keep transactions manageable.
 */
export async function cleanupStaleDevices(): Promise<DeviceCleanupResult> {
  const now = new Date();
  const byTenant: Record<string, number> = {};
  const settingsUsed: Record<string, number> = {};

  // -------------------------------------------------------------------------
  // 1. Find all distinct tenants that have WiFiDevice records
  // -------------------------------------------------------------------------
  const tenantRows = await db.wiFiDevice.findMany({
    distinct: ['tenantId'],
    select: { tenantId: true },
  });

  let totalDeleted = 0;

  for (const row of tenantRows) {
    const tenantId = row.tenantId;

    // -------------------------------------------------------------------
    // 2. Read per-tenant cleanup days from WiFiSettings
    // -------------------------------------------------------------------
    let autoCleanupDays = DEFAULT_CLEANUP_DAYS;

    try {
      const settings: DeviceManagementSettings = await getWifiSettings(
        tenantId,
        'device_management'
      );
      if (settings.autoCleanupDays && settings.autoCleanupDays > 0) {
        autoCleanupDays = settings.autoCleanupDays;
      }
    } catch {
      // Settings not found for this tenant — use default
    }

    settingsUsed[tenantId] = autoCleanupDays;

    const cutoffDate = new Date(
      now.getTime() - autoCleanupDays * 24 * 60 * 60 * 1000
    );

    // "Very stale" threshold — 2x the cleanup days, for force-cleanup
    const veryStaleCutoff = new Date(
      now.getTime() - autoCleanupDays * 2 * 24 * 60 * 60 * 1000
    );

    // -------------------------------------------------------------------
    // 3. Find stale devices for this tenant
    // -------------------------------------------------------------------
    const staleDevices = await db.wiFiDevice.findMany({
      where: {
        tenantId,
        lastSeen: { lt: cutoffDate },
      },
      select: {
        id: true,
        tenantId: true,
        guestId: true,
        lastSeen: true,
        guest: {
          select: {
            stays: {
              select: {
                booking: {
                  select: {
                    status: true,
                    checkOut: true,
                  },
                },
              },
              take: 5,
            },
          },
        },
      },
    });

    const idsToDelete: string[] = [];

    for (const device of staleDevices) {
      // Guest has active booking if any linked stay has a booking with
      // confirmed/checked_in status AND checkOut in the future
      const hasActiveStay =
        device.guest?.stays?.some(
          (stay: { booking: { status: string; checkOut: string } | null }) =>
            stay.booking &&
            ['confirmed', 'checked_in'].includes(stay.booking.status) &&
            new Date(stay.booking.checkOut) >= now
        );
      const isVeryStale = device.lastSeen < veryStaleCutoff;

      // Only delete if guest has checked out OR device is very stale
      if (!hasActiveStay || isVeryStale) {
        idsToDelete.push(device.id);
      }
    }

    // -------------------------------------------------------------------
    // 4. Delete in batches
    // -------------------------------------------------------------------
    for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
      const batch = idsToDelete.slice(i, i + BATCH_SIZE);
      const result = await db.wiFiDevice.deleteMany({
        where: { id: { in: batch } },
      });
      const deleted = result.count;
      totalDeleted += deleted;
      byTenant[tenantId] = (byTenant[tenantId] || 0) + deleted;
    }
  }

  console.log(
    `[DeviceCleanup] Deleted ${totalDeleted} stale devices across ${Object.keys(byTenant).length} tenant(s)`,
    byTenant
  );

  return { deleted: totalDeleted, byTenant, settingsUsed };
}
