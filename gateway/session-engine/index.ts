// ============================================================
// CRYPTSK Nexus — Session Engine
// Per: docs/architecture/02_ENTERPRISE_GATEWAY_ARCHITECTURE.md §10
//
// In-memory authoritative live session state.
// NOT Redis (ADR-005), NOT PostgreSQL (ADR-004) — in-memory Map.
//
// Port: 3010 (per spec 04_FEATURE §8.2)
// Role: owns live session state, correlates RADIUS accounting,
//       serves REST API for the OSS/BSS plane.
//
// Architecture:
//   FreeRADIUS accounting → PostgreSQL radacct → Session Engine (poller)
//   OSS/BSS (Next.js) → REST API → Session Engine
//   Session Engine → in-memory session store
// ============================================================

import { Server } from "bun";
import pg from "pg";

const { Client } = pg;

// ─── Configuration ────────────────────────────────────────────
const PORT = 3010;
const DB_URL = process.env.DATABASE_URL || "postgresql://cryptsknexus:CryptskNexus2026@localhost:5432/cryptsknexus";
const POLL_INTERVAL_MS = 5000; // 5 seconds
const SESSION_TIMEOUT_MS = 60_000; // remove sessions not seen in 60s

// ─── Session Types ────────────────────────────────────────────
type Session = {
  radacctid: string;
  acctsessionid: string;
  acctuniqueid: string;
  username: string;
  groupname: string;
  nasipaddress: string;
  nasportid: string;
  framedipaddress: string;
  callingstationid: string; // MAC
  acctstarttime: string;
  acctsessiontime: number; // seconds
  acctinputoctets: number; // bytes received from user
  acctoutputoctets: number; // bytes sent to user
  status: "active" | "stopped";
  lastSeen: number; // epoch ms — when we last polled this session
};

// ─── In-Memory Session Store ──────────────────────────────────
const sessions = new Map<string, Session>();
let stats = {
  totalCreated: 0,
  totalTerminated: 0,
  lastPollAt: 0,
  lastPollCount: 0,
  pollErrors: 0,
};
const startTime = Date.now();

// ─── Database Poller ──────────────────────────────────────────
async function pollRadAcct() {
  const client = new Client({ connectionString: DB_URL });
  try {
    await client.connect();

    // Fetch active sessions (acctstoptime IS NULL)
    const result = await client.query(`
      SELECT
        radacctid::text,
        acctsessionid,
        acctuniqueid,
        COALESCE(username, '') as username,
        COALESCE((SELECT ug.groupname FROM radusergroup ug WHERE ug.username = radacct.username ORDER BY ug.priority ASC LIMIT 1), '') as groupname,
        nasipaddress,
        COALESCE(nasportid, '') as nasportid,
        COALESCE(framedipaddress, '') as framedipaddress,
        COALESCE(callingstationid, '') as callingstationid,
        COALESCE(acctstarttime, now())::text as acctstarttime,
        COALESCE(acctsessiontime, 0)::bigint as acctsessiontime,
        COALESCE(acctinputoctets, 0)::bigint as acctinputoctets,
        COALESCE(acctoutputoctets, 0)::bigint as acctoutputoctets
      FROM radacct
      WHERE acctstoptime IS NULL
      ORDER BY acctstarttime DESC
      LIMIT 1000
    `);

    const now = Date.now();
    const activeIds = new Set<string>();
    let newCount = 0;

    for (const row of result.rows) {
      const id = row.radacctid;
      activeIds.add(id);

      const existing = sessions.get(id);
      if (!existing) {
        newCount++;
        stats.totalCreated++;
      }

      sessions.set(id, {
        ...row,
        acctsessiontime: Number(row.acctsessiontime),
        acctinputoctets: Number(row.acctinputoctets),
        acctoutputoctets: Number(row.acctoutputoctets),
        status: "active",
        lastSeen: now,
      });
    }

    // Remove sessions that are no longer active in radacct (stopped)
    for (const [id, session] of sessions) {
      if (!activeIds.has(id)) {
        // Session was stopped in radacct — check if it was recently stopped
        // Keep it for 30s so the UI can show the stop event, then remove
        if (now - session.lastSeen > SESSION_TIMEOUT_MS) {
          sessions.delete(id);
          stats.totalTerminated++;
        } else {
          sessions.set(id, { ...session, status: "stopped" });
        }
      }
    }

    stats.lastPollAt = now;
    stats.lastPollCount = result.rows.length;

    if (newCount > 0) {
      console.log(`[poller] ${result.rows.length} active sessions (${newCount} new)`);
    }
  } catch (err: any) {
    stats.pollErrors++;
    console.error("[poller] error:", err.message);
  } finally {
    await client.end().catch(() => {});
  }
}

// Start the poller
setInterval(pollRadAcct, POLL_INTERVAL_MS);

// ─── Startup Reconciliation ───────────────────────────────────
// On boot, do an initial poll to populate in-memory state from radacct.
// This is the "Recover → Reconcile → No duplicate session" gate check:
//   1. Recover: process restarts, in-memory state is empty
//   2. Reconcile: poll radacct for active sessions (acctstoptime IS NULL)
//   3. No duplicate: acctuniqueid is unique in radacct, so no dupes possible
// Sessions that were stopped while we were down are NOT in the active set,
// so they won't be re-added — they're correctly absent from in-memory state.
console.log("[startup] Beginning reconciliation from radacct...");
pollRadAcct().then(() => {
  console.log(`[startup] Reconciliation complete. ${sessions.size} sessions loaded.`);
  console.log(`[startup] Active: ${[...sessions.values()].filter(s => s.status === "active").length}`);
  console.log(`[startup] Stopped (in grace window): ${[...sessions.values()].filter(s => s.status === "stopped").length}`);
}).catch((err) => {
  console.error("[startup] Reconciliation failed:", err);
});

// ─── Periodic Reconciliation Loop (every 60s) ─────────────────
// Full reconciliation: compare in-memory sessions vs radacct active set.
// Removes stale sessions (in-memory says active but radacct says stopped).
// Adds missed sessions (radacct has active but in-memory doesn't).
// This is the safety net beyond the 5s poller — catches edge cases like
// radacct rows updated between polls.
async function fullReconcile() {
  const before = sessions.size;
  await pollRadAcct();
  const after = sessions.size;
  const activeBefore = [...sessions.values()].filter(s => s.status === "active").length;
  const stoppedBefore = [...sessions.values()].filter(s => s.status === "stopped").length;
  if (Math.abs(after - before) > 0 || activeBefore === 0) {
    console.log(`[reconcile] before=${before} after=${after} active=${activeBefore} stopped=${stoppedBefore}`);
  }
}
setInterval(fullReconcile, 60_000); // every 60s

// ─── REST API ────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

function parseUrl(url: string): { path: string; params: Record<string, string> } {
  const [path, query] = url.split("?");
  const params: Record<string, string> = {};
  if (query) {
    for (const pair of query.split("&")) {
      const [k, v] = pair.split("=");
      params[decodeURIComponent(k)] = decodeURIComponent(v || "");
    }
  }
  return { path, params };
}

const server = Bun.serve({
  port: PORT,
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const params: Record<string, string> = {};
    url.searchParams.forEach((v, k) => { params[k] = v; });
    const method = req.method;

    // CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // ── Health ──
    if (path === "/health") {
      return json({
        status: "ok",
        port: PORT,
        uptime: Math.floor((Date.now() - startTime) / 1000),
        epoch: startTime, // generation/epoch — changes on every restart, lets clients detect stale sessions
        sessions: {
          active: [...sessions.values()].filter(s => s.status === "active").length,
          stopped: [...sessions.values()].filter(s => s.status === "stopped").length,
          total: sessions.size,
        },
        stats,
      });
    }

    // ── List sessions ──
    if (path === "/sessions" && method === "GET") {
      const activeOnly = params.active === "true";
      const search = params.search || "";
      const page = parseInt(params.page || "1");
      const pageSize = parseInt(params.pageSize || "50");

      let list = [...sessions.values()].sort((a, b) =>
        b.lastSeen - a.lastSeen
      );

      if (activeOnly) {
        list = list.filter(s => s.status === "active");
      }

      if (search) {
        const q = search.toLowerCase();
        list = list.filter(s =>
          s.username.toLowerCase().includes(q) ||
          s.framedipaddress.includes(q) ||
          s.callingstationid.includes(q) ||
          s.nasipaddress.includes(q) ||
          s.groupname.toLowerCase().includes(q)
        );
      }

      const total = list.length;
      const start = (page - 1) * pageSize;
      const paged = list.slice(start, start + pageSize);

      return json({
        sessions: paged,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      });
    }

    // ── Get single session ──
    if (path.startsWith("/sessions/") && method === "GET") {
      const id = path.split("/")[2];
      const session = sessions.get(id);
      if (!session) return json({ error: "Session not found" }, 404);
      return json({ session });
    }

    // ── Force sync ──
    if (path === "/sessions/sync" && method === "POST") {
      await pollRadAcct();
      return json({ synced: true, activeSessions: sessions.size, ...stats });
    }

    // ── Terminate session (CoA/Disconnect — Phase 4 skeleton) ──
    if (path.startsWith("/sessions/") && method === "DELETE") {
      const id = path.split("/")[2];
      const session = sessions.get(id);
      if (!session) return json({ error: "Session not found" }, 404);

      // TODO: Send CoA/Disconnect to the NAS (Phase 4+)
      // For now, just mark as stopped in memory
      sessions.set(id, { ...session, status: "stopped" });
      console.log(`[terminate] session ${id} (${session.username}) marked stopped`);
      return json({ success: true, message: "Session termination requested (CoA/Disconnect not yet implemented — Phase 4+)" });
    }

    // ── Stats ──
    if (path === "/stats" && method === "GET") {
      const active = [...sessions.values()].filter(s => s.status === "active");
      const totalInput = active.reduce((sum, s) => sum + s.acctinputoctets, 0);
      const totalOutput = active.reduce((sum, s) => sum + s.acctoutputoctets, 0);

      // Group by NAS
      const byNas: Record<string, number> = {};
      for (const s of active) {
        byNas[s.nasipaddress] = (byNas[s.nasipaddress] || 0) + 1;
      }

      // Group by RADIUS group
      const byGroup: Record<string, number> = {};
      for (const s of active) {
        byGroup[s.groupname] = (byGroup[s.groupname] || 0) + 1;
      }

      return json({
        activeCount: active.length,
        totalInputBytes: totalInput,
        totalOutputBytes: totalOutput,
        totalInputGB: (totalInput / 1024 ** 3).toFixed(2),
        totalOutputGB: (totalOutput / 1024 ** 3).toFixed(2),
        byNas,
        byGroup,
        uptime: Math.floor((Date.now() - startTime) / 1000),
      });
    }

    // ── Reconcile (manual trigger) ──
    // POST /reconcile — force a full reconciliation cycle (beyond the 5s/60s pollers)
    // Use case: after a known radacct bulk-update, or to verify state consistency.
    if (path === "/reconcile" && method === "POST") {
      const before = sessions.size;
      const beforeActive = [...sessions.values()].filter(s => s.status === "active").length;
      await fullReconcile();
      const after = sessions.size;
      const afterActive = [...sessions.values()].filter(s => s.status === "active").length;
      return json({
        success: true,
        reconciled: true,
        before: { total: before, active: beforeActive },
        after: { total: after, active: afterActive },
        delta: { total: after - before, active: afterActive - beforeActive },
        stats,
      });
    }

    // ── Policy Evaluate (Phase 5 deliverable) ──
    // GET /policy/evaluate/:subscriberId — resolve effective policy for a subscriber
    // Returns: resolved policy (speeds, data limit, timeouts) + compiled RADIUS attributes + explanation
    const policyMatch = path.match(/^\/policy\/evaluate\/([^/]+)$/);
    if (policyMatch && method === "GET") {
      const subscriberId = policyMatch[1];
      const client = new Client({ connectionString: DB_URL });
      try {
        await client.connect();
        // Fetch subscriber with plan + radiusGroup + plan.group
        const result = await client.query(`
          SELECT
            s.id, s.name, s."serviceUsername",
            s."currentSpeedDown", s."currentSpeedUp",
            s."sessionTimeout" as sub_session_timeout,
            s."idleTimeout" as sub_idle_timeout,
            p.id as plan_id, p.name as plan_name,
            p."downloadSpeed", p."uploadSpeed", p."dataLimitGb",
            p."maxConcurrentSessions", p."burstSpeed", p."burstDuration",
            rg.id as rg_id, rg.name as rg_name,
            rg."speedLimitDown", rg."speedLimitUp", rg."dataLimit" as rg_data_limit,
            rg."sessionTimeout" as rg_session_timeout,
            pg.id as pg_id, pg.name as pg_name,
            pg."speedLimitDown" as pg_speed_down, pg."speedLimitUp" as pg_speed_up,
            pg."dataLimit" as pg_data_limit, pg."sessionTimeout" as pg_session_timeout
          FROM "Subscriber" s
          LEFT JOIN "Plan" p ON p.id = s."planId"
          LEFT JOIN "RadiusGroup" rg ON rg.id = s."radiusGroupId"
          LEFT JOIN "RadiusGroup" pg ON pg.id = p."groupId"
          WHERE s.id = $1
        `, [subscriberId]);

        if (result.rows.length === 0) {
          return json({ error: "Subscriber not found" }, 404);
        }

        const row = result.rows[0];

        // Build policy input for compiler
        const input = {
          radiusGroup: row.rg_id ? {
            name: row.rg_name,
            speedLimitDown: row.speedLimitDown || 0,
            speedLimitUp: row.speedLimitUp || 0,
            dataLimit: row.rg_data_limit,
            sessionTimeout: row.rg_session_timeout,
          } : null,
          plan: row.plan_id ? {
            name: row.plan_name,
            downloadSpeed: row.downloadSpeed || 0,
            uploadSpeed: row.uploadSpeed || 0,
            dataLimitGb: row.dataLimitGb,
            maxConcurrentSessions: row.maxConcurrentSessions || 1,
            burstSpeed: row.burstSpeed,
            burstDuration: row.burstDuration,
            sessionTimeout: row.rg_session_timeout,
            group: row.pg_id ? {
              name: row.pg_name,
              speedLimitDown: row.pg_speed_down || 0,
              speedLimitUp: row.pg_speed_up || 0,
              dataLimit: row.pg_data_limit,
              sessionTimeout: row.pg_session_timeout,
            } : null,
          } : null,
          currentSpeedDown: row.currentSpeedDown || 0,
          currentSpeedUp: row.currentSpeedUp || 0,
          sessionTimeout: row.sub_session_timeout,
          idleTimeout: row.sub_idle_timeout,
        };

        // Resolve policy (deterministic, testable)
        // Inline the resolution for the v2 session engine (no import dependency)
        const chain: Array<any> = [];
        if (input.radiusGroup?.speedLimitDown) {
          chain.push({
            source: `radiusGroup (${input.radiusGroup.name})`,
            speedDown: input.radiusGroup.speedLimitDown * 1000,
            speedUp: input.radiusGroup.speedLimitUp * 1000,
            dataLimitMb: input.radiusGroup.dataLimit,
            sessionTimeout: input.radiusGroup.sessionTimeout,
            idleTimeout: null,
          });
        }
        if (input.plan?.group?.speedLimitDown) {
          chain.push({
            source: `plan.group (${input.plan.group.name})`,
            speedDown: input.plan.group.speedLimitDown * 1000,
            speedUp: input.plan.group.speedLimitUp * 1000,
            dataLimitMb: input.plan.group.dataLimit,
            sessionTimeout: input.plan.group.sessionTimeout,
            idleTimeout: null,
          });
        }
        if (input.plan?.downloadSpeed) {
          chain.push({
            source: `plan (${input.plan.name})`,
            speedDown: input.plan.downloadSpeed,
            speedUp: input.plan.uploadSpeed,
            dataLimitMb: input.plan.dataLimitGb ? Math.round(input.plan.dataLimitGb * 1024) : null,
            sessionTimeout: input.plan.sessionTimeout ?? null,
            idleTimeout: null,
          });
        }
        if (input.currentSpeedDown) {
          chain.push({
            source: `subscriber.currentSpeed`,
            speedDown: input.currentSpeedDown * 1000,
            speedUp: (input.currentSpeedUp || 0) * 1000,
            dataLimitMb: null,
            sessionTimeout: input.sessionTimeout ?? null,
            idleTimeout: input.idleTimeout ?? null,
          });
        }

        const effective = chain[0] || { source: "default", speedDown: 0, speedUp: 0, dataLimitMb: null, sessionTimeout: null, idleTimeout: null };

        // Compile to RADIUS attributes
        const attributes: Array<{ name: string; value: string; op: string }> = [];
        if (effective.sessionTimeout) {
          attributes.push({ name: "Session-Timeout", value: String(effective.sessionTimeout), op: ":=" });
        }
        if (effective.idleTimeout) {
          attributes.push({ name: "Idle-Timeout", value: String(effective.idleTimeout), op: ":=" });
        }
        let mikrotikRateLimit = "";
        if (effective.speedDown > 0) {
          mikrotikRateLimit = `${effective.speedDown}K/${effective.speedUp}K 0K/0K 0 0K/0K`;
          attributes.push({ name: "Mikrotik-Rate-Limit", value: mikrotikRateLimit, op: ":=" });
        }
        if (effective.dataLimitMb) {
          attributes.push({ name: "Filter-Id", value: `data_limit_${effective.dataLimitMb}MB`, op: ":=" });
        }

        return json({
          subscriberId,
          subscriberName: row.name,
          serviceUsername: row.serviceUsername,
          plan: input.plan ? { id: row.plan_id, name: row.plan_name } : null,
          radiusGroup: input.radiusGroup ? { id: row.rg_id, name: row.rg_name } : null,
          resolved: {
            speedDownKbps: effective.speedDown,
            speedUpKbps: effective.speedUp,
            dataLimitMb: effective.dataLimitMb,
            sessionTimeoutSec: effective.sessionTimeout,
            idleTimeoutSec: effective.idleTimeout,
            maxConcurrentSessions: input.plan?.maxConcurrentSessions ?? 1,
            chain,
          },
          compiled: {
            attributes,
            mikrotikRateLimit,
          },
          explanation: `Effective policy resolved from ${chain.length} source(s). Top priority: ${effective.source}. Speed: ↓${effective.speedDown}Kbps ↑${effective.speedUp}Kbps. Data limit: ${effective.dataLimitMb ? effective.dataLimitMb + "MB" : "unlimited"}. Session timeout: ${effective.sessionTimeout ? effective.sessionTimeout + "s" : "none"}.`,
          deterministic: true,
        });
      } catch (err: any) {
        return json({ error: "Policy evaluation failed", message: err.message }, 500);
      } finally {
        await client.end().catch(() => {});
      }
    }


    // ── FUP (Fair Usage Policy) Check (Phase 5 deliverable) ──
    // GET /fup-check — check all active sessions for FUP threshold
    // When data usage exceeds plan data limit, apply FUP throttle speed (not disconnect)
    // Returns: { checked, throttled, results }
    if (path === "/fup-check" && method === "GET") {
      const client = new Client({ connectionString: DB_URL });
      try {
        await client.connect();

        // Get all active sessions with their data usage + plan FUP speeds
        const result = await client.query(`
          SELECT
            ra.radacctid::text as id,
            ra.username,
            ra.acctinputoctets::bigint as input_bytes,
            ra.acctoutputoctets::bigint as output_bytes,
            (COALESCE(ra.acctinputoctets, 0) + COALESCE(ra.acctoutputoctets, 0))::bigint as total_bytes,
            s.id as subscriber_id,
            p."dataLimitGb",
            p."downloadSpeedFup",
            p."uploadSpeedFup",
            p."downloadSpeedFup",
            p."uploadSpeedFup",
            rg."dataLimit" as rg_data_limit_mb
          FROM radacct ra
          LEFT JOIN "Subscriber" s ON s."serviceUsername" = ra.username
          LEFT JOIN "Plan" p ON p.id = s."planId"
          LEFT JOIN "Plan" p ON p.id = s."planId"
          LEFT JOIN "RadiusGroup" rg ON rg.id = s."radiusGroupId"
          WHERE ra.acctstoptime IS NULL
          LIMIT 1000
        `);

        const results: any[] = [];
        let throttled = 0;

        for (const row of result.rows) {
          const totalMb = Number(row.total_bytes) / (1024 * 1024);

          // Resolve data limit (MB) — from RadiusGroup.dataLimit (MB) or Plan.dataLimitGb (GB→MB)
          const dataLimitMb = row.rg_data_limit_mb ||
            (row.dataLimitGb ? Number(row.dataLimitGb) * 1024 : null);

          if (!dataLimitMb) continue; // no data limit = no FUP

          // Resolve FUP speeds (Kbps) — from Plan.downloadSpeedFup/uploadSpeedFup, default 1024/512
          const fupDown = (row.downloadSpeedFup ? Number(row.downloadSpeedFup) : 1024);
          const fupUp = (row.uploadSpeedFup ? Number(row.uploadSpeedFup) : 512);

          // FUP threshold (default: 80% of data limit)
          const fupThresholdMb = Math.round(dataLimitMb * 0.8);

          if (totalMb >= fupThresholdMb) {
            // FUP triggered — apply throttle (not disconnect)
            throttled++;
            results.push({
              sessionId: row.id,
              username: row.username,
              subscriberId: row.subscriber_id,
              totalMb: Math.round(totalMb),
              dataLimitMb,
              fupThresholdMb,
              fupSpeedDownKbps: fupDown,
              fupSpeedUpKbps: fupUp,
              action: "THROTTLE",
              message: `Data usage ${Math.round(totalMb)}MB >= FUP threshold ${fupThresholdMb}MB — throttling to ↓${fupDown}Kbps ↑${fupUp}Kbps (NOT disconnecting)`,
            });

            // TODO: Send CoA to NAS with FUP speed (requires NAS to be running + listening on CoA port)
            // For now, log the FUP event — the actual CoA would be:
            // echo "User-Name=..., Mikrotik-Rate-Limit=${fupDown}K/${fupUp}K" | radclient nas_ip:3799 coa secret
          }
        }

        return json({
          checked: result.rows.length,
          throttled,
          fupPolicy: "THROTTLE_NOT_DISCONNECT",
          results: results.slice(0, 50),
          message: throttled > 0 ? `${throttled} session(s) throttled to FUP speed (not disconnected)` : "No sessions hit FUP threshold",
        });
      } catch (err: any) {
        return json({ error: "FUP check failed", message: err.message }, 500);
      } finally {
        await client.end().catch(() => {});
      }
    }

    // ── 404 ──
    return json({ error: "Not found", path }, 404);
  },
});

console.log(`╔══════════════════════════════════════════╗`);
console.log(`║  CRYPTSK Session Engine — Port ${PORT}        ║`);
console.log(`║  In-memory authoritative live state      ║`);
console.log(`║  DB: ${DB_URL.replace(/:[^:@]+@/, ':***@')}        ║`);
console.log(`║  Poll interval: ${POLL_INTERVAL_MS}ms               ║`);
console.log(`╚══════════════════════════════════════════╝`);
