import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { simulatePolicy } from "@/lib/policy-compiler";

// POST /api/policies/[id]/simulate — simulate policy (compile without deploying)
// Body: { config?: string, nasType?: string }
// If config is provided in body, simulate that; otherwise use the policy's saved config
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("policy", "read");
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { nasType } = body;

    // Dynamic import to avoid circular dependency
    const { db } = await import("@/lib/db");
    const policy = await db.policy.findUnique({ where: { id } });
    if (!policy) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const config = body.config || policy.config;
    const result = simulatePolicy(config, { nasType: nasType || "mikrotik" });

    return NextResponse.json({
      policyCode: policy.policyCode,
      policyName: policy.name,
      radiusGroupName: policy.radiusGroupName,
      nasType: nasType || "mikrotik",
      compiled: {
        checkItems: result.checkItems,
        replyItems: result.replyItems,
      },
      configParsed: result.configParsed,
      warnings: result.warnings,
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to simulate" }, { status: 500 });
  }
}
