import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { Prisma } from "@prisma/client";

// GET /api/captive-portal/[id] — Single portal detail
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(_req);
    const { id } = await params;

    const portal = await db.captivePortal.findUnique({
      where: { id },
      include: {
        location: { select: { id: true, name: true, code: true } },
        partner: { select: { id: true, name: true, phone: true } },
        interface: { select: { id: true, name: true, ip: true, type: true } },
        schedules: { orderBy: { createdAt: "desc" } },
        accessRules: { orderBy: { priority: "asc" } },
        macWhitelist: { orderBy: { createdAt: "desc" } },
        voucherPools: { orderBy: { createdAt: "desc" } },
        adZones: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!portal) {
      return NextResponse.json({ error: "Portal not found" }, { status: 404 });
    }

    // Get DHCP subnets and IPAM subnets
    const [dhcpSubnets, ipamSubnets] = await Promise.all([
      db.dhcpSubnet.findMany({
        where: { captivePortalId: id },
        select: { id: true, name: true, Subnet: true, interfaceName: true, enabled: true },
      }),
      db.subnet.findMany({
        where: { captivePortalId: id },
        select: { id: true, name: true, cidr: true, areaId: true, Area: { select: { name: true } } },
      }),
    ]);

    // Get session count via parameterized raw SQL
    const countsRaw: { totalSessions: number; activeSessions: number }[] = await db.$queryRaw`
      SELECT
        CAST(COUNT(*) AS int) as totalSessions,
        CAST(SUM(CASE WHEN "status" = 'ACTIVE' THEN 1 ELSE 0 END) AS int) as activeSessions
      FROM "PortalSession" WHERE "portalId" = ${id}
    `;
    const counts = countsRaw[0]
      ? { totalSessions: Number(countsRaw[0].totalSessions), activeSessions: Number(countsRaw[0].activeSessions) }
      : { totalSessions: 0, activeSessions: 0 };

    return NextResponse.json({
      portal: {
        ...portal,
        dhcpSubnets,
        ipamSubnets: ipamSubnets.map((s) => ({ ...s, areaName: s.Area?.name || null, area: undefined })),
        sessionCounts: counts,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[CaptivePortal] GET [id] error:", error);
    return NextResponse.json({ error: "Failed to fetch portal" }, { status: 500 });
  }
}

// PUT /api/captive-portal/[id] — Update portal (partial)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const body = await request.json();

    const existing = await db.captivePortal.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Portal not found" }, { status: 404 });
    }

    // Build partial update — only include provided fields
    const allowedFields = [
      "name", "description", "template", "loginMethod", "theme",
      "welcomeTitle", "welcomeMessage", "tosText", "successMessage",
      "timeoutMessage", "dataCapMessage", "sessionTimeoutSec",
      "idleTimeoutSec", "dataLimitMb", "fapDataLimitMb",
      "bandwidthLimitDown", "bandwidthLimitUp", "redirectUrl",
      "originalUrlParam", "allowedHosts", "enableCaptiveDetection",
      "macAuthEnabled", "macAuthUnknownAction", "socialProviders",
      "voucherRequired", "voucherReusePolicy", "interfaceId",
      "locationId", "siteName", "venueType", "maxConcurrentSessions",
      "passthroughMode", "customLoginPageUrl", "postLoginAdUrl",
      "collectPhone", "collectEmail", "collectName", "partnerId",
      "revenueSharePercent", "priority", "scheduleConfig", "enabled",
    ] as const;

    const data: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (body[key] !== undefined) {
        data[key] = body[key];
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    // Handle nullable fields
    if (body.dataLimitMb !== undefined) data.dataLimitMb = body.dataLimitMb ?? null;
    if (body.fapDataLimitMb !== undefined) data.fapDataLimitMb = body.fapDataLimitMb ?? null;
    if (body.interfaceId !== undefined) data.interfaceId = body.interfaceId || null;
    if (body.locationId !== undefined) data.locationId = body.locationId || null;
    if (body.partnerId !== undefined) data.partnerId = body.partnerId || null;

    const portal = await db.captivePortal.update({
      where: { id },
      data,
      include: {
        location: { select: { id: true, name: true } },
        partner: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ portal });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[CaptivePortal] PUT [id] error:", error);
    return NextResponse.json({ error: "Failed to update portal" }, { status: 500 });
  }
}

// DELETE /api/captive-portal/[id] — Delete portal
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(_req);
    const { id } = await params;

    const existing = await db.captivePortal.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Portal not found" }, { status: 404 });
    }

    // Clear captivePortalId from linked subnets before deleting
    await db.dhcpSubnet.updateMany({
      where: { captivePortalId: id },
      data: { captivePortalId: null },
    });
    await db.subnet.updateMany({
      where: { captivePortalId: id },
      data: { captivePortalId: null },
    });

    await db.captivePortal.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[CaptivePortal] DELETE [id] error:", error);
    return NextResponse.json({ error: "Failed to delete portal" }, { status: 500 });
  }
}
