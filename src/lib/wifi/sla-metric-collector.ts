/**
 * StaySuite SLA Metric Collector — Cron Job #2
 *
 * Populates the WiFiSLAMetric table by measuring actual uptime, speed, and
 * latency for each property that has a WiFiSLAConfig.
 *
 * Runs on a schedule (every measurementInterval minutes) via the
 * /api/cron/sla-metrics endpoint.
 *
 * Data sources:
 *   - NasHealthLog  → uptime %, average latency
 *   - radacct        → download/upload speeds, session count, bandwidth
 *
 * Alert logic:
 *   - Compares measured values against SLA targets in WiFiSLAConfig
 *   - If any target is breached AND alertOnBreach is true, creates a WiFiAlert
 *     when the breach has persisted for >= breachDuration minutes.
 */

import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { bridgeSLABreachesToAlerts } from '@/lib/services/sla-alert-bridge';
import { dispatchAlertNotifications } from '@/lib/wifi/services/wifi-alert-notifier';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

interface SlaConfigRow {
  id: string;
  tenantId: string;
  propertyId: string;
  uptimeTarget: number;
  speedTargetDown: number;
  speedTargetUp: number;
  latencyTarget: number;
  measurementInterval: number;
  alertOnBreach: boolean;
  breachDuration: number;
}

interface ExistingMetric {
  id: string;
  periodStart: Date;
  periodEnd: Date;
  createdAt: Date;
}

interface UptimeStats {
  totalChecks: number;
  onlineChecks: number;
  avgLatency: number | null;
}

interface RadacctStats {
  totalSessions: number;
  totalBytesDown: number;
  totalBytesUp: number;
  totalSessionTime: number;
}

export interface SlaMetricResult {
  collected: number;
  breached: number;
  alerts: number;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

/**
 * Align a timestamp DOWN to the nearest measurement-interval boundary.
 *
 * Example: if interval = 5 min and now = 14:37 → periodStart = 14:35
 */
function alignToInterval(date: Date, intervalMinutes: number): Date {
  const epochMs = date.getTime();
  const intervalMs = intervalMinutes * 60 * 1000;
  return new Date(Math.floor(epochMs / intervalMs) * intervalMs);
}

/**
 * Compute period end = periodStart + intervalMinutes.
 */
function periodEndFrom(periodStart: Date, intervalMinutes: number): Date {
  return new Date(periodStart.getTime() + intervalMinutes * 60 * 1000);
}

/**
 * Convert bytes to gigabytes (1 GB = 1,073,741,824 bytes).
 */
function bytesToGB(bytes: number): number {
  return bytes / (1024 * 1024 * 1024);
}

/**
 * Calculate average speed in Mbps from bytes and seconds.
 * Mbps = (bytes * 8) / (seconds * 1,000,000)
 */
function bytesToMbps(bytes: number, seconds: number): number {
  if (seconds <= 0) return 0;
  return (bytes * 8) / (seconds * 1_000_000);
}

// ────────────────────────────────────────────────────────────
// Data Collection Functions
// ────────────────────────────────────────────────────────────

/**
 * Fetch uptime and latency stats from NasHealthLog for a property
 * within a given time window.
 *
 * Queries:
 *   - Total number of health checks in the period
 *   - Count of checks where isOnline = true
 *   - Average avgLatencyMs across all checks (not just online ones)
 */
async function fetchUptimeStats(
  tenantId: string,
  propertyId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<UptimeStats> {
  try {
    const rows = await db.$queryRaw<
      Array<{ totalChecks: string; onlineChecks: string; avgLatency: string | null }>
    >(Prisma.sql`
      SELECT
        COUNT(*)::text                            AS "totalChecks",
        COUNT(*) FILTER (WHERE "isOnline" = true)::text AS "onlineChecks",
        AVG("avgLatencyMs")::text                 AS "avgLatency"
      FROM "NasHealthLog"
      WHERE "tenantId"   = ${tenantId}::uuid
        AND "propertyId" = ${propertyId}::uuid
        AND "createdAt" >= ${periodStart}
        AND "createdAt" <  ${periodEnd}
    `);

    if (rows.length === 0 || rows[0].totalChecks === '0') {
      return { totalChecks: 0, onlineChecks: 0, avgLatency: null };
    }

    return {
      totalChecks: parseInt(rows[0].totalChecks, 10),
      onlineChecks: parseInt(rows[0].onlineChecks, 10),
      avgLatency: rows[0].avgLatency !== null ? parseFloat(rows[0].avgLatency) : null,
    };
  } catch (err) {
    console.error(
      `[SlaMetricCollector] Error fetching uptime stats for property ${propertyId}:`,
      err instanceof Error ? err.message : String(err)
    );
    return { totalChecks: 0, onlineChecks: 0, avgLatency: null };
  }
}

/**
 * Fetch radacct statistics for a property within a time window.
 *
 * We look at sessions that were ACTIVE at any point during the period:
 *   - acctstarttime < periodEnd  (session started before period ended)
 *   - (acctstoptime IS NULL OR acctstoptime > periodStart) (not stopped, or stopped after period started)
 *
 * Metrics derived:
 *   - totalSessions: count of distinct sessions overlapping the period
 *   - totalBytesDown: sum of acctoutputoctets (NAS → client)
 *   - totalBytesUp: sum of acctinputoctets (client → NAS)
 *   - totalSessionTime: sum of acctsessiontime (seconds of time overlapping the period)
 */
async function fetchRadacctStats(
  tenantId: string,
  propertyId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<RadacctStats> {
  try {
    // First, get NAS IPs associated with this property to scope the radacct query.
    const nasIps = await db.$queryRaw<Array<{ ipAddress: string }>>(Prisma.sql`
      SELECT "ipAddress"
      FROM "RadiusNAS"
      WHERE "propertyId" = ${propertyId}::uuid
        AND "tenantId"   = ${tenantId}::uuid
        AND status       = 'active'
        AND "ipAddress"  IS NOT NULL
        AND "ipAddress"  != ''
        AND "ipAddress"  != '0.0.0.0'
    `);

    if (nasIps.length === 0) {
      return { totalSessions: 0, totalBytesDown: 0, totalBytesUp: 0, totalSessionTime: 0 };
    }

    const ipList = nasIps.map((n) => n.ipAddress);

    const rows = await db.$queryRaw<
      Array<{
        totalSessions: string;
        totalBytesDown: string;
        totalBytesUp: string;
        totalSessionTime: string;
      }>
    >(Prisma.sql`
      SELECT
        COUNT(*)::text                                                        AS "totalSessions",
        COALESCE(SUM(COALESCE(acctoutputoctets, 0))::text, '0')              AS "totalBytesDown",
        COALESCE(SUM(COALESCE(acctinputoctets, 0))::text, '0')               AS "totalBytesUp",
        COALESCE(SUM(COALESCE(acctsessiontime, 0))::text, '0')               AS "totalSessionTime"
      FROM radacct
      WHERE nasipaddress     = ANY(${ipList}::text[])
        AND acctstarttime    < ${periodEnd}
        AND (acctstoptime IS NULL OR acctstoptime > ${periodStart})
    `);

    if (rows.length === 0) {
      return { totalSessions: 0, totalBytesDown: 0, totalBytesUp: 0, totalSessionTime: 0 };
    }

    return {
      totalSessions: parseInt(rows[0].totalSessions, 10),
      totalBytesDown: parseInt(rows[0].totalBytesDown, 10),
      totalBytesUp: parseInt(rows[0].totalBytesUp, 10),
      totalSessionTime: parseInt(rows[0].totalSessionTime, 10),
    };
  } catch (err) {
    console.error(
      `[SlaMetricCollector] Error fetching radacct stats for property ${propertyId}:`,
      err instanceof Error ? err.message : String(err)
    );
    return { totalSessions: 0, totalBytesDown: 0, totalBytesUp: 0, totalSessionTime: 0 };
  }
}

// ────────────────────────────────────────────────────────────
// Breach Detection & Alerting
// ────────────────────────────────────────────────────────────

type BreachType = 'uptime' | 'speed_down' | 'speed_up' | 'latency';

/**
 * Determine which SLA targets have been breached.
 */
function detectBreaches(config: SlaConfigRow, metrics: {
  actualUptime: number | null;
  avgSpeedDown: number | null;
  avgSpeedUp: number | null;
  avgLatency: number | null;
}): BreachType[] {
  const breaches: BreachType[] = [];

  if (metrics.actualUptime !== null && metrics.actualUptime < config.uptimeTarget) {
    breaches.push('uptime');
  }

  if (metrics.avgSpeedDown !== null && metrics.avgSpeedDown < config.speedTargetDown) {
    breaches.push('speed_down');
  }

  if (metrics.avgSpeedUp !== null && metrics.avgSpeedUp < config.speedTargetUp) {
    breaches.push('speed_up');
  }

  if (metrics.avgLatency !== null && metrics.avgLatency > config.latencyTarget) {
    breaches.push('latency');
  }

  return breaches;
}

/**
 * Check if there is an unresolved sla_breach alert for this property
 * that was created within breachDuration minutes ago (or earlier).
 * If the breach has persisted for >= breachDuration minutes, we should alert.
 */
async function shouldCreateAlert(
  tenantId: string,
  propertyId: string,
  breachDurationMinutes: number
): Promise<boolean> {
  try {
    // Find the earliest unresolved sla_breach alert for this property
    const rows = await db.$queryRaw<
      Array<{ id: string; createdAt: Date }>
    >(Prisma.sql`
      SELECT id, "createdAt"
      FROM "WiFiAlert"
      WHERE "tenantId"   = ${tenantId}::uuid
        AND "propertyId" = ${propertyId}::uuid
        AND type         = 'sla_breach'
        AND status       = 'active'
      ORDER BY "createdAt" ASC
      LIMIT 1
    `);

    if (rows.length === 0) {
      // No existing alert — check if we need to create the first one
      // We create the alert immediately on first breach detection.
      // The breach duration check prevents duplicate alerts within the window.
      return true;
    }

    // There is already an active alert — check if enough time has passed
    // since it was created to warrant a NEW alert (escalation).
    const firstAlert = rows[0];
    const elapsedMinutes =
      (Date.now() - firstAlert.createdAt.getTime()) / (60 * 1000);

    // Only create a new alert if breach has persisted beyond breachDuration
    // AND there isn't already a recent alert.
    return false;
  } catch (err) {
    console.error(
      `[SlaMetricCollector] Error checking existing alerts for property ${propertyId}:`,
      err instanceof Error ? err.message : String(err)
    );
    return false;
  }
}

/**
 * Create a WiFiAlert for SLA breach.
 */
async function createBreachAlert(
  tenantId: string,
  propertyId: string,
  breachTypes: BreachType[],
  metrics: {
    actualUptime: number | null;
    avgSpeedDown: number | null;
    avgSpeedUp: number | null;
    avgLatency: number | null;
  }
): Promise<void> {
  try {
    const readableBreaches = breachTypes.map((bt) => {
      switch (bt) {
        case 'uptime': return 'Uptime below target';
        case 'speed_down': return 'Download speed below target';
        case 'speed_up': return 'Upload speed below target';
        case 'latency': return 'Latency above target';
      }
    });

    const details: Record<string, unknown> = {
      breachTypes,
      actualUptime: metrics.actualUptime,
      avgSpeedDown: metrics.avgSpeedDown,
      avgSpeedUp: metrics.avgSpeedUp,
      avgLatency: metrics.avgLatency,
    };

    const createdAlert = await db.wiFiAlert.create({
      data: {
        tenantId,
        propertyId,
        type: 'sla_breach',
        severity: 'warning',
        title: 'SLA Breach Detected',
        message: `SLA targets violated: ${readableBreaches.join(', ')}`,
        metadata: JSON.stringify(details),
        status: 'active',
      },
    });

    // Fire-and-forget: notify staff without blocking metric collection
    dispatchAlertNotifications(createdAlert).catch(() => {});

    console.info(
      `[SlaMetricCollector] SLA breach alert created for property ${propertyId}: ${readableBreaches.join(', ')}`
    );
  } catch (err) {
    console.error(
      `[SlaMetricCollector] Error creating breach alert for property ${propertyId}:`,
      err instanceof Error ? err.message : String(err)
    );
  }
}

/**
 * Resolve any active sla_breach alerts for a property when metrics are back to normal.
 */
async function resolveBreachAlerts(tenantId: string, propertyId: string): Promise<void> {
  try {
    const result = await db.wiFiAlert.updateMany({
      where: {
        tenantId,
        propertyId,
        type: 'sla_breach',
        status: 'active',
      },
      data: {
        status: 'resolved',
        resolvedAt: new Date(),
      },
    });

    if (result.count > 0) {
      console.info(
        `[SlaMetricCollector] Resolved ${result.count} SLA breach alert(s) for property ${propertyId}`
      );
    }
  } catch {
    // Non-fatal
  }
}

// ────────────────────────────────────────────────────────────
// Main Collector
// ────────────────────────────────────────────────────────────

/**
 * Collect SLA metrics for all properties with a WiFiSLAConfig.
 *
 * For each config:
 * 1. Determine the current measurement period (aligned to measurementInterval)
 * 2. Query NasHealthLog and radacct for the period's data
 * 3. Create or update the WiFiSLAMetric record
 * 4. Check for SLA breaches and create/resolved alerts as needed
 *
 * Returns summary counts.
 */
export async function collectSlaMetrics(): Promise<{
  collected: number;
  breached: number;
  alerts: number;
}> {
  const result: SlaMetricResult = {
    collected: 0,
    breached: 0,
    alerts: 0,
  };

  try {
    // ── Step 1: Fetch all SLA configs ──
    const configs = await db.$queryRaw<SlaConfigRow[]>(Prisma.sql`
      SELECT
        id, "tenantId", "propertyId",
        "uptimeTarget", "speedTargetDown", "speedTargetUp", "latencyTarget",
        "measurementInterval", "alertOnBreach", "breachDuration"
      FROM "WiFiSLAConfig"
    `);

    if (configs.length === 0) {
      console.info('[SlaMetricCollector] No SLA configs found — nothing to collect');
      return result;
    }

    console.info(`[SlaMetricCollector] Processing ${configs.length} SLA config(s)`);

    const now = new Date();

    // ── Step 2: Process each config ──
    for (const config of configs) {
      try {
        const periodStart = alignToInterval(now, config.measurementInterval);
        const periodEnd = periodEndFrom(periodStart, config.measurementInterval);

        // ── Check for existing metric in this period ──
        const existingMetrics = await db.$queryRaw<ExistingMetric[]>(
          Prisma.sql`SELECT id, "periodStart", "periodEnd", "createdAt"
          FROM "WiFiSLAMetric"
          WHERE "slaConfigId" = ${config.id}::uuid
            AND "periodStart" = ${periodStart}
          LIMIT 1`
        );

        // ── Fetch data from NasHealthLog and radacct ──
        const [uptimeStats, radacctStats] = await Promise.all([
          fetchUptimeStats(config.tenantId, config.propertyId, periodStart, periodEnd),
          fetchRadacctStats(config.tenantId, config.propertyId, periodStart, periodEnd),
        ]);

        // ── Calculate derived metrics ──
        const actualUptime =
          uptimeStats.totalChecks > 0
            ? (uptimeStats.onlineChecks / uptimeStats.totalChecks) * 100
            : null;

        const avgLatency = uptimeStats.avgLatency;

        // Average speed: total bytes / total session time
        const avgSpeedDown =
          radacctStats.totalSessionTime > 0
            ? bytesToMbps(radacctStats.totalBytesDown, radacctStats.totalSessionTime)
            : null;

        const avgSpeedUp =
          radacctStats.totalSessionTime > 0
            ? bytesToMbps(radacctStats.totalBytesUp, radacctStats.totalSessionTime)
            : null;

        const totalBandwidth = bytesToGB(radacctStats.totalBytesDown + radacctStats.totalBytesUp);

        // ── Detect breaches ──
        const breachTypes = detectBreaches(config, {
          actualUptime,
          avgSpeedDown,
          avgSpeedUp,
          avgLatency,
        });

        const isBreached = breachTypes.length > 0;

        // ── Upsert metric ──
        if (existingMetrics.length > 0) {
          // UPDATE existing metric (period still ongoing — recalculate)
          await db.$executeRaw(Prisma.sql`
            UPDATE "WiFiSLAMetric"
            SET
              "periodEnd"     = ${periodEnd},
              "actualUptime"  = ${actualUptime},
              "avgSpeedDown"  = ${avgSpeedDown},
              "avgSpeedUp"    = ${avgSpeedUp},
              "avgLatency"    = ${avgLatency},
              "totalSessions" = ${radacctStats.totalSessions},
              "totalBandwidth"= ${totalBandwidth},
              "breached"      = ${isBreached},
              "breachTypes"   = ${JSON.stringify(breachTypes)}
            WHERE id = ${existingMetrics[0].id}::uuid
          `);
        } else {
          // CREATE new metric for this period
          await db.wiFiSLAMetric.create({
            data: {
              tenantId: config.tenantId,
              propertyId: config.propertyId,
              slaConfigId: config.id,
              periodStart,
              periodEnd,
              actualUptime,
              avgSpeedDown,
              avgSpeedUp,
              avgLatency,
              totalSessions: radacctStats.totalSessions,
              totalBandwidth,
              breached: isBreached,
              breachTypes: JSON.stringify(breachTypes),
            },
          });
        }

        result.collected++;

        if (isBreached) {
          result.breached++;

          // ── Alerting: only if alertOnBreach is true ──
          if (config.alertOnBreach) {
            // Check how long the breach has been going on.
            // Look for consecutive breached metrics going back breachDuration minutes.
            const breachWindowStart = new Date(
              periodStart.getTime() - config.breachDuration * 60 * 1000
            );

            const recentMetrics = await db.$queryRaw<
              Array<{ breached: boolean }>
            >(Prisma.sql`
              SELECT breached
              FROM "WiFiSLAMetric"
              WHERE "slaConfigId" = ${config.id}::uuid
                AND "periodStart" >= ${breachWindowStart}
                AND "periodStart" <  ${periodStart}
              ORDER BY "periodStart" ASC
            `);

            // Check if ALL recent metrics in the window are breached
            // (or if this is the very first breach — no prior metrics)
            const allBreached =
              recentMetrics.length === 0 || recentMetrics.every((m) => m.breached);

            // Also check that the window spans enough time to exceed breachDuration
            const windowCoversFullDuration =
              recentMetrics.length === 0 ||
              (recentMetrics.length >= Math.ceil(config.breachDuration / config.measurementInterval) &&
                allBreached);

            if (windowCoversFullDuration) {
              const shouldAlert = await shouldCreateAlert(
                config.tenantId,
                config.propertyId,
                config.breachDuration
              );

              if (shouldAlert) {
                await createBreachAlert(config.tenantId, config.propertyId, breachTypes, {
                  actualUptime,
                  avgSpeedDown,
                  avgSpeedUp,
                  avgLatency,
                });
                result.alerts++;
              }
            }
          }
        } else {
          // ── No breach — resolve any active alerts ──
          if (config.alertOnBreach) {
            await resolveBreachAlerts(config.tenantId, config.propertyId);
          }
        }
      } catch (err) {
        console.error(
          `[SlaMetricCollector] Error processing config ${config.id} (property ${config.propertyId}):`,
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    // ── Step 3: Bridge SLA breaches to F20 alerts (non-blocking) ──
    const tenantIds = [...new Set(configs.map((c) => c.tenantId))];
    for (const tid of tenantIds) {
      try {
        const bridgeResult = await bridgeSLABreachesToAlerts(tid);
        if (bridgeResult.alertsCreated > 0 || bridgeResult.alertsResolved > 0) {
          console.info(
            `[SlaMetricCollector] Alert bridge for tenant ${tid}: ` +
              `${bridgeResult.alertsCreated} created, ${bridgeResult.alertsResolved} resolved`
          );
        }
      } catch (bridgeErr) {
        // Non-blocking — don't let bridge failures affect metric collection
        console.error(
          `[SlaMetricCollector] Alert bridge failed for tenant ${tid}:`,
          bridgeErr instanceof Error ? bridgeErr.message : String(bridgeErr)
        );
      }
    }

    console.info(
      `[SlaMetricCollector] Cycle complete: ${result.collected} collected, ` +
        `${result.breached} breached, ${result.alerts} alerts`
    );
  } catch (err) {
    console.error(
      '[SlaMetricCollector] Fatal error:',
      err instanceof Error ? err.message : String(err)
    );
  }

  return result;
}
