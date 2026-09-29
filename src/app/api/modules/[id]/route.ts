import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditModuleToggle } from "@/lib/audit";
import type { ModuleStatus } from "@prisma/client";

const VALID_STATUSES: ModuleStatus[] = [
  "active",
  "inactive",
  "maintenance",
  "error",
  "not_installed",
];

// PATCH /api/modules/[id] — change module status { status }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("module", "manage");
    const { id } = await params;
    const body = await req.json();
    const { status } = body;

    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    const existing = await db.module.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Module not found" }, { status: 404 });

    // Core (required) modules cannot be deactivated
    if (existing.isRequired && status === "inactive") {
      return NextResponse.json(
        { error: `"${existing.name}" is a core module and cannot be deactivated` },
        { status: 409 }
      );
    }

    const data: Record<string, unknown> = { status };
    if (status === "active") data.enabledAt = new Date();

    const updated = await db.module.update({
      where: { id },
      data,
      include: { _count: { select: { featureFlags: true } } },
    });

    await auditModuleToggle({
      userId: user.id,
      resource: "module",
      resourceId: id,
      resourceName: existing.name,
      before: { status: existing.status },
      after: { status: updated.status },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ module: updated });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to update module" }, { status: 500 });
  }
}
