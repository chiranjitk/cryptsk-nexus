import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditUpdate, auditDelete } from "@/lib/audit";
import type { $Enums } from "@prisma/client";

// PATCH /api/subscriptions/[id] — changePlan / suspend / resume / cancel / extend expiry
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("subscriber", "update");
    const { id } = await params;
    const body = await req.json();
    const { planId, action, status, extendDays, nextBillingDate, endDate, notes } = body;

    const existing = await db.subscription.findUnique({
      where: { id },
      include: { subscriber: { select: { id: true, radiusUsername: true, planId: true } } },
    });
    if (!existing) return NextResponse.json({ error: "Subscription not found" }, { status: 404 });

    const data: Record<string, unknown> = { updatedBy: user.id };
    let lifecycleState: "suspended" | "resumed" | "terminated" | null = null;
    let changeSummary: Record<string, unknown> = {};

    const wantsSuspend = action === "suspend" || status === "suspended";
    const wantsResume = action === "resume" || status === "active";
    const wantsCancel = action === "cancel" || action === "terminate" || status === "terminated";
    const wantsExtend = action === "extend" || extendDays !== undefined || nextBillingDate !== undefined || endDate !== undefined;
    const wantsChangePlan = action === "change_plan" || (planId !== undefined && planId !== existing.planId);

    if (wantsChangePlan) {
      if (!planId) return NextResponse.json({ error: "planId is required to change plan" }, { status: 400 });
      if (["terminated", "expired"].includes(existing.status)) {
        return NextResponse.json({ error: `Cannot change plan on a ${existing.status} subscription` }, { status: 400 });
      }
      const plan = await db.plan.findUnique({
        where: { id: planId },
        include: { product: { select: { radiusGroupName: true } } },
      });
      if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

      data.planId = planId;
      data.basePrice = plan.basePrice;
      data.currency = plan.currency;
      changeSummary.planChangedTo = plan.planCode;

      // Keep subscriber's current-plan pointer + RADIUS group in sync
      if (existing.subscriber) {
        await db.subscriber.update({ where: { id: existing.subscriber.id }, data: { planId } });
        const groupName = plan.radiusGroupName || plan.product?.radiusGroupName;
        if (groupName) {
          await db.radUserGroup.deleteMany({ where: { username: existing.subscriber.radiusUsername } });
          await db.radUserGroup.create({
            data: { username: existing.subscriber.radiusUsername, groupname: groupName, priority: 1, subscriberId: existing.subscriber.id },
          });
        }
      }
    }

    if (wantsSuspend) {
      if (existing.status !== "active") {
        return NextResponse.json({ error: `Cannot suspend from status "${existing.status}" — subscription must be active` }, { status: 400 });
      }
      data.status = "suspended";
      data.suspendedAt = new Date();
      lifecycleState = "suspended";
    } else if (wantsResume) {
      if (existing.status !== "suspended") {
        return NextResponse.json({ error: `Cannot resume from status "${existing.status}" — subscription must be suspended` }, { status: 400 });
      }
      data.status = "active";
      data.suspendedAt = null;
      lifecycleState = "resumed";
    } else if (wantsCancel) {
      if (["terminated", "expired"].includes(existing.status)) {
        return NextResponse.json({ error: `Subscription is already ${existing.status}` }, { status: 400 });
      }
      data.status = "terminated";
      data.terminatedAt = new Date();
      lifecycleState = "terminated";
    }

    if (wantsExtend) {
      if (["terminated", "expired"].includes(existing.status)) {
        return NextResponse.json({ error: `Cannot extend a ${existing.status} subscription` }, { status: 400 });
      }
      const days = Number(extendDays);
      if (extendDays !== undefined && (!Number.isFinite(days) || days <= 0)) {
        return NextResponse.json({ error: "extendDays must be a positive number" }, { status: 400 });
      }
      if (nextBillingDate !== undefined) {
        const d = nextBillingDate ? new Date(nextBillingDate) : null;
        if (d && isNaN(d.getTime())) return NextResponse.json({ error: "Invalid nextBillingDate" }, { status: 400 });
        data.nextBillingDate = d;
      }
      if (endDate !== undefined) {
        const d = endDate ? new Date(endDate) : null;
        if (d && isNaN(d.getTime())) return NextResponse.json({ error: "Invalid endDate" }, { status: 400 });
        data.endDate = d;
      }
      if (days > 0) {
        const base = data.nextBillingDate instanceof Date
          ? data.nextBillingDate
          : (existing.nextBillingDate || existing.endDate || new Date());
        const extended = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
        if (!data.nextBillingDate && (existing.nextBillingDate || existing.endDate)) {
          data.nextBillingDate = extended;
        } else if (!data.nextBillingDate && !existing.nextBillingDate && !existing.endDate) {
          data.nextBillingDate = extended;
        }
        if (existing.endDate && !data.endDate) {
          data.endDate = new Date(existing.endDate.getTime() + days * 24 * 60 * 60 * 1000);
        }
        changeSummary.extendedDays = days;
      }
    }

    if (notes !== undefined) data.notes = notes || null;

    if (Object.keys(data).length === 1) {
      return NextResponse.json({ error: "No changes requested — provide planId, action (suspend/resume/cancel/extend), status or dates" }, { status: 400 });
    }

    const updated = await db.subscription.update({
      where: { id },
      data,
      include: {
        plan: { include: { product: { select: { name: true, productCode: true } } } },
        subscriber: { select: { id: true, subscriberCode: true, radiusUsername: true, status: true } },
      },
    });

    if (lifecycleState) {
      await db.serviceLifecycle.create({
        data: {
          subscriptionId: id,
          state: lifecycleState as $Enums.ServiceState,
          previousState: existing.status as $Enums.ServiceState,
          reason: action || status || "Admin action",
          changedBy: user.id,
        },
      });
    }

    await auditUpdate({
      userId: user.id,
      resource: "subscription",
      resourceId: id,
      resourceName: existing.subscriptionCode,
      before: {
        status: existing.status, planId: existing.planId, basePrice: existing.basePrice,
        nextBillingDate: existing.nextBillingDate, endDate: existing.endDate,
      },
      after: {
        status: updated.status, planId: updated.planId, basePrice: updated.basePrice,
        nextBillingDate: updated.nextBillingDate, endDate: updated.endDate,
        ...changeSummary,
      },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ subscription: updated });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to update subscription" }, { status: 500 });
  }
}

// DELETE /api/subscriptions/[id] — delete (only terminated or expired subscriptions)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("subscriber", "delete");
    const { id } = await params;

    const existing = await db.subscription.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Subscription not found" }, { status: 404 });

    if (!["terminated", "expired"].includes(existing.status)) {
      return NextResponse.json(
        {
          error: `Cannot delete a ${existing.status} subscription. Cancel (terminate) it first — only terminated or expired subscriptions can be removed.`,
          code: "FK_CONSTRAINT",
          details: { status: existing.status },
        },
        { status: 409 }
      );
    }

    await db.subscription.delete({ where: { id } });

    await auditDelete({
      userId: user.id,
      resource: "subscription",
      resourceId: id,
      resourceName: existing.subscriptionCode,
      before: { subscriptionCode: existing.subscriptionCode, status: existing.status, planId: existing.planId },
      ipAddress: req.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "Failed to delete subscription" }, { status: 500 });
  }
}
