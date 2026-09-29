import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { auditLog } from "@/lib/services/audit-service";

// GET /api/integrations/logs?integrationId=xxx&status=xxx&page=1&limit=20
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const integrationId = searchParams.get("integrationId") || "";
    const status = searchParams.get("status") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    const where: Record<string, unknown> = {};
    if (integrationId) where.integrationId = integrationId;
    if (status) where.status = status;

    const [logs, total] = await Promise.all([
      db.integrationLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.integrationLog.count({ where }),
    ]);

    return NextResponse.json({
      logs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Integration logs GET error:", error);
    return NextResponse.json({ error: "Failed to fetch logs" }, { status: 500 });
  }
}

// POST /api/integrations/logs - Retry a failed log entry
export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req);
    const body = await req.json();
    const { action, logId } = body;

    if (action === "retry" && logId) {
      const originalLog = await db.integrationLog.findUnique({ where: { id: logId } });
      if (!originalLog) {
        return NextResponse.json({ error: "Log entry not found" }, { status: 404 });
      }

      // Increment apiCalls on the integration
      await db.integrationConfig.update({
        where: { id: originalLog.integrationId },
        data: { apiCalls: { increment: 1 } },
      });

      // Simulate a retry - create new log entry
      const retryLog = await db.integrationLog.create({
        data: {
          integrationId: originalLog.integrationId,
          method: originalLog.method,
          url: originalLog.url,
          statusCode: 200,
          status: "success",
          requestSummary: originalLog.requestSummary,
          responseSummary: "Retry successful",
          errorMessage: "",
          durationMs: Math.floor(Math.random() * 500) + 100,
          retryOf: logId,
        },
      });

      // Update original log to show it was retried
      await db.integrationLog.update({
        where: { id: logId },
        data: { status: "retried" },
      });

      await auditLog(req, "INTEGRATION_TEST", "IntegrationLog", logId, { details: { action: "retry", retryLogId: retryLog.id }, userId });

      return NextResponse.json({ success: true, log: retryLog });
    }

    if (action === "create_log") {
      const { integrationId, method, url, statusCode, status, requestSummary, responseSummary, errorMessage, durationMs } = body;
      if (!integrationId) {
        return NextResponse.json({ error: "integrationId is required" }, { status: 400 });
      }

      const integration = await db.integrationConfig.findUnique({ where: { id: integrationId } });
      if (!integration) {
        return NextResponse.json({ error: "Integration not found" }, { status: 404 });
      }

      // Increment API calls and update cost
      await db.integrationConfig.update({
        where: { id: integrationId },
        data: {
          apiCalls: { increment: 1 },
          estimatedCost: { increment: integration.costPerRequest || 0 },
        },
      });

      const log = await db.integrationLog.create({
        data: {
          integrationId,
          method: method || "POST",
          url: url || "",
          statusCode: statusCode || 0,
          status: status || "pending",
          requestSummary: requestSummary || "",
          responseSummary: responseSummary || "",
          errorMessage: errorMessage || "",
          durationMs: durationMs || 0,
        },
      });

      await auditLog(req, "INTEGRATION_TEST", "IntegrationLog", log.id, { details: { method, statusCode, status }, userId });

      return NextResponse.json({ success: true, log });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Integration logs POST error:", error);
    return NextResponse.json({ error: "Failed to process action" }, { status: 500 });
  }
}
