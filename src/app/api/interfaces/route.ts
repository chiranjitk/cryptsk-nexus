import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { isValidIPv6CIDR } from "@/lib/validators/ipv6";
import { execFile } from "child_process";
import { promisify } from "util";
import { readFileSync, readdirSync } from "fs";

const execFileAsync = promisify(execFile);

// ─── Validation Helpers ─────────────────────────────────────────────────

/** Validate network interface name — only allow safe characters */
function validateIfaceName(name: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) throw new Error(`Invalid interface name: ${name}`);
  return name;
}

/** Validate CIDR / IP address — only allow safe characters */
function validateCidr(cidr: string): string {
  if (!/^[a-zA-Z0-9./:]+$/.test(cidr)) throw new Error(`Invalid CIDR: ${cidr}`);
  return cidr;
}

// ─── Helpers ──────────────────────────────────────────────────────────

/** Run a command with argument array and return trimmed stdout */
async function run(args: string[], timeout = 5000): Promise<string> {
  try {
    const [cmd, ...rest] = args;
    const { stdout } = await execFileAsync(cmd, rest, { timeout, encoding: "utf-8" });
    return stdout.trim();
  } catch {
    return "";
  }
}

/** Run a JSON command and parse result */
async function runJson(args: string[], timeout = 5000): Promise<any[]> {
  try {
    const [cmd, ...rest] = args;
    const { stdout } = await execFileAsync(cmd, rest, { timeout, encoding: "utf-8" });
    return JSON.parse(stdout.trim());
  } catch {
    return [];
  }
}

/** Read a single sysfs value */
function sysfs(path: string): string {
  try {
    return readFileSync(path, "utf-8").trim();
  } catch {
    return "";
  }
}

/** Get list of physical interfaces from /sys/class/net (excluding virtual) */
function getPhysicalInterfaces(): Set<string> {
  const virtualPrefixes = ["lo", "docker", "br-", "veth", "virbr", "vnet"];
  try {
    return readdirSync("/sys/class/net/")
      .filter((name: string) => {
        // Check if it's a physical device (has a device symlink)
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

/** Get link speed in Mbps */
function getSpeedMbps(iface: string): number {
  const speed = parseInt(sysfs(`/sys/class/net/${iface}/speed`));
  if (isNaN(speed) || speed <= 0) {
    // Fallback: guess from MTU and name
    if (iface.startsWith("eth") || iface.startsWith("enp") || iface.startsWith("ens")) return 1000;
    if (iface.startsWith("wl")) return 0; // WiFi — can't determine easily
    return 0;
  }
  return speed;
}

/** Determine interface type from name and properties */
function getIfaceType(name: string, isPhysical: boolean, master?: string): string {
  if (name === "lo") return "LOOPBACK";
  if (name.startsWith("wl") || name.startsWith("wlan")) return "WIRELESS";
  if (name.startsWith("docker") || name.startsWith("veth")) return "DOCKER";
  if (name.startsWith("br") || name.startsWith("bridge") || name.startsWith("virbr")) return "BRIDGE";
  if (name.startsWith("bond")) return "BOND";
  if (master) return "VLAN"; // enslaved interfaces
  if (/\.\d+$/.test(name)) return "VLAN"; // eth0.100 style VLAN
  if (isPhysical) return "PHYSICAL";
  return "VIRTUAL";
}

/** Detect bridges from /sys/class/net */
function detectBridges(links: any[], addrs: any[]): Array<{ name: string; members: string[]; ipv4: string; secondaryIps: string[]; status: string }> {
  const bridges: Array<{ name: string; members: string[]; ipv4: string; secondaryIps: string[]; status: string }> = [];

  for (const link of links) {
    const name = link.ifname;
    try {
      // A bridge has a "brif" directory
      readdirSync(`/sys/class/net/${name}/brif/`);
      const members = readdirSync(`/sys/class/net/${name}/brif/`);
      const addrLink = addrs.find((a: any) => a.ifname === name);
      const nonLinkAddrs = addrLink?.addr_info?.filter((a: any) => a.family !== "link") || [];
      const inetAddrs = nonLinkAddrs.filter((a: any) => a.family === "inet");
      const ipv4 = inetAddrs[0] ? `${inetAddrs[0].local}/${inetAddrs[0].prefixlen}` : "";
      const secondaryIps = nonLinkAddrs.filter((a: any) => a.family !== "inet").concat(inetAddrs.slice(1)).map((a: any) => `${a.local}/${a.prefixlen}`);
      bridges.push({
        name,
        members,
        ipv4,
        secondaryIps,
        status: link.operstate || "DOWN",
      });
    } catch {
      // Not a bridge
    }
  }
  return bridges;
}

/** Detect VLAN interfaces */
function detectVlans(links: any[], physicalIfaces: Set<string>, addrs: any[]): Array<{ name: string; parent: string; vlanId: number; ipv4: string; secondaryIps: string[]; status: string }> {
  const vlans: Array<{ name: string; parent: string; vlanId: number; ipv4: string; secondaryIps: string[]; status: string }> = [];

  // Check /proc/net/vlan/config for 802.1Q VLANs
  const vlanConfig = sysfs("/proc/net/vlan/config");
  if (vlanConfig) {
    const lines = vlanConfig.split("\n").slice(2); // skip header lines
    for (const line of lines) {
      const match = line.match(/^\s*(\S+)\s*\|\s*(\S+)\s*\|\s*(\d+)/);
      if (match) {
        const name = match[1];
        const parent = match[2];
        const vlanId = parseInt(match[3]);
        const link = links.find((l: any) => l.ifname === name);
        const addrLink = addrs.find((a: any) => a.ifname === name);
        const nonLinkAddrs = addrLink?.addr_info?.filter((a: any) => a.family !== "link") || [];
        const inetAddrs = nonLinkAddrs.filter((a: any) => a.family === "inet");
        const ipv4 = inetAddrs[0] ? `${inetAddrs[0].local}/${inetAddrs[0].prefixlen}` : "";
        const secondaryIps = nonLinkAddrs.filter((a: any) => a.family !== "inet").concat(inetAddrs.slice(1)).map((a: any) => `${a.local}/${a.prefixlen}`);
        vlans.push({
          name,
          parent,
          vlanId,
          ipv4,
          secondaryIps,
          status: link?.operstate || "DOWN",
        });
      }
    }
  }

  // Also detect VLAN-style named interfaces (e.g., eth0.100)
  for (const link of links) {
    const name = link.ifname;
    const vlanMatch = name.match(/^(.+)\.(\d+)$/);
    if (vlanMatch && !vlans.find(v => v.name === name)) {
      const parent = vlanMatch[1];
      const vlanId = parseInt(vlanMatch[2]);
      const addrLink = addrs.find((a: any) => a.ifname === name);
      const nonLinkAddrs = addrLink?.addr_info?.filter((a: any) => a.family !== "link") || [];
      const inetAddrs = nonLinkAddrs.filter((a: any) => a.family === "inet");
      const ipv4 = inetAddrs[0] ? `${inetAddrs[0].local}/${inetAddrs[0].prefixlen}` : "";
      const secondaryIps = nonLinkAddrs.filter((a: any) => a.family !== "inet").concat(inetAddrs.slice(1)).map((a: any) => `${a.local}/${a.prefixlen}`);
      vlans.push({
        name,
        parent,
        vlanId,
        ipv4,
        secondaryIps,
        status: link.operstate || "DOWN",
      });
    }
  }

  return vlans;
}

/** Detect bond interfaces */
function detectBonds(links: any[], addrs: any[]): Array<{ name: string; mode: string; members: string[]; ipv4: string; secondaryIps: string[]; status: string }> {
  const bonds: Array<{ name: string; mode: string; members: string[]; ipv4: string; secondaryIps: string[]; status: string }> = [];

  for (const link of links) {
    const name = link.ifname;
    if (!name.startsWith("bond")) continue;
    try {
      // Bond interfaces have a bonding_masters file or /proc/net/bonding/bond0
      const bondingInfo = sysfs(`/proc/net/bonding/${name}`);
      let mode = "unknown";
      if (bondingInfo) {
        const modeMatch = bondingInfo.match(/Bonding Mode:\s+(.+)/);
        if (modeMatch) mode = modeMatch[1].trim();
      }

      // Get bond members from sysfs
      let members: string[] = [];
      try {
        members = readdirSync(`/sys/class/net/${name}/lower_${name}/`)
          .filter((f: string) => f !== "master");
      } catch {
        try {
          members = readdirSync(`/sys/class/net/${name}/slave_`)
            .filter((f: string) => f !== "master");
        } catch {
          // Try reading bonding slaves
          const slaves = sysfs(`/sys/class/net/${name}/bonding/slaves`);
          if (slaves) members = slaves.split(/\s+/).filter(Boolean);
        }
      }

      const addrLink = addrs.find((a: any) => a.ifname === name);
      const nonLinkAddrs = addrLink?.addr_info?.filter((a: any) => a.family !== "link") || [];
      const inetAddrs = nonLinkAddrs.filter((a: any) => a.family === "inet");
      const ipv4 = inetAddrs[0] ? `${inetAddrs[0].local}/${inetAddrs[0].prefixlen}` : "";
      const secondaryIps = nonLinkAddrs.filter((a: any) => a.family !== "inet").concat(inetAddrs.slice(1)).map((a: any) => `${a.local}/${a.prefixlen}`);
      bonds.push({ name, mode, members, ipv4, secondaryIps, status: link.operstate || "DOWN" });
    } catch {
      // Not a bond
    }
  }
  return bonds;
}

/** Read /proc/net/dev for TX/RX bytes */
function getTrafficCounters(): Record<string, { txBytes: number; rxBytes: number }> {
  const counters: Record<string, { txBytes: number; rxBytes: number }> = {};
  const procDev = sysfs("/proc/net/dev");
  if (!procDev) return counters;

  const lines = procDev.split("\n").slice(2); // skip header lines
  for (const line of lines) {
    // Format: " eth0: rx_bytes rx_packets rx_errs rx_drop rx_fifo rx_frame rx_compressed rx_multicast  tx_bytes tx_packets ..."
    // 8 RX fields, then 8 TX fields (space-separated, no pipe in data lines)
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const name = line.substring(0, colonIdx).trim();
    const fields = line.substring(colonIdx + 1).trim().split(/\s+/);
    if (fields.length >= 9) {
      counters[name] = {
        rxBytes: parseInt(fields[0]) || 0,
        txBytes: parseInt(fields[8]) || 0,
      };
    }
  }
  return counters;
}

// ─── GET: Detect real system interfaces ─────────────────────────────
export async function GET(request: NextRequest) {
  try {
    try {
      try {
        await requireAuth(request);
      } catch (e) {
        if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
        throw e;
      }
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    // Get physical interface names
    const physicalIfaces = getPhysicalInterfaces();

    // Get all link data from `ip -j link show`
    const links: any[] = await runJson(["ip", "-j", "link", "show"]);

    // Get address data from `ip -j addr show`
    const addrs: any[] = await runJson(["ip", "-j", "addr", "show"]);

    // Get traffic counters
    const traffic = getTrafficCounters();

    // Merge addresses into links
    const linkMap = new Map<string, any>();
    for (const link of links) {
      linkMap.set(link.ifname, link);
    }

    // Get DB-stored roles for interfaces
    const dbInterfaces = await db.systemInterface.findMany({
      select: { name: true, role: true, enabled: true },
    });
    const dbRoleMap = new Map(dbInterfaces.map(i => [i.name, i]));
    const defaultGateway = (await run(["ip", "route", "show", "default"])).match(/via\s+(\S+)/)?.[1] || "";

    // Build interfaces list
    const interfaces = links
      .filter((link: any) => link.ifname !== "lo") // exclude loopback from main list
      .map((link: any) => {
        const name = link.ifname;
        const isPhysical = physicalIfaces.has(name);
        const type = getIfaceType(name, isPhysical, link.master);
        const addrLink = addrs.find((a: any) => a.ifname === name);
        const inetAddrs = addrLink?.addr_info?.filter((a: any) => a.family === "inet") || [];
        const ipv4Info = inetAddrs[0];
        const ipv6Info = addrLink?.addr_info?.find((a: any) => a.family === "inet6");
        const secondaryIps = inetAddrs.slice(1).map((a: any) => `${a.local}/${a.prefixlen}`);
        const counters = traffic[name] || { txBytes: 0, rxBytes: 0 };
        const dbEntry = dbRoleMap.get(name);

        // Determine role from DB or guess
        let role = "UNASSIGNED";
        if (dbEntry?.role) {
          role = dbEntry.role;
        } else if (ipv4Info && ipv4Info.local === defaultGateway) {
          role = "WAN";
        }

        const speed = getSpeedMbps(name);
        const speedStr = speed > 0 ? `${speed >= 1000 ? `${speed / 1000}G` : `${speed}M`}bps` : (type === "WIRELESS" ? "WiFi" : "—");
        const carrier = link.operstate === "UP" || link.operstate === "UNKNOWN";
        const enabled = link.flags?.includes("UP") || false;

        // Sync to DB in background (best-effort)
        setImmediate(async () => {
          try {
            await db.systemInterface.upsert({
              where: { name },
              update: {
                type: type as any,
                macAddress: link.address || "",
                mtu: link.mtu || 1500,
                speed,
                carrierStatus: carrier,
                ipv4Address: ipv4Info ? `${ipv4Info.local}/${ipv4Info.prefixlen}` : "",
                ipv6Address: ipv6Info ? `${ipv6Info.local}/${ipv6Info.prefixlen}` : "",
              },
              create: {
                name,
                type: type as any,
                macAddress: link.address || "",
                mtu: link.mtu || 1500,
                speed,
                carrierStatus: carrier,
                ipv4Address: ipv4Info ? `${ipv4Info.local}/${ipv4Info.prefixlen}` : "",
                ipv6Address: ipv6Info ? `${ipv6Info.local}/${ipv6Info.prefixlen}` : "",
              },
            });
          } catch {
            // Ignore DB sync errors
          }
        });

        return {
          name,
          type,
          role,
          mac: link.address || "",
          ipv4: ipv4Info ? `${ipv4Info.local}/${ipv4Info.prefixlen}` : "",
          secondaryIps,
          ipv6: ipv6Info ? `${ipv6Info.local}/${ipv6Info.prefixlen}` : "",
          speed: speedStr,
          carrier,
          txBytes: counters.txBytes,
          rxBytes: counters.rxBytes,
          status: link.operstate || "DOWN",
          enabled,
          mtu: link.mtu || 1500,
        };
      });

    // Detect VLANs, bridges, bonds
    const vlans = detectVlans(links, physicalIfaces, addrs);
    const bridges = detectBridges(links, addrs);
    const bonds = detectBonds(links, addrs);

    // Get gateway config from DB
    let gatewayConfig: Record<string, any> = {};
    try {
      const gc = await db.gatewayConfig.findUnique({ where: { id: "default" } });
      if (gc) {
        gatewayConfig = {
          gatewayMode: gc.gatewayMode,
          defaultGateway: gc.defaultGateway,
          dnsForwarders: gc.dnsForwarders,
          enableDnsCache: gc.enableDnsCache,
          dhcpType: gc.dhcpServerType,
          dhcpEnabled: gc.dhcpServerEnabled,
          dhcpUrl: gc.dhcpServerUrl,
          dnsType: gc.dnsServerType,
          dnsEnabled: gc.dnsServerEnabled,
          captivePortalEnabled: gc.portalServerEnabled,
          captivePortalHttpPort: gc.portalListenPort,
          captivePortalHttps: gc.portalHttpsEnabled,
          tcEnabled: false,
          natEnabled: false,
          nftablesEnabled: false,
        };
      }
    } catch {
      // No gateway config in DB yet
    }

    // Compute stats
    const stats = {
      totalInterfaces: interfaces.length,
      wanLinks: interfaces.filter(i => i.role === "WAN").length,
      lanLinks: interfaces.filter(i => i.role === "LAN").length,
      vlans: vlans.length,
    };

    return NextResponse.json({ interfaces, vlans, bridges, bonds, gatewayConfig, stats });
  } catch (error) {
    console.error("[Interfaces API] GET error:", error);
    return NextResponse.json({ error: "Failed to detect interfaces: " + String(error) }, { status: 500 });
  }
}

// ─── POST: Forward mutations to gateway-service ──────────────────
export async function POST(request: NextRequest) {
  try {
    try {
      try {
        await requireAuth(request);
      } catch (e) {
        if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
        throw e;
      }
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    const body = await request.json();
    const { action, ...payload } = body;

    // Handle actions that can be done locally via system commands
    if (action === "create-vlan") {
      const { parent, vlanId, ipv4 } = payload;
      if (!parent || !vlanId) return NextResponse.json({ error: "Parent and VLAN ID required" }, { status: 400 });
      const safeParent = validateIfaceName(String(parent));
      const safeVlanId = String(vlanId);
      const vlanName = `${safeParent}.${safeVlanId}`;
      try {
        await execFileAsync("ip", ["link", "add", "link", safeParent, "name", vlanName, "type", "vlan", "id", safeVlanId], { timeout: 5000 });
        await execFileAsync("ip", ["link", "set", vlanName, "up"], { timeout: 5000 });
        if (ipv4) {
          await execFileAsync("ip", ["addr", "add", validateCidr(String(ipv4)), "dev", vlanName], { timeout: 5000 });
        }
        return NextResponse.json({ success: true, message: `VLAN ${vlanName} created` });
      } catch (err: any) {
        return NextResponse.json({ error: "Failed to create VLAN: " + String(err.message) }, { status: 500 });
      }
    }

    if (action === "create-bridge") {
      const { name, members } = payload;
      if (!name) return NextResponse.json({ error: "Bridge name required" }, { status: 400 });
      const safeName = validateIfaceName(String(name));
      try {
        await execFileAsync("ip", ["link", "add", "name", safeName, "type", "bridge"], { timeout: 5000 });
        await execFileAsync("ip", ["link", "set", safeName, "up"], { timeout: 5000 });
        if (Array.isArray(members)) {
          for (const m of members) {
            await execFileAsync("ip", ["link", "set", validateIfaceName(String(m)), "master", safeName], { timeout: 5000 });
          }
        }
        return NextResponse.json({ success: true, message: `Bridge ${safeName} created` });
      } catch (err: any) {
        return NextResponse.json({ error: "Failed to create bridge: " + String(err.message) }, { status: 500 });
      }
    }

    if (action === "create-bond") {
      const { name, mode, members } = payload;
      if (!name) return NextResponse.json({ error: "Bond name required" }, { status: 400 });
      const safeName = validateIfaceName(String(name));
      const bondMode = mode || "802.3ad";
      try {
        await execFileAsync("ip", ["link", "add", "name", safeName, "type", "bond", "mode", bondMode], { timeout: 5000 });
        await execFileAsync("ip", ["link", "set", safeName, "up"], { timeout: 5000 });
        if (Array.isArray(members)) {
          for (const m of members) {
            await execFileAsync("ip", ["link", "set", validateIfaceName(String(m)), "master", safeName], { timeout: 5000 });
          }
        }
        return NextResponse.json({ success: true, message: `Bond ${safeName} created` });
      } catch (err: any) {
        return NextResponse.json({ error: "Failed to create bond: " + String(err.message) }, { status: 500 });
      }
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("[Interfaces API] POST error:", error);
    return NextResponse.json({ error: "Failed to process interface request" }, { status: 500 });
  }
}

// ─── PUT: Update interface configurations ────────────────────────
export async function PUT(request: NextRequest) {
  try {
    try {
      try {
        await requireAuth(request);
      } catch (e) {
        if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
        throw e;
      }
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    const body = await request.json();
    const { action, name, role, enabled, ipv4, ipv6 } = body;

    if (!name) {
      return NextResponse.json({ error: "Interface name is required" }, { status: 400 });
    }

    const safeName = validateIfaceName(String(name));

    // Handle role change — update in DB
    if (action === "set-role" && role) {
      try {
        await db.systemInterface.upsert({
          where: { name },
          update: { role: role as any },
          create: { name, role: role as any },
        });
        return NextResponse.json({ success: true, message: `Role updated to ${role}` });
      } catch (err: any) {
        return NextResponse.json({ error: "Failed to update role: " + String(err.message) }, { status: 500 });
      }
    }

    // Handle enable/disable via system commands
    if (action === "set-enabled") {
      const cmd = enabled ? "up" : "down";
      try {
        await execFileAsync("ip", ["link", "set", safeName, cmd], { timeout: 5000 });
        await db.systemInterface.upsert({
          where: { name },
          update: { enabled: !!enabled },
          create: { name, enabled: !!enabled },
        });
        return NextResponse.json({ success: true, message: `Interface ${name} ${cmd}` });
      } catch (err: any) {
        return NextResponse.json({ error: `Failed to ${cmd} interface: ` + String(err.message) }, { status: 500 });
      }
    }

    // Handle IP configuration
    if (action === "configure-ip") {
      try {
        if (ipv4) {
          // Flush existing IPs first, then add new one
          await execFileAsync("ip", ["addr", "flush", "dev", safeName], { timeout: 5000 });
          await execFileAsync("ip", ["addr", "add", validateCidr(String(ipv4)), "dev", safeName], { timeout: 5000 });
        }
        if (ipv6) {
          await execFileAsync("ip", ["-6", "addr", "add", validateCidr(String(ipv6)), "dev", safeName], { timeout: 5000 });
        }
        // Update DB
        await db.systemInterface.upsert({
          where: { name },
          update: {
            ipv4Address: ipv4 ? ipv4.split("/")[0] : undefined,
          },
          create: { name, ipv4Address: ipv4 ? ipv4.split("/")[0] : "" },
        });
        return NextResponse.json({ success: true, message: "IP configuration updated" });
      } catch (err: any) {
        return NextResponse.json({ error: "Failed to configure IP: " + String(err.message) }, { status: 500 });
      }
    }

    // Handle bring-up / bring-down
    if (action === "bring-up") {
      try {
        await execFileAsync("ip", ["link", "set", safeName, "up"], { timeout: 5000 });
        return NextResponse.json({ success: true, message: `Interface ${name} brought up` });
      } catch (err: any) {
        return NextResponse.json({ error: "Failed: " + String(err.message) }, { status: 500 });
      }
    }
    if (action === "bring-down") {
      try {
        await execFileAsync("ip", ["link", "set", safeName, "down"], { timeout: 5000 });
        return NextResponse.json({ success: true, message: `Interface ${name} brought down` });
      } catch (err: any) {
        return NextResponse.json({ error: "Failed: " + String(err.message) }, { status: 500 });
      }
    }

    // Handle flush IPs
    if (action === "flush-ips") {
      try {
        await execFileAsync("ip", ["addr", "flush", "dev", safeName], { timeout: 5000 });
        return NextResponse.json({ success: true, message: `IPs flushed on ${name}` });
      } catch (err: any) {
        return NextResponse.json({ error: "Failed: " + String(err.message) }, { status: 500 });
      }
    }

    // Handle add secondary/alias IP (supports both IPv4 and IPv6 CIDR)
    if (action === "add-secondary-ip") {
      const { address } = body;
      if (!name || !address) {
        return NextResponse.json({ error: "Interface name and IP address are required" }, { status: 400 });
      }
      const addrStr = String(address);
      // Validate IP format — detect IPv6 vs IPv4 by presence of colon
      const isIPv6 = addrStr.includes(":");
      if (isIPv6) {
        if (!isValidIPv6CIDR(addrStr)) {
          return NextResponse.json({ error: "Invalid IPv6 CIDR format. Use CIDR notation (e.g. 2001:db8::1/64)" }, { status: 400 });
        }
      } else if (addrStr.includes(".")) {
        const ipv4Pattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/;
        if (!ipv4Pattern.test(addrStr)) {
          return NextResponse.json({ error: "Invalid IPv4 CIDR format. Use CIDR notation (e.g. 192.168.1.2/24)" }, { status: 400 });
        }
      } else {
        return NextResponse.json({ error: "Invalid IP format" }, { status: 400 });
      }
      try {
        const cmd = isIPv6 ? "ip" : "ip";
        const args = isIPv6
          ? ["-6", "addr", "add", validateCidr(addrStr), "dev", safeName]
          : ["addr", "add", validateCidr(addrStr), "dev", safeName];
        await execFileAsync(cmd, args, { timeout: 5000 });
        return NextResponse.json({ success: true, message: `Secondary IP ${address} added to ${name}` });
      } catch (err: any) {
        return NextResponse.json({ error: "Failed to add secondary IP: " + String(err.message) }, { status: 500 });
      }
    }

    // Handle remove secondary/alias IP (supports both IPv4 and IPv6)
    if (action === "remove-secondary-ip") {
      const { address } = body;
      if (!name || !address) {
        return NextResponse.json({ error: "Interface name and IP address are required" }, { status: 400 });
      }
      try {
        const addrStr = String(address);
        const isIPv6 = addrStr.includes(":");
        const cmd = "ip";
        const args = isIPv6
          ? ["-6", "addr", "del", validateCidr(addrStr), "dev", safeName]
          : ["addr", "del", validateCidr(addrStr), "dev", safeName];
        await execFileAsync(cmd, args, { timeout: 5000 });
        return NextResponse.json({ success: true, message: `Secondary IP ${address} removed from ${name}` });
      } catch (err: any) {
        return NextResponse.json({ error: "Failed to remove secondary IP: " + String(err.message) }, { status: 500 });
      }
    }

    // Handle gateway config save
    if (body.path === "/gateway-config") {
      try {
        const { gatewayMode, defaultGateway, dnsForwarders, enableDnsCache } = body;
        await db.gatewayConfig.upsert({
          where: { id: "default" },
          update: {
            gatewayMode: gatewayMode,
            defaultGateway: defaultGateway,
            dnsForwarders: dnsForwarders,
            enableDnsCache: enableDnsCache,
          },
          create: {
            gatewayMode: gatewayMode || "BRIDGE",
            defaultGateway: defaultGateway || "",
            dnsForwarders: dnsForwarders || "",
            enableDnsCache: enableDnsCache ?? true,
          },
        });
        return NextResponse.json({ success: true, message: "Gateway configuration saved" });
      } catch (err: any) {
        return NextResponse.json({ error: "Failed to save gateway config: " + String(err.message) }, { status: 500 });
      }
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("[Interfaces API] PUT error:", error);
    return NextResponse.json({ error: "Failed to update interface configuration" }, { status: 500 });
  }
}

// ─── DELETE: Remove interface configurations ─────────────────────
export async function DELETE(request: NextRequest) {
  try {
    try {
      try {
        await requireAuth(request);
      } catch (e) {
        if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
        throw e;
      }
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    const { searchParams } = new URL(request.url);
    const name = searchParams.get("name") || "";
    const path = searchParams.get("path") || "";
    const type = searchParams.get("type") || "";

    if (!name) {
      return NextResponse.json({ error: "Interface name is required" }, { status: 400 });
    }

    const safeName = validateIfaceName(name);

    // Determine the type from the path
    let ifaceType = type;
    if (path.includes("vlan")) ifaceType = "vlan";
    else if (path.includes("bridge")) ifaceType = "bridge";
    else if (path.includes("bond")) ifaceType = "bond";

    try {
      if (ifaceType === "vlan" || name.includes(".")) {
        await execFileAsync("ip", ["link", "delete", safeName], { timeout: 5000 });
      } else if (ifaceType === "bridge") {
        await execFileAsync("ip", ["link", "delete", safeName, "type", "bridge"], { timeout: 5000 });
      } else if (ifaceType === "bond") {
        await execFileAsync("ip", ["link", "delete", safeName, "type", "bond"], { timeout: 5000 });
      } else {
        // Try generic delete
        await execFileAsync("ip", ["link", "delete", safeName], { timeout: 5000 });
      }
      return NextResponse.json({ success: true, message: `${name} deleted` });
    } catch (err: any) {
      return NextResponse.json({ error: "Failed to delete: " + String(err.message) }, { status: 500 });
    }
  } catch (error) {
    console.error("[Interfaces API] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete interface" }, { status: 500 });
  }
}
