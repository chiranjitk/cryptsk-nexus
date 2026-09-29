import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { execFile } from "child_process";
import { promisify } from "util";

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

async function run(args: string[], timeout = 5000): Promise<string> {
  try {
    const [cmd, ...rest] = args;
    const { stdout } = await execFileAsync(cmd, rest, { timeout, encoding: "utf-8" });
    return stdout.trim();
  } catch {
    return "";
  }
}

async function runJson(args: string[], timeout = 5000): Promise<any[]> {
  try {
    const [cmd, ...rest] = args;
    const { stdout } = await execFileAsync(cmd, rest, { timeout, encoding: "utf-8" });
    return JSON.parse(stdout.trim());
  } catch {
    return [];
  }
}

/** Parse a single route object from ip -j into our format */
function parseRoute(r: any, isV6 = false): {
  id: string;
  destination: string;
  gateway: string;
  interface: string;
  metric: number;
  scope: string;
  protocol: string;
  type: string;
  flags: string[];
  pref?: string;
} {
  const dst = r.dst || (isV6 ? "::/0" : "0.0.0.0/0");
  const isDefault = dst === "default" || dst === "::/0";
  const displayDst = isDefault
    ? isV6 ? "::/0 (IPv6 default)" : "0.0.0.0/0 (Default)"
    : dst;

  return {
    id: `${dst}|${r.gateway || ""}|${r.dev || ""}|${r.metric || ""}`,
    destination: displayDst,
    gateway: r.gateway || "—",
    interface: r.dev || "—",
    metric: r.metric || 0,
    scope: r.scope || "—",
    protocol: r.protocol || "—",
    type: isDefault ? "default" : "static",
    flags: r.flags || [],
    pref: r.pref,
  };
}

// ─── GET: List all routes ─────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    // IPv4 routes
    const v4Routes: any[] = await runJson(["ip", "-j", "route", "show"]);
    // IPv6 routes
    const v6Routes: any[] = await runJson(["ip", "-6", "-j", "route", "show"]);

    const routes = [
      ...v4Routes.map((r) => parseRoute(r, false)),
      ...v6Routes.map((r) => parseRoute(r, true)),
    ];

    // Separate default routes and static routes
    const defaultRoutes = routes.filter((r) => r.type === "default");
    const staticRoutes = routes.filter((r) => r.type !== "default");

    return NextResponse.json({
      routes,
      defaultRoutes,
      staticRoutes,
      totalRoutes: routes.length,
      totalDefault: defaultRoutes.length,
      totalStatic: staticRoutes.length,
    });
  } catch (error) {
    console.error("[Routes API] GET error:", error);
    return NextResponse.json({ error: "Failed to list routes" }, { status: 500 });
  }
}

// ─── POST: Add a static route ────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    const body = await request.json();
    const { destination, gateway, metric, interface: iface } = body;

    // Validate required fields
    if (!destination) {
      return NextResponse.json({ error: "Destination network is required (e.g. 192.168.2.0/24 or 0.0.0.0/0)" }, { status: 400 });
    }

    // Build the ip route add args array
    const args = ["route", "add"];

    // Handle default route
    if (destination === "0.0.0.0/0" || destination === "default") {
      args.push("default");
    } else {
      args.push(validateCidr(destination));
    }

    // Add gateway if provided
    if (gateway && gateway !== "—") {
      args.push("via", validateCidr(gateway));
    }

    // Add interface if provided
    if (iface && iface !== "—") {
      args.push("dev", validateIfaceName(iface));
    }

    // Add metric if provided
    if (metric && metric > 0) {
      args.push("metric", String(metric));
    }

    try {
      await execFileAsync("ip", args, { timeout: 5000 });
      return NextResponse.json({ success: true, message: `Route added: ${destination}` });
    } catch (err: any) {
      console.error("[Routes API] exec add error:", err);
      return NextResponse.json(
        { error: "Failed to add route" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("[Routes API] POST error:", error);
    return NextResponse.json({ error: "Failed to add route" }, { status: 500 });
  }
}

// ─── DELETE: Remove a route ───────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    const body = await request.json();
    const { destination, gateway, interface: iface, metric } = body;

    if (!destination) {
      return NextResponse.json({ error: "Destination is required" }, { status: 400 });
    }

    // Build the ip route del args array
    const args = ["route", "del"];

    // Handle default route
    if (destination === "0.0.0.0/0" || destination === "default") {
      args.push("default");
    } else {
      args.push(validateCidr(destination));
    }

    if (gateway && gateway !== "—") {
      args.push("via", validateCidr(gateway));
    }

    if (iface && iface !== "—") {
      args.push("dev", validateIfaceName(iface));
    }

    if (metric && metric > 0) {
      args.push("metric", String(metric));
    }

    try {
      await execFileAsync("ip", args, { timeout: 5000 });
      return NextResponse.json({ success: true, message: `Route deleted: ${destination}` });
    } catch (err: any) {
      console.error("[Routes API] exec delete error:", err);
      return NextResponse.json(
        { error: "Failed to delete route" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("[Routes API] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete route" }, { status: 500 });
  }
}
