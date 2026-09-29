import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { ndpiProxy, ndpiProxyDirect } from "@/lib/ndpi-proxy";

// ─── GET: Combined daemon status + quick stats ────────────────
export async function GET(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (e) {
      if (e instanceof AuthError)
        return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }

    // Hit daemon health endpoint to check online status
    const healthResult = await ndpiProxy("/health", { timeoutMs: 5000 });

    if (healthResult.daemonOffline) {
      return NextResponse.json({
        daemon: { status: "offline", version: null, uptime: 0, protocols: 0 },
        stats: {
          totalBytes: 0,
          activeApps: 0,
          topApps: [],
          totalPackets: 0,
          throughputBps: 0,
        },
        daemonOnline: false,
        error: "nDPI daemon offline",
      });
    }

    const healthData = healthResult.data as Record<string, unknown>;

    // Fetch quick stats in parallel
    const [statsResult, appsResult] = await Promise.allSettled([
      ndpiProxyDirect("/api/stats", { timeoutMs: 5000 }),
      ndpiProxyDirect("/api/apps", { timeoutMs: 5000 }),
    ]);

    const statsOk = statsResult.status === "fulfilled" && statsResult.value.ok;
    const statsData = statsOk
      ? (statsResult.value.data as Record<string, unknown>)
      : {};

    const appsOk = appsResult.status === "fulfilled" && appsResult.value.ok;
    const appsData = appsOk
      ? (appsResult.value.data as Record<string, unknown>)
      : {};
    const appsList = Array.isArray(appsData?.apps) ? appsData.apps : [];

    return NextResponse.json({
      daemon: {
        status: "online",
        version: (healthData.version as string) || null,
        uptime: (healthData.uptime as number) || 0,
        protocols: (healthData.protocols as number) || appsList.length,
      },
      stats: {
        totalBytes: (statsData.totalBytes as number) || 0,
        totalPackets: (statsData.totalPackets as number) || 0,
        activeApps: (statsData.activeApps as number) || 0,
        throughputBps: (statsData.throughputBps as number) || 0,
        topApps: Array.isArray(statsData.topApps) ? statsData.topApps : [],
      },
      daemonOnline: true,
    });
  } catch (error) {
    console.error("[GET /api/ndpi] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch nDPI status" },
      { status: 500 }
    );
  }
}
