import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { ipsProxy } from "@/lib/ips-proxy";

// ─── POST: Unblock by IP ──────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    try { await requireAuth(request); } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }

    const body = await request.json();
    if (!body.ip) {
      return NextResponse.json({ error: "IP address is required" }, { status: 400 });
    }
    const result = await ipsProxy("/block-rules/unblock", { method: "POST", body });
    if (result.daemonOffline) return NextResponse.json(result.data, { status: 503 });
    if (!result.ok) return NextResponse.json(result.data, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("[IPS Unblock API] POST error:", error);
    return NextResponse.json({ error: "Failed to unblock IP" }, { status: 500 });
  }
}
