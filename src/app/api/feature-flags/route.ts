/**
 * /api/feature-flags — Phase 1 deliverable: Feature Flag management
 * GET: list all feature flags (filterable by ?scope=&enabled=)
 * POST: create a new feature flag
 * PATCH: toggle/update a flag (via ?key=)
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditCreate } from "@/lib/services/audit-service";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

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
    const { searchParams } = new URL(req.url);
    const scope = searchParams.get("scope");
    const enabled = searchParams.get("enabled");

    const where: Record<string, unknown> = {};
    if (scope) where.scope = scope;
    if (enabled === "true") where.enabled = true;
    if (enabled === "false") where.enabled = false;

    const flags = await db.featureFlag.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ flags, total: flags.length });
  } catch (err) {
    logger.error("feature_flags_list_failed", { error: err instanceof Error ? err.message : String(err), userId });
    return NextResponse.json({ error: "Failed to fetch feature flags" }, { status: 500 });
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
    const { key, name, description = "", enabled = false, value = null, scope = "global" } = body;

    if (!key || !name) {
      return NextResponse.json({ error: "key and name are required" }, { status: 400 });
    }

    const flag = await db.featureFlag.create({
      data: { key, name, description, enabled, value, scope },
    });

    await auditCreate(req, "FeatureFlag", flag.id, { key, name, enabled, scope }, { userId }).catch(() => {});
    logger.info("feature_flag_created", { flagId: flag.id, key, userId });
    return NextResponse.json({ flag }, { status: 201 });
  } catch (err) {
    logger.error("feature_flag_create_failed", { error: err instanceof Error ? err.message : String(err), userId });
    return NextResponse.json({ error: "Failed to create feature flag" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  let userId: string | undefined;
  try {
    userId = await requireAuth(req);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    throw e;
  }
  if (!userId) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const key = searchParams.get("key");
    if (!key) return NextResponse.json({ error: "?key= is required" }, { status: 400 });

    const body = await req.json();
    const { enabled, value, name, description } = body;

    const flag = await db.featureFlag.update({
      where: { key },
      data: {
        ...(typeof enabled === "boolean" ? { enabled } : {}),
        ...(value !== undefined ? { value } : {}),
        ...(name ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
      },
    });

    logger.info("feature_flag_updated", { key, enabled: flag.enabled, userId });
    return NextResponse.json({ flag });
  } catch (err) {
    logger.error("feature_flag_update_failed", { error: err instanceof Error ? err.message : String(err), userId });
    return NextResponse.json({ error: "Failed to update feature flag" }, { status: 500 });
  }
}
