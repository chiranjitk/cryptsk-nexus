/**
 * /api/license — Phase 1 deliverable: Licensing state
 * GET: return current active license (masked) + feature gating
 * POST: register/activate a new license key
 * DELETE: revoke current license
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditCreate } from "@/lib/services/audit-service";
import { logger } from "@/lib/logger";
import crypto from "crypto";

export const dynamic = "force-dynamic";

function maskKey(key: string): string {
  if (!key || key.length < 8) return "****";
  return key.substring(0, 4) + "..." + key.substring(key.length - 4);
}

function validateLicenseKey(key: string): { valid: boolean; payload?: Record<string, unknown> } {
  // License key format: <payload>.<signature>
  // payload = base64url(JSON{product, customer, maxUsers, maxSessions, features, expiresAt})
  // signature = HMAC-SHA256(payload, LICENSE_SECRET)
  // For now, accept any key with the right format — full validation in Phase 10
  const parts = key.split(".");
  if (parts.length !== 2) return { valid: false };
  try {
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf-8"));
    return { valid: true, payload };
  } catch {
    return { valid: false };
  }
}

export async function GET(req: NextRequest) {
  let userId: string | undefined;
  try {
    userId = await requireAuth(req);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    throw e;
  }
  if (!userId) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });

  try {
    const license = await db.license.findFirst({
      where: { status: "ACTIVE" },
      orderBy: { issuedAt: "desc" },
    });

    if (!license) {
      return NextResponse.json({
        license: null,
        isLicensed: false,
        message: "No active license. All modules available in evaluation mode.",
      });
    }

    // Check expiry
    const now = new Date();
    const expired = license.expiresAt && license.expiresAt < now;
    if (expired) {
      await db.license.update({ where: { id: license.id }, data: { status: "EXPIRED" } });
      return NextResponse.json({
        license: { ...license, key: maskKey(license.key), status: "EXPIRED" },
        isLicensed: false,
        message: "License expired. Please renew.",
      });
    }

    return NextResponse.json({
      license: { ...license, key: maskKey(license.key) },
      isLicensed: true,
      features: license.features || {},
    });
  } catch (err) {
    logger.error("license_get_failed", { error: err instanceof Error ? err.message : String(err), userId });
    return NextResponse.json({ error: "Failed to fetch license" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let userId: string | undefined;
  try {
    userId = await requireAuth(req);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    throw e;
  }
  if (!userId) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });

  try {
    const body = await req.json();
    const { key } = body;
    if (!key) return NextResponse.json({ error: "License key is required" }, { status: 400 });

    const validation = validateLicenseKey(key);
    if (!validation.valid) {
      return NextResponse.json({ error: "Invalid license key format" }, { status: 400 });
    }

    const payload = validation.payload as Record<string, string | number | object | undefined>;
    const license = await db.license.create({
      data: {
        key,
        productName: String(payload.product || "Cryptsk Nexus"),
        customerName: String(payload.customer || "Unknown"),
        maxUsers: Number(payload.maxUsers) || 0,
        maxSessions: Number(payload.maxSessions) || 0,
        features: payload.features || null,
        status: "ACTIVE",
        expiresAt: payload.expiresAt ? new Date(String(payload.expiresAt)) : null,
      },
    });

    await auditCreate(req, "License", license.id, { productName: license.productName, customerName: license.customerName }, { userId }).catch(() => {});
    logger.info("license_activated", { licenseId: license.id, productName: license.productName, userId });
    return NextResponse.json({ license: { ...license, key: maskKey(license.key) } }, { status: 201 });
  } catch (err) {
    logger.error("license_activate_failed", { error: err instanceof Error ? err.message : String(err), userId });
    return NextResponse.json({ error: "Failed to activate license" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  let userId: string | undefined;
  try {
    userId = await requireAuth(req);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    throw e;
  }
  if (!userId) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });

  try {
    const license = await db.license.findFirst({
      where: { status: "ACTIVE" },
      orderBy: { issuedAt: "desc" },
    });
    if (!license) return NextResponse.json({ error: "No active license to revoke" }, { status: 404 });

    await db.license.update({ where: { id: license.id }, data: { status: "REVOKED" } });
    logger.info("license_revoked", { licenseId: license.id, userId });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("license_revoke_failed", { error: err instanceof Error ? err.message : String(err), userId });
    return NextResponse.json({ error: "Failed to revoke license" }, { status: 500 });
  }
}

// Re-export crypto for tree-shaking
export { crypto };
