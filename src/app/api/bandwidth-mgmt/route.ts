import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import type { NextRequest } from "next/server";

const GATEWAY_BASE = process.env.GATEWAY_URL || "http://localhost:3005";

// ─── Helper: Forward request to gateway-service ─────────────────
async function forwardToGateway(
  request: NextRequest,
  method: string,
  gatewayPath: string,
  body?: unknown
) {
  const url = new URL(gatewayPath, GATEWAY_BASE);

  // Forward all relevant headers
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const cookie = request.headers.get("cookie");
  if (cookie) headers["cookie"] = cookie;

  const init: RequestInit & { headers: Record<string, string> } = {
    method,
    headers,
    signal: AbortSignal.timeout(15_000),
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(url.toString(), init);
    const data = await res.json().catch(() => null);
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    // Gateway service unreachable — return 503 instead of propagating 500
    if (error instanceof TypeError || (error instanceof Error && error.message.includes("ECONNREFUSED"))) {
      return NextResponse.json(
        { error: "Gateway service is not available. Please ensure the gateway service is running.", gatewayUnavailable: true },
        { status: 503 }
      );
    }
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════
//  GET /api/bandwidth-mgmt
//  ?section=policies | status
// ═══════════════════════════════════════════════════════════════════
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const section = searchParams.get("section") || "policies";

    let gatewayPath: string;
    switch (section) {
      case "status":
        gatewayPath = "/api/tc/status";
        break;
      case "policies":
      default:
        gatewayPath = "/api/tc/policies";
        break;
    }

    // Forward query params (e.g., subscriberId for remove-user check)
    const extraParams = new URLSearchParams();
    for (const [key, value] of searchParams.entries()) {
      if (key !== "section" && key !== "XTransformPort") {
        extraParams.set(key, value);
      }
    }
    const queryString = extraParams.toString();
    const fullPath = queryString ? `${gatewayPath}?${queryString}` : gatewayPath;

    return await forwardToGateway(request, "GET", fullPath);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Bandwidth Mgmt GET error:", error);
    return NextResponse.json({ error: "Failed to fetch bandwidth management data" }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════
//  POST /api/bandwidth-mgmt
//  body.action: create-policy | apply-user | remove-user | init
// ═══════════════════════════════════════════════════════════════════
export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json();
    const { action } = body;

    let gatewayPath: string;
    let forwardBody: unknown;

    switch (action) {
      case "create-policy":
        gatewayPath = "/api/tc/policies";
        forwardBody = body;
        break;
      case "apply-user":
        gatewayPath = "/api/tc/apply-user";
        forwardBody = body;
        break;
      case "init":
        gatewayPath = "/api/tc/init";
        forwardBody = {};
        break;
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    return await forwardToGateway(request, "POST", gatewayPath, forwardBody);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Bandwidth Mgmt POST error:", error);
    return NextResponse.json({ error: "Failed to process bandwidth management request" }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════
//  PUT /api/bandwidth-mgmt
//  body.id required, forwards to gateway PUT /api/tc/policies/:id
// ═══════════════════════════════════════════════════════════════════
export async function PUT(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json({ error: "Policy ID is required" }, { status: 400 });
    }

    return await forwardToGateway(request, "PUT", `/api/tc/policies/${id}`, updateData);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Bandwidth Mgmt PUT error:", error);
    return NextResponse.json({ error: "Failed to update policy" }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════
//  DELETE /api/bandwidth-mgmt
//  ?id=... or ?subscriberId=...&ip=...
// ═══════════════════════════════════════════════════════════════════
export async function DELETE(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const subscriberId = searchParams.get("subscriberId");
    const ip = searchParams.get("ip");

    if (id) {
      // Delete a policy
      return await forwardToGateway(request, "DELETE", `/api/tc/policies/${id}`);
    }

    if (subscriberId || ip) {
      // Remove a user filter
      const params = new URLSearchParams();
      if (subscriberId) params.set("subscriberId", subscriberId);
      if (ip) params.set("ip", ip);
      return await forwardToGateway(request, "DELETE", `/api/tc/remove-user?${params.toString()}`);
    }

    return NextResponse.json(
      { error: "Either 'id', 'subscriberId', or 'ip' query parameter is required" },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Bandwidth Mgmt DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
