import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditConfigChange } from "@/lib/audit";
import type { $Enums } from "@prisma/client";

// ============================================================
// System Settings — global key/value config store
// GET returns settings grouped by category; PATCH upserts one
// key (creates non-system settings when the key is new).
// ============================================================

const VALID_TYPES = ["boolean", "string", "number", "json"];

// Validate `value` against the setting `type` and return the stored string.
function validateValue(type: string, value: string): string | null {
  switch (type) {
    case "boolean":
      return value === "true" || value === "false" ? value : null;
    case "number":
      return value.trim() !== "" && !isNaN(Number(value)) ? value : null;
    case "json":
      try {
        JSON.parse(value);
        return value;
      } catch {
        return null;
      }
    default:
      return value; // string — anything goes
  }
}

// GET /api/settings — all settings grouped by category
export async function GET(req: NextRequest) {
  try {
    await requirePermission("system_setting", "read");

    const settings = await db.systemSetting.findMany({
      orderBy: [{ category: "asc" }, { key: "asc" }],
    });

    const grouped: Record<string, typeof settings> = {};
    for (const setting of settings) {
      const category = setting.category || "general";
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(setting);
    }

    return NextResponse.json({
      settings,
      grouped,
      categories: Object.keys(grouped),
      total: settings.length,
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

// PATCH /api/settings — upsert { key, value, category?, type?, description? }
export async function PATCH(req: NextRequest) {
  try {
    const user = await requirePermission("system_setting", "manage");
    const body = await req.json();
    const { key, value, category, type, description } = body;

    if (!key || typeof key !== "string" || !key.trim()) {
      return NextResponse.json({ error: "key is required" }, { status: 400 });
    }

    // Coerce non-string values (booleans/numbers from the UI) to string
    let valueStr: string;
    if (typeof value === "string") {
      valueStr = value;
    } else if (value === null || value === undefined) {
      return NextResponse.json({ error: "value is required" }, { status: 400 });
    } else {
      valueStr = String(value);
    }

    const existing = await db.systemSetting.findUnique({ where: { key: key.trim() } });

    if (existing) {
      const effectiveType = existing.type;
      const stored = validateValue(effectiveType, valueStr);
      if (stored === null) {
        return NextResponse.json(
          { error: `Invalid value for type "${effectiveType}"` },
          { status: 400 }
        );
      }

      const updated = await db.systemSetting.update({
        where: { key: key.trim() },
        data: { value: stored, updatedBy: user.id },
      });

      await auditConfigChange({
        userId: user.id,
        resource: "system_setting",
        resourceId: updated.id,
        resourceName: updated.key,
        before: { key: existing.key, value: existing.value },
        after: { key: updated.key, value: updated.value },
        ipAddress: req.headers.get("x-forwarded-for") || "unknown",
      });

      return NextResponse.json({ setting: updated });
    }

    // New key — create a non-system setting
    const newType = typeof type === "string" && VALID_TYPES.includes(type) ? type : "string";
    const stored = validateValue(newType, valueStr);
    if (stored === null) {
      return NextResponse.json(
        { error: `Invalid value for type "${newType}"` },
        { status: 400 }
      );
    }

    const created = await db.systemSetting.create({
      data: {
        key: key.trim(),
        value: stored,
        type: newType as $Enums.FeatureFlagType,
        category: typeof category === "string" && category.trim() ? category.trim() : "general",
        description: typeof description === "string" && description ? description : null,
        isPublic: false,
        isSensitive: false,
        updatedBy: user.id,
      },
    });

    await auditConfigChange({
      userId: user.id,
      resource: "system_setting",
      resourceId: created.id,
      resourceName: created.key,
      before: null,
      after: { key: created.key, value: created.value, category: created.category, type: created.type },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ setting: created }, { status: 201 });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to save setting" }, { status: 500 });
  }
}
