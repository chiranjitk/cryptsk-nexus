import { NextRequest, NextResponse } from "next/server";
import { requirePermission, requireAuth, AuthError } from "@/lib/api-auth";
import { testEmailFromISPSettings } from "@/lib/services/email-service";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/services/audit-service";

// ─── POST /api/settings/isp-profile/test-smtp ────────────────────
// Test SMTP connection using the ISP Profile settings.
// Accepts optional body { to: string } for a target email address.
// If no `to` is provided, uses the ISP's own email from settings.

export async function POST(request: NextRequest) {

  try {
    await requireAuth(request as unknown as import("next/server").NextRequest);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    throw e;
  }

  try {
    const userId = await requirePermission(request, "settings.update");

    let targetEmail: string | undefined;

    try {
      const body = await request.json();
      if (body?.to && typeof body.to === "string") {
        targetEmail = body.to.trim();
      }
    } catch {
      // No body or invalid JSON — that's fine, we'll use the default
    }

    // Default target: the ISP's own email from settings
    if (!targetEmail) {
      const settings = await db.ispSettings.findUnique({ where: { id: "default" } });
      targetEmail = settings?.email?.trim() || "";
    }

    if (!targetEmail) {
      return NextResponse.json(
        { success: false, message: "No target email provided and no ISP email configured in settings." },
        { status: 400 },
      );
    }

    // Audit the test action
    await auditLog(request, "INTEGRATION_TEST", "SMTP", "isp-profile", {
      details: { action: "test_smtp", targetEmail },
      userId,
    });

    const result = await testEmailFromISPSettings();

    return NextResponse.json({
      success: result.success,
      message: result.success
        ? `SMTP test successful — connection verified to mail server. Test email would be sent to ${targetEmail}.`
        : result.message,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error("Test SMTP error:", error);
    return NextResponse.json({ success: false, message: "Failed to test SMTP connection" }, { status: 500 });
  }
}
