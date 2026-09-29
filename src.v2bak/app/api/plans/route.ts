import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditCreateEntity } from "@/lib/audit";

// GET /api/plans — list plans (optionally filter by productId)
export async function GET(req: NextRequest) {
  try {
    await requirePermission("subscriber", "list");
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get("productId");

    const where: Record<string, unknown> = {};
    if (productId) where.productId = productId;

    const plans = await db.plan.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        product: { select: { id: true, name: true, productCode: true } },
        _count: { select: { subscribers: true, subscriptions: true } },
      },
    });

    return NextResponse.json({ plans });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to fetch plans" }, { status: 500 });
  }
}

// POST /api/plans — create plan
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("subscriber", "create");
    const body = await req.json();
    const { productId, name, billingCycle, basePrice, currency, taxRate, setupFee, contractMonths, dataLimitGb, radiusGroupName, status } = body;

    if (!productId || !name || !billingCycle || basePrice === undefined) {
      return NextResponse.json({ error: "productId, name, billingCycle, basePrice required" }, { status: 400 });
    }

    const count = await db.plan.count();
    const planCode = `PLAN-${String(count + 1).padStart(4, "0")}`;

    const plan = await db.plan.create({
      data: {
        planCode, productId, name,
        billingCycle, status: status || "active",
        basePrice: Number(basePrice),
        currency: currency || "INR",
        taxRate: taxRate ? Number(taxRate) : 18.0,
        setupFee: setupFee ? Number(setupFee) : 0,
        contractMonths: contractMonths ? Number(contractMonths) : null,
        dataLimitGb: dataLimitGb ? Number(dataLimitGb) : null,
        radiusGroupName: radiusGroupName || null,
        createdBy: user.id, updatedBy: user.id,
      },
      include: { product: { select: { name: true, productCode: true } } },
    });

    await auditCreateEntity({
      userId: user.id, action: "create", resource: "plan",
      resourceId: plan.id, resourceName: plan.planCode,
      after: { planCode, name, billingCycle, basePrice },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ plan }, { status: 201 });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to create plan" }, { status: 500 });
  }
}
