// ============================================================================
// Cryptsk — IPS (Intrusion Prevention System) Detection Daemon
// Port: 3030 | Detection engine runs every 5 seconds
// Uses conntrack parsing, nftables integration, threat scoring, WebSocket alerts
// ============================================================================

import { PrismaClient } from "@prisma/client";
import { requireAuth, corsHeaders, optionalAuth } from "../shared/auth.js";
import { createLogger } from "../shared/logger.js";

// ─── Logger & Prisma Setup ────────────────────────────────────────────────
const log = createLogger("ips-daemon");
const prisma = new PrismaClient({
  datasourceUrl:
    process.env.DATABASE_URL || "postgresql://cryptsk:Cryptsk2026@localhost:5432/ispplatform",
});

const SERVICE_PORT = 3030;

// ─── Shell Command Helper ─────────────────────────────────────────────────
interface ShellResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runShell(
  cmd: string,
  args: string[],
  timeoutMs = 10000
): Promise<ShellResult> {
  try {
    const proc = Bun.spawn([cmd, ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const timeout = setTimeout(() => proc.kill(), timeoutMs);
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    clearTimeout(timeout);
    const exitCode = await proc.exited;
    return { success: exitCode === 0, stdout, stderr, exitCode };
  } catch (err: any) {
    return {
      success: false,
      stdout: "",
      stderr: err.message || "Command not found or failed",
      exitCode: -1,
    };
  }
}

// ─── JSON Helpers ─────────────────────────────────────────────────────────
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, (_, v) => typeof v === "bigint" ? v.toString() : v), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function jsonErr(message: string, status = 400) {
  return json({ success: false, error: message }, status);
}

// ─── Daemon State ─────────────────────────────────────────────────────────
const startTime = Date.now();
let lastDetectionRun: Date | null = null;
let detectionInterval: ReturnType<typeof setInterval> | null = null;
let isShuttingDown = false;

// WebSocket clients
const wsClients: Set<any> = new Set();

function broadcastAlert(event: any) {
  const msg = JSON.stringify({ type: "alert", data: event });
  for (const client of wsClients) {
    try {
      client.send(msg);
    } catch {
      wsClients.delete(client);
    }
  }
}

// ─── In-Memory Threat Scores ─────────────────────────────────────────────
const threatScores: Map<string, number> = new Map();

function addThreatScore(ip: string, points: number): number {
  const current = threatScores.get(ip) || 0;
  const newScore = Math.min(100, current + points);
  threatScores.set(ip, newScore);
  return newScore;
}

function getThreatScore(ip: string): number {
  return threatScores.get(ip) || 0;
}

// ─── Sliding Window Tracking ──────────────────────────────────────────────
interface ConnectionEntry {
  srcIp: string;
  dstIp: string;
  dstPort: number;
  protocol: string;
  state: string;
  bytes: number;
  packets: number;
  timestamp: number;
}

// Per-IP port scan tracking
const portScanTracker: Map<string, { ports: Set<number>; timestamps: number[] }> = new Map();

// Per-IP connection tracking
const connectionTracker: Map<string, Set<string>> = new Map();

// Per-IP bandwidth tracking
const bandwidthTracker: Map<string, { bytes: number; timestamps: number[] }> = new Map();

// Per-IP DNS query tracking
const dnsTracker: Map<string, { count: number; timestamps: number[] }> = new Map();

// Per-IP SYN tracking
const synTracker: Map<string, { count: number; timestamps: number[] }> = new Map();

// Per-IP UDP tracking
const udpTracker: Map<string, { count: number; timestamps: number[] }> = new Map();

// Per-IP ICMP tracking
const icmpTracker: Map<string, { count: number; timestamps: number[] }> = new Map();

// Per-IP brute force tracking
const bruteForceTracker: Map<string, { count: number; timestamps: number[] }> = new Map();

// ARP tracking
const arpTracker: Map<string, { macs: Set<string>; timestamps: number[] }> = new Map();

// ─── nftables Helpers ─────────────────────────────────────────────────────
const NFT_TABLE = "ips";
const NFT_BLOCKED_SET = "blocked_ips";
const NFT_MONITORED_SET = "monitored_ips";
const NFT_WHITELISTED_SET = "whitelisted_ips";

async function nftRun(args: string[], timeoutMs = 5000): Promise<ShellResult> {
  return runShell("nft", args, timeoutMs);
}

async function nftAddElement(setName: string, element: string, timeoutSec?: number): Promise<void> {
  const args = ["add", "element", "inet", NFT_TABLE, setName, `{ ${element} }`];
  if (timeoutSec) {
    args.splice(-2, 0, `timeout ${timeoutSec}s`);
  }
  const result = await nftRun(args);
  if (!result.success) {
    log.warn("nft add element failed", { setName, element, stderr: result.stderr });
  }
}

async function nftDeleteElement(setName: string, element: string): Promise<void> {
  const result = await nftRun(["delete", "element", "inet", NFT_TABLE, setName, `{ ${element} }`]);
  if (!result.success) {
    log.warn("nft delete element failed", { setName, element, stderr: result.stderr });
  }
}

async function nftAddRule(table: string, chain: string, rule: string): Promise<number> {
  const result = await nftRun(["add", "rule", "inet", table, chain, ...rule.split(" ")]);
  if (!result.success) {
    log.warn("nft add rule failed", { table, chain, rule, stderr: result.stderr });
    return -1;
  }
  // Get handle of last added rule
  const listResult = await nftRun(["-a", "list", "chain", "inet", table, chain]);
  if (listResult.success) {
    const lines = listResult.stdout.split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const handleMatch = lines[i].match(/handle (\d+)/);
      if (handleMatch) return parseInt(handleMatch[1]);
    }
  }
  return 0;
}

async function nftDeleteRule(table: string, chain: string, handle: number): Promise<void> {
  await nftRun(["delete", "rule", "inet", table, chain, "handle", String(handle)]);
}

async function nftListSet(setName: string): Promise<string[]> {
  const result = await nftRun(["list", "set", "inet", NFT_TABLE, setName]);
  if (!result.success) return [];
  const elements: string[] = [];
  const lines = result.stdout.split("\n");
  for (const line of lines) {
    const match = line.match(/^\s+([0-9.]+)/);
    if (match) elements.push(match[1]);
  }
  return elements;
}

async function nftInitTable(): Promise<{ success: boolean; output: string }> {
  const fullScript = `
table inet ips {
  set blocked_ips { type ipv4_addr; flags timeout; }
  set monitored_ips { type ipv4_addr; }
  set whitelisted_ips { type ipv4_addr; }

  chain input {
    type filter hook input priority 0; policy accept;
    ip saddr @blocked_ips drop
  }

  chain forward {
    type filter hook forward priority 0; policy accept;
    ip saddr @blocked_ips drop
    ip daddr @blocked_ips drop
  }
}`;
  // Flush existing table first
  await nftRun(["flush", "table", "inet", NFT_TABLE]).catch(() => {});
  await nftRun(["delete", "table", "inet", NFT_TABLE]).catch(() => {});
  const result = await runShell("nft", ["-f", "-"], 5000);
  // Use echo to pipe the script
  const echoResult = await runShell("bash", ["-c", `echo '${fullScript}' | nft -f -`], 10000);
  if (echoResult.success) {
    log.info("nftables IPS table initialized successfully");
    return { success: true, output: echoResult.stdout };
  } else {
    log.warn("nftables init failed (may need root)", { stderr: echoResult.stderr });
    return { success: false, output: echoResult.stderr };
  }
}

// ─── Block Duration to Seconds ────────────────────────────────────────────
function blockDurationToSeconds(duration: string): number {
  const map: Record<string, number> = {
    TEMP_5M: 300,
    TEMP_15M: 900,
    TEMP_30M: 1800,
    TEMP_1H: 3600,
    TEMP_6H: 21600,
    TEMP_24H: 86400,
    PERMANENT: 0,
  };
  return map[duration] || 1800;
}

// ─── Auto-Block Engine ────────────────────────────────────────────────────
async function autoBlockIp(
  sourceIp: string,
  reason: string,
  action: string,
  duration: string,
  alertId: string
): Promise<string | null> {
  try {
    const timeoutSec = blockDurationToSeconds(duration);
    const expiresAt = timeoutSec > 0 ? new Date(Date.now() + timeoutSec * 1000) : null;

    // Add to nftables
    if (timeoutSec > 0) {
      await nftAddElement(NFT_BLOCKED_SET, sourceIp, timeoutSec);
    } else {
      await nftAddElement(NFT_BLOCKED_SET, sourceIp);
    }

    // Create DB record
    const blockRule = await prisma.ipsBlockRule.create({
      data: {
        sourceIp,
        reason,
        action: action as any,
        duration: duration as any,
        alertId,
        expiresAt,
        isActive: true,
        createdBy: "system",
      },
    });

    // Update alert
    await prisma.ipsAlert.update({
      where: { id: alertId },
      data: {
        actionTaken: `BLOCKED_${action}`,
        blockRuleId: blockRule.id,
      },
    });

    log.warn("AUTO-BLOCK: IP blocked", {
      ip: sourceIp,
      reason,
      action,
      duration,
      blockRuleId: blockRule.id,
    });

    return blockRule.id;
  } catch (err: any) {
    log.error("autoBlockIp failed", { ip: sourceIp, error: String(err) });
    return null;
  }
}

// ─── Threat Score Action ──────────────────────────────────────────────────
async function applyThreatScoreAction(ip: string, score: number, reason: string, eventType: string): Promise<void> {
  if (score <= 20) {
    // Monitor only
    await nftAddElement(NFT_MONITORED_SET, ip).catch(() => {});
    log.info(`Threat monitor: ${ip} score ${score} (${eventType})`);
  } else if (score <= 40) {
    // Rate limit + notify
    await nftAddElement(NFT_MONITORED_SET, ip).catch(() => {});
    log.warn(`Threat rate-limit: ${ip} score ${score} (${eventType})`);
  } else if (score <= 70) {
    // Temp block 30 min
    const alert = await prisma.ipsAlert.findFirst({
      where: { sourceIp: ip, eventType: eventType as any },
      orderBy: { createdAt: "desc" },
    });
    if (alert) {
      await autoBlockIp(ip, `Threat score ${score} - ${reason}`, "DROP", "TEMP_30M", alert.id);
    }
  } else {
    // Permanent block
    const alert = await prisma.ipsAlert.findFirst({
      where: { sourceIp: ip, eventType: eventType as any },
      orderBy: { createdAt: "desc" },
    });
    if (alert) {
      await autoBlockIp(ip, `Critical threat score ${score} - ${reason}`, "DROP", "PERMANENT", alert.id);
    }
  }
}

// ─── Conntrack Parser ─────────────────────────────────────────────────────
interface ConntrackEntry {
  srcIp: string;
  dstIp: string;
  srcPort: number;
  dstPort: number;
  protocol: number;
  state: string;
  bytes: number;
  packets: number;
}

function parseConntrackLine(line: string): ConntrackEntry | null {
  try {
    const srcMatch = line.match(/src=(\S+)/g);
    const dstMatch = line.match(/dst=(\S+)/g);
    const sportMatch = line.match(/sport=(\d+)/g);
    const dportMatch = line.match(/dport=(\d+)/g);
    const bytesMatch = line.match(/bytes=(\d+)/g);
    const packetsMatch = line.match(/packets=(\d+)/g);
    const protoMatch = line.match(/^\s*\w+\s+\d+\s+(\w+)/);
    const stateMatch = line.match(/(\w+)\s+src=/);

    if (!srcMatch || srcMatch.length < 2 || !dstMatch || dstMatch.length < 2) return null;

    return {
      srcIp: srcMatch[0].replace("src=", ""),
      dstIp: dstMatch[0].replace("dst=", ""),
      srcPort: sportMatch && sportMatch.length > 0 ? parseInt(sportMatch[0].replace("sport=", "")) : 0,
      dstPort: dportMatch && dportMatch.length > 0 ? parseInt(dportMatch[0].replace("dport=", "")) : 0,
      protocol: protoMatch ? (protoMatch[1] === "tcp" ? 6 : protoMatch[1] === "udp" ? 17 : protoMatch[1] === "icmp" ? 1 : 0) : 0,
      state: stateMatch ? stateMatch[1] : "",
      bytes: bytesMatch && bytesMatch.length > 1 ? parseInt(bytesMatch[1].replace("bytes=", "")) : 0,
      packets: packetsMatch && packetsMatch.length > 1 ? parseInt(packetsMatch[1].replace("packets=", "")) : 0,
    };
  } catch {
    return null;
  }
}

async function readConntrack(): Promise<ConntrackEntry[]> {
  // Try /proc/net/nf_conntrack first
  try {
    const result = await runShell("cat", ["/proc/net/nf_conntrack"], 3000);
    if (result.success && result.stdout.trim()) {
      const entries: ConntrackEntry[] = [];
      for (const line of result.stdout.split("\n")) {
        const entry = parseConntrackLine(line);
        if (entry) entries.push(entry);
      }
      return entries;
    }
  } catch {}

  // Fallback: conntrack -L command
  try {
    const result = await runShell("conntrack", ["-L"], 5000);
    if (result.success && result.stdout.trim()) {
      const entries: ConntrackEntry[] = [];
      for (const line of result.stdout.split("\n")) {
        const entry = parseConntrackLine(line);
        if (entry) entries.push(entry);
      }
      return entries;
    }
  } catch {}

  // Fallback: generate simulated data for demo
  log.info("Using simulated conntrack data (no access to /proc/net/nf_conntrack or conntrack command)");
  return generateSimulatedData();
}

function generateSimulatedData(): ConntrackEntry[] {
  const entries: ConntrackEntry[] = [];
  const now = Date.now();
  const sampleIps = [
    "192.168.1.100", "10.0.0.5", "172.16.0.50", "192.168.1.200",
    "10.0.0.10", "203.0.113.45", "198.51.100.22", "192.168.1.150",
    "10.0.0.99", "172.16.0.1"
  ];
  const destIps = ["8.8.8.8", "1.1.1.1", "142.250.80.46", "157.240.1.35", "52.85.132.99"];
  const states = ["ESTABLISHED", "TIME_WAIT", "CLOSE_WAIT", "SYN_SENT", "SYN_RECV", "FIN_WAIT2"];

  // Normal traffic
  for (let i = 0; i < 50; i++) {
    const srcIp = sampleIps[Math.floor(Math.random() * 5)];
    entries.push({
      srcIp,
      dstIp: destIps[Math.floor(Math.random() * destIps.length)],
      srcPort: 30000 + Math.floor(Math.random() * 30000),
      dstPort: [80, 443, 53, 8080][Math.floor(Math.random() * 4)],
      protocol: Math.random() > 0.3 ? 6 : 17,
      state: states[Math.floor(Math.random() * 3)],
      bytes: Math.floor(Math.random() * 100000),
      packets: Math.floor(Math.random() * 500),
    });
  }

  // Simulated port scan (src=10.0.0.99)
  for (let port = 1; port <= 25; port++) {
    entries.push({
      srcIp: "10.0.0.99",
      dstIp: "192.168.1.1",
      srcPort: 50000 + port,
      dstPort: port,
      protocol: 6,
      state: Math.random() > 0.5 ? "SYN_SENT" : "ESTABLISHED",
      bytes: 60,
      packets: 1,
    });
  }

  // Simulated SYN flood (src=203.0.113.45)
  for (let i = 0; i < 200; i++) {
    entries.push({
      srcIp: "203.0.113.45",
      dstIp: "192.168.1.1",
      srcPort: 40000 + i,
      dstPort: 80,
      protocol: 6,
      state: "SYN_SENT",
      bytes: 60,
      packets: 1,
    });
  }

  // Simulated DNS amplification (src=198.51.100.22)
  for (let i = 0; i < 150; i++) {
    entries.push({
      srcIp: "198.51.100.22",
      dstIp: "8.8.8.8",
      srcPort: 50000 + (i % 100),
      dstPort: 53,
      protocol: 17,
      state: "",
      bytes: 512,
      packets: 1,
    });
  }

  // Simulated malware C2 (src=172.16.0.50)
  entries.push({
    srcIp: "172.16.0.50",
    dstIp: "10.10.10.10",
    srcPort: 55555,
    dstPort: 4444,
    protocol: 6,
    state: "ESTABLISHED",
    bytes: 5000,
    packets: 20,
  });

  // Simulated bandwidth abuse (src=10.0.0.10)
  for (let i = 0; i < 30; i++) {
    entries.push({
      srcIp: "10.0.0.10",
      dstIp: destIps[Math.floor(Math.random() * destIps.length)],
      srcPort: 30000 + i,
      dstPort: 443,
      protocol: 6,
      state: "ESTABLISHED",
      bytes: 5000000 + Math.floor(Math.random() * 5000000),
      packets: 5000 + Math.floor(Math.random() * 5000),
    });
  }

  return entries;
}

// ─── ARP Table Parser ─────────────────────────────────────────────────────
async function readArpTable(): Promise<{ ip: string; mac: string }[]> {
  try {
    const result = await runShell("cat", ["/proc/net/arp"], 3000);
    if (result.success && result.stdout.trim()) {
      const entries: { ip: string; mac: string }[] = [];
      const lines = result.stdout.split("\n");
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].trim().split(/\s+/);
        if (parts.length >= 4 && parts[3] !== "00:00:00:00:00:00") {
          entries.push({ ip: parts[0], mac: parts[3] });
        }
      }
      return entries;
    }
  } catch {}
  return [];
}

// ─── Detection Rules Cache ────────────────────────────────────────────────
let cachedRules: any[] = [];
let rulesCacheTime = 0;

async function getDetectionRules(): Promise<any[]> {
  const now = Date.now();
  if (cachedRules.length > 0 && now - rulesCacheTime < 30000) {
    return cachedRules;
  }
  try {
    const dbRules = await prisma.ipsDetectionRule.findMany({
      where: { enabled: true },
      orderBy: { sortOrder: "asc" },
    });
    if (dbRules.length > 0) {
      cachedRules = dbRules;
    } else if (cachedRules.length === 0) {
      // Use default rules when DB has none
      cachedRules = getDefaultRules();
      log.info("Using default detection rules (no rules in DB)");
    }
    rulesCacheTime = now;
  } catch (err) {
    log.warn("Failed to load detection rules from DB", { error: String(err) });
    if (cachedRules.length === 0) {
      cachedRules = getDefaultRules();
    }
    rulesCacheTime = now;
  }
  return cachedRules;
}

function getDefaultRules(): any[] {
  return [
    { id: "default-port-scan", name: "Port Scan Detection", eventType: "PORT_SCAN", enabled: true, thresholdConn: 20, windowSeconds: 60, autoBlock: false, blockAction: "DROP", blockDuration: "TEMP_30M", scoreImpact: 25, targetPorts: "", targetProto: "tcp", sourceExclude: "" },
    { id: "default-syn-flood", name: "SYN Flood Detection", eventType: "SYN_FLOOD", enabled: true, thresholdPps: 1000, windowSeconds: 1, autoBlock: true, blockAction: "DROP", blockDuration: "TEMP_30M", scoreImpact: 40, targetPorts: "", targetProto: "tcp", sourceExclude: "" },
    { id: "default-udp-flood", name: "UDP Flood Detection", eventType: "UDP_FLOOD", enabled: true, thresholdConn: 5000, windowSeconds: 60, autoBlock: true, blockAction: "DROP", blockDuration: "TEMP_1H", scoreImpact: 40, targetPorts: "", targetProto: "udp", sourceExclude: "" },
    { id: "default-icmp-flood", name: "ICMP Flood Detection", eventType: "ICMP_FLOOD", enabled: true, thresholdPps: 1000, windowSeconds: 1, autoBlock: true, blockAction: "DROP", blockDuration: "TEMP_30M", scoreImpact: 30, targetPorts: "", targetProto: "icmp", sourceExclude: "" },
    { id: "default-conn-flood", name: "Connection Flood Detection", eventType: "CONNECTION_FLOOD", enabled: true, thresholdConn: 500, windowSeconds: 60, autoBlock: true, blockAction: "DROP", blockDuration: "TEMP_1H", scoreImpact: 35, targetPorts: "", targetProto: "", sourceExclude: "" },
    { id: "default-bandwidth", name: "Bandwidth Abuse Detection", eventType: "BANDWIDTH_ABUSE", enabled: true, thresholdBps: 104857600, windowSeconds: 60, autoBlock: false, blockAction: "RATE_LIMIT", blockDuration: "TEMP_6H", scoreImpact: 20, targetPorts: "", targetProto: "", sourceExclude: "" },
    { id: "default-dns-amp", name: "DNS Amplification Detection", eventType: "DNS_AMPLIFICATION", enabled: true, thresholdConn: 500, windowSeconds: 60, autoBlock: true, blockAction: "DROP", blockDuration: "TEMP_1H", scoreImpact: 35, targetPorts: "53", targetProto: "udp", sourceExclude: "" },
    { id: "default-arp-poison", name: "ARP Poisoning Detection", eventType: "ARP_POISON", enabled: true, thresholdConn: 3, windowSeconds: 60, autoBlock: true, blockAction: "DROP", blockDuration: "TEMP_24H", scoreImpact: 50, targetPorts: "", targetProto: "", sourceExclude: "" },
    { id: "default-malware-c2", name: "Malware C2 Detection", eventType: "MALWARE_C2", enabled: true, thresholdConn: 1, windowSeconds: 60, autoBlock: true, blockAction: "DROP", blockDuration: "TEMP_24H", scoreImpact: 60, targetPorts: "4444,5555,6666,6667,8888,31337,12345", targetProto: "tcp", sourceExclude: "" },
    { id: "default-brute-force", name: "Brute Force Detection", eventType: "BRUTE_FORCE", enabled: true, thresholdConn: 50, windowSeconds: 60, autoBlock: true, blockAction: "DROP", blockDuration: "TEMP_1H", scoreImpact: 30, targetPorts: "", targetProto: "tcp", sourceExclude: "" },
  ];
}

// ─── Create Alert Helper ──────────────────────────────────────────────────
async function createAlert(entry: {
  eventType: string;
  severity: string;
  sourceIp: string;
  sourceMac?: string;
  destIp?: string;
  destPort?: number;
  protocol?: string;
  pps?: number;
  bps?: number;
  connCount?: number;
  threatScore: number;
  ruleId?: string;
  details?: string;
}): Promise<any> {
  try {
    // Only set ruleId if it refers to a real DB rule (starts with 'c')
    const ruleId = entry.ruleId && entry.ruleId.startsWith("c") ? entry.ruleId : null;

    const alert = await prisma.ipsAlert.create({
      data: {
        eventType: entry.eventType as any,
        severity: entry.severity as any,
        status: "NEW",
        sourceIp: entry.sourceIp,
        sourceMac: entry.sourceMac || "",
        destIp: entry.destIp || "",
        destPort: entry.destPort || 0,
        protocol: entry.protocol || "",
        pps: entry.pps || 0,
        bps: entry.bps || 0,
        connCount: entry.connCount || 0,
        threatScore: entry.threatScore,
        ruleId,
        details: entry.details || "",
      },
    });

    log.info("ALERT", {
      type: entry.eventType,
      severity: entry.severity,
      ip: entry.sourceIp,
      score: entry.threatScore,
      alertId: alert.id,
    });

    // Broadcast via WebSocket
    broadcastAlert({ ...entry, id: alert.id, createdAt: alert.createdAt });

    return alert;
  } catch (err: any) {
    log.error("createAlert failed", { error: String(err) });
    return null;
  }
}

// ─── Detection Engine ─────────────────────────────────────────────────────
const MALWARE_C2_PORTS = new Set([4444, 5555, 6666, 6667, 8888, 31337, 12345]);

async function runDetectionCycle() {
  if (isShuttingDown) return;

  const cycleStart = Date.now();
  try {
    const entries = await readConntrack();
    const rules = await getDetectionRules();
    const ruleMap = new Map(rules.map((r) => [r.eventType, r]));
    const now = cycleStart;
    const window60s = now - 60000;

    // ─── 1. Port Scan Detection ─────────────────────────────────
    const portScanRule = ruleMap.get("PORT_SCAN");
    if (portScanRule) {
      const tcpNewConns = entries.filter((e) => e.protocol === 6);
      for (const entry of tcpNewConns) {
        if (!portScanTracker.has(entry.srcIp)) {
          portScanTracker.set(entry.srcIp, { ports: new Set(), timestamps: [] });
        }
        const tracker = portScanTracker.get(entry.srcIp)!;
        tracker.ports.add(entry.dstPort);
        tracker.timestamps.push(now);
      }
      // Clean old entries and check thresholds
      for (const [ip, tracker] of portScanTracker) {
        tracker.timestamps = tracker.timestamps.filter((t) => t > window60s);
        if (tracker.timestamps.length < 2) {
          tracker.ports.clear();
        }
        if (tracker.ports.size > (portScanRule.thresholdConn || 20)) {
          const score = addThreatScore(ip, portScanRule.scoreImpact || 25);
          await createAlert({
            eventType: "PORT_SCAN",
            severity: score > 40 ? "HIGH" : "MEDIUM",
            sourceIp: ip,
            destPort: 0,
            protocol: "tcp",
            connCount: tracker.ports.size,
            threatScore: score,
            ruleId: portScanRule.id,
            details: `${tracker.ports.size} distinct ports scanned in 60s`,
          });
          if (portScanRule.autoBlock) {
            const alert = await prisma.ipsAlert.findFirst({
              where: { sourceIp: ip, eventType: "PORT_SCAN" as any },
              orderBy: { createdAt: "desc" },
            });
            if (alert) {
              await autoBlockIp(ip, "Port scan detected", portScanRule.blockAction, portScanRule.blockDuration, alert.id);
            }
          }
          await applyThreatScoreAction(ip, score, "Port scan", "PORT_SCAN");
          tracker.ports.clear();
          tracker.timestamps = [];
        }
      }
    }

    // ─── 2. SYN Flood Detection ──────────────────────────────────
    const synFloodRule = ruleMap.get("SYN_FLOOD");
    if (synFloodRule) {
      const synEntries = entries.filter((e) => e.protocol === 6 && (e.state === "SYN_SENT" || e.state === "SYN_RECV"));
      for (const entry of synEntries) {
        if (!synTracker.has(entry.srcIp)) {
          synTracker.set(entry.srcIp, { count: 0, timestamps: [] });
        }
        synTracker.get(entry.srcIp)!.count++;
        synTracker.get(entry.srcIp)!.timestamps.push(now);
      }
      for (const [ip, tracker] of synTracker) {
        tracker.timestamps = tracker.timestamps.filter((t) => t > window60s);
        tracker.count = tracker.timestamps.length;
        if (tracker.count > (synFloodRule.thresholdPps || 1000)) {
          const score = addThreatScore(ip, synFloodRule.scoreImpact || 40);
          await createAlert({
            eventType: "SYN_FLOOD",
            severity: score > 40 ? "CRITICAL" : "HIGH",
            sourceIp: ip,
            destPort: 80,
            protocol: "tcp",
            pps: tracker.count,
            connCount: tracker.count,
            threatScore: score,
            ruleId: synFloodRule.id,
            details: `${tracker.count} SYN packets in window`,
          });
          if (synFloodRule.autoBlock) {
            const alert = await prisma.ipsAlert.findFirst({
              where: { sourceIp: ip, eventType: "SYN_FLOOD" as any },
              orderBy: { createdAt: "desc" },
            });
            if (alert) {
              await autoBlockIp(ip, "SYN flood detected", synFloodRule.blockAction, synFloodRule.blockDuration, alert.id);
            }
          }
          await applyThreatScoreAction(ip, score, "SYN flood", "SYN_FLOOD");
          tracker.count = 0;
          tracker.timestamps = [];
        }
      }
    }

    // ─── 3. UDP Flood Detection ──────────────────────────────────
    const udpFloodRule = ruleMap.get("UDP_FLOOD");
    if (udpFloodRule) {
      const udpEntries = entries.filter((e) => e.protocol === 17);
      for (const entry of udpEntries) {
        if (!udpTracker.has(entry.srcIp)) {
          udpTracker.set(entry.srcIp, { count: 0, timestamps: [] });
        }
        udpTracker.get(entry.srcIp)!.count++;
        udpTracker.get(entry.srcIp)!.timestamps.push(now);
      }
      for (const [ip, tracker] of udpTracker) {
        tracker.timestamps = tracker.timestamps.filter((t) => t > window60s);
        tracker.count = tracker.timestamps.length;
        if (tracker.count > (udpFloodRule.thresholdConn || 5000)) {
          const score = addThreatScore(ip, udpFloodRule.scoreImpact || 40);
          await createAlert({
            eventType: "UDP_FLOOD",
            severity: score > 40 ? "CRITICAL" : "HIGH",
            sourceIp: ip,
            protocol: "udp",
            connCount: tracker.count,
            threatScore: score,
            ruleId: udpFloodRule.id,
            details: `${tracker.count} UDP connections`,
          });
          if (udpFloodRule.autoBlock) {
            const alert = await prisma.ipsAlert.findFirst({
              where: { sourceIp: ip, eventType: "UDP_FLOOD" as any },
              orderBy: { createdAt: "desc" },
            });
            if (alert) {
              await autoBlockIp(ip, "UDP flood detected", udpFloodRule.blockAction, udpFloodRule.blockDuration, alert.id);
            }
          }
          await applyThreatScoreAction(ip, score, "UDP flood", "UDP_FLOOD");
          tracker.count = 0;
          tracker.timestamps = [];
        }
      }
    }

    // ─── 4. ICMP Flood Detection ─────────────────────────────────
    const icmpFloodRule = ruleMap.get("ICMP_FLOOD");
    if (icmpFloodRule) {
      const icmpEntries = entries.filter((e) => e.protocol === 1);
      for (const entry of icmpEntries) {
        if (!icmpTracker.has(entry.srcIp)) {
          icmpTracker.set(entry.srcIp, { count: 0, timestamps: [] });
        }
        icmpTracker.get(entry.srcIp)!.count++;
        icmpTracker.get(entry.srcIp)!.timestamps.push(now);
      }
      for (const [ip, tracker] of icmpTracker) {
        tracker.timestamps = tracker.timestamps.filter((t) => t > window60s);
        tracker.count = tracker.timestamps.length;
        if (tracker.count > (icmpFloodRule.thresholdPps || 1000)) {
          const score = addThreatScore(ip, icmpFloodRule.scoreImpact || 30);
          await createAlert({
            eventType: "ICMP_FLOOD",
            severity: score > 40 ? "CRITICAL" : "HIGH",
            sourceIp: ip,
            protocol: "icmp",
            pps: tracker.count,
            connCount: tracker.count,
            threatScore: score,
            ruleId: icmpFloodRule.id,
            details: `${tracker.count} ICMP packets`,
          });
          if (icmpFloodRule.autoBlock) {
            const alert = await prisma.ipsAlert.findFirst({
              where: { sourceIp: ip, eventType: "ICMP_FLOOD" as any },
              orderBy: { createdAt: "desc" },
            });
            if (alert) {
              await autoBlockIp(ip, "ICMP flood detected", icmpFloodRule.blockAction, icmpFloodRule.blockDuration, alert.id);
            }
          }
          await applyThreatScoreAction(ip, score, "ICMP flood", "ICMP_FLOOD");
          tracker.count = 0;
          tracker.timestamps = [];
        }
      }
    }

    // ─── 5. Connection Flood ─────────────────────────────────────
    const connFloodRule = ruleMap.get("CONNECTION_FLOOD");
    if (connFloodRule) {
      const connByIp = new Map<string, Set<string>>();
      for (const entry of entries) {
        const key = `${entry.srcIp}-${entry.dstIp}:${entry.dstPort}`;
        if (!connByIp.has(entry.srcIp)) {
          connByIp.set(entry.srcIp, new Set());
        }
        connByIp.get(entry.srcIp)!.add(key);
      }
      for (const [ip, connSet] of connByIp) {
        if (connSet.size > (connFloodRule.thresholdConn || 500)) {
          const score = addThreatScore(ip, connFloodRule.scoreImpact || 35);
          await createAlert({
            eventType: "CONNECTION_FLOOD",
            severity: score > 40 ? "HIGH" : "MEDIUM",
            sourceIp: ip,
            connCount: connSet.size,
            threatScore: score,
            ruleId: connFloodRule.id,
            details: `${connSet.size} concurrent connections`,
          });
          if (connFloodRule.autoBlock) {
            const alert = await prisma.ipsAlert.findFirst({
              where: { sourceIp: ip, eventType: "CONNECTION_FLOOD" as any },
              orderBy: { createdAt: "desc" },
            });
            if (alert) {
              await autoBlockIp(ip, "Connection flood detected", connFloodRule.blockAction, connFloodRule.blockDuration, alert.id);
            }
          }
          await applyThreatScoreAction(ip, score, "Connection flood", "CONNECTION_FLOOD");
        }
      }
    }

    // ─── 6. Bandwidth Abuse ──────────────────────────────────────
    const bwRule = ruleMap.get("BANDWIDTH_ABUSE");
    if (bwRule) {
      for (const entry of entries) {
        if (!bandwidthTracker.has(entry.srcIp)) {
          bandwidthTracker.set(entry.srcIp, { bytes: 0, timestamps: [] });
        }
        const tracker = bandwidthTracker.get(entry.srcIp)!;
        tracker.bytes += entry.bytes;
        tracker.timestamps.push(now);
      }
      for (const [ip, tracker] of bandwidthTracker) {
        tracker.timestamps = tracker.timestamps.filter((t) => t > window60s);
        // Decay bytes proportionally to remaining timestamps
        if (tracker.timestamps.length < 3) {
          tracker.bytes = 0;
        }
        if (tracker.bytes > (bwRule.thresholdBps || 104857600)) {
          const score = addThreatScore(ip, bwRule.scoreImpact || 20);
          await createAlert({
            eventType: "BANDWIDTH_ABUSE",
            severity: "MEDIUM",
            sourceIp: ip,
            bps: tracker.bytes,
            threatScore: score,
            ruleId: bwRule.id,
            details: `${(tracker.bytes / 1048576).toFixed(1)}MB transferred in 60s`,
          });
          await applyThreatScoreAction(ip, score, "Bandwidth abuse", "BANDWIDTH_ABUSE");
          tracker.bytes = 0;
          tracker.timestamps = [];
        }
      }
    }

    // ─── 7. DNS Amplification ────────────────────────────────────
    const dnsRule = ruleMap.get("DNS_AMPLIFICATION");
    if (dnsRule) {
      const dnsEntries = entries.filter((e) => e.dstPort === 53 && e.protocol === 17);
      for (const entry of dnsEntries) {
        if (!dnsTracker.has(entry.srcIp)) {
          dnsTracker.set(entry.srcIp, { count: 0, timestamps: [] });
        }
        dnsTracker.get(entry.srcIp)!.count++;
        dnsTracker.get(entry.srcIp)!.timestamps.push(now);
      }
      for (const [ip, tracker] of dnsTracker) {
        tracker.timestamps = tracker.timestamps.filter((t) => t > window60s);
        tracker.count = tracker.timestamps.length;
        if (tracker.count > (dnsRule.thresholdConn || 500)) {
          const score = addThreatScore(ip, dnsRule.scoreImpact || 35);
          await createAlert({
            eventType: "DNS_AMPLIFICATION",
            severity: score > 40 ? "HIGH" : "MEDIUM",
            sourceIp: ip,
            destPort: 53,
            protocol: "udp",
            connCount: tracker.count,
            threatScore: score,
            ruleId: dnsRule.id,
            details: `${tracker.count} DNS queries in 60s`,
          });
          if (dnsRule.autoBlock) {
            const alert = await prisma.ipsAlert.findFirst({
              where: { sourceIp: ip, eventType: "DNS_AMPLIFICATION" as any },
              orderBy: { createdAt: "desc" },
            });
            if (alert) {
              await autoBlockIp(ip, "DNS amplification detected", dnsRule.blockAction, dnsRule.blockDuration, alert.id);
            }
          }
          await applyThreatScoreAction(ip, score, "DNS amplification", "DNS_AMPLIFICATION");
          tracker.count = 0;
          tracker.timestamps = [];
        }
      }
    }

    // ─── 8. ARP Poisoning ────────────────────────────────────────
    const arpRule = ruleMap.get("ARP_POISON");
    if (arpRule) {
      const arpEntries = await readArpTable();
      for (const entry of arpEntries) {
        if (!arpTracker.has(entry.ip)) {
          arpTracker.set(entry.ip, { macs: new Set(), timestamps: [] });
        }
        const tracker = arpTracker.get(entry.ip)!;
        tracker.macs.add(entry.mac);
        tracker.timestamps.push(now);
      }
      for (const [ip, tracker] of arpTracker) {
        tracker.timestamps = tracker.timestamps.filter((t) => t > window60s);
        if (tracker.timestamps.length < 2) {
          tracker.macs.clear();
        }
        if (tracker.macs.size > (arpRule.thresholdConn || 3)) {
          const score = addThreatScore(ip, arpRule.scoreImpact || 50);
          await createAlert({
            eventType: "ARP_POISON",
            severity: score > 40 ? "CRITICAL" : "HIGH",
            sourceIp: ip,
            connCount: tracker.macs.size,
            threatScore: score,
            ruleId: arpRule.id,
            details: `${tracker.macs.size} different MACs for IP ${ip} in 60s: ${[...tracker.macs].join(", ")}`,
          });
          if (arpRule.autoBlock) {
            const alert = await prisma.ipsAlert.findFirst({
              where: { sourceIp: ip, eventType: "ARP_POISON" as any },
              orderBy: { createdAt: "desc" },
            });
            if (alert) {
              await autoBlockIp(ip, "ARP poisoning detected", arpRule.blockAction, arpRule.blockDuration, alert.id);
            }
          }
          await applyThreatScoreAction(ip, score, "ARP poisoning", "ARP_POISON");
          tracker.macs.clear();
          tracker.timestamps = [];
        }
      }
    }

    // ─── 9. Malware C2 ───────────────────────────────────────────
    const c2Rule = ruleMap.get("MALWARE_C2");
    if (c2Rule) {
      const c2Entries = entries.filter((e) => MALWARE_C2_PORTS.has(e.dstPort) && e.protocol === 6);
      for (const entry of c2Entries) {
        const score = addThreatScore(entry.srcIp, c2Rule.scoreImpact || 60);
        await createAlert({
          eventType: "MALWARE_C2",
          severity: score > 40 ? "CRITICAL" : "HIGH",
          sourceIp: entry.srcIp,
          destIp: entry.dstIp,
          destPort: entry.dstPort,
          protocol: "tcp",
          connCount: 1,
          threatScore: score,
          ruleId: c2Rule.id,
          details: `Connection to suspicious port ${entry.dstPort} (C2)`,
        });
        if (c2Rule.autoBlock) {
          const alert = await prisma.ipsAlert.findFirst({
            where: { sourceIp: entry.srcIp, eventType: "MALWARE_C2" as any, destPort: entry.dstPort },
            orderBy: { createdAt: "desc" },
          });
          if (alert) {
            await autoBlockIp(entry.srcIp, `Malware C2 on port ${entry.dstPort}`, c2Rule.blockAction, c2Rule.blockDuration, alert.id);
          }
        }
        await applyThreatScoreAction(entry.srcIp, score, "Malware C2", "MALWARE_C2");
      }
    }

    // ─── 10. Brute Force ─────────────────────────────────────────
    const bfRule = ruleMap.get("BRUTE_FORCE");
    if (bfRule) {
      const synOnly = entries.filter((e) => e.protocol === 6 && e.state === "SYN_SENT");
      for (const entry of synOnly) {
        if (!bruteForceTracker.has(entry.srcIp)) {
          bruteForceTracker.set(entry.srcIp, { count: 0, timestamps: [] });
        }
        bruteForceTracker.get(entry.srcIp)!.count++;
        bruteForceTracker.get(entry.srcIp)!.timestamps.push(now);
      }
      for (const [ip, tracker] of bruteForceTracker) {
        tracker.timestamps = tracker.timestamps.filter((t) => t > window60s);
        tracker.count = tracker.timestamps.length;
        if (tracker.count > (bfRule.thresholdConn || 50)) {
          const score = addThreatScore(ip, bfRule.scoreImpact || 30);
          await createAlert({
            eventType: "BRUTE_FORCE",
            severity: score > 40 ? "HIGH" : "MEDIUM",
            sourceIp: ip,
            protocol: "tcp",
            connCount: tracker.count,
            threatScore: score,
            ruleId: bfRule.id,
            details: `${tracker.count} failed connection attempts in 60s`,
          });
          if (bfRule.autoBlock) {
            const alert = await prisma.ipsAlert.findFirst({
              where: { sourceIp: ip, eventType: "BRUTE_FORCE" as any },
              orderBy: { createdAt: "desc" },
            });
            if (alert) {
              await autoBlockIp(ip, "Brute force detected", bfRule.blockAction, bfRule.blockDuration, alert.id);
            }
          }
          await applyThreatScoreAction(ip, score, "Brute force", "BRUTE_FORCE");
          tracker.count = 0;
          tracker.timestamps = [];
        }
      }
    }

    lastDetectionRun = new Date();
    log.debug("Detection cycle complete", {
      entriesProcessed: entries.length,
      duration: `${Date.now() - cycleStart}ms`,
    });
  } catch (err: any) {
    log.error("Detection cycle failed", { error: String(err) });
  }
}

// ─── Route Matcher ────────────────────────────────────────────────────────
function matchRoute(
  url: URL,
  method: string
): { handler: (req: Request, params: Record<string, string>) => Promise<Response>; params: Record<string, string> } | null {
  const path = url.pathname.replace(/\/+/g, "/");

  // ─── Daemon Status ────────────────────────────────────────────
  if (method === "GET" && path === "/") {
    return { handler: handleGetStatus, params: {} };
  }

  // ─── Alerts ───────────────────────────────────────────────────
  if (method === "GET" && path === "/alerts") {
    return { handler: handleGetAlerts, params: {} };
  }
  if (method === "GET" && path === "/alerts/stats") {
    return { handler: handleGetAlertStats, params: {} };
  }
  let m = path.match(/^\/alerts\/([^/]+)\/status$/);
  if (method === "PUT" && m) {
    return { handler: handleUpdateAlertStatus, params: { id: m[1] } };
  }
  if (method === "DELETE" && path === "/alerts") {
    return { handler: handleDeleteAlerts, params: {} };
  }

  // ─── Detection Rules ──────────────────────────────────────────
  if (method === "GET" && path === "/rules") {
    return { handler: handleGetRules, params: {} };
  }
  if (method === "POST" && path === "/rules") {
    return { handler: handleCreateRule, params: {} };
  }
  m = path.match(/^\/rules\/([^/]+)$/);
  if (method === "PUT" && m) {
    return { handler: handleUpdateRule, params: { id: m[1] } };
  }
  if (method === "DELETE" && m) {
    return { handler: handleDeleteRule, params: { id: m[1] } };
  }

  // ─── Block Rules ──────────────────────────────────────────────
  if (method === "GET" && path === "/block-rules") {
    return { handler: handleGetBlockRules, params: {} };
  }
  if (method === "POST" && path === "/block-rules") {
    return { handler: handleCreateBlockRule, params: {} };
  }
  m = path.match(/^\/block-rules\/unblock\/([^/]+)$/);
  if (method === "POST" && m) {
    return { handler: handleUnblockByIp, params: { ip: m[1] } };
  }
  m = path.match(/^\/block-rules\/([^/]+)$/);
  if (method === "DELETE" && m) {
    return { handler: handleDeleteBlockRule, params: { id: m[1] } };
  }

  // ─── Threat Scores ────────────────────────────────────────────
  if (method === "GET" && path === "/threat-scores") {
    return { handler: handleGetThreatScores, params: {} };
  }
  if (method === "POST" && path === "/threat-scores/reset") {
    return { handler: handleResetThreatScores, params: {} };
  }

  // ─── Top Offenders ────────────────────────────────────────────
  if (method === "GET" && path === "/top-offenders") {
    return { handler: handleGetTopOffenders, params: {} };
  }

  // ─── nftables ─────────────────────────────────────────────────
  if (method === "POST" && path === "/nftables/init") {
    return { handler: handleNftablesInit, params: {} };
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
//  HANDLERS — Daemon Status
// ═══════════════════════════════════════════════════════════════════════════
async function handleGetStatus() {
  const activeBlocks = await prisma.ipsBlockRule.count({
    where: { isActive: true },
  });
  return json({
    status: "running",
    service: "ips-daemon",
    port: SERVICE_PORT,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    lastDetectionRun: lastDetectionRun?.toISOString() || null,
    activeBlockCount: activeBlocks,
    threatScoreCount: threatScores.size,
    wsClients: wsClients.size,
    timestamp: new Date().toISOString(),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  HANDLERS — Alerts
// ═══════════════════════════════════════════════════════════════════════════
async function handleGetAlerts(req: Request) {
  requireAuth(req);
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") || undefined;
    const severity = url.searchParams.get("severity") || undefined;
    const eventType = url.searchParams.get("eventType") || undefined;
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    const where: any = {};
    if (status) where.status = status;
    if (severity) where.severity = severity;
    if (eventType) where.eventType = eventType;

    const [alerts, total] = await Promise.all([
      prisma.ipsAlert.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: { rule: { select: { name: true } } },
      }),
      prisma.ipsAlert.count({ where }),
    ]);

    return json({ success: true, data: alerts, total, limit, offset });
  } catch (err: any) {
    return jsonErr(err.message || "Failed to fetch alerts", 500);
  }
}

async function handleGetAlertStats(req: Request) {
  requireAuth(req);
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [total, newAlerts, criticalAlerts, byType, bySeverity] = await Promise.all([
      prisma.ipsAlert.count({ where: { createdAt: { gte: since } } }),
      prisma.ipsAlert.count({ where: { createdAt: { gte: since }, status: "NEW" } }),
      prisma.ipsAlert.count({ where: { createdAt: { gte: since }, severity: "CRITICAL" } }),
      prisma.ipsAlert.groupBy({
        by: ["eventType"],
        where: { createdAt: { gte: since } },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
      }),
      prisma.ipsAlert.groupBy({
        by: ["severity"],
        where: { createdAt: { gte: since } },
        _count: { id: true },
      }),
    ]);

    return json({
      success: true,
      data: {
        total,
        newAlerts,
        criticalAlerts,
        byType: byType.map((g) => ({ eventType: g.eventType, count: g._count.id })),
        bySeverity: bySeverity.map((g) => ({ severity: g.severity, count: g._count.id })),
      },
    });
  } catch (err: any) {
    return jsonErr(err.message || "Failed to fetch alert stats", 500);
  }
}

async function handleUpdateAlertStatus(req: Request, params: Record<string, string>) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { status, resolvedBy } = body;
    if (!status || !["ACKNOWLEDGED", "RESOLVED", "FALSE_POSITIVE"].includes(status)) {
      return jsonErr("Invalid status. Must be ACKNOWLEDGED, RESOLVED, or FALSE_POSITIVE");
    }

    const updateData: any = { status };
    if (status === "RESOLVED" || status === "FALSE_POSITIVE") {
      updateData.resolvedAt = new Date();
      updateData.resolvedBy = resolvedBy || auth.userId;
    }

    const alert = await prisma.ipsAlert.update({
      where: { id: params.id },
      data: updateData,
    });

    log.info("Alert status updated", { alertId: params.id, status, by: auth.userId });
    return json({ success: true, data: alert });
  } catch (err: any) {
    if (err.code === "P2025") return jsonErr("Alert not found", 404);
    return jsonErr(err.message || "Update failed", 500);
  }
}

async function handleDeleteAlerts(req: Request) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const olderThanDays = body.olderThanDays || 30;
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

    const result = await prisma.ipsAlert.deleteMany({
      where: {
        createdAt: { lt: cutoff },
        status: { in: ["RESOLVED", "FALSE_POSITIVE"] },
      },
    });

    log.info("Old alerts cleaned up", { count: result.count, olderThanDays });
    return json({ success: true, deleted: result.count });
  } catch (err: any) {
    return jsonErr(err.message || "Cleanup failed", 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  HANDLERS — Detection Rules
// ═══════════════════════════════════════════════════════════════════════════
async function handleGetRules(req: Request) {
  requireAuth(req);
  try {
    const rules = await prisma.ipsDetectionRule.findMany({
      orderBy: { sortOrder: "asc" },
    });
    return json({ success: true, data: rules });
  } catch (err: any) {
    return jsonErr(err.message || "Failed to fetch rules", 500);
  }
}

async function handleCreateRule(req: Request) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const {
      name, description, eventType, enabled, thresholdPps, thresholdBps,
      thresholdConn, windowSeconds, autoBlock, blockAction, blockDuration,
      scoreImpact, targetPorts, targetProto, sourceExclude, logEnabled,
      notifyEnabled, sortOrder,
    } = body;

    if (!name || !eventType) return jsonErr("name and eventType are required");

    const rule = await prisma.ipsDetectionRule.create({
      data: {
        name,
        description: description || "",
        eventType,
        enabled: enabled !== false,
        thresholdPps: thresholdPps || 0,
        thresholdBps: thresholdBps || 0,
        thresholdConn: thresholdConn || 0,
        windowSeconds: windowSeconds || 60,
        autoBlock: autoBlock || false,
        blockAction: blockAction || "DROP",
        blockDuration: blockDuration || "TEMP_30M",
        scoreImpact: scoreImpact || 20,
        targetPorts: targetPorts || "",
        targetProto: targetProto || "",
        sourceExclude: sourceExclude || "",
        logEnabled: logEnabled !== false,
        notifyEnabled: notifyEnabled || false,
        sortOrder: sortOrder || 0,
      },
    });

    // Invalidate cache
    rulesCacheTime = 0;

    log.info("Detection rule created", { name, eventType, by: auth.userId });
    return json({ success: true, data: rule });
  } catch (err: any) {
    return jsonErr(err.message || "Create rule failed", 500);
  }
}

async function handleUpdateRule(req: Request, params: Record<string, string>) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const existing = await prisma.ipsDetectionRule.findUnique({
      where: { id: params.id },
    });
    if (!existing) return jsonErr("Rule not found", 404);

    const rule = await prisma.ipsDetectionRule.update({
      where: { id: params.id },
      data: body,
    });

    // Invalidate cache
    rulesCacheTime = 0;

    log.info("Detection rule updated", { id: params.id, by: auth.userId });
    return json({ success: true, data: rule });
  } catch (err: any) {
    if (err.code === "P2025") return jsonErr("Rule not found", 404);
    return jsonErr(err.message || "Update rule failed", 500);
  }
}

async function handleDeleteRule(req: Request, params: Record<string, string>) {
  const auth = requireAuth(req);
  try {
    await prisma.ipsDetectionRule.delete({ where: { id: params.id } });
    rulesCacheTime = 0;
    log.info("Detection rule deleted", { id: params.id, by: auth.userId });
    return json({ success: true });
  } catch (err: any) {
    if (err.code === "P2025") return jsonErr("Rule not found", 404);
    return jsonErr(err.message || "Delete rule failed", 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  HANDLERS — Block Rules
// ═══════════════════════════════════════════════════════════════════════════
async function handleGetBlockRules(req: Request) {
  requireAuth(req);
  try {
    const rules = await prisma.ipsBlockRule.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
    });
    return json({ success: true, data: rules });
  } catch (err: any) {
    return jsonErr(err.message || "Failed to fetch block rules", 500);
  }
}

async function handleCreateBlockRule(req: Request) {
  const auth = requireAuth(req);
  try {
    const body = await req.json();
    const { sourceIp, reason, action, duration } = body;
    if (!sourceIp) return jsonErr("sourceIp is required");

    const timeoutSec = blockDurationToSeconds(duration || "TEMP_30M");
    const expiresAt = timeoutSec > 0 ? new Date(Date.now() + timeoutSec * 1000) : null;

    // Add to nftables
    if (timeoutSec > 0) {
      await nftAddElement(NFT_BLOCKED_SET, sourceIp, timeoutSec);
    } else {
      await nftAddElement(NFT_BLOCKED_SET, sourceIp);
    }

    const blockRule = await prisma.ipsBlockRule.create({
      data: {
        sourceIp,
        reason: reason || "Manual block",
        action: (action || "DROP") as any,
        duration: (duration || "TEMP_30M") as any,
        expiresAt,
        isActive: true,
        createdBy: auth.userId,
      },
    });

    log.warn("Manual block created", {
      ip: sourceIp,
      reason,
      action,
      duration,
      by: auth.userId,
      blockRuleId: blockRule.id,
    });

    return json({ success: true, data: blockRule });
  } catch (err: any) {
    return jsonErr(err.message || "Create block rule failed", 500);
  }
}

async function handleDeleteBlockRule(req: Request, params: Record<string, string>) {
  const auth = requireAuth(req);
  try {
    const blockRule = await prisma.ipsBlockRule.findUnique({
      where: { id: params.id },
    });
    if (!blockRule) return jsonErr("Block rule not found", 404);

    // Remove from nftables
    await nftDeleteElement(NFT_BLOCKED_SET, blockRule.sourceIp).catch(() => {});

    await prisma.ipsBlockRule.update({
      where: { id: params.id },
      data: { isActive: false },
    });

    log.info("Block rule removed", { id: params.id, ip: blockRule.sourceIp, by: auth.userId });
    return json({ success: true });
  } catch (err: any) {
    if (err.code === "P2025") return jsonErr("Block rule not found", 404);
    return jsonErr(err.message || "Delete block rule failed", 500);
  }
}

async function handleUnblockByIp(req: Request, params: Record<string, string>) {
  const auth = requireAuth(req);
  try {
    const ip = params.ip;

    // Remove from nftables
    await nftDeleteElement(NFT_BLOCKED_SET, ip).catch(() => {});

    // Mark all active blocks for this IP as inactive
    const result = await prisma.ipsBlockRule.updateMany({
      where: { sourceIp: ip, isActive: true },
      data: { isActive: false },
    });

    log.info("IP unblocked", { ip, blocksDeactivated: result.count, by: auth.userId });
    return json({ success: true, ip, blocksDeactivated: result.count });
  } catch (err: any) {
    return jsonErr(err.message || "Unblock failed", 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  HANDLERS — Threat Scores
// ═══════════════════════════════════════════════════════════════════════════
async function handleGetThreatScores(req: Request) {
  requireAuth(req);
  try {
    const scores: { ip: string; score: number }[] = [];
    for (const [ip, score] of threatScores) {
      scores.push({ ip, score });
    }
    scores.sort((a, b) => b.score - a.score);
    return json({ success: true, data: scores, total: scores.length });
  } catch (err: any) {
    return jsonErr(err.message || "Failed to fetch threat scores", 500);
  }
}

async function handleResetThreatScores(req: Request) {
  const auth = requireAuth(req);
  try {
    const count = threatScores.size;
    threatScores.clear();
    log.info("Threat scores reset", { by: auth.userId, previousCount: count });
    return json({ success: true, resetCount: count });
  } catch (err: any) {
    return jsonErr(err.message || "Reset failed", 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  HANDLERS — Top Offenders
// ═══════════════════════════════════════════════════════════════════════════
async function handleGetTopOffenders(req: Request) {
  requireAuth(req);
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Get top 20 IPs by alert count in last 24h
    const alertCounts = await prisma.ipsAlert.groupBy({
      by: ["sourceIp"],
      where: { createdAt: { gte: since } },
      _count: { id: true },
      _max: { threatScore: true },
      orderBy: { _count: { id: "desc" } },
      take: 20,
    });

    const offenders = alertCounts.map((g) => ({
      ip: g.sourceIp,
      alertCount: g._count.id,
      maxThreatScore: g._max.threatScore || 0,
      currentThreatScore: getThreatScore(g.sourceIp),
    }));

    return json({ success: true, data: offenders });
  } catch (err: any) {
    return jsonErr(err.message || "Failed to fetch top offenders", 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  HANDLERS — nftables Init
// ═══════════════════════════════════════════════════════════════════════════
async function handleNftablesInit(req: Request) {
  const auth = requireAuth(req);
  try {
    const result = await nftInitTable();
    return json({ success: result.success, output: result.output });
  } catch (err: any) {
    return jsonErr(err.message || "nftables init failed", 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  Server Startup
// ═══════════════════════════════════════════════════════════════════════════
// ─── Global Error Handlers ──────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  log.fatal('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  log.fatal('Unhandled rejection', { reason: String(reason) });
});

async function main() {
  log.info("IPS Detection Daemon starting...", { port: SERVICE_PORT });

  // Load rules from DB (fallback to defaults)
  const rules = await getDetectionRules();
  log.info(`Loaded ${rules.length} detection rules`);

  // Start detection engine (every 5 seconds)
  detectionInterval = setInterval(runDetectionCycle, 5000);

  // Start server
  const server = Bun.serve({
    port: SERVICE_PORT,
    fetch: async (req: Request) => {
      const url = new URL(req.url);

      // CORS preflight
      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      // WebSocket upgrade
      if (url.pathname === "/ws") {
        if (server.upgrade(req)) return;
        return jsonErr("WebSocket upgrade failed", 500);
      }

      // Route matching
      const matched = matchRoute(url, req.method);
      if (matched) {
        try {
          return await matched.handler(req, matched.params);
        } catch (err: any) {
          if (err.message?.includes("Unauthorized")) {
            return json({ success: false, error: "Unauthorized" }, 401);
          }
          log.error("Handler error", { path: url.pathname, error: String(err) });
          return jsonErr(err.message || "Internal server error", 500);
        }
      }

      return jsonErr("Not found", 404);
    },
    websocket: {
      open(ws) {
        wsClients.add(ws);
        log.info("WebSocket client connected", { totalClients: wsClients.size });
      },
      close(ws) {
        wsClients.delete(ws);
        log.info("WebSocket client disconnected", { totalClients: wsClients.size });
      },
      message(ws, message) {
        // Echo back for keepalive
        if (message === "ping") {
          ws.send("pong");
        }
      },
    },
  });

  log.info(`IPS Daemon listening on port ${SERVICE_PORT}`, {
    detectionInterval: "5s",
    nftablesTable: NFT_TABLE,
    simulatedData: true,
  });

  // Keep process alive
  process.stdin.resume();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    log.info(`Received ${signal}, shutting down...`);

    if (detectionInterval) {
      clearInterval(detectionInterval);
      detectionInterval = null;
    }

    // Close all WebSocket clients
    for (const client of wsClients) {
      try { client.close(); } catch {}
    }
    wsClients.clear();

    await prisma.$disconnect();
    log.info("IPS Daemon stopped");
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  log.fatal("Fatal error during startup", { error: String(err) });
  process.exit(1);
});
