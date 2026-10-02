/**
 * StaySuite WiFi Alert Notifier
 *
 * Dispatches notifications to relevant staff when WiFi health alerts fire.
 * Designed to be called fire-and-forget so alert creation is never blocked.
 */

import { db } from '@/lib/db';
import { sendImmediateNotification } from '@/lib/services/notification-service';
import type { NotificationCategory } from '@/lib/services/notification-service';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

interface AlertPayload {
  id: string;
  tenantId: string;
  propertyId: string | null;
  type: string;
  severity: string;
  source: string | null;
  message?: string;
  title?: string;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

/** Human-readable title derived from the alert type and source. */
function buildTitle(alert: AlertPayload): string {
  const src = alert.source ?? 'Unknown';

  switch (alert.type) {
    case 'nas_offline':
      return `NAS Offline: ${src}`;
    case 'latency':
      return `High Latency: ${src}`;
    default:
      return `WiFi Alert: ${src}`;
  }
}

/** Map alert severity to notification priority. */
function mapPriority(severity: string): 'urgent' | 'normal' {
  return severity === 'critical' ? 'urgent' : 'normal';
}

/** Map alert severity to notification category. */
function mapCategory(severity: string): NotificationCategory {
  return severity === 'critical' ? 'error' : 'warning';
}

// ────────────────────────────────────────────────────────────
// Main Export
// ────────────────────────────────────────────────────────────

/**
 * Dispatch push / email / in-app notifications to all active users for the
 * tenant that owns the alert.
 *
 * This function is intentionally defensive — every step is wrapped in
 * try/catch so a notification failure never propagates back to the alert
 * generator.
 */
export async function dispatchAlertNotifications(alert: AlertPayload): Promise<void> {
  try {
    // 1. Find all active users for the tenant
    const users = await db.user.findMany({
      where: { tenantId: alert.tenantId, status: 'active' },
      select: { id: true },
    });

    if (users.length === 0) {
      return;
    }

    const title = alert.title ?? buildTitle(alert);
    const message =
      alert.message ?? `WiFi health alert (${alert.type}) for source ${alert.source ?? 'unknown'}.`;
    const priority = mapPriority(alert.severity);
    const category = mapCategory(alert.severity);

    // 2. Notify each user
    for (const user of users) {
      try {
        await sendImmediateNotification(
          alert.tenantId,
          user.id,
          'wifi_alert',
          title,
          message,
          {
            category,
            priority,
            link: `/wifi/health-alerts/${alert.id}`,
            data: {
              alertId: alert.id,
              propertyId: alert.propertyId,
              alertType: alert.type,
              severity: alert.severity,
              source: alert.source,
            },
          },
        );
      } catch (err) {
        // Per-user failure should not stop the rest
        console.error(
          `[WiFiAlertNotifier] Failed to notify user ${user.id}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  } catch (err) {
    // Top-level guard: never throw back to the caller
    console.error(
      '[WiFiAlertNotifier] dispatchAlertNotifications failed:',
      err instanceof Error ? err.message : err,
    );
  }
}
