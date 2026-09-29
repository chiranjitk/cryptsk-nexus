import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

const GATEWAY_BASE = process.env.GATEWAY_URL || "http://localhost:3005";

// ─── GET: Service status for all ISP services ────────────────────
// Proxies to gateway-service /api/services/status
// Returns installed/running status for dnsmasq, kea-dhcp4, freeradius, accel-pppd
export async function GET(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (error) {
      if (error instanceof AuthError)
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
    const cookie = request.headers.get("cookie");
    if (cookie) headers["cookie"] = cookie;
    const res = await fetch(`${GATEWAY_BASE}/api/services/status`, {
      headers,
      cache: "no-store",
    });

    if (!res.ok) {
      // Gateway might be down - return safe defaults
      return NextResponse.json({
        services: {
          dnsmasq: { installed: false, running: false, version: null },
          kea_dhcp4: { installed: false, running: false, version: null },
          freeradius: { installed: false, running: false, version: null },
          accel_pppd: { installed: false, running: false, version: null },
        },
        gatewayAvailable: false,
      });
    }

    const data = await res.json();
    return NextResponse.json({ ...data, gatewayAvailable: true });
  } catch (error) {
    console.error("[Services Status API] error:", error);
    return NextResponse.json({
      services: {
        dnsmasq: { installed: false, running: false, version: null },
        kea_dhcp4: { installed: false, running: false, version: null },
        freeradius: { installed: false, running: false, version: null },
        accel_pppd: { installed: false, running: false, version: null },
      },
      gatewayAvailable: false,
    });
  }
}
