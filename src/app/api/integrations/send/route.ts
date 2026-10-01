import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditLog } from "@/lib/services/audit-service";
import { sendTest } from "@/lib/integrations/adapters";

// ─── POST /api/integrations/send ──────────────────────────────
// Delivers a REAL test message through a saved integration.
// Body: { configId, to, message, subject? }

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const body = await req.json();
    const { configId, to, message, subject } = body as {
      configId?: string;
      to?: string;
      message?: string;
      subject?: string;
    };

    if (!configId) return NextResponse.json({ error: "configId is required" }, { status: 400 });
    if (!to?.trim()) return NextResponse.json({ error: "Recipient (to) is required" }, { status: 400 });
    if (!message?.trim()) return NextResponse.json({ error: "Message is required" }, { status: 400 });

    const row = await db.integrationConfig.findUnique({ where: { id: configId } });
    if (!row) return NextResponse.json({ error: "Integration config not found" }, { status: 404 });
    if (!row.enabled) {
      return NextResponse.json({ error: "Integration is disabled — enable it before sending" }, { status: 400 });
    }

    let parsed: Record<string, string> = {};
    try { parsed = JSON.parse(row.config ?? "{}") as Record<string, string>; } catch { /* ignore */ }
    const flat = {
      ...parsed,
      apiKey: row.apiKey || parsed.apiKey || "",
      apiSecret: row.apiSecret || parsed.apiSecret || "",
      merchantId: row.merchantId || parsed.merchantId || "",
    };

    const result = await sendTest(row.provider, flat, { to: to.trim(), message, subject });

    try {
      await db.integrationLog.create({
        data: {
          integrationId: row.id,
          method: "SEND",
          url: `send://${row.provider}`,
          statusCode: result.ok ? 200 : 500,
          status: result.ok ? "success" : "failed",
          requestSummary: `Test ${row.type} → ${to.replace(/^(.{4}).*(.{2})$/, "$1••••$2")}`,
          responseSummary: result.message,
          errorMessage: result.ok ? "" : result.message,
          durationMs: result.latencyMs,
        },
      });
      await db.integrationConfig.update({
        where: { id: row.id },
        data: { apiCalls: { increment: 1 }, estimatedCost: { increment: row.costPerRequest } },
      });
    } catch (logErr) {
      console.warn("[integrations/send] log write failed:", logErr);
    }

    await auditLog(req, result.ok ? "SEND_SUCCESS" : "SEND_FAILURE", "Integration", row.id, {
      provider: row.provider, ok: result.ok, to: to.trim(),
    });

    return NextResponse.json({
      success: true,
      result: {
        ok: result.ok,
        message: result.message,
        latencyMs: result.latencyMs,
        details: result.details ?? {},
        sentAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[integrations/send] error:", error);
    return NextResponse.json({ error: "Send execution failed" }, { status: 500 });
  }
}
