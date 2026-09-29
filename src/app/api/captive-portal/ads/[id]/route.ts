import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// PUT /api/captive-portal/ads/[id] — Update ad zone
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const body = await request.json();

    const existing = await db.portalAdZone.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Ad zone not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    const allowedFields = [
      "name", "position", "adType", "content", "redirectUrl",
      "scheduleEnabled", "scheduleDays", "scheduleStart", "scheduleEnd", "enabled",
    ] as const;
    for (const key of allowedFields) {
      if (body[key] !== undefined) data[key] = body[key];
    }
    if (body.impressions !== undefined) data.impressions = body.impressions;
    if (body.clicks !== undefined) data.clicks = body.clicks;

    const adZone = await db.portalAdZone.update({
      where: { id },
      data,
    });

    return NextResponse.json({ adZone });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[CaptivePortal Ads] PUT [id] error:", error);
    return NextResponse.json({ error: "Failed to update ad zone" }, { status: 500 });
  }
}

// DELETE /api/captive-portal/ads/[id] — Delete ad zone
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(_req);
    const { id } = await params;

    const existing = await db.portalAdZone.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Ad zone not found" }, { status: 404 });
    }

    await db.portalAdZone.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[CaptivePortal Ads] DELETE [id] error:", error);
    return NextResponse.json({ error: "Failed to delete ad zone" }, { status: 500 });
  }
}
