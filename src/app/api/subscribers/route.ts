import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { fireEventAsync } from "@/lib/services/webhook-service";
import { generateSecurePassword } from "@/lib/session";
import { auditCreate } from "@/lib/services/audit-service";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { isValidIPv6, isValidIPv6Prefix, isValidIPv6PrefixLength, isValidDUID, isValidAssignmentMode } from "@/lib/validators/ipv6";
import { syncUserToFreeRADIUS, removeUserFromFreeRADIUS } from "@/lib/radius-sync";

// GET /api/subscribers — list with search, filters, pagination, sorting
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";
    const areaId = searchParams.get("areaId") || "";
    const planId = searchParams.get("planId") || "";
    const connectionType = searchParams.get("connectionType") || "";
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") || "desc";
    const radiusFilter = searchParams.get("radiusFilter") || ""; // "enabled" | "disabled" | ""

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
        { code: { contains: search } },
        { serviceUsername: { contains: search } },
      ];
    }
    if (status) where.status = status;
    if (areaId) where.areaId = areaId;
    if (planId) where.planId = planId;
    if (connectionType) where.connectionType = connectionType;
    if (radiusFilter === "enabled") where.radiusEnabled = true;
    if (radiusFilter === "disabled") where.radiusEnabled = false;

    // Build orderBy from sortBy/sortOrder params
    const allowedSortFields = [
      "createdAt", "name", "code", "phone", "status", "connectionType", "balance",
    ];
    const field = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";
    const direction = sortOrder === "asc" ? "asc" : "desc";
    const orderBy = { [field]: direction };

    const [subscribers, total] = await Promise.all([
      db.subscriber.findMany({
        where,
        select: {
          id: true, code: true, name: true, email: true, phone: true,
          address: true, status: true, connectionType: true, balance: true,
          createdAt: true, updatedAt: true,
          serviceUsername: true, radiusEnabled: true, radiusGroupId: true,
          sessionTimeout: true, idleTimeout: true,
          lastAuthAt: true, lastAuthResult: true,
          ipStackType: true, ipv6Address: true, ipv6Prefix: true,
          ipv6PrefixLength: true, ipv6Duid: true, ipv6AssignmentMode: true,
          Area: { select: { id: true, name: true } },
          Plan: {
            select: {
              id: true, name: true, priceMonthly: true,
              RadiusGroup: { select: { id: true, name: true } },
            },
          },
          RadiusGroup: { select: { id: true, name: true } },
          RadiusUser: { select: { id: true, _count: { select: { RadiusSession: { where: { stopTime: null } } } } } },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.subscriber.count({ where }),
    ]);

    // Compute status counts in parallel
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const [activeCount, newThisMonth, suspendedCount, trialCount] = await Promise.all([
      db.subscriber.count({ where: { status: "ACTIVE" } }),
      db.subscriber.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      db.subscriber.count({ where: { status: "SUSPENDED" } }),
      db.subscriber.count({ where: { status: "TRIAL" } }),
    ]);

    return NextResponse.json({
      subscribers: subscribers.map((s) => ({
        ...s,
        area: s.Area,
        plan: s.Plan,
        radiusGroup: s.RadiusGroup,
        radiusUser: s.RadiusUser,
        Area: undefined,
        Plan: undefined,
        RadiusGroup: undefined,
        RadiusUser: undefined,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
      stats: { activeCount, newThisMonth, suspendedCount, trialCount },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Subscribers GET error:", error);
    return NextResponse.json({ error: "Failed to fetch subscribers" }, { status: 500 });
  }
}

// POST /api/subscribers — create subscriber (full registration)
export async function POST(req: NextRequest) {
  try {
    let userId: string | undefined;
    try {
      userId = await requireAuth(req);
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
      throw e;
    }
    if (!userId) return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    const body = await req.json();
    const {
      name, phone, email, altPhone,
      areaId, planId, connectionType,
      address, landmark, pincode,
      serviceUsername, servicePassword,
      ipType, ipAddress, macAddress,
      assignedDeviceId,
      gstin, panNumber,
      kycAadhaarNumber, kycVerified, kycDocPath, profilePhotoPath,
      activationDate, billingStartDate,
      notes, internalNotes,
      referredById,
      routerRented, routerSerial, routerDeposit,
      generateInvoice,
      loginRestriction, // "all" | "subnet" | "specific"
      loginSubnetId,     // areaId for subnet restriction
      loginSpecificIp,   // specific IP for restriction
      radiusEnabled,
      radiusGroupId,
      sessionTimeout,
      idleTimeout,
      ipStackType,
      ipv6Address,
      ipv6Prefix,
      ipv6PrefixLength,
      ipv6Duid,
      ipv6AssignmentMode,
      ipv6PoolId,
    } = body;

    if (!name || !phone) {
      return NextResponse.json({ error: "Name and phone are required" }, { status: 400 });
    }

    // Validate phone format (Indian phone: 10 digits)
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(phone)) {
      return NextResponse.json({ error: "Invalid phone number. Must be 10 digits starting with 6-9" }, { status: 400 });
    }

    // Validate email if provided
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
      }
    }

    // Validate MAC address if provided
    if (macAddress) {
      const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
      if (!macRegex.test(macAddress)) {
        return NextResponse.json({ error: "Invalid MAC address format (e.g., AA:BB:CC:DD:EE:FF)" }, { status: 400 });
      }
    }

    // Validate ipStackType if provided
    if (ipStackType && !["IPV4_ONLY", "DUAL_STACK", "IPV6_ONLY"].includes(ipStackType)) {
      return NextResponse.json({ success: false, error: "Invalid IP stack type. Must be IPV4_ONLY, DUAL_STACK, or IPV6_ONLY" }, { status: 400 });
    }

    // B1 FIX: Skip ALL IPv6 validation when ipStackType is IPV4_ONLY (or not provided, which defaults to IPV4_ONLY)
    const effectiveIpStackType = (ipStackType || "IPV4_ONLY");
    if (effectiveIpStackType !== "IPV4_ONLY") {
      // Only validate IPv6 fields for DUAL_STACK or IPV6_ONLY
      if (ipv6Address && !isValidIPv6(ipv6Address)) {
        return NextResponse.json({ success: false, error: "Invalid IPv6 address format" }, { status: 400 });
      }
      if (ipv6Prefix && !isValidIPv6Prefix(ipv6Prefix)) {
        return NextResponse.json({ success: false, error: "Invalid IPv6 prefix format. Expected CIDR notation (e.g., 2001:db8::/64)" }, { status: 400 });
      }
      if (ipv6PrefixLength != null && !isValidIPv6PrefixLength(Number(ipv6PrefixLength))) {
        return NextResponse.json({ success: false, error: "Invalid IPv6 prefix length. Allowed values: 48, 56, 60, 64, 80, 96, 112, 120, 128" }, { status: 400 });
      }
      if (ipv6Duid && !isValidDUID(ipv6Duid)) {
        return NextResponse.json({ success: false, error: "Invalid DHCPv6 DUID format. Expected hex byte pairs separated by colons (e.g., 00:03:00:01:aa:bb:cc:dd:ee)" }, { status: 400 });
      }
      if (ipv6AssignmentMode && !isValidAssignmentMode(ipv6AssignmentMode)) {
        return NextResponse.json({ success: false, error: "Invalid IPv6 assignment mode. Must be SLAAC, DHCPV6, STATIC, or PD_ONLY" }, { status: 400 });
      }
    }

    // Generate subscriber code (use MAX code number to avoid collisions after deletions)
    const maxCodeResult = await db.$queryRawUnsafe(`SELECT MAX(code) as max_code FROM "Subscriber" WHERE code LIKE 'CRY%'`);
    let nextCodeNum = 1;
    const maxCodeVal = (maxCodeResult as any[])[0]?.max_code;
    if (maxCodeVal) {
      const match = maxCodeVal.match(/CRY(\d+)/);
      if (match) nextCodeNum = parseInt(match[1], 10) + 1;
    }
    const code = `CRY${String(nextCodeNum).padStart(5, "0")}`;

    // Validate serviceUsername format (alphanumeric, dashes, underscores, dots only)
    const usernameRegex = /^[a-zA-Z0-9._-]+$/;
    if (serviceUsername && !usernameRegex.test(serviceUsername.trim())) {
      return NextResponse.json({ error: "Invalid service username. Only alphanumeric characters, dots, dashes, and underscores are allowed." }, { status: 400 });
    }

    // Use custom service username or auto-generate
    const finalServiceUsername = serviceUsername?.trim()
      ? serviceUsername.trim()
      : `${name.toLowerCase().replace(/\s+/g, "")}${code}`;

    // Check for duplicate service username
    const existingByUsername = await db.subscriber.findUnique({ where: { serviceUsername: finalServiceUsername } });
    if (existingByUsername) {
      return NextResponse.json({ error: "Service username already exists. Choose a different one." }, { status: 409 });
    }

    // Check for duplicate phone
    const existingPhone = await db.subscriber.findFirst({ where: { phone } });
    if (existingPhone) {
      return NextResponse.json({ error: `Phone number already registered under subscriber ${existingPhone.code} (${existingPhone.name})` }, { status: 409 });
    }

    // Get plan details if planId provided
    let plan: any = null;
    if (planId) {
      plan = await db.plan.findUnique({ where: { id: planId } });
    }

    // Validate radiusGroupId if provided
    if (radiusGroupId) {
      const group = await db.radiusGroup.findUnique({ where: { id: radiusGroupId } });
      if (!group) {
        return NextResponse.json({ error: "RADIUS group not found" }, { status: 404 });
      }
    }

    // Generate password
    const radiusPassword = servicePassword?.trim() || generateSecurePassword(16);

    const shouldEnableRadius = radiusEnabled === true;

    const subscriber = await db.subscriber.create({
      data: {
        code,
        name,
        phone,
        email: email || "",
        altPhone: altPhone || "",
        areaId: areaId || null,
        planId: planId || null,
        connectionType: connectionType || "FTTH",
        address: address || "",
        landmark: landmark || "",
        pincode: pincode || "",
        serviceUsername: finalServiceUsername,
        servicePassword: radiusPassword,
        ipType: ipType || "DYNAMIC",
        ipAddress: ipType === "STATIC" ? (ipAddress || "") : "",
        macAddress: macAddress || "",
        assignedDeviceId: assignedDeviceId || null,
        gstin: gstin || "",
        panNumber: panNumber || "",
        kycAadhaarNumber: kycAadhaarNumber || "",
        kycDocPath: kycDocPath || "",
        profilePhotoPath: profilePhotoPath || "",
        kycVerified: kycVerified || false,
        activationDate: activationDate ? new Date(activationDate) : (planId ? new Date() : null),
        billingStartDate: billingStartDate ? new Date(billingStartDate) : (planId ? new Date() : null),
        notes: notes || "",
        internalNotes: internalNotes || "",
        referredById: referredById || null,
        routerRented: routerRented || false,
        routerSerial: routerSerial || "",
        routerDeposit: routerDeposit ? parseFloat(String(routerDeposit)) : 0,
        status: planId ? "ACTIVE" : "PENDING_ACTIVATION",
        radiusEnabled: shouldEnableRadius,
        radiusGroupId: radiusGroupId || null,
        sessionTimeout: sessionTimeout || null,
        idleTimeout: idleTimeout || null,
        ipStackType: effectiveIpStackType as any,
        // B1 FIX: For IPV4_ONLY, explicitly clear all IPv6 fields to prevent any downstream processing
        ipv6Address: effectiveIpStackType === "IPV4_ONLY" ? "" : (ipv6Address || ""),
        ipv6Prefix: effectiveIpStackType === "IPV4_ONLY" ? "" : (ipv6Prefix || ""),
        ipv6PrefixLength: effectiveIpStackType === "IPV4_ONLY" ? 64 : (parseInt(ipv6PrefixLength) || 64),
        ipv6Duid: effectiveIpStackType === "IPV4_ONLY" ? "" : (ipv6Duid || ""),
        ipv6AssignmentMode: effectiveIpStackType === "IPV4_ONLY" ? "" : (ipv6AssignmentMode || "SLAAC"),
        ipv6PoolId: effectiveIpStackType === "IPV4_ONLY" ? null : (ipv6PoolId || null),
      },
      include: {
        Area: { select: { id: true, name: true } },
        Plan: {
          select: {
            id: true, name: true, priceMonthly: true, downloadSpeed: true, uploadSpeed: true,
            RadiusGroup: { select: { id: true, name: true } },
          },
        },
        RadiusGroup: { select: { id: true, name: true } },
      },
    });

    // Fire webhook event
    fireEventAsync("subscriber.created", {
      subscriberId: subscriber.id,
      subscriberCode: subscriber.code,
      subscriberName: subscriber.name,
      phone: subscriber.phone,
      email: subscriber.email,
      plan: subscriber.Plan?.name,
      area: subscriber.Area?.name,
      status: subscriber.status,
    });

    // Create corresponding RADIUS user record AND sync to FreeRADIUS tables
    // Only sync RADIUS when a plan is assigned (no plan = no group/rate-limit to apply)
    if (shouldEnableRadius && planId) {
      try {
        await db.radiusUser.create({
          data: {
            subscriberId: subscriber.id,
          },
        });

        // Determine RADIUS group name
        let radiusGroupName: string | null = null;
        if (radiusGroupId) {
          const rg = await db.radiusGroup.findUnique({ where: { id: radiusGroupId }, select: { name: true } });
          radiusGroupName = rg?.name || null;
        } else if (subscriber.radiusGroupId) {
          const rg = await db.radiusGroup.findUnique({ where: { id: subscriber.radiusGroupId }, select: { name: true } });
          radiusGroupName = rg?.name || null;
        } else if (plan?.groupId) {
          const rg = await db.radiusGroup.findUnique({ where: { id: plan.groupId }, select: { name: true } });
          radiusGroupName = rg?.name || null;
        }

        // Get max concurrent sessions from plan
        const maxSessions = plan?.maxConcurrentSessions || 1;

        // Build rate limit string from plan speeds as fallback
        // (in case group's radgroupreply doesn't have Mikrotik-Rate-Limit)
        let fallbackRateLimit: string | null = null;
        if (plan?.downloadSpeed && plan?.uploadSpeed) {
          fallbackRateLimit = `${plan.downloadSpeed}M/${plan.uploadSpeed}M`;
        }

        // Sync to FreeRADIUS tables (radcheck, radreply, radusergroup)
        await syncUserToFreeRADIUS(
          finalServiceUsername,
          radiusPassword,
          radiusGroupName,
          maxSessions,
          fallbackRateLimit
        );
      } catch (radiusError) {
        console.error("[Subscribers] Failed to sync RADIUS:", radiusError);
      }
    }

    // Auto-generate first invoice if requested and plan is assigned
    if (generateInvoice && planId && plan) {
      try {
        const cgst = (plan.priceMonthly * (plan.cgstPercent || 9)) / 100;
        const sgst = (plan.priceMonthly * (plan.sgstPercent || 9)) / 100;
        const total = plan.priceMonthly + cgst + sgst;

        await db.invoice.create({
          data: {
            subscriberId: subscriber.id,
            planId: plan.id,
            invoiceNumber: `INV-${code}-001`,
            issueDate: new Date(),
            dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
            periodStart: subscriber.billingStartDate || new Date(),
            periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            description: `First bill — ${plan.name} (activation)`,
            subtotal: plan.priceMonthly,
            cgstAmount: cgst,
            sgstAmount: sgst,
            igstAmount: 0,
            totalTax: cgst + sgst,
            totalAmount: total,
            grandTotal: total,
            balanceAmount: total,
            status: "DRAFT",
          },
        });
      } catch (invoiceError) {
        console.error("[Subscribers] Failed to auto-generate invoice:", invoiceError);
      }
    }

    // Store login restriction in notes if provided (schema doesn't have dedicated field)
    if (loginRestriction && loginRestriction !== "all") {
      const restriction = loginRestriction === "subnet"
        ? `LOGIN_RESTRICTION: subnet=${loginSubnetId || "N/A"}`
        : `LOGIN_RESTRICTION: ip=${loginSpecificIp || "N/A"}`;
      await db.subscriber.update({
        where: { id: subscriber.id },
        data: { internalNotes: [subscriber.internalNotes, restriction].filter(Boolean).join("\n") },
      });
    }

    await auditCreate(req, "Subscriber", subscriber.id, {
      name, phone, status: subscriber.status, planId,
      serviceUsername: finalServiceUsername,
      ipType: ipType || "DYNAMIC",
      generateInvoice: !!generateInvoice,
      radiusEnabled: shouldEnableRadius,
    }, { userId });

    // Return subscriber with the generated password so the UI can show it
    // Strip sensitive fields from the response
    const { servicePassword: _svcPwd, kycAadhaarNumber: _kycAadhaar, panNumber: _pan, ...safeSubscriber } = subscriber;
    return NextResponse.json({
      ...safeSubscriber,
      generatedPassword: radiusPassword,
      generatedUsername: finalServiceUsername,
    }, { status: 201 });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    // Handle Prisma unique constraint violations (P2002) — e.g. code collision from stale data
    if (error?.code === 'P2002') {
      const target = (error.meta?.target as string[]) || [];
      const field = target.includes('code') ? 'Subscriber code' : target.includes('serviceUsername') ? 'Service username' : target.includes('phone') ? 'Phone number' : 'Record';
      return NextResponse.json({ error: `${field} already exists. Please try again.` }, { status: 409 });
    }
    console.error("Subscribers POST error:", error);
    return NextResponse.json({ error: "Failed to create subscriber" }, { status: 500 });
  }
}
