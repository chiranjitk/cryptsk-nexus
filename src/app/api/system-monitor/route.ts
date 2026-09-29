import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

const GW = process.env.GATEWAY_SERVICE_URL || "http://localhost:3005";

// ── CORS Headers ────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ── OPTIONS handler for CORS preflight ──────────────────────────────

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// ── Safe fetch with timeout & fallback ──────────────────────────────

async function safeFetch(url: string, fallback: unknown) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return fallback;
    return await res.json();
  } catch {
    return fallback;
  }
}

// ── GET /api/system-monitor ────────────────────────────────────────
// Aggregates multiple gateway-service endpoints into a single call

export async function GET(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (error) {
      if (error instanceof AuthError)
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    const [health, interfaces, ddos, pppoe, firewall, dhcp] = await Promise.all([
    safeFetch(`${GW}/api/health`, { status: "unreachable", uptime: 0 }),
    safeFetch(`${GW}/api/interfaces`, { data: [], total: 0 }),
    safeFetch(`${GW}/api/ddos/counters`, { policies: [], nftCounters: [] }),
    safeFetch(`${GW}/api/pppoe/sessions?status=ACTIVE`, { data: [], total: 0 }),
    safeFetch(`${GW}/api/firewall/rules?status=ENABLED`, { data: [], total: 0 }),
    safeFetch(`${GW}/api/dhcp/leases`, { data: [], total: 0 }),
  ]);

  // Derive interface counts
  const ifaceList = Array.isArray(interfaces.data) ? interfaces.data : Array.isArray(interfaces) ? interfaces : [];
  const ifaceTotal = interfaces.total || ifaceList.length;
  const wanIfaces = ifaceList.filter((i: Record<string, unknown>) => i.role === "WAN");
  const lanIfaces = ifaceList.filter((i: Record<string, unknown>) => i.role === "LAN");
  const wanUp = wanIfaces.filter((i: Record<string, unknown>) => i.status === "UP" || i.carrier === true).length;
  const wanDown = wanIfaces.length - wanUp;
  const lanUp = lanIfaces.filter((i: Record<string, unknown>) => i.status === "UP" || i.carrier === true).length;
  const lanDown = lanIfaces.length - lanUp;

  // DDoS policies
  const ddosPolicies = Array.isArray(ddos.policies) ? ddos.policies : [];
  const activePolicies = ddosPolicies.filter((p: Record<string, unknown>) => p.enabled).length;

  // Firewall rules
  const fwRules = Array.isArray(firewall.data) ? firewall.data : [];
  const activeFwRules = firewall.total || fwRules.length;

  // DHCP leases
  const dhcpLeases = Array.isArray(dhcp.data) ? dhcp.data : [];
  const dhcpTotal = dhcp.total || dhcpLeases.length;

  return NextResponse.json(
    {
      gateway: {
        status: health.status || "unreachable",
        uptime: health.uptime || 0,
        version: health.version || null,
      },
      interfaces: {
        total: ifaceTotal,
        wan: { total: wanIfaces.length, up: wanUp, down: wanDown },
        lan: { total: lanIfaces.length, up: lanUp, down: lanDown },
      },
      pppoe: {
        activeSessions: pppoe.total || 0,
      },
      ddos: {
        activePolicies,
        totalPolicies: ddosPolicies.length,
        counters: ddos.nftCounters || [],
      },
      firewall: {
        activeRules: activeFwRules,
      },
      dhcp: {
        leaseCount: dhcpTotal,
      },
    },
    { headers: corsHeaders }
  );
  } catch (error) {
    console.error("[GET /api/system-monitor] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
