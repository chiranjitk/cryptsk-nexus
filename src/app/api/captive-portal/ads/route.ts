import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { Prisma } from "@prisma/client";

// GET /api/captive-portal/ads — List ad zones
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const portalId = searchParams.get("portalId") || "";

    const where: Prisma.PortalAdZoneWhereInput = {};
    if (portalId) where.portalId = portalId;

    const adZones = await db.portalAdZone.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        portal: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ adZones });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[CaptivePortal Ads] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch ad zones" }, { status: 500 });
  }
}

// POST /api/captive-portal/ads — Create ad zone
export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json();
    const { portalId } = body;

    if (!portalId) {
      return NextResponse.json({ error: "portalId is required" }, { status: 400 });
    }

    const portal = await db.captivePortal.findUnique({ where: { id: portalId } });
    if (!portal) {
      return NextResponse.json({ error: "Portal not found" }, { status: 404 });
    }

    const adZone = await db.portalAdZone.create({
      data: {
        portalId,
        name: body.name || "",
        position: body.position || "TOP",
        adType: body.adType || "IMAGE",
        content: body.content || "",
        redirectUrl: body.redirectUrl || "",
        impressions: 0,
        clicks: 0,
        scheduleEnabled: body.scheduleEnabled || false,
        scheduleDays: body.scheduleDays || "[1,2,3,4,5,6,7]",
        scheduleStart: body.scheduleStart || "00:00",
        scheduleEnd: body.scheduleEnd || "23:59",
        enabled: body.enabled !== undefined ? body.enabled : true,
      },
    });

    return NextResponse.json({ adZone }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[CaptivePortal Ads] POST error:", error);
    return NextResponse.json({ error: "Failed to create ad zone" }, { status: 500 });
  }
}
