import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

const GATEWAY_BASE = process.env.GATEWAY_URL || "http://localhost:3005";

// ─── Allowed sub-paths (whitelist for security) ─────────────────
const ALLOWED_SLUGS = new Set([
  "status",
  "config",
  "subnets",
  "subscribers",
  "init",
  "teardown",
  "restore",
  "subnet/add",
  "subnet/del",
  "subnet/rate",
  "subscriber/add",
  "subscriber/del",
  "subscriber/rate",
]);

// ─── Helper: Forward request to gateway-service ─────────────────
async function forwardToGateway(
  request: NextRequest,
  method: string,
  gatewayPath: string,
  body?: unknown
) {
  // Forward all relevant headers
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const cookie = request.headers.get("cookie");
  if (cookie) headers["cookie"] = cookie;

  const init: RequestInit = {
    method,
    headers,
    signal: AbortSignal.timeout(30_000),
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const res = await fetch(`${GATEWAY_BASE}${gatewayPath}`, init);
  const data = await res.json().catch(() => null);

  return NextResponse.json(data, { status: res.status });
}

// ─── Helper: Auth guard ─────────────────────────────────────────
function authGuard(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════
//  GET /api/qos/[...slug]
//  Handles: status, config, subnets, subscribers
// ═══════════════════════════════════════════════════════════════════
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  try {
    try { await requireAuth(request); } catch (err) {
      const authErr = authGuard(err);
      if (authErr) return authErr;
    }

    const { slug } = await params;
    const action = slug.join("/");

    if (!ALLOWED_SLUGS.has(action)) {
      return NextResponse.json({ error: `Unknown QoS action: ${action}` }, { status: 400 });
    }

    // Forward query params, stripping internal gateway params
    const { searchParams } = new URL(request.url);
    const forwardParams = new URLSearchParams();
    for (const [key, value] of searchParams.entries()) {
      if (!["XTransformPort"].includes(key)) {
        forwardParams.set(key, value);
      }
    }
    const queryString = forwardParams.toString();
    const gatewayPath = `/api/qos/${action}${queryString ? `?${queryString}` : ""}`;

    return await forwardToGateway(request, "GET", gatewayPath);
  } catch (error) {
    console.error("[QoS API] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch QoS data" }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════
//  POST /api/qos/[...slug]
//  Handles: init, teardown, restore, subnet/add, subnet/del,
//           subnet/rate, subscriber/add, subscriber/del, subscriber/rate
// ═══════════════════════════════════════════════════════════════════
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  try {
    try { await requireAuth(request); } catch (err) {
      const authErr = authGuard(err);
      if (authErr) return authErr;
    }

    const { slug } = await params;
    const action = slug.join("/");

    if (!ALLOWED_SLUGS.has(action)) {
      return NextResponse.json({ error: `Unknown QoS action: ${action}` }, { status: 400 });
    }

    // Parse body (may be empty for init/teardown/restore)
    let body: unknown = undefined;
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      body = await request.json().catch(() => undefined);
    }

    const gatewayPath = `/api/qos/${action}`;
    return await forwardToGateway(request, "POST", gatewayPath, body);
  } catch (error) {
    console.error("[QoS API] POST error:", error);
    return NextResponse.json({ error: "Failed to process QoS request" }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════
//  PUT /api/qos/[...slug]
//  Handles: config (save QoS configuration)
// ═══════════════════════════════════════════════════════════════════
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  try {
    try { await requireAuth(request); } catch (err) {
      const authErr = authGuard(err);
      if (authErr) return authErr;
    }

    const { slug } = await params;
    const action = slug.join("/");

    if (!ALLOWED_SLUGS.has(action)) {
      return NextResponse.json({ error: `Unknown QoS action: ${action}` }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const gatewayPath = `/api/qos/${action}`;

    return await forwardToGateway(request, "PUT", gatewayPath, body);
  } catch (error) {
    console.error("[QoS API] PUT error:", error);
    return NextResponse.json({ error: "Failed to update QoS configuration" }, { status: 500 });
  }
}
