import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ── Response Types ──────────────────────────────────────────────────

interface SystemHealthResponse {
  status: "healthy" | "degraded" | "critical";
  timestamp: string;
  uptime: number;
  database: {
    status: "connected" | "error";
    latencyMs: number;
    totalRecords: number;
  };
  memory: {
    usedMb: number;
    totalMb: number;
    percentUsed: number;
  };
  services: {
    dashboard: boolean;
    subscribers: boolean;
    devices: boolean;
  };
}

// ── GET /api/system-health ─────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
      throw e;
    }

    // ── 1. Database connectivity & latency ──
    const dbStart = performance.now();
    let dbLatencyMs = -1;
    let dbConnected = false;
    let totalRecords = 0;

    try {
      // Simple connectivity check
      await db.user.count();

      dbLatencyMs = Math.round((performance.now() - dbStart) * 100) / 100;
      dbConnected = true;

      // Count records across key tables in parallel
      const [subscriberCount, deviceCount, invoiceCount, complaintCount, paymentCount] =
        await Promise.all([
          db.subscriber.count().catch(() => 0),
          db.networkDevice.count().catch(() => 0),
          db.invoice.count().catch(() => 0),
          db.complaint.count().catch(() => 0),
          db.payment.count().catch(() => 0),
        ]);

      totalRecords = subscriberCount + deviceCount + invoiceCount + complaintCount + paymentCount;
    } catch (dbError) {
      console.error("System health — database check failed:", dbError);
      dbConnected = false;
      dbLatencyMs = -1;
    }

    // ── 2. Memory usage ──
    let memory: SystemHealthResponse["memory"] = {
      usedMb: 0,
      totalMb: 0,
      percentUsed: 0,
    };

    try {
      const memUsage = process.memoryUsage();
      const usedMb = Math.round((memUsage.heapUsed / 1024 / 1024) * 100) / 100;
      const totalMb = Math.round((memUsage.heapTotal / 1024 / 1024) * 100) / 100;
      const percentUsed =
        totalMb > 0 ? Math.round((usedMb / totalMb) * 10000) / 100 : 0;

      memory = { usedMb, totalMb, percentUsed };
    } catch {
      // Memory metrics unavailable — non-critical
    }

    // ── 3. Service availability checks ──
    const services: SystemHealthResponse["services"] = {
      dashboard: false,
      Subscriber: false,
      NetworkDevice: false,
    };

    try {
      // Dashboard: check if dashboard-relevant tables are queryable
      await Promise.all([
        db.subscriber.count({ take: 1 }),
        db.invoice.count({ take: 1 }),
        db.payment.count({ take: 1 }),
        db.complaint.count({ take: 1 }),
      ]);
      services.dashboard = true;
    } catch {
      // Dashboard service degraded
    }

    try {
      // Subscribers: check if subscriber table is accessible
      await db.subscriber.count({ take: 1 });
      services.subscribers = true;
    } catch {
      // Subscribers service degraded
    }

    try {
      // Devices: check if networkDevice table is accessible
      await db.networkDevice.count({ take: 1 });
      services.devices = true;
    } catch {
      // Devices service degraded
    }

    // ── 4. Calculate overall status ──
    let status: SystemHealthResponse["status"] = "healthy";

    if (!dbConnected) {
      status = "critical";
    } else if (dbLatencyMs > 500) {
      status = "degraded";
    } else if (!services.dashboard || !services.subscribers || !services.devices) {
      status = "degraded";
    }

    // ── 5. Build response ──
    const response: SystemHealthResponse = {
      status,
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      database: {
        status: dbConnected ? "connected" : "error",
        latencyMs: dbLatencyMs,
        totalRecords,
      },
      memory,
      services,
    };

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("System health check failed:", error);
    return NextResponse.json(
      {
        status: "critical",
        timestamp: new Date().toISOString(),
        uptime: Math.round(process.uptime()),
        database: { status: "error", latencyMs: -1, totalRecords: 0 },
        memory: { usedMb: 0, totalMb: 0, percentUsed: 0 },
        services: { dashboard: false, Subscriber: false, NetworkDevice: false },
      } satisfies SystemHealthResponse,
      { status: 503 }
    );
  }
}
