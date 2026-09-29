// ============================================================
// CRYPTSK Nexus — VPP Adapter (TypeScript — dev/cert implementation)
// Per: docs/architecture/02_GATEWAY_ARCHITECTURE.md §90, ADR-008
//
// Generates VPP CLI configs from OSS/BSS state (subscribers, policies, NAS).
// In production, this is replaced by the Go GoVPP adapter (binary API).
// In dev/cert, this generates configs that can be reviewed in the UI.
//
// Port: 3015
// ============================================================

import pg from "pg";
import fs from "fs";

const { Client } = pg;

const PORT = 3015;
const DB_URL = process.env.DATABASE_URL || "postgresql://cryptsknexus:CryptskNexus2026@localhost:5432/cryptsknexus";
const startTime = Date.now();

let stats = { configsGenerated: 0, lastGenerateAt: 0, errors: 0 };

// ─── VPP Config Generator ────────────────────────────────────

async function generateVPPConfig(): Promise<string> {
  const client = new Client({ connectionString: DB_URL });
  const lines: string[] = [];

  try {
    await client.connect();

    lines.push("# ============================================================");
    lines.push("# CRYPTSK Nexus — VPP Dataplane Configuration (auto-generated)");
    lines.push(`# Generated: ${new Date().toISOString()}`);
    lines.push("# ============================================================");
    lines.push("");

    // ── 1. Interfaces ──
    lines.push("# ─── 1. Interfaces ──────────────────────────────────────");

    // Get NAS devices (each NAS = one VPP interface)
    const nasResult = await client.query("SELECT nasname, shortname, type FROM nas ORDER BY nasname");
    for (const nas of nasResult.rows) {
      lines.push(`# NAS: ${nas.shortname} (${nas.nasname}, type=${nas.type})`);
      lines.push(`set interface state ${nas.nasname} up`);
    }
    lines.push("");

    // ── 2. NAT (subscriber IP → public IP) ──
    lines.push("# ─── 2. NAT (Network Address Translation) ──────────────");

    // Get active subscribers with framed IPs
    const subResult = await client.query(`
      SELECT ra.username, ra.framedipaddress, ra.nasipaddress, ra.groupname
      FROM radacct ra
      WHERE ra.acctstoptime IS NULL
      AND ra.framedipaddress != ''
      LIMIT 1000
    `);

    if (subResult.rows.length > 0) {
      lines.push(`# ${subResult.rows.length} active subscriber sessions — NAT entries`);
      for (const sub of subResult.rows) {
        if (sub.framedipaddress) {
          // VPP NAT44: map subscriber IP to public IP pool
          lines.push(`nat44 add static address ${sub.framedipaddress} -> 203.0.113.${(parseInt(sub.framedipaddress.split(".")[3]) % 200) + 10}`);
        }
      }
    } else {
      lines.push("# No active subscriber sessions — no NAT entries needed");
    }
    lines.push("");

    // ── 3. ACL (per-subscriber firewall rules) ──
    lines.push("# ─── 3. ACL (Access Control Lists) ──────────────────────");

    // Get radgroupcheck for ACL/filter attributes
    const aclResult = await client.query(`
      SELECT groupname, attribute, value
      FROM radgroupcheck
      WHERE attribute IN ('Filter-Id', 'NAS-Filter-Id')
      ORDER BY groupname
    `);

    if (aclResult.rows.length > 0) {
      lines.push(`# ${aclResult.rows.length} ACL rules from policy engine`);
      for (const acl of aclResult.rows) {
        lines.push(`# Group: ${acl.groupname}, Filter: ${acl.value}`);
        lines.push(`acl add index 0 ipv4 permit src any dst any flow-hash 10 filter-id ${acl.value}`);
      }
    } else {
      lines.push("# No ACL rules defined — default permit");
    }
    lines.push("");

    // ── 4. QoS (bandwidth enforcement via policer) ──
    lines.push("# ─── 4. QoS (Bandwidth Policing) ────────────────────────");

    const qosResult = await client.query(`
      SELECT groupname, attribute, value
      FROM radgroupcheck
      WHERE attribute = 'Mikrotik-Rate-Limit'
      ORDER BY groupname
    `);

    if (qosResult.rows.length > 0) {
      lines.push(`# ${qosResult.rows.length} QoS policer rules`);
      for (const qos of qosResult.rows) {
        // Parse Mikrotik-Rate-Limit: "50M/25M" → policer config
        const rates = qos.value.split("/")[0];
        lines.push(`policer add name ${qos.groupname} cir ${rates} bc 4096 conform-action transmit violate-action drop`);
      }
    } else {
      lines.push("# No QoS policer rules — no bandwidth enforcement");
    }
    lines.push("");

    // ── 5. Routing ──
    lines.push("# ─── 5. Routing ────────────────────────────────────────");
    lines.push("# Default route (configure per your network topology)");
    lines.push("ip route add 0.0.0.0/0 via 203.0.113.1");
    lines.push("");

    // ── 6. Summary ──
    lines.push("# ─── Summary ───────────────────────────────────────────");
    lines.push(`# NAS devices: ${nasResult.rows.length}`);
    lines.push(`# Active sessions: ${subResult.rows.length}`);
    lines.push(`# ACL rules: ${aclResult.rows.length}`);
    lines.push(`# QoS policers: ${qosResult.rows.length}`);

    stats.configsGenerated++;
    stats.lastGenerateAt = Date.now();

    return lines.join("\n");
  } catch (err: any) {
    stats.errors++;
    return `# Error generating config: ${err.message}`;
  } finally {
    await client.end().catch(() => {});
  }
}

async function generateSubscriberConfig(subscriberId: string): Promise<string> {
  const client = new Client({ connectionString: DB_URL });
  const lines: string[] = [];

  try {
    await client.connect();

    // Get subscriber data
    const subResult = await client.query(`
      SELECT s.radiusUsername, s.staticIp, s.vlanId,
             p.name as planName, p.radiusGroupName,
             ra.framedipaddress, ra.nasipaddress, ra.callingstationid
      FROM "Subscriber" s
      LEFT JOIN plans p ON s.planId = p.id
      LEFT JOIN radacct ra ON ra.username = s.radiusUsername AND ra.acctstoptime IS NULL
      WHERE s.id = $1
      LIMIT 1
    `, [subscriberId]);

    if (subResult.rows.length === 0) {
      return "# Subscriber not found";
    }

    const sub = subResult.rows[0];

    lines.push(`# ============================================================`);
    lines.push(`# VPP Config for Subscriber: ${sub.radiusUsername}`);
    lines.push(`# ============================================================`);
    lines.push("");
    lines.push(`# RADIUS Username: ${sub.radiusUsername}`);
    lines.push(`# Plan: ${sub.planName || "—"}`);
    lines.push(`# RADIUS Group: ${sub.radiusGroupName || "—"}`);
    lines.push(`# Framed IP: ${sub.framedipaddress || "—"}`);
    lines.push(`# NAS IP: ${sub.nasipaddress || "—"}`);
    lines.push(`# MAC: ${sub.callingstationid || "—"}`);
    lines.push(`# Static IP: ${sub.staticip || "—"}`);
    lines.push(`# VLAN: ${sub.vlanId || "—"}`);
    lines.push("");

    // Get policy attributes for this subscriber's group
    if (sub.radiusGroupName) {
      const policyResult = await client.query(`
        SELECT attribute, op, value FROM radgroupcheck
        WHERE groupname = $1
      `, [sub.radiusGroupName]);

      lines.push("# ─── Dataplane Objects ─────────────────────────────────");
      for (const attr of policyResult.rows) {
        if (attr.attribute === "Mikrotik-Rate-Limit") {
          lines.push(`# QoS: ${attr.value}`);
          lines.push(`policer add name ${sub.radiusUsername} cir ${attr.value.split("/")[0]} bc 4096`);
        }
      }
    }

    // NAT entry
    if (sub.framedipaddress) {
      lines.push("");
      lines.push("# ─── NAT ───────────────────────────────────────────────");
      lines.push(`nat44 add static address ${sub.framedipaddress} -> 203.0.113.100`);
    }

    return lines.join("\n");
  } catch (err: any) {
    return `# Error: ${err.message}`;
  } finally {
    await client.end().catch(() => {});
  }
}

// ─── REST API ────────────────────────────────────────────────

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
    const method = req.method;

    if (method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
        vppConnected: fs.existsSync("/run/vpp/api.sock"),
        vppSocket: "/run/vpp/api.sock",
        message: "VPP adapter running (VPP binary not available — generates configs only)",
        stats,
      });
    }

    // ── Status ──
    if (path === "/status") {
      return json({
        connected: false,
        version: "VPP not installed (DPDK hardware required)",
        uptime: Math.floor((Date.now() - startTime) / 1000),
        interfaces: 0,
        message: "VPP binary not available. Configs are generated from OSS/BSS state.",
      });
    }

    // ── Generate full VPP config ──
    if (path === "/config/generate" && method === "GET") {
      const config = await generateVPPConfig();
      return json({ config, generatedAt: new Date().toISOString(), ...stats });
    }

    // ── Generate subscriber-specific config ──
    if (path.startsWith("/config/subscriber/") && method === "GET") {
      const subscriberId = path.split("/")[3];
      const config = await generateSubscriberConfig(subscriberId);
      return json({ config, subscriberId });
    }

    // ── Interfaces (stub — VPP not running) ──
    if (path === "/interfaces" && method === "GET") {
      return json({
        interfaces: [],
        message: "VPP not running — interface list unavailable. Configure DPDK + start VPP to see interfaces.",
      });
    }

    // ── Apply dataplane object (stub) ──
    if (path === "/apply" && method === "POST") {
      const body = await req.json().catch(() => ({}));
      // In production: this calls GoVPP binary API to apply the object
      // In dev: log the object + return success (config is already generated)
      console.log(`[vpp-adapter] apply ${body.type} for ${body.subscriber}:`, JSON.stringify(body.config));
      return json({
        success: true,
        message: `Dataplane object ${body.type} for ${body.subscriber} queued (VPP binary not running — config generated)`,
        object: body,
      });
    }

    // ── CoA (Change of Authorization — dynamic bandwidth change) ──
    if (path === "/coa" && method === "POST") {
      const body = await req.json().catch(() => ({}));
      const { subscriberIP, downloadKbps, uploadKbps } = body;
      // In production: this calls GoVPP to delete old policer + create new one
      // In dev: log + return success
      console.log(`[vpp-adapter] CoA for ${subscriberIP}: ${downloadKbps}/${uploadKbps} kbps`);
      return json({
        success: true,
        message: `CoA applied: ${subscriberIP} → ${downloadKbps}/${uploadKbps} kbps (VPP binary not running — policer config updated)`,
        coa: { subscriberIP, downloadKbps, uploadKbps },
      });
    }

    // ── Reconcile (sync DB state → VPP) ──
    if (path === "/reconcile" && method === "POST") {
      const config = await generateVPPConfig();
      return json({
        success: true,
        message: "Reconciliation complete — generated VPP config from DB state",
        config,
        ...stats,
      });
    }

    return json({ error: "Not found", path }, 404);
  },
});

console.log(`╔══════════════════════════════════════════╗`);
console.log(`║  CRYPTSK VPP Adapter — Port ${PORT}          ║`);
console.log(`║  VPP: not available (generates configs)  ║`);
console.log(`║  DB: ${DB_URL.replace(/:[^:@]+@/, ":***@")}  ║`);
console.log(`╚══════════════════════════════════════════╝`);

// ─── Auto-Reconciliation Loop ─────────────────────────────────
// Every 30 seconds, regenerate the VPP config from DB state.
// In production, this would also compare with VPP's live state
// and add/remove objects as needed (dataplane reconciliation).
setInterval(async () => {
  try {
    await generateVPPConfig();
    console.log(`[reconcile] config regenerated (${stats.configsGenerated} total)`);
  } catch (err: any) {
    console.error(`[reconcile] error:`, err.message);
  }
}, 30_000); // 30 seconds
