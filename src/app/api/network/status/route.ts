import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ── Response Types ──────────────────────────────────────────────────

interface NetworkStatusResponse {
  devices: {
    total: number;
    online: number;
    offline: number;
    warning: number;
  };
  subscribers: {
    total: number;
    active: number;
  };
  complaints: {
    open: number;
    byPriority: {
      P1: number;
      P2: number;
      P3: number;
      P4: number;
    };
  };
  networkUptime: number;
  timestamp: string;
}

// ── CORS Headers ────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ── OPTIONS handler for CORS preflight ──────────────────────────────

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// ── GET /api/network/status ─────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    // ── Authentication ──
    await requireAuth(request);

    // ── 1. Device counts ──
    const deviceCounts = await db.$queryRawUnsafe<
      Array<{ status: string; count: number }>
    >(
      `SELECT status, CAST(COUNT(*) AS int) as count FROM "NetworkDevice" GROUP BY status`
    );

    const totalDevices = deviceCounts.reduce((sum, d) => sum + Number(d.count), 0);
    const onlineDevices =
      Number(deviceCounts.find((d) => d.status === "ONLINE")?.count ?? 0);
    const offlineDevices =
      Number(deviceCounts.find((d) => d.status === "OFFLINE")?.count ?? 0);
    const warningDevices =
      Number(deviceCounts.find((d) => d.status === "WARNING")?.count ?? 0);

    // ── 2. Subscriber counts ──
    const subscriberCounts = await db.$queryRawUnsafe<
      Array<{ status: string; count: number }>
    >(
      `SELECT status, CAST(COUNT(*) AS int) as count FROM "Subscriber" GROUP BY status`
    );

    const totalSubscribers = subscriberCounts.reduce(
      (sum, s) => sum + Number(s.count),
      0
    );
    const activeSubscribers =
      Number(subscriberCounts.find((s) => s.status === "ACTIVE")?.count ?? 0);

    // ── 3. Complaint counts by priority ──
    const complaintCounts = await db.$queryRawUnsafe<
      Array<{ priority: string; count: number }>
    >(
      `SELECT priority, CAST(COUNT(*) AS int) as count FROM "Complaint" WHERE status NOT IN ('RESOLVED', 'CLOSED') GROUP BY priority`
    );

    const openComplaints = complaintCounts.reduce(
      (sum, c) => sum + Number(c.count),
      0
    );
    const p1Count =
      Number(complaintCounts.find((c) => c.priority === "P1_CRITICAL")?.count ?? 0);
    const p2Count =
      Number(complaintCounts.find((c) => c.priority === "P2_HIGH")?.count ?? 0);
    const p3Count =
      Number(complaintCounts.find((c) => c.priority === "P3_MEDIUM")?.count ?? 0);
    const p4Count =
      Number(complaintCounts.find((c) => c.priority === "P4_LOW")?.count ?? 0);

    // ── 4. Network uptime (derived from online device ratio) ──
    const networkUptime =
      totalDevices > 0
        ? Math.round((onlineDevices / totalDevices) * 10000) / 100
        : 100;

    // ── 5. Build response ──
    const response: NetworkStatusResponse = {
      devices: {
        total: totalDevices,
        online: onlineDevices,
        offline: offlineDevices,
        warning: warningDevices,
      },
      subscribers: {
        total: totalSubscribers,
        active: activeSubscribers,
      },
      complaints: {
        open: openComplaints,
        byPriority: {
          P1: p1Count,
          P2: p2Count,
          P3: p3Count,
          P4: p4Count,
        },
      },
      networkUptime,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response, { headers: corsHeaders });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode, headers: corsHeaders }
      );
    }
    console.error("Network status check failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch network status" },
      { status: 500, headers: corsHeaders }
    );
  }
}
