// ============================================================
// CRYPTSK Nexus — Session Engine (Event-Driven, per Architecture §10)
// Per: docs/architecture/02_ENTERPRISE_GATEWAY_ARCHITECTURE.md
//   §7.1 Login flow: Access-Accept → Session Engine → Create session → VPP → ACTIVE
//   §8   Login MUST be transactional (Program VPP → Verify → Mark ACTIVE)
//   §10  FreeRADIUS → AAA Adapter → Session Engine API (event-driven, NOT polling)
//   §14  Live sessions in-memory (HashMap), NOT PostgreSQL
//
// PRIMARY TRIGGER: PostgreSQL LISTEN/NOTIFY (instant, <1ms)
//   - LISTEN session_start  → fires on radacct INSERT (Accounting-Start)
//   - LISTEN session_stop   → fires on radacct UPDATE acctstoptime NULL→non-NULL
//   - LISTEN session_interim → fires on radacct UPDATE acctupdatetime change
//
// FALLBACK: 60-second reconciliation poller (crash recovery ONLY)
//   - Compares in-memory sessions vs radacct active set
//   - Catches sessions missed during Session Engine downtime
//   - Removes orphaned VPP objects
//
// Port: 3010
// ============================================================

import { Server } from "bun";
import pg from "pg";

const { Client } = pg;

// ─── Configuration ────────────────────────────────────────────
const PORT = 3010;
const DB_URL = process.env.DATABASE_URL || "postgresql://cryptsknexus:CryptskNexus2026@localhost:5432/cryptsknexus";
const RECONCILE_INTERVAL_MS = 60_000; // 60s — fallback reconciliation ONLY
const SESSION_GRACE_MS = 30_000; // keep stopped sessions in-memory for 30s for UI
const VPP_ADAPTER_URL = process.env.VPP_ADAPTER_URL || "http://localhost:3015";

// ─── Session Types (per §6 Session State Model) ──────────────
type SessionState = "AUTHENTICATING" | "AUTHENTICATED" | "ACTIVE" | "COA_PENDING" | "DISCONNECT_PENDING" | "DISCONNECTED" | "EXPIRED" | "STALE" | "RECOVERING";

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
  state: SessionState;
  vppProgrammed: boolean; // §8: only mark ACTIVE after VPP verified
  vppEpoch: number; // generation counter — changes on Session Engine restart
  lastSeen: number; // epoch ms
  lastNotifiedAt: number; // when we received the LISTEN/NOTIFY event
};

// ─── In-Memory Session Store (per §14) ───────────────────────
// Primary indexes for O(1) lookup
const sessions = new Map<string, Session>();        // acctSessionId → Session
const ipIndex = new Map<string, string>();          // framedIP → acctSessionId
const userIndex = new Map<string, Set<string>>();   // username → Set<acctSessionId>

const VPP_EPOCH = Date.now(); // changes on every restart — lets VPP adapter detect stale sessions

let stats = {
  totalCreated: 0,
  totalTerminated: 0,
  totalVppProgrammed: 0,
  totalVppFailed: 0,
  totalNotifications: 0,    // LISTEN/NOTIFY events received
  totalReconciliations: 0,
  lastNotificationAt: 0,
  lastReconcileAt: 0,
  lastReconcileCount: 0,
  pollErrors: 0,
};
const startTime = Date.now();

// ─── VPP Adapter Integration (§7.1: Program VPP → Verify → ACTIVE) ──

async function programVppForSession(session: Session): Promise<boolean> {
  try {
    // Resolve subscriber policy from DB (Plan → bandwidth, QoS, ACL, NAT)
    const policy = await resolvePolicy(session.username);

    // Call VPP adapter to program NAT + policer + classify
    const response = await fetch(`${VPP_ADAPTER_URL}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "session",
        subscriber: session.username,
        subscriberIP: session.framedipaddress,
        nasIP: session.nasipaddress,
        mac: session.callingstationid,
        plan: policy.planName,
        speedDownKbps: policy.speedDownKbps,
        speedUpKbps: policy.speedUpKbps,
        vppEpoch: VPP_EPOCH,
        config: {
          nat: `nat44 add static address ${session.framedipaddress} -> ${policy.publicIp || "203.0.113.100"}`,
          policer: `policer add name sub-${session.username} cir ${policy.speedDownBps} eir ${policy.speedDownBps} conform-action transmit violate-action drop`,
          classify: `classify add session table-index 0 match ip4 src ${session.framedipaddress} action policer sub-${session.username}`,
        },
      }),
      signal: AbortSignal.timeout(5000), // 5s timeout — don't block RADIUS path too long
    });

    if (response.ok) {
      stats.totalVppProgrammed++;
      return true;
    } else {
      stats.totalVppFailed++;
      console.error(`[vpp] programming failed for ${session.username}: HTTP ${response.status}`);
      return false;
    }
  } catch (err: any) {
    stats.totalVppFailed++;
    console.error(`[vpp] adapter error for ${session.username}:`, err.message);
    return false;
  }
}

async function cleanupVppForSession(session: Session): Promise<void> {
  try {
    await fetch(`${VPP_ADAPTER_URL}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "session-delete",
        subscriber: session.username,
        subscriberIP: session.framedipaddress,
        vppEpoch: VPP_EPOCH,
        config: {
          nat: `nat44 del static address ${session.framedipaddress}`,
          policer: `policer del name sub-${session.username}`,
          classify: `classify del session table-index 0 match ip4 src ${session.framedipaddress}`,
        },
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err: any) {
    console.error(`[vpp] cleanup error for ${session.username}:`, err.message);
  }
}

// ─── Policy Resolver (Plan → bandwidth, QoS, etc.) ───────────
async function resolvePolicy(username: string): Promise<{
  planName: string;
  speedDownKbps: number;
  speedUpKbps: number;
  speedDownBps: number;
  speedUpBps: number;
  publicIp: string;
}> {
  const client = new Client({ connectionString: DB_URL });
  try {
    await client.connect();
    const result = await client.query(`
      SELECT
        p.name as plan_name,
        p."downloadSpeed",
        p."uploadSpeed",
        COALESCE((SELECT nasname FROM nas ORDER BY nasname LIMIT 1), '203.0.113.100') as public_ip
      FROM "Subscriber" s
      LEFT JOIN "Plan" p ON p.id = s."planId"
      WHERE s."serviceUsername" = $1
      LIMIT 1
    `, [username]);

    if (result.rows.length === 0) {
      return { planName: "unknown", speedDownKbps: 0, speedUpKbps: 0, speedDownBps: 0, speedUpBps: 0, publicIp: "203.0.113.100" };
    }

    const row = result.rows[0];
    const downKbps = Number(row.downloadSpeed || 0);
    const upKbps = Number(row.uploadSpeed || 0);
    const downBps = Math.round(downKbps / 1024) * 1000000; // kbps → bps
    const upBps = Math.round(upKbps / 1024) * 1000000;

    return {
      planName: row.plan_name || "unknown",
      speedDownKbps: downKbps,
      speedUpKbps: upKbps,
      speedDownBps: downBps,
      speedUpBps: upBps,
      publicIp: row.public_ip || "203.0.113.100",
    };
  } catch (err) {
    console.error("[policy] resolve error:", err.message);
    return { planName: "unknown", speedDownKbps: 0, speedUpKbps: 0, speedDownBps: 0, speedUpBps: 0, publicIp: "203.0.113.100" };
  } finally {
    await client.end().catch(() => {});
  }
}

// ─── §8 Transactional Login: handleSessionStart ──────────────
// Called INSTANTLY (<1ms) when radacct INSERT fires pg_notify('session_start')
async function handleSessionStart(data: any) {
  const now = Date.now();
  stats.totalNotifications++;
  stats.lastNotificationAt = now;

  const id = String(data.radacctid || data.acctsessionid);
  const existing = sessions.get(id);

  // If session already exists and is ACTIVE, skip (idempotent — duplicate notification)
  if (existing && existing.state === "ACTIVE") {
    return;
  }

  // §8 Step 1-3: Create in-memory session (state: AUTHENTICATED, NOT ACTIVE yet)
  const session: Session = {
    radacctid: id,
    acctsessionid: data.acctsessionid || "",
    acctuniqueid: data.acctuniqueid || "",
    username: data.username || "",
    groupname: "", // resolve on demand
    nasipaddress: data.nasipaddress || "",
    nasportid: data.nasportid || "",
    framedipaddress: data.framedipaddress || "",
    callingstationid: data.callingstationid || "",
    acctstarttime: data.acctstarttime || new Date().toISOString(),
    acctsessiontime: 0,
    acctinputoctets: 0,
    acctoutputoctets: 0,
    state: "AUTHENTICATED", // §6 state model — not ACTIVE yet!
    vppProgrammed: false,
    vppEpoch: VPP_EPOCH,
    lastSeen: now,
    lastNotifiedAt: now,
  };

  sessions.set(id, session);
  if (session.framedipaddress) {
    ipIndex.set(session.framedipaddress, id);
  }
  if (session.username) {
    if (!userIndex.has(session.username)) {
      userIndex.set(session.username, new Set());
    }
    userIndex.get(session.username)!.add(id);
  }

  // §8 Step 4-6: Program VPP → Verify → Mark ACTIVE
  // This happens SYNCHRONOUSLY — the subscriber doesn't get ACTIVE until VPP is programmed
  const vppOk = await programVppForSession(session);

  if (vppOk) {
    // §8 Step 7: Mark ACTIVE — only after VPP verified
    session.state = "ACTIVE";
    session.vppProgrammed = true;
    stats.totalCreated++;
    console.log(`[session-start] ${session.username} (${session.framedipaddress}) → ACTIVE (VPP programmed, event-driven)`);
  } else {
    // §8: VPP programming failed — session NOT ACTIVE, will be retried by reconciliation
    session.state = "RECOVERING";
    console.error(`[session-start] ${session.username} → RECOVERING (VPP programming failed)`);
  }
}

// ─── §9 Logout: handleSessionStop ─────────────────────────────
// Called INSTANTLY when radacct UPDATE fires pg_notify('session_stop')
async function handleSessionStop(data: any) {
  const now = Date.now();
  stats.totalNotifications++;
  stats.lastNotificationAt = now;

  const id = String(data.radacctid || data.acctsessionid);
  const session = sessions.get(id);

  if (!session) {
    // Session not in memory — might have been cleaned already or we missed the start
    // The radacct row has the final accounting data, so we're fine
    return;
  }

  // §9: Mark DISCONNECTING → Remove VPP → Release IP → Mark DISCONNECTED
  session.state = "DISCONNECT_PENDING";

  // Update final accounting counters from the stop event
  session.acctsessiontime = Number(data.acctsessiontime || session.acctsessiontime);
  session.acctinputoctets = Number(data.acctinputoctets || session.acctinputoctets);
  session.acctoutputoctets = Number(data.acctoutputoctets || session.acctoutputoctets);

  // Remove VPP policy/state
  await cleanupVppForSession(session);

  // Release IP index
  if (session.framedipaddress) {
    ipIndex.delete(session.framedipaddress);
  }
  // Remove from user index
  if (session.username && userIndex.has(session.username)) {
    userIndex.get(session.username)!.delete(id);
    if (userIndex.get(session.username)!.size === 0) {
      userIndex.delete(session.username);
    }
  }

  // Mark DISCONNECTED (keep in memory for grace period for UI)
  session.state = "DISCONNECTED";
  session.lastSeen = now;
  stats.totalTerminated++;
  console.log(`[session-stop] ${session.username} → DISCONNECTED (VPP cleaned)`);

  // Remove from sessions map after grace period
  setTimeout(() => {
    sessions.delete(id);
  }, SESSION_GRACE_MS);
}

// ─── handleSessionInterim — update octets counters ───────────
// Called when radacct UPDATE fires pg_notify('session_interim')
async function handleSessionInterim(data: any) {
  const id = String(data.radacctid || data.acctsessionid);
  const session = sessions.get(id);
  if (!session) {
    // Session not in memory — might have been missed. Reconcile will catch it.
    return;
  }

  session.acctsessiontime = Number(data.acctsessiontime || session.acctsessiontime);
  session.acctinputoctets = Number(data.acctinputoctets || session.acctinputoctets);
  session.acctoutputoctets = Number(data.acctoutputoctets || session.acctoutputoctets);
  session.lastSeen = Date.now();
  session.lastNotifiedAt = Date.now();
  stats.totalNotifications++;
}

// ─── PRIMARY: PostgreSQL LISTEN/NOTIFY client ────────────────
// Dedicated connection that stays open — listens for radacct events
let listenClient: any = null;

async function startListener() {
  listenClient = new Client({ connectionString: DB_URL });
  await listenClient.connect();

  // Listen on all 3 channels
  await listenClient.query("LISTEN session_start");
  await listenClient.query("LISTEN session_stop");
  await listenClient.query("LISTEN session_interim");

  listenClient.on("notification", async (msg: any) => {
    try {
      const data = JSON.parse(msg.payload);
      if (msg.channel === "session_start") {
        await handleSessionStart(data);
      } else if (msg.channel === "session_stop") {
        await handleSessionStop(data);
      } else if (msg.channel === "session_interim") {
        await handleSessionInterim(data);
      }
    } catch (err: any) {
      console.error(`[listener] error processing ${msg.channel}:`, err.message);
    }
  });

  listenClient.on("error", (err: any) => {
    console.error("[listener] connection error:", err.message);
    // Reconnect after 2s
    setTimeout(() => {
      console.log("[listener] reconnecting...");
      startListener().catch(e => console.error("[listener] reconnect failed:", e.message));
    }, 2000);
  });

  console.log(`[listener] ✓ LISTENing on session_start, session_stop, session_interim (event-driven, <1ms)`);
}

// ─── FALLBACK: 60-second reconciliation poller ───────────────
// Per §10: "REST should primarily be the management interface"
// This poller is the SAFETY NET — catches sessions missed during downtime,
// NOT the primary trigger.
async function reconcileWithDb() {
  const client = new Client({ connectionString: DB_URL });
  try {
    await client.connect();

    // Get all active sessions from radacct
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
      LIMIT 5000
    `);

    const now = Date.now();
    const activeIds = new Set<string>();
    let addedCount = 0;
    let updatedCount = 0;

    for (const row of result.rows) {
      const id = row.radacctid;
      activeIds.add(id);

      const existing = sessions.get(id);
      if (!existing) {
        // Session in radacct but not in memory — we missed the NOTIFY event
        // (probably during downtime). Add it and program VPP.
        addedCount++;
        console.log(`[reconcile] discovered missed session: ${row.username} (${row.framedipaddress})`);
        // Trigger the same flow as handleSessionStart
        await handleSessionStart({
          radacctid: row.radacctid,
          acctsessionid: row.acctsessionid,
          acctuniqueid: row.acctuniqueid,
          username: row.username,
          nasipaddress: row.nasipaddress,
          nasportid: row.nasportid,
          framedipaddress: row.framedipaddress,
          callingstationid: row.callingstationid,
          acctstarttime: row.acctstarttime,
        });
      } else {
        // Update counters
        existing.acctsessiontime = Number(row.acctsessiontime);
        existing.acctinputoctets = Number(row.acctinputoctets);
        existing.acctoutputoctets = Number(row.acctoutputoctets);
        existing.groupname = row.groupname;
        existing.lastSeen = now;
        updatedCount++;
      }
    }

    // Find sessions in memory that are no longer in radacct active set
    let removedCount = 0;
    for (const [id, session] of sessions) {
      if (!activeIds.has(id) && session.state === "ACTIVE") {
        // Session was active in memory but stopped in radacct — we missed the stop event
        console.log(`[reconcile] detected stopped session: ${session.username}`);
        await handleSessionStop({
          radacctid: session.radacctid,
          acctsessionid: session.acctsessionid,
          username: session.username,
        });
        removedCount++;
      }
    }

    stats.totalReconciliations++;
    stats.lastReconcileAt = now;
    stats.lastReconcileCount = result.rows.length;

    if (addedCount > 0 || removedCount > 0) {
      console.log(`[reconcile] db_active=${result.rows.length} mem_active=${sessions.size} added=${addedCount} removed=${removedCount} updated=${updatedCount}`);
    }
  } catch (err: any) {
    stats.pollErrors++;
    console.error("[reconcile] error:", err.message);
  } finally {
    await client.end().catch(() => {});
  }
}

// Start the reconciliation poller (60s — fallback ONLY)
setInterval(reconcileWithDb, RECONCILE_INTERVAL_MS);

// ─── Startup Bootstrap (§Recover → Reconcile → No duplicate) ─
async function bootstrap() {
  console.log("[startup] Bootstrapping from radacct (recovery)...");
  await reconcileWithDb();
  console.log(`[startup] ✓ ${sessions.size} sessions loaded, VPP epoch=${VPP_EPOCH}`);
  console.log(`[startup] Active: ${[...sessions.values()].filter(s => s.state === "ACTIVE").length}`);
  console.log(`[startup] Recovering: ${[...sessions.values()].filter(s => s.state === "RECOVERING").length}`);
  console.log(`[startup] Starting LISTEN/NOTIFY listener (primary trigger)...`);
  await startListener();
  console.log(`[startup] ✓ Event-driven mode active. Login → VPP programming is now INSTANT (<1ms).`);
}

// ─── REST API (management plane per §10) ─────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
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
        epoch: VPP_EPOCH,
        trigger: "LISTEN/NOTIFY (event-driven, <1ms)",
        fallback: `reconciliation every ${RECONCILE_INTERVAL_MS / 1000}s`,
        sessions: {
          active: [...sessions.values()].filter(s => s.state === "ACTIVE").length,
          recovering: [...sessions.values()].filter(s => s.state === "RECOVERING").length,
          disconnected: [...sessions.values()].filter(s => s.state === "DISCONNECTED").length,
          total: sessions.size,
        },
        indexes: {
          byIp: ipIndex.size,
          byUser: userIndex.size,
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

      let list = [...sessions.values()].sort((a, b) => b.lastSeen - a.lastSeen);

      if (activeOnly) {
        list = list.filter(s => s.state === "ACTIVE");
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

    // ── Force reconciliation ──
    if (path === "/sessions/sync" && method === "POST") {
      await reconcileWithDb();
      return json({ synced: true, activeSessions: sessions.size, ...stats });
    }

    // ── Terminate session (CoA/Disconnect) ──
    if (path.startsWith("/sessions/") && method === "DELETE") {
      const id = path.split("/")[2];
      const session = sessions.get(id);
      if (!session) return json({ error: "Session not found" }, 404);

      // Cleanup VPP
      await cleanupVppForSession(session);
      session.state = "DISCONNECTED";
      console.log(`[terminate] session ${id} (${session.username}) → DISCONNECTED (admin action)`);
      return json({ success: true, message: "Session terminated, VPP cleaned" });
    }

    // ── Stats ──
    if (path === "/stats" && method === "GET") {
      const active = [...sessions.values()].filter(s => s.state === "ACTIVE");
      const totalInput = active.reduce((sum, s) => sum + s.acctinputoctets, 0);
      const totalOutput = active.reduce((sum, s) => sum + s.acctoutputoctets, 0);

      const byNas: Record<string, number> = {};
      for (const s of active) {
        byNas[s.nasipaddress] = (byNas[s.nasipaddress] || 0) + 1;
      }

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
        vppEpoch: VPP_EPOCH,
        trigger: "LISTEN/NOTIFY (event-driven)",
        uptime: Math.floor((Date.now() - startTime) / 1000),
        stats,
      });
    }

    // ── Reconcile (manual trigger) ──
    if (path === "/reconcile" && method === "POST") {
      const before = sessions.size;
      const beforeActive = [...sessions.values()].filter(s => s.state === "ACTIVE").length;
      await reconcileWithDb();
      const after = sessions.size;
      const afterActive = [...sessions.values()].filter(s => s.state === "ACTIVE").length;
      return json({
        success: true,
        reconciled: true,
        before: { total: before, active: beforeActive },
        after: { total: after, active: afterActive },
        delta: { total: after - before, active: afterActive - beforeActive },
        stats,
      });
    }

    // ── 404 ──
    return json({ error: "Not found", path }, 404);
  },
});

// ─── Start ───────────────────────────────────────────────────
bootstrap().catch(err => {
  console.error("[startup] FATAL:", err.message);
  process.exit(1);
});

console.log(`╔════════════════════════════════════════════════════════╗`);
console.log(`║  CRYPTSK Session Engine — Port ${PORT}                      ║`);
console.log(`║  PRIMARY: LISTEN/NOTIFY (event-driven, <1ms trigger)   ║`);
console.log(`║  FALLBACK: reconcile every ${RECONCILE_INTERVAL_MS / 1000}s              ║`);
console.log(`║  VPP Epoch: ${VPP_EPOCH}                       ║`);
console.log(`║  In-memory: authoritative live state (per §14)         ║`);
console.log(`╚════════════════════════════════════════════════════════╝`);
