import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { ndpiProxy } from "@/lib/ndpi-proxy";

// ─── GET: Full list of nDPI applications ──────────────────────
export async function GET(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (e) {
      if (e instanceof AuthError)
        return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }

    const result = await ndpiProxy("/api/apps", { timeoutMs: 10000 });

    if (result.daemonOffline) {
      return NextResponse.json({
        apps: [],
        total: 0,
        daemonOnline: false,
        error: "nDPI daemon offline",
      });
    }

    if (!result.ok) {
      return NextResponse.json(result.data, { status: result.status });
    }

    const data = result.data as Record<string, unknown>;
    const apps = Array.isArray(data?.apps) ? data.apps : [];

    return NextResponse.json({
      apps,
      total: apps.length,
      daemonOnline: true,
    });
  } catch (error) {
    console.error("[GET /api/ndpi/apps] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch nDPI applications" },
      { status: 500 }
    );
  }
}
