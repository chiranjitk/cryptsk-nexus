import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifySubscriberSessionToken, SUBSCRIBER_SESSION_COOKIE_NAME } from "@/lib/subscriber-session";

async function getSubscriberFromToken(request: NextRequest) {
  const token = request.cookies.get(SUBSCRIBER_SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const subscriberId = await verifySubscriberSessionToken(token);
  if (!subscriberId) return null;
  return db.subscriber.findUnique({
    where: { id: subscriberId },
    include: { Plan: true, Area: true },
  });
}

// GET /api/selfcare/service-health — Service health for subscriber's area
export async function GET(req: NextRequest) {
  try {
    const subscriber = await getSubscriberFromToken(req);
    if (!subscriber) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const areaId = subscriber.areaId;

    if (!areaId) {
      // Subscriber has no area assigned — return minimal health info
      return NextResponse.json({
        success: true,
        data: {
          area: "Unknown",
          onlineDevices: 0,
          offlineDevices: 0,
          activeAlerts: 0,
          maintenanceWindows: 0,
          overallStatus: "UNKNOWN" as const,
          totalDevices: 0,
        },
      });
    }

    // Get area name
    const area = await db.area.findUnique({
      where: { id: areaId },
      select: { name: true },
    });

    // Count devices in this area by status
    const deviceCounts = await db.networkDevice.groupBy({
      by: ["status"],
      where: { areaId },
      _count: true,
    });

    const onlineDevices = deviceCounts.find((d) => d.status === "ONLINE")?._count || 0;
    const offlineDevices = deviceCounts.find((d) => d.status === "OFFLINE")?._count || 0;
    const warningDevices = deviceCounts.find((d) => d.status === "WARNING")?._count || 0;
    const maintenanceDevices = deviceCounts.find((d) => d.status === "MAINTENANCE")?._count || 0;
    const totalDevices = deviceCounts.reduce((sum, d) => sum + d._count, 0);

    // Active alerts in last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const activeAlerts = await db.networkAlert.count({
      where: {
        createdAt: { gte: twentyFourHoursAgo },
        status: { in: ["ACTIVE", "OPEN"] },
      },
    });

    // Count maintenance windows (devices in MAINTENANCE status)
    const maintenanceWindows = maintenanceDevices;

    // Determine overall status
    let overallStatus: "HEALTHY" | "DEGRADED" | "DOWN" = "HEALTHY";
    if (offlineDevices > 0 && onlineDevices === 0) {
      overallStatus = "DOWN";
    } else if (offlineDevices > 0 || warningDevices > 0 || activeAlerts > 3) {
      overallStatus = "DEGRADED";
    }

    return NextResponse.json({
      success: true,
      data: {
        area: area?.name || "Unknown",
        onlineDevices,
        offlineDevices,
        activeAlerts,
        maintenanceWindows,
        overallStatus,
        totalDevices,
        warningDevices,
      },
    });
  } catch (error) {
    console.error("[selfcare-service-health] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
