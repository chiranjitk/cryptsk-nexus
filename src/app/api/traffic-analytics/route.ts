import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // ── 1. Summary ────────────────────────────────────────────
    // Total traffic today from BandwidthLog (aggregate downloadBps+uploadBps * interval)
    const bandwidthLogsToday = await db.bandwidthLog.findMany({
      where: { timestamp: { gte: todayStart } },
      take: 100000,
    });

    // Approximate total traffic: sum of (totalBps * 60 seconds) converted to GB
    // We group by hour to avoid counting duplicate entries per interval
    const uniqueHours = new Set(
      bandwidthLogsToday.map((l) => l.timestamp.toISOString().slice(0, 13))
    );
    const intervalsCount = uniqueHours.size || 1;

    let totalDownloadGB = 0;
    let totalUploadGB = 0;
    let peakBps = 0;
    let peakTime = "";

    // Aggregate hourly
    const hourlyMap = new Map<
      string,
      { dl: number; ul: number; maxTotal: number; ts: Date }
    >();

    for (const log of bandwidthLogsToday) {
      const hourKey = log.timestamp.toISOString().slice(0, 13);
      const existing = hourlyMap.get(hourKey) || {
        dl: 0,
        ul: 0,
        maxTotal: 0,
        ts: log.timestamp,
      };

      // Use latest reading per hour as representative sample
      if (log.timestamp >= existing.ts) {
        existing.dl = log.downloadBps;
        existing.ul = log.uploadBps;
        existing.ts = log.timestamp;
      }
      if (log.totalBps > existing.maxTotal) existing.maxTotal = log.totalBps;

      hourlyMap.set(hourKey, existing);
    }

    for (const [, val] of hourlyMap) {
      // Convert bps to GB: (bps * 3600) / (8 * 1024^3)
      totalDownloadGB += (val.dl * 3600) / (8 * 1024 * 1024 * 1024);
      totalUploadGB += (val.ul * 3600) / (8 * 1024 * 1024 * 1024);
      if (val.maxTotal > peakBps) {
        peakBps = val.maxTotal;
        peakTime = val.ts.toTimeString().slice(0, 5);
      }
    }

    // If no real data, compute from device data
    if (totalDownloadGB === 0 && totalUploadGB === 0) {
      const devices = await db.networkDevice.findMany({
        where: { status: { in: ["ONLINE", "WARNING"] } },
        select: { cpuUsage: true, BandwidthLog: { where: { timestamp: { gte: last24h } }, orderBy: { timestamp: "desc" }, take: 24 } },
      });

      for (const device of devices) {
        for (const log of device.BandwidthLog) {
          totalDownloadGB += (log.downloadBps * 3600) / (8 * 1024 * 1024 * 1024);
          totalUploadGB += (log.uploadBps * 3600) / (8 * 1024 * 1024 * 1024);
          if (log.totalBps > peakBps) {
            peakBps = log.totalBps;
            peakTime = log.timestamp.toTimeString().slice(0, 5);
          }
        }
      }
    }

    // Convert bps peak to Gbps
    const peakBandwidthGbps = peakBps / (1000 * 1000 * 1000);

    // Active sessions (subscribers with ACTIVE status)
    const activeSessions = await db.subscriber.count({
      where: { status: "ACTIVE" },
    });

    // Top protocol from NdpiAppUsage
    const protocolAgg = await db.ndpiAppUsage.groupBy({
      by: ["appName", "appCategory"],
      _sum: { totalBytes: true },
      where: { periodStart: { gte: todayStart } },
      orderBy: { _sum: { totalBytes: "desc" } },
      take: 1,
    });

    let topProtocol = { name: "HTTPS", percent: 0 };
    if (protocolAgg.length > 0) {
      const totalProtoBytes = await db.ndpiAppUsage.aggregate({
        _sum: { totalBytes: true },
        where: { periodStart: { gte: todayStart } },
      });
      const totalBytes = Number(totalProtoBytes._sum.totalBytes || 0);
      topProtocol = {
        name: protocolAgg[0].appName || "Unknown",
        percent:
          totalBytes > 0
            ? parseFloat(
                (
                  (Number(protocolAgg[0]._sum.totalBytes || 0) / totalBytes) *
                  100
                ).toFixed(1)
              )
            : 0,
      };
    }

    // ── 2. Trend (hourly for last 24h) ────────────────────────
    // Fetch ALL bandwidth logs for 24h in ONE query, then group in JavaScript
    const allTrendLogs = await db.bandwidthLog.findMany({
      where: {
        timestamp: { gte: last24h },
      },
      orderBy: { timestamp: "asc" },
      take: 100000,
    });

    // Group by hour in JS
    const hourlyGroups = new Map<string, { dl: number[]; ul: number[] }>();
    for (const log of allTrendLogs) {
      const hourLabel = `${String(new Date(log.timestamp).getHours()).padStart(2, "0")}:00`;
      const group = hourlyGroups.get(hourLabel) || { dl: [], ul: [] };
      group.dl.push(log.downloadBps);
      group.ul.push(log.uploadBps);
      hourlyGroups.set(hourLabel, group);
    }

    const trendData = [];
    for (let i = 23; i >= 0; i--) {
      const hStart = new Date(now.getTime() - i * 3600000);
      const hourLabel = `${String(hStart.getHours()).padStart(2, "0")}:00`;
      const group = hourlyGroups.get(hourLabel);

      const avgDl =
        group && group.dl.length > 0
          ? group.dl.reduce((s, v) => s + v, 0) / group.dl.length
          : 0;
      const avgUl =
        group && group.ul.length > 0
          ? group.ul.reduce((s, v) => s + v, 0) / group.ul.length
          : 0;

      // Convert bps to Gbps
      trendData.push({
        hour: hourLabel,
        download: parseFloat((avgDl / 1e9).toFixed(2)),
        upload: parseFloat((avgUl / 1e9).toFixed(2)),
      });
    }

    // ── 3. Top Talkers ────────────────────────────────────────
    // Get top subscribers by bandwidth usage from UsageLog
    const topUsageLogs = await db.usageLog.groupBy({
      by: ["subscriberId"],
      _sum: { downloadBytes: true, uploadBytes: true, sessionDuration: true },
      where: { timestamp: { gte: last24h } },
      orderBy: { _sum: { downloadBytes: "desc" } },
      take: 20,
    });

    const talkerSubIds = topUsageLogs.map((l) => l.subscriberId);
    const talkerSubscribers = talkerSubIds.length > 0
      ? await db.subscriber.findMany({
          where: { id: { in: talkerSubIds } },
          include: { Area: { select: { name: true } } },
        })
      : [];

    const subMap = new Map(talkerSubscribers.map((s) => [s.id, s]));

    const topTalkers = topUsageLogs.map((log, i) => {
      const sub = subMap.get(log.subscriberId);
      const dlMB = Number(log._sum.downloadBytes || 0) / (1024 * 1024);
      const ulMB = Number(log._sum.uploadBytes || 0) / (1024 * 1024);
      const totalMB = dlMB + ulMB;
      const durationSec = Number(log._sum.sessionDuration || 0);
      const hrs = Math.floor(durationSec / 3600);
      const mins = Math.floor((durationSec % 3600) / 60);

      return {
        rank: i + 1,
        subscriberId: sub?.code || `SUB-${String(10000 + i)}`,
        username: sub?.serviceUsername || sub?.name?.toLowerCase().replace(" ", ".") || "unknown",
        ip: sub?.ipAddress || `10.0.${Math.floor(i / 4)}.${10 + (i % 4)}`,
        download: Math.round(dlMB),
        upload: Math.round(ulMB),
        total: Math.round(totalMB),
        sessionDuration: `${hrs}h ${mins}m`,
        protocols: [], // Will be filled from ndpi data if available
      };
    });

    // Try to attach protocol info from NdpiAppUsage
    if (talkerSubIds.length > 0) {
      const ndpiUsages = await db.ndpiAppUsage.findMany({
        where: {
          subscriberId: { in: talkerSubIds },
          periodStart: { gte: last24h },
        },
        orderBy: { totalBytes: "desc" },
      });

      const ndpiBySub = new Map<string, { name: string; bytes: number }[]>();
      for (const ndpi of ndpiUsages) {
        if (!ndpi.subscriberId) continue;
        const existing = ndpiBySub.get(ndpi.subscriberId) || [];
        existing.push({
          name: ndpi.appName || "Unknown",
          bytes: Number(ndpi.totalBytes),
        });
        ndpiBySub.set(ndpi.subscriberId, existing);
      }

      for (const talker of topTalkers) {
        const subId = talkerSubIds[topTalkers.indexOf(talker)];
        const ndpiList = ndpiBySub.get(subId);
        if (ndpiList && ndpiList.length > 0) {
          const totalBytes = ndpiList.reduce((s, n) => s + n.bytes, 0);
          talker.protocols = ndpiList.slice(0, 3).map((n) => ({
            name: n.name,
            percent: parseFloat(
              ((n.bytes / (totalBytes || 1)) * 100).toFixed(0)
            ),
          }));
        }
      }
    }

    // ── 4. Protocol Distribution ──────────────────────────────
    const protocolStats = await db.ndpiAppUsage.groupBy({
      by: ["appName", "appCategory"],
      _sum: { totalBytes: true },
      where: { periodStart: { gte: last24h } },
      orderBy: { _sum: { totalBytes: "desc" } },
      take: 12,
    });

    const totalProtoBytes =
      protocolStats.reduce((s, p) => s + Number(p._sum.totalBytes || 0), 0) || 1;

    const categoryMap: Record<string, string> = {
      Streaming: "streaming",
      Social_Networking: "social",
      P2P: "p2p",
      Chat: "communication",
      VoIP: "communication",
      Web: "web",
      Gaming: "gaming",
      Download: "p2p",
      Email: "communication",
    };

    const protocols = protocolStats.map((p) => ({
      name: p.appName || "Unknown",
      bytes: parseFloat(
        (Number(p._sum.totalBytes || 0) / (1024 * 1024 * 1024)).toFixed(1)
      ),
      percent: parseFloat(
        ((Number(p._sum.totalBytes || 0) / totalProtoBytes) * 100).toFixed(1)
      ),
      category:
        (categoryMap[p.appCategory] as
          | "streaming"
          | "social"
          | "p2p"
          | "communication"
          | "web"
          | "gaming"
          | "other") || "other",
    }));

    // ── 5. Geographic Distribution ────────────────────────────
    const areas = await db.area.findMany({
      where: { status: "ACTIVE" },
      include: {
        _count: { select: { Subscriber: true } },
        Subscriber: {
          where: { status: "ACTIVE" },
          select: { currentSpeedDown: true },
        },
      },
      orderBy: { Subscriber: { _count: "desc" } },
      take: 10,
    });

    // Get usage per area from DataUsage
    const areaTraffic = await db.subscriber.groupBy({
      by: ["areaId"],
      _sum: { currentCycleDataUsed: true },
      where: { status: "ACTIVE", areaId: { not: null } },
    });

    const areaTrafficMap = new Map(
      areaTraffic.map((a) => [a.areaId, Number(a._sum.currentCycleDataUsed || 0)])
    );

    const geoData = areas.map((area) => {
      const activeSubs = area.Subscriber.length;
      const trafficGB = (areaTrafficMap.get(area.id) || 0) / 1024; // MB to GB
      const avgSpeed =
        activeSubs > 0
          ? area.Subscriber.reduce((s, sub) => s + sub.currentSpeedDown, 0) /
            activeSubs /
            1024
          : 0;

      return {
        location: area.name,
        sessions: activeSubs,
        totalTraffic: parseFloat(Math.max(trafficGB, 0).toFixed(1)),
        avgSpeed: Math.round(avgSpeed),
      };
    }).sort((a, b) => b.totalTraffic - a.totalTraffic);

    // ── 6. Interface Data ─────────────────────────────────────
    const devices = await db.networkDevice.findMany({
      where: { status: { in: ["ONLINE", "WARNING", "MAINTENANCE"] } },
      include: {
        DeviceInterface_DeviceInterface_deviceIdToNetworkDevice: true,
        BandwidthLog: {
          where: { timestamp: { gte: last24h } },
          orderBy: { timestamp: "asc" },
        },
      },
      take: 10,
    });

    const interfaceData = devices.flatMap((device) =>
      device.DeviceInterface_DeviceInterface_deviceIdToNetworkDevice.map((iface) => {
        const ifaceLogs = device.BandwidthLog.filter(
          (l) => l.interfaceName === iface.name
        );

        const avgDl =
          ifaceLogs.length > 0
            ? ifaceLogs.reduce((s, l) => s + l.downloadBps, 0) /
              ifaceLogs.length
            : 0;
        const avgUl =
          ifaceLogs.length > 0
            ? ifaceLogs.reduce((s, l) => s + l.uploadBps, 0) / ifaceLogs.length
            : 0;
        const maxDl = Math.max(...ifaceLogs.map((l) => l.downloadBps), 0);
        const maxUl = Math.max(...ifaceLogs.map((l) => l.uploadBps), 0);
        const utilPct = iface.speed > 0 ? Math.round((avgDl / (iface.speed * 1e6)) * 100) : 0;

        // Sparkline: 24 data points
        const sparkline = Array.from({ length: 24 }, (_, idx) => {
          const hStart = new Date(now.getTime() - (23 - idx) * 3600000);
          const hEnd = new Date(hStart.getTime() + 3600000);
          const hourLogs = ifaceLogs.filter(
            (l) => l.timestamp >= hStart && l.timestamp < hEnd
          );
          return hourLogs.length > 0
            ? parseFloat(
                (
                  hourLogs.reduce((s, l) => s + l.totalBps, 0) /
                  hourLogs.length /
                  1e9
                ).toFixed(2)
              )
            : 0;
        });

        return {
          name: `${device.name} — ${iface.name}`,
          status: iface.status === "UP" ? ("up" as const) : ("down" as const),
          download: parseFloat((avgDl / 1e9).toFixed(2)),
          upload: parseFloat((avgUl / 1e9).toFixed(2)),
          peakIn: parseFloat((maxDl / 1e9).toFixed(2)),
          peakOut: parseFloat((maxUl / 1e9).toFixed(2)),
          utilization: Math.min(utilPct, 100),
          sparkline,
        };
      })
    );

    // If no interface data, provide computed from device-level bandwidth logs
    const finalInterfaces =
      interfaceData.length > 0
        ? interfaceData
        : devices.map((device) => {
            const logs = device.BandwidthLog;
            const avgDl =
              logs.length > 0
                ? logs.reduce((s, l) => s + l.downloadBps, 0) / logs.length
                : 0;
            const avgUl =
              logs.length > 0
                ? logs.reduce((s, l) => s + l.uploadBps, 0) / logs.length
                : 0;
            const maxDl = Math.max(...logs.map((l) => l.downloadBps), 0);
            const maxUl = Math.max(...logs.map((l) => l.uploadBps), 0);

            const sparkline = Array.from({ length: 24 }, (_, idx) => {
              const hStart = new Date(
                now.getTime() - (23 - idx) * 3600000
              );
              const hEnd = new Date(hStart.getTime() + 3600000);
              const hourLogs = logs.filter(
                (l) => l.timestamp >= hStart && l.timestamp < hEnd
              );
              return hourLogs.length > 0
                ? parseFloat(
                    (
                      hourLogs.reduce((s, l) => s + l.totalBps, 0) /
                      hourLogs.length /
                      1e9
                    ).toFixed(2)
                  )
                : 0;
            });

            return {
              name: `${device.name}`,
              status: "up" as const,
              download: parseFloat((avgDl / 1e9).toFixed(2)),
              upload: parseFloat((avgUl / 1e9).toFixed(2)),
              peakIn: parseFloat((maxDl / 1e9).toFixed(2)),
              peakOut: parseFloat((maxUl / 1e9).toFixed(2)),
              utilization: 0,
              sparkline,
            };
          });

    return NextResponse.json({
      summary: {
        totalTraffic: {
          download: parseFloat(totalDownloadGB.toFixed(1)),
          upload: parseFloat(totalUploadGB.toFixed(1)),
        },
        activeSessions,
        topProtocol,
        peakBandwidth: {
          time: peakTime || new Date().toTimeString().slice(0, 5),
          value: parseFloat(peakBandwidthGbps.toFixed(2)) || 0,
        },
      },
      trend: trendData,
      topTalkers,
      protocols,
      geographic: geoData,
      interfaces: finalInterfaces,
    });
  } catch (error) {
    console.error("[traffic-analytics] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch traffic analytics data" },
      { status: 500 }
    );
  }
}
