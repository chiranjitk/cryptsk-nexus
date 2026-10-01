import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditLog } from "@/lib/services/audit-service";
import { testConnection, maskSecret } from "@/lib/integrations/adapters";

// ─── POST /api/integrations/test ──────────────────────────────
// Verifies provider credentials with a REAL API call.
// Body: { configId } to test a saved config, or { provider, config }
// to test inline values from the config dialog BEFORE saving.

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
    const body = await req.json();
    const { configId, provider, config } = body as {
      configId?: string;
      provider?: string;
      config?: Record<string, string>;
    };

    let providerId = provider || "";
    let flat: Record<string, string> = { ...(config ?? {}) };
    let integrationId = "";
    let environment = "test";

    if (configId) {
      const row = await db.integrationConfig.findUnique({ where: { id: configId } });
      if (!row) return NextResponse.json({ error: "Integration config not found" }, { status: 404 });
      providerId = providerId || row.provider;
      integrationId = row.id;
      environment = row.environment;
      let parsed: Record<string, string> = {};
      try { parsed = JSON.parse(row.config ?? "{}") as Record<string, string>; } catch { /* ignore */ }
      flat = {
        ...parsed,
        apiKey: row.apiKey || parsed.apiKey || "",
        apiSecret: row.apiSecret || parsed.apiSecret || "",
        merchantId: row.merchantId || parsed.merchantId || "",
      };
    }

    if (!providerId) {
      return NextResponse.json({ error: "provider is required (directly or via configId)" }, { status: 400 });
    }

    const result = await testConnection(providerId, flat);

    // Persist to IntegrationLog (only for saved configs — inline tests log
    // under a synthetic id of empty string is NOT allowed by FK, skip)
    if (integrationId) {
      try {
        await db.integrationLog.create({
          data: {
            integrationId,
            method: "TEST",
            url: `test://${providerId}`,
            statusCode: result.ok ? 200 : 500,
            status: result.ok ? "success" : "failed",
            requestSummary: `Credential verification for ${providerId} (${environment})`,
            responseSummary: result.message,
            errorMessage: result.ok ? "" : result.message,
            durationMs: result.latencyMs,
          },
        });
        // Track test activity on the config row
        await db.integrationConfig.update({
          where: { id: integrationId },
          data: { apiCalls: { increment: 1 } },
        });
      } catch (logErr) {
        console.warn("[integrations/test] log write failed:", logErr);
      }
    }

    await auditLog(req, result.ok ? "TEST_SUCCESS" : "TEST_FAILURE", "Integration", integrationId || providerId, {
      provider: providerId, ok: result.ok, message: result.message,
    });

    return NextResponse.json({
      success: true,
      result: {
        ok: result.ok,
        message: result.message,
        latencyMs: result.latencyMs,
        details: result.details ?? {},
        testedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[integrations/test] error:", error);
    return NextResponse.json({ error: "Test execution failed" }, { status: 500 });
  }
}

// ─── GET /api/integrations/test ───────────────────────────────
// Returns masked config for safety checks from the UI.
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("configId");
    if (!id) return NextResponse.json({ error: "configId is required" }, { status: 400 });
    const row = await db.integrationConfig.findUnique({ where: { id } });
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({
      provider: row.provider,
      environment: row.environment,
      enabled: row.enabled,
      masked: {
        apiKey: maskSecret(row.apiKey),
        apiSecret: maskSecret(row.apiSecret),
        merchantId: row.merchantId,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
