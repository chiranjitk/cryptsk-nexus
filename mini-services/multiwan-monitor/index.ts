// Cryptsk Multi-WAN Monitor Service — Port 3006
// Health check daemon with auto-failover/failback for WAN links

import { PrismaClient } from "@prisma/client";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// ─── Prisma Client ──────────────────────────────────────────

const db = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || "postgresql://cryptsk:Cryptsk2026@localhost:5432/ispplatform",
    },
  },
});

// ─── Types ──────────────────────────────────────────────────

interface HealthRecord {
  status: "UP" | "DOWN" | "UNKNOWN";
  consecutiveFails: number;
  consecutiveSuccess: number;
  lastCheck: Date | null;
  lastLatency: number;
  lastPacketLoss: number;
  history: HealthHistoryEntry[];
  linkId: string;
  linkName: string;
  gateway: string;
  interfaceName: string;
  isPrimary: boolean;
  dbStatus: string;
  failbackDelaySec: number;
  autoFailback: boolean;
}

interface HealthHistoryEntry {
  timestamp: string;
  alive: boolean;
  latency: number;
}

interface FailoverEvent {
  timestamp: string;
  fromLink: string;
  toLink: string;
  type: "failover" | "failback";
  gateway: string;
  interfaceName: string;
}

interface MonitorConfig {
  checkInterval: number;
  failThreshold: number;
  recoveryThreshold: number;
  autoFailover: boolean;
}

// ─── State ──────────────────────────────────────────────────

const healthMap = new Map<string, HealthRecord>();
const failoverEvents: FailoverEvent[] = [];
let monitorInterval: ReturnType<typeof setInterval> | null = null;
let monitorRunning = false;
let currentDefaultGateway = "";
let hasFailovered = false;
let failbackTimer: ReturnType<typeof setTimeout> | null = null;

const config: MonitorConfig = {
  checkInterval: parseInt(process.env.MULTIWAN_CHECK_INTERVAL || "15", 10),
  failThreshold: parseInt(process.env.MULTIWAN_FAIL_THRESHOLD || "3", 10),
  recoveryThreshold: parseInt(process.env.MULTIWAN_RECOVERY_THRESHOLD || "2", 10),
  autoFailover: process.env.MULTIWAN_AUTO_FAILOVER !== "false",
};

const startTime = Date.now();

// ─── Helpers ────────────────────────────────────────────────

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonErr(message: string, status = 400) {
  return json({ error: message }, status);
}

function log(tag: string, msg: string) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [multiwan-monitor:${tag}] ${msg}`);
}

// ─── Ping Implementation ────────────────────────────────────

/**
 * Ping a gateway using system ping command.
 * Falls back to TCP connect probe on port 53 if ICMP is blocked.
 */
async function pingGateway(
  gateway: string,
  timeoutMs = 10000
): Promise<{ alive: boolean; latencyMs: number; packetLoss: number }> {
  try {
    const result = await execFileAsync(
      "ping",
      ["-c", "1", "-W", "3", gateway],
      { timeout: timeoutMs }
    );

    const output = result.stdout + result.stderr;
    const rttMatch = output.match(
      /rtt\s+min\/avg\/max\/mdev\s*=\s*[\d.]+\/([\d.]+)\//
    );
    const lossMatch = output.match(/(\d+)% packet loss/);

    const latency = rttMatch ? parseFloat(rttMatch[1]) : -1;
    const packetLoss = lossMatch ? parseInt(lossMatch[1]) : 0;

    return {
      alive: result.exitCode === 0,
      latencyMs: latency,
      packetLoss,
    };
  } catch (err: any) {
    // If ICMP is not permitted, fall back to TCP connect probe on port 53
    if (err?.message?.includes("Operation not permitted") || err?.code === "EPERM") {
      log("ping", `ICMP blocked for ${gateway}, falling back to TCP probe on port 53`);
      return tcpProbe(gateway, 53, timeoutMs);
    }

    // On timeout or error, try TCP probe as fallback
    return tcpProbe(gateway, 53, timeoutMs);
  }
}

/**
 * TCP connect probe: try connecting to gateway on given port.
 * Used as fallback when ICMP ping is blocked (sandbox environments).
 */
async function tcpProbe(
  gateway: string,
  port = 53,
  timeoutMs = 5000
): Promise<{ alive: boolean; latencyMs: number; packetLoss: number }> {
  try {
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const socket = Bun.connect({
      hostname: gateway,
      port,
      socket: {
        data: () => {},
        open: () => {},
        close: () => {},
        error: () => {},
      },
      timeout: timeoutMs,
    });

    clearTimeout(timer);

    // Bun.connect returns immediately; we just check if it succeeded
    const latency = Date.now() - start;
    try {
      socket.end();
    } catch {
      // ignore close errors
    }

    return {
      alive: true,
      latencyMs: latency,
      packetLoss: 0,
    };
  } catch {
    return {
      alive: false,
      latencyMs: -1,
      packetLoss: 100,
    };
  }
}

// ─── Route Management ───────────────────────────────────────

/**
 * Switch the default route to a specific gateway/interface.
 */
async function switchDefaultRoute(
  gateway: string,
  interfaceName: string
): Promise<boolean> {
  try {
    await execFileAsync("ip", [
      "route",
      "replace",
      "default",
      "via",
      gateway,
      "dev",
      interfaceName,
    ], { timeout: 10000 });

    currentDefaultGateway = gateway;
    log("route", `Default route switched to ${gateway} via ${interfaceName}`);
    return true;
  } catch (err: any) {
    log("route", `Failed to switch route to ${gateway}: ${err?.message || err}`);
    return false;
  }
}

/**
 * Detect the current default gateway from the system routing table.
 */
async function detectCurrentGateway(): Promise<string> {
  try {
    const result = await execFileAsync("ip", ["route", "show", "default"], {
      timeout: 5000,
    });
    const match = (result.stdout || "").match(/default via ([\d.]+)/);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}

// ─── Database Helpers ───────────────────────────────────────

/**
 * Log a WAN event to the database.
 */
async function logWanEvent(
  action: string,
  wanName: string,
  details: Record<string, unknown>
) {
  try {
    await db.wanEvent.create({
      data: {
        action,
        wanName,
        details: JSON.stringify(details),
        userId: null,
      },
    });
  } catch (err: any) {
    log("db", `Failed to log WAN event: ${err?.message || err}`);
  }
}

// ─── Auto-Failover Logic ───────────────────────────────────

/**
 * Perform failover: switch to a backup WAN link when primary goes down.
 */
async function performFailover(downLink: HealthRecord) {
  if (!config.autoFailover) {
    log("failover", `Auto-failover is disabled, skipping failover for ${downLink.linkName}`);
    return;
  }

  // Find the first active non-primary link as backup
  const backupLinks: HealthRecord[] = [];
  for (const [, record] of healthMap) {
    if (
      record.linkId !== downLink.linkId &&
      record.status === "UP" &&
      !record.isPrimary
    ) {
      backupLinks.push(record);
    }
  }

  if (backupLinks.length === 0) {
    log("failover", `No backup WAN links available for failover`);
    await logWanEvent("FAILOVER", downLink.linkName, {
      type: "failover_failed",
      reason: "No backup links available",
      gateway: downLink.gateway,
    });
    return;
  }

  // Pick the backup link (first UP non-primary)
  const backup = backupLinks[0];
  log("failover", `Initiating failover from ${downLink.linkName} to ${backup.linkName}`);

  // Switch route
  const success = await switchDefaultRoute(backup.gateway, backup.interfaceName);
  if (!success) {
    await logWanEvent("FAILOVER", downLink.linkName, {
      type: "failover_failed",
      reason: "Route switch failed",
      targetLink: backup.linkName,
      gateway: backup.gateway,
    });
    return;
  }

  // Update primary link status to STANDBY in DB
  try {
    await db.wanLink.update({
      where: { id: downLink.linkId },
      data: { status: "STANDBY" },
    });
    downLink.dbStatus = "STANDBY";
  } catch (err: any) {
    log("failover", `Failed to update DB status for ${downLink.linkName}: ${err?.message || err}`);
  }

  // Record the event
  hasFailovered = true;
  const event: FailoverEvent = {
    timestamp: new Date().toISOString(),
    fromLink: downLink.linkName,
    toLink: backup.linkName,
    type: "failover",
    gateway: backup.gateway,
    interfaceName: backup.interfaceName,
  };
  failoverEvents.push(event);

  await logWanEvent("FAILOVER", downLink.linkName, {
    type: "failover",
    fromLink: downLink.linkName,
    toLink: backup.linkName,
    gateway: backup.gateway,
    interfaceName: backup.interfaceName,
  });

  log("failover", `Failover complete: ${downLink.linkName} → ${backup.linkName} (gateway: ${backup.gateway})`);
}

/**
 * Schedule failback: after failbackDelaySec, switch back to primary.
 */
function scheduleFailback(recoveredLink: HealthRecord) {
  if (!hasFailovered) return;
  if (!recoveredLink.autoFailback) {
    log("failback", `Auto-failback is disabled for ${recoveredLink.linkName}`);
    return;
  }

  const delayMs = (recoveredLink.failbackDelaySec || 60) * 1000;
  log("failback", `Scheduling failback to ${recoveredLink.linkName} in ${recoveredLink.failbackDelaySec || 60}s`);

  // Clear any existing failback timer
  if (failbackTimer) {
    clearTimeout(failbackTimer);
    failbackTimer = null;
  }

  failbackTimer = setTimeout(async () => {
    failbackTimer = null;
    await performFailback(recoveredLink);
    hasFailovered = false;
  }, delayMs);
}

/**
 * Perform failback: switch back to the primary (or recovered) link.
 */
async function performFailback(targetLink: HealthRecord) {
  log("failback", `Initiating failback to ${targetLink.linkName}`);

  // First verify the target is still UP
  const pingResult = await pingGateway(targetLink.gateway);
  if (!pingResult.alive) {
    log("failback", `Target link ${targetLink.linkName} is not responding, aborting failback`);
    return;
  }

  // Switch route
  const success = await switchDefaultRoute(targetLink.gateway, targetLink.interfaceName);
  if (!success) {
    await logWanEvent("FAILBACK", targetLink.linkName, {
      type: "failback_failed",
      reason: "Route switch failed",
      gateway: targetLink.gateway,
    });
    return;
  }

  // Update link status back to ACTIVE in DB
  try {
    await db.wanLink.update({
      where: { id: targetLink.linkId },
      data: { status: "ACTIVE" },
    });
    targetLink.dbStatus = "ACTIVE";
  } catch (err: any) {
    log("failback", `Failed to update DB status for ${targetLink.linkName}: ${err?.message || err}`);
  }

  // Record the event
  const event: FailoverEvent = {
    timestamp: new Date().toISOString(),
    fromLink: "failover-backup",
    toLink: targetLink.linkName,
    type: "failback",
    gateway: targetLink.gateway,
    interfaceName: targetLink.interfaceName,
  };
  failoverEvents.push(event);

  await logWanEvent("FAILBACK", targetLink.linkName, {
    type: "failback",
    toLink: targetLink.linkName,
    gateway: targetLink.gateway,
    interfaceName: targetLink.interfaceName,
  });

  log("failback", `Failback complete: restored ${targetLink.linkName} (gateway: ${targetLink.gateway})`);
}

// ─── Health Check Daemon ───────────────────────────────────

/**
 * Load active WAN links from the database into memory.
 */
async function loadWanLinks() {
  try {
    const links = await db.wanLink.findMany({
      where: {
        status: "ACTIVE",
        gateway: { not: "" },
      },
    });

    log("daemon", `Loaded ${links.length} active WAN links from database`);

    for (const link of links) {
      // Preserve existing health state if link already tracked
      if (healthMap.has(link.id)) {
        const existing = healthMap.get(link.id)!;
        existing.linkName = link.name;
        existing.gateway = link.gateway;
        existing.interfaceName = link.interfaceName;
        existing.isPrimary = link.isPrimary;
        existing.dbStatus = link.status;
        existing.failbackDelaySec = link.failbackDelaySec;
        existing.autoFailback = link.autoFailback;
      } else {
        healthMap.set(link.id, {
          linkId: link.id,
          linkName: link.name,
          gateway: link.gateway,
          interfaceName: link.interfaceName,
          isPrimary: link.isPrimary,
          dbStatus: link.status,
          failbackDelaySec: link.failbackDelaySec,
          autoFailback: link.autoFailback,
          status: "UNKNOWN",
          consecutiveFails: 0,
          consecutiveSuccess: 0,
          lastCheck: null,
          lastLatency: -1,
          lastPacketLoss: 100,
          history: [],
        });
      }
    }

    // Remove links that are no longer active
    const linkIds = new Set(links.map((l) => l.id));
    for (const [id] of healthMap) {
      if (!linkIds.has(id)) {
        healthMap.delete(id);
        log("daemon", `Removed stale link ${id} from monitoring`);
      }
    }
  } catch (err: any) {
    log("daemon", `Failed to load WAN links: ${err?.message || err}`);
  }
}

/**
 * Run a single health check cycle across all monitored links.
 */
async function healthCheckCycle() {
  if (!monitorRunning) return;

  log("daemon", `Starting health check cycle (${healthMap.size} links)`);

  // Reload links from DB to pick up any changes
  await loadWanLinks();

  for (const [linkId, record] of healthMap) {
    try {
      const result = await pingGateway(record.gateway);

      // Update history (keep last 100 entries)
      const historyEntry: HealthHistoryEntry = {
        timestamp: new Date().toISOString(),
        alive: result.alive,
        latency: result.latencyMs,
      };
      record.history.push(historyEntry);
      if (record.history.length > 100) {
        record.history = record.history.slice(-100);
      }

      // Update check metadata
      record.lastCheck = new Date();
      record.lastLatency = result.alive ? result.latencyMs : -1;
      record.lastPacketLoss = result.packetLoss;

      if (result.alive) {
        record.consecutiveFails = 0;
        record.consecutiveSuccess++;

        // Check if link was DOWN and now recovers
        if (record.status === "DOWN") {
          if (record.consecutiveSuccess >= config.recoveryThreshold) {
            log("daemon", `Link ${record.linkName} recovered after ${record.consecutiveSuccess} consecutive successes`);

            const prevStatus = record.status;
            record.status = "UP";

            // Log recovery event
            await logWanEvent("STATUS_CHANGE", record.linkName, {
              type: "link_up",
              previousStatus: prevStatus,
              currentStatus: "UP",
              latency: result.latencyMs,
              packetLoss: result.packetLoss,
              consecutiveSuccess: record.consecutiveSuccess,
            });

            // If this is the primary link, schedule failback
            if (record.isPrimary) {
              scheduleFailback(record);
            }
          } else {
            log("daemon", `Link ${record.linkName} showing recovery signs (${record.consecutiveSuccess}/${config.recoveryThreshold} successes)`);
          }
        } else {
          record.status = "UP";
        }
      } else {
        record.consecutiveSuccess = 0;
        record.consecutiveFails++;

        // Check if link should be marked DOWN
        if (record.consecutiveFails >= config.failThreshold) {
          if (record.status !== "DOWN") {
            log("daemon", `Link ${record.linkName} marked DOWN after ${record.consecutiveFails} consecutive failures`);

            const prevStatus = record.status;
            record.status = "DOWN";

            // Log failure event
            await logWanEvent("STATUS_CHANGE", record.linkName, {
              type: "link_down",
              previousStatus: prevStatus,
              currentStatus: "DOWN",
              packetLoss: result.packetLoss,
              consecutiveFails: record.consecutiveFails,
            });

            // If this is the primary link, trigger failover
            if (record.isPrimary) {
              await performFailover(record);
            }
          }
        } else {
          log("daemon", `Link ${record.linkName} experiencing issues (${record.consecutiveFails}/${config.failThreshold} failures)`);
        }
      }
    } catch (err: any) {
      log("daemon", `Error checking ${record.linkName}: ${err?.message || err}`);
      record.consecutiveSuccess = 0;
      record.consecutiveFails++;
      record.lastCheck = new Date();
      record.lastLatency = -1;
      record.lastPacketLoss = 100;

      record.history.push({
        timestamp: new Date().toISOString(),
        alive: false,
        latency: -1,
      });
      if (record.history.length > 100) {
        record.history = record.history.slice(-100);
      }

      if (record.consecutiveFails >= config.failThreshold && record.status !== "DOWN") {
        record.status = "DOWN";
        log("daemon", `Link ${record.linkName} marked DOWN after ${record.consecutiveFails} consecutive errors`);
        await logWanEvent("STATUS_CHANGE", record.linkName, {
          type: "link_down",
          previousStatus: record.status,
          currentStatus: "DOWN",
          reason: "check_error",
          consecutiveFails: record.consecutiveFails,
        });

        if (record.isPrimary) {
          await performFailover(record);
        }
      }
    }
  }

  log("daemon", `Health check cycle complete`);
}

/**
 * Start the monitoring daemon.
 */
function startMonitor() {
  if (monitorRunning) {
    log("daemon", "Monitor is already running");
    return;
  }

  monitorRunning = true;
  log("daemon", `Starting monitor (interval: ${config.checkInterval}s, failThreshold: ${config.failThreshold}, recoveryThreshold: ${config.recoveryThreshold}, autoFailover: ${config.autoFailover})`);

  // Initial load
  loadWanLinks().then(() => {
    // Detect current default gateway
    detectCurrentGateway().then((gw) => {
      currentDefaultGateway = gw;
      log("daemon", `Detected current default gateway: ${gw || "(none)"}`);
    });
  });

  // Start interval
  monitorInterval = setInterval(() => {
    healthCheckCycle().catch((err) => {
      log("daemon", `Health check cycle error: ${err}`);
    });
  }, config.checkInterval * 1000);

  // Run first check after 2 seconds
  setTimeout(() => {
    healthCheckCycle().catch((err) => {
      log("daemon", `Initial health check error: ${err}`);
    });
  }, 2000);
}

/**
 * Stop the monitoring daemon.
 */
function stopMonitor() {
  log("daemon", "Stopping monitor");
  monitorRunning = false;

  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }

  if (failbackTimer) {
    clearTimeout(failbackTimer);
    failbackTimer = null;
  }
}

/**
 * Restart the monitoring daemon.
 */
function restartMonitor() {
  log("daemon", "Restarting monitor");
  stopMonitor();
  setTimeout(() => startMonitor(), 1000);
}

// ─── HTTP Server ────────────────────────────────────────────

Bun.serve({
  port: 3006,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // CORS
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // ── GET /health ──
    if (path === "/health" && req.method === "GET") {
      return json({
        status: "ok",
        uptime: Math.floor((Date.now() - startTime) / 1000),
        service: "multiwan-monitor",
        version: "1.0.0",
      });
    }

    // ── GET /api/status ──
    if (path === "/api/status" && req.method === "GET") {
      const links: object[] = [];
      for (const [, record] of healthMap) {
        links.push({
          id: record.linkId,
          name: record.linkName,
          gateway: record.gateway,
          interfaceName: record.interfaceName,
          isPrimary: record.isPrimary,
          status: record.dbStatus,
          monitorStatus: record.status,
          consecutiveFails: record.consecutiveFails,
          consecutiveSuccess: record.consecutiveSuccess,
          lastCheck: record.lastCheck?.toISOString() || null,
          lastLatency: record.lastLatency,
          lastPacketLoss: record.lastPacketLoss,
          history: record.history,
        });
      }

      // Refresh current gateway
      const gw = await detectCurrentGateway();
      if (gw) currentDefaultGateway = gw;

      return json({
        running: monitorRunning,
        links,
        currentDefaultGateway,
        failoverEvents: failoverEvents.slice(-50), // Last 50 events
        checkInterval: config.checkInterval,
        uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
        config,
      });
    }

    // ── POST /api/config ──
    if (path === "/api/config" && req.method === "POST") {
      try {
        const body = await req.json();

        if (body.checkInterval !== undefined) {
          const val = parseInt(body.checkInterval, 10);
          if (val >= 5 && val <= 300) {
            config.checkInterval = val;
            log("config", `Check interval updated to ${val}s`);
          }
        }
        if (body.failThreshold !== undefined) {
          const val = parseInt(body.failThreshold, 10);
          if (val >= 1 && val <= 20) {
            config.failThreshold = val;
            log("config", `Fail threshold updated to ${val}`);
          }
        }
        if (body.recoveryThreshold !== undefined) {
          const val = parseInt(body.recoveryThreshold, 10);
          if (val >= 1 && val <= 20) {
            config.recoveryThreshold = val;
            log("config", `Recovery threshold updated to ${val}`);
          }
        }
        if (body.autoFailover !== undefined) {
          config.autoFailover = !!body.autoFailover;
          log("config", `Auto-failover updated to ${config.autoFailover}`);
        }

        // Restart monitor to apply interval change
        if (body.checkInterval !== undefined && monitorRunning) {
          restartMonitor();
        }

        await logWanEvent("CONFIG_CHANGE", "system", {
          config: { ...config },
          changedBy: "api",
        });

        return json({
          success: true,
          message: "Configuration updated",
          config,
        });
      } catch (err: any) {
        return jsonErr(`Invalid request: ${err?.message || err}`);
      }
    }

    // ── POST /api/control ──
    if (path === "/api/control" && req.method === "POST") {
      try {
        const body = await req.json();
        const action = body.action;

        switch (action) {
          case "start":
            startMonitor();
            return json({ success: true, message: "Monitor started" });

          case "stop":
            stopMonitor();
            return json({ success: true, message: "Monitor stopped" });

          case "restart":
            restartMonitor();
            return json({ success: true, message: "Monitor restarted" });

          case "force-check":
            if (!monitorRunning) {
              return jsonErr("Monitor is not running. Start it first.");
            }
            // Trigger immediate health check
            healthCheckCycle().catch((err) => {
              log("daemon", `Force check error: ${err}`);
            });
            return json({ success: true, message: "Force health check triggered" });

          default:
            return jsonErr(`Unknown action: ${action}. Valid actions: start, stop, restart, force-check`);
        }
      } catch (err: any) {
        return jsonErr(`Invalid request: ${err?.message || err}`);
      }
    }

    // ── 404 ──
    return json({ error: "Not Found", path }, 404);
  },
});

// ─── Startup ────────────────────────────────────────────────

log("startup", "Multi-WAN Monitor Service starting on port 3006");
log("startup", `Configuration: interval=${config.checkInterval}s, failThreshold=${config.failThreshold}, recoveryThreshold=${config.recoveryThreshold}, autoFailover=${config.autoFailover}`);

// Auto-start the monitoring daemon
startMonitor();

// ─── Graceful Shutdown ──────────────────────────────────────

async function shutdown() {
  log("shutdown", "Shutting down Multi-WAN Monitor Service...");
  stopMonitor();
  await db.$disconnect();
  log("shutdown", "Shutdown complete");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
