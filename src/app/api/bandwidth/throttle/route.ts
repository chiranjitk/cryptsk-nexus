import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import type { NextRequest } from "next/server";

// GET /api/bandwidth/throttle - List all throttle configs
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const configs = await db.bandwidthThrottleConfig.findMany({
      include: { device: { select: { id: true, name: true, ipAddress: true, type: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ configs });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Throttle config GET error:", error);
    return NextResponse.json({ error: "Failed to fetch throttle configs" }, { status: 500 });
  }
}

// POST /api/bandwidth/throttle - Create or update throttle config
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();
    const { id, deviceId, maxDownloadMbps, maxUploadMbps, scheduleEnabled, scheduleStartTime, scheduleEndTime, scheduleDays, enabled } = body;

    if (!deviceId) {
      return NextResponse.json({ error: "Device ID is required" }, { status: 400 });
    }
    if (!maxDownloadMbps || maxDownloadMbps <= 0) {
      return NextResponse.json({ error: "Max download speed must be positive" }, { status: 400 });
    }
    if (!maxUploadMbps || maxUploadMbps <= 0) {
      return NextResponse.json({ error: "Max upload speed must be positive" }, { status: 400 });
    }

    let config;
    if (id) {
      // Update existing
      config = await db.bandwidthThrottleConfig.update({
        where: { id },
        data: {
          maxDownloadMbps: Number(maxDownloadMbps),
          maxUploadMbps: Number(maxUploadMbps),
          scheduleEnabled: Boolean(scheduleEnabled),
          scheduleStartTime: scheduleStartTime || "09:00",
          scheduleEndTime: scheduleEndTime || "18:00",
          scheduleDays: scheduleDays || "[1,2,3,4,5]",
          enabled: enabled !== false,
        },
        include: { device: { select: { id: true, name: true, ipAddress: true } } },
      });
    } else {
      // Check for existing config on this device
      const existing = await db.bandwidthThrottleConfig.findFirst({ where: { deviceId } });
      if (existing) {
        config = await db.bandwidthThrottleConfig.update({
          where: { id: existing.id },
          data: {
            maxDownloadMbps: Number(maxDownloadMbps),
            maxUploadMbps: Number(maxUploadMbps),
            scheduleEnabled: Boolean(scheduleEnabled),
            scheduleStartTime: scheduleStartTime || "09:00",
            scheduleEndTime: scheduleEndTime || "18:00",
            scheduleDays: scheduleDays || "[1,2,3,4,5]",
            enabled: enabled !== false,
          },
          include: { device: { select: { id: true, name: true, ipAddress: true } } },
        });
      } else {
        config = await db.bandwidthThrottleConfig.create({
          data: {
            deviceId,
            maxDownloadMbps: Number(maxDownloadMbps),
            maxUploadMbps: Number(maxUploadMbps),
            scheduleEnabled: Boolean(scheduleEnabled),
            scheduleStartTime: scheduleStartTime || "09:00",
            scheduleEndTime: scheduleEndTime || "18:00",
            scheduleDays: scheduleDays || "[1,2,3,4,5]",
            enabled: enabled !== false,
          },
          include: { device: { select: { id: true, name: true, ipAddress: true } } },
        });
      }
    }

    // Audit log
    await db.auditLog.create({
      data: {
        userId,
        action: "bandwidth_throttle_config",
        entity: "BandwidthThrottleConfig",
        entityId: config.id,
        details: JSON.stringify({ deviceId, maxDownloadMbps, maxUploadMbps }),
      },
    });

    return NextResponse.json({ config });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Throttle config POST error:", error);
    return NextResponse.json({ error: "Failed to save throttle config" }, { status: 500 });
  }
}

// DELETE /api/bandwidth/throttle - Delete throttle config
export async function DELETE(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Config ID required" }, { status: 400 });
    }
    await db.bandwidthThrottleConfig.delete({ where: { id } });
    await db.auditLog.create({
      data: { userId, action: "bandwidth_throttle_delete", entity: "BandwidthThrottleConfig", entityId: id, details: "{}" },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Throttle config DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete throttle config" }, { status: 500 });
  }
}
