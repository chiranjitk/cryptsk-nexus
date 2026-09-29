import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { auditUpdate, auditDelete } from "@/lib/services/audit-service";
import { requireAuth } from "@/lib/api-auth";
import { syncGroupToFreeRADIUS, removeGroupFromFreeRADIUS } from "@/lib/radius-sync";

// GET /api/plans/[id] — single plan
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const plan = await db.plan.findUnique({
      where: { id },
      include: {
        _count: { select: { Subscriber: true } },
      },
    });

    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    return NextResponse.json(plan);
  } catch (error) {
    console.error("Plan GET error:", error);
    return NextResponse.json({ error: "Failed to fetch plan" }, { status: 500 });
  }
}

// PUT /api/plans/[id] — update plan
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth(req);
    const { id } = await params;
    const body = await req.json();

    const plan = await db.plan.findUnique({ where: { id } });
    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    const updated = await db.plan.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.category !== undefined && { category: body.category }),
        ...(body.downloadSpeed !== undefined && { downloadSpeed: body.downloadSpeed }),
        ...(body.uploadSpeed !== undefined && { uploadSpeed: body.uploadSpeed }),
        ...(body.speedUnit !== undefined && { speedUnit: body.speedUnit.toUpperCase() }),
        ...(body.priceMonthly !== undefined && { priceMonthly: body.priceMonthly }),
        ...(body.priceQuarterly !== undefined && { priceQuarterly: body.priceQuarterly || null }),
        ...(body.priceHalfYearly !== undefined && { priceHalfYearly: body.priceHalfYearly || null }),
        ...(body.priceYearly !== undefined && { priceYearly: body.priceYearly || null }),
        ...(body.installationCharge !== undefined && { installationCharge: body.installationCharge }),
        ...(body.securityDeposit !== undefined && { securityDeposit: body.securityDeposit }),
        ...(body.routerRental !== undefined && { routerRental: body.routerRental }),
        ...(body.validityDays !== undefined && { validityDays: body.validityDays }),
        ...(body.cgstPercent !== undefined && { cgstPercent: body.cgstPercent }),
        ...(body.sgstPercent !== undefined && { sgstPercent: body.sgstPercent }),
        ...(body.igstPercent !== undefined && { igstPercent: body.igstPercent }),
        ...(body.dataLimitGb !== undefined && { dataLimitGb: body.dataLimitGb || null }),
        ...(body.contentionRatio !== undefined && { contentionRatio: body.contentionRatio }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.isPopular !== undefined && { isPopular: body.isPopular }),
        ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
        ...(body.downloadSpeedFup !== undefined && { downloadSpeedFup: body.downloadSpeedFup || null }),
        ...(body.uploadSpeedFup !== undefined && { uploadSpeedFup: body.uploadSpeedFup || null }),
        ...(body.burstSpeed !== undefined && { burstSpeed: body.burstSpeed || null }),
        ...(body.burstDuration !== undefined && { burstDuration: body.burstDuration || null }),
        ...(body.maxConcurrentSessions !== undefined && { maxConcurrentSessions: body.maxConcurrentSessions ?? 1 }),
        ...(body.freeTrialDays !== undefined && { freeTrialDays: body.freeTrialDays ?? 0 }),
        ...(body.slaUptime !== undefined && { slaUptime: body.slaUptime ?? 99.5 }),
        ...(body.ipv6Enabled !== undefined && { ipv6Enabled: body.ipv6Enabled }),
        ...(body.ipv6PrefixDelegation !== undefined && { ipv6PrefixDelegation: body.ipv6PrefixDelegation }),
        ...(body.ipv6DefaultPoolId !== undefined && { ipv6DefaultPoolId: body.ipv6DefaultPoolId }),
        ...(body.ipv6AssignmentMode !== undefined && { ipv6AssignmentMode: body.ipv6AssignmentMode }),
      },
      include: {
        _count: { select: { Subscriber: true } },
      },
    });

    // Sync RADIUS group attributes and RadiusGroup model if speed/data limit/sessions changed
    const speedChanged = body.downloadSpeed !== undefined || body.uploadSpeed !== undefined;
    const dataLimitChanged = body.dataLimitGb !== undefined;
    const sessionsChanged = body.maxConcurrentSessions !== undefined;
    if (speedChanged || dataLimitChanged || sessionsChanged) {
      const planWithGroup = await db.plan.findUnique({
        where: { id },
        include: { RadiusGroup: { select: { id: true, name: true } } },
      });
      const groupName = planWithGroup?.RadiusGroup?.name;
      if (groupName && planWithGroup?.RadiusGroup?.id) {
        try {
          const newDown = body.downloadSpeed ?? plan.downloadSpeed;
          const newUp = body.uploadSpeed ?? plan.uploadSpeed;
          const newDataLimitMb = body.dataLimitGb !== undefined
            ? (body.dataLimitGb ? Math.round(body.dataLimitGb * 1024) : null)
            : (plan.dataLimitGb ? Math.round(plan.dataLimitGb * 1024) : null);

          // Update RadiusGroup model fields to stay in sync with plan
          await db.radiusGroup.update({
            where: { id: planWithGroup.RadiusGroup.id },
            data: {
              ...(speedChanged && { speedLimitDown: newDown, speedLimitUp: newUp }),
              ...(dataLimitChanged && { dataLimit: newDataLimitMb }),
            },
          });

          // Sync to FreeRADIUS raw tables (radgroupreply, radgroupcheck)
          await syncGroupToFreeRADIUS(groupName, {
            downloadSpeed: newDown,
            uploadSpeed: newUp,
            dataLimitMb: newDataLimitMb ?? undefined,
            maxSessions: body.maxConcurrentSessions ?? plan.maxConcurrentSessions ?? 1,
          });
        } catch (radiusErr) {
          console.error("[Plan PUT] RADIUS group sync failed:", radiusErr);
        }
      }
    }

    await auditUpdate(req, "Plan", id, body, plan, { userId });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Plan PUT error:", error);
    return NextResponse.json({ error: "Failed to update plan" }, { status: 500 });
  }
}

// DELETE /api/plans/[id] — delete plan
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth(req);
    const { id } = await params;
    const plan = await db.plan.findUnique({ where: { id } });
    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    // Check if plan is in use
    const subscriberCount = await db.subscriber.count({ where: { planId: id } });
    if (subscriberCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete plan. ${subscriberCount} subscriber(s) are using this plan.` },
        { status: 400 }
      );
    }

    const deletedRecord = { ...plan };

    // Clean up FreeRADIUS group attributes and delete the RadiusGroup
    const planWithGroup = await db.plan.findUnique({
      where: { id },
      include: { RadiusGroup: { select: { id: true, name: true } } },
    });
    if (planWithGroup?.RadiusGroup) {
      try {
        await removeGroupFromFreeRADIUS(planWithGroup.RadiusGroup.name);
      } catch (radiusErr) {
        console.error("[Plan DELETE] RADIUS group cleanup failed:", radiusErr);
      }
    }

    const radiusGroupId = plan.groupId;
    await db.plan.delete({ where: { id } });

    // Delete the auto-created RadiusGroup if it exists and no other plan references it
    if (radiusGroupId) {
      const otherPlans = await db.plan.count({ where: { groupId: radiusGroupId } });
      if (otherPlans === 0) {
        try {
          await db.radiusGroup.delete({ where: { id: radiusGroupId } });
        } catch (rgErr) {
          console.error("[Plan DELETE] RadiusGroup cleanup failed:", rgErr);
        }
      }
    }
    await auditDelete(req, "Plan", id, deletedRecord, { userId });
    return NextResponse.json({ message: "Plan deleted" });
  } catch (error) {
    console.error("Plan DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete plan" }, { status: 500 });
  }
}
