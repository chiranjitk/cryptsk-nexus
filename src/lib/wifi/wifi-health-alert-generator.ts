/**
 * StaySuite WiFi Health Alert Generator
 *
 * Bridges NAS health check results to WiFiAlert records.
 * Runs after each NAS health check cycle via cron scheduler.
 *
 * Responsibilities:
 *   1. Read last NAS health check result from memory cache
 *   2. Query NasHealthLog for recent offline transitions (last 2 minutes)
 *   3. Create WiFiAlert records for offline / high-latency NAS devices
 *   4. Dedup: skip if an active alert already exists for the same NAS IP + type
 *   5. Auto-resolve: if a previously-offline NAS is back online, resolve its alert
 *
 * Alert rules (configurable per-property via WiFiAlertConfig):
 *   - NAS went offline        → type: nas_offline, severity: critical
 *   - NAS latency > warning  → type: latency,     severity: warning
 *   - NAS latency > critical → type: latency,     severity: critical
 *   - NAS came back online   → auto-resolve active nas_offline alert
 *
 * Thresholds are read from WiFiAlertConfig table (global or per-property override).
 * Falls back to defaults: warning=200ms, critical=500ms.
 */

import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { getLastNasHealthCheck } from './nas-health-check';
import type { NasHealthCheckResult, ProbeResult } from './nas-health-check';
import * as SELog from './session-engine-logger';
import { dispatchAlertNotifications } from './wifi-alert-notifier';

// ────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────

/** How far back to look for NasHealthLog offline entries (seconds) */
const OFFLINE_TRANSITION_WINDOW_SEC = 120;

/** Default latency thresholds (used when no DB config exists) */
const DEFAULT_LATENCY_WARNING_MS = 200;
const DEFAULT_LATENCY_CRITICAL_MS = 500;

// ─── Config cache (in-memory, refreshed each cycle) ──────────────────────────
interface AlertThresholds {
  latencyWarningMs: number;
  latencyCriticalMs: number;
  enabled: boolean;
}

let configCache: Map<string, AlertThresholds> | null = null;
let configCacheTime = 0;
const CONFIG_CACHE_TTL_MS = 30_000; // 30 seconds

/**
 * Load alert configs from DB, grouped by (tenantId, propertyId).
 * Returns a Map where key = propertyId or '__global__' for tenant-level defaults.
 */
async function loadConfigs(): Promise<Map<string, AlertThresholds>> {
  const now = Date.now();
  if (configCache && (now - configCacheTime) < CONFIG_CACHE_TTL_MS) {
    return configCache;
  }

  const configs = await db.wiFiAlertConfig.findMany({
    where: { enabled: true },
  });

  const map = new Map<string, AlertThresholds>();
  for (const c of configs) {
    const key = c.propertyId || `__global_${c.tenantId}`;
    map.set(key, {
      latencyWarningMs: c.latencyWarningMs,
      latencyCriticalMs: c.latencyCriticalMs,
      enabled: c.enabled,
    });
  }

  configCache = map;
  configCacheTime = now;
  return map;
}

/**
 * Get thresholds for a specific tenant + property.
 * Falls back to global config, then to defaults.
 */
async function getThresholds(
  tenantId: string,
  propertyId: string | null,
): Promise<AlertThresholds> {
  const configs = await loadConfigs();

  // Try property-specific first
  if (propertyId) {
    const propConfig = configs.get(propertyId);
    if (propConfig) return propConfig;
  }

  // Fall back to tenant global
  const globalConfig = configs.get(`__global_${tenantId}`);
  if (globalConfig) return globalConfig;

  // Hardcoded defaults
  return {
    latencyWarningMs: DEFAULT_LATENCY_WARNING_MS,
    latencyCriticalMs: DEFAULT_LATENCY_CRITICAL_MS,
    enabled: true,
  };
}

// ────────────────────────────────────────────────────────────
// Main Function
// ────────────────────────────────────────────────────────────

export async function generateHealthAlerts(): Promise<{
  created: number;
  resolved: number;
  skipped: number;
}> {
  const result = { created: 0, resolved: 0, skipped: 0 };

  try {
    // ── Step 1: Read last health check result from memory ──
    const healthCheck = getLastNasHealthCheck();

    if (!healthCheck) {
      SELog.info('[WiFiAlert] No health check result available — skipping alert generation');
      return result;
    }

    if (healthCheck.results.length === 0) {
      SELog.info('[WiFiAlert] Health check ran but no NAS results — skipping');
      return result;
    }

    SELog.info(
      `[WiFiAlert] Processing ${healthCheck.results.length} NAS results ` +
      `(${healthCheck.online} online, ${healthCheck.offline} offline, ${healthCheck.degraded} degraded)`
    );

    // ── Step 2: Query recent offline transitions from NasHealthLog ──
    // Look for entries in the last 2 minutes where isOnline = false.
    // These represent NAS devices that went offline recently.
    const recentOfflineLogs = await db.$queryRaw<
      Array<{
        nasIpAddress: string;
        nasName: string;
        tenantId: string;
        propertyId: string;
        createdAt: Date;
        avgLatencyMs: number | null;
      }>
    >(Prisma.sql`
      SELECT DISTINCT ON ("nasIpAddress")
              "nasIpAddress", "nasName", "tenantId", "propertyId",
              "createdAt", "avgLatencyMs"
       FROM "NasHealthLog"
       WHERE "isOnline" = false
         AND "createdAt" > NOW() - (${OFFLINE_TRANSITION_WINDOW_SEC} * INTERVAL '1 second')
       ORDER BY "nasIpAddress", "createdAt" DESC
    `);

    // Build a set of recently-offline NAS IPs for quick lookup
    const recentlyOfflineIps = new Set(recentOfflineLogs.map((l) => l.nasIpAddress));
    // Map NAS IP → log entry for tenantId/propertyId
    const offlineLogMap = new Map(
      recentOfflineLogs.map((l) => [l.nasIpAddress, l]),
    );

    // ── Step 3: Process each probe result ──
    for (const probe of healthCheck.results) {
      // ── 3a. NAS is OFFLINE → create nas_offline alert ──
      if (!probe.isOnline) {
        // Check if we already have an active nas_offline alert for this NAS IP
        const existingAlert = await findActiveAlert(probe.nasIp, 'nas_offline');

        if (existingAlert) {
          result.skipped++;
          SELog.info(
            `[WiFiAlert] Skipping duplicate nas_offline alert for ${probe.nasName} (${probe.nasIp})`
          );
        } else {
          // Use the NasHealthLog entry for tenantId/propertyId, fall back to probe data
          const logEntry = offlineLogMap.get(probe.nasIp);
          const tenantId = logEntry?.tenantId ?? probe.tenantId;
          const propertyId = logEntry?.propertyId ?? probe.propertyId;

          await createAlert({
            tenantId,
            propertyId: propertyId || null,
            type: 'nas_offline',
            severity: 'critical',
            title: `NAS Offline: ${probe.nasName} (${probe.nasIp})`,
            message: `NAS device "${probe.nasName}" (${probe.nasIp}) is not responding to health probes. ` +
              (probe.error ? `Error: ${probe.error}` : 'All probes failed (ICMP + UDP ports).'),
            source: probe.nasIp,
            metadata: JSON.stringify({
              nasName: probe.nasName,
              nasIp: probe.nasIp,
              nasId: probe.nasId,
              probesUsed: probe.probesUsed,
              error: probe.error ?? null,
              probedAt: probe.probedAt.toISOString(),
            }),
          });

          result.created++;
          SELog.warn(
            `[WiFiAlert] Created nas_offline (critical) alert for ${probe.nasName} (${probe.nasIp})`
          );
        }
      } else {
        // ── 3b. NAS is ONLINE → auto-resolve any active nas_offline alert ──
        const activeOfflineAlert = await findActiveAlert(probe.nasIp, 'nas_offline');
        if (activeOfflineAlert) {
          await resolveAlert(
            activeOfflineAlert.id,
            'system',
            `NAS "${probe.nasName}" (${probe.nasIp}) is back online (latency: ${probe.avgLatencyMs ?? 0}ms)`,
          );
          result.resolved++;
          SELog.info(
            `[WiFiAlert] Auto-resolved nas_offline alert for ${probe.nasName} (${probe.nasIp})`
          );
        }
      }

      // ── 3c. High latency check (only for online NAS) ──
      if (probe.isOnline && probe.avgLatencyMs !== null) {
        // Load dynamic thresholds per-tenant/property (falls back to DEFAULT_* constants)
        const thresholds = await getThresholds(probe.tenantId, probe.propertyId);
        let severity: 'warning' | 'critical' | null = null;

        if (probe.avgLatencyMs > thresholds.latencyCriticalMs) {
          severity = 'critical';
        } else if (probe.avgLatencyMs > thresholds.latencyWarningMs) {
          severity = 'warning';
        }

        if (severity) {
          // Check for existing active latency alert for this NAS IP
          const existingLatencyAlert = await findActiveAlert(probe.nasIp, 'latency');

          if (existingLatencyAlert) {
            // If severity escalated (warning → critical), update the existing alert
            if (severity === 'critical' && existingLatencyAlert.severity === 'warning') {
              await db.wiFiAlert.update({
                where: { id: existingLatencyAlert.id },
                data: {
                  severity: 'critical',
                  title: `Critical Latency: ${probe.nasName} (${probe.nasIp}) — ${Math.round(probe.avgLatencyMs)}ms`,
                  message: `NAS "${probe.nasName}" (${probe.nasIp}) has critically high latency of ${Math.round(probe.avgLatencyMs)}ms (threshold: ${thresholds.latencyCriticalMs}ms). ` +
                    `Users may experience severe connectivity issues.`,
                },
              });
              SELog.warn(
                `[WiFiAlert] Escalated latency alert to critical for ${probe.nasName} (${probe.nasIp}) — ${Math.round(probe.avgLatencyMs)}ms`
              );
            } else {
              result.skipped++;
            }
          } else {
            await createAlert({
              tenantId: probe.tenantId,
              propertyId: probe.propertyId || null,
              type: 'latency',
              severity,
              title: `${severity === 'critical' ? 'Critical' : 'High'} Latency: ${probe.nasName} (${probe.nasIp}) — ${Math.round(probe.avgLatencyMs)}ms`,
              message: `NAS "${probe.nasName}" (${probe.nasIp}) has ${severity === 'critical' ? 'critically ' : ''}high latency of ${Math.round(probe.avgLatencyMs)}ms ` +
                `(threshold: ${severity === 'critical' ? thresholds.latencyCriticalMs : thresholds.latencyWarningMs}ms). ` +
                (severity === 'critical'
                  ? 'Users may experience severe connectivity issues.'
                  : 'Users may notice degraded WiFi performance.'),
              source: probe.nasIp,
              metadata: JSON.stringify({
                nasName: probe.nasName,
                nasIp: probe.nasIp,
                nasId: probe.nasId,
                avgLatencyMs: probe.avgLatencyMs,
                icmpLatencyMs: probe.icmpLatencyMs,
                authPortLatencyMs: probe.authPortLatencyMs,
                acctPortLatencyMs: probe.acctPortLatencyMs,
                probesUsed: probe.probesUsed,
                probedAt: probe.probedAt.toISOString(),
              }),
            });

            result.created++;
            SELog.warn(
              `[WiFiAlert] Created latency (${severity}) alert for ${probe.nasName} (${probe.nasIp}) — ${Math.round(probe.avgLatencyMs)}ms`
            );
          }
        } else {
          // Latency is within acceptable range — auto-resolve any active latency alert
          const activeLatencyAlert = await findActiveAlert(probe.nasIp, 'latency');
          if (activeLatencyAlert) {
            await resolveAlert(
              activeLatencyAlert.id,
              'system',
              `NAS "${probe.nasName}" (${probe.nasIp}) latency returned to normal (${Math.round(probe.avgLatencyMs)}ms)`,
            );
            result.resolved++;
            SELog.info(
              `[WiFiAlert] Auto-resolved latency alert for ${probe.nasName} (${probe.nasIp}) — ${Math.round(probe.avgLatencyMs)}ms`
            );
          }
        }
      }
    }

    SELog.info(
      `[WiFiAlert] Generation complete: ${result.created} created, ${result.resolved} resolved, ${result.skipped} skipped`
    );

    return result;
  } catch (err) {
    SELog.error(
      `[WiFiAlert] Fatal error during alert generation: ${err instanceof Error ? err.message : String(err)}`
    );
    return result;
  }
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

interface AlertInput {
  tenantId: string;
  propertyId: string | null;
  type: string;
  severity: string;
  title: string;
  message: string;
  source: string | null;
  metadata: string;
}

/**
 * Find an active (non-resolved, non-acknowledged) alert for a given source + type.
 */
async function findActiveAlert(
  source: string,
  type: string,
): Promise<{ id: string; severity: string } | null> {
  const rows = await db.$queryRaw<Array<{ id: string; severity: string }>>(Prisma.sql`
    SELECT id, severity
     FROM "WiFiAlert"
     WHERE source = ${source}
       AND type = ${type}
       AND status = 'active'
     ORDER BY "createdAt" DESC
     LIMIT 1`
  );

  return rows.length > 0 ? rows[0] : null;
}

/**
 * Create a new WiFiAlert record.
 */
async function createAlert(input: AlertInput): Promise<void> {
  const createdAlert = await db.wiFiAlert.create({
    data: {
      tenantId: input.tenantId,
      propertyId: input.propertyId,
      type: input.type,
      severity: input.severity,
      title: input.title,
      message: input.message,
      source: input.source,
      metadata: input.metadata,
    },
  });

  // Fire-and-forget: dispatch notifications to staff without blocking alert creation
  dispatchAlertNotifications({
    id: createdAlert.id,
    tenantId: createdAlert.tenantId,
    propertyId: createdAlert.propertyId,
    type: createdAlert.type,
    severity: createdAlert.severity,
    source: createdAlert.source,
    message: createdAlert.message,
    title: createdAlert.title,
  }).catch(() => {});
}

/**
 * Resolve an existing alert by marking it as resolved.
 */
async function resolveAlert(
  alertId: string,
  resolvedBy: string,
  resolveNote: string,
): Promise<void> {
  await db.wiFiAlert.update({
    where: { id: alertId },
    data: {
      status: 'resolved',
      resolvedAt: new Date(),
      resolvedBy,
      resolveNote,
    },
  });
}

// ────────────────────────────────────────────────────────────
// SNAT Pool Exhaustion Alerts (Phase 3)
// ────────────────────────────────────────────────────────────

const SNAT_WARNING_THRESHOLD = 80;  // percent
const SNAT_CRITICAL_THRESHOLD = 95; // percent
const SNAT_CAPACITY_PLAN_THRESHOLD = 70; // percent — sustained for 24h triggers capacity_plan
const SNAT_ALERT_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes between alerts per pool
const SNAT_CAPACITY_PLAN_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours between capacity_plan alerts per pool
const snatAlertLastSent: Map<string, number> = new Map();
const snatCapacityPlanLastSent: Map<string, number> = new Map();

/**
 * Check all SNAT pools for exhaustion and generate alerts.
 * Called from the scheduler alongside generateHealthAlerts().
 *
 * Alert types:
 *   - snat_pool_warning  (≥80% utilized, severity: warning)
 *   - snat_pool_critical (≥95% utilized or fully exhausted, severity: critical)
 *   - snat_capacity_plan (≥70% sustained for 24h, severity: warning — suggests capacity planning)
 *   - Auto-resolves when utilization drops below threshold.
 *   - Alert metadata includes exhaustion prediction when applicable.
 */
export async function generateSnatExhaustionAlerts(): Promise<{
  created: number;
  resolved: number;
  skipped: number;
}> {
  const result = { created: 0, resolved: 0, skipped: 0 };

  try {
    // Find all SNAT pools with their tenant/property and usage stats
    const pools = await db.$queryRaw<Array<{
      id: string;
      tenantId: string;
      propertyId: string;
      name: string;
      "snatRanges": any;
      totalIps: number;
      assignedIps: number;
    }>>(Prisma.sql`
      SELECT
        ip.id, ip."tenantId", ip."propertyId", ip.name, ip."snatRanges",
        (ip."snatRanges"::jsonb) as _ranges
      FROM "IpPool" ip
      WHERE ip."natMode" = 'private_snat'
        AND ip."snatRanges" IS NOT NULL
        AND ip.enabled = true
    `);

    if (pools.length === 0) return result;

    for (const pool of pools) {
      try {
        const ranges = (pool._ranges || pool.snatRanges) as Array<{ startIp: string; endIp: string }>;
        if (!Array.isArray(ranges) || ranges.length === 0) { result.skipped++; continue; }

        // Calculate total SNAT IPs
        let totalIps = 0;
        for (const r of ranges) {
          if (!r.startIp || !r.endIp) continue;
          const s = r.startIp.split('.').reduce((a, o) => (a << 8) + parseInt(o), 0) >>> 0;
          const e = r.endIp.split('.').reduce((a, o) => (a << 8) + parseInt(o), 0) >>> 0;
          totalIps += Math.min(e - s + 1, 65536);
        }
        if (totalIps === 0) { result.skipped++; continue; }

        // Get active assignment count
        const assigned = await db.snatAssignment.count({
          where: {
            poolId: pool.id,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
        });

        const utilization = Math.round((assigned / totalIps) * 100);
        const source = `snat:${pool.id}`;

        // ── Calculate health metrics for metadata ──
        // Hourly assignment rate
        const hourlyRateResult = await db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
          SELECT COUNT(*)::bigint as count
          FROM "SnatAssignment"
          WHERE "poolId" = ${pool.id}::uuid
            AND "assignedAt" > NOW() - INTERVAL '1 hour'
        `);
        const hourlyAssignmentRate = Number(hourlyRateResult[0]?.count ?? 0);

        // Exhaustion prediction
        let exhaustionPredictionHours: number | null = null;
        if (hourlyAssignmentRate > 0 && totalIps > 0 && assigned < totalIps) {
          const remaining = totalIps - assigned;
          exhaustionPredictionHours = Math.round((remaining / hourlyAssignmentRate) * 10) / 10;
        }

        // Peak 24h — check if pool has been consistently >70% for the last 24h
        // by seeing if there were assignments active throughout the period
        const sustainedHighResult = await db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
          SELECT COUNT(*)::bigint as count
          FROM "SnatAssignment"
          WHERE "poolId" = ${pool.id}::uuid
            AND "assignedAt" < NOW() - INTERVAL '24 hours'
            AND ("expiresAt" IS NULL OR "expiresAt" > NOW() - INTERVAL '24 hours')
        `);
        const sustainedHighCount = Number(sustainedHighResult[0]?.count ?? 0);
        const sustainedHighUtilization = totalIps > 0 ? Math.round((sustainedHighCount / totalIps) * 100) : 0;
        const isSustainedHigh = utilization >= SNAT_CAPACITY_PLAN_THRESHOLD && sustainedHighUtilization >= SNAT_CAPACITY_PLAN_THRESHOLD;

        // Determine alert type and severity
        let alertType: string | null = null;
        let severity: string | null = null;
        if (utilization >= SNAT_CRITICAL_THRESHOLD) {
          alertType = 'snat_pool_critical';
          severity = 'critical';
        } else if (utilization >= SNAT_WARNING_THRESHOLD) {
          alertType = 'snat_pool_warning';
          severity = 'warning';
        }

        // Check cooldown
        const now = Date.now();
        const lastSent = snatAlertLastSent.get(pool.id) || 0;
        if (alertType && (now - lastSent) < SNAT_ALERT_COOLDOWN_MS) {
          result.skipped++;
        } else if (alertType && severity) {
          // Check for existing active alert of same or higher severity
          const existing = await findActiveAlert(source, 'snat_pool_warning');
          const existingCritical = await findActiveAlert(source, 'snat_pool_critical');

          // Skip if a critical alert is already active
          if (existingCritical && alertType === 'snat_pool_warning') {
            result.skipped++;
          } else {
            // Upgrade warning → critical
            if (existing && !existingCritical && alertType === 'snat_pool_critical') {
              await resolveAlert(existing.id, 'system:auto', `Utilization crossed ${SNAT_CRITICAL_THRESHOLD}% — upgrading to critical`);
            }

            // Create alert if no active one of same type
            const activeSame = alertType === 'snat_pool_critical' ? existingCritical : existing;
            if (!activeSame) {
              const title = `SNAT Pool ${alertType === 'snat_pool_critical' ? 'Critical' : 'Warning'}: ${pool.name}`;
              const message = `SNAT pool "${pool.name}" is ${utilization}% utilized (${assigned}/${totalIps} IPs assigned). New users will fall back to masquerade.` +
                (exhaustionPredictionHours !== null ? ` Pool may exhaust in ~${exhaustionPredictionHours}h at current rate.` : '');
              await createAlert({
                tenantId: pool.tenantId,
                propertyId: pool.propertyId,
                type: alertType,
                severity,
                title,
                message,
                source,
                metadata: JSON.stringify({
                  poolId: pool.id,
                  poolName: pool.name,
                  utilization,
                  assigned,
                  total: totalIps,
                  hourlyAssignmentRate,
                  exhaustionPredictionHours,
                }),
              });
              snatAlertLastSent.set(pool.id, now);
              result.created++;
              SELog.info(`[WiFiAlert] SNAT ${severity} alert created: ${pool.name} at ${utilization}%`);
            } else {
              result.skipped++;
            }
          }
        } else {
          // Utilization below threshold — resolve any active SNAT alerts
          const activeWarning = await findActiveAlert(source, 'snat_pool_warning');
          const activeCritical = await findActiveAlert(source, 'snat_pool_critical');

          if (activeCritical) {
            await resolveAlert(activeCritical.id, 'system:auto', `Utilization dropped to ${utilization}% (below ${SNAT_CRITICAL_THRESHOLD}%)`);
            result.resolved++;
          }
          if (activeWarning) {
            await resolveAlert(activeWarning.id, 'system:auto', `Utilization dropped to ${utilization}% (below ${SNAT_WARNING_THRESHOLD}%)`);
            result.resolved++;
          }

          // Clear cooldown so next threshold crossing triggers immediately
          snatAlertLastSent.delete(pool.id);
        }

        // ── Capacity planning alert (≥70% sustained for 24h) ──
        if (isSustainedHigh && utilization < SNAT_WARNING_THRESHOLD) {
          // Only fire capacity_plan if not already in warning/critical
          const lastCapSent = snatCapacityPlanLastSent.get(pool.id) || 0;
          if ((now - lastCapSent) >= SNAT_CAPACITY_PLAN_COOLDOWN_MS) {
            const existingCapPlan = await findActiveAlert(source, 'snat_capacity_plan');
            if (!existingCapPlan) {
              const capTitle = `SNAT Capacity Planning Needed: ${pool.name}`;
              const capMessage = `SNAT pool "${pool.name}" has been consistently above ${SNAT_CAPACITY_PLAN_THRESHOLD}% utilization for 24 hours ` +
                `(currently ${utilization}%, 24h peak: ${sustainedHighUtilization}%). ` +
                `Consider adding more SNAT IP ranges to prevent future exhaustion.` +
                (exhaustionPredictionHours !== null ? ` At current rate, pool may exhaust in ~${exhaustionPredictionHours}h.` : '');
              await createAlert({
                tenantId: pool.tenantId,
                propertyId: pool.propertyId,
                type: 'snat_capacity_plan',
                severity: 'warning',
                title: capTitle,
                message: capMessage,
                source,
                metadata: JSON.stringify({
                  poolId: pool.id,
                  poolName: pool.name,
                  utilization,
                  assigned,
                  total: totalIps,
                  peakUtilization24h: sustainedHighUtilization,
                  hourlyAssignmentRate,
                  exhaustionPredictionHours,
                  alertCategory: 'capacity_planning',
                }),
              });
              snatCapacityPlanLastSent.set(pool.id, now);
              result.created++;
              SELog.info(`[WiFiAlert] SNAT capacity_plan alert created: ${pool.name} at ${utilization}% (sustained >${SNAT_CAPACITY_PLAN_THRESHOLD}% for 24h)`);
            } else {
              result.skipped++;
            }
          } else {
            result.skipped++;
          }
        } else if (!isSustainedHigh || utilization < SNAT_CAPACITY_PLAN_THRESHOLD) {
          // Resolve capacity_plan alert if utilization dropped
          const activeCapPlan = await findActiveAlert(source, 'snat_capacity_plan');
          if (activeCapPlan) {
            await resolveAlert(activeCapPlan.id, 'system:auto', `Utilization dropped to ${utilization}% or no longer sustained above ${SNAT_CAPACITY_PLAN_THRESHOLD}% for 24h`);
            result.resolved++;
            snatCapacityPlanLastSent.delete(pool.id);
          }
        }
      } catch (poolErr) {
        SELog.warn(`[WiFiAlert] SNAT check failed for pool ${pool.id}: ${poolErr instanceof Error ? poolErr.message : String(poolErr)}`);
        result.skipped++;
      }
    }
  } catch (err) {
    SELog.error(`[WiFiAlert] SNAT exhaustion alert generation failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return result;
}
