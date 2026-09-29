// Cryptsk RADIUS Service — Port 3001
// Production-ready RADIUS management with real DB, shell command wrappers, auth, and structured logging
//
// Schema model (post-refactor):
//   RadiusUser  → thin record: id, subscriberId, createdAt, updatedAt
//   Subscriber  → credentials: serviceUsername, servicePassword, radiusEnabled,
//                 speeds: currentSpeedDown, currentSpeedUp, radiusGroupId, planId,
//                 timeouts: sessionTimeout, idleTimeout,
//                 auth tracking: lastAuthAt, lastAuthResult
//   Plan        → downloadSpeed/uploadSpeed (Kbps), dataLimitGb, groupId → RadiusGroup
//   RadiusGroup → speedLimitDown/Up (Mbps), dataLimit, sessionTimeout

import { PrismaClient } from "@prisma/client";
import { requireAuth, corsHeaders } from "../shared/auth.ts";
import { createLogger } from "../shared/logger.ts";

const db = new PrismaClient();
const logger = createLogger("radius-service");

// ─── Helpers ────────────────────────────────────────────────

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
 * Resolve effective speed limits for a subscriber through the chain:
 *   subscriber.radiusGroup (override) → plan.group (default) → subscriber.currentSpeed*
 * RadiusGroup values are in Mbps; Plan.downloadSpeed/uploadSpeed are in Kbps.
 * Returns { speedDown, speedUp } in Mbps (0 = not set).
 */
function resolveSpeeds(subscriber: {
  radiusGroup?: { speedLimitDown: number; speedLimitUp: number } | null;
  plan?: {
    downloadSpeed: number;
    uploadSpeed: number;
    group?: { speedLimitDown: number; speedLimitUp: number } | null;
  } | null;
  currentSpeedDown: number;
  currentSpeedUp: number;
}): { speedDown: number; speedUp: number } {
  // Override group takes highest priority
  if (subscriber.radiusGroup?.speedLimitDown) {
    return {
      speedDown: subscriber.radiusGroup.speedLimitDown,
      speedUp: subscriber.radiusGroup.speedLimitUp,
    };
  }
  // Plan's linked group
  if (subscriber.plan?.group?.speedLimitDown) {
    return {
      speedDown: subscriber.plan.group.speedLimitDown,
      speedUp: subscriber.plan.group.speedLimitUp,
    };
  }
  // Plan's own speeds (convert Kbps → Mbps)
  if (subscriber.plan?.downloadSpeed) {
    return {
      speedDown: Math.round(subscriber.plan.downloadSpeed / 1000),
      speedUp: Math.round(subscriber.plan.uploadSpeed / 1000),
    };
  }
  // Subscriber-level current speeds (assumed Mbps)
  return {
    speedDown: subscriber.currentSpeedDown,
    speedUp: subscriber.currentSpeedUp,
  };
}

/**
 * Resolve effective data limit for a subscriber.
 * RadiusGroup.dataLimit is in MB; Plan.dataLimitGb is in GB.
 */
function resolveDataLimit(subscriber: {
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
 * Resolve effective session timeout for a subscriber (seconds).
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

// ─── Shell Command Wrappers ─────────────────────────────────

/**
 * Execute radclient command for RADIUS CoA (Change of Authorization).
 * This sends a CoA request to disconnect or change speed without user re-auth.
 */
async function execRadclient(nasIp: string, nasPort: number, secret: string, attributes: Record<string, string>): Promise<{
  success: boolean;
  output: string;
  exitCode: number;
}> {
  try {
    const attrStr = Object.entries(attributes)
      .map(([k, v]) => `${k}=${v}`)
      .join(" ");

    const proc = Bun.spawn(
      ["radclient", "-x", `${nasIp}:${nasPort || 3799}`, "coa", secret],
      { stdin: "pipe", stdout: "pipe", stderr: "pipe" }
    );
    const writer = proc.stdin.getWriter();
    await writer.write(new TextEncoder().encode(attrStr + "\n"));
    await writer.close();
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    return {
      success: exitCode === 0,
      output: stdout || stderr,
      exitCode,
    };
  } catch (err) {
    return { success: false, output: `radclient not available: ${err}`, exitCode: -1 };
  }
}

/**
 * Generate FreeRADIUS `users` file content from database.
 * Queries Subscriber where radiusEnabled=true and generates entries
 * using serviceUsername/servicePassword from Subscriber, speeds from
 * the RadiusGroup chain (subscriber override → plan group → plan speeds).
 */
async function generateFreeradiusUsersFile(): Promise<{
  content: string;
  userCount: number;
}> {
  const subscribers = await db.subscriber.findMany({
    where: { radiusEnabled: true },
    select: {
      serviceUsername: true,
      servicePassword: true,
      sessionTimeout: true,
      idleTimeout: true,
      currentSpeedDown: true,
      currentSpeedUp: true,
      radiusGroup: { select: { speedLimitDown: true, speedLimitUp: true, dataLimit: true, sessionTimeout: true } },
      plan: {
        select: {
          downloadSpeed: true,
          uploadSpeed: true,
          dataLimitGb: true,
          group: { select: { speedLimitDown: true, speedLimitUp: true, dataLimit: true, sessionTimeout: true } },
        },
      },
    },
  });

  let content = `# Cryptsk FreeRADIUS users file\n# Auto-generated at ${new Date().toISOString()}\n#\n\n`;

  for (const sub of subscribers) {
    if (!sub.serviceUsername) continue;

    const { speedDown, speedUp } = resolveSpeeds(sub);
    const dataLimit = resolveDataLimit(sub);
    const sessionTimeout = resolveSessionTimeout(sub);
    const idleTimeout = sub.idleTimeout;

    content += `"${sub.serviceUsername}" Cleartext-Password := "${sub.servicePassword}"\n`;
    if (speedDown > 0 && speedUp > 0) {
      content += `    Mikrotik-Rate-Limit = "${speedDown}M/${speedUp}M",\n`;
    }
    if (sessionTimeout) {
      content += `    Session-Timeout = "${sessionTimeout}",\n`;
    }
    if (idleTimeout) {
      content += `    Idle-Timeout = "${idleTimeout}",\n`;
    }
    if (dataLimit) {
      content += `    Cryptsk-Data-Limit = "${dataLimit}",\n`;
    }
    content += `\n`;
  }

  return { content, userCount: subscribers.length };
}

/**
 * Generate FreeRADIUS `clients.conf` content from database.
 * Uses NetworkDevice entries that could serve as NAS.
 */
async function generateFreeradiusClientsConf(): Promise<{
  content: string;
  clientCount: number;
}> {
  const settings = await db.ispSettings.findUnique({ where: { id: "default" } });
  const secret = settings?.radiusSecret || "cryptsk_shared_secret";

  const devices = await db.networkDevice.findMany({
    where: {
      type: { in: ["MIKROTIK", "CISCO", "JUNIPER"] },
      status: { not: "OFFLINE" },
    },
  });

  let content = `# Cryptsk FreeRADIUS clients.conf\n# Auto-generated at ${new Date().toISOString()}\n#\n\n`;

  content += `client localhost_ipv4 {\n`;
  content += `    ipaddr = 127.0.0.1\n`;
  content += `    secret = ${secret}\n`;
  content += `}\n\n`;

  for (const device of devices) {
    const devSecret = secret; // In production, per-device secrets can be stored
    content += `client ${device.name.replace(/[^a-zA-Z0-9_]/g, "_")} {\n`;
    content += `    ipaddr = ${device.ipAddress}\n`;
    content += `    secret = ${devSecret}\n`;
    content += `    shortname = ${device.name}\n`;
    content += `}\n\n`;
  }

  return { content, clientCount: devices.length + 1 }; // +1 for localhost
}

/**
 * Generate FreeRADIUS SQL counter module config snippet.
 */
function generateFreeradiusSqlCounterConfig(): string {
  return `# Cryptsk FreeRADIUS SQL Counter Module\n# Auto-generated config\n\nsqlcounter monthlycounter {\n    counter-name = Monthly-Data-Usage\n    check-name = Max-Monthly-Data\n    reply-name = Monthly-Data-Left\n    sqlmod-inst = sql\n    key = User-Name\n    reset = monthly\n    query = "SELECT SUM(acctinputoctets + acctoutputoctets) DIV 1048576 FROM radacct WHERE username = '%{User-Name}' AND UNIX_TIMESTAMP(acctstarttime) > UNIX_TIMESTAMP(CURDATE() - INTERVAL 1 MONTH)"\n}\n`;
}

// ─── HTTP Server ────────────────────────────────────────────

Bun.serve({
  port: 3001,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Health check — no auth required
    if (path === "/api/health" && req.method === "GET") {
      const userCount = await db.radiusUser.count();
      const sessionCount = await db.radiusSession.count({ where: { stopTime: null } });
      return json({
        status: "ok",
        service: "radius",
        version: "2.0.0",
        uptime: process.uptime(),
        totalUsers: userCount,
        activeSessions: sessionCount,
        timestamp: new Date().toISOString(),
      });
    }

    // Root
    if (path === "/" && req.method === "GET") {
      return json({ status: "ok", service: "radius", health: "/api/health" });
    }

    // ── All remaining endpoints require auth ──
    let auth;
    try {
      auth = requireAuth(req);
    } catch {
      return json({ error: "Unauthorized" }, 401);
    }

    // ── GET /api/users ──
    // Query RadiusUser → Subscriber (serviceUsername, servicePassword, speeds)
    //   → Plan → RadiusGroup for speed limits.
    if (path === "/api/users" && req.method === "GET") {
      const search = url.searchParams.get("search") || "";
      const status = url.searchParams.get("status") || "";
      const limit = parseInt(url.searchParams.get("limit") || "50");

      const where: Record<string, unknown> = {};
      if (search) {
        where.subscriber = {
          OR: [
            { serviceUsername: { contains: search } },
            { name: { contains: search } },
            { phone: { contains: search } },
          ],
        };
      }
      if (status) {
        // Merge subscriber status filter with existing subscriber filter
        if (where.subscriber && typeof where.subscriber === "object") {
          (where.subscriber as Record<string, unknown>).status = status;
        } else {
          where.subscriber = { status };
        }
      }

      const users = await db.radiusUser.findMany({
        where,
        include: {
          subscriber: {
            select: {
              id: true,
              name: true,
              phone: true,
              code: true,
              serviceUsername: true,
              status: true,
              currentSpeedDown: true,
              currentSpeedUp: true,
              sessionTimeout: true,
              idleTimeout: true,
              lastAuthAt: true,
              lastAuthResult: true,
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
              plan: {
                select: {
                  id: true,
                  name: true,
                  downloadSpeed: true,
                  uploadSpeed: true,
                  dataLimitGb: true,
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
            },
          },
          sessions: { where: { stopTime: null }, take: 1 },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });

      return json({
        users: users.map((u) => {
          const sub = u.subscriber;
          const { speedDown, speedUp } = resolveSpeeds(sub);
          const dataLimitMb = resolveDataLimit(sub);
          const sessionTimeout = resolveSessionTimeout(sub);
          const groupName = sub.radiusGroup?.name || sub.plan?.group?.name || null;

          return {
            id: u.id,
            username: sub.serviceUsername,
            subscriberId: u.subscriberId,
            subscriberName: sub.name,
            subscriberPhone: sub.phone,
            subscriberCode: sub.code,
            groupName,
            speedDown,
            speedUp,
            dataLimitMb,
            sessionTimeout,
            status: sub.status,
            activeSession: u.sessions[0] ? {
              sessionId: u.sessions[0].sessionId,
              nasIp: u.sessions[0].nasIp,
              framedIp: u.sessions[0].framedIp,
              startTime: u.sessions[0].startTime,
            } : null,
            lastAuthAt: sub.lastAuthAt,
            lastAuthResult: sub.lastAuthResult,
            createdAt: u.createdAt,
          };
        }),
        total: users.length,
      });
    }

    // ── POST /api/users (create RADIUS user) ──
    // RadiusUser is now a thin record. Accept subscriberId only.
    // Username/password live on Subscriber (serviceUsername/servicePassword).
    if (path === "/api/users" && req.method === "POST") {
      const body = await req.json();
      const { subscriberId } = body;

      if (!subscriberId) return jsonErr("subscriberId is required");

      // Check subscriber exists and has credentials configured
      const subscriber = await db.subscriber.findUnique({ where: { id: subscriberId } });
      if (!subscriber) return jsonErr("Subscriber not found", 404);
      if (!subscriber.serviceUsername) return jsonErr("Subscriber has no serviceUsername configured");

      // Check for existing RadiusUser (thin record is 1:1 with subscriber)
      const existing = await db.radiusUser.findUnique({ where: { subscriberId } });
      if (existing) return jsonErr("RADIUS user already exists for this subscriber");

      const user = await db.radiusUser.create({
        data: { subscriberId },
      });

      // Sync radiusEnabled flag on subscriber
      await db.subscriber.update({
        where: { id: subscriberId },
        data: { radiusEnabled: true },
      });

      logger.info("RADIUS user created", {
        userId: user.id,
        serviceUsername: subscriber.serviceUsername,
        subscriberId,
        createdBy: auth.userId,
      });
      return json({
        success: true,
        user: { id: user.id, username: subscriber.serviceUsername, subscriberId },
      }, 201);
    }

    // ── PUT /api/users/:id (update RADIUS user) ──
    // RadiusUser is a thin record with no editable fields (id, subscriberId, timestamps).
    // All RADIUS config lives on Subscriber and Plan/RadiusGroup.
    const updateUserMatch = path.match(/^\/api\/users\/([a-zA-Z0-9]+)$/);
    if (updateUserMatch && req.method === "PUT") {
      const userId = updateUserMatch[1];

      const user = await db.radiusUser.findUnique({ where: { id: userId } });
      if (!user) return jsonErr("User not found", 404);

      // RadiusUser has no editable fields beyond auto-managed timestamps.
      // To change speeds/groups/timeouts, update the Subscriber or RadiusGroup directly.
      return json({
        success: true,
        message: "RadiusUser is a thin provisioning record with no editable fields. Update Subscriber (radiusGroupId, sessionTimeout, idleTimeout, currentSpeedDown/Up) or RadiusGroup directly to change RADIUS configuration.",
      });
    }

    // ── POST /api/users/:id/coa (Change of Authorization) ──
    // Look up through RadiusUser → Subscriber for username, speeds, active session.
    const coaMatch = path.match(/^\/api\/users\/([a-zA-Z0-9]+)\/coa$/);
    if (coaMatch && req.method === "POST") {
      const userId = coaMatch[1];
      const body = await req.json().catch(() => ({}));
      const { speedDown, speedUp, disconnect } = body;

      const user = await db.radiusUser.findUnique({
        where: { id: userId },
        include: {
          subscriber: {
            select: {
              serviceUsername: true,
              currentSpeedDown: true,
              currentSpeedUp: true,
              radiusGroup: {
                select: { speedLimitDown: true, speedLimitUp: true },
              },
              plan: {
                select: {
                  downloadSpeed: true,
                  uploadSpeed: true,
                  group: { select: { speedLimitDown: true, speedLimitUp: true } },
                },
              },
            },
          },
          sessions: { where: { stopTime: null }, take: 1 },
        },
      });
      if (!user) return jsonErr("User not found", 404);

      const sub = user.subscriber;
      const activeSession = user.sessions[0];
      if (!activeSession) return jsonErr("No active session found", 404);

      const settings = await db.ispSettings.findUnique({ where: { id: "default" } });
      const nasIp = activeSession.nasIp || settings?.radiusServerIp || "";
      const nasPort = settings?.radiusServerPort || 3799;
      const secret = settings?.radiusSecret || "";

      if (!nasIp) return jsonErr("NAS IP not configured");

      const attributes: Record<string, string> = {
        "User-Name": sub.serviceUsername,
      };

      // Resolve current effective speeds
      const currentSpeeds = resolveSpeeds(sub);

      if (disconnect) {
        // POD (Packet of Disconnect)
        const result = await execRadclient(nasIp, nasPort, secret, {
          ...attributes,
          "Event-Timestamp": String(Math.floor(Date.now() / 1000)),
        });
        if (result.success) {
          await db.radiusSession.update({
            where: { id: activeSession.id },
            data: { stopTime: new Date(), terminateCause: "Admin-Disconnect" },
          });
        }
        logger.info("CoA disconnect", {
          userId: user.id,
          username: sub.serviceUsername,
          nasIp,
          success: result.success,
        });
        return json({
          success: result.success,
          action: "disconnect",
          username: sub.serviceUsername,
          nasIp,
          output: result.output,
          timestamp: new Date().toISOString(),
        });
      }

      // Speed change CoA
      const newDown = speedDown ?? currentSpeeds.speedDown;
      const newUp = speedUp ?? currentSpeeds.speedUp;
      if (newDown > 0 && newUp > 0) {
        attributes["Mikrotik-Rate-Limit"] = `${newDown}M/${newUp}M`;
      }

      const result = await execRadclient(nasIp, nasPort, secret, attributes);

      if (result.success) {
        // Update subscriber's current speed tracking
        await db.subscriber.update({
          where: { id: user.subscriberId },
          data: { currentSpeedDown: newDown, currentSpeedUp: newUp },
        });
      }

      logger.info("CoA speed change", {
        userId: user.id,
        username: sub.serviceUsername,
        newDown,
        newUp,
        success: result.success,
      });
      return json({
        success: result.success,
        action: "speed_change",
        username: sub.serviceUsername,
        nasIp,
        previousSpeed: { down: currentSpeeds.speedDown, up: currentSpeeds.speedUp },
        newSpeed: { down: newDown, up: newUp },
        coaAttributes: attributes,
        output: result.output,
        timestamp: new Date().toISOString(),
      });
    }

    // ── GET /api/sessions ──
    // Active sessions with user info from RadiusUser → Subscriber
    if (path === "/api/sessions" && req.method === "GET") {
      const sessions = await db.radiusSession.findMany({
        where: { stopTime: null },
        include: {
          radiusUser: {
            select: {
              id: true,
              subscriber: {
                select: {
                  serviceUsername: true,
                  name: true,
                  phone: true,
                  currentSpeedDown: true,
                  currentSpeedUp: true,
                  radiusGroup: {
                    select: { speedLimitDown: true, speedLimitUp: true },
                  },
                  plan: {
                    select: {
                      downloadSpeed: true,
                      uploadSpeed: true,
                      group: { select: { speedLimitDown: true, speedLimitUp: true } },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { startTime: "desc" },
      });

      return json({
        sessions: sessions.map((s) => {
          const sub = s.radiusUser.subscriber;
          const { speedDown, speedUp } = sub ? resolveSpeeds(sub) : { speedDown: 0, speedUp: 0 };

          return {
            id: s.id,
            sessionId: s.sessionId,
            username: sub?.serviceUsername || null,
            subscriberName: sub?.name || null,
            nasIp: s.nasIp,
            nasPort: s.nasPort,
            framedIp: s.framedIp,
            callingStationId: s.callingStationId,
            speedDown,
            speedUp,
            startTime: s.startTime,
            duration: s.startTime ? Math.floor((Date.now() - s.startTime.getTime()) / 1000) : 0,
          };
        }),
        total: sessions.length,
      });
    }

    // ── GET /api/groups ──
    if (path === "/api/groups" && req.method === "GET") {
      const groups = await db.radiusGroup.findMany({
        include: { _count: { select: { subscribers: true } } },
        orderBy: { priority: "asc" },
      });
      return json({
        groups: groups.map((g) => ({
          id: g.id,
          name: g.name,
          description: g.description,
          speedLimitDown: g.speedLimitDown,
          speedLimitUp: g.speedLimitUp,
          dataLimit: g.dataLimit,
          sessionTimeout: g.sessionTimeout,
          priority: g.priority,
          subscriberCount: g._count.subscribers,
        })),
        total: groups.length,
      });
    }

    // ── POST /api/groups ──
    if (path === "/api/groups" && req.method === "POST") {
      const body = await req.json();
      const { name, description, speedLimitDown, speedLimitUp, dataLimit, sessionTimeout, priority } = body;
      if (!name) return jsonErr("Group name is required");

      const group = await db.radiusGroup.create({
        data: {
          name,
          description: description || "",
          speedLimitDown: speedLimitDown || 0,
          speedLimitUp: speedLimitUp || 0,
          dataLimit: dataLimit || null,
          sessionTimeout: sessionTimeout || null,
          priority: priority || 0,
        },
      });

      logger.info("RADIUS group created", { groupId: group.id, name, createdBy: auth.userId });
      return json({ success: true, group: { id: group.id, name: group.name } }, 201);
    }

    // ── GET /api/config/users-file ──
    if (path === "/api/config/users-file" && req.method === "GET") {
      const { content, userCount } = await generateFreeradiusUsersFile();
      return new Response(content, {
        headers: { "Content-Type": "text/plain", ...corsHeaders },
      });
    }

    // ── GET /api/config/clients-conf ──
    if (path === "/api/config/clients-conf" && req.method === "GET") {
      const { content } = await generateFreeradiusClientsConf();
      return new Response(content, {
        headers: { "Content-Type": "text/plain", ...corsHeaders },
      });
    }

    // ── GET /api/config/sql-counter ──
    if (path === "/api/config/sql-counter" && req.method === "GET") {
      return new Response(generateFreeradiusSqlCounterConfig(), {
        headers: { "Content-Type": "text/plain", ...corsHeaders },
      });
    }

    // ── GET /api/accounting ──
    if (path === "/api/accounting" && req.method === "GET") {
      const limit = parseInt(url.searchParams.get("limit") || "50");
      const logs = await db.radiusAccountingLog.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return json({ logs, total: logs.length });
    }

    // ── POST /api/import ──
    // Parse a FreeRADIUS users file and match entries to existing Subscribers
    // by serviceUsername. Returns parsed results; actual provisioning via POST /api/users.
    if (path === "/api/import" && req.method === "POST") {
      const body = await req.json();
      const { format, content } = body;
      if (format !== "users-file" || !content) return jsonErr("format=users-file and content required");

      // Parse FreeRADIUS users file format
      const lines = content.split("\n");
      const parsed: Array<{ username: string; password: string; attributes: string[] }> = [];
      let currentEntry: { username: string; password: string; attributes: string[] } | null = null;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        const userMatch = trimmed.match(/^"([^"]+)"\s+Cleartext-Password\s*:=\s*"([^"]+)"/);
        if (userMatch) {
          // Save previous entry
          if (currentEntry) parsed.push(currentEntry);
          currentEntry = { username: userMatch[1], password: userMatch[2], attributes: [] };
          continue;
        }

        // Collect attribute lines for the current user entry
        if (currentEntry && (trimmed.startsWith("    ") || trimmed.startsWith("\t"))) {
          const attrClean = trimmed.replace(/[,\s]+$/, "");
          if (attrClean.includes("=") || attrClean.includes(":=")) {
            currentEntry.attributes.push(attrClean);
          }
        }
      }
      if (currentEntry) parsed.push(currentEntry);

      // Try to match parsed usernames to existing subscribers
      const usernames = parsed.map((e) => e.username);
      const matchedSubscribers = usernames.length > 0
        ? await db.subscriber.findMany({
            where: { serviceUsername: { in: usernames } },
            select: { id: true, serviceUsername: true, name: true, radiusEnabled: true },
          })
        : [];

      const matchedMap = new Map(matchedSubscribers.map((s) => [s.serviceUsername, s]));

      return json({
        success: true,
        parsed: {
          totalEntries: parsed.length,
          matched: parsed.filter((e) => matchedMap.has(e.username)).map((e) => ({
            username: e.username,
            subscriberId: matchedMap.get(e.username)!.id,
            subscriberName: matchedMap.get(e.username)!.name,
            alreadyProvisioned: matchedMap.get(e.username)!.radiusEnabled,
          })),
          unmatched: parsed.filter((e) => !matchedMap.has(e.username)).map((e) => e.username),
        },
        timestamp: new Date().toISOString(),
      });
    }

    // ── GET /api/status ──
    if (path === "/api/status" && req.method === "GET") {
      const totalUsers = await db.radiusUser.count();
      // "Active" = subscriber status is ACTIVE
      const activeUsers = await db.radiusUser.count({
        where: { subscriber: { status: "ACTIVE" } },
      });
      const activeSessions = await db.radiusSession.count({ where: { stopTime: null } });
      const groups = await db.radiusGroup.count();

      return json({
        service: "radius",
        status: "running",
        stats: {
          totalUsers,
          activeUsers,
          activeSessions,
          groups,
          uptime: process.uptime(),
        },
      });
    }

    return json({ error: "Not Found", path }, 404);
  },
});

logger.info("RADIUS Service started on port 3001", { version: "2.0.0" });
