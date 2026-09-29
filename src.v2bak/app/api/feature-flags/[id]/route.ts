import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditFeatureFlagToggle, auditDelete } from "@/lib/audit";
import { normalizeFlagValue } from "@/lib/feature-flags";

// PATCH /api/feature-flags/[id] — update { enabled?, value?, name?, description? }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("feature_flag", "manage");
    const { id } = await params;
    const body = await req.json();

    const existing = await db.featureFlag.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Feature flag not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
        return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
      }
      data.name = body.name.trim();
    }

    if (body.description !== undefined) {
      data.description =
        typeof body.description === "string" && body.description ? body.description : null;
    }

    if (body.value !== undefined) {
      const normalized = normalizeFlagValue(existing.type, body.value);
      if (!normalized.ok) {
        return NextResponse.json({ error: normalized.error }, { status: 400 });
      }
      data.value = normalized.stored;
    }

    if (body.enabled !== undefined) {
      data.isEnabled = body.enabled === true;
    }

    const updated = await db.featureFlag.update({
      where: { id },
      data,
    });

    await auditFeatureFlagToggle({
      userId: user.id,
      resource: "feature_flag",
      resourceId: id,
      resourceName: existing.key,
      before: {
        name: existing.name,
        value: existing.value,
        isEnabled: existing.isEnabled,
      },
      after: {
        name: updated.name,
        value: updated.value,
        isEnabled: updated.isEnabled,
      },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ flag: updated });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to update feature flag" }, { status: 500 });
  }
}

// DELETE /api/feature-flags/[id] — delete (system flags are protected)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("feature_flag", "delete");
    const { id } = await params;

    const existing = await db.featureFlag.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Feature flag not found" }, { status: 404 });
    }

    if (existing.isSystem) {
      return NextResponse.json(
        { error: `"${existing.key}" is a system flag and cannot be deleted` },
        { status: 409 }
      );
    }

    await db.featureFlag.delete({ where: { id } });

    await auditDelete({
      userId: user.id,
      resource: "feature_flag",
      resourceId: id,
      resourceName: existing.key,
      before: { key: existing.key, type: existing.type, value: existing.value },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to delete feature flag" }, { status: 500 });
  }
}
