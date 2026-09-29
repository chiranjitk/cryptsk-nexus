import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import type { NextRequest } from "next/server";

// GET /api/bandwidth - Bandwidth monitoring data
export async function GET(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
      throw e;
    }
    const { searchParams } = new URL(request.url);

    // --- Date range ---
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");
    const now = new Date();

    let startDate: Date;
    let endDate: Date = now;

    if (startDateParam && endDateParam) {
      startDate = new Date(startDateParam);
      endDate = new Date(endDateParam);
    } else {
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    // --- Device filter ---
    const deviceId = searchParams.get("deviceId") || "";

    // --- Pagination ---
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 20));

    // --- Aggregate mode ---
    const aggregate = searchParams.get("aggregate") || "per-device"; // "per-device" | "total"

    // --- Fetch thresholds from ISP settings ---
    let downloadThresholdMbps = 800;
    let uploadThresholdMbps = 400;
    try {
      const settings = await db.ispSettings.findUnique({ where: { id: "default" } });
      if (settings?.bandwidthThresholds) {
        const thresholds = JSON.parse(settings.bandwidthThresholds);
        downloadThresholdMbps = thresholds.downloadMbps ?? 800;
        uploadThresholdMbps = thresholds.uploadMbps ?? 400;
      }
    } catch { /* use defaults */ }

    const downloadThresholdBps = downloadThresholdMbps * 1_000_000;
    const uploadThresholdBps = uploadThresholdMbps * 1_000_000;

    // 1. Get devices with their bandwidth logs
    const deviceWhere: Record<string, unknown> = {
      status: { in: ["ONLINE", "WARNING"] },
    };
    if (deviceId) deviceWhere.id = deviceId;

    const allDevices = await db.networkDevice.findMany({
      where: deviceWhere,
      select: {
        id: true,
        name: true,
        ipAddress: true,
        type: true,
        status: true,
        BandwidthLog: {
          where: { timestamp: { gte: startDate, lte: endDate } },
          orderBy: { timestamp: "asc" },
          select: {
            downloadBps: true,
            uploadBps: true,
            totalBps: true,
            timestamp: true,
            interfaceName: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    // 2. Get top consumers (subscribers by data usage)
    const topConsumers = await db.subscriber.findMany({
      where: {
        status: "ACTIVE",
        currentCycleDataUsed: { gt: 0 },
      },
      orderBy: { currentCycleDataUsed: "desc" },
      take: 20,
      select: {
        id: true,
        name: true,
        code: true,
        currentCycleDataUsed: true,
        currentSpeedDown: true,
        currentSpeedUp: true,
        Plan: { select: { name: true, dataLimitGb: true } },
      },
    });

    // 3. Aggregate bandwidth per device
    const deviceBandwidth = allDevices.map((device) => {
      const logs = device.bandwidthLogs;
      const avgDownload =
        logs.length > 0
          ? Math.round(logs.reduce((s, l) => s + l.downloadBps, 0) / logs.length)
          : 0;
      const avgUpload =
        logs.length > 0
          ? Math.round(logs.reduce((s, l) => s + l.uploadBps, 0) / logs.length)
          : 0;
      const peakDownload = logs.length > 0 ? Math.max(...logs.map((l) => l.downloadBps)) : 0;
      const peakUpload = logs.length > 0 ? Math.max(...logs.map((l) => l.uploadBps)) : 0;

      return {
        deviceId: device.id,
        deviceName: device.name,
        ipAddress: device.ipAddress,
        type: device.type,
        avgDownload,
        avgUpload,
        peakDownload,
        peakUpload,
        currentLoad: logs.length > 0 ? logs[logs.length - 1].totalBps : 0,
        logCount: logs.length,
      };
    });

    // 4. Paginate devices
    const totalDevices = deviceBandwidth.length;
    const totalPages = Math.max(1, Math.ceil(totalDevices / limit));
    const skip = (page - 1) * limit;

    let paginatedDevices: typeof deviceBandwidth;
    if (aggregate === "total") {
      // Aggregate all devices into a single "Total" row
      const totalAvgDownload = deviceBandwidth.length > 0
        ? Math.round(deviceBandwidth.reduce((s, d) => s + d.avgDownload, 0) / deviceBandwidth.length)
        : 0;
      const totalAvgUpload = deviceBandwidth.length > 0
        ? Math.round(deviceBandwidth.reduce((s, d) => s + d.avgUpload, 0) / deviceBandwidth.length)
        : 0;
      const totalPeakDownload = deviceBandwidth.length > 0
        ? Math.max(...deviceBandwidth.map((d) => d.peakDownload))
        : 0;
      const totalPeakUpload = deviceBandwidth.length > 0
        ? Math.max(...deviceBandwidth.map((d) => d.peakUpload))
        : 0;
      const totalCurrentLoad = deviceBandwidth.reduce((s, d) => s + d.currentLoad, 0);
      paginatedDevices = [{
        deviceId: "total",
        deviceName: "All Devices",
        ipAddress: "—",
        type: "OTHER" as const,
        avgDownload: totalAvgDownload,
        avgUpload: totalAvgUpload,
        peakDownload: totalPeakDownload,
        peakUpload: totalPeakUpload,
        currentLoad: totalCurrentLoad,
        logCount: deviceBandwidth.reduce((s, d) => s + d.logCount, 0),
      }];
    } else {
      paginatedDevices = deviceBandwidth.slice(skip, skip + limit);
    }

    // 5. Time-series data
    const timeSeriesStart = aggregate === "total"
      ? new Date(now.getTime() - 24 * 60 * 60 * 1000)
      : startDate;
    const recentLogsWhere: Record<string, unknown> = {
      timestamp: { gte: timeSeriesStart, lte: now },
    };
    if (deviceId) recentLogsWhere.deviceId = deviceId;

    const recentLogs = await db.bandwidthLog.findMany({
      where: recentLogsWhere,
      orderBy: { timestamp: "asc" },
      select: {
        downloadBps: true,
        uploadBps: true,
        totalBps: true,
        timestamp: true,
      },
    });

    // Group by hour
    const hourlyData: Record<string, { download: number; upload: number; count: number }> = {};
    for (const log of recentLogs) {
      const hourKey = new Date(log.timestamp).toISOString().slice(0, 13) + ":00:00";
      if (!hourlyData[hourKey]) {
        hourlyData[hourKey] = { download: 0, upload: 0, count: 0 };
      }
      hourlyData[hourKey].download += log.downloadBps;
      hourlyData[hourKey].upload += log.uploadBps;
      hourlyData[hourKey].count += 1;
    }

    const timeSeriesData = Object.entries(hourlyData)
      .map(([time, data]) => ({
        time: new Date(time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
        download: Math.round(data.download / data.count),
        upload: Math.round(data.upload / data.count),
      }))
      .slice(-48);

    // 6. Total bandwidth summary
    const totalCurrent = deviceBandwidth.reduce((s, d) => s + d.currentLoad, 0);
    const totalPeak = deviceBandwidth.reduce(
      (s, d) => s + Math.max(d.peakDownload, d.peakUpload),
      0
    );
    const totalDataUsed = topConsumers.reduce((s, c) => s + c.currentCycleDataUsed, 0);

    // 7. Bandwidth threshold alerts
    const alerts: { deviceName: string; type: string; value: number; threshold: number }[] = [];
    for (const d of deviceBandwidth) {
      if (d.peakDownload > downloadThresholdBps) {
        alerts.push({
          deviceName: d.deviceName,
          type: "High Download",
          value: d.peakDownload,
          threshold: downloadThresholdBps,
        });
      }
      if (d.peakUpload > uploadThresholdBps) {
        alerts.push({
          deviceName: d.deviceName,
          type: "High Upload",
          value: d.peakUpload,
          threshold: uploadThresholdBps,
        });
      }
    }

    return NextResponse.json({
      devices: paginatedDevices,
      total: totalDevices,
      page,
      limit,
      totalPages,
      aggregate,
      topConsumers: topConsumers.map((c) => ({
        ...c,
        currentCycleDataUsed: Math.round(c.currentCycleDataUsed * 100) / 100,
      })),
      timeSeriesData,
      summary: {
        totalDevices: allDevices.length,
        totalCurrentBps: totalCurrent,
        totalPeakBps: totalPeak,
        totalDataUsedGb: Math.round((totalDataUsed / (1024 * 1024 * 1024)) * 100) / 100,
      },
      alerts,
      thresholds: {
        downloadMbps: downloadThresholdMbps,
        uploadMbps: uploadThresholdMbps,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Bandwidth API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch bandwidth data" },
      { status: 500 }
    );
  }
}
