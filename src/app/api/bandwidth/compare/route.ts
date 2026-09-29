import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import type { NextRequest } from "next/server";

// GET /api/bandwidth/compare?startDate1=xxx&endDate1=xxx&startDate2=xxx&endDate2=xxx&deviceId1=xxx&deviceId2=xxx&compareMode=periods|devices
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const compareMode = searchParams.get("compareMode") || "periods";

    const now = new Date();

    if (compareMode === "periods") {
      const startDate1 = new Date(searchParams.get("startDate1") || new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString());
      const endDate1 = new Date(searchParams.get("endDate1") || now.toISOString());
      const startDate2 = new Date(searchParams.get("startDate2") || new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString());
      const endDate2 = new Date(searchParams.get("endDate2") || new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString());
      const deviceId = searchParams.get("deviceId") || "";

      // Fetch logs for period 1
      const where1: Record<string, unknown> = { timestamp: { gte: startDate1, lte: endDate1 } };
      if (deviceId) where1.deviceId = deviceId;

      const logs1 = await db.bandwidthLog.findMany({
        where: where1,
        select: { downloadBps: true, uploadBps: true, timestamp: true },
        orderBy: { timestamp: "asc" },
      });

      // Fetch logs for period 2
      const where2: Record<string, unknown> = { timestamp: { gte: startDate2, lte: endDate2 } };
      if (deviceId) where2.deviceId = deviceId;

      const logs2 = await db.bandwidthLog.findMany({
        where: where2,
        select: { downloadBps: true, uploadBps: true, timestamp: true },
        orderBy: { timestamp: "asc" },
      });

      // Build hourly data for each period
      function buildHourly(logs: typeof logs1) {
        const hourly: Record<string, { download: number; upload: number; count: number }> = {};
        for (const log of logs) {
          const key = new Date(log.timestamp).toISOString().slice(0, 13) + ":00:00";
          if (!hourly[key]) hourly[key] = { download: 0, upload: 0, count: 0 };
          hourly[key].download += log.downloadBps;
          hourly[key].upload += log.uploadBps;
          hourly[key].count += 1;
        }
        return Object.entries(hourly).map(([time, data]) => ({
          time: new Date(time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
          download: Math.round(data.download / data.count),
          upload: Math.round(data.upload / data.count),
        })).slice(-48);
      }

      const period1Data = buildHourly(logs1);
      const period2Data = buildHourly(logs2);

      // Compute summaries
      const summary1 = {
        avgDownload: logs1.length > 0 ? Math.round(logs1.reduce((s, l) => s + l.downloadBps, 0) / logs1.length) : 0,
        avgUpload: logs1.length > 0 ? Math.round(logs1.reduce((s, l) => s + l.uploadBps, 0) / logs1.length) : 0,
        peakDownload: logs1.length > 0 ? Math.max(...logs1.map((l) => l.downloadBps)) : 0,
        peakUpload: logs1.length > 0 ? Math.max(...logs1.map((l) => l.uploadBps)) : 0,
        logCount: logs1.length,
      };
      const summary2 = {
        avgDownload: logs2.length > 0 ? Math.round(logs2.reduce((s, l) => s + l.downloadBps, 0) / logs2.length) : 0,
        avgUpload: logs2.length > 0 ? Math.round(logs2.reduce((s, l) => s + l.uploadBps, 0) / logs2.length) : 0,
        peakDownload: logs2.length > 0 ? Math.max(...logs2.map((l) => l.downloadBps)) : 0,
        peakUpload: logs2.length > 0 ? Math.max(...logs2.map((l) => l.uploadBps)) : 0,
        logCount: logs2.length,
      };

      return NextResponse.json({
        compareMode: "periods",
        period1: { label: `${startDate1.toLocaleDateString("en-IN")} – ${endDate1.toLocaleDateString("en-IN")}`, data: period1Data, summary: summary1 },
        period2: { label: `${startDate2.toLocaleDateString("en-IN")} – ${endDate2.toLocaleDateString("en-IN")}`, data: period2Data, summary: summary2 },
      });
    } else {
      // Compare two devices
      const deviceId1 = searchParams.get("deviceId1") || "";
      const deviceId2 = searchParams.get("deviceId2") || "";
      const startDate = new Date(searchParams.get("startDate") || new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString());
      const endDate = new Date(searchParams.get("endDate") || now.toISOString());

      if (!deviceId1 || !deviceId2) {
        return NextResponse.json({ error: "Two device IDs are required for device comparison" }, { status: 400 });
      }

      const [device1, device2] = await Promise.all([
        db.networkDevice.findUnique({ where: { id: deviceId1 }, select: { name: true, ipAddress: true } }),
        db.networkDevice.findUnique({ where: { id: deviceId2 }, select: { name: true, ipAddress: true } }),
      ]);

      const [logs1, logs2] = await Promise.all([
        db.bandwidthLog.findMany({ where: { deviceId: deviceId1, timestamp: { gte: startDate, lte: endDate } }, select: { downloadBps: true, uploadBps: true, timestamp: true }, orderBy: { timestamp: "asc" } }),
        db.bandwidthLog.findMany({ where: { deviceId: deviceId2, timestamp: { gte: startDate, lte: endDate } }, select: { downloadBps: true, uploadBps: true, timestamp: true }, orderBy: { timestamp: "asc" } }),
      ]);

      function buildHourly(logs: typeof logs1) {
        const hourly: Record<string, { download: number; upload: number; count: number }> = {};
        for (const log of logs) {
          const key = new Date(log.timestamp).toISOString().slice(0, 13) + ":00:00";
          if (!hourly[key]) hourly[key] = { download: 0, upload: 0, count: 0 };
          hourly[key].download += log.downloadBps;
          hourly[key].upload += log.uploadBps;
          hourly[key].count += 1;
        }
        return Object.entries(hourly).map(([time, data]) => ({
          time: new Date(time).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
          download: Math.round(data.download / data.count),
          upload: Math.round(data.upload / data.count),
        })).slice(-48);
      }

      return NextResponse.json({
        compareMode: "devices",
        device1: { label: device1?.name || deviceId1, data: buildHourly(logs1) },
        device2: { label: device2?.name || deviceId2, data: buildHourly(logs2) },
      });
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Bandwidth compare GET error:", error);
    return NextResponse.json({ error: "Failed to fetch comparison data" }, { status: 500 });
  }
}
