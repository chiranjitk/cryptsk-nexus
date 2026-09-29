import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { publishPolicyToRadius } from "@/lib/policy-compiler";
import { auditConfigChange } from "@/lib/audit";

// POST /api/policies/[id]/publish — publish policy to RADIUS
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("policy", "execute");
    const { id } = await params;

    const policy = await db.policy.findUnique({ where: { id } });
    if (!policy) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!policy.radiusGroupName) {
      return NextResponse.json({ error: "Policy has no RADIUS group name set" }, { status: 400 });
    }

    // Compile + sync to RADIUS
    const result = await publishPolicyToRadius({
      policyId: id,
      groupname: policy.radiusGroupName,
      config: policy.config,
    });

    // Update policy status to active
    await db.policy.update({
      where: { id },
      data: {
        status: "active",
        publishedAt: new Date(),
        publishedBy: user.id,
      },
    });

    await auditConfigChange({
      userId: user.id,
      action: "config_change",
      resource: "policy",
      resourceId: id,
      resourceName: policy.policyCode,
      after: { published: true, groupname: policy.radiusGroupName, checkItems: result.checkCount, replyItems: result.replyCount },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({
      success: true,
      published: true,
      groupname: policy.radiusGroupName,
      checkItems: result.checkCount,
      replyItems: result.replyCount,
      warnings: result.warnings,
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to publish" }, { status: 500 });
  }
}
