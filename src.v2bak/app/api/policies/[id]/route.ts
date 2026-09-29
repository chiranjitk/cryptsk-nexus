import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { publishPolicyToRadius } from "@/lib/policy-compiler";
import { auditConfigChange } from "@/lib/audit";

// GET /api/policies/[id] — get single policy
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("policy", "read");
    const { id } = await params;

    const policy = await db.policy.findUnique({
      where: { id },
      include: {
        versions: { orderBy: { version: "desc" }, take: 10 },
        planMappings: {
          include: { plan: { select: { id: true, name: true, planCode: true } } },
        },
      },
    });

    if (!policy) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ policy });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

// PATCH /api/policies/[id] — update policy
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("policy", "update");
    const { id } = await params;
    const body = await req.json();
    const { name, description, precedence, config, radiusGroupName, status } = body;

    const existing = await db.policy.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data: Record<string, unknown> = { updatedBy: user.id };
    if (name) data.name = name;
    if (description !== undefined) data.description = description;
    if (precedence !== undefined) data.precedence = precedence;
    if (config) data.config = config;
    if (radiusGroupName !== undefined) data.radiusGroupName = radiusGroupName;
    if (status) data.status = status;

    const updated = await db.policy.update({ where: { id }, data });

    // Create new version if config changed
    if (config && config !== existing.config) {
      const newVersion = existing.version + 1;
      await db.policyVersion.create({
        data: {
          policyId: id,
          version: newVersion,
          config,
          changeLog: body.changeLog || `Updated to v${newVersion}`,
          publishedBy: user.id,
        },
      });
      await db.policy.update({ where: { id }, data: { version: newVersion } });
    }

    await auditConfigChange({
      userId: user.id, action: "config_change", resource: "policy",
      resourceId: id, resourceName: existing.policyCode,
      before: { config: existing.config, precedence: existing.precedence },
      after: { config: config || existing.config, precedence: precedence ?? existing.precedence },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ policy: updated });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

// DELETE /api/policies/[id] — delete policy
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("policy", "delete");
    const { id } = await params;

    const existing = await db.policy.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Remove from RADIUS if published
    if (existing.radiusGroupName) {
      await db.radGroupCheck.deleteMany({ where: { groupname: existing.radiusGroupName } });
      await db.radGroupReply.deleteMany({ where: { groupname: existing.radiusGroupName } });
    }

    await db.policy.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
