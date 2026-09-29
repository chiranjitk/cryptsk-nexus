import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { ipsProxy } from "@/lib/ips-proxy";

// ─── POST: Initialize nftables IPS table ──────────────────────
export async function POST(request: NextRequest) {
  try {
    try { await requireAuth(request); } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }

    const result = await ipsProxy("/nftables/init", { method: "POST" });
    if (result.daemonOffline) return NextResponse.json(result.data, { status: 503 });
    if (!result.ok) return NextResponse.json(result.data, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("[IPS nftables init API] POST error:", error);
    return NextResponse.json({ error: "Failed to initialize nftables" }, { status: 500 });
  }
}
