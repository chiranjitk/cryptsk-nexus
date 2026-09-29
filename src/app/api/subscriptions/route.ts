import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditCreateEntity } from "@/lib/audit";

// Billing cycle → days used for next billing date computation
const CYCLE_DAYS: Record<string, number | null> = {
  monthly: 30,
  quarterly: 90,
  half_yearly: 180,
  yearly: 365,
  one_time: null,
  usage_based: null,
};

// GET /api/subscriptions — list subscriptions (filters: customerId, subscriberId, status)
export async function GET(req: NextRequest) {
  try {
    await requirePermission("subscriber", "list");

    const { searchParams } = new URL(req.url);
    const customerId = searchParams.get("customerId") || "";
    const subscriberId = searchParams.get("subscriberId") || "";
    const status = searchParams.get("status") || "";
    const limit = Math.min(Number(searchParams.get("limit")) || 100, 500);

    const where: Record<string, unknown> = {};
    if (customerId) where.customerId = customerId;
    if (subscriberId) where.subscriberId = subscriberId;
    if (status) where.status = status;

    const subscriptions = await db.subscription.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        plan: { include: { product: { select: { name: true, productCode: true } } } },
        subscriber: { select: { id: true, subscriberCode: true, radiusUsername: true, status: true } },
        customer: { select: { id: true, customerCode: true, displayName: true } },
      },
    });

    return NextResponse.json({ subscriptions });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to fetch subscriptions" }, { status: 500 });
  }
}

// POST /api/subscriptions — create subscription (bind subscriber to plan)
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("subscriber", "create");
    const body = await req.json();
    const { subscriberId, planId, startDate, notes } = body;

    if (!subscriberId || !planId) {
      return NextResponse.json({ error: "subscriberId and planId are required" }, { status: 400 });
    }

    const subscriber = await db.subscriber.findUnique({ where: { id: subscriberId } });
    if (!subscriber) return NextResponse.json({ error: "Subscriber not found" }, { status: 404 });

    const plan = await db.plan.findUnique({
      where: { id: planId },
      include: { product: { select: { radiusGroupName: true } } },
    });
    if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

    const start = startDate ? new Date(startDate) : new Date();
    if (isNaN(start.getTime())) {
      return NextResponse.json({ error: "Invalid startDate" }, { status: 400 });
    }

    // billingCycle defaults to the plan's cycle; nextBillDate = start + cycle days
    const cycleDays = CYCLE_DAYS[plan.billingCycle] ?? null;
    const nextBillingDate = cycleDays
      ? new Date(start.getTime() + cycleDays * 24 * 60 * 60 * 1000)
      : null;
    const endDate = plan.contractMonths
      ? new Date(start.getTime() + plan.contractMonths * 30 * 24 * 60 * 60 * 1000)
      : null;

    const count = await db.subscription.count();
    const subscriptionCode = `SUB-${start.getFullYear()}-${String(count + 1).padStart(4, "0")}`;

    const subscription = await db.subscription.create({
      data: {
        subscriptionCode,
        customerId: subscriber.customerId,
        subscriberId,
        planId,
        status: "active",
        basePrice: plan.basePrice,
        currency: plan.currency,
        startDate: start,
        endDate,
        nextBillingDate,
        notes: notes || null,
        createdBy: user.id,
        updatedBy: user.id,
      },
      include: {
        plan: { include: { product: { select: { name: true, productCode: true } } } },
        subscriber: { select: { id: true, subscriberCode: true, radiusUsername: true, status: true } },
      },
    });

    // Provisioning side-effects: point subscriber at the new plan + activate if pending
    const subscriberUpdate: Record<string, unknown> = { planId, updatedBy: user.id };
    if (subscriber.status === "pending_activation") {
      subscriberUpdate.status = "active";
      subscriberUpdate.activatedAt = new Date();
    }
    await db.subscriber.update({ where: { id: subscriberId }, data: subscriberUpdate });

    // Sync RADIUS group membership (Plans map to RADIUS groups)
    const groupName = plan.radiusGroupName || plan.product?.radiusGroupName;
    if (groupName) {
      await db.radUserGroup.deleteMany({ where: { username: subscriber.radiusUsername } });
      await db.radUserGroup.create({
        data: { username: subscriber.radiusUsername, groupname: groupName, priority: 1, subscriberId },
      });
    }

    // Lifecycle tracking
    await db.serviceLifecycle.create({
      data: {
        subscriptionId: subscription.id,
        state: "activated",
        previousState: "provisioned",
        reason: "Subscription created",
        changedBy: user.id,
      },
    });

    await auditCreateEntity({
      userId: user.id,
      resource: "subscription",
      resourceId: subscription.id,
      resourceName: subscriptionCode,
      after: { subscriptionCode, subscriberId, planId, status: "active", basePrice: plan.basePrice, nextBillingDate },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ subscription }, { status: 201 });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to create subscription" }, { status: 500 });
  }
}
