import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { db } from "@/lib/db";

// GET /api/radius-settings — fetch password policy and captive portal config
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const settings = await db.ispSettings.findUnique({ where: { id: "default" } });

    const passwordPolicy = {
      minLength: settings?.passwordMinLength ?? 8,
      requireUppercase: !!settings?.passwordRequireUppercase,
      requireLowercase: !!settings?.passwordRequireLowercase,
      requireNumbers: !!settings?.passwordRequireNumbers,
      requireSpecial: !!settings?.passwordRequireSpecial,
      expiryDays: settings?.passwordExpiryDays ?? 90,
    };

    const captivePortal = {
      enabled: !!settings?.captivePortalEnabled,
      portalName: settings?.captivePortalName ?? "",
      welcomeMessage: settings?.captivePortalWelcome ?? "",
      loginMethod: settings?.captivePortalLoginMethod ?? "RADIUS",
      sessionTimeout: settings?.captivePortalSessionTimeout ?? 86400,
      bandwidthLimit: settings?.captivePortalBandwidthLimit ?? "",
      redirectUrl: settings?.captivePortalRedirectUrl ?? "",
      termsOfService: settings?.captivePortalTos ?? "",
    };

    return NextResponse.json({ passwordPolicy, captivePortal });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    const status = (error as any)?.statusCode || 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

// PUT /api/radius-settings — update password policy and/or captive portal
export async function PUT(req: NextRequest) {
  try {
    await requireAuth(req);
    const body = await req.json();
    const { passwordPolicy, captivePortal } = body;

    const updateData: Record<string, unknown> = {};

    // Password Policy fields
    if (passwordPolicy) {
      if (passwordPolicy.minLength !== undefined) updateData.passwordMinLength = Math.max(4, Math.min(128, parseInt(passwordPolicy.minLength) || 8));
      if (passwordPolicy.requireUppercase !== undefined) updateData.passwordRequireUppercase = Boolean(passwordPolicy.requireUppercase);
      if (passwordPolicy.requireLowercase !== undefined) updateData.passwordRequireLowercase = Boolean(passwordPolicy.requireLowercase);
      if (passwordPolicy.requireNumbers !== undefined) updateData.passwordRequireNumbers = Boolean(passwordPolicy.requireNumbers);
      if (passwordPolicy.requireSpecial !== undefined) updateData.passwordRequireSpecial = Boolean(passwordPolicy.requireSpecial);
      if (passwordPolicy.expiryDays !== undefined) updateData.passwordExpiryDays = Math.max(0, parseInt(passwordPolicy.expiryDays) || 0);
    }

    // Captive Portal fields
    if (captivePortal) {
      if (captivePortal.enabled !== undefined) updateData.captivePortalEnabled = Boolean(captivePortal.enabled);
      if (captivePortal.portalName !== undefined) updateData.captivePortalName = String(captivePortal.portalName);
      if (captivePortal.welcomeMessage !== undefined) updateData.captivePortalWelcome = String(captivePortal.welcomeMessage);
      if (captivePortal.loginMethod !== undefined) updateData.captivePortalLoginMethod = String(captivePortal.loginMethod);
      if (captivePortal.sessionTimeout !== undefined) updateData.captivePortalSessionTimeout = Math.max(0, parseInt(captivePortal.sessionTimeout) || 0);
      if (captivePortal.bandwidthLimit !== undefined) updateData.captivePortalBandwidthLimit = String(captivePortal.bandwidthLimit);
      if (captivePortal.redirectUrl !== undefined) updateData.captivePortalRedirectUrl = String(captivePortal.redirectUrl);
      if (captivePortal.termsOfService !== undefined) updateData.captivePortalTos = String(captivePortal.termsOfService);
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    // Upsert the settings row
    await db.ispSettings.upsert({
      where: { id: "default" },
      update: updateData,
      create: { id: "default", ...updateData },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    const status = (error as any)?.statusCode || 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
