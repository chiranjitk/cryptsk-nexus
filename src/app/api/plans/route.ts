import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { auditCreate } from "@/lib/services/audit-service";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { isValidAssignmentMode } from "@/lib/validators/ipv6";
import { syncGroupToFreeRADIUS } from "@/lib/radius-sync";

// GET /api/plans — list all plans with pagination
export async function GET(req: NextRequest) {
  try {
    try {
      await requireAuth(req);
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
      throw e;
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
  }
  try {
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const search = url.searchParams.get("search") || "";
    const category = url.searchParams.get("category") || "";
    const status = url.searchParams.get("status") || "";

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } },
      ];
    }
    if (category) where.category = category;
    if (status) where.status = status;

    const [plans, total] = await Promise.all([
      db.plan.findMany({
        where,
        include: {
          _count: { select: { Subscriber: true } },
          RadiusGroup: true,
          SurfingQuotaPolicy: { select: { id: true, name: true, quotaType: true, allottedMinutes: true, expiryDays: true, cycleType: true } },
          AccessTimePolicy: { select: { id: true, name: true, defaultStrategy: true, _count: { select: { slots: true } } } },
          BandwidthPolicy: { select: { id: true, name: true, downloadKbps: true, uploadKbps: true, policyType: true, policyFor: true } },
          DataTransferPolicy: { select: { id: true, name: true, scheme: true, totalLimitMb: true, cycleType: true } },
          FairAccessPolicy: { select: { id: true, name: true, fapType: true, dataOn: true, limitMb: true } },
          IpPool: { select: { id: true, name: true, cidr: true, frPoolName: true } },
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.plan.count({ where }),
    ]);

    return NextResponse.json({ items: plans, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("Plans GET error:", error);
    return NextResponse.json({ error: "Failed to fetch plans" }, { status: 500 });
  }
}

// POST /api/plans — create plan
export async function POST(req: NextRequest) {
  try {
    let userId: string | undefined;
    try {
      ({ userId } = await requireAuth(req));
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
      throw e;
    }
    if (!userId) return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    const body = await req.json();
    const {
      name, description, category, downloadSpeed, uploadSpeed,
      speedUnit, priceMonthly, priceQuarterly, priceHalfYearly, priceYearly,
      installationCharge, securityDeposit, routerRental,
      validityDays, cgstPercent, sgstPercent, igstPercent,
      dataLimitGb, contentionRatio, isPopular, sortOrder,
      downloadSpeedFup, uploadSpeedFup,
      burstSpeed, burstDuration, maxConcurrentSessions,
      freeTrialDays, slaUptime,
      ipv6Enabled, ipv6PrefixDelegation, ipv6DefaultPoolId, ipv6AssignmentMode,
      surfingQuotaPolicyId, accessTimePolicyId, bandwidthPolicyId, dataTransferPolicyId, fairAccessPolicyId,
      // POL-ENGINE-2: package form fields
      billingScheme, availableFor, onlinePurchaseable,
      discountAmount, discountIsPercent,
      macBinding, priority, idleTimeoutType, idleTimeoutMin,
      expiryBasis, fixedExpiryAt, expireTimeOfDay,
      ipPoolId,
      cycleType, billingDay, cycleMultiplier, cycleAmountBasis, quotaChargeBasis, cyclePrice, cycleDays,
    } = body;

    if (!name) {
      return NextResponse.json({ error: "Plan name is required" }, { status: 400 });
    }
    if (!downloadSpeed || downloadSpeed <= 0) {
      return NextResponse.json({ error: "Download speed must be greater than 0" }, { status: 400 });
    }
    if (!priceMonthly || priceMonthly < 0) {
      return NextResponse.json({ error: "Monthly price must be 0 or greater" }, { status: 400 });
    }

    // IPv6 validation
    if (ipv6AssignmentMode && ipv6AssignmentMode.trim() !== "" && !isValidAssignmentMode(ipv6AssignmentMode)) {
      return NextResponse.json({ success: false, error: "Invalid IPv6 assignment mode. Must be one of: SLAAC, DHCPV6, STATIC, PD_ONLY" }, { status: 400 });
    }

    // POL-ENGINE-2: enum whitelists + normalization
    const BILLING_SCHEMES = ["PREPAID", "POSTPAID"];
    const IDLE_TIMEOUT_TYPES = ["NONE", "LIVE_REQUEST", "DATA_TRANSFER"];
    const EXPIRY_BASES = ["GLOBAL", "FIXED_DATE", "FIXED_DATETIME"];
    const PLAN_CYCLE_TYPES = ["NONE", "WEEKLY", "MONTHLY"];
    const CYCLE_AMOUNT_BASES = ["ACTUAL_DAYS", "FULL_AMOUNT"];
    if (billingScheme && !BILLING_SCHEMES.includes(String(billingScheme).toUpperCase())) {
      return NextResponse.json({ success: false, error: "Invalid billing scheme. Must be PREPAID or POSTPAID" }, { status: 400 });
    }
    if (idleTimeoutType && !IDLE_TIMEOUT_TYPES.includes(String(idleTimeoutType).toUpperCase())) {
      return NextResponse.json({ success: false, error: "Invalid idle timeout type" }, { status: 400 });
    }
    if (expiryBasis && !EXPIRY_BASES.includes(String(expiryBasis).toUpperCase())) {
      return NextResponse.json({ success: false, error: "Invalid expiry basis" }, { status: 400 });
    }
    if (cycleType && !PLAN_CYCLE_TYPES.includes(String(cycleType).toUpperCase())) {
      return NextResponse.json({ success: false, error: "Invalid billing cycle type" }, { status: 400 });
    }
    if (cycleAmountBasis && !CYCLE_AMOUNT_BASES.includes(String(cycleAmountBasis).toUpperCase())) {
      return NextResponse.json({ success: false, error: "Invalid cycle amount basis" }, { status: 400 });
    }
    if (quotaChargeBasis && !CYCLE_AMOUNT_BASES.includes(String(quotaChargeBasis).toUpperCase())) {
      return NextResponse.json({ success: false, error: "Invalid quota charge basis" }, { status: 400 });
    }
    const availFor = Array.isArray(availableFor)
      ? availableFor.filter((t: string) => ["REGISTRATION", "RENEWAL"].includes(t)).join(",")
      : typeof availableFor === "string" && availableFor
        ? availableFor.split(",").map((t: string) => t.trim()).filter((t: string) => ["REGISTRATION", "RENEWAL"].includes(t)).join(",")
        : "";
    const fixedExpiry = fixedExpiryAt ? new Date(fixedExpiryAt) : null;
    if (fixedExpiry && isNaN(fixedExpiry.getTime())) {
      return NextResponse.json({ success: false, error: "Invalid fixed expiry date" }, { status: 400 });
    }

    // Destructure groupId from body (user may or may not provide it)
    const { groupId } = body;

    const plan = await db.plan.create({
      data: {
        name,
        description: description || "",
        category: category || "FTTH",
        downloadSpeed: downloadSpeed,
        uploadSpeed: uploadSpeed || downloadSpeed,
        speedUnit: (speedUnit || "MBPS").toUpperCase(),
        priceMonthly: priceMonthly || 0,
        priceQuarterly: priceQuarterly || null,
        priceHalfYearly: priceHalfYearly || null,
        priceYearly: priceYearly || null,
        installationCharge: installationCharge || 0,
        securityDeposit: securityDeposit || 0,
        routerRental: routerRental || 0,
        validityDays: validityDays || 30,
        cgstPercent: cgstPercent ?? 9,
        sgstPercent: sgstPercent ?? 9,
        igstPercent: igstPercent ?? 0,
        dataLimitGb: dataLimitGb || null,
        contentionRatio: contentionRatio || "1:10",
        isPopular: isPopular || false,
        sortOrder: sortOrder ?? 0,
        downloadSpeedFup: downloadSpeedFup || null,
        uploadSpeedFup: uploadSpeedFup || null,
        burstSpeed: burstSpeed || null,
        burstDuration: burstDuration || null,
        maxConcurrentSessions: maxConcurrentSessions ?? 1,
        freeTrialDays: freeTrialDays ?? 0,
        slaUptime: slaUptime ?? 99.5,
        status: "ACTIVE",
        groupId: groupId || null,
        ipv6Enabled: ipv6Enabled || false,
        ipv6PrefixDelegation: ipv6PrefixDelegation || false,
        ipv6DefaultPoolId: ipv6DefaultPoolId || null,
        ipv6AssignmentMode: ipv6AssignmentMode || "SLAAC",
        surfingQuotaPolicyId: surfingQuotaPolicyId || null,
        accessTimePolicyId: accessTimePolicyId || null,
        bandwidthPolicyId: bandwidthPolicyId || null,
        dataTransferPolicyId: dataTransferPolicyId || null,
        fairAccessPolicyId: fairAccessPolicyId || null,
        // POL-ENGINE-2: package form fields
        billingScheme: billingScheme ? String(billingScheme).toUpperCase() : "PREPAID",
        availableFor: availFor || "REGISTRATION,RENEWAL",
        onlinePurchaseable: onlinePurchaseable !== undefined ? Boolean(onlinePurchaseable) : true,
        discountAmount: discountAmount != null && !isNaN(Number(discountAmount)) ? Number(discountAmount) : 0,
        discountIsPercent: Boolean(discountIsPercent),
        macBinding: Boolean(macBinding),
        priority: priority != null && priority !== "" ? Number(priority) : null,
        idleTimeoutType: idleTimeoutType ? String(idleTimeoutType).toUpperCase() : "NONE",
        idleTimeoutMin: idleTimeoutMin != null && idleTimeoutMin !== "" ? Number(idleTimeoutMin) : null,
        expiryBasis: expiryBasis ? String(expiryBasis).toUpperCase() : "GLOBAL",
        fixedExpiryAt: fixedExpiry,
        expireTimeOfDay: expireTimeOfDay ? String(expireTimeOfDay) : "23:59:59",
        ipPoolId: ipPoolId || null,
        cycleType: cycleType ? String(cycleType).toUpperCase() : "NONE",
        billingDay: billingDay != null && billingDay !== "" ? Number(billingDay) : null,
        cycleMultiplier: cycleMultiplier != null && cycleMultiplier !== "" ? Number(cycleMultiplier) : null,
        cycleAmountBasis: cycleAmountBasis ? String(cycleAmountBasis).toUpperCase() : "ACTUAL_DAYS",
        quotaChargeBasis: quotaChargeBasis ? String(quotaChargeBasis).toUpperCase() : "ACTUAL_DAYS",
        cyclePrice: cyclePrice != null && cyclePrice !== "" ? Number(cyclePrice) : null,
        cycleDays: cycleDays != null && cycleDays !== "" ? Number(cycleDays) : null,
      },
      include: {
        _count: { select: { Subscriber: true } },
        RadiusGroup: true,
        IpPool: { select: { id: true, name: true, cidr: true, frPoolName: true } },
      },
    });

    // Auto-create RadiusGroup if no groupId was provided
    if (!groupId) {
      try {
        const groupName = name;
        const groupDescription = `Auto-generated for plan: ${name}`;
        const dataLimitMb = dataLimitGb ? Math.round(dataLimitGb * 1024) : null;

        const group = await db.radiusGroup.create({
          data: {
            name: groupName,
            description: groupDescription,
            speedLimitDown: downloadSpeed,
            speedLimitUp: uploadSpeed || downloadSpeed,
            dataLimit: dataLimitMb,
            framedIpv6Pool: ipv6Enabled ? (ipv6DefaultPoolId || "auto") : "",
            delegatedIpv6PrefixPool: ipv6PrefixDelegation ? "auto" : "",
          },
        });

        // Link the plan to the newly created group
        const updatedPlan = await db.plan.update({
          where: { id: plan.id },
          data: { groupId: group.id },
          include: {
            _count: { select: { Subscriber: true } },
            RadiusGroup: true,
            IpPool: { select: { id: true, name: true, cidr: true, frPoolName: true } },
          },
        });

        // Sync RADIUS group attributes to FreeRADIUS tables (radgroupreply, radgroupcheck)
        await syncGroupToFreeRADIUS(group.name, {
          downloadSpeed,
          uploadSpeed: uploadSpeed || downloadSpeed,
          burstSpeed: burstSpeed || null,
          burstDuration: burstDuration || null,
          dataLimitGb: dataLimitGb || null,
          maxSessions: maxConcurrentSessions ?? 1,
          validityDays: validityDays || 30,
          downloadSpeedFup: downloadSpeedFup || null,
          uploadSpeedFup: uploadSpeedFup || null,
          contentionRatio: contentionRatio || null,
          ipv6Enabled: ipv6Enabled || false,
          ipv6PrefixDelegation: ipv6PrefixDelegation || false,
          ipv6DefaultPoolId: ipv6DefaultPoolId || null,
        });

        await auditCreate(req, "Plan", updatedPlan.id, { name, priceMonthly, speed: `${downloadSpeed} ${speedUnit}`, billingScheme: billingScheme || "PREPAID", autoGroup: group.name, policies: { surfingQuotaPolicyId, accessTimePolicyId, bandwidthPolicyId, dataTransferPolicyId, fairAccessPolicyId } }, { userId });
        return NextResponse.json(updatedPlan, { status: 201 });
      } catch (groupError: any) {
        // If group name already exists (unique constraint), return plan without group
        if (groupError?.code === "P2002") {
          console.warn(`RadiusGroup "${name}" already exists, plan created without auto-linking.`);
          await auditCreate(req, "Plan", plan.id, { name, priceMonthly, speed: `${downloadSpeed} ${speedUnit}`, autoGroupWarning: "Group name conflict" }, { userId });
          return NextResponse.json(plan, { status: 201 });
        }
        throw groupError;
      }
    }

    await auditCreate(req, "Plan", plan.id, { name, priceMonthly, speed: `${downloadSpeed} ${speedUnit}` }, { userId });
    return NextResponse.json(plan, { status: 201 });
  } catch (error) {
    console.error("Plans POST error:", error);
    return NextResponse.json({ error: "Failed to create plan" }, { status: 500 });
  }
}
