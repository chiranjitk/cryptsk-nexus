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
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const cookie = request.headers.get("cookie");
  if (cookie) headers["cookie"] = cookie;
  return headers;
}

// ─── GET: Fetch firewall rules or nftables status from gateway-service ──
export async function GET(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (error) {
      if (error instanceof AuthError)
        return NextResponse.json(
          { error: error.message },
          { status: error.statusCode }
        );
    }

    const { searchParams } = new URL(request.url);
    const section = searchParams.get("section") || "rules";

    const gwPath =
      section === "nftables-status"
        ? "/api/firewall/nftables-status"
        : "/api/firewall/rules";

    return await gatewayFetch(`${GATEWAY_BASE}${gwPath}`, { headers: buildHeaders(request) });
  } catch (error) {
    console.error("[Firewall API] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch firewall data" },
      { status: 500 }
    );
  }
}

// ─── POST: Create rule, apply all rules (body.action) ──────────────
export async function POST(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (error) {
      if (error instanceof AuthError)
        return NextResponse.json(
          { error: error.message },
          { status: error.statusCode }
        );
    }

    const body = await request.json();
    const { action, ...payload } = body;

    let gwPath: string;

    switch (action) {
      case "create":
        gwPath = "/api/firewall/rules";
        break;
      case "apply":
        gwPath = "/api/firewall/apply";
        break;
      case "apply-all":
        gwPath = "/api/firewall/rules/apply-all";
        break;
      case "export":
        gwPath = "/api/firewall/export";
        break;
      case "quick-rule":
        gwPath = "/api/firewall/quick-rule";
        break;
      default:
        return NextResponse.json(
          { error: "Unknown firewall action" },
          { status: 400 }
        );
    }

    return await gatewayFetch(`${GATEWAY_BASE}${gwPath}`, {
      method: "POST",
      headers: buildHeaders(request),
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error("[Firewall API] POST error:", error);
    return NextResponse.json(
      { error: "Failed to process firewall request" },
      { status: 500 }
    );
  }
}

// ─── PUT: Update rule ─────────────────────────────────────────────
export async function PUT(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (error) {
      if (error instanceof AuthError)
        return NextResponse.json(
          { error: error.message },
          { status: error.statusCode }
        );
    }

    const body = await request.json();
    const { id, ...payload } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Rule ID is required" },
        { status: 400 }
      );
    }

    return await gatewayFetch(`${GATEWAY_BASE}/api/firewall/rules/${id}`, {
      method: "PUT",
      headers: buildHeaders(request),
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error("[Firewall API] PUT error:", error);
    return NextResponse.json(
      { error: "Failed to update firewall rule" },
      { status: 500 }
    );
  }
}

// ─── DELETE: Delete rule ──────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (error) {
      if (error instanceof AuthError)
        return NextResponse.json(
          { error: error.message },
          { status: error.statusCode }
        );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Rule ID is required" },
        { status: 400 }
      );
    }

    return await gatewayFetch(`${GATEWAY_BASE}/api/firewall/rules/${id}`, {
      method: "DELETE",
      headers: buildHeaders(request),
    });
  } catch (error) {
    console.error("[Firewall API] DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete firewall rule" },
      { status: 500 }
    );
  }
}
