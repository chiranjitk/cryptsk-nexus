import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { ipsProxy } from "@/lib/ips-proxy";

// ─── GET: Fetch IPS daemon status ──────────────────────────────
export async function GET(request: NextRequest) {
  try {
    try { await requireAuth(request); } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }

    const result = await ipsProxy("/status");
    if (result.daemonOffline) {
      return NextResponse.json(result.data, { status: 503 });
    }
    if (!result.ok) {
      return NextResponse.json(result.data, { status: result.status });
    }
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("[IPS API] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch IPS status" }, { status: 500 });
  }
}
