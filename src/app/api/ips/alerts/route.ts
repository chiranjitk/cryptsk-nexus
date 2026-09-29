import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { ipsProxy } from "@/lib/ips-proxy";

// ─── GET: Fetch alerts with query params ──────────────────────
export async function GET(request: NextRequest) {
  try {
    try { await requireAuth(request); } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }

    const { searchParams } = new URL(request.url);
    const limit = searchParams.get("limit") || "50";
    const offset = searchParams.get("offset") || "0";
    const severity = searchParams.get("severity") || "";
    const status = searchParams.get("status") || "";
    const type = searchParams.get("type") || "";

    const params = new URLSearchParams();
    if (limit) params.set("limit", limit);
    if (offset) params.set("offset", offset);
    if (severity) params.set("severity", severity);
    if (status) params.set("status", status);
    if (type) params.set("type", type);

    const qs = params.toString();
    const result = await ipsProxy(`/alerts${qs ? `?${qs}` : ""}`);
    if (result.daemonOffline) return NextResponse.json(result.data, { status: 503 });
    if (!result.ok) return NextResponse.json(result.data, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("[IPS Alerts API] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch alerts" }, { status: 500 });
  }
}

// ─── DELETE: Cleanup old alerts ────────────────────────────────
export async function DELETE(request: NextRequest) {
  try {
    try { await requireAuth(request); } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }

    const { searchParams } = new URL(request.url);
    const olderThan = searchParams.get("olderThan") || "";
    const status = searchParams.get("status") || "";

    const params = new URLSearchParams();
    if (olderThan) params.set("olderThan", olderThan);
    if (status) params.set("status", status);

    const qs = params.toString();
    const result = await ipsProxy(`/alerts${qs ? `?${qs}` : ""}`, { method: "DELETE" });
    if (result.daemonOffline) return NextResponse.json(result.data, { status: 503 });
    if (!result.ok) return NextResponse.json(result.data, { status: result.status });
    return NextResponse.json(result.data);
  } catch (error) {
    console.error("[IPS Alerts API] DELETE error:", error);
    return NextResponse.json({ error: "Failed to cleanup alerts" }, { status: 500 });
  }
}
