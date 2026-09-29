import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

const GATEWAY_BASE = process.env.GATEWAY_URL || "http://localhost:3005";

// ─── Helper: fetch with gateway-unavailable handling ────────────
async function gatewayFetch(url: string, init?: RequestInit) {
  try {
    const res = await fetch(url, init);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[Gateway] Responded with ${res.status}: ${text}`);
      return NextResponse.json(
        { error: `Gateway service error: ${res.status}`, detail: text },
        { status: res.status }
      );
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof TypeError || (error instanceof Error && (error.message.includes("ECONNREFUSED") || error.message.includes("fetch failed")))) {
      return NextResponse.json(
        { error: "Gateway service is not available. Please ensure the gateway service is running.", gatewayUnavailable: true },
        { status: 503 }
      );
    }
    throw error;
  }
}

// ─── Helper: build headers with auth cookie ─────────────────────
function buildHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  const cookie = request.headers.get("cookie");
  if (cookie) headers["cookie"] = cookie;
  return headers;
}

// ─── Build gateway URL from section and action params ───────────
function buildGatewayUrl(section: string, action?: string, id?: string): string {
  if (action === "kea-status") return `${GATEWAY_BASE}/api/dhcp/kea/status`;
  if (action === "kea-reload") return `${GATEWAY_BASE}/api/dhcp/kea/reload`;
  if (action === "kea-config") return `${GATEWAY_BASE}/api/dhcp/kea/config`;

  const basePath = `/api/dhcp/${section}`;
  if (id) return `${GATEWAY_BASE}${basePath}/${id}`;
  return `${GATEWAY_BASE}${basePath}`;
}

// ─── GET: Fetch DHCP data from gateway-service ──────────────────
export async function GET(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (error) {
      if (error instanceof AuthError)
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    const { searchParams } = new URL(request.url);
    const section = searchParams.get("section") || "subnets";
    const action = searchParams.get("action") || undefined;
    const id = searchParams.get("id") || undefined;

    let gatewayUrl = buildGatewayUrl(section, action, id);

    // Forward all remaining query params
    const forwardParams = new URLSearchParams();
    for (const [key, value] of searchParams.entries()) {
      if (!["section", "action", "id"].includes(key)) {
        forwardParams.set(key, value);
      }
    }
    const qs = forwardParams.toString();
    if (qs) gatewayUrl += `?${qs}`;

    return await gatewayFetch(gatewayUrl, { headers: buildHeaders(request), cache: "no-store" });
  } catch (error) {
    console.error("[DHCP API] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch DHCP data" }, { status: 500 });
  }
}

// ─── POST: Create subnet/reservation or reload KEA ──────────────
export async function POST(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (error) {
      if (error instanceof AuthError)
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    const body = await request.json();
    const { action, section, ...payload } = body;

    let gatewayUrl: string;
    if (action === "kea-reload") {
      gatewayUrl = `${GATEWAY_BASE}/api/dhcp/kea/reload`;
    } else if (action === "kea-test") {
      gatewayUrl = `${GATEWAY_BASE}/api/dhcp/kea/test`;
    } else {
      const s = section || "subnets";
      gatewayUrl = `${GATEWAY_BASE}/api/dhcp/${s}`;
    }

    return await gatewayFetch(gatewayUrl, {
      method: "POST",
      headers: buildHeaders(request),
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error("[DHCP API] POST error:", error);
    return NextResponse.json({ error: "Failed to process DHCP request" }, { status: 500 });
  }
}

// ─── PUT: Update subnet or reservation ─────────────────────────
export async function PUT(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (error) {
      if (error instanceof AuthError)
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    const body = await request.json();
    const { section = "subnets", id, ...payload } = body;

    if (!id) {
      return NextResponse.json({ error: "ID is required for update" }, { status: 400 });
    }

    return await gatewayFetch(`${GATEWAY_BASE}/api/dhcp/${section}/${id}`, {
      method: "PUT",
      headers: buildHeaders(request),
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error("[DHCP API] PUT error:", error);
    return NextResponse.json({ error: "Failed to update DHCP configuration" }, { status: 500 });
  }
}

// ─── DELETE: Delete subnet or reservation ──────────────────────
export async function DELETE(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (error) {
      if (error instanceof AuthError)
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    const { searchParams } = new URL(request.url);
    const section = searchParams.get("section") || "subnets";
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID is required for delete" }, { status: 400 });
    }

    return await gatewayFetch(`${GATEWAY_BASE}/api/dhcp/${section}/${id}`, {
      method: "DELETE",
      headers: buildHeaders(request),
    });
  } catch (error) {
    console.error("[DHCP API] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete DHCP configuration" }, { status: 500 });
  }
}
