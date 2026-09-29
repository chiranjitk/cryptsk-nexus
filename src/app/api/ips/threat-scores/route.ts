import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { ipsProxy } from "@/lib/ips-proxy";

// ─── GET: Get all threat scores ────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    try { await requireAuth(request); } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }

    const result = await ipsProxy("/threat-scores");
    if (result.daemonOffline) return NextResponse.json(result.data, { status: 503 });
    if (!result.ok) return NextResponse.json(result.data, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("[IPS Threat Scores API] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch threat scores" }, { status: 500 });
  }
}

// ─── POST: Reset threat scores ─────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    try { await requireAuth(request); } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }

    const body = await request.json();
    const result = await ipsProxy("/threat-scores", { method: "POST", body });
    if (result.daemonOffline) return NextResponse.json(result.data, { status: 503 });
    if (!result.ok) return NextResponse.json(result.data, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("[IPS Threat Scores API] POST error:", error);
    return NextResponse.json({ error: "Failed to reset threat scores" }, { status: 500 });
  }
}
