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
        COALESCE(groupname, '') as groupname,
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
pollRadAcct(); // initial poll

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
    const { path, params } = parseUrl(req.url);
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
