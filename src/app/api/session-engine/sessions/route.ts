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
    console.error("[session-engine/sessions] Proxy error:", error);
    return NextResponse.json(
      { error: "Session engine service unavailable" },
      { status: 503 }
    );
  }
}

// ─── GET: List sessions (with pagination, search, status filter) ─
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const qs = searchParams.toString();
  const queryString = qs ? `?${qs}` : "";

  return proxyRequest(request, `/api/sessions${queryString}`);
}

// ─── POST: Bulk disconnect ────────────────────────────────────
export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // No body
  }

  return proxyRequest(request, "/api/sessions/bulk-disconnect", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
