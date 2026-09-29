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
    console.error("[session-engine/sessions/:id] Proxy error:", error);
    return NextResponse.json(
      { error: "Session engine service unavailable" },
      { status: 503 }
    );
  }
}

// ─── GET: Session detail ──────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return proxyRequest(request, `/api/sessions/${encodeURIComponent(id)}`);
}

// ─── POST: disconnect, coa, accounting ────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // No body
  }

  switch (action) {
    case "disconnect":
      return proxyRequest(request, `/api/sessions/${encodeURIComponent(id)}/disconnect`, {
        method: "POST",
        body: JSON.stringify(body),
      });

    case "coa":
      return proxyRequest(request, `/api/sessions/${encodeURIComponent(id)}/coa`, {
        method: "POST",
        body: JSON.stringify(body),
      });

    case "accounting":
      return proxyRequest(request, `/api/sessions/${encodeURIComponent(id)}/accounting`, {
        method: "POST",
        body: JSON.stringify(body),
      });

    default:
      return NextResponse.json(
        { error: `Unknown action: ${action}. Use: disconnect, coa, accounting` },
        { status: 400 }
      );
  }
}
