import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { simulatePolicy } from "@/lib/policy-compiler";
import { auditCreateEntity } from "@/lib/audit";

// GET /api/policies — list policies
export async function GET(req: NextRequest) {
  try {
    await requirePermission("policy", "read");

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const type = searchParams.get("type") || "";
    const status = searchParams.get("status") || "";

    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { policyCode: { contains: search } },
        { radiusGroupName: { contains: search } },
      ];
    }

    const policies = await db.policy.findMany({
      where,
      orderBy: [{ precedence: "desc" }, { createdAt: "desc" }],
      include: {
        _count: { select: { versions: true, planMappings: true } },
      },
    });

    return NextResponse.json({ policies });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

// POST /api/policies — create policy
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("policy", "create");
    const body = await req.json();
    const { name, description, type, precedence, config, radiusGroupName } = body;

    if (!name || !type) {
      return NextResponse.json({ error: "name and type required" }, { status: 400 });
    }

    const count = await db.policy.count();
    const policyCode = `POL-${String(count + 1).padStart(4, "0")}`;

    const policy = await db.policy.create({
      data: {
        policyCode,
        name,
        description,
        type,
        precedence: precedence || 0,
        config: config || "{}",
        radiusGroupName: radiusGroupName || null,
        status: "draft",
        createdBy: user.id,
        updatedBy: user.id,
      },
    });

    // Create initial version
    await db.policyVersion.create({
      data: {
        policyId: policy.id,
        version: 1,
        config: config || "{}",
        changeLog: "Initial version",
        publishedBy: user.id,
      },
    });

    await auditCreateEntity({
      userId: user.id, action: "create", resource: "policy",
      resourceId: policy.id, resourceName: policy.policyCode,
      after: { policyCode, name, type, config },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ policy }, { status: 201 });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
