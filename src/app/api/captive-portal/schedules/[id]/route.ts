import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// PUT /api/captive-portal/schedules/[id] — Update schedule
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const body = await request.json();

    const existing = await db.portalSchedule.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    const allowedFields = [
      "name", "enabled", "daysOfWeek", "startTime", "endTime",
      "outOfScheduleAction",
    ] as const;
    for (const key of allowedFields) {
      if (body[key] !== undefined) data[key] = body[key];
    }
    if (body.overridePortalId !== undefined) data.overridePortalId = body.overridePortalId || null;

    const schedule = await db.portalSchedule.update({
      where: { id },
      data,
    });

    return NextResponse.json({ schedule });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[CaptivePortal Schedules] PUT [id] error:", error);
    return NextResponse.json({ error: "Failed to update schedule" }, { status: 500 });
  }
}

// DELETE /api/captive-portal/schedules/[id] — Delete schedule
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(_req);
    const { id } = await params;

    const existing = await db.portalSchedule.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    await db.portalSchedule.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[CaptivePortal Schedules] DELETE [id] error:", error);
    return NextResponse.json({ error: "Failed to delete schedule" }, { status: 500 });
  }
}
