import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import type { NextRequest } from "next/server";

// GET /api/bandwidth/interfaces?deviceId=xxx&startDate=xxx&endDate=xxx
// Per-interface bandwidth breakdown for a device
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get("deviceId");

    if (!deviceId) {
      return NextResponse.json({ error: "Device ID is required" }, { status: 400 });
    }

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

    // Get device interfaces
    const interfaces = await db.deviceInterface.findMany({
      where: { deviceId },
      select: { id: true, name: true, description: true, type: true, status: true, speed: true, txBytes: true, rxBytes: true },
      orderBy: { name: "asc" },
    });

    // Get bandwidth logs grouped by interfaceName
    const logs = await db.bandwidthLog.findMany({
      where: {
        deviceId,
        timestamp: { gte: startDate, lte: endDate },
      },
      select: { interfaceName: true, downloadBps: true, uploadBps: true, totalBps: true, timestamp: true },
      orderBy: { timestamp: "asc" },
    });

    // Group logs by interface name
    const interfaceMap: Record<string, { download: number; upload: number; count: number; peakDownload: number; peakUpload: number; timeSeries: { time: string; download: number; upload: number }[] }> = {};

    for (const log of logs) {
      const key = log.interfaceName || "default";
      if (!interfaceMap[key]) {
        interfaceMap[key] = { download: 0, upload: 0, count: 0, peakDownload: 0, peakUpload: 0, timeSeries: [] };
      }
      interfaceMap[key].download += log.downloadBps;
      interfaceMap[key].upload += log.uploadBps;
      interfaceMap[key].count += 1;
      if (log.downloadBps > interfaceMap[key].peakDownload) interfaceMap[key].peakDownload = log.downloadBps;
      if (log.uploadBps > interfaceMap[key].peakUpload) interfaceMap[key].peakUpload = log.uploadBps;
      if (interfaceMap[key].timeSeries.length < 100) {
        interfaceMap[key].timeSeries.push({
          time: new Date(log.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
          download: log.downloadBps,
          upload: log.uploadBps,
        });
      }
    }

    // Build interface breakdown
    const interfaceBreakdown = interfaces.map((iface) => {
      const stats = interfaceMap[iface.name];
      return {
        id: iface.id,
        name: iface.name,
        description: iface.description,
        type: iface.type,
        status: iface.status,
        speed: iface.speed,
        txBytes: Number(iface.txBytes),
        rxBytes: Number(iface.rxBytes),
        avgDownload: stats ? Math.round(stats.download / stats.count) : 0,
        avgUpload: stats ? Math.round(stats.upload / stats.count) : 0,
        peakDownload: stats ? stats.peakDownload : 0,
        peakUpload: stats ? stats.peakUpload : 0,
        logCount: stats ? stats.count : 0,
        timeSeries: stats ? stats.timeSeries : [],
      };
    });

    // Also include interfaces from logs that aren't in the DeviceInterface table
    const knownNames = new Set(interfaces.map((i) => i.name));
    for (const [name, stats] of Object.entries(interfaceMap)) {
      if (!knownNames.has(name)) {
        interfaceBreakdown.push({
          id: "",
          name,
          description: "",
          type: "VIRTUAL" as const,
          status: "DISABLED" as const,
          speed: 0,
          txBytes: 0,
          rxBytes: 0,
          avgDownload: Math.round(stats.download / stats.count),
          avgUpload: Math.round(stats.upload / stats.count),
          peakDownload: stats.peakDownload,
          peakUpload: stats.peakUpload,
          logCount: stats.count,
          timeSeries: stats.timeSeries,
        });
      }
    }

    return NextResponse.json({ interfaces: interfaceBreakdown });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Bandwidth interfaces GET error:", error);
    return NextResponse.json({ error: "Failed to fetch interface data" }, { status: 500 });
  }
}
