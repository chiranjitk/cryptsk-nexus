import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSelfcareAccess } from "@/lib/portal-auth";
import { isRedirectError, resolveSelfcareSubscriber } from "../common";

// ============================================================
// CRYPTSK Nexus — GET /api/selfcare/plans?subscriberId=<cuid>
// Self-Care "Plan Comparison" (spec §18): the active catalog a
// subscriber can compare against their current plan. isCurrent is
// computed server-side from subscribers.planId.
// AUTH: requireSelfcareAccess — customer logins are scoped to their
// own customer (subscriberId auto-picked from their first subscriber);
// staff preview per-subscriber via ?subscriberId= (RBAC: subscriber.list).
// Product.description is the catalog copy — Plan has no description
// column of its own in this schema.
// Read-only.
// ============================================================

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ctx = await requireSelfcareAccess({
      subscriberId: searchParams.get("subscriberId"),
      customerId: searchParams.get("customerId"),
    });

    if (!ctx.subscriberId) {
      return ctx.mode === "staff"
        ? NextResponse.json({ error: "subscriberId is required" }, { status: 400 })
        : NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
    }

    const subscriber = await resolveSelfcareSubscriber(ctx.subscriberId);
    if (!subscriber || !subscriber.customer) {
      return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });
    }

    const plans = await db.plan.findMany({
      where: { status: "active" },
      orderBy: { basePrice: "asc" },
      include: { product: { select: { name: true, description: true } } },
    });

    return NextResponse.json({
      currentPlanId: subscriber.planId,
      plans: plans.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.product?.description ?? null,
        basePrice: p.basePrice,
        billingCycle: p.billingCycle,
        taxRate: p.taxRate,
        dataLimitGb: p.dataLimitGb,
        setupFee: p.setupFee,
        discountPercent: p.discountPercent,
        product: { name: p.product?.name ?? null },
        isCurrent: p.id === subscriber.planId,
      })),
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/selfcare/plans] GET failed:", err);
    return NextResponse.json({ error: "Failed to load plans" }, { status: 500 });
  }
}
