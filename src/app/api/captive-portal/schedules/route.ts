import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { Prisma } from "@prisma/client";

// GET /api/captive-portal/schedules — List schedules
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const portalId = searchParams.get("portalId") || "";

    const where: Prisma.PortalScheduleWhereInput = {};
    if (portalId) where.portalId = portalId;

    const schedules = await db.portalSchedule.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        portal: { select: { id: true, name: true } },
        overridePortal: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ schedules });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[CaptivePortal Schedules] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch schedules" }, { status: 500 });
  }
}

// POST /api/captive-portal/schedules — Create schedule
export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json();
    const { portalId, name } = body;

    if (!portalId) {
      return NextResponse.json({ error: "portalId is required" }, { status: 400 });
    }

    const portal = await db.captivePortal.findUnique({ where: { id: portalId } });
    if (!portal) {
      return NextResponse.json({ error: "Portal not found" }, { status: 404 });
    }

    const schedule = await db.portalSchedule.create({
      data: {
        portalId,
        name: name || "",
        enabled: body.enabled !== undefined ? body.enabled : true,
        daysOfWeek: body.daysOfWeek || "[1,2,3,4,5,6,7]",
        startTime: body.startTime || "00:00",
        endTime: body.endTime || "23:59",
        overridePortalId: body.overridePortalId || null,
        outOfScheduleAction: body.outOfScheduleAction || "DEFAULT_PORTAL",
      },
    });

    return NextResponse.json({ schedule }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[CaptivePortal Schedules] POST error:", error);
    return NextResponse.json({ error: "Failed to create schedule" }, { status: 500 });
  }
}
