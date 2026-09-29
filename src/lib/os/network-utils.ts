/**
 * Cryptsk — Debian 13 OS Network Utilities Library
 *
 * Comprehensive network management functions for MultiWAN / ISP gateway operations.
 * All OS commands use `execFile` with argument arrays (never `exec` or string interpolation).
 * Every public function validates inputs with strict regex patterns.
 *
 * @module network-utils
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { readFileSync, writeFileSync, appendFileSync, readdirSync, copyFileSync } from "fs";

const execFileAsync = promisify(execFile);

// ─── Input Validation ──────────────────────────────────────────────

const RE_IFACE = /^[a-zA-Z0-9._-]+$/;
const RE_CIDR = /^[a-zA-Z0-9./:]+$/;
const RE_HOST = /^[a-zA-Z0-9._-]+$/;
const RE_RATE = /^[0-9]+(kbit|mbit|gbit|Kbit|Mbit|Gbit|bps|KB|MB|GB|kbps|Mbps|Gbps)$/;

/** Validate interface name — only safe characters */
function validateIface(name: string): string {
  if (!name || !RE_IFACE.test(name)) throw new Error(`Invalid interface name: ${name}`);
  return name;
}

/** Validate CIDR / IP address */
function validateCidr(cidr: string): string {
  if (!cidr || !RE_CIDR.test(cidr)) throw new Error(`Invalid CIDR/IP: ${cidr}`);
  return cidr;
}

/** Validate hostname */
function validateHost(host: string): string {
  if (!host || !RE_HOST.test(host)) throw new Error(`Invalid hostname: ${host}`);
  return host;
}

/** Validate rate string (e.g., "100mbit", "1gbit") */
function validateRate(rate: string): string {
  if (!rate || !RE_RATE.test(rate)) throw new Error(`Invalid rate: ${rate}`);
  return rate;
}

// ─── Internal Helpers ──────────────────────────────────────────────

/** Run a command with argument array and return trimmed stdout. Returns "" on error. */
async function run(args: string[], timeout = 10000): Promise<string> {
  try {
    const [cmd, ...rest] = args;
    const { stdout } = await execFileAsync(cmd, rest, { timeout, encoding: "utf-8" });
    return stdout.trim();
  } catch {
    return "";
  }
}

/** Run a JSON command and parse result. Returns [] on error. */
async function runJson<T = any>(args: string[], timeout = 10000): Promise<T[]> {
  try {
    const [cmd, ...rest] = args;
    const { stdout } = await execFileAsync(cmd, rest, { timeout, encoding: "utf-8" });
    const parsed = JSON.parse(stdout.trim());
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Read a single sysfs/procfs value. Returns "" on error. */
function sysfs(path: string): string {
  try {
    return readFileSync(path, "utf-8").trim();
  } catch {
    return "";
  }
}

// ─── Exported Types ───────────────────────────────────────────────

export interface WanLinkInfo {
  name: string;
  type: string;        // PHYSICAL, WIRELESS, VLAN, BOND, BRIDGE
  mac: string;
  ipv4: string;        // primary CIDR
  secondaryIps: string[];
  ipv6: string;
  gateway: string;
  speed: string;       // e.g. "1000Mbps"
  status: string;      // UP, DOWN
  carrier: boolean;
  mtu: number;
  rxBytes: number;
  txBytes: number;
  rxPackets: number;
  txPackets: number;
  rxErrors: number;
  txErrors: number;
  rxDrop: number;
  txDrop: number;
  uptime: string;
}

export interface RouteInfo {
  destination: string;
  gateway: string;
  dev: string;
  metric: number;
  proto: string;
  scope: string;
  type: string;
  table: string;
  prefsrc: string;
}

export interface TrafficStats {
  rxBytes: number;
  txBytes: number;
  rxPackets: number;
  txPackets: number;
  rxErrors: number;
  txErrors: number;
  rxDrop: number;
  txDrop: number;
}

export interface PingResult {
  alive: boolean;
  avgLatency: number | null;
  packetLoss: number;
  minLatency: number | null;
  maxLatency: number | null;
  output?: string;
  error?: string;
}

export interface ArpEntry {
  ip: string;
  mac: string;
  dev: string;
  state: string;
}

// ─── Internal helpers for getWanLinks ──────────────────────────────

/** Get link speed in Mbps from sysfs */
function getSpeedMbps(iface: string): number {
  const speed = parseInt(sysfs(`/sys/class/net/${iface}/speed`));
  if (isNaN(speed) || speed <= 0) {
    if (iface.startsWith("eth") || iface.startsWith("enp") || iface.startsWith("ens")) return 1000;
    if (iface.startsWith("wl")) return 0;
    return 0;
  }
  return speed;
}

/** Format speed to human-readable string */
function formatSpeed(mbps: number): string {
  if (mbps <= 0) return "—";
  return mbps >= 1000 ? `${(mbps / 1000).toFixed(0)}Gbps` : `${mbps}Mbps`;
}

/** Determine interface type from name and properties */
function getIfaceType(name: string, isPhysical: boolean, master?: string): string {
  if (name === "lo") return "LOOPBACK";
  if (name.startsWith("wl") || name.startsWith("wlan")) return "WIRELESS";
  if (name.startsWith("docker") || name.startsWith("veth")) return "DOCKER";
  if (name.startsWith("br") || name.startsWith("bridge") || name.startsWith("virbr")) return "BRIDGE";
  if (name.startsWith("bond")) return "BOND";
  if (master) return "VLAN";
  if (/\.\d+$/.test(name)) return "VLAN";
  if (isPhysical) return "PHYSICAL";
  return "VIRTUAL";
}

/** Get physical interfaces from /sys/class/net */
function getPhysicalInterfaces(): Set<string> {
  try {
    return readdirSync("/sys/class/net/")
      .filter((name: string) => {
        try {
          readFileSync(`/sys/class/net/${name}/device`);
          return true;
        } catch {
          return false;
        }
      })
      .reduce((set: Set<string>, name: string) => { set.add(name); return set; }, new Set<string>());
  } catch {
    return new Set();
  }
}

/** Parse /proc/net/dev for all interface traffic counters */
function parseAllTraffic(): Record<string, TrafficStats> {
  const counters: Record<string, TrafficStats> = {};
  const procDev = sysfs("/proc/net/dev");
  if (!procDev) return counters;

  const lines = procDev.split("\n").slice(2); // skip header lines
  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const name = line.substring(0, colonIdx).trim();
    const fields = line.substring(colonIdx + 1).trim().split(/\s+/);
    if (fields.length >= 16) {
      counters[name] = {
        rxBytes: parseInt(fields[0]) || 0,
        rxPackets: parseInt(fields[1]) || 0,
        rxErrors: parseInt(fields[2]) || 0,
        rxDrop: parseInt(fields[4]) || 0,
        txBytes: parseInt(fields[8]) || 0,
        txPackets: parseInt(fields[9]) || 0,
        txErrors: parseInt(fields[10]) || 0,
        txDrop: parseInt(fields[12]) || 0,
      };
    }
  }
  return counters;
}

// ═══════════════════════════════════════════════════════════════════
// 1. WAN LINK MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

/**
 * Get all WAN-like interfaces with full details.
 * Uses: ip -j link show, ip -j addr show, ip -j route show, /proc/net/dev
 */
export async function getWanLinks(): Promise<WanLinkInfo[]> {
  try {
    const links: any[] = await runJson(["ip", "-j", "link", "show"]);
    const addrs: any[] = await runJson(["ip", "-j", "addr", "show"]);
    const routes: any[] = await runJson(["ip", "-j", "route", "show"]);
    const traffic = parseAllTraffic();
    const physicalIfaces = getPhysicalInterfaces();

    // Build default gateway map: dev -> gateway
    const defaultGatewayMap = new Map<string, string>();
    for (const route of routes) {
      if (route.dst === "default" && route.gateway) {
        defaultGatewayMap.set(route.dev, route.gateway);
      }
    }

    // Filter out loopback and docker/veth interfaces
    const filtered = links.filter((link: any) => {
      const name = link.ifname;
      if (name === "lo") return false;
      if (name.startsWith("docker") || name.startsWith("veth")) return false;
      return true;
    });

    return filtered.map((link: any) => {
      const name = link.ifname;
      const isPhysical = physicalIfaces.has(name);
      const type = getIfaceType(name, isPhysical, link.master);
      const addrLink = addrs.find((a: any) => a.ifname === name);
      const inetAddrs = addrLink?.addr_info?.filter((a: any) => a.family === "inet") || [];
      const ipv4Info = inetAddrs[0];
      const ipv6Info = addrLink?.addr_info?.find((a: any) => a.family === "inet6");
      const secondaryIps = inetAddrs.slice(1).map((a: any) => `${a.local}/${a.prefixlen}`);

      const counters = traffic[name] || {
        rxBytes: 0, txBytes: 0, rxPackets: 0, txPackets: 0,
        rxErrors: 0, txErrors: 0, rxDrop: 0, txDrop: 0,
      };

      const speed = getSpeedMbps(name);
      const carrier = link.operstate === "UP" || link.operstate === "UNKNOWN";

      // Get uptime from carrier file (timestamp of link going up)
      let uptime = "—";
      try {
        const carrierFile = sysfs(`/sys/class/net/${name}/carrier`);
        const ifOperstate = sysfs(`/sys/class/net/${name}/operstate`);
        if (carrierFile === "1" || ifOperstate === "up") {
          // Approximate: use /sys/class/net/<name>/operstate - no direct uptime,
          // so we read the carrier change time from sysfs (if available)
          const carrierChanges = sysfs(`/sys/class/net/${name}/carrier_changes`);
          if (carrierChanges) uptime = `${carrierChanges} changes`;
        }
      } catch {
        // ignore
      }

      return {
        name,
        type,
        mac: link.address || "",
        ipv4: ipv4Info ? `${ipv4Info.local}/${ipv4Info.prefixlen}` : "",
        secondaryIps,
        ipv6: ipv6Info ? `${ipv6Info.local}/${ipv6Info.prefixlen}` : "",
        gateway: defaultGatewayMap.get(name) || "",
        speed: formatSpeed(speed),
        status: link.operstate === "UP" || link.operstate === "UNKNOWN" ? "UP" : "DOWN",
        carrier,
        mtu: link.mtu || 1500,
        rxBytes: counters.rxBytes,
        txBytes: counters.txBytes,
        rxPackets: counters.rxPackets,
        txPackets: counters.txPackets,
        rxErrors: counters.rxErrors,
        txErrors: counters.txErrors,
        rxDrop: counters.rxDrop,
        txDrop: counters.txDrop,
        uptime,
      };
    });
  } catch (error) {
    console.error("[network-utils] getWanLinks error:", error);
    return [];
  }
}

/**
 * Add an IP address to an interface.
 * Uses: ip addr add <cidr> dev <iface>
 */
export async function addIpToInterface(iface: string, cidr: string): Promise<void> {
  const safeIface = validateIface(iface);
  const safeCidr = validateCidr(cidr);
  await execFileAsync("ip", ["addr", "add", safeCidr, "dev", safeIface], { timeout: 10000 });
}

/**
 * Remove an IP address from an interface.
 * Uses: ip addr del <cidr> dev <iface>
 */
export async function removeIpFromInterface(iface: string, cidr: string): Promise<void> {
  const safeIface = validateIface(iface);
  const safeCidr = validateCidr(cidr);
  await execFileAsync("ip", ["addr", "del", safeCidr, "dev", safeIface], { timeout: 10000 });
}

/**
 * Flush all IP addresses from an interface.
 * Uses: ip addr flush dev <iface>
 */
export async function flushInterfaceIps(iface: string): Promise<void> {
  const safeIface = validateIface(iface);
  await execFileAsync("ip", ["addr", "flush", "dev", safeIface], { timeout: 10000 });
}

/**
 * Bring an interface UP.
 * Uses: ip link set <iface> up
 */
export async function setInterfaceUp(iface: string): Promise<void> {
  const safeIface = validateIface(iface);
  await execFileAsync("ip", ["link", "set", safeIface, "up"], { timeout: 10000 });
}

/**
 * Bring an interface DOWN.
 * Uses: ip link set <iface> down
 */
export async function setInterfaceDown(iface: string): Promise<void> {
  const safeIface = validateIface(iface);
  await execFileAsync("ip", ["link", "set", safeIface, "down"], { timeout: 10000 });
}

/**
 * Set interface MTU.
 * Uses: ip link set <iface> mtu <mtu>
 */
export async function setInterfaceMtu(iface: string, mtu: number): Promise<void> {
  const safeIface = validateIface(iface);
  const mtuNum = Math.max(576, Math.min(9000, Math.floor(mtu)));
  await execFileAsync("ip", ["link", "set", safeIface, "mtu", String(mtuNum)], { timeout: 10000 });
}

// ═══════════════════════════════════════════════════════════════════
// 2. ROUTE TABLE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

/**
 * Get the full route table.
 * Uses: ip -j route show
 */
export async function getRouteTable(): Promise<RouteInfo[]> {
  try {
    const routes: any[] = await runJson(["ip", "-j", "route", "show"]);
    return routes.map((r: any) => ({
      destination: r.dst || "default",
      gateway: r.gateway || "",
      dev: r.dev || "",
      metric: r.metric || 0,
      proto: r.proto || "",
      scope: r.scope || "",
      type: r.type || "",
      table: r.table || "main",
      prefsrc: r.prefsrc || "",
    }));
  } catch {
    return [];
  }
}

/**
 * Get the current default gateway.
 * Uses: ip route show default
 */
export async function getDefaultGateway(): Promise<{ gateway: string; dev: string } | null> {
  try {
    const output = await run(["ip", "route", "show", "default"]);
    if (!output) return null;
    const viaMatch = output.match(/via\s+(\S+)/);
    const devMatch = output.match(/dev\s+(\S+)/);
    if (!viaMatch || !devMatch) return null;
    return { gateway: viaMatch[1], dev: devMatch[1] };
  } catch {
    return null;
  }
}

/**
 * Add a route to the routing table.
 * Uses: ip route add <dest> [via <gateway>] [dev <iface>] [metric <n>]
 */
export async function addRoute(dest: string, via?: string, dev?: string, metric?: number): Promise<void> {
  const safeDest = validateCidr(dest);
  const args: string[] = ["route", "add", safeDest];
  if (via) args.push("via", validateCidr(via));
  if (dev) args.push("dev", validateIface(dev));
  if (metric !== undefined) args.push("metric", String(Math.max(0, metric)));
  await execFileAsync("ip", args, { timeout: 10000 });
}

/**
 * Delete a route from the routing table.
 * Uses: ip route del <dest> [via <gateway>] [dev <iface>]
 */
export async function deleteRoute(dest: string, via?: string, dev?: string): Promise<void> {
  const safeDest = validateCidr(dest);
  const args: string[] = ["route", "del", safeDest];
  if (via) args.push("via", validateCidr(via));
  if (dev) args.push("dev", validateIface(dev));
  await execFileAsync("ip", args, { timeout: 10000 });
}

/**
 * Add a default gateway.
 * Uses: ip route add default via <gateway> dev <dev> [metric <n>]
 */
export async function addDefaultGateway(gateway: string, dev: string, metric?: number): Promise<void> {
  const safeGateway = validateCidr(gateway);
  const safeDev = validateIface(dev);
  const args: string[] = ["route", "add", "default", "via", safeGateway, "dev", safeDev];
  if (metric !== undefined) args.push("metric", String(Math.max(0, metric)));
  await execFileAsync("ip", args, { timeout: 10000 });
}

/**
 * Delete a default gateway.
 * Uses: ip route del default via <gateway> dev <dev>
 */
export async function deleteDefaultGateway(gateway: string, dev: string): Promise<void> {
  const safeGateway = validateCidr(gateway);
  const safeDev = validateIface(dev);
  await execFileAsync("ip", ["route", "del", "default", "via", safeGateway, "dev", safeDev], { timeout: 10000 });
}

// ═══════════════════════════════════════════════════════════════════
// 3. TRAFFIC MONITORING (real /proc/net/dev data)
// ═══════════════════════════════════════════════════════════════════

/**
 * Get traffic statistics for a single interface.
 * Uses: /proc/net/dev (parsed for the specific interface)
 */
export async function getInterfaceTraffic(iface: string): Promise<TrafficStats> {
  const safeIface = validateIface(iface);
  const all = parseAllTraffic();
  return all[safeIface] || {
    rxBytes: 0, txBytes: 0, rxPackets: 0, txPackets: 0,
    rxErrors: 0, txErrors: 0, rxDrop: 0, txDrop: 0,
  };
}

/**
 * Get traffic statistics for ALL interfaces at once.
 * Uses: /proc/net/dev (read once, parse all)
 */
export async function getAllTraffic(): Promise<Record<string, TrafficStats>> {
  return parseAllTraffic();
}

// ═══════════════════════════════════════════════════════════════════
// 4. FAILOVER & HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════

/**
 * Ping a host and return latency / packet loss stats.
 * Uses: ping -c <count> -W 2 <host>
 */
export async function pingCheck(host: string, count: number = 3): Promise<PingResult> {
  const safeHost = validateHost(host);
  const safeCount = Math.max(1, Math.min(100, Math.floor(count)));

  // ── Try ICMP ping first ──
  try {
    const { stdout } = await execFileAsync("ping", ["-c", String(safeCount), "-W", "2", safeHost], {
      timeout: (safeCount * 3 + 5) * 1000,
      encoding: "utf-8",
    });

    const output = stdout.trim();

    const lossMatch = output.match(/(\d+)%\s*packet\s*loss/);
    const packetLoss = lossMatch ? parseFloat(lossMatch[1]) : 100;

    const rttMatch = output.match(/rtt\s+min\/avg\/max\/\w+\s*=\s*([\d.]+)\/([\d.]+)\/([\d.]+)/);
    const minLatency: number | null = rttMatch ? parseFloat(rttMatch[1]) : null;
    const avgLatency: number | null = rttMatch ? parseFloat(rttMatch[2]) : null;
    const maxLatency: number | null = rttMatch ? parseFloat(rttMatch[3]) : null;

    const receivedMatch = output.match(/(\d+)\s+received/);
    const received = receivedMatch ? parseInt(receivedMatch[1]) : 0;

    return {
      alive: received > 0,
      avgLatency,
      packetLoss,
      minLatency,
      maxLatency,
      output,
    };
  } catch (err: any) {
    const errMsg = String(err?.message || err || "");

    // ── Detect sandbox restriction (no ICMP raw sockets) ──
    if (errMsg.includes("Operation not permitted") || errMsg.includes("SOCK_RAW") || errMsg.includes("cap_net_raw")) {
      // Fall back to TCP connect probe on DNS port 53 (more universally reachable than port 80)
      return await tcpProbe(safeHost, safeCount, 53);
    }

    // ── Unknown error ──
    return {
      alive: false,
      avgLatency: null,
      packetLoss: 100,
      minLatency: null,
      maxLatency: null,
      error: `ping failed: ${errMsg}`,
    };
  }
}

/**
 * TCP-based connectivity probe (fallback when ICMP is blocked).
 * Connects to specified port (default 53 for DNS) and measures round-trip latency.
 */
async function tcpProbe(host: string, count: number = 3, port: number = 53): Promise<PingResult> {
  const net = await import("net");
  const results: number[] = [];
  let successCount = 0;

  for (let i = 0; i < count; i++) {
    const start = process.hrtime.bigint();
    try {
      await new Promise<void>((resolve, reject) => {
        const sock = new net.Socket();
        sock.setTimeout(3000);
        sock.on("connect", () => { sock.destroy(); resolve(); });
        sock.on("timeout", () => { sock.destroy(); reject(new Error("timeout")); });
        sock.on("error", (e) => { sock.destroy(); reject(e); });
        sock.connect(port, host);
      });
      const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      results.push(elapsedMs);
      successCount++;
    } catch {
      results.push(-1); // failed probe
    }
    // Small delay between probes
    if (i < count - 1) await new Promise((r) => setTimeout(r, 300));
  }

  const successfulLatencies = results.filter((r) => r >= 0);
  const avgLatency = successfulLatencies.length > 0
    ? successfulLatencies.reduce((a, b) => a + b, 0) / successfulLatencies.length
    : null;
  const minLatency = successfulLatencies.length > 0 ? Math.min(...successfulLatencies) : null;
  const maxLatency = successfulLatencies.length > 0 ? Math.max(...successfulLatencies) : null;
  const packetLoss = count > 0 ? ((count - successCount) / count) * 100 : 100;

  const output = [
    `TCP probe to ${host}:${port} (${count} attempts)`,
    `Success: ${successCount}/${count}, Loss: ${packetLoss.toFixed(0)}%`,
    ...(avgLatency !== null ? [`Latency: min=${minLatency!.toFixed(1)}ms avg=${avgLatency.toFixed(1)}ms max=${maxLatency!.toFixed(1)}ms`] : []),
    `(ICMP ping blocked — using TCP port ${port} probe as fallback)`,
  ].join("\n");

  return {
    alive: successCount > 0,
    avgLatency,
    packetLoss: Math.round(packetLoss),
    minLatency,
    maxLatency,
    output,
    error: `ICMP ping blocked by environment — results from TCP port ${port} probe (on Debian 13 server, real ICMP ping will work)`,
  };
}

/**
 * Get the ARP table.
 * Uses: ip -j neigh show
 */
export async function getArpTable(): Promise<ArpEntry[]> {
  try {
    const entries: any[] = await runJson(["ip", "-j", "neigh", "show"]);
    return entries.map((e: any) => ({
      ip: e.dst || "",
      mac: e.lladdr || "",
      dev: e.dev || "",
      state: (e.nud || "").toUpperCase().replace(/INCOMPLETE/g, "FAILED"),
    }));
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════
// 5. NAT & FIREWALL HELPERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Get current NAT rules (read-only).
 * Uses: iptables -t nat -L -n --line-numbers
 */
export async function getNatRules(): Promise<string> {
  try {
    const { stdout } = await execFileAsync("iptables", ["-t", "nat", "-L", "-n", "--line-numbers"], {
      timeout: 10000,
      encoding: "utf-8",
    });
    return stdout.trim();
  } catch {
    return "Failed to read NAT rules. iptables may not be available.";
  }
}

/**
 * Enable NAT masquerade on an interface.
 * Uses: iptables -t nat -A POSTROUTING -o <iface> -j MASQUERADE
 */
export async function enableMasquerade(outIface: string): Promise<void> {
  const safeIface = validateIface(outIface);
  await execFileAsync("iptables", ["-t", "nat", "-A", "POSTROUTING", "-o", safeIface, "-j", "MASQUERADE"], {
    timeout: 10000,
  });
}

/**
 * Disable NAT masquerade on an interface.
 * Uses: iptables -t nat -D POSTROUTING -o <iface> -j MASQUERADE
 */
export async function disableMasquerade(outIface: string): Promise<void> {
  const safeIface = validateIface(outIface);
  await execFileAsync("iptables", ["-t", "nat", "-D", "POSTROUTING", "-o", safeIface, "-j", "MASQUERADE"], {
    timeout: 10000,
  });
}

// ═══════════════════════════════════════════════════════════════════
// 6. BANDWIDTH SHAPING (tc/htb)
// ═══════════════════════════════════════════════════════════════════

/**
 * Show tc qdisc (queuing discipline) stats for an interface.
 * Uses: tc -s qdisc show dev <iface>
 */
export async function getTcQdisc(iface: string): Promise<string> {
  const safeIface = validateIface(iface);
  try {
    const { stdout } = await execFileAsync("tc", ["-s", "qdisc", "show", "dev", safeIface], {
      timeout: 10000,
      encoding: "utf-8",
    });
    return stdout.trim();
  } catch {
    return "";
  }
}

/**
 * Show tc class stats for an interface.
 * Uses: tc -s class show dev <iface>
 */
export async function getTcClass(iface: string): Promise<string> {
  const safeIface = validateIface(iface);
  try {
    const { stdout } = await execFileAsync("tc", ["-s", "class", "show", "dev", safeIface], {
      timeout: 10000,
      encoding: "utf-8",
    });
    return stdout.trim();
  } catch {
    return "";
  }
}

/**
 * Show tc filter stats for an interface.
 * Uses: tc -s filter show dev <iface>
 */
export async function getTcFilter(iface: string): Promise<string> {
  const safeIface = validateIface(iface);
  try {
    const { stdout } = await execFileAsync("tc", ["-s", "filter", "show", "dev", safeIface], {
      timeout: 10000,
      encoding: "utf-8",
    });
    return stdout.trim();
  } catch {
    return "";
  }
}

/**
 * Set HTB (Hierarchical Token Bucket) qdisc on an interface.
 * Uses:
 *   tc qdisc add dev <iface> root handle 1: htb default 10
 *   tc class add dev <iface> parent 1: classid 1:1 htb rate <rate> ceil <ceil>
 */
export async function setHtbQdisc(iface: string, rate: string, ceil: string): Promise<void> {
  const safeIface = validateIface(iface);
  const safeRate = validateRate(rate);
  const safeCeil = validateRate(ceil);

  // First, delete existing root qdisc if any (ignore error)
  try {
    await execFileAsync("tc", ["qdisc", "del", "dev", safeIface, "root"], { timeout: 5000 });
  } catch {
    // ignore - may not exist
  }

  // Add HTB root qdisc
  await execFileAsync("tc", ["qdisc", "add", "dev", safeIface, "root", "handle", "1:", "htb", "default", "10"], {
    timeout: 10000,
  });

  // Add root class with rate and ceil
  await execFileAsync("tc", ["class", "add", "dev", safeIface, "parent", "1:", "classid", "1:1", "htb", "rate", safeRate, "ceil", safeCeil], {
    timeout: 10000,
  });
}

/**
 * Delete tc qdisc on an interface.
 * Uses: tc qdisc del dev <iface> root
 */
export async function deleteTcQdisc(iface: string): Promise<void> {
  const safeIface = validateIface(iface);
  await execFileAsync("tc", ["qdisc", "del", "dev", safeIface, "root"], { timeout: 10000 });
}

// ═══════════════════════════════════════════════════════════════════
// 7. NETWORK CONFIG PERSISTENCE (Debian 13 /etc/network/interfaces)
// ═══════════════════════════════════════════════════════════════════

/**
 * Read the network interfaces configuration file.
 * Uses: readFileSync /etc/network/interfaces
 */
export async function readNetworkInterfaces(): Promise<string> {
  try {
    return readFileSync("/etc/network/interfaces", "utf-8");
  } catch {
    return "# /etc/network/interfaces not found or not readable";
  }
}

/**
 * Write the network interfaces configuration file (with automatic backup).
 * Uses: writeFileSync /etc/network/interfaces (backed up first)
 */
export async function writeNetworkInterfaces(content: string): Promise<void> {
  const interfacesPath = "/etc/network/interfaces";
  const backupPath = `${interfacesPath}.bak.${Date.now()}`;
  try {
    copyFileSync(interfacesPath, backupPath);
  } catch {
    // Backup may fail if file doesn't exist yet - that's OK for first write
  }
  writeFileSync(interfacesPath, content, "utf-8");
}

/**
 * Restart networking service.
 * Uses: systemctl restart networking (or systemctl restart NetworkManager)
 */
export async function restartNetworking(): Promise<void> {
  try {
    await execFileAsync("systemctl", ["restart", "networking"], { timeout: 30000 });
  } catch {
    // Fallback: try NetworkManager
    try {
      await execFileAsync("systemctl", ["restart", "NetworkManager"], { timeout: 30000 });
    } catch {
      throw new Error("Failed to restart networking service");
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// 8. DNS RESOLUTION
// ═══════════════════════════════════════════════════════════════════

/**
 * Resolve a hostname to IP addresses.
 * Uses: dig +short <hostname> (with nslookup fallback)
 */
export async function resolveHostname(hostname: string): Promise<string[]> {
  const safeHost = validateHost(hostname);

  // Try dig first (more reliable output format)
  try {
    const { stdout } = await execFileAsync("dig", ["+short", safeHost], {
      timeout: 10000,
      encoding: "utf-8",
    });
    const ips = stdout.trim().split("\n").map((l) => l.trim()).filter(Boolean);
    // Filter out comments/extra lines from dig
    const validIps = ips.filter((ip) => /^\d+\.\d+\.\d+\.\d+$/.test(ip) || /^[0-9a-fA-F:]+$/.test(ip));
    if (validIps.length > 0) return validIps;
  } catch {
    // dig not available, try nslookup
  }

  // Fallback: nslookup
  try {
    const { stdout } = await execFileAsync("nslookup", [safeHost], {
      timeout: 10000,
      encoding: "utf-8",
    });
    const addresses: string[] = [];
    const lines = stdout.split("\n");
    let inAnswer = false;
    for (const line of lines) {
      if (line.includes("Name:")) inAnswer = true;
      if (inAnswer && line.trim().startsWith("Address")) {
        const match = line.trim().match(/Address:\s*(\S+)/);
        if (match) addresses.push(match[1]);
      }
      if (line.trim() === "") inAnswer = false;
    }
    return addresses;
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════
// 9. NFTABLES NAT & FIREWALL (replaces iptables for Debian 13)
// ═══════════════════════════════════════════════════════════════════

/**
 * Enable nftables masquerade (NAT) on an outgoing interface.
 * Creates the `ip multiwan` table and `nat_post` chain if they don't exist,
 * then adds a masquerade rule for the specified interface.
 *
 * Uses:
 *   nft add table ip multiwan
 *   nft add chain ip multiwan nat_post '{ type nat hook postrouting priority srcnat; }'
 *   nft add rule ip multiwan nat_post oifname <iface> masquerade
 */
export async function nftEnableMasquerade(outIface: string): Promise<void> {
  const safeIface = validateIface(outIface);

  // Create table (ignore if already exists)
  try {
    await execFileAsync("nft", ["add", "table", "ip", "multiwan"], { timeout: 10000 });
  } catch {
    // Table may already exist — ignore
  }

  // Create NAT postrouting chain (ignore if already exists)
  try {
    await execFileAsync("nft", [
      "add", "chain", "ip", "multiwan", "nat_post",
      "{ type nat hook postrouting priority srcnat; }",
    ], { timeout: 10000 });
  } catch {
    // Chain may already exist — ignore
  }

  // Add masquerade rule
  await execFileAsync("nft", [
    "add", "rule", "ip", "multiwan", "nat_post",
    "oifname", safeIface, "masquerade",
  ], { timeout: 10000 });
}

/**
 * Disable nftables masquerade on an outgoing interface.
 * Removes the masquerade rule for the specified interface from the multiwan table.
 *
 * Uses:
 *   nft delete rule ip multiwan nat_post oifname <iface> masquerade
 */
export async function nftDisableMasquerade(outIface: string): Promise<void> {
  const safeIface = validateIface(outIface);
  await execFileAsync("nft", [
    "delete", "rule", "ip", "multiwan", "nat_post",
    "oifname", safeIface, "masquerade",
  ], { timeout: 10000 });
}

/**
 * Get current nftables NAT rules from the multiwan table.
 * Returns the full table dump or a "not found" message.
 *
 * Uses: nft list table ip multiwan
 */
export async function nftGetNatRules(): Promise<string> {
  try {
    const { stdout } = await execFileAsync("nft", ["list", "table", "ip", "multiwan"], {
      timeout: 10000,
      encoding: "utf-8",
    });
    return stdout.trim();
  } catch {
    return "No multiwan nftables rules found.";
  }
}

/**
 * Flush (delete) the entire nftables multiwan table.
 * Removes all rules, chains, and the table itself.
 *
 * Uses: nft delete table ip multiwan
 */
export async function nftFlushTable(): Promise<void> {
  try {
    await execFileAsync("nft", ["delete", "table", "ip", "multiwan"], { timeout: 10000 });
  } catch {
    // Table may not exist — ignore
  }
}

// ═══════════════════════════════════════════════════════════════════
// 10. MULTI-WAN ROUTING TABLE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

/**
 * Set up a dedicated routing table for a WAN link.
 * Registers the table in /etc/iproute2/rt_tables, adds a default route,
 * and creates a source-based ip rule for traffic from the link's local IP.
 *
 * Uses:
 *   ip route flush table <num>
 *   ip route add default via <gw> dev <iface> table <num>
 *   ip rule add from <localIp> lookup <num> pref <10000+num>
 */
export async function setupWanRouteTable(
  tableNum: number,
  tableName: string,
  gateway: string,
  iface: string,
  localIp: string,
): Promise<void> {
  // Validate all inputs
  if (!Number.isInteger(tableNum) || tableNum < 1 || tableNum > 252) {
    throw new Error(`Invalid table number: ${tableNum} (must be 1-252)`);
  }
  if (!tableName || !/^[a-zA-Z0-9_-]+$/.test(tableName)) {
    throw new Error(`Invalid table name: ${tableName}`);
  }
  const safeGateway = validateCidr(gateway);
  const safeIface = validateIface(iface);
  const safeLocalIp = validateCidr(localIp);

  // Register table name in /etc/iproute2/rt_tables if not already present
  const rtTablesPath = "/etc/iproute2/rt_tables";
  try {
    const content = readFileSync(rtTablesPath, "utf-8");
    if (!content.includes(`\t${tableNum}\t`) && !content.includes(`${tableNum}\t`) && !new RegExp(`^${tableNum}\\s`).test(content)) {
      appendFileSync(rtTablesPath, `\n${tableNum}\t${tableName}\n`, "utf-8");
    }
  } catch {
    // If file doesn't exist or is unreadable, try to create entry
    try {
      appendFileSync(rtTablesPath, `\n${tableNum}\t${tableName}\n`, "utf-8");
    } catch (err) {
      throw new Error(`Cannot write to ${rtTablesPath}: ${err}`);
    }
  }

  // Flush existing routes in the table
  try {
    await execFileAsync("ip", ["route", "flush", "table", String(tableNum)], { timeout: 10000 });
  } catch {
    // Table may not exist yet — ignore
  }

  // Add default route via gateway
  await execFileAsync("ip", [
    "route", "add", "default", "via", safeGateway,
    "dev", safeIface, "table", String(tableNum),
  ], { timeout: 10000 });

  // Add source-based routing rule
  const pref = 10000 + tableNum;
  try {
    await execFileAsync("ip", [
      "rule", "add", "from", safeLocalIp,
      "lookup", String(tableNum), "pref", String(pref),
    ], { timeout: 10000 });
  } catch {
    // Rule may already exist — ignore
  }
}

/**
 * Remove a WAN routing table and all associated ip rules.
 * Flushes the route table, removes ip rules referencing it,
 * and cleans the entry from /etc/iproute2/rt_tables.
 *
 * Uses:
 *   ip route flush table <num>
 *   ip rule del pref <pref>
 *   (edits /etc/iproute2/rt_tables)
 */
export async function removeWanRouteTable(tableNum: number): Promise<void> {
  if (!Number.isInteger(tableNum) || tableNum < 1 || tableNum > 252) {
    throw new Error(`Invalid table number: ${tableNum}`);
  }

  // Flush existing routes in the table
  try {
    await execFileAsync("ip", ["route", "flush", "table", String(tableNum)], { timeout: 10000 });
  } catch {
    // Table may not exist — ignore
  }

  // Remove ip rules referencing this table
  try {
    const { stdout } = await execFileAsync("ip", ["rule", "show"], {
      timeout: 10000,
      encoding: "utf-8",
    });
    const pref = 10000 + tableNum;
    const lines = stdout.trim().split("\n");
    for (const line of lines) {
      // Match rules that reference our table number (lookup <num>)
      if (line.includes(`lookup ${tableNum}`) || line.includes(`lookup ${tableNum} `)) {
        const prefMatch = line.match(/pref\s+(\d+)/);
        if (prefMatch) {
          try {
            await execFileAsync("ip", ["rule", "del", "pref", prefMatch[1]], { timeout: 5000 });
          } catch {
            // May fail if rule was already removed — ignore
          }
        }
      }
      // Also match by our expected preference number
      if (line.includes(`lookup ${tableNum}`)) {
        try {
          await execFileAsync("ip", ["rule", "del", "pref", String(pref)], { timeout: 5000 });
        } catch {
          // May already be removed — ignore
        }
      }
    }
  } catch {
    // ip rule show may fail — ignore
  }

  // Remove entry from /etc/iproute2/rt_tables
  const rtTablesPath = "/etc/iproute2/rt_tables";
  try {
    const content = readFileSync(rtTablesPath, "utf-8");
    const newContent = content
      .split("\n")
      .filter((line) => !new RegExp(`^${tableNum}\\s+`).test(line.trim()))
      .join("\n");
    writeFileSync(rtTablesPath, newContent, "utf-8");
  } catch {
    // File may not be writable — ignore
  }
}

/**
 * Add an fwmark-based ip rule to steer marked packets to a routing table.
 *
 * Uses: ip rule add fwmark <mark> lookup <tableNum> pref <10000+mark>
 */
export async function addFwmarkRule(mark: number, tableNum: number): Promise<void> {
  if (!Number.isInteger(mark) || mark < 1 || mark > 255) {
    throw new Error(`Invalid fwmark: ${mark} (must be 1-255)`);
  }
  if (!Number.isInteger(tableNum) || tableNum < 1 || tableNum > 252) {
    throw new Error(`Invalid table number: ${tableNum}`);
  }
  const pref = 10000 + mark;
  try {
    await execFileAsync("ip", [
      "rule", "add", "fwmark", String(mark),
      "lookup", String(tableNum), "pref", String(pref),
    ], { timeout: 10000 });
  } catch {
    // Rule may already exist — ignore
  }
}

/**
 * Remove an fwmark-based ip rule by preference number.
 *
 * Uses: ip rule del pref <10000+mark>
 */
export async function removeFwmarkRule(mark: number): Promise<void> {
  if (!Number.isInteger(mark) || mark < 1) {
    throw new Error(`Invalid fwmark: ${mark}`);
  }
  const pref = 10000 + mark;
  await execFileAsync("ip", ["rule", "del", "pref", String(pref)], { timeout: 10000 });
}

/**
 * Get the current state of all multi-WAN rules: ip rules, nft rules, and rt_tables entries.
 *
 * Uses:
 *   ip rule show
 *   nft list table ip multiwan
 *   cat /etc/iproute2/rt_tables
 */
export async function getMultiWanRules(): Promise<{ ipRules: string; nftRules: string; rtTables: string }> {
  const ipRules = await run(["ip", "rule", "show"]);

  let nftRules = "";
  try {
    const { stdout } = await execFileAsync("nft", ["list", "table", "ip", "multiwan"], {
      timeout: 10000,
      encoding: "utf-8",
    });
    nftRules = stdout.trim();
  } catch {
    nftRules = "No multiwan nftables table found.";
  }

  let rtTables = "";
  try {
    const content = readFileSync("/etc/iproute2/rt_tables", "utf-8");
    // Show only custom tables (100+)
    rtTables = content
      .split("\n")
      .filter((line) => /^\d{3,}/.test(line.trim()))
      .join("\n")
      .trim();
    if (!rtTables) rtTables = "No custom routing tables found.";
  } catch {
    rtTables = "Cannot read /etc/iproute2/rt_tables.";
  }

  return { ipRules, nftRules, rtTables };
}

// ═══════════════════════════════════════════════════════════════════
// 11. MULTI-WAN LOAD BALANCING ENGINE
// ═══════════════════════════════════════════════════════════════════

/** Configuration for multi-WAN load balancing */
export interface LoadBalanceConfig {
  links: {
    name: string;
    interfaceName: string;
    gateway: string;
    ipAddress: string;
    weight: number;
  }[];
  algorithm: "round-robin" | "weighted" | "least-connections";
  weights: Record<string, number>;
}

/** Result of applying or tearing down load balancing */
export interface ApplyResult {
  success: boolean;
  commands: string[];
  error?: string;
}

/**
 * Apply multi-WAN load balancing with nftables packet marking and policy routing.
 *
 * This is the main orchestration function that:
 * 1. Tears down any existing load balancing configuration
 * 2. Creates the nftables `ip multiwan` table with mangle + nat chains
 * 3. Sets up per-link routing tables and fwmark rules
 * 4. Adds NAT masquerade for each link
 * 5. Installs connection-marking rules based on the chosen algorithm
 *
 * Algorithms:
 * - round-robin: nft counters auto-distribute new connections across links
 * - weighted: jhash-based weighted distribution using mark ranges
 * - least-connections: falls back to round-robin (true LC requires conntrack counting)
 */
export async function applyLoadBalancing(config: LoadBalanceConfig): Promise<ApplyResult> {
  const commands: string[] = [];
  const cmd = (args: string[]) => {
    commands.push(args.join(" "));
    return args;
  };

  try {
    // ── Validate: need at least 2 active links ──
    const activeLinks = config.links.filter(
      (l) => l.interfaceName && l.gateway && l.ipAddress,
    );
    if (activeLinks.length < 2) {
      return {
        success: false,
        commands,
        error: `Need at least 2 active links with interfaceName + gateway + ipAddress, got ${activeLinks.length}`,
      };
    }

    // ── Step 1: Teardown existing configuration ──
    const teardownResult = await teardownLoadBalancing();
    commands.push(...teardownResult.commands);

    // ── Step 2: Create nftables table ──
    try {
      await execFileAsync("nft", cmd(["nft", "add", "table", "ip", "multiwan"]).slice(1), { timeout: 10000 });
    } catch {
      // May already exist after teardown race — ignore
    }

    // ── Step 3: Create chains ──
    // mangle prerouting chain
    try {
      await execFileAsync("nft", cmd([
        "nft", "add", "chain", "ip", "multiwan", "mangle_pre",
        "{ type filter hook prerouting priority mangle; }",
      ]).slice(1), { timeout: 10000 });
    } catch {
      // May already exist — ignore
    }

    // mangle output chain
    try {
      await execFileAsync("nft", cmd([
        "nft", "add", "chain", "ip", "multiwan", "mangle_out",
        "{ type filter hook output priority mangle; }",
      ]).slice(1), { timeout: 10000 });
    } catch {
      // May already exist — ignore
    }

    // nat postrouting chain
    try {
      await execFileAsync("nft", cmd([
        "nft", "add", "chain", "ip", "multiwan", "nat_post",
        "{ type nat hook postrouting priority srcnat; }",
      ]).slice(1), { timeout: 10000 });
    } catch {
      // May already exist — ignore
    }

    // ── Step 4: ESTABLISHED/RELATED connection marking (both chains) ──
    const estArgs = [
      "add", "rule", "ip", "multiwan", "mangle_pre",
      "ct", "state", "established,related",
      "meta", "mark", "set", "ct", "mark",
    ];
    await execFileAsync("nft", cmd(["nft", ...estArgs]).slice(1), { timeout: 10000 });

    const estArgsOut = [
      "add", "rule", "ip", "multiwan", "mangle_out",
      "ct", "state", "established,related",
      "meta", "mark", "set", "ct", "mark",
    ];
    await execFileAsync("nft", cmd(["nft", ...estArgsOut]).slice(1), { timeout: 10000 });

    // ── Step 5: Per-link routing tables + fwmark + NAT ──
    for (let i = 0; i < activeLinks.length; i++) {
      const link = activeLinks[i];
      const tableNum = 100 + i + 1; // 101, 102, 103...
      const markNum = i + 1;         // 1, 2, 3...
      const tableName = link.name || `wan${tableNum}`;

      // Setup routing table
      await setupWanRouteTable(tableNum, tableName, link.gateway, link.interfaceName, link.ipAddress);
      commands.push(
        `ip route flush table ${tableNum}`,
        `ip route add default via ${link.gateway} dev ${link.interfaceName} table ${tableNum}`,
        `ip rule add from ${link.ipAddress} lookup ${tableNum} pref ${10000 + tableNum}`,
      );

      // Add fwmark rule
      await addFwmarkRule(markNum, tableNum);
      commands.push(`ip rule add fwmark ${markNum} lookup ${tableNum} pref ${10000 + markNum}`);

      // Add NAT masquerade
      await execFileAsync("nft", cmd([
        "nft", "add", "rule", "ip", "multiwan", "nat_post",
        "oifname", link.interfaceName, "masquerade",
      ]).slice(1), { timeout: 10000 });
    }

    // ── Step 6: NEW connection marking based on algorithm ──
    if (config.algorithm === "round-robin" || config.algorithm === "least-connections") {
      // Round-robin: nft counter-based rule rotation for new connections
      for (let i = 0; i < activeLinks.length; i++) {
        const markNum = i + 1;
        const rrArgs = [
          "add", "rule", "ip", "multiwan", "mangle_pre",
          "ct", "state", "new",
          "meta", "mark", "0",
          "counter",
          "meta", "mark", "set", String(markNum),
          "ct", "mark", "set", "meta", "mark",
        ];
        await execFileAsync("nft", cmd(["nft", ...rrArgs]).slice(1), { timeout: 10000 });

        // Same for output chain
        const rrArgsOut = [
          "add", "rule", "ip", "multiwan", "mangle_out",
          "ct", "state", "new",
          "meta", "mark", "0",
          "counter",
          "meta", "mark", "set", String(markNum),
          "ct", "mark", "set", "meta", "mark",
        ];
        await execFileAsync("nft", cmd(["nft", ...rrArgsOut]).slice(1), { timeout: 10000 });
      }
    } else if (config.algorithm === "weighted") {
      // Weighted: jhash-based distribution
      const totalWeight = activeLinks.reduce((sum, l) => {
        const w = config.weights[l.name] ?? l.weight ?? 1;
        return sum + Math.max(1, w);
      }, 0);

      let offset = 0;
      for (let i = 0; i < activeLinks.length; i++) {
        const link = activeLinks[i];
        const markNum = i + 1;
        const w = Math.max(1, config.weights[link.name] ?? link.weight ?? 1);

        if (i < activeLinks.length - 1) {
          // Weighted range check: jhash mod totalWeight, check if mark falls in [offset, offset+w)
          const wArgs = [
            "add", "rule", "ip", "multiwan", "mangle_pre",
            "ct", "state", "new",
            "meta", "mark", "0",
            "meta", "mark", "set", "jhash", "ip", "saddr", "mod", String(totalWeight),
            "meta", "mark", String(offset),
            "-", String(offset + w),
            "meta", "mark", "set", String(markNum),
            "ct", "mark", "set", "meta", "mark",
          ];
          await execFileAsync("nft", cmd(["nft", ...wArgs]).slice(1), { timeout: 10000 });

          // Same for output chain
          const wArgsOut = [
            "add", "rule", "ip", "multiwan", "mangle_out",
            "ct", "state", "new",
            "meta", "mark", "0",
            "meta", "mark", "set", "jhash", "ip", "saddr", "mod", String(totalWeight),
            "meta", "mark", String(offset),
            "-", String(offset + w),
            "meta", "mark", "set", String(markNum),
            "ct", "mark", "set", "meta", "mark",
          ];
          await execFileAsync("nft", cmd(["nft", ...wArgsOut]).slice(1), { timeout: 10000 });

          offset += w;
        } else {
          // Last link is catch-all for any hash values not matched by previous ranges
          const catchAllArgs = [
            "add", "rule", "ip", "multiwan", "mangle_pre",
            "ct", "state", "new",
            "meta", "mark", "0",
            "meta", "mark", "set", String(markNum),
            "ct", "mark", "set", "meta", "mark",
          ];
          await execFileAsync("nft", cmd(["nft", ...catchAllArgs]).slice(1), { timeout: 10000 });

          // Same for output chain
          const catchAllArgsOut = [
            "add", "rule", "ip", "multiwan", "mangle_out",
            "ct", "state", "new",
            "meta", "mark", "0",
            "meta", "mark", "set", String(markNum),
            "ct", "mark", "set", "meta", "mark",
          ];
          await execFileAsync("nft", cmd(["nft", ...catchAllArgsOut]).slice(1), { timeout: 10000 });
        }
      }
    }

    return { success: true, commands };
  } catch (error: any) {
    return {
      success: false,
      commands,
      error: String(error?.message || error || "Unknown error applying load balancing"),
    };
  }
}

/**
 * Tear down all multi-WAN load balancing configuration.
 * Removes the nftables multiwan table, cleans up fwmark ip rules (pref >= 10000),
 * and removes custom routing table entries (101-199) from /etc/iproute2/rt_tables.
 *
 * Uses:
 *   nft delete table ip multiwan
 *   ip rule del pref <pref>
 *   (edits /etc/iproute2/rt_tables)
 */
export async function teardownLoadBalancing(): Promise<ApplyResult> {
  const commands: string[] = [];

  try {
    // ── Step 1: Delete nftables table ──
    try {
      await execFileAsync("nft", ["delete", "table", "ip", "multiwan"], { timeout: 10000 });
      commands.push("nft delete table ip multiwan");
    } catch {
      // Table may not exist — ignore
      commands.push("nft delete table ip multiwan (skipped - not found)");
    }

    // ── Step 2: Remove fwmark ip rules (pref >= 10000) ──
    try {
      const { stdout } = await execFileAsync("ip", ["rule", "show"], {
        timeout: 10000,
        encoding: "utf-8",
      });
      const lines = stdout.trim().split("\n");
      for (const line of lines) {
        const prefMatch = line.match(/pref\s+(\d+)/);
        if (prefMatch) {
          const pref = parseInt(prefMatch[1], 10);
          if (pref >= 10000) {
            try {
              await execFileAsync("ip", ["rule", "del", "pref", String(pref)], { timeout: 5000 });
              commands.push(`ip rule del pref ${pref}`);
            } catch {
              // May already be removed — ignore
            }
          }
        }
      }
    } catch {
      // ip rule show may fail — ignore
    }

    // ── Step 3: Clean /etc/iproute2/rt_tables (remove tables 101-199) ──
    const rtTablesPath = "/etc/iproute2/rt_tables";
    try {
      const content = readFileSync(rtTablesPath, "utf-8");
      const newContent = content
        .split("\n")
        .filter((line) => {
          const trimmed = line.trim();
          if (/^\d+\s/.test(trimmed)) {
            const num = parseInt(trimmed.split(/\s+/)[0], 10);
            return !(num >= 101 && num <= 199);
          }
          return true;
        })
        .join("\n");
      writeFileSync(rtTablesPath, newContent, "utf-8");
      commands.push(`Cleaned ${rtTablesPath} (removed tables 101-199)`);
    } catch {
      commands.push(`Could not clean ${rtTablesPath}`);
    }

    return { success: true, commands };
  } catch (error: any) {
    return {
      success: false,
      commands,
      error: String(error?.message || error || "Unknown error tearing down load balancing"),
    };
  }
}

/**
 * Get the current status of multi-WAN load balancing.
 * Checks if the nftables multiwan table exists and if fwmark rules are present.
 *
 * Uses:
 *   nft list table ip multiwan
 *   ip rule show
 */
export async function getLoadBalancingStatus(): Promise<{ active: boolean; details: string }> {
  let nftActive = false;
  let ruleCount = 0;

  // Check nftables table
  try {
    await execFileAsync("nft", ["list", "table", "ip", "multiwan"], { timeout: 10000 });
    nftActive = true;
  } catch {
    // Table doesn't exist
  }

  // Check ip rules with pref >= 10000
  try {
    const { stdout } = await execFileAsync("ip", ["rule", "show"], {
      timeout: 10000,
      encoding: "utf-8",
    });
    const lines = stdout.trim().split("\n");
    ruleCount = lines.filter((line) => {
      const prefMatch = line.match(/pref\s+(\d+)/);
      if (prefMatch) {
        const pref = parseInt(prefMatch[1], 10);
        return pref >= 10000;
      }
      return false;
    }).length;
  } catch {
    // ip rule show may fail
  }

  const active = nftActive && ruleCount > 0;
  const details = active
    ? `Load balancing ACTIVE — nftables multiwan table exists with ${ruleCount} policy routing rule(s)`
    : `Load balancing INACTIVE${nftActive ? " — nftables table exists but no policy routing rules found" : " — no nftables multiwan table or policy routing rules found"}`;

  return { active, details };
}

// ═══════════════════════════════════════════════════════════════════
// 12. GATEWAY HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════

/** Result of a gateway health check */
export interface HealthCheckResult {
  gateway: string;
  iface: string;
  alive: boolean;
  avgLatency: number | null;
  packetLoss: number;
  timestamp: string;
}

/**
 * Check the health of a gateway by pinging it.
 * Uses the existing `pingCheck` function (ICMP with TCP fallback) and
 * returns a structured result with gateway metadata.
 *
 * @param gateway - Gateway IP address to ping
 * @param iface - Interface name (for reference in result)
 * @param count - Number of ping probes (default 3)
 */
export async function checkGatewayHealth(
  gateway: string,
  iface: string,
  count: number = 3,
): Promise<HealthCheckResult> {
  const safeGateway = validateCidr(gateway);
  const safeIface = validateIface(iface);
  const safeCount = Math.max(1, Math.min(100, Math.floor(count)));

  const result = await pingCheck(safeGateway, safeCount);

  return {
    gateway: safeGateway,
    iface: safeIface,
    alive: result.alive,
    avgLatency: result.avgLatency,
    packetLoss: result.packetLoss,
    timestamp: new Date().toISOString(),
  };
}
