import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auditLog, auditCreate } from "@/lib/services/audit-service";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ─── GET: Fetch hotspot plans, AP locations, and active sessions ────
export async function GET(request: Request) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    // Fetch plans with HOTSPOT category
    const hotspotPlans = await db.plan.findMany({
      where: { category: "HOTSPOT" },
      include: { _count: { select: { Subscriber: true } } },
      orderBy: { createdAt: "desc" },
    });

    // Fetch AP devices as locations
    const apDevices = await db.networkDevice.findMany({
      where: { type: "AP" },
      orderBy: { createdAt: "desc" },
    });

    // Fetch active RADIUS sessions for hotspot users
    const activeSessions = await db.radiusSession.findMany({
      where: {
        stopTime: null,
      },
      orderBy: { startTime: "desc" },
      take: 100,
    });

    // Group active sessions by NAS-IP-Address for per-AP counts
    const sessionsByNasIp = new Map<string, typeof activeSessions>();
    for (const s of activeSessions) {
      const nasIp = s.nasIp || "unknown";
      if (!sessionsByNasIp.has(nasIp)) sessionsByNasIp.set(nasIp, []);
      sessionsByNasIp.get(nasIp)!.push(s);
    }

    // Build AP IP → device ID map from AP devices
    const apIpToDevice = new Map(apDevices.filter((ap) => ap.ipAddress).map((ap) => [ap.ipAddress, ap]));

    // Get recent bandwidth logs for AP devices (last 30 min)
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    const apDeviceIds = apDevices.map((ap) => ap.id);
    const apBandwidthLogs = apDeviceIds.length > 0
      ? await db.bandwidthLog.findMany({
          where: { deviceId: { in: apDeviceIds }, timestamp: { gte: thirtyMinAgo } },
          orderBy: { timestamp: "desc" },
        })
      : [];

    // Aggregate bandwidth per device
    const bwByDevice = new Map<string, { avgDownloadBps: number; avgUploadBps: number; count: number }>();
    for (const log of apBandwidthLogs) {
      const existing = bwByDevice.get(log.deviceId) || { avgDownloadBps: 0, avgUploadBps: 0, count: 0 };
      existing.avgDownloadBps += log.downloadBps;
      existing.avgUploadBps += log.uploadBps;
      existing.count++;
      bwByDevice.set(log.deviceId, existing);
    }

    // Fetch today's payments for revenue (VERIFIED status)
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayPayments = await db.payment.findMany({
      where: {
        createdAt: { gte: startOfDay },
        status: "VERIFIED",
      },
      select: { amount: true },
    });
    const revenueToday = todayPayments.reduce((s, p) => s + p.amount, 0);

    return NextResponse.json({
      plans: hotspotPlans.map((p) => ({
        id: p.id,
        name: p.name,
        planType: p.dataLimitGb ? "DATA_BASED" : "UNLIMITED",
        speed: p.downloadSpeed,
        limit: p.dataLimitGb ? `${p.dataLimitGb} GB` : p.validityDays ? `${p.validityDays} day${p.validityDays > 1 ? "s" : ""}` : "Unlimited",
        price: p.priceMonthly,
        activeUsers: p._count.Subscriber,
        status: p.status === "ACTIVE" ? "Active" : "Inactive",
      })),
      locations: apDevices.map((ap) => {
        // Count active sessions for this AP by matching NAS-IP
        const apSessions = sessionsByNasIp.get(ap.ipAddress) || [];
        const activeUsers = apSessions.length;

        // Get bandwidth from logs
        const bwData = bwByDevice.get(ap.id);
        const bandwidthUsed = bwData && bwData.count > 0
          ? `${Math.round(bwData.avgDownloadBps / bwData.count / 1_000_000)} Mbps`
          : "0 Mbps";

        return {
          id: ap.id,
          name: ap.name,
          type: "Hotspot",
          address: ap.location || "",
          apCount: 1,
          activeUsers,
          bandwidthUsed,
          status: ap.status === "ONLINE" ? "Active" : "Inactive",
        };
      }),
      activeUsers: activeSessions.map((s) => {
        return {
          id: s.id,
          username: s.radiusUserId || "unknown",
          location: "",
          ip: s.framedIp || "",
          mac: s.callingStationId || "",
          connectedSince: s.startTime ? s.startTime.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "",
          dataUsed: `${Math.floor((Number(s.inputOctets || 0) + Number(s.outputOctets || 0)) / 1048576)} MB`,
          timeRemaining: "Unlimited",
        };
      }),
      totalPlans: hotspotPlans.length,
      totalLocations: apDevices.length,
      activeLocations: apDevices.filter((d) => d.status === "ONLINE").length,
      totalActiveUsers: activeSessions.length,
      revenueToday,
    });
  } catch (error) {
    console.error("Hotspot API error:", error);
    return NextResponse.json({ error: "Failed to fetch hotspot data" }, { status: 500 });
  }
}

// ─── POST: Create/delete/update hotspot plans and locations ──────
export async function POST(request: NextRequest) {
  try {
    try {
      try {
        await requireAuth(request as unknown as import("next/server").NextRequest);
      } catch (e) {
        if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
        throw e;
      }
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case "create-plan": {
        const { name, speed, price, validityDays, dataLimit, planType } = body;
        if (!name) {
          return NextResponse.json({ error: "Plan name is required" }, { status: 400 });
        }
        const plan = await db.plan.create({
          data: {
            name,
            category: "HOTSPOT",
            downloadSpeed: parseInt(String(speed)) || 10000,
            uploadSpeed: Math.round((parseInt(String(speed)) || 10000) / 2),
            speedUnit: "MBPS",
            priceMonthly: parseFloat(String(price)) || 0,
            validityDays: validityDays ? parseInt(String(validityDays)) : (planType === "TIME_BASED" ? 1 : 30),
            dataLimitGb: dataLimit ? parseFloat(String(dataLimit)) : null,
            status: "ACTIVE",
          },
        });
        await auditCreate(request, "Plan", plan.id, { action: "create-plan", name, category: "HOTSPOT" });
        return NextResponse.json({ success: true, plan });
      }

      case "update-plan": {
        const { id, name, speed, price, validityDays, dataLimit, planType, status } = body;
        if (!id) {
          return NextResponse.json({ error: "Plan ID is required" }, { status: 400 });
        }
        const updated = await db.plan.update({
          where: { id },
          data: {
            name: name || undefined,
            downloadSpeed: speed ? parseInt(String(speed)) : undefined,
            uploadSpeed: speed ? Math.round(parseInt(String(speed)) / 2) : undefined,
            priceMonthly: price !== undefined ? parseFloat(String(price)) : undefined,
            validityDays: validityDays ? parseInt(String(validityDays)) : undefined,
            dataLimitGb: dataLimit !== undefined ? parseFloat(String(dataLimit)) : undefined,
            status: status === "Active" ? "ACTIVE" as const : "ARCHIVED" as const,
          },
        });
        await auditLog(request, "CONFIG_CHANGE", "Plan", id, { name });
        return NextResponse.json({ success: true, plan: updated });
      }

      case "delete-plan": {
        const { id } = body;
        if (!id) {
          return NextResponse.json({ error: "Plan ID is required" }, { status: 400 });
        }
        await auditLog(request, "DELETE", "NetworkDevice", id, {});
        await db.plan.delete({ where: { id } });
        return NextResponse.json({ success: true, message: "Plan deleted" });
      }

      case "create-location": {
        const { name, type, address, apCount } = body;
        if (!name) {
          return NextResponse.json({ error: "Location name is required" }, { status: 400 });
        }
        const device = await db.networkDevice.create({
          data: {
            name,
            type: "AP",
            location: address || "",
            status: "ONLINE",
            ipAddress: "",
            model: type || "Hotspot",
          },
        });
        await auditCreate(request, "NetworkDevice", device.id, { action: "create-location", name, type: "AP" });
        return NextResponse.json({ success: true, device });
      }

      case "update-location": {
        const { id, name, type, address, apCount, status } = body;
        if (!id) {
          return NextResponse.json({ error: "Location ID is required" }, { status: 400 });
        }
        const updated = await db.networkDevice.update({
          where: { id },
          data: {
            name: name || undefined,
            location: address !== undefined ? address : undefined,
            model: type || undefined,
            status: status === "Active" ? "ONLINE" as const : "OFFLINE" as const,
          },
        });
        await auditLog(request, "CONFIG_CHANGE", "NetworkDevice", id, { name });
        return NextResponse.json({ success: true, device: updated });
      }

      case "delete-location": {
        const { id } = body;
        if (!id) {
          return NextResponse.json({ error: "Location ID is required" }, { status: 400 });
        }
        await auditLog(request, "DELETE", "NetworkDevice", id, {});
        await db.networkDevice.delete({ where: { id } });
        return NextResponse.json({ success: true, message: "Location deleted" });
      }

      case "disconnect-user": {
        const { id } = body;
        if (!id) {
          return NextResponse.json({ error: "Session ID is required" }, { status: 400 });
        }
        const session = await db.radiusSession.update({
          where: { id },
          data: {
            stopTime: new Date(),
            terminateCause: "Admin-Disconnect",
          },
        });
        return NextResponse.json({ success: true, session });
      }

      case "bulk-create-plans": {
        // Support both: { plans: [...] } array format and legacy { namePrefix, count, ... } format
        const { plans: planArray, namePrefix, count, speed, price, validityDays, dataLimit, planType: legacyPlanType } = body;

        let planEntries: Array<{ name: string; speed: number; price: number; planType?: string; limit?: string; status?: string }> = [];

        if (Array.isArray(planArray) && planArray.length > 0) {
          planEntries = planArray;
        } else if (namePrefix && count) {
          if (count < 1 || count > 50) {
            return NextResponse.json({ error: "Count must be between 1 and 50" }, { status: 400 });
          }
          for (let i = 1; i <= count; i++) {
            planEntries.push({
              name: `${namePrefix} ${i}`,
              speed: parseInt(String(speed)) || 10000,
              price: parseFloat(String(price)) || 0,
            });
          }
        } else {
          return NextResponse.json({ error: "Provide 'plans' array or 'namePrefix' + 'count'" }, { status: 400 });
        }

        const created = [] as Array<Awaited<ReturnType<typeof db.plan.create>>>;
        for (const entry of planEntries) {
          try {
            const plan = await db.plan.create({
              data: {
                name: entry.name,
                category: "HOTSPOT",
                downloadSpeed: entry.speed || 10000,
                uploadSpeed: Math.round((entry.speed || 10000) / 2),
                speedUnit: "MBPS",
                priceMonthly: entry.price || 0,
                validityDays: 30,
                dataLimitGb: null,
                status: "ACTIVE",
              },
            });
            created.push(plan);
          } catch { /* skip duplicates */ }
        }
        await auditCreate(request, "Plan", created[0]?.id || "bulk", { action: "bulk-create-plans", count: created.length, category: "HOTSPOT" });
        return NextResponse.json({ success: true, count: created.length, plans: created });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Hotspot POST error:", error);
    return NextResponse.json({ error: "Failed to process hotspot request" }, { status: 500 });
  }
}
