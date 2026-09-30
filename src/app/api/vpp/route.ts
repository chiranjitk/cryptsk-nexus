import { NextRequest, NextResponse } from "next/server";

const VPP_ADAPTER_URL = `http://127.0.0.1:3015`;
const SESSION_ENGINE_URL = `http://127.0.0.1:3010`;

// ─── Proxy helper ─────────────────────────────────────────────
async function proxyRequest(
  baseUrl: string,
  path: string,
  options?: RequestInit,
  request?: NextRequest
): Promise<Response> {
  const url = `${baseUrl}${path}`;
  try {
    const cookie = request?.headers.get("cookie") || "";
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
        ...(options?.headers || {}),
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      let errorData: any = { error: "VPP adapter error" };
      try {
        errorData = JSON.parse(text);
      } catch {
        errorData = { error: text || "VPP adapter request failed" };
      }
      return NextResponse.json(
        { error: errorData.error || "VPP adapter request failed", details: errorData },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[vpp-proxy] Proxy error:", error);
    return NextResponse.json(
      { error: "VPP adapter service unavailable", details: String(error) },
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

// ─── GET actions ─────────────────────────────────────────────
// vpp-adapter endpoints: /health, /vpp/state, /vpp/epoch, /policy/objects,
// /policy/acl-profiles, /policy/nat-pools, /interfaces, /status, /config/generate
// session-engine endpoints (proxied via /api/vpp): /api/vpp/state, /api/recovery-logs,
// /api/reconciliation-logs, /api/snapshots, /api/dpi/classifications, /api/nat-events,
// /api/duplicate-login-policy
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  const extraQs = buildQueryString(searchParams, ["action"]);

  switch (action) {
    // ─── VPP Adapter (port 3015) ───────────────────────────
    case "health":
      return proxyRequest(VPP_ADAPTER_URL, `/health${extraQs}`);

    case "state":
    case "vpp-state":
      return proxyRequest(VPP_ADAPTER_URL, `/vpp/state${extraQs}`);

    case "epoch":
    case "vpp-epoch":
      return proxyRequest(VPP_ADAPTER_URL, `/vpp/epoch${extraQs}`);

    case "status":
      return proxyRequest(VPP_ADAPTER_URL, `/status${extraQs}`);

    case "interfaces":
      return proxyRequest(VPP_ADAPTER_URL, `/interfaces${extraQs}`);

    case "config-generate":
      return proxyRequest(VPP_ADAPTER_URL, `/config/generate${extraQs}`);

    case "policy-objects":
      return proxyRequest(VPP_ADAPTER_URL, `/policy/objects${extraQs}`);

    case "acl-profiles":
      return proxyRequest(VPP_ADAPTER_URL, `/policy/acl-profiles${extraQs}`);

    case "nat-pools":
      return proxyRequest(VPP_ADAPTER_URL, `/policy/nat-pools${extraQs}`);

    case "subscriber-state": {
      const sessionId = searchParams.get("sessionId");
      if (!sessionId) {
        return NextResponse.json(
          { error: "sessionId is required for subscriber-state" },
          { status: 400 }
        );
      }
      return proxyRequest(VPP_ADAPTER_URL, `/subscriber/${encodeURIComponent(sessionId)}/state${extraQs}`);
    }

    case "config-subscriber": {
      const id = searchParams.get("id");
      if (!id) {
        return NextResponse.json(
          { error: "id is required for config-subscriber" },
          { status: 400 }
        );
      }
      return proxyRequest(VPP_ADAPTER_URL, `/config/subscriber/${encodeURIComponent(id)}`);
    }

    // ─── Session Engine (port 3010) — recovery & snapshot data ─
    case "recovery-logs":
      return proxyRequest(SESSION_ENGINE_URL, `/api/recovery-logs${extraQs}`, undefined, request);

    case "reconciliation-logs":
      return proxyRequest(SESSION_ENGINE_URL, `/api/reconciliation-logs${extraQs}`, undefined, request);

    case "snapshots":
      return proxyRequest(SESSION_ENGINE_URL, `/api/snapshots${extraQs}`, undefined, request);

    case "snapshot": {
      const sessionId = searchParams.get("sessionId");
      if (!sessionId) {
        return NextResponse.json(
          { error: "sessionId is required for snapshot" },
          { status: 400 }
        );
      }
      return proxyRequest(SESSION_ENGINE_URL, `/api/snapshots/${encodeURIComponent(sessionId)}`, undefined, request);
    }

    case "dpi-classifications":
      return proxyRequest(SESSION_ENGINE_URL, `/api/dpi/classifications${extraQs}`, undefined, request);

    case "nat-events":
      return proxyRequest(SESSION_ENGINE_URL, `/api/nat-events${extraQs}`, undefined, request);

    case "duplicate-login-policy":
      return proxyRequest(SESSION_ENGINE_URL, `/api/duplicate-login-policy${extraQs}`, undefined, request);

    case "session-vpp-state":
      return proxyRequest(SESSION_ENGINE_URL, `/api/vpp/state${extraQs}`, undefined, request);

    case "events-feed":
      return proxyRequest(SESSION_ENGINE_URL, `/api/events${extraQs}`, undefined, request);

    default:
      return NextResponse.json(
        {
          error: `Unknown action: ${action}. Use: health, state, epoch, status, interfaces, config-generate, policy-objects, acl-profiles, nat-pools, subscriber-state, config-subscriber, recovery-logs, reconciliation-logs, snapshots, snapshot, dpi-classifications, nat-events, duplicate-login-policy, session-vpp-state, events-feed`,
        },
        { status: 400 }
      );
  }
}

// ─── POST actions ────────────────────────────────────────────
// vpp-adapter: /vpp/simulate-restart, /vpp/rebuild, /policy/objects (POST/PUT/DELETE),
// /subscriber/program, /subscriber/verify, /subscriber/remove, /apply, /coa, /reconcile
// session-engine: /api/vpp/restart-recovery, /api/sessions/:id/vpp-rebuild,
// /api/duplicate-login-policy (POST/PUT), /api/auth, /api/logout
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // No body or invalid JSON — okay for some actions
  }

  const bodyStr = JSON.stringify(body);
  const extraQs = buildQueryString(searchParams, ["action"]);

  switch (action) {
    // ─── VPP Adapter (port 3015) ───────────────────────────
    case "simulate-restart":
      return proxyRequest(VPP_ADAPTER_URL, `/vpp/simulate-restart`, {
        method: "POST",
        body: bodyStr,
      });

    case "rebuild":
      return proxyRequest(VPP_ADAPTER_URL, `/vpp/rebuild`, {
        method: "POST",
        body: bodyStr,
      });

    case "rebuild-session": {
      const sessionId = searchParams.get("sessionId");
      if (!sessionId) {
        return NextResponse.json(
          { error: "sessionId is required for rebuild-session" },
          { status: 400 }
        );
      }
      // Try session-engine first (snapshot-based), fallback to vpp-adapter
      return proxyRequest(
        SESSION_ENGINE_URL,
        `/api/sessions/${encodeURIComponent(sessionId)}/vpp-rebuild`,
        { method: "POST", body: bodyStr },
        request
      );
    }

    case "reconcile":
      return proxyRequest(VPP_ADAPTER_URL, `/reconcile`, {
        method: "POST",
        body: bodyStr,
      });

    case "apply":
      return proxyRequest(VPP_ADAPTER_URL, `/apply`, {
        method: "POST",
        body: bodyStr,
      });

    case "coa":
      return proxyRequest(VPP_ADAPTER_URL, `/coa`, {
        method: "POST",
        body: bodyStr,
      });

    case "policy-objects-create":
      return proxyRequest(VPP_ADAPTER_URL, `/policy/objects`, {
        method: "POST",
        body: bodyStr,
      });

    case "acl-profiles-create":
      return proxyRequest(VPP_ADAPTER_URL, `/policy/acl-profiles`, {
        method: "POST",
        body: bodyStr,
      });

    case "nat-pools-create":
      return proxyRequest(VPP_ADAPTER_URL, `/policy/nat-pools`, {
        method: "POST",
        body: bodyStr,
      });

    case "subscriber-program":
      return proxyRequest(VPP_ADAPTER_URL, `/subscriber/program`, {
        method: "POST",
        body: bodyStr,
      });

    case "subscriber-verify":
      return proxyRequest(VPP_ADAPTER_URL, `/subscriber/verify`, {
        method: "POST",
        body: bodyStr,
      });

    case "subscriber-remove":
      return proxyRequest(VPP_ADAPTER_URL, `/subscriber/remove`, {
        method: "POST",
        body: bodyStr,
      });

    // ─── Session Engine (port 3010) — recovery & duplicate login ─
    case "restart-recovery":
      return proxyRequest(SESSION_ENGINE_URL, `/api/vpp/restart-recovery`, {
        method: "POST",
        body: bodyStr,
      }, request);

    case "reconcile-sessions":
      return proxyRequest(SESSION_ENGINE_URL, `/api/reconciliation/run`, {
        method: "POST",
        body: bodyStr,
      }, request);

    case "dpi-seed-synthetic":
      return proxyRequest(SESSION_ENGINE_URL, `/api/dpi/seed-synthetic${extraQs}`, {
        method: "POST",
        body: bodyStr,
      }, request);

    case "duplicate-login-policy-create":
      return proxyRequest(SESSION_ENGINE_URL, `/api/duplicate-login-policy`, {
        method: "POST",
        body: bodyStr,
      }, request);

    default:
      return NextResponse.json(
        {
          error: `Unknown action: ${action}. Use: simulate-restart, rebuild, rebuild-session, reconcile, apply, coa, policy-objects-create, acl-profiles-create, nat-pools-create, subscriber-program, subscriber-verify, subscriber-remove, restart-recovery, reconcile-sessions, dpi-seed-synthetic, duplicate-login-policy-create`,
        },
        { status: 400 }
      );
  }
}

// ─── PUT actions (for updates) ────────────────────────────────
export async function PUT(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // ignore
  }
  const bodyStr = JSON.stringify(body);

  switch (action) {
    case "policy-objects-update": {
      const id = searchParams.get("id");
      if (!id) {
        return NextResponse.json({ error: "id is required for policy-objects-update" }, { status: 400 });
      }
      return proxyRequest(VPP_ADAPTER_URL, `/policy/objects/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: bodyStr,
      });
    }

    case "acl-profiles-update": {
      const id = searchParams.get("id");
      if (!id) {
        return NextResponse.json({ error: "id is required for acl-profiles-update" }, { status: 400 });
      }
      return proxyRequest(VPP_ADAPTER_URL, `/policy/acl-profiles/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: bodyStr,
      });
    }

    case "nat-pools-update": {
      const id = searchParams.get("id");
      if (!id) {
        return NextResponse.json({ error: "id is required for nat-pools-update" }, { status: 400 });
      }
      return proxyRequest(VPP_ADAPTER_URL, `/policy/nat-pools/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: bodyStr,
      });
    }

    case "duplicate-login-policy-update": {
      const id = searchParams.get("id");
      if (!id) {
        return NextResponse.json({ error: "id is required for duplicate-login-policy-update" }, { status: 400 });
      }
      return proxyRequest(SESSION_ENGINE_URL, `/api/duplicate-login-policy/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: bodyStr,
      }, request);
    }

    default:
      return NextResponse.json(
        { error: `Unknown PUT action: ${action}. Use: policy-objects-update, acl-profiles-update, nat-pools-update, duplicate-login-policy-update` },
        { status: 400 }
      );
  }
}

// ─── DELETE actions ───────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  switch (action) {
    case "policy-objects-delete": {
      const id = searchParams.get("id");
      if (!id) {
        return NextResponse.json({ error: "id is required for policy-objects-delete" }, { status: 400 });
      }
      return proxyRequest(VPP_ADAPTER_URL, `/policy/objects/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    }

    case "acl-profiles-delete": {
      const id = searchParams.get("id");
      if (!id) {
        return NextResponse.json({ error: "id is required for acl-profiles-delete" }, { status: 400 });
      }
      return proxyRequest(VPP_ADAPTER_URL, `/policy/acl-profiles/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    }

    case "nat-pools-delete": {
      const id = searchParams.get("id");
      if (!id) {
        return NextResponse.json({ error: "id is required for nat-pools-delete" }, { status: 400 });
      }
      return proxyRequest(VPP_ADAPTER_URL, `/policy/nat-pools/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    }

    case "duplicate-login-policy-delete": {
      const id = searchParams.get("id");
      if (!id) {
        return NextResponse.json({ error: "id is required for duplicate-login-policy-delete" }, { status: 400 });
      }
      return proxyRequest(SESSION_ENGINE_URL, `/api/duplicate-login-policy/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }, request);
    }

    default:
      return NextResponse.json(
        { error: `Unknown DELETE action: ${action}. Use: policy-objects-delete, acl-profiles-delete, nat-pools-delete, duplicate-login-policy-delete` },
        { status: 400 }
      );
  }
}
