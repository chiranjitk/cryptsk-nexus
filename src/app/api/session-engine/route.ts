import { NextRequest, NextResponse } from "next/server";

const SESSION_ENGINE_URL = `http://127.0.0.1:3010`;

// ─── Proxy helper ─────────────────────────────────────────────
async function proxyRequest(
  req: NextRequest,
  path: string,
  options?: RequestInit
): Promise<Response> {
  const url = `${SESSION_ENGINE_URL}${path}`;
  const cookie = req.headers.get("cookie") || "";
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
        ...(options?.headers || {}),
      },
    });

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ error: "Session engine error" }));
      return NextResponse.json(
        { error: errorData.error || "Session engine request failed" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[session-engine] Proxy error:", error);
    return NextResponse.json(
      { error: "Session engine service unavailable" },
      { status: 503 }
    );
  }
}

// ─── Build query string from URLSearchParams ───────────────────
function buildQueryString(params: URLSearchParams, excludeKeys: string[] = []): string {
  const filtered = new URLSearchParams();
  params.forEach((value, key) => {
    if (!excludeKeys.includes(key)) {
      filtered.append(key, value);
    }
  });
  const qs = filtered.toString();
  return qs ? `?${qs}` : "";
}

// ─── GET: stats, events, nas-config ───────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  const extraQs = buildQueryString(searchParams, ["action"]);

  switch (action) {
    case "stats":
      return proxyRequest(request, `/api/stats/overview${extraQs}`);

    case "bandwidth":
      return proxyRequest(request, `/api/stats/bandwidth${extraQs}`);

    case "events":
      return proxyRequest(request, `/api/events${extraQs}`);

    case "nas-config":
      return proxyRequest(request, `/api/nas/config${extraQs}`);

    case "health":
      return proxyRequest(request, `/api/health${extraQs}`);

    default:
      return NextResponse.json(
        { error: `Unknown action: ${action}. Use: stats, bandwidth, events, nas-config, health` },
        { status: 400 }
      );
  }
}

// ─── POST: auth, logout, policy-enforce ───────────────────────
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // No body or invalid JSON — that's okay for some actions
  }

  switch (action) {
    case "auth":
      return proxyRequest(request, "/api/auth", {
        method: "POST",
        body: JSON.stringify(body),
      });

    case "logout":
      return proxyRequest(request, "/api/logout", {
        method: "POST",
        body: JSON.stringify(body),
      });

    case "policy-enforce":
      return proxyRequest(request, "/api/policy/enforce", {
        method: "POST",
        body: JSON.stringify(body),
      });

    default:
      return NextResponse.json(
        { error: `Unknown action: ${action}. Use: auth, logout, policy-enforce` },
        { status: 400 }
      );
  }
}
