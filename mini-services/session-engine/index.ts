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
  // Override group takes highest priority (values in Mbps → convert to Kbps)
  if (subscriber.radiusGroup?.speedLimitDown) {
    return {
      speedDown: subscriber.radiusGroup.speedLimitDown * 1000,
      speedUp: subscriber.radiusGroup.speedLimitUp * 1000,
    };
  }
  // Plan's linked group (values in Mbps → convert to Kbps)
  if (subscriber.plan?.group?.speedLimitDown) {
    return {
      speedDown: subscriber.plan.group.speedLimitDown * 1000,
      speedUp: subscriber.plan.group.speedLimitUp * 1000,
    };
  }
  // Plan's own speeds (already in Kbps)
  if (subscriber.plan?.downloadSpeed) {
    return {
      speedDown: subscriber.plan.downloadSpeed,
      speedUp: subscriber.plan.uploadSpeed,
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
  plan?: {
    dataLimitGb: number | null;
    group?: { dataLimit: number | null } | null;
  } | null;
}): number | null {
  return (
    subscriber.radiusGroup?.dataLimit ??
    subscriber.plan?.group?.dataLimit ??
    (subscriber.plan?.dataLimitGb ? Math.round(subscriber.plan.dataLimitGb * 1024) : null)
  );
}

/**
 * Resolve effective session timeout (seconds).
 */
function resolveSessionTimeout(subscriber: {
  radiusGroup?: { sessionTimeout: number | null } | null;
  plan?: { group?: { sessionTimeout: number | null } | null } | null;
  sessionTimeout: number | null;
}): number | null {
  return (
    subscriber.sessionTimeout ??
    subscriber.radiusGroup?.sessionTimeout ??
    subscriber.plan?.group?.sessionTimeout ??
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
    await db.sessionEvent.create({ data: params });
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

  // POST /api/auth — Authenticate a subscriber
  if (path === "/api/auth" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const { serviceUsername, servicePassword, macAddress, clientIp } = body;

    if (!serviceUsername || !servicePassword) {
      return jsonErr("serviceUsername and servicePassword are required");
    }

    const clientIpStr = clientIp || req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "";
    const macStr = macAddress || "";

    // Log auth request
    await logEvent({
      username: serviceUsername,
      eventType: "AUTH_REQUEST",
      context: { method: "LOCAL_DB" },
      clientIp: clientIpStr,
      macAddress: macStr,
      source: "api",
      triggeredBy: auth.userId,
    });

    // Find subscriber by serviceUsername
    const subscriber = await db.subscriber.findUnique({
      where: { serviceUsername },
      include: {
        plan: {
          select: {
            id: true,
            name: true,
            downloadSpeed: true,
            uploadSpeed: true,
            dataLimitGb: true,
            maxConcurrentSessions: true,
            group: {
              select: {
                id: true,
                name: true,
                speedLimitDown: true,
                speedLimitUp: true,
                dataLimit: true,
                sessionTimeout: true,
              },
            },
          },
        },
        radiusGroup: {
          select: {
            id: true,
            name: true,
            speedLimitDown: true,
            speedLimitUp: true,
            dataLimit: true,
            sessionTimeout: true,
          },
        },
      },
    });

    if (!subscriber) {
      await logEvent({
        username: serviceUsername,
        eventType: "AUTH_FAILURE",
        authResult: "Access-Reject",
        context: { reason: "Subscriber not found" },
        clientIp: clientIpStr,
        macAddress: macStr,
        source: "api",
        triggeredBy: auth.userId,
      });
      return json({ error: "Invalid credentials", authResult: "Access-Reject" }, 401);
    }

    // Check subscriber status
    if (subscriber.status !== "ACTIVE") {
      await logEvent({
        subscriberId: subscriber.id,
        username: serviceUsername,
        eventType: "AUTH_FAILURE",
        authResult: "Access-Reject",
        context: { reason: "Subscriber not active", status: subscriber.status },
        clientIp: clientIpStr,
        macAddress: macStr,
        source: "api",
        triggeredBy: auth.userId,
      });
      return json({ error: "Subscriber not active", authResult: "Access-Reject", status: subscriber.status }, 403);
    }

    // Check radiusEnabled flag
    if (!subscriber.radiusEnabled) {
      await logEvent({
        subscriberId: subscriber.id,
        username: serviceUsername,
        eventType: "AUTH_FAILURE",
        authResult: "Access-Reject",
        context: { reason: "RADIUS not enabled for subscriber" },
        clientIp: clientIpStr,
        macAddress: macStr,
        source: "api",
        triggeredBy: auth.userId,
      });
      return json({ error: "RADIUS not enabled for subscriber", authResult: "Access-Reject" }, 403);
    }

    // Validate password
    if (subscriber.servicePassword !== servicePassword) {
      await logEvent({
        subscriberId: subscriber.id,
        username: serviceUsername,
        eventType: "AUTH_FAILURE",
        authResult: "Access-Reject",
        context: { reason: "Invalid password" },
        clientIp: clientIpStr,
        macAddress: macStr,
        source: "api",
        triggeredBy: auth.userId,
      });
      return json({ error: "Invalid credentials", authResult: "Access-Reject" }, 401);
    }

    // Resolve policy
    const speeds = resolveSpeedsKbps(subscriber);
    const dataLimitMb = resolveDataLimitMb(subscriber);
    const sessionTimeoutSec = resolveSessionTimeout(subscriber);
    const idleTimeoutSec = resolveIdleTimeout(subscriber);
    const maxConcurrent = subscriber.plan?.maxConcurrentSessions ?? 1;

    // Check concurrent sessions
    const activeCount = await db.nasSession.count({
      where: { subscriberId: subscriber.id, status: "ACTIVE" },
    });
    if (activeCount >= maxConcurrent) {
      // Close existing sessions if maxConcurrent is 1 (replace session)
      if (maxConcurrent === 1) {
        const existingSessions = await db.nasSession.findMany({
          where: { subscriberId: subscriber.id, status: "ACTIVE" },
        });
        for (const existing of existingSessions) {
          await closeSession(existing.sessionId, "Session-Timeout", "Replaced by new login", "system");
          await logEvent({
            nasSessionId: existing.id,
            sessionId: existing.sessionId,
            subscriberId: subscriber.id,
            username: serviceUsername,
            eventType: "SESSION_STOP",
            context: { reason: "Replaced by new login" },
            source: "api",
            triggeredBy: auth.userId,
          });
        }
      } else {
        await logEvent({
          subscriberId: subscriber.id,
          username: serviceUsername,
          eventType: "AUTH_FAILURE",
          authResult: "Access-Reject",
          context: { reason: "Max concurrent sessions reached", activeCount, maxConcurrent },
          source: "api",
          triggeredBy: auth.userId,
        });
        return json({
          error: "Max concurrent sessions reached",
          authResult: "Access-Reject",
          activeCount,
          maxConcurrent,
        }, 403);
      }
    }

    // Create session
    const sessionId = generateSessionId();
    const nasConfig = await db.nasConfig.findUnique({ where: { id: "builtin" } });

    const session = await db.nasSession.create({
      data: {
        sessionId,
        subscriberId: subscriber.id,
        username: serviceUsername,
        nasIp: nasConfig?.ipAddress || "127.0.0.1",
        authMethod: "LOCAL_DB",
        status: "ACTIVE",
        planId: subscriber.plan?.id || null,
        planName: subscriber.plan?.name || "",
        radiusGroupId: subscriber.radiusGroup?.id || subscriber.plan?.group?.id || null,
        radiusGroupName: subscriber.radiusGroup?.name || subscriber.plan?.group?.name || "",
        speedDownKbps: speeds.speedDown,
        speedUpKbps: speeds.speedUp,
        dataLimitMb,
        sessionTimeoutSec: sessionTimeoutSec ?? nasConfig?.defaultSessionTimeoutSec ?? 86400,
        idleTimeoutSec: idleTimeoutSec ?? nasConfig?.defaultIdleTimeoutSec ?? 3600,
        callingStationId: macStr,
        assignedIp: subscriber.ipAddress || "",
      },
    });

    // Update subscriber last auth
    await db.subscriber.update({
      where: { id: subscriber.id },
      data: { lastAuthAt: new Date(), lastAuthResult: "Access-Accept" },
    });

    // Log success
    await logEvent({
      nasSessionId: session.id,
      sessionId,
      subscriberId: subscriber.id,
      username: serviceUsername,
      eventType: "AUTH_SUCCESS",
      authResult: "Access-Accept",
      context: {
        planName: subscriber.plan?.name,
        speeds,
        dataLimitMb,
        sessionTimeoutSec,
        maxConcurrent,
      },
      clientIp: clientIpStr,
      macAddress: macStr,
      source: "api",
      triggeredBy: auth.userId,
    });

    await logEvent({
      nasSessionId: session.id,
      sessionId,
      subscriberId: subscriber.id,
      username: serviceUsername,
      eventType: "SESSION_START",
      context: { planName: subscriber.plan?.name, speeds, dataLimitMb },
      source: "api",
      triggeredBy: auth.userId,
    });

    // Broadcast via WebSocket
    broadcastWs("session_start", {
      sessionId,
      username: serviceUsername,
      subscriberName: subscriber.name,
      planName: subscriber.plan?.name,
      speeds,
    });

    logger.info("Session authenticated", {
      sessionId,
      username: serviceUsername,
      subscriberId: subscriber.id,
      speeds,
    });

    return json({
      success: true,
      authResult: "Access-Accept",
      session: {
        sessionId,
        subscriberId: subscriber.id,
        username: serviceUsername,
        subscriberName: subscriber.name,
        planName: subscriber.plan?.name,
        speeds,
        dataLimitMb,
        sessionTimeoutSec: session.sessionTimeoutSec,
        idleTimeoutSec: session.idleTimeoutSec,
        startTime: session.startTime,
      },
    }, 201);
  }

  // POST /api/logout — End a session
  if (path === "/api/logout" && req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const { sessionId, username } = body;

    if (!sessionId && !username) {
      return jsonErr("sessionId or username is required");
    }

    let session;
    if (sessionId) {
      session = await db.nasSession.findUnique({ where: { sessionId } });
    } else {
      session = await db.nasSession.findFirst({
        where: { username, status: "ACTIVE" },
        orderBy: { startTime: "desc" },
      });
    }

    if (!session) {
      return jsonErr("Session not found", 404);
    }
    if (session.status === "CLOSED") {
      return jsonErr("Session already closed");
    }

    const closed = await closeSession(session.sessionId, "User-Request", "User logged out", auth.userId);

    await logEvent({
      nasSessionId: session.id,
      sessionId: session.sessionId,
      subscriberId: session.subscriberId,
      username: session.username,
      eventType: "SESSION_STOP",
      context: { reason: "User logout" },
      source: "api",
      triggeredBy: auth.userId,
    });

    broadcastWs("session_stop", {
      sessionId: session.sessionId,
      username: session.username,
      cause: "User-Request",
    });

    const totalOctets = Number(closed.inputOctets) + Number(closed.outputOctets);
    return json({
      success: true,
      session: {
        sessionId: closed.sessionId,
        username: closed.username,
        status: closed.status,
        duration: closed.sessionTimeSec,
        downloadBytes: Number(closed.inputOctets),
        uploadBytes: Number(closed.outputOctets),
        totalBytes: totalOctets,
        startTime: closed.startTime,
        stopTime: closed.stopTime,
      },
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
          subscriber: {
            select: {
              id: true,
              name: true,
              phone: true,
              code: true,
              status: true,
              plan: { select: { id: true, name: true, downloadSpeed: true, uploadSpeed: true, dataLimitGb: true } },
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
          subscriberName: s.subscriber.name,
          subscriberPhone: s.subscriber.phone,
          subscriberCode: s.subscriber.code,
          subscriberStatus: s.subscriber.status,
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
        subscriber: {
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
          group: { select: { speedLimitDown: true, speedLimitUp: true } },
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
        plan: {
          select: {
            id: true,
            name: true,
            downloadSpeed: true,
            uploadSpeed: true,
            dataLimitGb: true,
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
        subscriber: {
          select: {
            id: true,
            name: true,
            plan: { select: { name: true, dataLimitGb: true } },
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
        subscriberName: s.subscriber.name,
        planName: s.subscriber.plan?.name,
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
  // FALLBACK
  // ══════════════════════════════════════════════════════════

  return json({ error: "Not Found", path }, 404);
}
