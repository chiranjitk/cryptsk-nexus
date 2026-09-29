import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { execFileSync } from "child_process";
import { existsSync } from "fs";

// ─── Constants ──────────────────────────────────────────────────────────────

const PORTABLE_FRR_HOME = "/home/z/frr-portable";
const PORTABLE_VTYSH_WRAPPER = `${PORTABLE_FRR_HOME}/bin/vtysh-wrapper`;
const PORTABLE_FRR_WRAPPER = `${PORTABLE_FRR_HOME}/bin/frr-wrapper.sh`;

const ZEBRA_SOCKET_PATHS = [
  "/var/run/frr/zserv.api",
  "/home/z/frr-portable/var/run/zserv.api",
];

// ─── vtysh Path Detection ──────────────────────────────────────────────────

interface VtyshInfo {
  path: string;
  portable: boolean;
}

let _cachedVtyshInfo: VtyshInfo | null = null;

/**
 * Auto-detect the vtysh binary path and whether it's a portable install.
 * Checks in order: portable wrapper, `which vtysh`, /usr/bin/vtysh, /usr/sbin/vtysh, /usr/lib/frr/vtysh.
 * Returns null when FRR is not installed.
 */
function getVtyshInfo(): VtyshInfo | null {
  if (_cachedVtyshInfo !== null) return _cachedVtyshInfo;

  const candidates: Array<{ path: string; portable: boolean }> = [
    // Try portable install paths first
    { path: PORTABLE_VTYSH_WRAPPER, portable: true },
    { path: "/home/z/frr-portable/bin/vtysh", portable: true },
    // Try `which` first (respects PATH) for system install
    ...(() => {
      try {
        const out = execFileSync("which", ["vtysh"], {
          timeout: 3000,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        }).trim();
        return out ? [{ path: out, portable: false }] : [];
      } catch {
        return [];
      }
    })(),
    { path: "/usr/bin/vtysh", portable: false },
    { path: "/usr/sbin/vtysh", portable: false },
    { path: "/usr/lib/frr/vtysh", portable: false },
  ];

  for (const { path, portable } of candidates) {
    try {
      if (existsSync(path)) {
        // Verify it's executable by trying --version
        const env = portable
          ? {
              ...process.env,
              LD_LIBRARY_PATH: `${PORTABLE_FRR_HOME}/lib:${process.env.LD_LIBRARY_PATH || ""}`,
            }
          : process.env;
        execFileSync(path, ["--version"], {
          timeout: 3000,
          env,
        });
        _cachedVtyshInfo = { path, portable };
        return _cachedVtyshInfo;
      }
    } catch {
      continue;
    }
  }

  _cachedVtyshInfo = null;
  return null;
}

/**
 * Backward-compatible helper: returns just the vtysh path string.
 */
function getVtyshPath(): string | null {
  return getVtyshInfo()?.path ?? null;
}

// ─── FRR Daemon Status Detection ────────────────────────────────────────────

/**
 * Check if FRR daemons are actually running by looking for the zebra API socket.
 */
function checkFrrDaemonsRunning(): boolean {
  for (const socketPath of ZEBRA_SOCKET_PATHS) {
    if (existsSync(socketPath)) {
      return true;
    }
  }
  return false;
}

// ─── vtysh Command Execution ───────────────────────────────────────────────

/**
 * Run a single vtysh command and return trimmed stdout.
 * Returns empty string on any failure. Timeout: 3 seconds.
 */
function vtysh(command: string): string {
  const info = getVtyshInfo();
  if (!info) return "";
  try {
    const env = info.portable
      ? {
          ...process.env,
          LD_LIBRARY_PATH: `${PORTABLE_FRR_HOME}/lib:${process.env.LD_LIBRARY_PATH || ""}`,
        }
      : process.env;
    // Use execFileSync with argument array to prevent shell injection
    return execFileSync(info.path, ["-c", command], {
      timeout: 3000,
      encoding: "utf-8",
      env,
    }).trim();
  } catch {
    return "";
  }
}

/**
 * Pipe multiple configuration lines into vtysh via printf.
 * Returns true on success, false on failure. Timeout: 3 seconds.
 */
function vtyshConfigure(lines: string[]): boolean {
  const info = getVtyshInfo();
  if (!info) return false;
  try {
    const env = info.portable
      ? {
          ...process.env,
          LD_LIBRARY_PATH: `${PORTABLE_FRR_HOME}/lib:${process.env.LD_LIBRARY_PATH || ""}`,
        }
      : process.env;
    // Use execFileSync with argument array — no shell interpolation
    execFileSync(info.path, lines, {
      timeout: 3000,
      encoding: "utf-8",
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch (err: any) {
    console.error("[FRR] vtysh configure error:", err.message);
    return false;
  }
}

// ─── Parsers ───────────────────────────────────────────────────────────────

/**
 * Parse FRR version from `show version` output.
 * Looks for a line like "FRRouting 8.4.4 (Git)" or "FRRouting (Version 8.5.0)"
 */
function parseVersion(output: string): string {
  const match = output.match(
    /FRRouting\s+(?:\(Version\s+)?(\d+(?:\.\d+)*)/
  );
  return match ? match[1] : "unknown";
}

/**
 * Parse running daemons from `show running-config` header area.
 * Looks for lines like "router bgp 65001", "router ospf", "router ospf6", "router rip", etc.
 */
function parseEnabledDaemons(output: string): string[] {
  const daemons: string[] = [];
  const patterns: [RegExp, string][] = [
    [/^router\s+bgp\s+\d+/, "bgpd"],
    [/^router\s+ospf\b/, "ospfd"],
    [/^router\s+ospf6\b/, "ospf6d"],
    [/^router\s+rip\b/, "ripd"],
    [/^router\s+ripng\b/, "ripngd"],
    [/^bfd\b/, "bfdd"],
    [/^router\s+isis\b/, "isisd"],
  ];
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    for (const [rx, name] of patterns) {
      if (rx.test(trimmed) && !daemons.includes(name)) {
        daemons.push(name);
      }
    }
  }
  return daemons;
}

/**
 * Extract router ID and hostname from `show running-config`.
 */
function parseRouterIdAndHostname(
  output: string
): { routerId: string; hostname: string } {
  let routerId = "";
  let hostname = "";
  for (const line of output.split("\n")) {
    const t = line.trim();
    if (!routerId) {
      const m = t.match(/frr\s+default\s+route-id\s+(\S+)/);
      if (m) routerId = m[1];
    }
    if (!routerId) {
      const m = t.match(/router-id\s+(\S+)/);
      if (m) routerId = m[1];
    }
    if (!hostname) {
      const m = t.match(/^hostname\s+(\S+)/);
      if (m) hostname = m[1];
    }
  }
  return { routerId, hostname };
}

// ── BGP Parsers ────────────────────────────────────────────────────────────

/**
 * Parse `show ip bgp summary` output.
 *
 * Typical output:
 * BGP router identifier 1.2.3.4, local AS number 65001
 * BGP table version is 42
 * ...
 * Neighbor        V    AS MsgRcvd MsgSent   TblVer  InQ OutQ Up/Down  State/PfxRcd
 * 10.0.0.2        4 65002    1234    1234        0    0    0 01:23:45       123
 * 192.168.1.1     4 65003       0       0        0    0    0 Never    Active
 */
function parseBgpSummary(
  output: string
): {
  localAs: string;
  routerId: string;
  neighbors: Array<{
    ip: string;
    as: string;
    state: string;
    uptime: string;
    prefixRx: number;
    prefixTx: number;
  }>;
} {
  let localAs = "";
  let routerId = "";
  const neighbors: Array<{
    ip: string;
    as: string;
    state: string;
    uptime: string;
    prefixRx: number;
    prefixTx: number;
  }> = [];

  const lines = output.split("\n");
  for (const line of lines) {
    const t = line.trim();

    // Local AS and router ID from header
    const asMatch = t.match(/local AS number\s+(\d+)/);
    if (asMatch) localAs = asMatch[1];

    const ridMatch = t.match(/BGP router identifier\s+(\S+)/);
    if (ridMatch) routerId = ridMatch[1];

    // Skip column headers and separator lines
    if (
      t.startsWith("Neighbor") ||
      t.startsWith("---") ||
      t.startsWith("BGP") ||
      t === ""
    ) {
      continue;
    }

    // Data lines: columns separated by whitespace
    // Columns: Neighbor, V, AS, MsgRcvd, MsgSent, TblVer, InQ, OutQ, Up/Down, State/PfxRcd
    const parts = t.split(/\s+/);
    if (parts.length >= 10) {
      const ip = parts[0];
      const as = parts[2];
      const uptime = parts[8];
      const stateOrPfx = parts.slice(9).join(" ");

      // State can be "Idle", "Active", "OpenSent", etc. or a number (prefix count)
      const stateNum = parseInt(stateOrPfx);
      const isEstablished = !isNaN(stateNum);
      const state = isEstablished ? "Established" : stateOrPfx;
      const prefixRx = isEstablished ? stateNum : 0;

      neighbors.push({
        ip,
        as,
        state,
        uptime: uptime === "Never" ? "" : uptime,
        prefixRx,
        prefixTx: 0,
      });
    }
  }

  return { localAs, routerId, neighbors };
}

/**
 * Parse `show ip bgp` output for route summary counts.
 * Returns { routesReceived, routesAccepted }.
 */
function parseBgpRoutes(output: string): {
  routesReceived: number;
  routesAccepted: number;
} {
  let routesReceived = 0;
  let routesAccepted = 0;

  if (!output) return { routesReceived: 0, routesAccepted: 0 };

  // Count data lines (those starting with an IP/network prefix)
  // Filter out header lines
  const lines = output.split("\n");
  for (const line of lines) {
    const t = line.trim();
    // BGP table lines start with a network prefix (e.g., "10.0.0.0/24")
    if (/^\d+\.\d+\.\d+\.\d+/.test(t) || /^::/.test(t)) {
      routesReceived++;
    }
  }
  routesAccepted = routesReceived; // Accepted routes = displayed routes

  return { routesReceived, routesAccepted };
}

/**
 * Parse BGP neighbor detail from `show ip bgp neighbors <ip>` or aggregate output.
 * We also parse `show ip bgp neighbors` to extract prefixTx (advertised).
 * However, to keep things simpler, we use the summary for the main data
 * and this function can be used for detailed info. For now it augments with advertised prefixes.
 */
function parseBgpNeighborDetail(output: string): Record<string, number> {
  const result: Record<string, number> = {};
  let currentNeighbor = "";

  for (const line of output.split("\n")) {
    const t = line.trim();

    // Neighbor header line: "BGP neighbor is 10.0.0.2, remote AS 65002, ..."
    const neighborMatch = t.match(
      /BGP neighbor is (\S+),\s+remote AS (\d+)/
    );
    if (neighborMatch) {
      currentNeighbor = neighborMatch[1];
      continue;
    }

    // Prefixes advertised: "  Local Policy refused prefixes: 0"
    // or "  Advertised to all peers (in all address families): X"
    // Better: "  For address family: IPv4 Unicast"
    //          "  Community: (standard) ..."
    // Look for "Prefixes Suppressed:" or "Local Policy refused prefixes"
    // Also look for "  Local host: ..." section
    if (
      currentNeighbor &&
      (t.includes("advertised") || t.includes("Advertised"))
    ) {
      const advMatch = t.match(/(\d+)\s+advertised/i);
      if (advMatch && !result[currentNeighbor]) {
        result[currentNeighbor] = parseInt(advMatch[1]) || 0;
      }
    }

    // Alternative: "  Last update: ..." followed by "  Prefixes Received:"
    if (currentNeighbor && t.match(/Prefixes (Received|Advertised)/i)) {
      // Format: "  Prefixes Received: 123" or "  Prefixes Advertised: 456"
      const valMatch = t.match(/(\d+)/);
      if (valMatch) {
        if (t.toLowerCase().includes("advertised")) {
          result[currentNeighbor] = parseInt(valMatch[1]) || 0;
        }
      }
    }
  }

  return result;
}

/**
 * Parse BGP networks from running-config output.
 * Looks for "  network X.X.X.X/Y" within a "router bgp" block.
 */
function parseBgpNetworks(runningConfig: string): Array<{ prefix: string }> {
  const networks: Array<{ prefix: string }> = [];
  let inBgp = false;

  for (const line of runningConfig.split("\n")) {
    const t = line.trim();
    if (t.startsWith("router bgp")) {
      inBgp = true;
      continue;
    }
    if (inBgp && t.startsWith("router ")) {
      inBgp = false;
      continue;
    }
    if (inBgp) {
      const m = t.match(/^network\s+(\S+)/);
      if (m) networks.push({ prefix: m[1] });
    }
  }

  return networks;
}

// ── OSPF Parsers ───────────────────────────────────────────────────────────

/**
 * Parse `show ip ospf` output.
 *
 * Typical output:
 * OSPF Routing Process, Router ID: 1.2.3.4
 * ...
 * Number of areas is 1, normal is 1, stub is 0, nssa is 0
 * ...
 * Area BACKBONE (0.0.0.0)
 *   Number of interfaces in this area: 3
 *   ...
 * Area 0.0.0.1
 *   Number of interfaces in this area: 1
 */
function parseOspfSummary(output: string): {
  routerId: string;
  areas: Array<{ id: string; interfaces: string[]; neighborCount: number }>;
} {
  let routerId = "";
  const areas: Array<{ id: string; interfaces: string[]; neighborCount: number }> =
    [];
  let currentArea: { id: string; interfaces: string[]; neighborCount: number } | null =
    null;

  for (const line of output.split("\n")) {
    const t = line.trim();

    const ridMatch = t.match(/Router ID:\s*(\S+)/);
    if (ridMatch) routerId = ridMatch[1];

    // Area line: "Area BACKBONE (0.0.0.0)" or "Area 0.0.0.1"
    const areaMatch = t.match(
      /Area\s+(?:BACKBONE\s+)?\(([0-9.]+)\)|Area\s+([0-9.]+)/
    );
    if (areaMatch) {
      if (currentArea) {
        areas.push(currentArea);
      }
      const id = areaMatch[1] || areaMatch[2] || "0.0.0.0";
      currentArea = { id, interfaces: [], neighborCount: 0 };
      continue;
    }

    // Interfaces count within an area
    if (currentArea && t.match(/Number of interfaces/i)) {
      const intMatch = t.match(/(\d+)/);
      if (intMatch) {
        // We'll populate actual interface names from the interface command
        currentArea.neighborCount = 0; // Will fill from neighbor data
      }
    }
  }

  if (currentArea) {
    areas.push(currentArea);
  }

  return { routerId, areas };
}

/**
 * Parse `show ip ospf neighbor` output.
 * Returns map of areaId -> neighborCount.
 */
function parseOspfNeighbors(output: string): Record<string, number> {
  const areaNeighborCount: Record<string, number> = {};
  const lines = output.split("\n");

  for (const line of lines) {
    const t = line.trim();
    if (
      t.startsWith("Neighbor ID") ||
      t.startsWith("---") ||
      t === "" ||
      t.startsWith("OSPF")
    ) {
      continue;
    }
    // Data lines: "2.3.4.5        10.0.0.2    1    Full/DR     00:01:23    eth0"
    // Not easy to associate with areas from this output alone, we'll just count per interface
  }

  return areaNeighborCount;
}

/**
 * Parse `show ip ospf interface` output.
 *
 * Typical:
 * eth0 is up, line protocol is up
 *   Internet Address 10.0.0.1/24, Area 0.0.0.0, MTU 1500
 *   Router ID 1.2.3.4, Network Type BROADCAST, Cost: 10
 *   Hello 10, Dead 40, Retransmit 5
 * ...
 */
function parseOspfInterfaces(output: string): Array<{
  name: string;
  area: string;
  state: string;
  cost: number;
  hello: number;
  dead: number;
}> {
  const interfaces: Array<{
    name: string;
    area: string;
    state: string;
    cost: number;
    hello: number;
    dead: number;
  }> = [];

  if (!output) return interfaces;

  const lines = output.split("\n");
  let current: {
    name: string;
    area: string;
    state: string;
    cost: number;
    hello: number;
    dead: number;
  } | null = null;

  for (const line of lines) {
    const t = line.trim();

    // Interface header: "eth0 is up" or "eth0 is down"
    const ifaceMatch = t.match(/^(\S+)\s+is\s+(\S+)/);
    if (ifaceMatch) {
      if (current) {
        interfaces.push(current);
      }
      current = {
        name: ifaceMatch[1],
        area: "",
        state: ifaceMatch[2],
        cost: 0,
        hello: 10,
        dead: 40,
      };
      continue;
    }

    if (!current) continue;

    // Area: "Internet Address 10.0.0.1/24, Area 0.0.0.0, ..."
    const areaMatch = t.match(/Area\s+([0-9.]+)/);
    if (areaMatch) current.Area = areaMatch[1];

    // Cost: "Cost: 10" or "Cost 10"
    const costMatch = t.match(/Cost[:\s]+(\d+)/);
    if (costMatch) current.cost = parseInt(costMatch[1]) || 0;

    // Hello interval: "Hello 10"
    const helloMatch = t.match(/Hello\s+(\d+)/);
    if (helloMatch) current.hello = parseInt(helloMatch[1]) || 10;

    // Dead interval: "Dead 40"
    const deadMatch = t.match(/Dead\s+(\d+)/);
    if (deadMatch) current.dead = parseInt(deadMatch[1]) || 40;
  }

  if (current) {
    interfaces.push(current);
  }

  return interfaces;
}

/**
 * Cross-reference OSPF areas with interface names.
 */
function buildOspfAreasWithInterfaces(
  ospfSummary: ReturnType<typeof parseOspfSummary>,
  ospfInterfaces: ReturnType<typeof parseOspfInterfaces>,
  ospfNeighborOutput: string
): Array<{ id: string; interfaces: string[]; neighborCount: number }> {
  // Count neighbors per interface from neighbor output
  const neighborIfaces = new Set<string>();
  for (const line of ospfNeighborOutput.split("\n")) {
    const t = line.trim();
    if (
      t.startsWith("Neighbor ID") ||
      t.startsWith("---") ||
      t === "" ||
      t.startsWith("OSPF")
    )
      continue;
    // "2.3.4.5        10.0.0.2    1    Full/DR     00:01:23    eth0"
    const parts = t.split(/\s+/);
    if (parts.length >= 7) {
      neighborIfaces.add(parts[6]);
    }
  }

  // Build area -> interfaces map
  const areaInterfaceMap: Record<string, string[]> = {};
  for (const iface of ospfInterfaces) {
    if (!areaInterfaceMap[iface.Area]) {
      areaInterfaceMap[iface.Area] = [];
    }
    areaInterfaceMap[iface.Area].push(iface.name);
  }

  // Count neighbors per area
  const areaNeighborCount: Record<string, number> = {};
  for (const iface of ospfInterfaces) {
    if (neighborIfaces.has(iface.name)) {
      areaNeighborCount[iface.Area] =
        (areaNeighborCount[iface.Area] || 0) + 1;
    }
  }

  return ospfSummary.areas.map((a) => ({
    id: a.id,
    interfaces: areaInterfaceMap[a.id] || [],
    neighborCount: areaNeighborCount[a.id] || 0,
  }));
}

// ── OSPFv3 (OSPF6) Parsers ────────────────────────────────────────────────

/**
 * Parse `show ipv6 ospf6 interface` output.
 *
 * Typical:
 * eth0 is up, type BROADCAST
 *   Interface ID: 3
 *   Area ID: 0.0.0.0 (BACKBONE)
 *   State: DR, Cost: 10
 * ...
 */
function parseOspf6Interfaces(output: string): Array<{
  name: string;
  area: string;
  state: string;
}> {
  const interfaces: Array<{ name: string; area: string; state: string }> = [];

  if (!output) return interfaces;

  const lines = output.split("\n");
  let current: { name: string; area: string; state: string } | null = null;

  for (const line of lines) {
    const t = line.trim();

    const ifaceMatch = t.match(/^(\S+)\s+is\s+(\S+)/);
    if (ifaceMatch) {
      if (current) interfaces.push(current);
      current = { name: ifaceMatch[1], area: "", state: ifaceMatch[2] };
      continue;
    }

    if (!current) continue;

    // Area: "Area ID: 0.0.0.0"
    const areaMatch = t.match(/Area ID:\s+([0-9.]+)/);
    if (areaMatch) current.Area = areaMatch[1];

    // State: "State: DR" or "State: BDR"
    const stateMatch = t.match(/State:\s+(\S+)/);
    if (stateMatch) current.state = stateMatch[1];
  }

  if (current) interfaces.push(current);
  return interfaces;
}

/**
 * Build OSPFv3 areas from interfaces.
 */
function buildOspf6Areas(
  interfaces: Array<{ name: string; area: string; state: string }>
): Array<{ id: string; interfaces: string[] }> {
  const areaMap: Record<string, string[]> = {};
  for (const iface of interfaces) {
    if (!areaMap[iface.Area]) areaMap[iface.Area] = [];
    areaMap[iface.Area].push(iface.name);
  }
  return Object.entries(areaMap).map(([id, ifaces]) => ({
    id,
    interfaces: ifaces,
  }));
}

/**
 * Parse OSPF6 router ID from running config (look for "router ospf6" block).
 */
function parseOspf6RouterId(runningConfig: string): string {
  let inOspf6 = false;
  for (const line of runningConfig.split("\n")) {
    const t = line.trim();
    if (t.startsWith("router ospf6")) {
      inOspf6 = true;
      continue;
    }
    if (inOspf6 && t.startsWith("router ")) {
      inOspf6 = false;
      continue;
    }
    if (inOspf6) {
      const m = t.match(/router-id\s+(\S+)/);
      if (m) return m[1];
    }
  }
  return "";
}

// ── RIP Parsers ────────────────────────────────────────────────────────────

/**
 * Parse `show ip rip` output.
 *
 * Typical:
 * RIP process : ripd, RIP version : 2
 * ...
 * Network      Interface    -> Neighbor
 * 10.0.0.0/24  eth0         -> 10.0.0.2
 */
function parseRipStatus(output: string): {
  networks: string[];
  interfaces: Array<{ name: string; state: string }>;
} {
  const networks: string[] = [];
  const interfaces: Array<{ name: string; state: string }> = [];
  const ifaceSet = new Set<string>();

  if (!output) return { networks, interfaces };

  for (const line of output.split("\n")) {
    const t = line.trim();

    // Skip header lines
    if (
      t === "" ||
      t.startsWith("RIP") ||
      t.startsWith("Network") ||
      t.startsWith("---")
    )
      continue;

    // Data lines: "10.0.0.0/24  eth0  -> 10.0.0.2"
    const parts = t.split(/\s+/);
    if (parts.length >= 2 && /^\d+\.\d+\.\d+\.\d+/.test(parts[0])) {
      networks.push(parts[0]);
      if (parts[1] && !ifaceSet.has(parts[1])) {
        ifaceSet.add(parts[1]);
        interfaces.push({ name: parts[1], state: "up" });
      }
    }
  }

  return { networks, interfaces };
}

/**
 * Parse RIP networks from running config.
 */
function parseRipNetworksConfig(runningConfig: string): string[] {
  const networks: string[] = [];
  let inRip = false;

  for (const line of runningConfig.split("\n")) {
    const t = line.trim();
    if (t.startsWith("router rip")) {
      inRip = true;
      continue;
    }
    if (inRip && t.startsWith("router ")) {
      inRip = false;
      continue;
    }
    if (inRip) {
      const m = t.match(/^network\s+(\S+)/);
      if (m) networks.push(m[1]);
    }
  }

  return networks;
}

// ── RIPng Parsers ────────────────────────────────────────────────────────

/**
 * Parse `show ipv6 rip` output for RIPng status.
 *
 * Typical:
 * RIPng process : ripngd, RIP version : 2
 * ...
 * Interface   Status    Routes   Metric
 * eth0        enabled   5        2
 */
function parseRipngStatus(output: string): {
  interfaces: Array<{ name: string; state: string }>;
  routes: number;
  metric: number;
} {
  const interfaces: Array<{ name: string; state: string }> = [];
  let routes = 0;
  let metric = 2;

  if (!output) return { interfaces, routes, metric };

  const lines = output.split("\n");
  for (const line of lines) {
    const t = line.trim();

    // Skip header lines
    if (
      t === "" ||
      t.startsWith("RIPng") ||
      t.startsWith("Interface") ||
      t.startsWith("---")
    )
      continue;

    // Data lines: "eth0  enabled  5  2"
    const parts = t.split(/\s+/);
    if (parts.length >= 2 && /^[a-zA-Z0-9]/.test(parts[0])) {
      interfaces.push({ name: parts[0], state: parts[1] || "disabled" });
      if (parts[2]) routes += parseInt(parts[2]) || 0;
      if (parts[3]) metric = parseInt(parts[3]) || metric;
    }
  }

  return { interfaces, routes, metric };
}

/**
 * Parse RIPng interfaces from running-config.
 */
function parseRipngInterfacesConfig(runningConfig: string): string[] {
  const interfaces: string[] = [];
  let inRipng = false;

  for (const line of runningConfig.split("\n")) {
    const t = line.trim();
    if (t.startsWith("router ripng")) {
      inRipng = true;
      continue;
    }
    if (inRipng && t.startsWith("router ")) {
      inRipng = false;
      continue;
    }
    if (inRipng) {
      const m = t.match(/^interface\s+(\S+)/);
      if (m) interfaces.push(m[1]);
    }
  }

  return interfaces;
}

// ── BFD Parsers ────────────────────────────────────────────────────────────

/**
 * Parse `show bfd peers` output.
 *
 * Typical:
 * BFD Peers:
 *  Peer             Intf     State     Echo        RxInterval   TxInterval
 *  10.0.0.2         eth0     Up        No          200          200
 *  192.168.1.1      eth1     Down      No          300          300
 */
function parseBfdPeers(output: string): Array<{
  neighbor: string;
  interface: string;
  state: string;
  rxInterval: number;
  txInterval: number;
}> {
  const peers: Array<{
    neighbor: string;
    interface: string;
    state: string;
    rxInterval: number;
    txInterval: number;
  }> = [];

  if (!output) return peers;

  const lines = output.split("\n");
  for (const line of lines) {
    const t = line.trim();
    if (
      t === "" ||
      t.startsWith("BFD") ||
      t.toLowerCase().startsWith("peer") ||
      t.startsWith("---")
    )
      continue;

    // Try to parse data lines — columns vary by FRR version
    const parts = t.split(/\s+/);
    if (parts.length >= 3 && /^\d+\.\d+\.\d+\.\d+/.test(parts[0])) {
      const neighbor = parts[0];
      const iface = parts[1] || "";
      const state = parts[2] || "Unknown";

      // Look for interval values — they are typically the last numeric columns
      let rxInterval = 0;
      let txInterval = 0;

      // Try to find numeric values that look like intervals (50-100000 range)
      const numericParts = parts
        .slice(3)
        .map((p) => parseInt(p))
        .filter((n) => !isNaN(n) && n >= 10 && n <= 100000);

      if (numericParts.length >= 2) {
        rxInterval = numericParts[numericParts.length - 2];
        txInterval = numericParts[numericParts.length - 1];
      } else if (numericParts.length === 1) {
        txInterval = numericParts[0];
        rxInterval = numericParts[0];
      }

      peers.push({ neighbor, interface: iface, state, rxInterval, txInterval });
    }
  }

  return peers;
}

// ── ISIS Parsers ───────────────────────────────────────────────────────────

/**
 * Parse `show isis neighbor` output.
 *
 * Typical:
 * Area IS-IS Level-1 adjacencies:
 * System Id      Interface   State  Holdtime  SNPA
 * 1111.2222.3333 eth0        Up     27        0a:00:27:00:00:01
 */
function parseIsisNeighbors(output: string): Array<{
  systemId: string;
  interface: string;
  state: string;
  level: string;
  holdTime: number;
}> {
  const neighbors: Array<{
    systemId: string;
    interface: string;
    state: string;
    level: string;
    holdTime: number;
  }> = [];

  if (!output) return neighbors;

  const lines = output.split("\n");
  let currentLevel = "";

  for (const line of lines) {
    const t = line.trim();

    // Detect level header: "Area IS-IS Level-1 adjacencies:"
    const levelMatch = t.match(/Level-(\d+)/);
    if (levelMatch) {
      currentLevel = `Level-${levelMatch[1]}`;
      continue;
    }

    // Skip header lines
    if (
      t === "" ||
      t.startsWith("System") ||
      t.startsWith("---") ||
      t.startsWith("Area")
    )
      continue;

    // Data line
    const parts = t.split(/\s+/);
    if (parts.length >= 3) {
      // System ID could be in various formats (with dots or hex)
      const systemId = parts[0];
      const iface = parts[1] || "";
      const state = parts[2] || "Unknown";
      const holdTime = parseInt(parts[3]) || 0;

      neighbors.push({
        systemId,
        interface: iface,
        state,
        level: currentLevel || "Unknown",
        holdTime,
      });
    }
  }

  return neighbors;
}

/**
 * Parse ISIS config from running-config.
 */
function parseIsisConfig(runningConfig: string): {
  net: string;
  areas: Array<{ tag: string; level: string; interfaces: string[] }>;
} {
  let net = "";
  const areas: Array<{ tag: string; level: string; interfaces: string[] }> = [];
  let currentArea: { tag: string; level: string; interfaces: string[] } | null =
    null;

  for (const line of runningConfig.split("\n")) {
    const t = line.trim();

    if (t.startsWith("router isis")) {
      currentArea = {
        tag: t.replace("router isis", "").trim() || "default",
        level: "",
        interfaces: [],
      };
      continue;
    }

    if (currentArea) {
      if (t.startsWith("router ") || t.startsWith("interface ")) {
        if (t.startsWith("router ")) {
          areas.push(currentArea);
          currentArea = null;
        }
        continue;
      }

      const netMatch = t.match(/net\s+(\S+)/);
      if (netMatch) net = netMatch[1];

      const isisMatch = t.match(/isis-circuit-type\s+(\S+)/);
      if (isisMatch) currentArea.level = isisMatch[1];
    }
  }

  if (currentArea) areas.push(currentArea);

  return { net, areas };
}

// ── Route Table Parser ─────────────────────────────────────────────────────

/**
 * Parse `show ip route` output.
 *
 * Typical:
 * Codes: C - connected, S - static, R - RIP, B - BGP, O - OSPF, ...
 * ...
 * C>* 10.0.0.0/24 is directly connected, eth0
 * S>* 0.0.0.0/0 [1/0] via 192.168.1.1, eth0
 * B>* 172.16.0.0/16 [200/0] via 10.0.0.2, eth0, weight 1
 * O>* 192.168.100.0/24 [110/20] via 10.0.0.3, eth0, label 42
 */
function parseRouteTable(output: string): Array<{
  type: string;
  prefix: string;
  nextHop: string;
  interface: string;
  metric: number;
  age: string;
}> {
  const routes: Array<{
    type: string;
    prefix: string;
    nextHop: string;
    interface: string;
    metric: number;
    age: string;
  }> = [];

  if (!output) return routes;

  const codeMap: Record<string, string> = {
    C: "connected",
    S: "static",
    R: "rip",
    B: "bgp",
    O: "ospf",
    "O IA": "ospf-inter",
    "O E1": "ospf-external1",
    "O E2": "ospf-external2",
    K: "kernel",
    E: "ecmp",
    N: "nhrp",
    M: "ospf6",
  };

  const lines = output.split("\n");

  for (const line of lines) {
    const t = line.trim();

    // Skip header/comment lines
    if (
      t === "" ||
      t.startsWith("Codes:") ||
      t.startsWith("Gateway") ||
      t.startsWith("---")
    )
      continue;

    // Match route lines. Pattern: "C>* 10.0.0.0/24 is directly connected, eth0"
    // or "B>* 172.16.0.0/16 [200/0] via 10.0.0.2, eth0"
    const routeMatch = t.match(
      /^([A-Z][A-Z\s]?)\*?\s*>\s*(\S+)\s+(?:\[.+?\]\s+)?(?:via\s+(\S+),?\s+)?.*?(?:,\s*(\S+))?$/
    );

    if (routeMatch) {
      let rawType = routeMatch[1].trim();
      const prefix = routeMatch[2];
      let nextHop = routeMatch[3] || "directly connected";
      const iface = routeMatch[4] || "";

      // Parse metric from [admin/metric]
      let metric = 0;
      const metricMatch = t.match(/\[(\d+)\/(\d+)\]/);
      if (metricMatch) metric = parseInt(metricMatch[2]) || 0;

      // Map code to friendly name
      const type =
        codeMap[rawType] || rawType.toLowerCase().replace(/\s+/g, "-");

      // Extract age from the rest of the line (e.g., "00:05:23")
      let age = "";
      const ageMatch = t.match(/(\d{2}:\d{2}:\d{2})/);
      if (ageMatch) age = ageMatch[1];

      routes.push({ type, prefix, nextHop, interface: iface, metric, age });
    }
  }

  return routes;
}

// ── Route Maps Parser ──────────────────────────────────────────────────────

interface RouteMapEntry {
  name: string;
  action: string;
  sequence: number;
  matchRules: string[];
  setRules: string[];
}

/**
 * Parse route-maps from `show running-config` output.
 * Looks for blocks like:
 *   route-map RM_SET_LOCAL permit 10
 *    match ip address PREFIX_LIST_1
 *    set local-preference 200
 */
function parseRouteMaps(runningConfig: string): RouteMapEntry[] {
  const entries: RouteMapEntry[] = [];
  const lines = runningConfig.split("\n");

  for (const line of lines) {
    const t = line.trim();
    const rmMatch = t.match(/^route-map\s+(\S+)\s+(\S+)\s+(\d+)/);
    if (rmMatch) {
      const name = rmMatch[1];
      const action = rmMatch[2]; // permit or deny
      const sequence = parseInt(rmMatch[3]);
      const matchRules: string[] = [];
      const setRules: string[] = [];

      // Collect subsequent match/set lines that belong to this route-map entry
      // Walk forward in the lines array
      const idx = lines.indexOf(line);
      for (let i = idx + 1; i < lines.length; i++) {
        const inner = lines[i].trim();
        // Stop if we hit another route-map, a blank line after indented lines,
        // or a non-indented line (new config section)
        if (inner === "") {
          if (matchRules.length > 0 || setRules.length > 0) break;
          continue;
        }
        if (
          inner.startsWith("route-map ") ||
          inner.startsWith("router ") ||
          inner.startsWith("interface ") ||
          inner.startsWith("ip ") ||
          inner.startsWith("ipv6 ") ||
          inner.startsWith("bfd ") ||
          inner.startsWith("access-list ") ||
          inner.startsWith("no ") ||
          inner.startsWith("line ") ||
          inner.startsWith("log ") ||
          inner.startsWith("hostname ") ||
          inner.startsWith("frr ") ||
          inner.startsWith("service ") ||
          inner.startsWith("password ") ||
          inner.startsWith("enable ") ||
          inner.startsWith("username ")
        ) {
          break;
        }
        if (inner.startsWith("match ")) {
          matchRules.push(inner);
        } else if (inner.startsWith("set ")) {
          setRules.push(inner);
        }
      }

      entries.push({ name, action, sequence, matchRules, setRules });
    }
  }

  return entries;
}

// ── Prefix Lists Parser ────────────────────────────────────────────────────

interface PrefixListEntry {
  name: string;
  seq: number;
  action: string; // permit or deny
  prefix: string;
  le?: number; // less-than-or-equal (max prefix length)
  ge?: number; // greater-than-or-equal (min prefix length)
}

/**
 * Parse prefix-lists from `show running-config` output.
 * Looks for lines like:
 *   ip prefix-list PREFIX_LIST_1 seq 5 permit 10.0.0.0/8 le 24
 *   ip prefix-list PREFIX_LIST_1 seq 10 deny 0.0.0.0/0 le 32
 */
function parsePrefixLists(runningConfig: string): PrefixListEntry[] {
  const entries: PrefixListEntry[] = [];

  for (const line of runningConfig.split("\n")) {
    const t = line.trim();
    // Match: ip prefix-list <name> seq <seq> <action> <prefix> [ge <n>] [le <n>]
    const match = t.match(
      /^ip prefix-list\s+(\S+)\s+seq\s+(\d+)\s+(\S+)\s+(\S+)(?:\s+ge\s+(\d+))?(?:\s+le\s+(\d+))?/
    );
    if (match) {
      entries.push({
        name: match[1],
        seq: parseInt(match[2]),
        action: match[3],
        prefix: match[4],
        ge: match[5] ? parseInt(match[5]) : undefined,
        le: match[6] ? parseInt(match[6]) : undefined,
      });
    }
  }

  return entries;
}

// ── Access Lists Parser ────────────────────────────────────────────────────

interface AccessListEntry {
  name: string;
  type: string; // standard, extended
  rules: Array<{
    seq: number;
    action: string; // permit or deny
    source: string;
    destination?: string;
    protocol?: string;
  }>;
}

/**
 * Parse access-lists from `show running-config` output.
 * Standard ACLs:
 *   access-list ACL_DENY deny 10.0.0.0/8
 *   access-list ACL_PERMIT permit any
 * Numbered ACLs:
 *   access-list 10 permit 10.0.0.0/8
 *   access-list 10 deny any
 */
function parseAccessLists(runningConfig: string): AccessListEntry[] {
  const map: Record<string, AccessListEntry> = {};

  for (const line of runningConfig.split("\n")) {
    const t = line.trim();

    // Standard named ACL: access-list <name> <action> <source>
    const namedMatch = t.match(
      /^access-list\s+(\S+)\s+(permit|deny)\s+(\S+)(?:\s+(\S+)(?:\s+(\S+))?)?/
    );
    if (namedMatch) {
      const name = namedMatch[1];
      const action = namedMatch[2];
      const source = namedMatch[3];
      // Check if there are additional fields (protocol, destination for extended)
      const maybeProtocol = namedMatch[4];
      const maybeDest = namedMatch[5];

      if (!map[name]) {
        map[name] = { name, type: "standard", rules: [] };
      }

      const rule: AccessListEntry["rules"][0] = {
        seq: map[name].rules.length + 10,
        action,
        source,
      };

      // If we have protocol and dest, it's extended
      if (maybeProtocol && maybeProtocol !== "any" && maybeDest) {
        map[name].type = "extended";
        rule.protocol = maybeProtocol;
        rule.destination = maybeDest;
      }

      map[name].rules.push(rule);
    }
  }

  return Object.values(map);
}

// ─── Empty Response Helper ─────────────────────────────────────────────────

/**
 * Build an empty data response for all protocol sections (used when daemons aren't running).
 */
function buildEmptyResponse(vtyshPath: string, portable: boolean) {
  return {
    frrInstalled: true,
    frrDaemonsRunning: false,
    frrVersion: "unknown",
    vtyshPath,
    frrPortable: portable,
    overview: {
      runningDaemons: [],
      routerId: "",
      hostname: "",
    },
    bgp: {
      enabled: false,
      localAs: "",
      routerId: "",
      neighbors: [],
      networks: [],
      summary: { routesReceived: 0, routesAccepted: 0 },
    },
    ospf: {
      enabled: false,
      routerId: "",
      areas: [],
      interfaces: [],
    },
    ospf6: {
      enabled: false,
      routerId: "",
      areas: [],
      interfaces: [],
    },
    rip: {
      enabled: false,
      networks: [],
      interfaces: [],
    },
    ripng: {
      enabled: false,
      interfaces: [],
      routes: 0,
      metric: 2,
    },
    bfd: {
      enabled: false,
      peers: [],
    },
    isis: {
      enabled: false,
      net: "",
      areas: [],
      neighbors: [],
    },
    routeTable: [],
    routeMaps: [],
    prefixLists: [],
    accessLists: [],
    runningConfig: "",
  };
}

// ─── GET Handler ───────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (error: any) {
      if (error instanceof AuthError)
        return NextResponse.json(
          { error: error.message },
          { status: error.statusCode }
        );
    }

    const vtyshInfo = getVtyshInfo();

    if (!vtyshInfo) {
      return NextResponse.json({
        frrInstalled: false,
        frrDaemonsRunning: false,
        error: "FRR not installed",
      });
    }

    const daemonsRunning = checkFrrDaemonsRunning();

    if (!daemonsRunning) {
      return NextResponse.json(
        buildEmptyResponse(vtyshInfo.path, vtyshInfo.portable)
      );
    }

    // Gather all vtysh outputs (they're independent reads)
    const [
      versionOutput,
      runningConfig,
      bgpSummaryOutput,
      bgpRoutesOutput,
      bgpNeighborsOutput,
      ospfOutput,
      ospfNeighborOutput,
      ospfInterfaceOutput,
      ospf6InterfaceOutput,
      ripOutput,
      ripngOutput,
      bfdPeersOutput,
      isisNeighborOutput,
      routeTableOutput,
    ] = [
      vtysh("show version"),
      vtysh("show running-config"),
      vtysh("show ip bgp summary"),
      vtysh("show ip bgp"),
      vtysh("show ip bgp neighbors"),
      vtysh("show ip ospf"),
      vtysh("show ip ospf neighbor"),
      vtysh("show ip ospf interface"),
      vtysh("show ipv6 ospf6 interface"),
      vtysh("show ip rip"),
      vtysh("show ipv6 rip"),
      vtysh("show bfd peers"),
      vtysh("show isis neighbor"),
      vtysh("show ip route"),
    ];

    const frrVersion = parseVersion(versionOutput);
    const runningDaemons = parseEnabledDaemons(runningConfig);
    const { routerId, hostname } = parseRouterIdAndHostname(runningConfig);

    // ── BGP ──
    const bgpSummary = parseBgpSummary(bgpSummaryOutput);
    const bgpRoutes = parseBgpRoutes(bgpRoutesOutput);
    const bgpNetAdv = parseBgpNeighborDetail(bgpNeighborsOutput);
    const bgpNetConfig = parseBgpNetworks(runningConfig);

    // Merge advertised prefixes into neighbor data
    for (const neighbor of bgpSummary.neighbors) {
      if (bgpNetAdv[neighbor.ip] !== undefined) {
        neighbor.prefixTx = bgpNetAdv[neighbor.ip];
      }
    }

    const bgpEnabled = runningDaemons.includes("bgpd");

    // ── OSPF ──
    const ospfSummary = parseOspfSummary(ospfOutput);
    const ospfInterfaces = parseOspfInterfaces(ospfInterfaceOutput);
    const ospfEnabled = runningDaemons.includes("ospfd");
    const ospfAreas = buildOspfAreasWithInterfaces(
      ospfSummary,
      ospfInterfaces,
      ospfNeighborOutput
    );

    // Use router ID from ospf output if available
    const ospfRouterId = ospfSummary.routerId || routerId;

    // ── OSPFv6 ──
    const ospf6Interfaces = parseOspf6Interfaces(ospf6InterfaceOutput);
    const ospf6Enabled = runningDaemons.includes("ospf6d");
    const ospf6RouterId = parseOspf6RouterId(runningConfig);
    const ospf6Areas = buildOspf6Areas(ospf6Interfaces);

    // ── RIP ──
    const ripEnabled = runningDaemons.includes("ripd");
    const ripStatus = parseRipStatus(ripOutput);
    const ripNetworks = parseRipNetworksConfig(runningConfig);

    // ── RIPng ──
    const ripngEnabled = runningDaemons.includes("ripngd");
    const ripngStatus = parseRipngStatus(ripngOutput);
    const ripngInterfaces = parseRipngInterfacesConfig(runningConfig);

    // ── BFD ──
    const bfdEnabled = runningDaemons.includes("bfdd");
    const bfdPeers = parseBfdPeers(bfdPeersOutput);

    // ── ISIS ──
    const isisEnabled = runningDaemons.includes("isisd");
    const isisConfig = parseIsisConfig(runningConfig);
    const isisNeighbors = parseIsisNeighbors(isisNeighborOutput);

    // ── Route Table ──
    const routeTable = parseRouteTable(routeTableOutput);

    // ── Route Maps, Prefix Lists, ACLs ──
    const routeMaps = parseRouteMaps(runningConfig);
    const prefixLists = parsePrefixLists(runningConfig);
    const accessLists = parseAccessLists(runningConfig);

    return NextResponse.json({
      frrInstalled: true,
      frrDaemonsRunning: true,
      frrVersion,
      vtyshPath: vtyshInfo.path,
      frrPortable: vtyshInfo.portable,
      overview: {
        runningDaemons,
        routerId,
        hostname,
      },
      bgp: {
        enabled: bgpEnabled,
        localAs: bgpSummary.localAs,
        routerId: bgpSummary.routerId || routerId,
        neighbors: bgpSummary.neighbors,
        networks: bgpNetConfig,
        summary: bgpRoutes,
      },
      ospf: {
        enabled: ospfEnabled,
        routerId: ospfRouterId,
        areas: ospfAreas,
        interfaces: ospfInterfaces,
      },
      ospf6: {
        enabled: ospf6Enabled,
        routerId: ospf6RouterId,
        areas: ospf6Areas,
        interfaces: ospf6Interfaces,
      },
      rip: {
        enabled: ripEnabled,
        networks: ripNetworks.length > 0 ? ripNetworks : ripStatus.networks,
        interfaces: ripStatus.interfaces,
      },
      ripng: {
        enabled: ripngEnabled,
        interfaces: ripngInterfaces.length > 0 ? ripngInterfaces : ripngStatus.interfaces,
        routes: ripngStatus.routes,
        metric: ripngStatus.metric,
      },
      bfd: {
        enabled: bfdEnabled,
        peers: bfdPeers,
      },
      isis: {
        enabled: isisEnabled,
        net: isisConfig.net,
        areas: isisConfig.areas,
        neighbors: isisNeighbors,
      },
      routeTable,
      routeMaps,
      prefixLists,
      accessLists,
      runningConfig,
    });
  } catch (error) {
    console.error("[Dynamic Routing API] GET error:", error);
    return NextResponse.json(
      { error: "Failed to query FRR: " + String(error) },
      { status: 500 }
    );
  }
}

// ─── FRR Service Management Helper ─────────────────────────────────────────

/**
 * Execute an FRR service management command.
 * Returns { success, operation, status, message }.
 */
function manageFrrService(
  operation: string
): {
  success: boolean;
  operation: string;
  status: string;
  message: string;
} {
  const vtyshInfo = getVtyshInfo();
  const isPortable = vtyshInfo?.portable ?? existsSync(PORTABLE_VTYSH_WRAPPER);

  const ALLOWED_OPS = ["start", "stop", "restart", "enable", "disable"];
  if (!ALLOWED_OPS.includes(operation)) {
    return { success: false, operation, status: "error", message: `Invalid operation: ${operation}` };
  }

  try {
    const env = isPortable
      ? {
          ...process.env,
          LD_LIBRARY_PATH: `${PORTABLE_FRR_HOME}/lib:${process.env.LD_LIBRARY_PATH || ""}`,
        }
      : process.env;

    if (isPortable) {
      if (!existsSync(PORTABLE_FRR_WRAPPER)) {
        return {
          success: false,
          operation,
          status: "error",
          message: `Portable FRR wrapper not found at ${PORTABLE_FRR_WRAPPER}`,
        };
      }
      execFileSync(PORTABLE_FRR_WRAPPER, [operation], { timeout: 5000, encoding: "utf-8", env });
    } else {
      execFileSync("systemctl", [operation, "frr"], { timeout: 5000, encoding: "utf-8", env });
    }

    // Determine current status after operation
    let currentStatus = "unknown";
    if (operation === "stop") {
      currentStatus = "stopped";
    } else if (operation === "start" || operation === "restart") {
      // Give daemons a moment to start
      const startCheck = Date.now();
      while (Date.now() - startCheck < 3000) {
        if (checkFrrDaemonsRunning()) {
          currentStatus = "running";
          break;
        }
        execFileSync("sleep", ["0.5"], { timeout: 1000 });
      }
      if (currentStatus === "unknown") currentStatus = "starting";
    }

    return {
      success: true,
      operation,
      status: currentStatus,
      message: `FRR ${operation} successful (${isPortable ? "portable" : "systemd"})`,
    };
  } catch (err: any) {
    return {
      success: false,
      operation,
      status: checkFrrDaemonsRunning() ? "running" : "stopped",
      message: `FRR ${operation} failed: ${err.message}`,
    };
  }
}

// ─── POST Handler ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (error: any) {
      if (error instanceof AuthError)
        return NextResponse.json(
          { error: error.message },
          { status: error.statusCode }
        );
    }

    const vtyshPath = getVtyshPath();
    if (!vtyshPath) {
      return NextResponse.json(
        { error: "FRR is not installed on this system" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { action, protocol, ...params } = body;

    switch (action) {
      // ────────────────────── FRR Service Management ──────────────────────
      case "service-frr": {
        const { operation } = params;
        if (
          !operation ||
          !["start", "stop", "restart", "status"].includes(operation)
        ) {
          return NextResponse.json(
            { error: "operation must be start, stop, restart, or status" },
            { status: 400 }
          );
        }

        if (operation === "status") {
          const running = checkFrrDaemonsRunning();
          return NextResponse.json({
            success: true,
            operation: "status",
            status: running ? "running" : "stopped",
            frrDaemonsRunning: running,
          });
        }

        const result = manageFrrService(operation);
        return NextResponse.json(result);
      }

      // ────────────────────── BGP ──────────────────────
      case "configure-bgp": {
        const { localAs, routerId, networks } = params;
        if (!localAs) {
          return NextResponse.json(
            { error: "localAs is required" },
            { status: 400 }
          );
        }

        const lines: string[] = [
          "configure terminal",
          `router bgp ${localAs}`,
        ];

        if (routerId) {
          lines.push(`  bgp router-id ${routerId}`);
        }

        if (Array.isArray(networks)) {
          for (const net of networks) {
            if (net) lines.push(`  network ${net}`);
          }
        }

        lines.push("  end", "write");

        const ok = vtyshConfigure(lines);
        return ok
          ? NextResponse.json({
              success: true,
              message: `BGP configured for AS ${localAs}`,
            })
          : NextResponse.json(
              { error: "Failed to configure BGP" },
              { status: 500 }
            );
      }

      case "add-bgp-neighbor": {
        const { ip, remoteAs, description } = params;
        if (!ip || !remoteAs) {
          return NextResponse.json(
            { error: "ip and remoteAs are required" },
            { status: 400 }
          );
        }

        const lines: string[] = [
          "configure terminal",
          "router bgp", // FRR will use the existing BGP process
          `  neighbor ${ip} remote-as ${remoteAs}`,
        ];

        if (description) {
          lines.push(`  neighbor ${ip} description ${description}`);
        }

        lines.push("  end", "write");

        const ok = vtyshConfigure(lines);
        return ok
          ? NextResponse.json({
              success: true,
              message: `BGP neighbor ${ip} added`,
            })
          : NextResponse.json(
              { error: `Failed to add BGP neighbor ${ip}` },
              { status: 500 }
            );
      }

      case "remove-bgp-neighbor": {
        const { ip } = params;
        if (!ip) {
          return NextResponse.json(
            { error: "ip is required" },
            { status: 400 }
          );
        }

        const lines: string[] = [
          "configure terminal",
          "router bgp",
          `  no neighbor ${ip}`,
          "  end",
          "write",
        ];

        const ok = vtyshConfigure(lines);
        return ok
          ? NextResponse.json({
              success: true,
              message: `BGP neighbor ${ip} removed`,
            })
          : NextResponse.json(
              { error: `Failed to remove BGP neighbor ${ip}` },
              { status: 500 }
            );
      }

      // ────────────────────── OSPF ──────────────────────
      case "configure-ospf": {
        const { routerId, areas } = params;

        const lines: string[] = [
          "configure terminal",
          "router ospf",
        ];

        if (routerId) {
          lines.push(`  ospf router-id ${routerId}`);
        }

        if (Array.isArray(areas)) {
          for (const area of areas) {
            if (area?.id && Array.isArray(area.networks)) {
              for (const net of area.networks) {
                if (net) lines.push(`  network ${net} area ${area.id}`);
              }
            }
          }
        }

        lines.push("  end", "write");

        const ok = vtyshConfigure(lines);
        return ok
          ? NextResponse.json({
              success: true,
              message: "OSPF configured",
            })
          : NextResponse.json(
              { error: "Failed to configure OSPF" },
              { status: 500 }
            );
      }

      // ────────────────────── OSPFv6 ──────────────────────
      case "configure-ospf6": {
        const { routerId, areas } = params;

        const lines: string[] = [
          "configure terminal",
          "router ospf6",
        ];

        if (routerId) {
          lines.push(`  router-id ${routerId}`);
        }

        if (Array.isArray(areas)) {
          for (const area of areas) {
            if (area?.id && Array.isArray(area.interfaces)) {
              for (const iface of area.interfaces) {
                if (iface) {
                  lines.push(`  interface ${iface}`);
                  lines.push(`    ipv6 ospf6 area ${area.id}`);
                  lines.push(`    exit`);
                }
              }
            }
          }
        }

        lines.push("  end", "write");

        const ok = vtyshConfigure(lines);
        return ok
          ? NextResponse.json({
              success: true,
              message: "OSPFv3 configured",
            })
          : NextResponse.json(
              { error: "Failed to configure OSPFv3" },
              { status: 500 }
            );
      }

      // ────────────────────── RIP ──────────────────────
      case "configure-rip": {
        const { networks } = params;

        const lines: string[] = [
          "configure terminal",
          "router rip",
        ];

        if (Array.isArray(networks)) {
          for (const net of networks) {
            if (net) lines.push(`  network ${net}`);
          }
        }

        lines.push("  end", "write");

        const ok = vtyshConfigure(lines);
        return ok
          ? NextResponse.json({
              success: true,
              message: "RIP configured",
            })
          : NextResponse.json(
              { error: "Failed to configure RIP" },
              { status: 500 }
            );
      }

      // ────────────────────── RIPng ──────────────────────
      case "configure-ripng": {
        const { interfaces } = params;

        const lines: string[] = [
          "configure terminal",
          "router ripng",
        ];

        if (Array.isArray(interfaces)) {
          for (const iface of interfaces) {
            if (iface) lines.push(`  interface ${iface}`);
          }
        }

        lines.push("  end", "write");

        const ok = vtyshConfigure(lines);
        return ok
          ? NextResponse.json({
              success: true,
              message: "RIPng configured",
            })
          : NextResponse.json(
              { error: "Failed to configure RIPng" },
              { status: 500 }
            );
      }

      // ────────────────────── BFD ──────────────────────
      case "configure-bfd": {
        const { peers } = params;

        const lines: string[] = [
          "configure terminal",
          "bfd",
        ];

        if (Array.isArray(peers)) {
          for (const peer of peers) {
            if (peer?.neighbor) {
              lines.push(`  peer ${peer.neighbor}`);
              if (peer.interface) {
                lines.push(`    interface ${peer.interface}`);
              }
              if (peer.rxInterval) {
                lines.push(
                  `    detect-multiplier ${Math.ceil(peer.rxInterval / 50)}`
                );
                lines.push(`    min-rx ${peer.rxInterval}`);
                lines.push(`    min-tx ${peer.txInterval || peer.rxInterval}`);
              }
              lines.push(`    exit`);
            }
          }
        }

        lines.push("  end", "write");

        const ok = vtyshConfigure(lines);
        return ok
          ? NextResponse.json({
              success: true,
              message: "BFD configured",
            })
          : NextResponse.json(
              { error: "Failed to configure BFD" },
              { status: 500 }
            );
      }

      case "enable-bfd": {
        const lines: string[] = [
          "configure terminal",
          "bfd",
          "  end",
          "write",
        ];

        const ok = vtyshConfigure(lines);
        return ok
          ? NextResponse.json({
              success: true,
              message: "BFD enabled",
            })
          : NextResponse.json(
              { error: "Failed to enable BFD" },
              { status: 500 }
            );
      }

      case "add-bfd-peer": {
        const { neighbor, interface: iface, rxInterval, txInterval } = params;
        if (!neighbor) {
          return NextResponse.json(
            { error: "neighbor is required" },
            { status: 400 }
          );
        }

        const lines: string[] = [
          "configure terminal",
          "bfd",
          `  peer ${neighbor}`,
        ];

        if (iface) {
          lines.push(`    interface ${iface}`);
        }
        if (rxInterval) {
          lines.push(
            `    detect-multiplier ${Math.ceil(rxInterval / 50)}`
          );
          lines.push(`    min-rx ${rxInterval}`);
          lines.push(`    min-tx ${txInterval || rxInterval}`);
        }

        lines.push("    exit", "  end", "write");

        const ok = vtyshConfigure(lines);
        return ok
          ? NextResponse.json({
              success: true,
              message: `BFD peer ${neighbor} added`,
            })
          : NextResponse.json(
              { error: `Failed to add BFD peer ${neighbor}` },
              { status: 500 }
            );
      }

      // ────────────────────── ISIS ──────────────────────
      case "configure-isis": {
        const { net, areas } = params;

        const lines: string[] = [
          "configure terminal",
          "router isis",
        ];

        if (net) {
          lines.push(`  net ${net}`);
        }

        if (Array.isArray(areas)) {
          for (const area of areas) {
            if (area?.level) {
              lines.push(`  is-type ${area.level}`);
            }
            if (Array.isArray(area.interfaces)) {
              for (const iface of area.interfaces) {
                if (iface) {
                  lines.push(`  interface ${iface}`);
                  if (area.level) {
                    lines.push(
                      `    isis-circuit-type ${area.level.toLowerCase()}`
                    );
                  }
                  lines.push(`    exit`);
                }
              }
            }
          }
        }

        lines.push("  end", "write");

        const ok = vtyshConfigure(lines);
        return ok
          ? NextResponse.json({
              success: true,
              message: "IS-IS configured",
            })
          : NextResponse.json(
              { error: "Failed to configure IS-IS" },
              { status: 500 }
            );
      }

      // ────────────────────── Route Maps ──────────────────────
      case "add-route-map": {
        const { name, action, sequence, matchRules, setRules } = params;
        if (!name || !action) {
          return NextResponse.json(
            { error: "name and action are required" },
            { status: 400 }
          );
        }

        const lines: string[] = [
          "configure terminal",
          `route-map ${name} ${action} ${sequence || 10}`,
        ];

        if (Array.isArray(matchRules)) {
          for (const rule of matchRules) {
            if (rule) lines.push(`  ${rule}`);
          }
        }

        if (Array.isArray(setRules)) {
          for (const rule of setRules) {
            if (rule) lines.push(`  ${rule}`);
          }
        }

        lines.push("  end", "write");

        const ok = vtyshConfigure(lines);
        return ok
          ? NextResponse.json({
              success: true,
              message: `Route map ${name} added`,
            })
          : NextResponse.json(
              { error: `Failed to add route map ${name}` },
              { status: 500 }
            );
      }

      // ────────────────────── Prefix Lists ──────────────────────
      case "add-prefix-list": {
        const { name, seq, action, prefix, le, ge } = params;
        if (!name || !action || !prefix) {
          return NextResponse.json(
            { error: "name, action, and prefix are required" },
            { status: 400 }
          );
        }

        const lines: string[] = ["configure terminal"];
        let plCmd = `ip prefix-list ${name} seq ${seq || 5} ${action} ${prefix}`;
        if (ge) plCmd += ` ge ${ge}`;
        if (le) plCmd += ` le ${le}`;
        lines.push(plCmd);
        lines.push("  end", "write");

        const ok = vtyshConfigure(lines);
        return ok
          ? NextResponse.json({
              success: true,
              message: `Prefix list ${name} entry added`,
            })
          : NextResponse.json(
              { error: `Failed to add prefix list ${name}` },
              { status: 500 }
            );
      }

      // ────────────────────── Access Lists ──────────────────────
      case "add-access-list": {
        const { name, action, source, protocol, destination } = params;
        if (!name || !action || !source) {
          return NextResponse.json(
            { error: "name, action, and source are required" },
            { status: 400 }
          );
        }

        const lines: string[] = ["configure terminal"];
        if (protocol && destination) {
          lines.push(
            `access-list ${name} ${action} ${protocol} ${source} ${destination}`
          );
        } else {
          lines.push(`access-list ${name} ${action} ${source}`);
        }
        lines.push("  end", "write");

        const ok = vtyshConfigure(lines);
        return ok
          ? NextResponse.json({
              success: true,
              message: `Access list ${name} rule added`,
            })
          : NextResponse.json(
              { error: `Failed to add access list ${name}` },
              { status: 500 }
            );
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("[Dynamic Routing API] POST error:", error);
    return NextResponse.json(
      { error: "Failed to execute routing command: " + String(error) },
      { status: 500 }
    );
  }
}

// ─── DELETE Handler ────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (error: any) {
      if (error instanceof AuthError)
        return NextResponse.json(
          { error: error.message },
          { status: error.statusCode }
        );
    }

    const vtyshPath = getVtyshPath();
    if (!vtyshPath) {
      return NextResponse.json(
        { error: "FRR is not installed on this system" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { action, protocol, ...params } = body;

    switch (action) {
      // ────────────────────── Remove BGP neighbor ──────────────────────
      case "remove-bgp-neighbor": {
        const { ip } = params;
        if (!ip) {
          return NextResponse.json(
            { error: "ip is required" },
            { status: 400 }
          );
        }

        const lines = [
          "configure terminal",
          "router bgp",
          `  no neighbor ${ip}`,
          "  end",
          "write",
        ];

        const ok = vtyshConfigure(lines);
        return ok
          ? NextResponse.json({
              success: true,
              message: `BGP neighbor ${ip} removed`,
            })
          : NextResponse.json(
              { error: `Failed to remove BGP neighbor ${ip}` },
              { status: 500 }
            );
      }

      // ────────────────────── Remove BGP network ──────────────────────
      case "remove-bgp-network": {
        const { prefix } = params;
        if (!prefix) {
          return NextResponse.json(
            { error: "prefix is required" },
            { status: 400 }
          );
        }

        const lines = [
          "configure terminal",
          "router bgp",
          `  no network ${prefix}`,
          "  end",
          "write",
        ];

        const ok = vtyshConfigure(lines);
        return ok
          ? NextResponse.json({
              success: true,
              message: `BGP network ${prefix} removed`,
            })
          : NextResponse.json(
              { error: `Failed to remove BGP network ${prefix}` },
              { status: 500 }
            );
      }

      // ────────────────────── Disable BGP ──────────────────────
      case "disable-bgp": {
        const lines = [
          "configure terminal",
          "no router bgp",
          "  end",
          "write",
        ];

        const ok = vtyshConfigure(lines);
        return ok
          ? NextResponse.json({
              success: true,
              message: "BGP disabled",
            })
          : NextResponse.json(
              { error: "Failed to disable BGP" },
              { status: 500 }
            );
      }

      // ────────────────────── Remove OSPF network ──────────────────────
      case "remove-ospf-network": {
        const { prefix, areaId } = params;
        if (!prefix) {
          return NextResponse.json(
            { error: "prefix and areaId are required" },
            { status: 400 }
          );
        }

        const lines = [
          "configure terminal",
          "router ospf",
          `  no network ${prefix} area ${areaId || "0.0.0.0"}`,
          "  end",
          "write",
        ];

        const ok = vtyshConfigure(lines);
        return ok
          ? NextResponse.json({
              success: true,
              message: `OSPF network ${prefix} removed`,
            })
          : NextResponse.json(
              { error: `Failed to remove OSPF network ${prefix}` },
              { status: 500 }
            );
      }

      // ────────────────────── Disable OSPF ──────────────────────
      case "disable-ospf": {
        const lines = [
          "configure terminal",
          "no router ospf",
          "  end",
          "write",
        ];

        const ok = vtyshConfigure(lines);
        return ok
          ? NextResponse.json({
              success: true,
              message: "OSPF disabled",
            })
          : NextResponse.json(
              { error: "Failed to disable OSPF" },
              { status: 500 }
            );
      }

      // ────────────────────── Disable OSPFv3 ──────────────────────
      case "disable-ospf6": {
        const lines = [
          "configure terminal",
          "no router ospf6",
          "  end",
          "write",
        ];

        const ok = vtyshConfigure(lines);
        return ok
          ? NextResponse.json({
              success: true,
              message: "OSPFv3 disabled",
            })
          : NextResponse.json(
              { error: "Failed to disable OSPFv3" },
              { status: 500 }
            );
      }

      // ────────────────────── Disable RIP ──────────────────────
      case "disable-rip": {
        const lines = [
          "configure terminal",
          "no router rip",
          "  end",
          "write",
        ];

        const ok = vtyshConfigure(lines);
        return ok
          ? NextResponse.json({
              success: true,
              message: "RIP disabled",
            })
          : NextResponse.json(
              { error: "Failed to disable RIP" },
              { status: 500 }
            );
      }

      // ────────────────────── Remove RIP network ──────────────────────
      case "remove-rip-network": {
        const { network } = params;
        if (!network) {
          return NextResponse.json(
            { error: "network is required" },
            { status: 400 }
          );
        }

        const lines = [
          "configure terminal",
          "router rip",
          `  no network ${network}`,
          "  end",
          "write",
        ];

        const ok = vtyshConfigure(lines);
        return ok
          ? NextResponse.json({
              success: true,
              message: `RIP network ${network} removed`,
            })
          : NextResponse.json(
              { error: `Failed to remove RIP network ${network}` },
              { status: 500 }
            );
      }

      // ────────────────────── Disable RIPng ──────────────────────
      case "disable-ripng": {
        const lines = [
          "configure terminal",
          "no router ripng",
          "  end",
          "write",
        ];

        const ok = vtyshConfigure(lines);
        return ok
          ? NextResponse.json({
              success: true,
              message: "RIPng disabled",
            })
          : NextResponse.json(
              { error: "Failed to disable RIPng" },
              { status: 500 }
            );
      }

      // ────────────────────── Remove RIPng interface ──────────────────────
      case "remove-ripng-interface": {
        const { interface: iface } = params;
        if (!iface) {
          return NextResponse.json(
            { error: "interface is required" },
            { status: 400 }
          );
        }

        const lines = [
          "configure terminal",
          "router ripng",
          `  no interface ${iface}`,
          "  end",
          "write",
        ];

        const ok = vtyshConfigure(lines);
        return ok
          ? NextResponse.json({
              success: true,
              message: `RIPng interface ${iface} removed`,
            })
          : NextResponse.json(
              { error: `Failed to remove RIPng interface ${iface}` },
              { status: 500 }
            );
      }

      // ────────────────────── Remove BFD peer ──────────────────────
      case "remove-bfd-peer": {
        const { neighbor } = params;
        if (!neighbor) {
          return NextResponse.json(
            { error: "neighbor is required" },
            { status: 400 }
          );
        }

        const lines = [
          "configure terminal",
          "bfd",
          `  no peer ${neighbor}`,
          "  end",
          "write",
        ];

        const ok = vtyshConfigure(lines);
        return ok
          ? NextResponse.json({
              success: true,
              message: `BFD peer ${neighbor} removed`,
            })
          : NextResponse.json(
              { error: `Failed to remove BFD peer ${neighbor}` },
              { status: 500 }
            );
      }

      // ────────────────────── Disable BFD ──────────────────────
      case "disable-bfd": {
        const lines = [
          "configure terminal",
          "no bfd",
          "  end",
          "write",
        ];

        const ok = vtyshConfigure(lines);
        return ok
          ? NextResponse.json({
              success: true,
              message: "BFD disabled",
            })
          : NextResponse.json(
              { error: "Failed to disable BFD" },
              { status: 500 }
            );
      }

      // ────────────────────── Disable IS-IS ──────────────────────
      case "disable-isis": {
        const lines = [
          "configure terminal",
          "no router isis",
          "  end",
          "write",
        ];

        const ok = vtyshConfigure(lines);
        return ok
          ? NextResponse.json({
              success: true,
              message: "IS-IS disabled",
            })
          : NextResponse.json(
              { error: "Failed to disable IS-IS" },
              { status: 500 }
            );
      }

      // ────────────────────── Remove Route Map ──────────────────────
      case "remove-route-map": {
        const { name, sequence } = params;
        if (!name) {
          return NextResponse.json(
            { error: "name is required" },
            { status: 400 }
          );
        }

        let line: string;
        if (sequence !== undefined && sequence !== null) {
          line = `no route-map ${name} ${sequence}`;
        } else {
          line = `no route-map ${name}`;
        }

        const ok = vtyshConfigure([
          "configure terminal",
          line,
          "  end",
          "write",
        ]);
        return ok
          ? NextResponse.json({
              success: true,
              message: `Route map ${name} removed`,
            })
          : NextResponse.json(
              { error: `Failed to remove route map ${name}` },
              { status: 500 }
            );
      }

      // ────────────────────── Remove Prefix List ──────────────────────
      case "remove-prefix-list": {
        const { name, seq } = params;
        if (!name) {
          return NextResponse.json(
            { error: "name is required" },
            { status: 400 }
          );
        }

        let line: string;
        if (seq !== undefined && seq !== null) {
          line = `no ip prefix-list ${name} seq ${seq}`;
        } else {
          line = `no ip prefix-list ${name}`;
        }

        const ok = vtyshConfigure([
          "configure terminal",
          line,
          "  end",
          "write",
        ]);
        return ok
          ? NextResponse.json({
              success: true,
              message: `Prefix list ${name} removed`,
            })
          : NextResponse.json(
              { error: `Failed to remove prefix list ${name}` },
              { status: 500 }
            );
      }

      // ────────────────────── Remove Access List ──────────────────────
      case "remove-access-list": {
        const { name } = params;
        if (!name) {
          return NextResponse.json(
            { error: "name is required" },
            { status: 400 }
          );
        }

        const ok = vtyshConfigure([
          "configure terminal",
          `no access-list ${name}`,
          "  end",
          "write",
        ]);
        return ok
          ? NextResponse.json({
              success: true,
              message: `Access list ${name} removed`,
            })
          : NextResponse.json(
              { error: `Failed to remove access list ${name}` },
              { status: 500 }
            );
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("[Dynamic Routing API] DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to execute delete command: " + String(error) },
      { status: 500 }
    );
  }
}
