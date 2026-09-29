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
    console.error("[session-engine/nas-config] Proxy error:", error);
    return NextResponse.json(
      { error: "Session engine service unavailable" },
      { status: 503 }
    );
  }
}

// ─── GET: Read NAS config ─────────────────────────────────────
export async function GET(request: NextRequest) {
  return proxyRequest(request, "/api/nas/config");
}

// ─── PUT: Update NAS config ───────────────────────────────────
export async function PUT(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body is required" },
      { status: 400 }
    );
  }

  return proxyRequest(request, "/api/nas/config", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}
