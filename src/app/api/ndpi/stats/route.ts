import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { ndpiProxy } from "@/lib/ndpi-proxy";

// ─── GET: Aggregated traffic statistics ───────────────────────
export async function GET(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (e) {
      if (e instanceof AuthError)
        return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }

    const result = await ndpiProxy("/api/stats", { timeoutMs: 10000 });

    if (result.daemonOffline) {
      return NextResponse.json({
        totalBytes: 0,
        totalPackets: 0,
        activeApps: 0,
        throughputBps: 0,
        topApps: [],
        hourlyData: [],
        bandwidth: { download: 0, upload: 0, total: 0 },
        daemonOnline: false,
        error: "nDPI daemon offline",
      });
    }

    if (!result.ok) {
      return NextResponse.json(result.data, { status: result.status });
    }

    const data = result.data as Record<string, unknown>;
    return NextResponse.json({
      ...data,
      daemonOnline: true,
    });
  } catch (error) {
    console.error("[GET /api/ndpi/stats] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch nDPI traffic statistics" },
      { status: 500 }
    );
  }
}
