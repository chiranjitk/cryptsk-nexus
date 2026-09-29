import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

const GATEWAY = process.env.NAT_LOGS_URL || "http://localhost:3005";

// ─── Helpers ──────────────────────────────────────────────────────

function gatewayUrl(path: string, search = "") {
  return `${GATEWAY}${path}${search ? `?${search}` : ""}`;
}

// ─── GET: Proxy to gateway-service NAT log endpoints ──────────────
// ?section=logs|stats
// Filters: subscriberId, dateFrom, dateTo, dstDomain, dstPort, page, limit, days
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const sp = request.nextUrl.searchParams;
    const section = sp.get("section") || "logs";

    // Build query params to forward
    const fwdParams = new URLSearchParams();
    const fwdKeys = [
      "subscriberId", "dateFrom", "dateTo", "dstDomain", "dstPort",
      "page", "limit", "days", "startDate", "endDate",
    ];
    for (const key of fwdKeys) {
      const val = sp.get(key);
      if (val) fwdParams.set(key, val);
    }

    let targetPath: string;
    if (section === "stats") {
      targetPath = "/api/nat-logs/stats";
    } else {
      targetPath = "/api/nat-logs";
    }

    const url = gatewayUrl(targetPath, fwdParams.toString());
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const data = await res.json();

    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[NAT_LOGS_GET]", error);
    return NextResponse.json({ error: "Failed to fetch NAT logs" }, { status: 500 });
  }
}

// ─── DELETE: Cleanup old logs ─────────────────────────────────────
// body: { action: "cleanup", retentionDays?: number }
export async function DELETE(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json();
    const { action, retentionDays = 90 } = body;

    if (action !== "cleanup") {
      return NextResponse.json({ error: "Unknown action. Use action=cleanup" }, { status: 400 });
    }

    const url = gatewayUrl(`/api/nat-logs/cleanup`, `retentionDays=${retentionDays}`);
    const res = await fetch(url, { method: "DELETE", signal: AbortSignal.timeout(30000) });
    const data = await res.json();

    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[NAT_LOGS_DELETE]", error);
    return NextResponse.json({ error: "Failed to cleanup NAT logs" }, { status: 500 });
  }
}
