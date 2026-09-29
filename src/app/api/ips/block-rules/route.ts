import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { ipsProxy } from "@/lib/ips-proxy";

// ─── GET: List block rules ────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    try { await requireAuth(request); } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }

    const result = await ipsProxy("/block-rules");
    if (result.daemonOffline) return NextResponse.json(result.data, { status: 503 });
    if (!result.ok) return NextResponse.json(result.data, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("[IPS Block Rules API] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch block rules" }, { status: 500 });
  }
}

// ─── POST: Manual block ────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    try { await requireAuth(request); } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }

    const body = await request.json();
    const result = await ipsProxy("/block-rules", { method: "POST", body });
    if (result.daemonOffline) return NextResponse.json(result.data, { status: 503 });
    if (!result.ok) return NextResponse.json(result.data, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("[IPS Block Rules API] POST error:", error);
    return NextResponse.json({ error: "Failed to create block rule" }, { status: 500 });
  }
}
