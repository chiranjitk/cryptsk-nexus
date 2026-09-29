import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { Prisma } from "@prisma/client";

// GET /api/captive-portal — List all portals with filters
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const template = searchParams.get("template") || "";
    const loginMethod = searchParams.get("loginMethod") || "";
    const enabled = searchParams.get("enabled");
    const venueType = searchParams.get("venueType") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.CaptivePortalWhereInput = {};
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { siteName: { contains: search } },
        { description: { contains: search } },
      ];
    }
    if (template) where.template = template as any;
    if (loginMethod) where.loginMethod = loginMethod as any;
    if (enabled !== null && enabled !== undefined && enabled !== "") {
      where.enabled = enabled === "true";
    }
    if (venueType) where.venueType = venueType;

    const [portals, total] = await Promise.all([
      db.captivePortal.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          location: { select: { id: true, name: true } },
          partner: { select: { id: true, name: true } },
        },
      }),
      db.captivePortal.count({ where }),
    ]);

    // Get subnet and session counts via raw SQL
    const portalIds = portals.map((p) => `'${p.id}'`).join(",");
    let countsRaw: { portalId: string; subnetCount: number; sessionCount: number }[] = [];
    if (portalIds) {
      countsRaw = await db.$queryRawUnsafe(`
        SELECT
          cp."id" as portalId,
          (SELECT COUNT(*) FROM "DhcpSubnet" ds WHERE ds."captivePortalId" = CAST(cp."id" AS int)) as subnetCount,
          (SELECT COUNT(*) FROM "PortalSession" ps WHERE ps."portalId" = CAST(cp."id" AS int)) as sessionCount
        FROM "CaptivePortal" cp
        WHERE cp."id" IN (${portalIds})
      `);
    }
    const countsMap = new Map(
      countsRaw.map((c) => [
        c.portalId,
        { subnetCount: Number(c.subnetCount), sessionCount: Number(c.sessionCount) },
      ])
    );

    const data = portals.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      template: p.template,
      loginMethod: p.loginMethod,
      welcomeTitle: p.welcomeTitle,
      welcomeMessage: p.welcomeMessage,
      sessionTimeoutSec: p.sessionTimeoutSec,
      idleTimeoutSec: p.idleTimeoutSec,
      dataLimitMb: p.dataLimitMb,
      bandwidthLimitDown: p.bandwidthLimitDown,
      bandwidthLimitUp: p.bandwidthLimitUp,
      redirectUrl: p.redirectUrl,
      venueType: p.venueType,
      siteName: p.siteName,
      maxConcurrentSessions: p.maxConcurrentSessions,
      macAuthEnabled: p.macAuthEnabled,
      voucherRequired: p.voucherRequired,
      passthroughMode: p.passthroughMode,
      enabled: p.enabled,
      locationId: p.locationId,
      locationName: p.location?.name || null,
      partnerId: p.partnerId,
      partnerName: p.partner?.name || null,
      priority: p.priority,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      ...countsMap.get(p.id),
    }));

    return NextResponse.json({
      portals: data,
      pagination: { total, page, limit },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[CaptivePortal] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch portals" }, { status: 500 });
  }
}

// POST /api/captive-portal — Create a new portal
export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json();
    const { name } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Portal name is required" }, { status: 400 });
    }

    const portal = await db.captivePortal.create({
      data: {
        name: name.trim(),
        description: body.description || "",
        template: body.template || "ISP_DEFAULT",
        loginMethod: body.loginMethod || "RADIUS",
        theme: body.theme || "{}",
        welcomeTitle: body.welcomeTitle || "Welcome",
        welcomeMessage: body.welcomeMessage || "",
        tosText: body.tosText || "",
        successMessage: body.successMessage || "You are now connected!",
        timeoutMessage: body.timeoutMessage || "Your session has expired. Please login again.",
        dataCapMessage: body.dataCapMessage || "You have reached your data limit.",
        sessionTimeoutSec: body.sessionTimeoutSec || 86400,
        idleTimeoutSec: body.idleTimeoutSec || 3600,
        dataLimitMb: body.dataLimitMb ?? null,
        fapDataLimitMb: body.fapDataLimitMb ?? null,
        bandwidthLimitDown: body.bandwidthLimitDown || 0,
        bandwidthLimitUp: body.bandwidthLimitUp || 0,
        redirectUrl: body.redirectUrl || "",
        originalUrlParam: body.originalUrlParam || "original_url",
        allowedHosts: body.allowedHosts || "[]",
        enableCaptiveDetection: body.enableCaptiveDetection !== false,
        macAuthEnabled: body.macAuthEnabled || false,
        macAuthUnknownAction: body.macAuthUnknownAction || "DENY",
        socialProviders: body.socialProviders || "[]",
        voucherRequired: body.voucherRequired || false,
        voucherReusePolicy: body.voucherReusePolicy || "SINGLE_USE",
        interfaceId: body.interfaceId || null,
        locationId: body.locationId || null,
        siteName: body.siteName || "",
        venueType: body.venueType || "",
        maxConcurrentSessions: body.maxConcurrentSessions || 0,
        passthroughMode: body.passthroughMode || false,
        customLoginPageUrl: body.customLoginPageUrl || "",
        postLoginAdUrl: body.postLoginAdUrl || "",
        collectPhone: body.collectPhone || false,
        collectEmail: body.collectEmail || false,
        collectName: body.collectName || false,
        partnerId: body.partnerId || null,
        revenueSharePercent: body.revenueSharePercent || 0,
        priority: body.priority || 0,
        scheduleConfig: body.scheduleConfig || '{"enabled":false,"timeRanges":[]}',
        enabled: body.enabled !== undefined ? body.enabled : false,
      },
      include: {
        location: { select: { id: true, name: true } },
        partner: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ portal }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[CaptivePortal] POST error:", error);
    return NextResponse.json({ error: "Failed to create portal" }, { status: 500 });
  }
}
