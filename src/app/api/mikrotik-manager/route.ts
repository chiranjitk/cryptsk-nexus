import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

const MIKROTIK_SERVICE_URL = process.env.MIKROTIK_SERVICE_URL || "http://127.0.0.1:3021";

async function proxyToMikrotikService(body: Record<string, unknown>): Promise<NextResponse> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const res = await fetch(MIKROTIK_SERVICE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({ error: "MikroTik request timed out" }, { status: 504 });
    }
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `MikroTik service unavailable: ${msg}` },
      { status: 503 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (error) {
      if (error instanceof AuthError)
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    const body = await request.json();
    return proxyToMikrotikService(body);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
