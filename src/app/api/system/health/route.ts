import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { formatBytes, formatUptime, formatMemoryUsage } from "@/lib/format-utils";
import os from "os";

// ── Response Types ──────────────────────────────────────────────────

interface HealthResponse {
  status: "healthy" | "degraded" | "critical";
  uptime: number;
  uptimeHuman: string;
  memory: {
    used: string;
    total: string;
    percentage: number;
    rss: number;
  };
  database: {
    status: "connected" | "error";
    size: string;
  };
  version: string;
  timestamp: string;
  server: string;
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

// ── GET /api/system/health ──────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    // ── Authentication ──
    try {
      await requireAuth(request);
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
      throw e;
    }

    // ── 1. Uptime ──
    const uptimeSeconds = Math.floor(process.uptime());
    const uptimeHuman = formatUptime(uptimeSeconds);

    // ── 2. Memory usage ──
    const memUsage = process.memoryUsage();
    const rss = memUsage.rss;
    const osTotalMemory = os.totalmem();
    const memoryUsed = formatBytes(rss);
    const memoryTotal = formatBytes(osTotalMemory);
    const memoryPercentage = formatMemoryUsage(rss, osTotalMemory);

    // ── 3. Database check ──
    let dbStatus: "connected" | "error" = "error";
    let dbSize = "0 B";

    try {
      // Test DB connectivity with a simple query
      await db.$queryRaw`SELECT 1 as health`;
      dbStatus = "connected";
    } catch (dbError) {
      console.error("System health — database connectivity check failed:", dbError);
      dbStatus = "error";
    }

    // Try to get the actual database size via PostgreSQL
    try {
      const dbSizeResult = await db.$queryRawUnsafe<Array<{ size: bigint }>>(
        `SELECT pg_database_size(current_database()) as size`
      );
      if (dbSizeResult && dbSizeResult.length > 0) {
        dbSize = formatBytes(Number(dbSizeResult[0].size));
      }
    } catch {
      dbSize = "unknown";
    }

    // ── 4. Determine overall status ──
    let status: HealthResponse["status"] = "healthy";
    if (dbStatus === "error") {
      status = "critical";
    } else if (memoryPercentage > 90) {
      status = "degraded";
    }

    // ── 5. Build response ──
    const response: HealthResponse = {
      status,
      uptime: uptimeSeconds,
      uptimeHuman,
      memory: {
        used: memoryUsed,
        total: memoryTotal,
        percentage: memoryPercentage,
        rss,
      },
      database: {
        status: dbStatus,
        size: dbSize,
      },
      version: "6.1",
      timestamp: new Date().toISOString(),
      server: "Next.js 16.1.3 (Turbopack)",
    };

    return NextResponse.json(response, { headers: corsHeaders });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode, headers: corsHeaders }
      );
    }
    console.error("System health check failed:", error);
    return NextResponse.json(
      {
        status: "critical",
        uptime: Math.floor(process.uptime()),
        uptimeHuman: formatUptime(Math.floor(process.uptime())),
        memory: {
          used: "0 B",
          total: "0 B",
          percentage: 0,
          rss: 0,
        },
        database: {
          status: "error" as const,
          size: "unknown",
        },
        version: "6.1",
        timestamp: new Date().toISOString(),
        server: "Next.js 16.1.3 (Turbopack)",
      } satisfies HealthResponse,
      { status: 503, headers: corsHeaders }
    );
  }
}
