import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditCreateEntity } from "@/lib/audit";
import { FLAG_TYPES, normalizeFlagValue } from "@/lib/feature-flags";
import type { FeatureFlagType } from "@prisma/client";

// GET /api/feature-flags — list all flags with typed value preview
export async function GET(req: NextRequest) {
  try {
    await requirePermission("feature_flag", "list");

    const flags = await db.featureFlag.findMany({
      orderBy: { key: "asc" },
    });

    return NextResponse.json({ flags });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to fetch feature flags" }, { status: 500 });
  }
}

// POST /api/feature-flags — create { key, name, type, value, enabled, description }
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("feature_flag", "create");
    const body = await req.json();
    const { key, name, type, value, enabled, description, moduleSlug } = body;

    if (!key || typeof key !== "string" || !/^[a-z0-9_-]+(\.[a-z0-9_-]+)*$/i.test(key.trim())) {
      return NextResponse.json(
        { error: "key is required (letters, numbers, dashes, dots)" },
        { status: 400 }
      );
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (type && !FLAG_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `type must be one of: ${FLAG_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const flagType = (type || "boolean") as FeatureFlagType;

    const normalized = normalizeFlagValue(flagType, value !== undefined ? value : false);
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const duplicate = await db.featureFlag.findUnique({ where: { key: key.trim() } });
    if (duplicate) {
      return NextResponse.json({ error: `Flag "${key.trim()}" already exists` }, { status: 409 });
    }

    const flag = await db.featureFlag.create({
      data: {
        key: key.trim(),
        name: name.trim(),
        description: typeof description === "string" && description ? description : null,
        type: flagType,
        value: normalized.stored,
        isEnabled: enabled === true,
        // User-created flags are not system flags (system flags cannot be deleted)
        isSystem: false,
        moduleSlug: typeof moduleSlug === "string" && moduleSlug ? moduleSlug : null,
      },
    });

    await auditCreateEntity({
      userId: user.id,
      resource: "feature_flag",
      resourceId: flag.id,
      resourceName: flag.key,
      after: { key: flag.key, type: flag.type, value: flag.value, isEnabled: flag.isEnabled },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ flag }, { status: 201 });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to create feature flag" }, { status: 500 });
  }
}
