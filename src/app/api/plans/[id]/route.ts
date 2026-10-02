import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { auditUpdate, auditDelete } from "@/lib/services/audit-service";
import { requireAuth, AuthError } from "@/lib/api-auth";
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
        SurfingQuotaPolicy: { select: { id: true, name: true, quotaType: true, allottedMinutes: true, expiryDays: true, cycleType: true } },
        AccessTimePolicy: { select: { id: true, name: true, defaultStrategy: true, _count: { select: { slots: true } } } },
        BandwidthPolicy: { select: { id: true, name: true, downloadKbps: true, uploadKbps: true, policyType: true, policyFor: true } },
        DataTransferPolicy: { select: { id: true, name: true, scheme: true, totalLimitMb: true, cycleType: true } },
        FairAccessPolicy: { select: { id: true, name: true, fapType: true, dataOn: true, limitMb: true } },
        IpPool: { select: { id: true, name: true, cidr: true, frPoolName: true } },
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
    let userId: string | undefined;
    try {
      ({ userId } = await requireAuth(req));
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
      throw e;
    }
    if (!userId) return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
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
        // POL-ENGINE-1 policy bindings (empty string / null unbinds)
        ...(body.surfingQuotaPolicyId !== undefined && { surfingQuotaPolicyId: body.surfingQuotaPolicyId || null }),
        ...(body.accessTimePolicyId !== undefined && { accessTimePolicyId: body.accessTimePolicyId || null }),
        ...(body.bandwidthPolicyId !== undefined && { bandwidthPolicyId: body.bandwidthPolicyId || null }),
        ...(body.dataTransferPolicyId !== undefined && { dataTransferPolicyId: body.dataTransferPolicyId || null }),
        ...(body.fairAccessPolicyId !== undefined && { fairAccessPolicyId: body.fairAccessPolicyId || null }),
        // POL-ENGINE-2: package form fields (empty string / null unbinds where applicable)
        ...(body.billingScheme !== undefined && { billingScheme: String(body.billingScheme).toUpperCase() === "POSTPAID" ? "POSTPAID" : "PREPAID" }),
        ...(body.availableFor !== undefined && {
          availableFor: Array.isArray(body.availableFor)
            ? body.availableFor.filter((t: string) => ["REGISTRATION", "RENEWAL"].includes(t)).join(",")
            : String(body.availableFor || "").split(",").map((t: string) => t.trim()).filter((t: string) => ["REGISTRATION", "RENEWAL"].includes(t)).join(","),
        }),
        ...(body.onlinePurchaseable !== undefined && { onlinePurchaseable: Boolean(body.onlinePurchaseable) }),
        ...(body.discountAmount !== undefined && { discountAmount: Number(body.discountAmount) || 0 }),
        ...(body.discountIsPercent !== undefined && { discountIsPercent: Boolean(body.discountIsPercent) }),
        ...(body.macBinding !== undefined && { macBinding: Boolean(body.macBinding) }),
        ...(body.priority !== undefined && { priority: body.priority === null || body.priority === "" ? null : Number(body.priority) }),
        ...(body.idleTimeoutType !== undefined && { idleTimeoutType: ["NONE", "LIVE_REQUEST", "DATA_TRANSFER"].includes(String(body.idleTimeoutType).toUpperCase()) ? String(body.idleTimeoutType).toUpperCase() : "NONE" }),
        ...(body.idleTimeoutMin !== undefined && { idleTimeoutMin: body.idleTimeoutMin === null || body.idleTimeoutMin === "" ? null : Number(body.idleTimeoutMin) }),
        ...(body.expiryBasis !== undefined && { expiryBasis: ["GLOBAL", "FIXED_DATE", "FIXED_DATETIME"].includes(String(body.expiryBasis).toUpperCase()) ? String(body.expiryBasis).toUpperCase() : "GLOBAL" }),
        ...(body.fixedExpiryAt !== undefined && {
          fixedExpiryAt: body.fixedExpiryAt ? (isNaN(new Date(body.fixedExpiryAt).getTime()) ? null : new Date(body.fixedExpiryAt)) : null,
        }),
        ...(body.expireTimeOfDay !== undefined && { expireTimeOfDay: String(body.expireTimeOfDay || "23:59:59") }),
        ...(body.ipPoolId !== undefined && { ipPoolId: body.ipPoolId || null }),
        ...(body.cycleType !== undefined && { cycleType: ["NONE", "WEEKLY", "MONTHLY"].includes(String(body.cycleType).toUpperCase()) ? String(body.cycleType).toUpperCase() : "NONE" }),
        ...(body.billingDay !== undefined && { billingDay: body.billingDay === null || body.billingDay === "" ? null : Number(body.billingDay) }),
        ...(body.cycleMultiplier !== undefined && { cycleMultiplier: body.cycleMultiplier === null || body.cycleMultiplier === "" ? null : Number(body.cycleMultiplier) }),
        ...(body.cycleAmountBasis !== undefined && { cycleAmountBasis: ["ACTUAL_DAYS", "FULL_AMOUNT"].includes(String(body.cycleAmountBasis).toUpperCase()) ? String(body.cycleAmountBasis).toUpperCase() : "ACTUAL_DAYS" }),
        ...(body.quotaChargeBasis !== undefined && { quotaChargeBasis: ["ACTUAL_DAYS", "FULL_AMOUNT"].includes(String(body.quotaChargeBasis).toUpperCase()) ? String(body.quotaChargeBasis).toUpperCase() : "ACTUAL_DAYS" }),
        ...(body.cyclePrice !== undefined && { cyclePrice: body.cyclePrice === null || body.cyclePrice === "" ? null : Number(body.cyclePrice) }),
        ...(body.cycleDays !== undefined && { cycleDays: body.cycleDays === null || body.cycleDays === "" ? null : Number(body.cycleDays) }),
      },
      include: {
        _count: { select: { Subscriber: true } },
        SurfingQuotaPolicy: { select: { id: true, name: true, quotaType: true, allottedMinutes: true, expiryDays: true, cycleType: true } },
        AccessTimePolicy: { select: { id: true, name: true, defaultStrategy: true, _count: { select: { slots: true } } } },
        BandwidthPolicy: { select: { id: true, name: true, downloadKbps: true, uploadKbps: true, policyType: true, policyFor: true } },
        DataTransferPolicy: { select: { id: true, name: true, scheme: true, totalLimitMb: true, cycleType: true } },
        FairAccessPolicy: { select: { id: true, name: true, fapType: true, dataOn: true, limitMb: true } },
        IpPool: { select: { id: true, name: true, cidr: true, frPoolName: true } },
      },
    });

    // Sync RADIUS group attributes if ANY plan field that affects FreeRADIUS changed
    const radiusFields = [
      'downloadSpeed', 'uploadSpeed', 'burstSpeed', 'burstDuration',
      'dataLimitGb', 'maxConcurrentSessions', 'validityDays',
      'downloadSpeedFup', 'uploadSpeedFup', 'contentionRatio',
      'ipv6Enabled', 'ipv6PrefixDelegation', 'ipv6DefaultPoolId',
    ];
    const radiusChanged = radiusFields.some(f => body[f] !== undefined);
    if (radiusChanged) {
      const planWithGroup = await db.plan.findUnique({
        where: { id },
        include: { RadiusGroup: { select: { id: true, name: true } } },
      });
      const groupName = planWithGroup?.RadiusGroup?.name;
      if (groupName && planWithGroup?.RadiusGroup?.id) {
        try {
          // Use updated values, falling back to existing plan values
          const newDown = body.downloadSpeed ?? plan.downloadSpeed;
          const newUp = body.uploadSpeed ?? plan.uploadSpeed;
          const newDataLimitGb = body.dataLimitGb !== undefined
            ? (body.dataLimitGb || null)
            : plan.dataLimitGb;
          const newDataLimitMb = newDataLimitGb ? Math.round(newDataLimitGb * 1024) : null;

          // Update RadiusGroup model fields to stay in sync with plan
          await db.radiusGroup.update({
            where: { id: planWithGroup.RadiusGroup.id },
            data: {
              ...(body.downloadSpeed !== undefined && { speedLimitDown: newDown }),
              ...(body.uploadSpeed !== undefined && { speedLimitUp: newUp }),
              ...(body.dataLimitGb !== undefined && { dataLimit: newDataLimitMb }),
              ...(body.ipv6Enabled !== undefined && {
                framedIpv6Pool: body.ipv6Enabled ? (body.ipv6DefaultPoolId || plan.ipv6DefaultPoolId || "auto") : "",
              }),
              ...(body.ipv6PrefixDelegation !== undefined && {
                delegatedIpv6PrefixPool: body.ipv6PrefixDelegation ? "auto" : "",
              }),
            },
          });

          // Sync ALL plan fields to FreeRADIUS raw tables
          await syncGroupToFreeRADIUS(groupName, {
            downloadSpeed: newDown,
            uploadSpeed: newUp,
            burstSpeed: body.burstSpeed !== undefined ? (body.burstSpeed || null) : plan.burstSpeed,
            burstDuration: body.burstDuration !== undefined ? (body.burstDuration || null) : plan.burstDuration,
            dataLimitGb: newDataLimitGb ?? undefined,
            dataLimitMb: newDataLimitMb ?? undefined,
            maxSessions: body.maxConcurrentSessions ?? plan.maxConcurrentSessions ?? 1,
            validityDays: body.validityDays ?? plan.validityDays ?? 30,
            downloadSpeedFup: body.downloadSpeedFup !== undefined ? (body.downloadSpeedFup || null) : plan.downloadSpeedFup,
            uploadSpeedFup: body.uploadSpeedFup !== undefined ? (body.uploadSpeedFup || null) : plan.uploadSpeedFup,
            contentionRatio: body.contentionRatio ?? plan.contentionRatio ?? null,
            ipv6Enabled: body.ipv6Enabled ?? plan.ipv6Enabled ?? false,
            ipv6PrefixDelegation: body.ipv6PrefixDelegation ?? plan.ipv6PrefixDelegation ?? false,
            ipv6DefaultPoolId: body.ipv6DefaultPoolId ?? plan.ipv6DefaultPoolId ?? null,
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
    let userId: string | undefined;
    try {
      ({ userId } = await requireAuth(req));
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
      throw e;
    }
    if (!userId) return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
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
