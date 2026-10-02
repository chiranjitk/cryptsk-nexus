import { NextRequest, NextResponse } from "next/server";

const NAT_LOGGER_URL = `http://127.0.0.1:3016`;

// ─── Proxy helper ─────────────────────────────────────────────
async function proxyRequest(
  path: string,
  options?: RequestInit
): Promise<Response> {
  const url = `${NAT_LOGGER_URL}${path}`;
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers || {}),
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      let errorData: any = { error: "NAT logger error" };
      try {
        errorData = JSON.parse(text);
      } catch {
        errorData = { error: text || "NAT logger request failed" };
      }
      return NextResponse.json(
        { error: errorData.error || "NAT logger request failed", details: errorData },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[nat-logger-proxy] Proxy error:", error);
    return NextResponse.json(
      { error: "NAT logger service unavailable", details: String(error) },
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

// ─── GET actions: health, events-recent, stats, buffer ────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  const extraQs = buildQueryString(searchParams, ["action"]);

  switch (action) {
    case "health":
      return proxyRequest(`/health${extraQs}`);

    case "events-recent":
      return proxyRequest(`/events/recent${extraQs}`);

    case "stats":
      return proxyRequest(`/stats${extraQs}`);

    case "buffer":
      return proxyRequest(`/buffer${extraQs}`);

    default:
      return NextResponse.json(
        {
          error: `Unknown action: ${action}. Use: health, events-recent, stats, buffer`,
        },
        { status: 400 }
      );
  }
}

// ─── POST actions: flush ───────────────────────────────────────
export async function POST(request: NextRequest) {
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
    case "flush":
      return proxyRequest(`/flush`, {
        method: "POST",
        body: bodyStr,
      });

    case "events":
      // Ingest a single NAT event (used by adapter)
      return proxyRequest(`/events`, {
        method: "POST",
        body: bodyStr,
      });

    case "events-batch":
      // Ingest a batch of NAT events
      return proxyRequest(`/events/batch`, {
        method: "POST",
        body: bodyStr,
      });

    default:
      return NextResponse.json(
        {
          error: `Unknown action: ${action}. Use: flush, events, events-batch`,
        },
        { status: 400 }
      );
  }
}
