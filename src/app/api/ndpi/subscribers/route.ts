import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { ndpiProxy } from "@/lib/ndpi-proxy";

// ─── GET: Per-subscriber application usage ────────────────────
export async function GET(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (e) {
      if (e instanceof AuthError)
        return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }

    const result = await ndpiProxy("/api/subscribers", { timeoutMs: 10000 });

    if (result.daemonOffline) {
      return NextResponse.json({
        subscribers: [],
        total: 0,
        daemonOnline: false,
        error: "nDPI daemon offline",
      });
    }

    if (!result.ok) {
      return NextResponse.json(result.data, { status: result.status });
    }

    const data = result.data as Record<string, unknown>;
    const subscribers = Array.isArray(data?.subscribers)
      ? data.subscribers
      : [];

    return NextResponse.json({
      subscribers,
      total: subscribers.length,
      daemonOnline: true,
    });
  } catch (error) {
    console.error("[GET /api/ndpi/subscribers] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch subscriber usage data" },
      { status: 500 }
    );
  }
}
