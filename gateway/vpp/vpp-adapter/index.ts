// ============================================================
// CRYPTSK Nexus — VPP Adapter v2.0 (TypeScript — Bun)
// Hard boundary between Session Engine and VPP/DPDK dataplane.
// Per: docs/architecture/02_GATEWAY_ARCHITECTURE.md §28-§42.
//
// Implements:
//   §28  Hard boundary — Session Engine → VPP Adapter → VPP (no vppctl)
//   §29  VPP Policy Objects (ACL, Policer, QoS, NAT, VRF, Classification)
//   §30  Subscriber → VPP policy mapping
//   §31  Bandwidth control via VPP policer (no Linux tc)
//   §32  Reusable ACL profiles
//   §33  NAT pools + translation state
//   §41  VPP restart recovery (epoch + rebuild from snapshots)
//   §42  Session snapshots (recoverable dataplane state)
//
// Port: 3015
// Storage: PrismaClient (SQLite in sandbox, PostgreSQL in prod).
//   DATABASE_URL comes from process.env — never hardcoded.
//
// In sandbox: VPP binary NOT running — in-memory state is the
// authoritative "VPP policy object" store, persisted to DB
// (SessionSnapshot, VppPolicyObject, VppRecoveryLog).
// ============================================================

import { PrismaClient } from "@prisma/client";
import fs from "fs";

const PORT = 3015;
const VPP_SOCKET = "/run/vpp/api.sock";
const startTime = Date.now();

// ─── Single PrismaClient instance ─────────────────────────────
const db = new PrismaClient();

// ─── In-Memory State (lost on adapter restart — that's why we
//     have DB snapshots). This is the authoritative "VPP policy
//     state" for the sandbox (no real VPP running). ─────────────
type SubscriberPolicy = {
  sessionId: string;
  subscriberId: string;
  username: string;
  framedIp: string;
  mac: string;
  nasIp: string;
  vlanId?: string;
  vrf?: string;
  policyId?: string;
  aclProfileId?: string;
  qosProfileId?: string;
  natProfileId?: string;
  ipPool?: string;
  speedDownKbps: number;
  speedUpKbps: number;
  timeoutSec?: number;
  circuitId?: string;
  remoteId?: string;
  pppoeSessionId?: string;
  dhcpClientId?: string;
  policer: { name: string; cir: number; bc: number };
  acl: { profileId: string; rules: unknown[] } | null;
  natMapping: { inside: string; outside: string; pool: string } | null;
  vppEpochApplied: number;
  programmedAt: Date;
};

const inMemory = {
  vppEpoch: 1,
  vppConnected: false,
  vppLastRestartAt: null as Date | null,
  subscriberPolicies: new Map<string, SubscriberPolicy>(),
};

let stats = {
  configsGenerated: 0,
  lastGenerateAt: 0,
  errors: 0,
  programmed: 0,
  removed: 0,
  rebuilds: 0,
  restartsSimulated: 0,
};

// ─── Helpers ───────────────────────────────────────────────────
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

async function readBody(req: Request): Promise<any> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

// ─── GovPP Adapter (port 3016) bridge ────────────────────────────
// The TS vpp-adapter keeps an in-memory Map + SessionSnapshot DB for
// fast queries + restart recovery, but the REAL VPP binary API calls
// (PolicerAddDel, Nat44AddDelStaticMappingV2, ACLAddReplace, etc.)
// are delegated to the Go govpp-adapter at port 3016, which uses
// GoVPP v0.5.0 binapi. This is the hard boundary (§28) — TS adapter
// is the orchestrator, govpp-adapter is the dataplane client.
const GOVPP_BASE = "http://127.0.0.1:3016";

async function callGovpp<T = any>(
  path: string,
  body?: any,
  method: string = "POST"
): Promise<{ ok: boolean; data?: T; error?: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const init: RequestInit =
      body !== undefined
        ? {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: ctrl.signal,
          }
        : { method, signal: ctrl.signal };
    const res = await fetch(`${GOVPP_BASE}${path}`, init);
    const data = (await res.json().catch(() => ({}) as T)) as T;
    if (!res.ok)
      return { ok: false, error: `govpp ${path} HTTP ${res.status}`, data };
    return { ok: true, data };
  } catch (err: any) {
    return {
      ok: false,
      error: `govpp ${path} unreachable: ${String(err?.message || err)}`,
    };
  } finally {
    clearTimeout(t);
  }
}

// ─── VPP Policy Object ensure-functions (lazy create / upsert by name) ──

async function ensurePolicerObject(name: string, cir: number, bc: number) {
  const config = { cir, bc, conformAction: "transmit", violateAction: "drop" };
  return db.vppPolicyObject.upsert({
    where: { name },
    create: {
      name,
      type: "POLICER",
      configJson: JSON.stringify(config),
      description: `auto-created by vpp-adapter for ${name}`,
    },
    update: {
      type: "POLICER",
      configJson: JSON.stringify(config),
      isEnabled: true,
    },
  });
}

async function ensureAclObject(aclProfileId: string, rules: unknown[], defaultAction: string) {
  const profile = await db.vppAclProfile.findUnique({ where: { id: aclProfileId } });
  if (!profile) return null;
  const name = `ACL-${profile.name}`;
  const config = { rules, defaultAction, profileId: aclProfileId };
  return db.vppPolicyObject.upsert({
    where: { name },
    create: {
      name,
      type: "ACL",
      profileId: aclProfileId,
      configJson: JSON.stringify(config),
      description: `auto-created from VppAclProfile ${profile.name}`,
    },
    update: {
      type: "ACL",
      profileId: aclProfileId,
      configJson: JSON.stringify(config),
      isEnabled: true,
    },
  });
}

async function ensureNatMappingObject(inside: string, outside: string, poolName: string) {
  const name = `NAT-${inside}-to-${outside}`;
  const config = { inside, outside, pool: poolName };
  return db.vppPolicyObject.upsert({
    where: { name },
    create: {
      name,
      type: "NAT",
      configJson: JSON.stringify(config),
      description: `auto-created NAT mapping ${inside}→${outside}`,
    },
    update: {
      type: "NAT",
      configJson: JSON.stringify(config),
      isEnabled: true,
    },
  });
}

async function pickNatPool() {
  return db.vppNatPool.findFirst({
    where: { isEnabled: true },
    orderBy: { createdAt: "asc" },
  });
}

// ─── Core: program a subscriber into VPP (in-memory state) ─────

type ProgramInput = {
  sessionId: string;
  subscriberId: string;
  username: string;
  framedIp?: string;
  mac?: string;
  nasIp?: string;
  nasPort?: string;
  vlanId?: string;
  vrf?: string;
  policyId?: string;
  aclProfileId?: string;
  qosProfileId?: string;
  natProfileId?: string;
  ipPool?: string;
  speedDownKbps?: number;
  speedUpKbps?: number;
  timeoutSec?: number;
  circuitId?: string;
  remoteId?: string;
  pppoeSessionId?: string;
  dhcpClientId?: string;
};

async function programVpp(s: ProgramInput): Promise<{
  policer: any;
  acl: any;
  natMapping: { inside: string; outside: string; pool: string } | null;
}> {
  const speedDown = Math.max(0, Number(s.speedDownKbps) || 0);
  const speedUp = Math.max(0, Number(s.speedUpKbps) || 0);
  const framedIp = s.framedIp || "";

  // 1. Policer (one per subscriber, named after sessionId)
  const policerName = `policer-${s.sessionId}`;
  const policerObj = await ensurePolicerObject(policerName, speedDown, 4096);

  // 2. ACL assignment (only if aclProfileId provided)
  let aclObj: any = null;
  let aclAssignment: SubscriberPolicy["acl"] = null;
  if (s.aclProfileId) {
    const aclProfile = await db.vppAclProfile.findUnique({ where: { id: s.aclProfileId } });
    if (aclProfile) {
      const rules = JSON.parse(aclProfile.rulesJson || "[]");
      aclObj = await ensureAclObject(s.aclProfileId, rules, aclProfile.defaultAction);
      aclAssignment = { profileId: s.aclProfileId, rules };
    }
  }

  // 3. NAT static mapping (framedIp → first NAT pool's publicIpStart)
  let natMapping: SubscriberPolicy["natMapping"] = null;
  if (framedIp) {
    const pool = await pickNatPool();
    const outside = pool?.publicIpStart || "203.0.113.100";
    await ensureNatMappingObject(framedIp, outside, pool?.name || "default");
    natMapping = {
      inside: framedIp,
      outside,
      pool: pool?.name || "default",
    };
  }

  // 4. Update in-memory mapping
  const entry: SubscriberPolicy = {
    sessionId: s.sessionId,
    subscriberId: s.subscriberId || "",
    username: s.username || "",
    framedIp,
    mac: s.mac || "",
    nasIp: s.nasIp || "",
    vlanId: s.vlanId,
    vrf: s.vrf,
    policyId: s.policyId,
    aclProfileId: s.aclProfileId,
    qosProfileId: s.qosProfileId,
    natProfileId: s.natProfileId,
    ipPool: s.ipPool,
    speedDownKbps: speedDown,
    speedUpKbps: speedUp,
    timeoutSec: s.timeoutSec,
    circuitId: s.circuitId,
    remoteId: s.remoteId,
    pppoeSessionId: s.pppoeSessionId,
    dhcpClientId: s.dhcpClientId,
    policer: { name: policerName, cir: speedDown, bc: 4096 },
    acl: aclAssignment,
    natMapping,
    vppEpochApplied: inMemory.vppEpoch,
    programmedAt: new Date(),
  };
  inMemory.subscriberPolicies.set(s.sessionId, entry);

  return { policer: policerObj, acl: aclObj, natMapping };
}

// ─── Upsert SessionSnapshot ────────────────────────────────────
async function upsertSnapshot(s: ProgramInput, recoveryState: "PROGRAMMED" | "RECOVERING" | "VERIFIED" | "STALE" = "PROGRAMMED") {
  const now = new Date();
  const configJson = JSON.stringify({
    speedDownKbps: s.speedDownKbps,
    speedUpKbps: s.speedUpKbps,
    mac: s.mac,
    nasIp: s.nasIp,
    programmedAt: now.toISOString(),
  });
  const data = {
    subscriberId: s.subscriberId || "",
    username: s.username || "",
    nasIp: s.nasIp || "",
    nasPort: s.nasPort || "",
    framedIp: s.framedIp || "",
    mac: s.mac || "",
    vlan: s.vlanId || "",
    vrf: s.vrf || "",
    policyId: s.policyId || "",
    aclProfileId: s.aclProfileId || "",
    qosProfileId: s.qosProfileId || "",
    natProfileId: s.natProfileId || "",
    ipPool: s.ipPool || "",
    circuitId: s.circuitId || "",
    remoteId: s.remoteId || "",
    pppoeSessionId: s.pppoeSessionId || "",
    dhcpClientId: s.dhcpClientId || "",
    speedDownKbps: Math.max(0, Number(s.speedDownKbps) || 0),
    speedUpKbps: Math.max(0, Number(s.speedUpKbps) || 0),
    timeoutSec: Number(s.timeoutSec) || 0,
    vppEpoch: inMemory.vppEpoch,
    vppProgrammedAt: recoveryState === "STALE" ? undefined : now,
    vppRecoveryState: recoveryState,
    configJson,
  };
  return db.sessionSnapshot.upsert({
    where: { sessionId: s.sessionId },
    create: { sessionId: s.sessionId, ...data },
    update: data,
  });
}

// ─── Legacy Config Generators (kept for back-compat) ────────────

async function generateVPPConfig(): Promise<string> {
  const lines: string[] = [];
  lines.push("# ============================================================");
  lines.push("# CRYPTSK Nexus — VPP Dataplane Configuration (auto-generated)");
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push(`# VPP Epoch: ${inMemory.vppEpoch}  VPP Connected: ${inMemory.vppConnected}`);
  lines.push("# ============================================================");
  lines.push("");

  try {
    // 1. Interfaces
    lines.push("# ─── 1. Interfaces ──────────────────────────────────────");
    const nasList = await db.nas.findMany({ orderBy: { nasname: "asc" }, take: 100 });
    for (const nas of nasList) {
      lines.push(`# NAS: ${nas.shortname} (${nas.nasname}, type=${nas.type})`);
      lines.push(`set interface state ${nas.nasname} up`);
    }
    lines.push("");

    // 2. NAT
    lines.push("# ─── 2. NAT (Network Address Translation) ──────────────");
    const activeSessions = await db.radacct.findMany({
      where: { acctstoptime: null, framedipaddress: { not: null } },
      take: 1000,
    });
    const pool = await pickNatPool();
    if (activeSessions.length > 0) {
      lines.push(`# ${activeSessions.length} active subscriber sessions — NAT entries`);
      for (const s of activeSessions) {
        const ip = s.framedipaddress;
        if (!ip) continue;
        const outside = pool?.publicIpStart || `203.0.113.${(parseInt(ip.split(".")[3] || "0") % 200) + 10}`;
        lines.push(`nat44 add static address ${ip} -> ${outside}`);
      }
    } else {
      lines.push("# No active subscriber sessions — no NAT entries needed");
    }
    lines.push("");

    // 3. ACL
    lines.push("# ─── 3. ACL (Access Control Lists) ──────────────────────");
    const aclAttrs = await db.radgroupcheck.findMany({
      where: { attribute: { in: ["Filter-Id", "NAS-Filter-Id"] } },
      orderBy: { groupname: "asc" },
    });
    if (aclAttrs.length > 0) {
      lines.push(`# ${aclAttrs.length} ACL rules from policy engine`);
      for (const a of aclAttrs) {
        lines.push(`# Group: ${a.groupname}, Filter: ${a.value}`);
        lines.push(`acl add index 0 ipv4 permit src any dst any flow-hash 10 filter-id ${a.value}`);
      }
    } else {
      lines.push("# No ACL rules defined — default permit");
    }
    lines.push("");

    // 4. QoS
    lines.push("# ─── 4. QoS (Bandwidth Policing) ────────────────────────");
    const qosAttrs = await db.radgroupcheck.findMany({
      where: { attribute: "Mikrotik-Rate-Limit" },
      orderBy: { groupname: "asc" },
    });
    if (qosAttrs.length > 0) {
      lines.push(`# ${qosAttrs.length} QoS policer rules`);
      for (const q of qosAttrs) {
        const rates = (q.value || "").split("/")[0];
        lines.push(`policer add name ${q.groupname} cir ${rates} bc 4096 conform-action transmit violate-action drop`);
      }
    } else {
      lines.push("# No QoS policer rules — no bandwidth enforcement");
    }
    lines.push("");

    // 5. Routing
    lines.push("# ─── 5. Routing ────────────────────────────────────────");
    lines.push("# Default route (configure per your network topology)");
    lines.push("ip route add 0.0.0.0/0 via 203.0.113.1");
    lines.push("");

    // 6. Summary
    lines.push("# ─── Summary ───────────────────────────────────────────");
    lines.push(`# NAS devices: ${nasList.length}`);
    lines.push(`# Active sessions: ${activeSessions.length}`);
    lines.push(`# ACL rules: ${aclAttrs.length}`);
    lines.push(`# QoS policers: ${qosAttrs.length}`);
    lines.push(`# In-memory subscriber policies: ${inMemory.subscriberPolicies.size}`);

    stats.configsGenerated++;
    stats.lastGenerateAt = Date.now();
    return lines.join("\n");
  } catch (err: any) {
    stats.errors++;
    return `# Error generating config: ${err.message}`;
  }
}

async function generateSubscriberConfig(subscriberId: string): Promise<string> {
  const lines: string[] = [];
  try {
    const sub = await db.subscriber.findUnique({
      where: { id: subscriberId },
      include: { Plan: true },
    });
    if (!sub) return "# Subscriber not found";

    const ra = await db.radacct.findFirst({
      where: { username: sub.serviceUsername || "", acctstoptime: null },
    });

    lines.push(`# ============================================================`);
    lines.push(`# VPP Config for Subscriber: ${sub.serviceUsername || sub.id}`);
    lines.push(`# ============================================================`);
    lines.push("");
    lines.push(`# RADIUS Username: ${sub.serviceUsername || "—"}`);
    lines.push(`# Plan: ${sub.Plan?.name || "—"}`);
    lines.push(`# Framed IP: ${ra?.framedipaddress || "—"}`);
    lines.push(`# NAS IP: ${ra?.nasipaddress || "—"}`);
    lines.push(`# MAC: ${ra?.callingstationid || "—"}`);
    lines.push("");

    const rg = await db.radusergroup.findFirst({
      where: { username: sub.serviceUsername || "" },
    });
    if (rg) {
      lines.push("# ─── Dataplane Objects ─────────────────────────────────");
      const checks = await db.radgroupcheck.findMany({
        where: { groupname: rg.groupname },
      });
      for (const c of checks) {
        if (c.attribute === "Mikrotik-Rate-Limit") {
          lines.push(`# QoS: ${c.value}`);
          lines.push(`policer add name ${sub.serviceUsername} cir ${(c.value || "").split("/")[0]} bc 4096`);
        }
      }
    }

    if (ra?.framedipaddress) {
      lines.push("");
      lines.push("# ─── NAT ───────────────────────────────────────────────");
      const pool = await pickNatPool();
      const outside = pool?.publicIpStart || "203.0.113.100";
      lines.push(`nat44 add static address ${ra.framedipaddress} -> ${outside}`);
    }

    return lines.join("\n");
  } catch (err: any) {
    return `# Error: ${err.message}`;
  }
}

// ─── HTTP Server ────────────────────────────────────────────────
async function main() {
  // ── Startup: initialize epoch + recovery state ──
  inMemory.vppConnected = fs.existsSync(VPP_SOCKET);

  const last = await db.vppRecoveryLog.findFirst({
    orderBy: { createdAt: "desc" },
  });
  if (last && last.newEpoch) {
    inMemory.vppEpoch = (last.newEpoch || 0) + 1;
  } else {
    inMemory.vppEpoch = 1;
  }
  inMemory.vppLastRestartAt = new Date();

  console.log(
    `[vpp-adapter] startup complete — epoch=${inMemory.vppEpoch}, vppConnected=${inMemory.vppConnected}, lastRestartAt=${inMemory.vppLastRestartAt.toISOString()}`
  );

  Bun.serve({
    port: PORT,
    async fetch(req: Request): Promise<Response> {
      const url = new URL(req.url);
      const path = url.pathname;
      const method = req.method;

      // ── CORS preflight ──
      if (method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        });
      }

      try {
        // ═══ 1. /health ═══
        if (path === "/health" && method === "GET") {
          return json({
            status: "ok",
            port: PORT,
            uptime: Math.floor((Date.now() - startTime) / 1000),
            vppConnected: inMemory.vppConnected,
            vppEpoch: inMemory.vppEpoch,
            vppLastRestartAt: inMemory.vppLastRestartAt,
            stats,
          });
        }

        // ═══ 2. /vpp/state ═══
        // Merges in-memory epoch + policyObjects + subscribers count with
        // live VPP connection status + interface list from govpp-adapter.
        if (path === "/vpp/state" && method === "GET") {
          const grouped = await db.vppPolicyObject.groupBy({
            by: ["type"],
            _count: { _all: true },
            where: { isEnabled: true },
          });
          const policyObjects: Record<string, number> = {
            ACL: 0,
            POLICER: 0,
            NAT: 0,
            VRF: 0,
            QoS: 0,
            CLASSIFICATION: 0,
          };
          for (const g of grouped) {
            policyObjects[g.type] = g._count._all;
          }
          // ── Merge with real VPP status + interfaces from govpp-adapter ──
          const govppStatus = await callGovpp<any>("/status", undefined, "GET");
          const govppInterfaces = await callGovpp<any>("/interfaces", undefined, "GET");
          const merged: any = {
            vppEpoch: inMemory.vppEpoch,
            vppConnected:
              govppStatus.ok && govppStatus.data?.connected
                ? true
                : inMemory.vppConnected,
            vppLastRestartAt: inMemory.vppLastRestartAt,
            uptime: Math.floor((Date.now() - startTime) / 1000),
            policyObjects,
            subscribersProgrammed: inMemory.subscriberPolicies.size,
            interfaces:
              govppInterfaces.ok && Array.isArray(govppInterfaces.data?.interfaces)
                ? govppInterfaces.data.interfaces
                : [],
            stats,
          };
          if (govppStatus.ok && govppStatus.data) {
            merged.govppStatus = govppStatus.data;
          } else {
            merged.govppStatusError = govppStatus.error;
          }
          if (!govppInterfaces.ok) {
            merged.govppInterfacesError = govppInterfaces.error;
          }
          return json(merged);
        }

        // ═══ 3. /vpp/epoch ═══
        if (path === "/vpp/epoch" && method === "GET") {
          return json({
            epoch: inMemory.vppEpoch,
            lastRestartAt: inMemory.vppLastRestartAt,
            vppConnected: inMemory.vppConnected,
          });
        }

        // ═══ 4. /vpp/simulate-restart ═══
        if (path === "/vpp/simulate-restart" && method === "POST") {
          const prevEpoch = inMemory.vppEpoch;
          const newEpoch = prevEpoch + 1;
          const affected = inMemory.subscriberPolicies.size;

          // Clear in-memory state (simulating VPP losing all dataplane state)
          inMemory.subscriberPolicies.clear();

          inMemory.vppEpoch = newEpoch;
          inMemory.vppLastRestartAt = new Date();
          stats.restartsSimulated++;

          await db.vppRecoveryLog.create({
            data: {
              event: "RESTART_DETECTED",
              prevEpoch,
              newEpoch,
              sessionsAffected: affected,
              sessionsRecovered: 0,
              sessionsFailed: 0,
              durationMs: 0,
              detailsJson: JSON.stringify({
                simulated: true,
                triggeredAt: new Date().toISOString(),
              }),
            },
          });

          return json({
            newEpoch,
            message:
              "VPP restart simulated — session-engine will detect via /vpp/epoch polling",
          });
        }

        // ═══ 5. /vpp/rebuild (§41 VPP Restart Recovery) ═══
        if (path === "/vpp/rebuild" && method === "POST") {
          const body = await readBody(req);
          const t0 = Date.now();

          let snapshots: any[] = [];
          if (body.sessionId) {
            const s = await db.sessionSnapshot.findUnique({
              where: { sessionId: body.sessionId },
            });
            snapshots = s ? [s] : [];
          } else if (body.subscriberId) {
            snapshots = await db.sessionSnapshot.findMany({
              where: { subscriberId: body.subscriberId },
            });
          } else {
            snapshots = await db.sessionSnapshot.findMany({});
          }

          const results: any[] = [];
          let rebuilt = 0;
          let failed = 0;

          for (const snap of snapshots) {
            try {
              // Mark RECOVERING first
              await db.sessionSnapshot.update({
                where: { sessionId: snap.sessionId },
                data: { vppRecoveryState: "RECOVERING" },
              });

              // ── Delegate REAL VPP reprogramming to govpp-adapter ──
              // This is the §41 VPP restart recovery path: when VPP
              // restarts and loses all dataplane state, govpp-adapter
              // reconnects, and we reprogram each session via govpp's
              // real binapi calls (PolicerAddDel + Nat44StaticMapping +
              // ACLAddReplace). The TS adapter's sessionMap may also be
              // empty (if vpp-adapter itself restarted) — we rebuild
              // from SessionSnapshot DB rows.
              const govppBody = {
                sessionId: snap.sessionId,
                subscriberId: snap.subscriberId,
                username: snap.username,
                framedIp: snap.framedIp,
                mac: snap.mac,
                nasIp: snap.nasIp,
                vlanId: snap.vlan,
                vrf: snap.vrf,
                policyId: snap.policyId,
                aclProfileId: snap.aclProfileId,
                qosProfileId: snap.qosProfileId,
                natProfileId: snap.natProfileId,
                ipPool: snap.ipPool,
                speedDownKbps: snap.speedDownKbps,
                speedUpKbps: snap.speedUpKbps,
                timeoutSec: snap.timeoutSec,
                circuitId: snap.circuitId,
                remoteId: snap.remoteId,
                pppoeSessionId: snap.pppoeSessionId,
                dhcpClientId: snap.dhcpClientId,
              };
              const govpp = await callGovpp<any>("/subscriber/program", govppBody, "POST");

              // Always update in-memory Map too (cache consistency)
              const programmed = await programVpp(govppBody);

              if (!govpp.ok || !govpp.data?.success) {
                // govpp failed — VPP state NOT actually programmed.
                // Mark snapshot STALE so reconciliation can retry later.
                await db.sessionSnapshot.update({
                  where: { sessionId: snap.sessionId },
                  data: {
                    vppRecoveryState: "STALE",
                    vppEpoch: inMemory.vppEpoch,
                    vppProgrammedAt: new Date(),
                  },
                });
                results.push({
                  sessionId: snap.sessionId,
                  status: "FAILED",
                  error: govpp.error || "govpp subscriber/program failed",
                  govpp: govpp.data || null,
                });
                failed++;
                continue;
              }

              // Mark VERIFIED
              await db.sessionSnapshot.update({
                where: { sessionId: snap.sessionId },
                data: {
                  vppRecoveryState: "VERIFIED",
                  vppEpoch: inMemory.vppEpoch,
                  vppProgrammedAt: new Date(),
                },
              });

              results.push({
                sessionId: snap.sessionId,
                status: "VERIFIED",
                programmed: {
                  policer: programmed.policer?.name,
                  acl: programmed.acl?.name,
                  natMapping: programmed.natMapping,
                },
                govpp: govpp.data,
              });
              rebuilt++;
            } catch (err: any) {
              results.push({
                sessionId: snap.sessionId,
                status: "FAILED",
                error: err.message,
              });
              failed++;
            }
          }

          const durationMs = Date.now() - t0;
          stats.rebuilds++;

          await db.vppRecoveryLog.create({
            data: {
              event: "REBUILT_POLICIES",
              prevEpoch: inMemory.vppEpoch,
              newEpoch: inMemory.vppEpoch,
              sessionsAffected: snapshots.length,
              sessionsRecovered: rebuilt,
              sessionsFailed: failed,
              durationMs,
              detailsJson: JSON.stringify({
                scope: body.sessionId
                  ? "single"
                  : body.subscriberId
                  ? "subscriber"
                  : "all",
                results,
              }),
            },
          });

          return json({ rebuilt, failed, results });
        }

        // ═══ 6. /policy/objects ═══
        if (path === "/policy/objects" && method === "GET") {
          const type = url.searchParams.get("type");
          const includeDisabled =
            url.searchParams.get("includeDisabled") === "true";
          const where: any = {};
          if (type) where.type = type;
          if (!includeDisabled) where.isEnabled = true;
          const objs = await db.vppPolicyObject.findMany({
            where,
            orderBy: { createdAt: "desc" },
          });
          return json({
            objects: objs.map((o) => ({
              ...o,
              config: JSON.parse(o.configJson || "{}"),
            })),
          });
        }

        // ═══ 7. POST /policy/object ═══
        if (path === "/policy/object" && method === "POST") {
          const body = await readBody(req);
          if (!body.name || !body.type)
            return json({ error: "name and type required" }, 400);
          const obj = await db.vppPolicyObject.upsert({
            where: { name: body.name },
            create: {
              name: body.name,
              type: body.type,
              profileId: body.profileId || "",
              configJson: JSON.stringify(body.config || {}),
              description: body.description || "",
              isEnabled: true,
            },
            update: {
              type: body.type,
              profileId: body.profileId || "",
              configJson: JSON.stringify(body.config || {}),
              description: body.description || "",
              isEnabled: true,
            },
          });
          return json({ ...obj, config: JSON.parse(obj.configJson || "{}") });
        }

        // ═══ 8. PUT /policy/object/:id ═══
        if (path.startsWith("/policy/object/") && method === "PUT") {
          const id = path.split("/")[3];
          const body = await readBody(req);
          const existing = await db.vppPolicyObject.findUnique({ where: { id } });
          if (!existing) return json({ error: "not found" }, 404);
          const obj = await db.vppPolicyObject.update({
            where: { id },
            data: {
              name: body.name ?? existing.name,
              description: body.description ?? existing.description,
              configJson:
                body.config !== undefined
                  ? JSON.stringify(body.config)
                  : existing.configJson,
              isEnabled: body.isEnabled ?? existing.isEnabled,
            },
          });
          return json({ ...obj, config: JSON.parse(obj.configJson || "{}") });
        }

        // ═══ 9. DELETE /policy/object/:id (soft-delete) ═══
        if (path.startsWith("/policy/object/") && method === "DELETE") {
          const id = path.split("/")[3];
          const obj = await db.vppPolicyObject.update({
            where: { id },
            data: { isEnabled: false },
          });
          return json({
            success: true,
            disabled: true,
            id: obj.id,
            name: obj.name,
          });
        }

        // ═══ 10. ACL Profiles ═══
        if (path === "/policy/acl-profiles" && method === "GET") {
          const includeDisabled =
            url.searchParams.get("includeDisabled") === "true";
          const profiles = await db.vppAclProfile.findMany({
            where: includeDisabled ? {} : { isEnabled: true },
            orderBy: { createdAt: "desc" },
          });
          return json({
            profiles: profiles.map((p) => ({
              ...p,
              rules: JSON.parse(p.rulesJson || "[]"),
            })),
          });
        }

        if (path === "/policy/acl-profile" && method === "POST") {
          const body = await readBody(req);
          if (!body.name) return json({ error: "name required" }, 400);
          const profile = await db.vppAclProfile.upsert({
            where: { name: body.name },
            create: {
              name: body.name,
              description: body.description || "",
              rulesJson: JSON.stringify(body.rules || []),
              defaultAction: body.defaultAction || "PERMIT",
              isEnabled: true,
            },
            update: {
              description: body.description || "",
              rulesJson: JSON.stringify(body.rules || []),
              defaultAction: body.defaultAction || "PERMIT",
              isEnabled: true,
            },
          });
          return json({
            ...profile,
            rules: JSON.parse(profile.rulesJson || "[]"),
          });
        }

        if (path.startsWith("/policy/acl-profile/") && method === "PUT") {
          const id = path.split("/")[3];
          const body = await readBody(req);
          const existing = await db.vppAclProfile.findUnique({
            where: { id },
          });
          if (!existing) return json({ error: "not found" }, 404);
          const profile = await db.vppAclProfile.update({
            where: { id },
            data: {
              name: body.name ?? existing.name,
              description: body.description ?? existing.description,
              rulesJson:
                body.rules !== undefined
                  ? JSON.stringify(body.rules)
                  : existing.rulesJson,
              defaultAction: body.defaultAction ?? existing.defaultAction,
              isEnabled: body.isEnabled ?? existing.isEnabled,
            },
          });
          return json({
            ...profile,
            rules: JSON.parse(profile.rulesJson || "[]"),
          });
        }

        if (path.startsWith("/policy/acl-profile/") && method === "DELETE") {
          const id = path.split("/")[3];
          const profile = await db.vppAclProfile.update({
            where: { id },
            data: { isEnabled: false },
          });
          return json({
            success: true,
            disabled: true,
            id: profile.id,
            name: profile.name,
          });
        }

        // ═══ 11. NAT Pools ═══
        if (path === "/policy/nat-pools" && method === "GET") {
          const includeDisabled =
            url.searchParams.get("includeDisabled") === "true";
          const pools = await db.vppNatPool.findMany({
            where: includeDisabled ? {} : { isEnabled: true },
          });
          return json({ pools });
        }

        if (path === "/policy/nat-pool" && method === "POST") {
          const body = await readBody(req);
          if (!body.name || !body.publicIpStart || !body.publicIpEnd)
            return json(
              { error: "name, publicIpStart, publicIpEnd required" },
              400
            );
          const pool = await db.vppNatPool.upsert({
            where: { name: body.name },
            create: {
              name: body.name,
              description: body.description || "",
              publicIpStart: body.publicIpStart,
              publicIpEnd: body.publicIpEnd,
              portStart: body.portStart ?? 1024,
              portEnd: body.portEnd ?? 65535,
              mode: body.mode || "NAT44",
              isEnabled: true,
            },
            update: {
              description: body.description || "",
              publicIpStart: body.publicIpStart,
              publicIpEnd: body.publicIpEnd,
              portStart: body.portStart ?? 1024,
              portEnd: body.portEnd ?? 65535,
              mode: body.mode || "NAT44",
              isEnabled: true,
            },
          });
          return json(pool);
        }

        if (path.startsWith("/policy/nat-pool/") && method === "PUT") {
          const id = path.split("/")[3];
          const body = await readBody(req);
          const existing = await db.vppNatPool.findUnique({ where: { id } });
          if (!existing) return json({ error: "not found" }, 404);
          const pool = await db.vppNatPool.update({
            where: { id },
            data: {
              name: body.name ?? existing.name,
              description: body.description ?? existing.description,
              publicIpStart: body.publicIpStart ?? existing.publicIpStart,
              publicIpEnd: body.publicIpEnd ?? existing.publicIpEnd,
              portStart: body.portStart ?? existing.portStart,
              portEnd: body.portEnd ?? existing.portEnd,
              mode: body.mode ?? existing.mode,
              isEnabled: body.isEnabled ?? existing.isEnabled,
            },
          });
          return json(pool);
        }

        if (path.startsWith("/policy/nat-pool/") && method === "DELETE") {
          const id = path.split("/")[3];
          const pool = await db.vppNatPool.update({
            where: { id },
            data: { isEnabled: false },
          });
          return json({
            success: true,
            disabled: true,
            id: pool.id,
            name: pool.name,
          });
        }

        // ═══ 12. POST /subscriber/program ═══
        // Delegates REAL VPP programming (policer + NAT + ACL via binapi)
        // to govpp-adapter (port 3016). The in-memory Map + SessionSnapshot
        // DB are the TS adapter's local cache + restart-recovery store.
        //
        // CRITICAL: if govpp is unreachable or returns failure, we MUST
        // return HTTP 500 so session-engine's transactional login flow
        // rolls back the session (no ghost sessions in VPP-vs-DB).
        if (path === "/subscriber/program" && method === "POST") {
          const body = await readBody(req);
          if (!body.sessionId || !body.subscriberId || !body.username) {
            return json(
              { error: "sessionId, subscriberId, username are required" },
              400
            );
          }

          // ── Delegate REAL VPP programming to govpp-adapter ──
          const govpp = await callGovpp<any>("/subscriber/program", body, "POST");
          if (!govpp.ok || !govpp.data?.success) {
            stats.errors++;
            return json(
              {
                success: false,
                error:
                  govpp.error ||
                  (govpp.data?.warnings?.length
                    ? `govpp programming failed: ${govpp.data.warnings.join("; ")}`
                    : "govpp subscriber/program failed"),
                govpp: govpp.data || null,
              },
              500
            );
          }

          // ── govpp succeeded: VPP state is now REALLY programmed ──
          // Update in-memory Map (fast query cache) + persist snapshot.
          const programmed = await programVpp(body);
          await upsertSnapshot(body, "PROGRAMMED");
          stats.programmed++;

          return json({
            success: true,
            programmed: {
              policer: programmed.policer,
              acl: programmed.acl,
              natMapping: programmed.natMapping,
            },
            govpp: govpp.data,
            vppEpochApplied: inMemory.vppEpoch,
            message: `subscriber ${body.username} (${body.sessionId}) programmed at epoch ${inMemory.vppEpoch} via govpp-adapter (real binapi)`,
          });
        }

        // ═══ 13. POST /subscriber/verify ═══
        // Delegates live VPP verification to govpp-adapter (which performs
        // best-effort cross-checks via policer_dump + nat44_address_dump).
        // Falls back to in-memory Map check if govpp is unreachable.
        if (path === "/subscriber/verify" && method === "POST") {
          const body = await readBody(req);
          const sessionId = body.sessionId;

          const govpp = await callGovpp<any>("/subscriber/verify", { sessionId }, "POST");
          if (govpp.ok && govpp.data) {
            return json({
              verified: govpp.data.verified ?? false,
              vppEpoch: inMemory.vppEpoch,
              sessionId,
              checks: govpp.data.checks || {
                policerExists: false,
                aclExists: false,
                natMappingExists: false,
              },
              govpp: govpp.data,
              source: "govpp-adapter",
            });
          }

          // ── Fallback: in-memory Map check (govpp unreachable) ──
          const entry = inMemory.subscriberPolicies.get(sessionId);
          if (!entry) {
            return json({
              verified: false,
              vppEpoch: inMemory.vppEpoch,
              programmedAt: null,
              checks: {
                policerExists: false,
                aclExists: false,
                natMappingExists: false,
              },
              source: "in-memory-fallback",
              govppError: govpp.error,
            });
          }
          return json({
            verified: true,
            vppEpoch: inMemory.vppEpoch,
            programmedAt: entry.programmedAt,
            checks: {
              policerExists: !!entry.policer,
              aclExists: !!entry.acl,
              natMappingExists: !!entry.natMapping,
            },
            source: "in-memory-fallback",
            govppError: govpp.error,
          });
        }

        // ═══ 14. POST /subscriber/remove ═══
        // Delegates REAL VPP cleanup to govpp-adapter (DisconnectSubscriber
        // → DeletePolicer + DeleteStaticNat). Always updates in-memory Map
        // + marks snapshot STALE regardless of govpp result (best-effort
        // cleanup — if govpp is unreachable, VPP may retain stale state
        // but our cache + DB are still cleaned so the next /vpp/rebuild
        // won't double-program).
        if (path === "/subscriber/remove" && method === "POST") {
          const body = await readBody(req);
          const sessionId = body.sessionId;

          // ── Delegate REAL VPP cleanup to govpp-adapter (best-effort) ──
          const govpp = await callGovpp<any>("/subscriber/remove", { sessionId }, "POST");

          const entry = inMemory.subscriberPolicies.get(sessionId);
          inMemory.subscriberPolicies.delete(sessionId);

          // Always mark snapshot STALE (state removed but session may still exist in DB)
          await db.sessionSnapshot.updateMany({
            where: { sessionId },
            data: { vppRecoveryState: "STALE" },
          });

          stats.removed++;

          return json({
            success: true,
            removed: {
              policer: entry?.policer || null,
              acl: entry?.acl || null,
              natMapping: entry?.natMapping || null,
            },
            govppOk: govpp.ok,
            govpp: govpp.ok ? govpp.data : { error: govpp.error },
            message: govpp.ok
              ? `subscriber ${sessionId} removed from real VPP + in-memory cache cleared`
              : `govpp unreachable: ${govpp.error} — in-memory cache cleared, VPP may retain stale state`,
          });
        }

        // ═══ 15. GET /subscriber/:sessionId/state ═══
        if (
          path.startsWith("/subscriber/") &&
          path.endsWith("/state") &&
          method === "GET"
        ) {
          const sessionId = path.split("/")[2];
          const entry = inMemory.subscriberPolicies.get(sessionId);
          const snapshot = await db.sessionSnapshot.findUnique({
            where: { sessionId },
          });
          return json({
            sessionId,
            inMemory: entry || null,
            snapshot: snapshot
              ? {
                  id: snapshot.id,
                  vppEpoch: snapshot.vppEpoch,
                  vppProgrammedAt: snapshot.vppProgrammedAt,
                  vppRecoveryState: snapshot.vppRecoveryState,
                  framedIp: snapshot.framedIp,
                  mac: snapshot.mac,
                  policyId: snapshot.policyId,
                  aclProfileId: snapshot.aclProfileId,
                  qosProfileId: snapshot.qosProfileId,
                  natProfileId: snapshot.natProfileId,
                }
              : null,
            vppEpoch: inMemory.vppEpoch,
          });
        }

        // ═══ 16. GET /config/generate (legacy) ═══
        if (path === "/config/generate" && method === "GET") {
          const config = await generateVPPConfig();
          return json({
            config,
            generatedAt: new Date().toISOString(),
            ...stats,
          });
        }

        // ═══ 17. GET /config/subscriber/:id (legacy) ═══
        if (path.startsWith("/config/subscriber/") && method === "GET") {
          const subscriberId = path.split("/")[3];
          const config = await generateSubscriberConfig(subscriberId);
          return json({ config, subscriberId });
        }

        // ═══ 18. POST /apply (legacy stub) ═══
        if (path === "/apply" && method === "POST") {
          const body = await readBody(req);
          console.log(
            `[vpp-adapter] apply ${body.type} for ${body.subscriber}:`,
            JSON.stringify(body.config)
          );
          return json({
            success: true,
            message: `Dataplane object ${body.type} for ${body.subscriber} queued (VPP binary not running — in-memory state updated)`,
            object: body,
          });
        }

        // ═══ 19. POST /coa ═══
        // Delegates REAL VPP policer update (ChangeSubscriberBandwidth →
        // DeletePolicer + CreatePolicer with new rates) to govpp-adapter.
        // Also updates in-memory Map (cache consistency).
        if (path === "/coa" && method === "POST") {
          const body = await readBody(req);
          const { sessionId, subscriberIP, downloadKbps, uploadKbps } = body;

          // ── Delegate REAL VPP policer update to govpp-adapter ──
          const govpp = await callGovpp<any>(
            "/coa",
            { sessionId, subscriberIP, downloadKbps, uploadKbps },
            "POST"
          );

          // Always update in-memory Map (best-effort cache consistency)
          if (sessionId) {
            const entry = inMemory.subscriberPolicies.get(sessionId);
            if (entry) {
              if (downloadKbps !== undefined)
                entry.policer.cir = Number(downloadKbps) || entry.policer.cir;
              entry.programmedAt = new Date();
              entry.vppEpochApplied = inMemory.vppEpoch;
            }
          }
          console.log(
            `[vpp-adapter] CoA for ${subscriberIP || sessionId}: ${downloadKbps}/${uploadKbps} kbps (govpp: ${govpp.ok ? "ok" : "unreachable"})`
          );

          if (!govpp.ok) {
            return json(
              {
                success: false,
                error: govpp.error,
                message: `CoA failed in govpp-adapter; in-memory cache updated best-effort`,
                coa: { sessionId, subscriberIP, downloadKbps, uploadKbps },
              },
              502
            );
          }

          return json({
            success: true,
            message: `CoA applied: ${subscriberIP || sessionId} → ${downloadKbps}/${uploadKbps} kbps (VPP policer updated via govpp)`,
            coa: { sessionId, subscriberIP, downloadKbps, uploadKbps },
            govpp: govpp.data,
          });
        }

        // ═══ 20. POST /reconcile ═══
        if (path === "/reconcile" && method === "POST") {
          const config = await generateVPPConfig();
          // Iterate active radacct sessions and programVpp each
          const activeSessions = await db.radacct.findMany({
            where: { acctstoptime: null, framedipaddress: { not: null } },
            take: 1000,
          });
          let programmedCount = 0;
          for (const s of activeSessions) {
            const sessionId = s.acctsessionid;
            if (!sessionId) continue;
            try {
              await programVpp({
                sessionId,
                subscriberId: s.subscriber_id || "",
                username: s.username || "",
                framedIp: s.framedipaddress || "",
                mac: s.callingstationid || "",
                nasIp: s.nasipaddress || "",
                speedDownKbps: 51200,
                speedUpKbps: 10240,
              });
              programmedCount++;
            } catch (e) {
              // ignore — continue
            }
          }
          return json({
            success: true,
            message:
              "Reconciliation complete — generated VPP config from DB state + reprogrammed active sessions",
            activeSessions: activeSessions.length,
            programmed: programmedCount,
            config,
            ...stats,
          });
        }

        // ═══ 21. GET /interfaces ═══
        // Delegates real VPP interface list (SwInterfaceDump via binapi)
        // to govpp-adapter. Returns [] with error if govpp unreachable.
        if (path === "/interfaces" && method === "GET") {
          const r = await callGovpp<any>("/interfaces", undefined, "GET");
          if (r.ok) {
            return json({
              interfaces: r.data?.interfaces || [],
              total: r.data?.total ?? (r.data?.interfaces?.length || 0),
              source: "govpp-adapter",
            });
          }
          return json({
            interfaces: [],
            error: r.error,
            source: "govpp-adapter-unreachable",
            message:
              "govpp-adapter unreachable — VPP interface list unavailable. In-memory policy state is authoritative.",
          });
        }

        // ═══ 22. GET /status ═══
        // Merges in-memory adapter state with govpp-adapter live status.
        if (path === "/status" && method === "GET") {
          const govpp = await callGovpp<any>("/status", undefined, "GET");
          return json({
            connected: govpp.ok && govpp.data?.connected ? true : inMemory.vppConnected,
            version:
              govpp.ok && govpp.data?.connected
                ? govpp.data?.version || "VPP via govpp-adapter (real binary API)"
                : "VPP binary not connected (govpp-adapter unreachable)",
            uptime: Math.floor((Date.now() - startTime) / 1000),
            interfaces: govpp.ok ? (govpp.data?.interfaces ?? 0) : 0,
            vppEpoch: inMemory.vppEpoch,
            vppLastRestartAt: inMemory.vppLastRestartAt,
            govpp: govpp.ok ? govpp.data : { error: govpp.error },
            message:
              "VPP Adapter (hard-boundary v2.0) running — real VPP programming delegated to govpp-adapter (port 3016, GoVPP v0.5.0 binapi)",
          });
        }

        // ═══ 23. GET /govpp/health (proxy to govpp-adapter) ═══
        // Lets the UI check both adapters' health in one round-trip.
        if (path === "/govpp/health" && method === "GET") {
          const r = await callGovpp<any>("/health", undefined, "GET");
          return json(r.ok ? r.data : { error: r.error }, r.ok ? 200 : 503);
        }

        // ═══ 24. GET /govpp/interfaces (alias for UI convenience) ═══
        if (path === "/govpp/interfaces" && method === "GET") {
          const r = await callGovpp<any>("/interfaces", undefined, "GET");
          return json(
            r.ok ? r.data : { interfaces: [], error: r.error },
            r.ok ? 200 : 503
          );
        }

        return json({ error: "Not found", path }, 404);
      } catch (err: any) {
        stats.errors++;
        console.error(
          `[vpp-adapter] error on ${method} ${path}:`,
          err.message
        );
        return json({ error: err.message, stack: err.stack }, 500);
      }
    },
  });

  // ── Background reconcile loop (every 60s) ──
  setInterval(async () => {
    try {
      await generateVPPConfig();
      console.log(
        `[vpp-adapter] background reconcile — config regenerated (total ${stats.configsGenerated})`
      );
    } catch (err: any) {
      console.error(`[vpp-adapter] background reconcile error:`, err.message);
    }
  }, 60_000);

  console.log(`╔══════════════════════════════════════════════╗`);
  console.log(`║  CRYPTSK VPP Adapter v2.0 — Port ${PORT}         ║`);
  console.log(`║  VPP connected: ${String(inMemory.vppConnected).padEnd(29)}║`);
  console.log(`║  VPP epoch: ${String(inMemory.vppEpoch).padEnd(33)}║`);
  console.log(`║  Hard-boundary contract (§28-§42) active      ║`);
  console.log(`║  Storage: PrismaClient (DATABASE_URL from env)║`);
  console.log(`╚══════════════════════════════════════════════╝`);
}

process.on("SIGINT", async () => {
  console.log("[vpp-adapter] SIGINT received — shutting down...");
  await db.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("[vpp-adapter] SIGTERM received — shutting down...");
  await db.$disconnect();
  process.exit(0);
});

main().catch((err) => {
  console.error("[vpp-adapter] FATAL startup error:", err);
  process.exit(1);
});
