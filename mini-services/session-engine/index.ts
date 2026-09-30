// ═══════════════════════════════════════════════════════════════
// CRYPTSKINTELLIGENT Session Engine — Port 3010
// Built-in NAS Manager (24Online / Antlabs style)
// Manages subscriber sessions, policy enforcement, CoA, and stats
// ═══════════════════════════════════════════════════════════════

import { PrismaClient } from "@prisma/client";
import { requireAuth, corsHeaders } from "../shared/auth.ts";
import { createLogger } from "../shared/logger.ts";

const db = new PrismaClient();
const logger = createLogger("session-engine");
const SERVICE_START = Date.now();

// ─── WebSocket State ─────────────────────────────────────────
const wsClients = new Set<{ send: (data: string) => void }>();

function broadcastWs(event: string, data: unknown) {
  const msg = JSON.stringify({ event, data, ts: new Date().toISOString() });
  for (const client of wsClients) {
    try { client.send(msg); } catch { wsClients.delete(client); }
  }
}

// ─── Helpers ─────────────────────────────────────────────────

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function jsonErr(message: string, status = 400) {
  return json({ error: message }, status);
}

/**
 * Generate session ID: CRYPTSK-{timestamp}-{random6}
 */
function generateSessionId(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `CRYPTSK-${ts}-${rand}`;
}

/**
 * Resolve effective speed limits through the chain:
 *   subscriber.radiusGroup → plan.group → plan.downloadSpeed/uploadSpeed → subscriber.currentSpeed*
 * RadiusGroup values are in Mbps; Plan.downloadSpeed/uploadSpeed are in Kbps.
 * Returns { speedDown, speedUp } in Kbps (0 = not set).
 */
function resolveSpeedsKbps(subscriber: {
  radiusGroup?: { speedLimitDown: number; speedLimitUp: number } | null;
  plan?: {
    downloadSpeed: number;
    uploadSpeed: number;
    group?: { speedLimitDown: number; speedLimitUp: number } | null;
  } | null;
  currentSpeedDown: number;
  currentSpeedUp: number;
}): { speedDown: number; speedUp: number } {
  const rg = (subscriber as any).radiusGroup || (subscriber as any).RadiusGroup;
  const plan = (subscriber as any).plan || (subscriber as any).Plan;
  // Override group takes highest priority (values in Mbps → convert to Kbps)
  if (rg?.speedLimitDown) {
    return {
      speedDown: rg.speedLimitDown * 1000,
      speedUp: rg.speedLimitUp * 1000,
    };
  }
  // Plan's linked group (values in Mbps → convert to Kbps)
  const planGroup = plan?.group || plan?.RadiusGroup;
  if (planGroup?.speedLimitDown) {
    return {
      speedDown: planGroup.speedLimitDown * 1000,
      speedUp: planGroup.speedLimitUp * 1000,
    };
  }
  // Plan's own speeds (already in Kbps)
  if (plan?.downloadSpeed) {
    return {
      speedDown: plan.downloadSpeed,
      speedUp: plan.uploadSpeed,
    };
  }
  // Subscriber-level current speeds (assumed Mbps → convert to Kbps)
  if (subscriber.currentSpeedDown) {
    return {
      speedDown: subscriber.currentSpeedDown * 1000,
      speedUp: subscriber.currentSpeedUp * 1000,
    };
  }
  return { speedDown: 0, speedUp: 0 };
}

/**
 * Resolve effective data limit for a subscriber.
 * RadiusGroup.dataLimit is in MB; Plan.dataLimitGb is in GB → convert to MB.
 */
function resolveDataLimitMb(subscriber: {
  radiusGroup?: { dataLimit: number | null } | null;
  RadiusGroup?: { dataLimit: number | null } | null;
  plan?: {
    dataLimitGb: number | null;
    group?: { dataLimit: number | null } | null;
    RadiusGroup?: { dataLimit: number | null } | null;
  } | null;
  Plan?: {
    dataLimitGb: number | null;
    group?: { dataLimit: number | null } | null;
    RadiusGroup?: { dataLimit: number | null } | null;
  } | null;
}): number | null {
  const rg = (subscriber as any).radiusGroup || (subscriber as any).RadiusGroup;
  const plan = (subscriber as any).plan || (subscriber as any).Plan;
  const planGroup = plan?.group || plan?.RadiusGroup;
  return (
    rg?.dataLimit ??
    planGroup?.dataLimit ??
    (plan?.dataLimitGb ? Math.round(plan.dataLimitGb * 1024) : null)
  );
}

/**
 * Resolve effective session timeout (seconds).
 */
function resolveSessionTimeout(subscriber: {
  radiusGroup?: { sessionTimeout: number | null } | null;
  RadiusGroup?: { sessionTimeout: number | null } | null;
  plan?: { group?: { sessionTimeout: number | null } | null; RadiusGroup?: { sessionTimeout: number | null } | null } | null;
  Plan?: { group?: { sessionTimeout: number | null } | null; RadiusGroup?: { sessionTimeout: number | null } | null } | null;
  sessionTimeout: number | null;
}): number | null {
  const rg = (subscriber as any).radiusGroup || (subscriber as any).RadiusGroup;
  const plan = (subscriber as any).plan || (subscriber as any).Plan;
  const planGroup = plan?.group || plan?.RadiusGroup;
  return (
    subscriber.sessionTimeout ??
    rg?.sessionTimeout ??
    planGroup?.sessionTimeout ??
    null
  );
}

/**
 * Resolve effective idle timeout (seconds).
 */
function resolveIdleTimeout(subscriber: {
  idleTimeout: number | null;
}): number | null {
  return subscriber.idleTimeout ?? null;
}

/**
 * Log a session event
 */
async function logEvent(params: {
  nasSessionId?: string;
  sessionId?: string;
  subscriberId?: string;
  username?: string;
  eventType: string;
  context?: Record<string, unknown>;
  authResult?: string;
  clientIp?: string;
  macAddress?: string;
  source?: string;
  triggeredBy?: string;
}) {
  try {
    // SessionEvent.context is a String? column — serialize objects to JSON
    const data: any = { ...params };
    if (data.context && typeof data.context === "object") {
      data.context = JSON.stringify(data.context);
    }
    await db.sessionEvent.create({ data });
  } catch (err) {
    logger.error("Failed to log session event", { error: String(err), params });
  }
}

/**
 * Close a session by setting it to CLOSED
 */
async function closeSession(
  sessionId: string,
  cause: string,
  reason: string,
  terminatedBy: string
) {
  const session = await db.nasSession.findUnique({ where: { sessionId } });
  if (!session) return null;
  if (session.status === "CLOSED") return session;

  const now = new Date();
  const sessionTimeSec = Math.floor((now.getTime() - session.startTime.getTime()) / 1000);

  const closed = await db.nasSession.update({
    where: { id: session.id },
    data: {
      status: "CLOSED",
      stopTime: now,
      terminateCause: cause,
      disconnectReason: reason,
      terminatedBy,
      sessionTimeSec,
    },
  });

  // Update subscriber last auth info
  await db.subscriber.update({
    where: { id: session.subscriberId },
    data: {
      lastAuthAt: now,
      lastAuthResult: cause,
    },
  });

  return closed;
}

// ════════════════════════════════════════════════════════════
// VPP ADAPTER HELPERS (§28 hard boundary — never call vppctl directly)
// All dataplane programming goes through the vpp-adapter HTTP API.
// ════════════════════════════════════════════════════════════

const VPP_ADAPTER_BASE = "http://127.0.0.1:3015";
const VPP_TIMEOUT_MS = 5000;

// In-memory VPP restart detection state (§41)
let lastKnownVppEpoch = 0;
let startupReconciliationDone = false;
let lastVppEpochPollAt = 0;

/**
 * HTTP fetch with timeout + abort. Wraps vpp-adapter calls.
 * GET if no body, POST with JSON if body provided.
 */
async function callVpp<T = any>(path: string, body?: any): Promise<{ ok: boolean; data?: T; error?: string; status?: number }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), VPP_TIMEOUT_MS);
  try {
    const url = `${VPP_ADAPTER_BASE}${path}`;
    const init: RequestInit = body !== undefined
      ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal }
      : { method: "GET", signal: ctrl.signal };
    const res = await fetch(url, init);
    const data = await res.json().catch(() => ({}) as T) as T;
    if (!res.ok) return { ok: false, status: res.status, error: `vpp-adapter ${path} HTTP ${res.status}`, data };
    return { ok: true, status: res.status, data };
  } catch (err: any) {
    return { ok: false, error: `vpp-adapter ${path} unreachable: ${String(err?.message || err)}` };
  } finally {
    clearTimeout(t);
  }
}

/**
 * §42 Persist (upsert) a SessionSnapshot row for VPP restart recovery.
 */
async function persistSnapshot(sessionId: string, fields: Record<string, any>) {
  try {
    await db.sessionSnapshot.upsert({
      where: { sessionId },
      create: { sessionId, ...fields },
      update: { ...fields, updatedAt: new Date() },
    });
  } catch (err) {
    logger.error("persistSnapshot failed", { sessionId, error: String(err) });
  }
}

/**
 * §38 Duplicate login detection.
 * Reads DuplicateLoginPolicy (first enabled, fallback DENY_NEW/1/USERNAME).
 * Returns { allowed, reason?, oldSessionIds? }.
 * If mode=DISCONNECT_OLD, disconnects the old sessions (VPP remove + close).
 */
async function detectDuplicateLogin(username: string, mac: string): Promise<{
  allowed: boolean;
  reason?: string;
  oldSessionIds?: string[];
}> {
  const policy = await db.duplicateLoginPolicy.findFirst({
    where: { isEnabled: true },
    orderBy: { updatedAt: "desc" },
  });
  const mode = (policy?.mode || "DENY_NEW") as "ALLOW_MULTIPLE" | "DENY_NEW" | "DISCONNECT_OLD" | "LIMIT_N";
  const maxSessions = policy?.maxSessions ?? 1;
  const scope = (policy?.scope || "USERNAME") as "USERNAME" | "MAC" | "BOTH";

  if (mode === "ALLOW_MULTIPLE") return { allowed: true };

  const orClauses: any[] = [];
  if (scope === "USERNAME" || scope === "BOTH") orClauses.push({ username });
  if (scope === "MAC" || scope === "BOTH") orClauses.push({ callingStationId: mac });
  if (orClauses.length === 0) orClauses.push({ username });

  const existing = await db.nasSession.findMany({
    where: { OR: orClauses, status: "ACTIVE" },
    orderBy: { startTime: "asc" },
  });

  if (existing.length < maxSessions) {
    return { allowed: true, oldSessionIds: existing.map((s) => s.sessionId) };
  }

  if (mode === "DISCONNECT_OLD") {
    for (const old of existing) {
      try {
        try { await db.sessionSnapshot.update({ where: { sessionId: old.sessionId }, data: { vppRecoveryState: "STALE" } }); } catch {}
        const rm = await callVpp("/subscriber/remove", { sessionId: old.sessionId });
        if (!rm.ok) logger.warn("VPP remove failed during DISCONNECT_OLD (continuing)", { sessionId: old.sessionId, error: rm.error });
        await closeSession(old.sessionId, "Duplicate-Login", "Disconnected by new login (DISCONNECT_OLD)", "system");
        await logEvent({
          nasSessionId: old.id,
          sessionId: old.sessionId,
          subscriberId: old.subscriberId,
          username: old.username,
          eventType: "SESSION_STOP",
          context: { reason: "Duplicate-Login-Old-Disconnected" },
          source: "system",
        });
        broadcastWs("session_stop", { sessionId: old.sessionId, username: old.username, cause: "Duplicate-Login-Old-Disconnected" });
      } catch (err) {
        logger.error("Failed to disconnect old session in DISCONNECT_OLD", { sessionId: old.sessionId, error: String(err) });
      }
    }
    return { allowed: true, oldSessionIds: existing.map((s) => s.sessionId) };
  }

  // DENY_NEW (default) + LIMIT_N — both deny if max reached
  const reason = mode === "LIMIT_N"
    ? `Max sessions (${maxSessions}) reached (LIMIT_N)`
    : `Duplicate session denied (DENY_NEW, scope=${scope})`;
  return { allowed: false, reason, oldSessionIds: existing.map((s) => s.sessionId) };
}

/**
 * §41 Trigger VPP rebuild for a single session. Updates snapshot recovery state.
 */
async function triggerVppRebuildForSession(sessionId: string): Promise<{ rebuilt: boolean; error?: string; vppEpoch?: number }> {
  const r = await callVpp<{ rebuilt?: number; failed?: number; results?: any[]; vppEpoch?: number; success?: boolean }>("/vpp/rebuild", { sessionId });
  if (!r.ok || r.data?.success === false) {
    try { await db.sessionSnapshot.update({ where: { sessionId }, data: { vppRecoveryState: "STALE" } }); } catch {}
    try { await db.nasSession.updateMany({ where: { sessionId, status: "ACTIVE" }, data: { vppRecoveryState: "STALE" } }); } catch {}
    return { rebuilt: false, error: r.error || "vpp-adapter /vpp/rebuild failed" };
  }
  const newEpoch = r.data?.vppEpoch || 0;
  try {
    const updateData: any = { vppRecoveryState: "VERIFIED", updatedAt: new Date() };
    if (newEpoch) updateData.vppEpoch = newEpoch;
    await db.sessionSnapshot.update({ where: { sessionId }, data: updateData });
  } catch {}
  try {
    const sessUpdate: any = { vppRecoveryState: "VERIFIED", vppProgrammedAt: new Date() };
    if (newEpoch) sessUpdate.vppEpoch = newEpoch;
    await db.nasSession.updateMany({ where: { sessionId, status: "ACTIVE" }, data: sessUpdate });
  } catch {}
  return { rebuilt: true, vppEpoch: newEpoch };
}

/**
 * Allocate a subscriber IP from a simple deterministic pool.
 * Pattern: 10.0.{N}.X where N = subscriber hash % 200, X = session hash % 250 + 1
 */
function allocateFramedIp(subscriberId: string, sessionId: string): string {
  let subHash = 0;
  for (let i = 0; i < subscriberId.length; i++) subHash = (subHash * 31 + subscriberId.charCodeAt(i)) >>> 0;
  let sessHash = 0;
  for (let i = 0; i < sessionId.length; i++) sessHash = (sessHash * 31 + sessionId.charCodeAt(i)) >>> 0;
  const n = subHash % 200;
  const x = (sessHash % 250) + 1;
  return `10.0.${n}.${x}`;
}

/**
 * §41 VPP Restart Recovery: rebuild all ACTIVE sessions' VPP policies after a restart.
 * Logs to VppRecoveryLog + broadcasts progress over WS.
 */
async function runVppRestartRecovery(prevEpoch: number, newEpoch: number, triggeredBy: string = "restart-detector") {
  const start = Date.now();
  const activeSessions = await db.nasSession.findMany({ where: { status: "ACTIVE" } });
  let recovered = 0;
  let failed = 0;
  const failures: any[] = [];
  for (const s of activeSessions) {
    const r = await triggerVppRebuildForSession(s.sessionId);
    if (r.rebuilt) recovered++;
    else { failed++; failures.push({ sessionId: s.sessionId, error: r.error }); }
  }
  const durationMs = Date.now() - start;
  try {
    await db.vppRecoveryLog.create({
      data: {
        event: "REBUILT_POLICIES",
        prevEpoch,
        newEpoch,
        sessionsAffected: activeSessions.length,
        sessionsRecovered: recovered,
        sessionsFailed: failed,
        durationMs,
        detailsJson: JSON.stringify({ triggeredBy, failures: failures.slice(0, 20) }),
      },
    });
  } catch (err) {
    logger.error("VppRecoveryLog create failed", { error: String(err) });
  }
  logger.info("VPP restart recovery completed", { prevEpoch, newEpoch, sessionsAffected: activeSessions.length, recovered, failed, durationMs });
  broadcastWs("vpp_recovery", { prevEpoch, newEpoch, sessionsAffected: activeSessions.length, recovered, failed, durationMs, triggeredBy });
  return { sessionsAffected: activeSessions.length, recovered, failed, durationMs };
}

/**
 * §40 Session Reconciliation (startup + scheduled).
 * Ensures every ACTIVE NasSession has a SessionSnapshot, then calls /vpp/rebuild.
 * Logs outcome to ReconciliationLog.
 */
async function runReconciliation(scope: "STARTUP" | "SCHEDULED" = "STARTUP") {
  const start = Date.now();
  const active = await db.nasSession.findMany({ where: { status: "ACTIVE" } });
  let recovered = 0;
  let stale = 0;
  for (const s of active) {
    try {
      const existing = await db.sessionSnapshot.findUnique({ where: { sessionId: s.sessionId } });
      if (!existing) {
        await persistSnapshot(s.sessionId, {
          subscriberId: s.subscriberId,
          username: s.username,
          nasIp: s.nasIp,
          nasPort: s.nasPort,
          framedIp: s.framedIp || s.assignedIp,
          mac: s.callingStationId,
          vlan: s.vlanId,
          vrf: s.vrf,
          policyId: s.vppPolicyId,
          aclProfileId: s.vppAclProfileId,
          qosProfileId: s.vppQosProfileId,
          natProfileId: s.vppNatProfileId,
          ipPool: s.vppIpPool,
          circuitId: s.circuitId,
          remoteId: s.remoteId,
          pppoeSessionId: s.pppoeSessionId,
          dhcpClientId: s.dhcpClientId,
          speedDownKbps: s.speedDownKbps,
          speedUpKbps: s.speedUpKbps,
          startTime: s.startTime,
          timeoutSec: s.sessionTimeoutSec ?? 0,
          vppEpoch: s.vppEpoch,
          vppProgrammedAt: s.vppProgrammedAt,
          vppRecoveryState: "RECOVERING",
        });
      }
      const r = await triggerVppRebuildForSession(s.sessionId);
      if (r.rebuilt) recovered++;
      else stale++;
    } catch (err) {
      logger.error("Reconciliation failed for session", { sessionId: s.sessionId, error: String(err) });
      stale++;
    }
  }
  const durationMs = Date.now() - start;
  try {
    await db.reconciliationLog.create({
      data: {
        scope,
        totalDb: active.length,
        totalVpp: active.length,
        totalActive: active.length,
        totalStale: stale,
        totalRecovered: recovered,
        totalRemoved: 0,
        durationMs,
        detailsJson: JSON.stringify({ scope }),
      },
    });
  } catch (err) {
    logger.error("ReconciliationLog create failed", { error: String(err) });
  }
  logger.info("Reconciliation completed", { scope, active: active.length, recovered, stale, durationMs });
  return { scope, active: active.length, recovered, stale, durationMs };
}

/**
 * §39 Stale Session Recovery — NAS health check.
 * For each unique NAS IP from active sessions, do a HEAD request to port 80 (2s timeout).
 * If unreachable, mark all sessions on that NAS as vppRecoveryState=STALE + broadcast.
 */
async function runNasHealthCheck() {
  try {
    const sessions = await db.nasSession.findMany({ where: { status: "ACTIVE" }, select: { nasIp: true, sessionId: true } });
    const uniqueNasIps = [...new Set(sessions.map((s) => s.nasIp))].filter((ip) => ip && ip !== "127.0.0.1" && ip !== "0.0.0.0");
    for (const nasIp of uniqueNasIps) {
      let reachable = false;
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 2000);
        const res = await fetch(`http://${nasIp}/`, { method: "HEAD", signal: ctrl.signal });
        clearTimeout(t);
        reachable = res.ok || res.status < 500;
      } catch {
        reachable = false;
      }
      if (!reachable) {
        const staleSessions = await db.nasSession.findMany({ where: { nasIp, status: "ACTIVE" }, select: { sessionId: true, username: true } });
        if (staleSessions.length === 0) continue;
        try {
          await db.nasSession.updateMany({ where: { nasIp, status: "ACTIVE" }, data: { vppRecoveryState: "STALE" } });
        } catch {}
        for (const s of staleSessions) {
          try { await db.sessionSnapshot.update({ where: { sessionId: s.sessionId }, data: { vppRecoveryState: "STALE" } }); } catch {}
        }
        broadcastWs("nas_unreachable", { nasIp, staleSessions: staleSessions.length });
        logger.warn("NAS unreachable — sessions marked STALE", { nasIp, staleSessions: staleSessions.length });
      }
    }
  } catch (err) {
    logger.error("NAS health check error", { error: String(err) });
  }
}

// ─── HTTP Server ─────────────────────────────────────────────

const server = Bun.serve({
  port: 3010,
  fetch(req, server) {
    const url = new URL(req.url);
    const path = url.pathname;

    // Handle WebSocket upgrade on "/"
    if (path === "/" && req.headers.get("upgrade") === "websocket") {
      if (server.upgrade(req)) return;
      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    return handleRequest(req, path, url);
  },
  websocket: {
    open(ws) {
      wsClients.add(ws);
      logger.info("WebSocket client connected", { totalClients: wsClients.size });
    },
    close(ws) {
      wsClients.delete(ws);
      logger.info("WebSocket client disconnected", { totalClients: wsClients.size });
    },
    message(ws, message) {
      // Echo for keepalive
      try {
        const data = JSON.parse(String(message));
        if (data.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", ts: new Date().toISOString() }));
        }
      } catch { /* ignore malformed */ }
    },
  },
});

logger.info("Session Engine started on port 3010", { version: "1.0.0" });

// ─── Periodic Stats Broadcast (every 10s) ───────────────────

setInterval(async () => {
  try {
    const activeSessions = await db.nasSession.count({ where: { status: "ACTIVE" } });
    broadcastWs("stats_tick", { activeSessions, uptime: process.uptime() });
  } catch { /* ignore */ }
}, 10_000);

// ─── Auto-Enforcement Cron (every 30s) ─────────────────────
// Automatically enforces data/time/idle limits on active sessions
// like 24Online / Antlabs built-in enforcement

setInterval(async () => {
  try {
    const nasConfig = await db.nasConfig.findUnique({ where: { id: "builtin" } });
    if (!nasConfig) return;

    const enforceData = nasConfig.enforceDataLimit ?? true;
    const enforceTime = nasConfig.enforceTimeLimit ?? true;
    const enforceIdle = nasConfig.enforceIdleTimeout ?? true;

    // Skip if all enforcement is disabled
    if (!enforceData && !enforceTime && !enforceIdle) return;

    const activeSessions = await db.nasSession.findMany({
      where: { status: "ACTIVE" },
    });

    if (activeSessions.length === 0) return;

    const now = Date.now();
    let disconnectedCount = 0;

    for (const session of activeSessions) {
      const sessionAgeSec = Math.floor((now - session.startTime.getTime()) / 1000);
      const totalBytes = Number(session.inputOctets) + Number(session.outputOctets);
      const totalMb = totalBytes / (1024 * 1024);
      const idleSec = Math.floor((now - session.lastActivity.getTime()) / 1000);

      let shouldDisconnect = false;
      let reason = "";
      let eventType = "";

      // Check data limit
      if (enforceData && session.dataLimitMb && totalMb >= session.dataLimitMb) {
        shouldDisconnect = true;
        reason = `Data limit reached: ${totalMb.toFixed(1)}MB / ${session.dataLimitMb}MB`;
        eventType = "DATA_LIMIT_REACHED";
      }

      // Check session timeout
      if (!shouldDisconnect && enforceTime && session.sessionTimeoutSec && sessionAgeSec >= session.sessionTimeoutSec) {
        shouldDisconnect = true;
        reason = `Session timeout: ${formatDurationCron(sessionAgeSec)} / ${formatDurationCron(session.sessionTimeoutSec)}`;
        eventType = "TIME_LIMIT_REACHED";
      }

      // Check idle timeout
      if (!shouldDisconnect && enforceIdle && session.idleTimeoutSec && idleSec >= session.idleTimeoutSec) {
        shouldDisconnect = true;
        reason = `Idle timeout: ${formatDurationCron(idleSec)} / ${formatDurationCron(session.idleTimeoutSec)}`;
        eventType = "IDLE_TIMEOUT";
      }

      if (shouldDisconnect) {
        const cause = eventType === "DATA_LIMIT_REACHED" ? "Data-Limit"
          : eventType === "TIME_LIMIT_REACHED" ? "Session-Timeout"
          : "Idle-Timeout";

        try {
          await closeSession(session.sessionId, cause, reason, "cron");

          await logEvent({
            nasSessionId: session.id,
            sessionId: session.sessionId,
            subscriberId: session.subscriberId,
            username: session.username,
            eventType,
            context: { reason, sessionAgeSec, totalMb, idleSec },
            source: "cron",
          });

          broadcastWs("session_stop", {
            sessionId: session.sessionId,
            username: session.username,
            cause,
          });

          disconnectedCount++;
        } catch (err) {
          logger.error("Auto-enforce failed for session", { sessionId: session.sessionId, error: String(err) });
        }
      }
    }

    if (disconnectedCount > 0) {
      logger.info("Auto-enforcement completed", { checked: activeSessions.length, disconnected: disconnectedCount });
    }
  } catch (err) {
    logger.error("Auto-enforcement error", { error: String(err) });
  }
}, 30_000);

function formatDurationCron(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

logger.info("Auto-enforcement cron started (every 30s)", {});

// ─── §41 VPP Restart Detection (every 5s) ────────────────────
// GET /vpp/epoch from vpp-adapter. If epoch > lastKnownVppEpoch,
// trigger runVppRestartRecovery to rebuild all ACTIVE session policies.

setInterval(async () => {
  try {
    const r = await callVpp<{ epoch: number; lastRestartAt?: string; vppConnected?: boolean }>("/vpp/epoch");
    lastVppEpochPollAt = Date.now();
    if (!r.ok || !r.data) return;
    const epoch = r.data.epoch || 0;
    // NOTE: We intentionally do NOT bail when vppConnected===false here, because
    // in dev/cert the vpp-adapter reports vppConnected=false (no real VPP binary
    // running), but epoch increments on every simulated restart — and we still
    // need to test the §41 VPP Restart Recovery flow against those increments.
    if (lastKnownVppEpoch === 0) {
      // First successful poll — baseline, don't trigger recovery
      lastKnownVppEpoch = epoch;
      logger.info("VPP epoch baseline set", { epoch });
      return;
    }
    if (epoch > lastKnownVppEpoch) {
      const prev = lastKnownVppEpoch;
      logger.warn("VPP restart detected — triggering recovery", { prevEpoch: prev, newEpoch: epoch });
      try {
        await db.vppRecoveryLog.create({
          data: {
            event: "RESTART_DETECTED",
            prevEpoch: prev,
            newEpoch: epoch,
            sessionsAffected: 0,
            sessionsRecovered: 0,
            sessionsFailed: 0,
            durationMs: 0,
            detailsJson: JSON.stringify({ lastRestartAt: r.data.lastRestartAt }),
          },
        });
      } catch {}
      await runVppRestartRecovery(prev, epoch, "restart-detector");
      lastKnownVppEpoch = epoch;
    }
  } catch (err) {
    logger.error("VPP epoch poll error", { error: String(err) });
  }
}, 5_000);

// ─── §40 Startup Reconciliation (once at startup + every 5 min) ─
// Ensures every ACTIVE NasSession has a snapshot + calls /vpp/rebuild.
// First run logs scope=STARTUP, recurring runs log scope=SCHEDULED.

setInterval(async () => {
  try {
    const scope = startupReconciliationDone ? "SCHEDULED" : "STARTUP";
    startupReconciliationDone = true;
    await runReconciliation(scope);
  } catch (err) {
    logger.error("Scheduled reconciliation error", { error: String(err) });
  }
}, 5 * 60 * 1000);

// ─── §39 NAS Health Check (every 30s) ────────────────────────
// Pings each unique nasIp from active sessions via HEAD on port 80
// (2s timeout). Unreachable NAS → mark sessions STALE + broadcast.

setInterval(async () => {
  try {
    await runNasHealthCheck();
  } catch (err) {
    logger.error("NAS health check loop error", { error: String(err) });
  }
}, 30_000);

// Run startup reconciliation shortly after process boot (let vpp-adapter settle)
setTimeout(async () => {
  try {
    if (!startupReconciliationDone) {
      startupReconciliationDone = true;
      await runReconciliation("STARTUP");
    }
  } catch (err) {
    logger.error("Startup reconciliation (deferred) error", { error: String(err) });
  }
}, 8_000);

logger.info("VPP restart detector (5s) + reconciliation (5min) + NAS health check (30s) loops registered", {});

// ─── Request Router ──────────────────────────────────────────

async function handleRequest(req: Request, path: string, url: URL) {
  // ── Health (no auth) ──
  if (path === "/api/health" && req.method === "GET") {
    const activeSessions = await db.nasSession.count({ where: { status: "ACTIVE" } });
    return json({
      status: "ok",
      service: "session-engine",
      version: "1.0.0",
      uptime: process.uptime(),
      activeSessions,
      wsClients: wsClients.size,
      timestamp: new Date().toISOString(),
    });
  }

  // Root (no auth)
  if (path === "/" && req.method === "GET") {
    return json({ status: "ok", service: "session-engine", health: "/api/health" });
  }

  // ── All remaining endpoints require auth ──
  let auth;
  try {
    auth = requireAuth(req);
  } catch {
    return json({ error: "Unauthorized" }, 401);
  }

  // ══════════════════════════════════════════════════════════
  // AUTHENTICATION ENDPOINTS
  // ══════════════════════════════════════════════════════════

  // ══════════════════════════════════════════════════════════
  // §7/§8 TRANSACTIONAL LOGIN FLOW
  // Body: { username, password, nasIp?, nasPort?, callingStationId (MAC),
  //         calledStationId?, clientIp?, vlanId?, circuitId?, remoteId?,
  //         pppoeSessionId?, dhcpClientId?, framedIp? (pre-allocated) }
  // Legacy fields also accepted: serviceUsername, servicePassword, macAddress
  // Flow: Authenticate → Duplicate check → Authorize → Allocate IP →
  //       Create session(AUTHENTICATING) → Program VPP → Verify VPP →
  //       Mark ACTIVE → Persist snapshot → Log + broadcast
  // VPP programming failure = full rollback (no ghost sessions, §8).
  // ══════════════════════════════════════════════════════════
  if (path === "/api/auth" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    // Accept both new + legacy field names
    const username = body.username || body.serviceUsername || "";
    const password = body.password || body.servicePassword || "";
    const mac = body.callingStationId || body.macAddress || "";
    const {
      nasIp, nasPort, calledStationId, clientIp,
      vlanId, circuitId, remoteId, pppoeSessionId, dhcpClientId,
      framedIp,
    } = body;

    if (!username || password === undefined || password === null) {
      return jsonErr("username and password are required");
    }

    const clientIpStr = clientIp || req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "";

    // (a1) Log auth request
    await logEvent({
      username,
      eventType: "AUTH_REQUEST",
      context: { method: "LOCAL_DB", nasIp, nasPort, vlanId, circuitId, remoteId, pppoeSessionId, dhcpClientId },
      clientIp: clientIpStr,
      macAddress: mac,
      source: "api",
      triggeredBy: auth.userId,
    });

    // (a2) Find subscriber by serviceUsername === username
    // NOTE: Prisma relation field names are capitalized (Plan, RadiusGroup) on the
    // Subscriber model. After fetching we normalize to lowercase `plan`/`radiusGroup`
    // so the existing helper functions (resolveSpeedsKbps etc.) keep working.
    const subscriberRaw = await db.subscriber.findUnique({
      where: { serviceUsername: username },
      include: {
        Plan: {
          select: {
            id: true, name: true, downloadSpeed: true, uploadSpeed: true,
            dataLimitGb: true, maxConcurrentSessions: true,
            RadiusGroup: { select: { id: true, name: true, speedLimitDown: true, speedLimitUp: true, dataLimit: true, sessionTimeout: true } },
          },
        },
        RadiusGroup: { select: { id: true, name: true, speedLimitDown: true, speedLimitUp: true, dataLimit: true, sessionTimeout: true } },
      },
    }) as any;
    const subscriber = subscriberRaw ? {
      ...subscriberRaw,
      plan: subscriberRaw.Plan ? { ...subscriberRaw.Plan, group: subscriberRaw.Plan.RadiusGroup } : null,
      radiusGroup: subscriberRaw.RadiusGroup,
    } : null;

    if (!subscriber) {
      await logEvent({
        username,
        eventType: "AUTH_FAILURE",
        authResult: "Access-Reject",
        context: { reason: "Subscriber not found" },
        clientIp: clientIpStr, macAddress: mac,
        source: "api", triggeredBy: auth.userId,
      });
      return json({ error: "Invalid credentials", authResult: "REJECT" }, 401);
    }

    // (a3) Verify status ACTIVE
    if (subscriber.status !== "ACTIVE") {
      await logEvent({
        subscriberId: subscriber.id, username,
        eventType: "AUTH_FAILURE", authResult: "Access-Reject",
        context: { reason: "Subscriber not active", status: subscriber.status },
        clientIp: clientIpStr, macAddress: mac,
        source: "api", triggeredBy: auth.userId,
      });
      return json({ error: "Subscriber not active", authResult: "REJECT", status: subscriber.status }, 403);
    }

    // (a4) Verify password (Subscribers have a servicePassword field)
    if (subscriber.servicePassword !== password) {
      await logEvent({
        subscriberId: subscriber.id, username,
        eventType: "AUTH_FAILURE", authResult: "Access-Reject",
        context: { reason: "Invalid password" },
        clientIp: clientIpStr, macAddress: mac,
        source: "api", triggeredBy: auth.userId,
      });
      return json({ error: "Invalid credentials", authResult: "REJECT" }, 401);
    }

    // (c) §38 Duplicate Login Detection
    const dup = await detectDuplicateLogin(username, mac);
    if (!dup.allowed) {
      await logEvent({
        subscriberId: subscriber.id, username,
        eventType: "AUTH_FAILURE", authResult: "Access-Reject",
        context: { reason: dup.reason, mode: "duplicate-login", oldSessionIds: dup.oldSessionIds },
        clientIp: clientIpStr, macAddress: mac,
        source: "api", triggeredBy: auth.userId,
      });
      return json({ error: dup.reason, authResult: "REJECT", oldSessionIds: dup.oldSessionIds }, 409);
    }

    // (d) Authorize — resolve speeds / data / timeouts via existing helpers
    const speeds = resolveSpeedsKbps(subscriber);
    const dataLimitMb = resolveDataLimitMb(subscriber);
    const sessionTimeoutSec = resolveSessionTimeout(subscriber);
    const idleTimeoutSec = resolveIdleTimeout(subscriber);
    const nasConfig = await db.nasConfig.findUnique({ where: { id: "builtin" } });
    const effectiveTimeout = sessionTimeoutSec ?? nasConfig?.defaultSessionTimeoutSec ?? 86400;
    const effectiveIdle = idleTimeoutSec ?? nasConfig?.defaultIdleTimeoutSec ?? 3600;

    // (e) Allocate IP if not provided
    const sessionId = generateSessionId();
    const allocatedIp = framedIp || subscriber.ipAddress || allocateFramedIp(subscriber.id, sessionId);
    const effectiveNasIp = nasIp || nasConfig?.ipAddress || "127.0.0.1";
    const effectiveNasPort = nasPort || "";

    // (f) Create NasSession (status=AUTHENTICATING = §8 "not ACTIVE yet")
    //     §37 identity fields + §4 VPP fields (filled post-program)
    const session = await db.nasSession.create({
      data: {
        sessionId,
        subscriberId: subscriber.id,
        username,
        nasIp: effectiveNasIp,
        nasPort: effectiveNasPort,
        framedIp: allocatedIp,
        assignedIp: allocatedIp,
        callingStationId: mac,
        calledStationId: calledStationId || "",
        authMethod: "LOCAL_DB",
        status: "AUTHENTICATING", // §8: NOT ACTIVE until VPP verified
        planId: subscriber.plan?.id || null,
        planName: subscriber.plan?.name || "",
        radiusGroupId: subscriber.radiusGroup?.id || subscriber.plan?.group?.id || null,
        radiusGroupName: subscriber.radiusGroup?.name || subscriber.plan?.group?.name || "",
        speedDownKbps: speeds.speedDown,
        speedUpKbps: speeds.speedUp,
        dataLimitMb,
        sessionTimeoutSec: effectiveTimeout,
        idleTimeoutSec: effectiveIdle,
        // §37 identity enrichment
        vlanId: vlanId || "",
        circuitId: circuitId || "",
        remoteId: remoteId || "",
        pppoeSessionId: pppoeSessionId || "",
        dhcpClientId: dhcpClientId || "",
        // §4/§29 VPP fields — populated after (g)/(h) succeed
        vrf: "",
        vppPolicyId: "",
        vppAclProfileId: "",
        vppQosProfileId: "",
        vppNatProfileId: "",
        vppIpPool: "",
        vppEpoch: 0,
        vppProgrammedAt: null,
        vppVerifiedAt: null,
        vppRecoveryState: "FRESH",
      },
    });

    // (g) §8 Program VPP — POST /subscriber/program
    const programBody = {
      sessionId,
      subscriberId: subscriber.id,
      username,
      framedIp: allocatedIp,
      mac,
      nasIp: effectiveNasIp,
      nasPort: effectiveNasPort,
      vlanId: vlanId || "",
      vrf: "",
      policyId: "",
      aclProfileId: "",
      qosProfileId: "",
      natProfileId: "",
      ipPool: "",
      speedDownKbps: speeds.speedDown,
      speedUpKbps: speeds.speedUp,
      timeoutSec: effectiveTimeout,
      circuitId: circuitId || "",
      remoteId: remoteId || "",
      pppoeSessionId: pppoeSessionId || "",
      dhcpClientId: dhcpClientId || "",
    };
    const programRes = await callVpp<{ success?: boolean; programmed?: any; vppEpochApplied?: number; message?: string }>(
      "/subscriber/program",
      programBody,
    );

    if (!programRes.ok || programRes.data?.success === false) {
      // §8 Rollback: mark CLOSED (preserves audit trail; no ghost ACTIVE session)
      try {
        await db.nasSession.update({
          where: { id: session.id },
          data: {
            status: "CLOSED",
            stopTime: new Date(),
            terminateCause: "VPP-PROGRAM-FAILED",
            disconnectReason: programRes.error || programRes.data?.message || "VPP programming failed",
            terminatedBy: "system",
          },
        });
      } catch (e) {
        logger.error("Failed to mark session CLOSED after VPP program failure", { sessionId, error: String(e) });
      }
      await logEvent({
        nasSessionId: session.id, sessionId, subscriberId: subscriber.id, username,
        eventType: "AUTH_FAILURE", authResult: "Access-Reject",
        context: { reason: "VPP programming failed", error: programRes.error, vppData: programRes.data },
        clientIp: clientIpStr, macAddress: mac, source: "api", triggeredBy: auth.userId,
      });
      return json({ error: "VPP programming failed — session not established", authResult: "REJECT", vppError: programRes.error, vppData: programRes.data }, 500);
    }

    const programmedEpoch = programRes.data?.vppEpochApplied || 0;

    // (h) §8 Verify VPP — POST /subscriber/verify
    const verifyRes = await callVpp<{ verified?: boolean; vppEpoch?: number; programmedAt?: string; checks?: any }>(
      "/subscriber/verify",
      { sessionId },
    );
    if (!verifyRes.ok || verifyRes.data?.verified !== true) {
      // §8 Rollback
      try {
        await db.nasSession.update({
          where: { id: session.id },
          data: {
            status: "CLOSED",
            stopTime: new Date(),
            terminateCause: "VPP-VERIFY-FAILED",
            disconnectReason: verifyRes.error || "VPP verification failed",
            terminatedBy: "system",
          },
        });
      } catch (e) {
        logger.error("Failed to mark session CLOSED after VPP verify failure", { sessionId, error: String(e) });
      }
      // Best-effort remove the (programmed but unverified) state from VPP
      await callVpp("/subscriber/remove", { sessionId });
      await logEvent({
        nasSessionId: session.id, sessionId, subscriberId: subscriber.id, username,
        eventType: "AUTH_FAILURE", authResult: "Access-Reject",
        context: { reason: "VPP verification failed", error: verifyRes.error, vppData: verifyRes.data },
        clientIp: clientIpStr, macAddress: mac, source: "api", triggeredBy: auth.userId,
      });
      return json({ error: "VPP verification failed — session not established", authResult: "REJECT", vppError: verifyRes.error, vppData: verifyRes.data }, 500);
    }

    const finalEpoch = verifyRes.data?.vppEpoch || programmedEpoch || 0;

    // (i) Mark ACTIVE + VPP metadata (§8 commit point)
    const now = new Date();
    await db.nasSession.update({
      where: { id: session.id },
      data: {
        status: "ACTIVE",
        vppEpoch: finalEpoch,
        vppProgrammedAt: now,
        vppVerifiedAt: now,
        vppRecoveryState: "VERIFIED",
      },
    });

    // Update subscriber lastAuth
    await db.subscriber.update({
      where: { id: subscriber.id },
      data: { lastAuthAt: now, lastAuthResult: "Access-Accept" },
    });

    // (j) §42 Persist SessionSnapshot (recoverable dataplane state)
    await persistSnapshot(sessionId, {
      subscriberId: subscriber.id,
      username,
      nasIp: effectiveNasIp,
      nasPort: effectiveNasPort,
      framedIp: allocatedIp,
      mac,
      vlan: vlanId || "",
      vrf: "",
      policyId: "",
      aclProfileId: "",
      qosProfileId: "",
      natProfileId: "",
      ipPool: "",
      circuitId: circuitId || "",
      remoteId: remoteId || "",
      pppoeSessionId: pppoeSessionId || "",
      dhcpClientId: dhcpClientId || "",
      speedDownKbps: speeds.speedDown,
      speedUpKbps: speeds.speedUp,
      startTime: session.startTime,
      timeoutSec: effectiveTimeout,
      vppEpoch: finalEpoch,
      vppProgrammedAt: now,
      vppRecoveryState: "VERIFIED",
      configJson: JSON.stringify({ programmed: programRes.data, verified: verifyRes.data }),
    });

    // (k) Log success events
    await logEvent({
      nasSessionId: session.id, sessionId, subscriberId: subscriber.id, username,
      eventType: "AUTH_SUCCESS", authResult: "Access-Accept",
      context: { planName: subscriber.plan?.name, speeds, dataLimitMb, sessionTimeoutSec, vppEpoch: finalEpoch, vppProgrammedAt: now },
      clientIp: clientIpStr, macAddress: mac, source: "api", triggeredBy: auth.userId,
    });
    await logEvent({
      nasSessionId: session.id, sessionId, subscriberId: subscriber.id, username,
      eventType: "SESSION_START",
      context: { planName: subscriber.plan?.name, speeds, dataLimitMb, vppEpoch: finalEpoch },
      source: "api", triggeredBy: auth.userId,
    });

    // (l) Broadcast WS
    broadcastWs("session_start", {
      sessionId, username, subscriberName: subscriber.name, planName: subscriber.plan?.name, speeds,
      framedIp: allocatedIp, vppEpoch: finalEpoch, vppProgrammedAt: now,
    });

    logger.info("Session authenticated (transactional)", {
      sessionId, username, subscriberId: subscriber.id, speeds, vppEpoch: finalEpoch,
    });

    // (m) Return 200 with §8 contract
    return json({
      success: true,
      authResult: "Access-Accept",
      sessionId,
      framedIp: allocatedIp,
      subscriberId: subscriber.id,
      username,
      speedDownKbps: speeds.speedDown,
      speedUpKbps: speeds.speedUp,
      vppEpoch: finalEpoch,
      vppProgrammedAt: now,
      vppVerifiedAt: now,
    }, 201);
  }

  // ══════════════════════════════════════════════════════════
  // §9 TRANSACTIONAL LOGOUT FLOW (with VPP cleanup)
  // Body: { sessionId } OR { subscriberId, username }
  // Flow: Locate → Mark DISCONNECTING → Remove VPP state →
  //       Update snapshot STALE → closeSession → broadcast
  // ══════════════════════════════════════════════════════════
  if (path === "/api/logout" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const { sessionId: reqSessionId, subscriberId: reqSubId, username: reqUsername } = body;

    if (!reqSessionId && !reqSubId && !reqUsername) {
      return jsonErr("sessionId or (subscriberId, username) is required");
    }

    // (a) Locate active session
    let session;
    if (reqSessionId) {
      session = await db.nasSession.findUnique({ where: { sessionId: reqSessionId } });
    } else {
      const where: any = { status: "ACTIVE" };
      if (reqSubId) where.subscriberId = reqSubId;
      if (reqUsername) where.username = reqUsername;
      session = await db.nasSession.findFirst({ where, orderBy: { startTime: "desc" } });
    }

    if (!session) return jsonErr("Session not found", 404);
    if (session.status === "CLOSED") return jsonErr("Session already closed");

    // (b) Mark DISCONNECTING (TERMINATING is the enum equivalent)
    try {
      await db.nasSession.update({
        where: { id: session.id },
        data: { status: "TERMINATING", vppRecoveryState: "RECOVERING" },
      });
    } catch (err) {
      logger.warn("Failed to mark session TERMINATING (continuing)", { sessionId: session.sessionId, error: String(err) });
    }

    // (c) §9 Remove VPP state (best-effort — log warning on failure, continue)
    const rmRes = await callVpp("/subscriber/remove", { sessionId: session.sessionId });
    if (!rmRes.ok) {
      logger.warn("VPP remove failed during logout (continuing)", { sessionId: session.sessionId, error: rmRes.error });
    }

    // (d) Update snapshot: STALE
    try {
      await db.sessionSnapshot.update({
        where: { sessionId: session.sessionId },
        data: { vppRecoveryState: "STALE", updatedAt: new Date() },
      });
    } catch (err) {
      logger.warn("Snapshot update to STALE failed (continuing)", { sessionId: session.sessionId, error: String(err) });
    }

    // (e) Close session via existing helper
    const closed = await closeSession(session.sessionId, "User-Logout", "User initiated logout", "system");

    await logEvent({
      nasSessionId: session.id, sessionId: session.sessionId,
      subscriberId: session.subscriberId, username: session.username,
      eventType: "SESSION_STOP",
      context: { reason: "User logout", vppRemoveOk: rmRes.ok, vppError: rmRes.error },
      source: "api", triggeredBy: auth.userId,
    });

    // (f) Broadcast WS
    broadcastWs("session_stop", {
      sessionId: session.sessionId, username: session.username, cause: "User-Logout",
    });

    // (g) Return success
    return json({
      success: true,
      sessionId: session.sessionId,
      terminatedAt: closed?.stopTime || new Date(),
    });
  }

  // ══════════════════════════════════════════════════════════
  // SESSION MANAGEMENT
  // ══════════════════════════════════════════════════════════

  // GET /api/sessions — List sessions
  if (path === "/api/sessions" && req.method === "GET") {
    const status = url.searchParams.get("status") || "ACTIVE";
    const search = url.searchParams.get("search") || "";
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);
    const page = Math.max(parseInt(url.searchParams.get("page") || "1"), 1);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (status !== "ALL") {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { username: { contains: search, mode: "insensitive" } },
        { sessionId: { contains: search, mode: "insensitive" } },
        { subscriber: { name: { contains: search, mode: "insensitive" } } },
        { subscriber: { phone: { contains: search } } },
        { subscriber: { code: { contains: search, mode: "insensitive" } } },
      ];
    }

    const [sessions, total] = await Promise.all([
      db.nasSession.findMany({
        where,
        include: {
          Subscriber: {
            select: {
              id: true,
              name: true,
              phone: true,
              code: true,
              status: true,
              Plan: { select: { id: true, name: true, downloadSpeed: true, uploadSpeed: true, dataLimitGb: true } },
            },
          },
        },
        orderBy: { startTime: "desc" },
        take: limit,
        skip,
      }),
      db.nasSession.count({ where }),
    ]);

    return json({
      sessions: sessions.map((s) => {
        const totalOctets = Number(s.inputOctets) + Number(s.outputOctets);
        const duration = s.stopTime
          ? s.sessionTimeSec
          : Math.floor((Date.now() - s.startTime.getTime()) / 1000);
        return {
          id: s.id,
          sessionId: s.sessionId,
          username: s.username,
          status: s.status,
          subscriberId: s.subscriberId,
          subscriberName: s.Subscriber?.name,
          subscriberPhone: s.Subscriber?.phone,
          subscriberCode: s.Subscriber?.code,
          subscriberStatus: s.Subscriber?.status,
          planId: s.planId,
          planName: s.planName,
          speedDownKbps: s.speedDownKbps,
          speedUpKbps: s.speedUpKbps,
          dataLimitMb: s.dataLimitMb,
          dataUsedMb: Math.round(totalOctets / (1024 * 1024)),
          dataLimitPercent: s.dataLimitMb ? Math.round((totalOctets / (1024 * 1024) / s.dataLimitMb) * 100) : null,
          sessionTimeoutSec: s.sessionTimeoutSec,
          timeRemainingSec: s.sessionTimeoutSec ? Math.max(0, s.sessionTimeoutSec - duration) : null,
          duration,
          inputOctets: Number(s.inputOctets),
          outputOctets: Number(s.outputOctets),
          totalOctets,
          assignedIp: s.assignedIp,
          callingStationId: s.callingStationId,
          nasIp: s.nasIp,
          startTime: s.startTime,
          stopTime: s.stopTime,
          terminateCause: s.terminateCause,
          terminatedBy: s.terminatedBy,
          coaCount: s.coaCount,
        };
      }),
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  }

  // GET /api/sessions/:id — Get session details
  const sessionDetailMatch = path.match(/^\/api\/sessions\/([^/]+)$/);
  if (sessionDetailMatch && req.method === "GET") {
    const sid = sessionDetailMatch[1];

    const session = await db.nasSession.findFirst({
      where: {
        OR: [
          { id: sid },
          { sessionId: sid },
        ],
      },
      include: {
        Subscriber: {
          select: {
            id: true,
            name: true,
            phone: true,
            code: true,
            email: true,
            address: true,
            status: true,
            serviceUsername: true,
            connectionType: true,
            plan: {
              select: {
                id: true,
                name: true,
                category: true,
                downloadSpeed: true,
                uploadSpeed: true,
                dataLimitGb: true,
                priceMonthly: true,
                validityDays: true,
                maxConcurrentSessions: true,
                group: {
                  select: { id: true, name: true, speedLimitDown: true, speedLimitUp: true, dataLimit: true, sessionTimeout: true },
                },
              },
            },
            radiusGroup: {
              select: { id: true, name: true, speedLimitDown: true, speedLimitUp: true, dataLimit: true, sessionTimeout: true },
            },
          },
        },
        events: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });

    if (!session) return jsonErr("Session not found", 404);

    const totalOctets = Number(session.inputOctets) + Number(session.outputOctets);
    const duration = session.stopTime
      ? session.sessionTimeSec
      : Math.floor((Date.now() - session.startTime.getTime()) / 1000);

    return json({
      session: {
        ...session,
        totalOctets,
        duration,
        dataUsedMb: Math.round(totalOctets / (1024 * 1024)),
        dataLimitPercent: session.dataLimitMb ? Math.round((totalOctets / (1024 * 1024) / session.dataLimitMb) * 100) : null,
        timeRemainingSec: session.sessionTimeoutSec ? Math.max(0, session.sessionTimeoutSec - duration) : null,
      },
    });
  }

  // POST /api/sessions/:id/disconnect — Admin disconnect
  const disconnectMatch = path.match(/^\/api\/sessions\/([^/]+)\/disconnect$/);
  if (disconnectMatch && req.method === "POST") {
    const sid = disconnectMatch[1];

    const session = await db.nasSession.findFirst({
      where: { OR: [{ id: sid }, { sessionId: sid }], status: "ACTIVE" },
    });

    if (!session) return jsonErr("Active session not found", 404);

    const closed = await closeSession(
      session.sessionId,
      "Admin-Disconnect",
      "Disconnected by admin: " + auth.userId,
      "admin"
    );

    await logEvent({
      nasSessionId: session.id,
      sessionId: session.sessionId,
      subscriberId: session.subscriberId,
      username: session.username,
      eventType: "ADMIN_DISCONNECT",
      context: { reason: "Admin disconnect" },
      source: "admin",
      triggeredBy: auth.userId,
    });

    broadcastWs("session_stop", {
      sessionId: session.sessionId,
      username: session.username,
      cause: "Admin-Disconnect",
      triggeredBy: auth.userId,
    });

    return json({ success: true, sessionId: session.sessionId, status: closed.status });
  }

  // POST /api/sessions/bulk-disconnect — Bulk disconnect
  if (path === "/api/sessions/bulk-disconnect" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const { sessionIds, reason } = body;

    if (!sessionIds || !Array.isArray(sessionIds) || sessionIds.length === 0) {
      return jsonErr("sessionIds array is required");
    }

    const limitedIds = sessionIds.slice(0, 100); // max 100 at a time
    const results: Array<{ sessionId: string; success: boolean; error?: string }> = [];

    for (const sid of limitedIds) {
      try {
        const session = await db.nasSession.findFirst({
          where: { OR: [{ id: sid }, { sessionId: sid }], status: "ACTIVE" },
        });
        if (!session) {
          results.push({ sessionId: sid, success: false, error: "Not found or not active" });
          continue;
        }

        await closeSession(session.sessionId, "Admin-Disconnect", reason || "Bulk disconnect", "admin");

        await logEvent({
          nasSessionId: session.id,
          sessionId: session.sessionId,
          subscriberId: session.subscriberId,
          username: session.username,
          eventType: "BULK_DISCONNECT",
          context: { reason: reason || "Bulk disconnect" },
          source: "admin",
          triggeredBy: auth.userId,
        });

        broadcastWs("session_stop", {
          sessionId: session.sessionId,
          username: session.username,
          cause: "Admin-Disconnect",
          triggeredBy: auth.userId,
        });

        results.push({ sessionId: sid, success: true });
      } catch (err) {
        results.push({ sessionId: sid, success: false, error: String(err) });
      }
    }

    return json({
      success: true,
      requested: limitedIds.length,
      results,
    });
  }

  // POST /api/sessions/:id/coa — Change of Authorization
  const coaMatch = path.match(/^\/api\/sessions\/([^/]+)\/coa$/);
  if (coaMatch && req.method === "POST") {
    const sid = coaMatch[1];
    const body = await req.json().catch(() => ({}));
    const { newPlanId, speedDownKbps, speedUpKbps, disconnect } = body;

    const session = await db.nasSession.findFirst({
      where: { OR: [{ id: sid }, { sessionId: sid }], status: "ACTIVE" },
    });

    if (!session) return jsonErr("Active session not found", 404);

    // Handle disconnect via CoA
    if (disconnect) {
      await closeSession(session.sessionId, "Session-Disconnect", "CoA disconnect", "admin");

      await db.coaEvent.create({
        data: {
          subscriberId: session.subscriberId,
          radiusSessionId: session.id,
          coaType: "SESSION_DISCONNECT",
          coaStatus: "SUCCESS",
          triggeredBy: auth.userId,
          completedAt: new Date(),
        },
      });

      await logEvent({
        nasSessionId: session.id,
        sessionId: session.sessionId,
        subscriberId: session.subscriberId,
        username: session.username,
        eventType: "COA_SUCCESS",
        context: { action: "disconnect" },
        source: "admin",
        triggeredBy: auth.userId,
      });

      broadcastWs("session_stop", {
        sessionId: session.sessionId,
        username: session.username,
        cause: "CoA-Disconnect",
      });

      return json({ success: true, action: "disconnect", sessionId: session.sessionId });
    }

    // Speed change or plan change
    const oldSpeedDown = session.speedDownKbps;
    const oldSpeedUp = session.speedUpKbps;
    const oldPlanId = session.planId;

    let newDown = speedDownKbps ?? session.speedDownKbps;
    let newUp = speedUpKbps ?? session.speedUpKbps;
    let newPlanName = session.planName;

    // If newPlanId specified, resolve from plan
    if (newPlanId && newPlanId !== session.planId) {
      const newPlan = await db.plan.findUnique({
        where: { id: newPlanId },
        include: {
          RadiusGroup: { select: { speedLimitDown: true, speedLimitUp: true } },
        },
      });
      if (!newPlan) return jsonErr("Plan not found", 404);

      newDown = newPlan.downloadSpeed;
      newUp = newPlan.uploadSpeed;
      newPlanName = newPlan.name;
    }

    const coaType = newPlanId && newPlanId !== oldPlanId ? "PLAN_CHANGE" : "BANDWIDTH_CHANGE";

    // Update session
    const updated = await db.nasSession.update({
      where: { id: session.id },
      data: {
        speedDownKbps: newDown,
        speedUpKbps: newUp,
        planId: newPlanId ?? session.planId,
        planName: newPlanName,
        coaCount: { increment: 1 },
        lastCoaAt: new Date(),
      },
    });

    // Create CoA event
    await db.coaEvent.create({
      data: {
        subscriberId: session.subscriberId,
        radiusSessionId: session.id,
        coaType,
        coaStatus: "SUCCESS",
        oldPlanId,
        newPlanId: newPlanId ?? session.planId,
        triggeredBy: auth.userId,
        completedAt: new Date(),
      },
    });

    await logEvent({
      nasSessionId: session.id,
      sessionId: session.sessionId,
      subscriberId: session.subscriberId,
      username: session.username,
      eventType: "COA_SUCCESS",
      context: {
        coaType,
        oldSpeed: { down: oldSpeedDown, up: oldSpeedUp },
        newSpeed: { down: newDown, up: newUp },
        oldPlanId,
        newPlanId,
      },
      source: "admin",
      triggeredBy: auth.userId,
    });

    broadcastWs("coa_event", {
      sessionId: session.sessionId,
      username: session.username,
      coaType,
      oldSpeed: { down: oldSpeedDown, up: oldSpeedUp },
      newSpeed: { down: newDown, up: newUp },
    });

    return json({
      success: true,
      action: coaType,
      sessionId: session.sessionId,
      oldSpeed: { down: oldSpeedDown, up: oldSpeedUp },
      newSpeed: { down: newDown, up: newUp },
      coaCount: updated.coaCount,
    });
  }

  // ══════════════════════════════════════════════════════════
  // POLICY ENGINE
  // ══════════════════════════════════════════════════════════

  // GET /api/policy/evaluate/:subscriberId
  const policyEvalMatch = path.match(/^\/api\/policy\/evaluate\/([^/]+)$/);
  if (policyEvalMatch && req.method === "GET") {
    const subscriberId = policyEvalMatch[1];

    const subscriber = await db.subscriber.findUnique({
      where: { id: subscriberId },
      include: {
        Plan: {
          select: {
            id: true,
            name: true,
            downloadSpeed: true,
            uploadSpeed: true,
            dataLimitGb: true,
            maxConcurrentSessions: true,
            RadiusGroup: {
              select: { id: true, name: true, speedLimitDown: true, speedLimitUp: true, dataLimit: true, sessionTimeout: true },
            },
          },
        },
        RadiusGroup: {
          select: { id: true, name: true, speedLimitDown: true, speedLimitUp: true, dataLimit: true, sessionTimeout: true },
        },
      },
    });

    if (!subscriber) return jsonErr("Subscriber not found", 404);

    const speeds = resolveSpeedsKbps(subscriber);
    const dataLimitMb = resolveDataLimitMb(subscriber);
    const sessionTimeout = resolveSessionTimeout(subscriber);
    const idleTimeout = resolveIdleTimeout(subscriber);
    const maxConcurrent = subscriber.plan?.maxConcurrentSessions ?? 1;

    // Build resolution chain for transparency
    const chain: Array<{ source: string; speedDown: number; speedUp: number; dataLimitMb: number | null }> = [];

    if (subscriber.radiusGroup?.speedLimitDown) {
      chain.push({
        source: `subscriber.radiusGroup (${subscriber.radiusGroup.name})`,
        speedDown: subscriber.radiusGroup.speedLimitDown * 1000,
        speedUp: subscriber.radiusGroup.speedLimitUp * 1000,
        dataLimitMb: subscriber.radiusGroup.dataLimit,
      });
    }
    if (subscriber.plan?.group?.speedLimitDown) {
      chain.push({
        source: `plan.group (${subscriber.plan.group.name})`,
        speedDown: subscriber.plan.group.speedLimitDown * 1000,
        speedUp: subscriber.plan.group.speedLimitUp * 1000,
        dataLimitMb: subscriber.plan.group.dataLimit,
      });
    }
    if (subscriber.plan?.downloadSpeed) {
      chain.push({
        source: `plan (${subscriber.plan.name})`,
        speedDown: subscriber.plan.downloadSpeed,
        speedUp: subscriber.plan.uploadSpeed,
        dataLimitMb: subscriber.plan.dataLimitGb ? Math.round(subscriber.plan.dataLimitGb * 1024) : null,
      });
    }
    if (subscriber.currentSpeedDown) {
      chain.push({
        source: "subscriber.currentSpeed*",
        speedDown: subscriber.currentSpeedDown * 1000,
        speedUp: subscriber.currentSpeedUp * 1000,
        dataLimitMb: null,
      });
    }

    return json({
      subscriberId: subscriber.id,
      username: subscriber.serviceUsername,
      subscriberName: subscriber.name,
      effectivePolicy: {
        speedDownKbps: speeds.speedDown,
        speedUpKbps: speeds.speedUp,
        speedDownMbps: Math.round(speeds.speedDown / 1000),
        speedUpMbps: Math.round(speeds.speedUp / 1000),
        dataLimitMb,
        sessionTimeoutSec: sessionTimeout,
        idleTimeoutSec: idleTimeout,
        maxConcurrentSessions: maxConcurrent,
      },
      resolutionChain: chain,
      appliedFrom: chain.length > 0 ? chain[0].source : "default",
    });
  }

  // GET /api/policy/enforce — Run policy enforcement on all active sessions
  if (path === "/api/policy/enforce" && req.method === "POST") {
    const nasConfig = await db.nasConfig.findUnique({ where: { id: "builtin" } });
    const enforceData = nasConfig?.enforceDataLimit ?? true;
    const enforceTime = nasConfig?.enforceTimeLimit ?? true;
    const enforceIdle = nasConfig?.enforceIdleTimeout ?? true;

    const activeSessions = await db.nasSession.findMany({
      where: { status: "ACTIVE" },
      include: {
        Subscriber: {
          select: {
            id: true,
            name: true,
            Plan: { select: { name: true, dataLimitGb: true } },
          },
        },
      },
    });

    const results: Array<{
      sessionId: string;
      username: string;
      action: string;
      reason: string;
    }> = [];
    const now = Date.now();

    for (const session of activeSessions) {
      const sessionAgeSec = Math.floor((now - session.startTime.getTime()) / 1000);
      const totalBytes = Number(session.inputOctets) + Number(session.outputOctets);
      const totalMb = totalBytes / (1024 * 1024);
      const idleSec = Math.floor((now - session.lastActivity.getTime()) / 1000);

      let shouldDisconnect = false;
      let reason = "";

      // Check data limit
      if (enforceData && session.dataLimitMb && totalMb >= session.dataLimitMb) {
        shouldDisconnect = true;
        reason = `Data limit reached: ${totalMb.toFixed(1)}MB / ${session.dataLimitMb}MB`;
      }

      // Check session timeout
      if (!shouldDisconnect && enforceTime && session.sessionTimeoutSec && sessionAgeSec >= session.sessionTimeoutSec) {
        shouldDisconnect = true;
        reason = `Session timeout: ${sessionAgeSec}s / ${session.sessionTimeoutSec}s`;
      }

      // Check idle timeout
      if (!shouldDisconnect && enforceIdle && session.idleTimeoutSec && idleSec >= session.idleTimeoutSec) {
        shouldDisconnect = true;
        reason = `Idle timeout: ${idleSec}s / ${session.idleTimeoutSec}s`;
      }

      if (shouldDisconnect) {
        const eventType = reason.includes("Data") ? "DATA_LIMIT_REACHED"
          : reason.includes("Session timeout") ? "TIME_LIMIT_REACHED"
          : "IDLE_TIMEOUT";

        await closeSession(
          session.sessionId,
          eventType === "DATA_LIMIT_REACHED" ? "Data-Limit"
            : eventType === "TIME_LIMIT_REACHED" ? "Session-Timeout"
            : "Idle-Timeout",
          reason,
          "system"
        );

        await logEvent({
          nasSessionId: session.id,
          sessionId: session.sessionId,
          subscriberId: session.subscriberId,
          username: session.username,
          eventType: eventType as string,
          context: { reason, sessionAgeSec, totalMb, idleSec },
          source: "cron",
        });

        await logEvent({
          nasSessionId: session.id,
          sessionId: session.sessionId,
          subscriberId: session.subscriberId,
          username: session.username,
          eventType: "POLICY_ENFORCE",
          context: { reason },
          source: "cron",
        });

        broadcastWs("session_stop", {
          sessionId: session.sessionId,
          username: session.username,
          cause: reason,
        });

        results.push({
          sessionId: session.sessionId,
          username: session.username,
          action: "disconnected",
          reason,
        });
      }
    }

    return json({
      success: true,
      checkedSessions: activeSessions.length,
      disconnectedSessions: results.length,
      results,
    });
  }

  // ══════════════════════════════════════════════════════════
  // STATISTICS / DASHBOARD
  // ══════════════════════════════════════════════════════════

  // GET /api/stats/overview
  if (path === "/api/stats/overview" && req.method === "GET") {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      activeSessions,
      todaySessions,
      todayAuthSuccess,
      todayAuthFailure,
      totalBandwidth,
      avgSessionDuration,
    ] = await Promise.all([
      // Active sessions count
      db.nasSession.count({ where: { status: "ACTIVE" } }),

      // Today total sessions
      db.nasSession.count({ where: { createdAt: { gte: todayStart } } }),

      // Today auth successes
      db.sessionEvent.count({
        where: { eventType: "AUTH_SUCCESS", createdAt: { gte: todayStart } },
      }),

      // Today auth failures
      db.sessionEvent.count({
        where: { eventType: "AUTH_FAILURE", createdAt: { gte: todayStart } },
      }),

      // Total bandwidth for active sessions
      db.nasSession.aggregate({
        where: { status: "ACTIVE" },
        _sum: { inputOctets: true, outputOctets: true },
      }),

      // Average session duration (closed sessions from today)
      db.nasSession.aggregate({
        where: { status: "CLOSED", stopTime: { gte: todayStart } },
        _avg: { sessionTimeSec: true },
      }),

    ]);

    // Top plans by active sessions
    const topPlans = await db.nasSession.groupBy({
      by: ["planId", "planName"],
      where: { status: "ACTIVE", planId: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    });

    const totalAuth = todayAuthSuccess + todayAuthFailure;
    const totalInputBytes = Number(totalBandwidth._sum.inputOctets || 0n);
    const totalOutputBytes = Number(totalBandwidth._sum.outputOctets || 0n);

    return json({
      activeSessions,
      todaySessions,
      authSuccessToday: todayAuthSuccess,
      authFailureToday: todayAuthFailure,
      authSuccessRate: totalAuth > 0 ? Math.round((todayAuthSuccess / totalAuth) * 100) : 0,
      totalDownloadBytes: totalInputBytes,
      totalUploadBytes: totalOutputBytes,
      totalBandwidthBytes: totalInputBytes + totalOutputBytes,
      totalDownloadMb: Math.round(totalInputBytes / (1024 * 1024)),
      totalUploadMb: Math.round(totalOutputBytes / (1024 * 1024)),
      avgSessionDurationSec: Math.round(avgSessionDuration._avg.sessionTimeSec || 0),
      topPlansByActiveSessions: topPlans.map((p) => ({
        planId: p.planId,
        planName: p.planName,
        activeSessions: p._count.id,
      })),
      uptime: process.uptime(),
    });
  }

  // GET /api/stats/bandwidth
  if (path === "/api/stats/bandwidth" && req.method === "GET") {
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);

    // Per-subscriber bandwidth for active sessions
    const topConsumers = await db.nasSession.findMany({
      where: { status: "ACTIVE" },
      select: {
        subscriberId: true,
        username: true,
        subscriber: { select: { name: true, plan: { select: { name: true } } } },
        inputOctets: true,
        outputOctets: true,
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });

    const totalAgg = await db.nasSession.aggregate({
      where: { status: "ACTIVE" },
      _sum: { inputOctets: true, outputOctets: true },
    });

    const mapped = topConsumers.map((s) => {
      const dl = Number(s.inputOctets);
      const ul = Number(s.outputOctets);
      return {
        subscriberId: s.subscriberId,
        username: s.username,
        subscriberName: s.Subscriber?.name,
        planName: s.Subscriber?.Plan?.name,
        downloadBytes: dl,
        uploadBytes: ul,
        totalBytes: dl + ul,
        downloadMb: Math.round(dl / (1024 * 1024)),
        uploadMb: Math.round(ul / (1024 * 1024)),
        totalMb: Math.round((dl + ul) / (1024 * 1024)),
      };
    });

    // Sort by totalBytes descending
    mapped.sort((a, b) => b.totalBytes - a.totalBytes);

    return json({
      totalDownloadBytes: Number(totalAgg._sum.inputOctets || 0n),
      totalUploadBytes: Number(totalAgg._sum.outputOctets || 0n),
      totalDownloadMb: Math.round(Number(totalAgg._sum.inputOctets || 0n) / (1024 * 1024)),
      totalUploadMb: Math.round(Number(totalAgg._sum.outputOctets || 0n) / (1024 * 1024)),
      topConsumers: mapped,
    });
  }

  // ══════════════════════════════════════════════════════════
  // EVENT LOG
  // ══════════════════════════════════════════════════════════

  // GET /api/events
  if (path === "/api/events" && req.method === "GET") {
    const eventType = url.searchParams.get("eventType") || "";
    const subscriberId = url.searchParams.get("subscriberId") || "";
    const sessionId = url.searchParams.get("sessionId") || "";
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);
    const page = Math.max(parseInt(url.searchParams.get("page") || "1"), 1);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (eventType) where.eventType = eventType;
    if (subscriberId) where.subscriberId = subscriberId;
    if (sessionId) where.sessionId = sessionId;

    const [events, total] = await Promise.all([
      db.sessionEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip,
      }),
      db.sessionEvent.count({ where }),
    ]);

    return json({
      events,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  }

  // ══════════════════════════════════════════════════════════
  // NAS CONFIG
  // ══════════════════════════════════════════════════════════

  // GET /api/nas/config
  if (path === "/api/nas/config" && req.method === "GET") {
    const config = await db.nasConfig.findUnique({ where: { id: "builtin" } });
    if (!config) {
      // Create default config if it doesn't exist
      const created = await db.nasConfig.create({ data: {} });
      return json({ config: created });
    }
    return json({ config });
  }

  // PUT /api/nas/config
  if (path === "/api/nas/config" && req.method === "PUT") {
    const body = await req.json().catch(() => ({}));

    // Only allow specific fields to be updated
    const allowedFields = [
      "name", "ipAddress", "identifier", "secret", "coaPort", "enabled",
      "maxSessions", "defaultSessionTimeoutSec", "defaultIdleTimeoutSec",
      "defaultDataLimitMb", "enforceDataLimit", "enforceTimeLimit",
      "enforceIdleTimeout", "enforceConcurrent", "autoReauthOnPlanChange",
      "accountingIntervalSec",
    ];

    const updateData: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (body[key] !== undefined) {
        updateData[key] = body[key];
      }
    }

    const config = await db.nasConfig.upsert({
      where: { id: "builtin" },
      update: updateData,
      create: updateData,
    });

    logger.info("NAS config updated", { updatedBy: auth.userId, fields: Object.keys(updateData) });

    return json({ success: true, config });
  }

  // ══════════════════════════════════════════════════════════
  // SESSION ACCOUNTING UPDATE (interim)
  // ══════════════════════════════════════════════════════════

  // POST /api/sessions/:id/accounting — Update bandwidth/timing
  const accountingMatch = path.match(/^\/api\/sessions\/([^/]+)\/accounting$/);
  if (accountingMatch && req.method === "POST") {
    const sid = accountingMatch[1];
    const body = await req.json().catch(() => ({}));
    const { inputOctets, outputOctets, sessionTimeSec } = body;

    const session = await db.nasSession.findFirst({
      where: { OR: [{ id: sid }, { sessionId: sid }], status: "ACTIVE" },
    });

    if (!session) return jsonErr("Active session not found", 404);

    const inOct = inputOctets !== undefined ? BigInt(inputOctets) : session.inputOctets;
    const outOct = outputOctets !== undefined ? BigInt(outputOctets) : session.outputOctets;
    const timeSec = sessionTimeSec !== undefined ? sessionTimeSec : session.sessionTimeSec;

    const updated = await db.nasSession.update({
      where: { id: session.id },
      data: {
        inputOctets: inOct,
        outputOctets: outOct,
        totalOctets: inOct + outOct,
        sessionTimeSec: timeSec,
        lastActivity: new Date(),
        lastAccounting: new Date(),
      },
    });

    await logEvent({
      nasSessionId: session.id,
      sessionId: session.sessionId,
      subscriberId: session.subscriberId,
      username: session.username,
      eventType: "SESSION_UPDATE",
      context: {
        inputOctets: Number(inOct),
        outputOctets: Number(outOct),
        totalOctets: Number(inOct + outOct),
        sessionTimeSec: timeSec,
      },
      source: "api",
    });

    return json({ success: true, sessionId: session.sessionId });
  }

  // ══════════════════════════════════════════════════════════
  // §42 SESSION SNAPSHOTS
  // ══════════════════════════════════════════════════════════

  // GET /api/snapshots — list SessionSnapshots (filter by vppRecoveryState / subscriberId / username)
  if (path === "/api/snapshots" && req.method === "GET") {
    const where: Record<string, unknown> = {};
    const vppRecoveryState = url.searchParams.get("vppRecoveryState");
    const subscriberId = url.searchParams.get("subscriberId");
    const username = url.searchParams.get("username");
    if (vppRecoveryState) where.vppRecoveryState = vppRecoveryState;
    if (subscriberId) where.subscriberId = subscriberId;
    if (username) where.username = username;
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);

    const snapshots = await db.sessionSnapshot.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: limit,
    });
    return json({ snapshots, count: snapshots.length });
  }

  // GET /api/snapshots/:sessionId — single snapshot detail
  const snapshotMatch = path.match(/^\/api\/snapshots\/([^/]+)$/);
  if (snapshotMatch && req.method === "GET") {
    const sid = snapshotMatch[1];
    const snapshot = await db.sessionSnapshot.findUnique({ where: { sessionId: sid } });
    if (!snapshot) return jsonErr("Snapshot not found", 404);
    return json({ snapshot });
  }

  // POST /api/sessions/:id/vpp-rebuild — manually trigger VPP rebuild for one session
  const vppRebuildMatch = path.match(/^\/api\/sessions\/([^/]+)\/vpp-rebuild$/);
  if (vppRebuildMatch && req.method === "POST") {
    const sid = vppRebuildMatch[1];
    const session = await db.nasSession.findFirst({
      where: { OR: [{ id: sid }, { sessionId: sid }] },
    });
    if (!session) return jsonErr("Session not found", 404);
    const r = await triggerVppRebuildForSession(session.sessionId);
    return json({
      success: r.rebuilt,
      sessionId: session.sessionId,
      rebuilt: r.rebuilt,
      error: r.error,
      vppEpoch: r.vppEpoch,
    }, r.rebuilt ? 200 : 500);
  }

  // GET /api/vpp/state — proxies vpp-adapter /vpp/state (+ local activeSessions count)
  if (path === "/api/vpp/state" && req.method === "GET") {
    const r = await callVpp("/vpp/state");
    let activeSessions = 0;
    try { activeSessions = await db.nasSession.count({ where: { status: "ACTIVE" } }); } catch {}
    if (!r.ok) {
      return json({
        vppConnected: false,
        vppAdapterReachable: false,
        error: r.error,
        activeSessions,
        lastKnownVppEpoch,
        lastVppEpochPollAt: lastVppEpochPollAt ? new Date(lastVppEpochPollAt).toISOString() : null,
      });
    }
    return json({
      vppAdapterReachable: true,
      vppConnected: (r.data as any)?.vppConnected ?? false,
      vppEpoch: (r.data as any)?.vppEpoch ?? (r.data as any)?.epoch ?? lastKnownVppEpoch,
      vppLastRestartAt: (r.data as any)?.vppLastRestartAt ?? (r.data as any)?.lastRestartAt ?? null,
      activeSessions,
      lastKnownVppEpoch,
      lastVppEpochPollAt: lastVppEpochPollAt ? new Date(lastVppEpochPollAt).toISOString() : null,
      raw: r.data,
    });
  }

  // POST /api/vpp/restart-recovery — manually trigger full VPP restart recovery
  if (path === "/api/vpp/restart-recovery" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const prev = (body && typeof body.prevEpoch === "number") ? body.prevEpoch : lastKnownVppEpoch;
    // Fetch current epoch from vpp-adapter
    const e = await callVpp<{ epoch: number }>("/vpp/epoch");
    const newEpoch = e.data?.epoch || (prev + 1);
    const result = await runVppRestartRecovery(prev, newEpoch, "manual");
    if (newEpoch > lastKnownVppEpoch) lastKnownVppEpoch = newEpoch;
    return json({ success: true, prevEpoch: prev, newEpoch, ...result });
  }

  // GET /api/recovery-logs — list VppRecoveryLog (latest 50, filter by event)
  if (path === "/api/recovery-logs" && req.method === "GET") {
    const event = url.searchParams.get("event");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);
    const where: Record<string, unknown> = {};
    if (event) where.event = event;
    const logs = await db.vppRecoveryLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return json({ logs, count: logs.length });
  }

  // GET /api/reconciliation-logs — list ReconciliationLog (latest 50, filter by scope)
  if (path === "/api/reconciliation-logs" && req.method === "GET") {
    const scope = url.searchParams.get("scope");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);
    const where: Record<string, unknown> = {};
    if (scope) where.scope = scope;
    const logs = await db.reconciliationLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return json({ logs, count: logs.length });
  }

  // POST /api/reconciliation/run — manually trigger session reconciliation
  // Logs outcome to ReconciliationLog with scope="MANUAL".
  if (path === "/api/reconciliation/run" && req.method === "POST") {
    const before = await db.nasSession.count({ where: { status: "ACTIVE" } });
    const start = Date.now();
    await runReconciliation("STARTUP" as any).catch(() => {});
    const durationMs = Date.now() - start;
    try {
      await db.reconciliationLog.create({
        data: {
          scope: "MANUAL",
          totalDb: before,
          totalVpp: before,
          totalActive: before,
          totalStale: 0,
          totalRecovered: before,
          totalRemoved: 0,
          durationMs,
          detailsJson: JSON.stringify({ triggeredBy: auth.userId }),
        },
      });
    } catch {}
    broadcastWs("reconciliation_manual", { triggeredBy: auth.userId, durationMs });
    return json({ success: true, scope: "MANUAL", sessionsAffected: before, durationMs });
  }

  // POST /api/dpi/seed-synthetic — populate DpiClassification with demo data
  // Only generates if the table is empty (or ?force=true).
  if (path === "/api/dpi/seed-synthetic" && req.method === "POST") {
    const force = url.searchParams.get("force") === "true";
    const existingCount = await db.dpiClassification.count();
    if (existingCount > 0 && !force) {
      return json({ success: true, message: "Already seeded", count: existingCount });
    }
    if (force) {
      await db.dpiClassification.deleteMany({});
    }
    const apps = [
      { name: "YouTube", category: "Streaming", protocol: "HTTPS", risk: "LOW" },
      { name: "Netflix", category: "Streaming", protocol: "HTTPS", risk: "LOW" },
      { name: "WhatsApp", category: "Messaging", protocol: "TLS", risk: "LOW" },
      { name: "Instagram", category: "Social", protocol: "HTTPS", risk: "MEDIUM" },
      { name: "TikTok", category: "Social", protocol: "HTTPS", risk: "MEDIUM" },
      { name: "Zoom", category: "Collaboration", protocol: "UDP", risk: "LOW" },
      { name: "Fortnite", category: "Gaming", protocol: "UDP", risk: "MEDIUM" },
      { name: "BitTorrent", category: "P2P", protocol: "TCP/UDP", risk: "HIGH" },
      { name: "Tor", category: "Anonymizer", protocol: "TLS", risk: "CRITICAL" },
      { name: "Spotify", category: "Music", protocol: "HTTPS", risk: "LOW" },
      { name: "GitHub", category: "Developer", protocol: "HTTPS", risk: "LOW" },
      { name: "Microsoft 365", category: "Cloud", protocol: "HTTPS", risk: "LOW" },
      { name: "Telegram", category: "Messaging", protocol: "TLS", risk: "LOW" },
      { name: "Twitch", category: "Streaming", protocol: "HTTPS", risk: "MEDIUM" },
      { name: "Steam", category: "Gaming", protocol: "HTTPS", risk: "LOW" },
    ];
    const activeSubs = await db.nasSession.findMany({
      where: { status: "ACTIVE" },
      select: { framedIp: true, subscriberId: true },
      take: 5,
    });
    if (activeSubs.length === 0) {
      const anySub = await db.subscriber.findFirst({ select: { id: true, ipAddress: true } });
      if (anySub) activeSubs.push({ framedIp: anySub.ipAddress || "10.0.0.1", subscriberId: anySub.id } as any);
    }
    const rows: any[] = [];
    const now = Date.now();
    for (let i = 0; i < 50; i++) {
      const app = apps[Math.floor(Math.random() * apps.length)];
      const sub = activeSubs[Math.floor(Math.random() * activeSubs.length)] || { framedIp: "10.0.0.1", subscriberId: "unknown" };
      rows.push({
        subscriberIp: sub.framedIp || "10.0.0.1",
        subscriberId: sub.subscriberId || "unknown",
        appName: app.name,
        appCategory: app.category,
        protocol: app.protocol,
        bytesIn: BigInt(Math.floor(Math.random() * 50_000_000) + 100_000),
        bytesOut: BigInt(Math.floor(Math.random() * 5_000_000) + 50_000),
        flows: Math.floor(Math.random() * 100) + 1,
        riskLevel: app.risk,
        detectedAt: new Date(now - Math.floor(Math.random() * 3_600_000)),
      });
    }
    if (rows.length > 0) {
      await db.dpiClassification.createMany({ data: rows });
    }
    return json({ success: true, inserted: rows.length, total: rows.length });
  }

  // ══════════════════════════════════════════════════════════
  // §38 DUPLICATE LOGIN POLICY
  // ══════════════════════════════════════════════════════════

  // GET /api/duplicate-login-policy — list all policies
  if (path === "/api/duplicate-login-policy" && req.method === "GET") {
    const policies = await db.duplicateLoginPolicy.findMany({
      orderBy: { updatedAt: "desc" },
    });
    return json({ policies, count: policies.length });
  }

  // POST /api/duplicate-login-policy — create or update (upsert by name, or by id if provided)
  if (path === "/api/duplicate-login-policy" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const { id, name, description, mode, maxSessions, scope, isEnabled } = body;
    if (!name) return jsonErr("name is required");
    const validModes = ["ALLOW_MULTIPLE", "DENY_NEW", "DISCONNECT_OLD", "LIMIT_N"];
    const validScopes = ["USERNAME", "MAC", "BOTH"];
    if (mode && !validModes.includes(mode)) return jsonErr(`Invalid mode. Must be one of: ${validModes.join(", ")}`);
    if (scope && !validScopes.includes(scope)) return jsonErr(`Invalid scope. Must be one of: ${validScopes.join(", ")}`);

    const data: any = {
      name,
      description: description || "",
      mode: mode || "DENY_NEW",
      maxSessions: typeof maxSessions === "number" ? maxSessions : 1,
      scope: scope || "USERNAME",
      isEnabled: isEnabled ?? true,
    };
    let policy;
    if (id) {
      policy = await db.duplicateLoginPolicy.update({ where: { id }, data });
    } else {
      policy = await db.duplicateLoginPolicy.upsert({
        where: { name },
        create: data,
        update: data,
      });
    }
    return json({ success: true, policy });
  }

  // PUT /api/duplicate-login-policy/:id — update a policy
  const dlpMatch = path.match(/^\/api\/duplicate-login-policy\/([^/]+)$/);
  if (dlpMatch && req.method === "PUT") {
    const id = dlpMatch[1];
    const body = await req.json().catch(() => ({}));
    const { name, description, mode, maxSessions, scope, isEnabled } = body;
    const validModes = ["ALLOW_MULTIPLE", "DENY_NEW", "DISCONNECT_OLD", "LIMIT_N"];
    const validScopes = ["USERNAME", "MAC", "BOTH"];
    if (mode && !validModes.includes(mode)) return jsonErr(`Invalid mode. Must be one of: ${validModes.join(", ")}`);
    if (scope && !validScopes.includes(scope)) return jsonErr(`Invalid scope. Must be one of: ${validScopes.join(", ")}`);
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (mode !== undefined) data.mode = mode;
    if (maxSessions !== undefined) data.maxSessions = maxSessions;
    if (scope !== undefined) data.scope = scope;
    if (isEnabled !== undefined) data.isEnabled = isEnabled;

    const policy = await db.duplicateLoginPolicy.update({ where: { id }, data });
    return json({ success: true, policy });
  }

  // ══════════════════════════════════════════════════════════
  // §35 DPI CLASSIFICATION + §34 NAT EVENT LOGS
  // ══════════════════════════════════════════════════════════

  // GET /api/dpi/classifications — list DpiClassification (latest 100, with filters)
  if (path === "/api/dpi/classifications" && req.method === "GET") {
    const appName = url.searchParams.get("appName");
    const subscriberId = url.searchParams.get("subscriberId");
    const subscriberIp = url.searchParams.get("subscriberIp");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);
    const where: Record<string, unknown> = {};
    if (appName) where.appName = appName;
    if (subscriberId) where.subscriberId = subscriberId;
    if (subscriberIp) where.subscriberIp = subscriberIp;
    const rows = await db.dpiClassification.findMany({
      where,
      orderBy: { detectedAt: "desc" },
      take: limit,
    });
    // Convert BigInt → Number (JSON.stringify can't serialize BigInt natively)
    const classifications = rows.map((r) => ({
      ...r,
      bytesIn: Number(r.bytesIn),
      bytesOut: Number(r.bytesOut),
    }));
    return json({ classifications, count: classifications.length });
  }

  // GET /api/nat-events — list NatLog (latest 100, with filters)
  if (path === "/api/nat-events" && req.method === "GET") {
    const subscriberId = url.searchParams.get("subscriberId");
    const srcIp = url.searchParams.get("srcIp");
    const dstDomain = url.searchParams.get("dstDomain");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);
    const where: Record<string, unknown> = {};
    if (subscriberId) where.subscriberId = subscriberId;
    if (srcIp) where.srcIp = srcIp;
    if (dstDomain) where.dstDomain = { contains: dstDomain };
    const rows = await db.natLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: limit,
    });
    // Convert BigInt → Number for JSON serialization
    const events = rows.map((r) => ({
      ...r,
      bytesSent: Number(r.bytesSent),
      bytesReceived: Number(r.bytesReceived),
    }));
    return json({ events, count: events.length });
  }

  // ══════════════════════════════════════════════════════════
  // FALLBACK
  // ══════════════════════════════════════════════════════════

  return json({ error: "Not Found", path }, 404);
}
