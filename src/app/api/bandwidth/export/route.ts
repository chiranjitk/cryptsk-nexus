import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { safeJsonParse } from "@/lib/utils";

// GET /api/bandwidth/export - Export bandwidth data as CSV
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");
    const deviceId = searchParams.get("deviceId") || "";
    const aggregate = searchParams.get("aggregate") || "per-device";

    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;

    if (startDateParam && endDateParam) {
      startDate = new Date(startDateParam);
      endDate = new Date(endDateParam);
    } else {
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    // Fetch thresholds
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

    // Build device filter
    const deviceWhere: Record<string, unknown> = {
      status: { in: ["ONLINE", "WARNING"] },
    };
    if (deviceId) deviceWhere.id = deviceId;

    const devices = await db.networkDevice.findMany({
      where: deviceWhere,
      select: {
        id: true,
        name: true,
        ipAddress: true,
        type: true,
        bandwidthLogs: {
          where: { timestamp: { gte: startDate, lte: endDate } },
          orderBy: { timestamp: "asc" },
          select: {
            downloadBps: true,
            uploadBps: true,
            totalBps: true,
            timestamp: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    // Helper to format bps to Mbps
    function toMbps(bps: number): string {
      return (bps / 1_000_000).toFixed(2);
    }

    const header = "Device,IP Address,Type,Avg Download (Mbps),Avg Upload (Mbps),Peak Download (Mbps),Peak Upload (Mbps),Current Load (Mbps),Log Entries,Download Alert,Upload Alert";

    const rows = devices.map((device) => {
      const logs = device.bandwidthLogs;
      const avgDownload = logs.length > 0
        ? Math.round(logs.reduce((s, l) => s + l.downloadBps, 0) / logs.length)
        : 0;
      const avgUpload = logs.length > 0
        ? Math.round(logs.reduce((s, l) => s + l.uploadBps, 0) / logs.length)
        : 0;
      const peakDownload = logs.length > 0 ? Math.max(...logs.map((l) => l.downloadBps)) : 0;
      const peakUpload = logs.length > 0 ? Math.max(...logs.map((l) => l.uploadBps)) : 0;
      const currentLoad = logs.length > 0 ? logs[logs.length - 1].totalBps : 0;

      const dlAlert = peakDownload > downloadThresholdMbps * 1_000_000 ? "YES" : "No";
      const ulAlert = peakUpload > uploadThresholdMbps * 1_000_000 ? "YES" : "No";

      return [
        `"${(device.name || "").replace(/"/g, '""')}"`,
        device.ipAddress,
        device.type,
        toMbps(avgDownload),
        toMbps(avgUpload),
        toMbps(peakDownload),
        toMbps(peakUpload),
        toMbps(currentLoad),
        logs.length,
        dlAlert,
        ulAlert,
      ].join(",");
    });

    // Add aggregate row
    if (aggregate === "total" && devices.length > 0) {
      const allLogs = devices.flatMap((d) => d.bandwidthLogs);
      const avgDownload = allLogs.length > 0
        ? Math.round(allLogs.reduce((s, l) => s + l.downloadBps, 0) / allLogs.length)
        : 0;
      const avgUpload = allLogs.length > 0
        ? Math.round(allLogs.reduce((s, l) => s + l.uploadBps, 0) / allLogs.length)
        : 0;
      const peakDownload = allLogs.length > 0 ? Math.max(...allLogs.map((l) => l.downloadBps)) : 0;
      const peakUpload = allLogs.length > 0 ? Math.max(...allLogs.map((l) => l.uploadBps)) : 0;

      rows.unshift([
        "TOTAL (All Devices)",
        "—",
        "AGGREGATE",
        toMbps(avgDownload),
        toMbps(avgUpload),
        toMbps(peakDownload),
        toMbps(peakUpload),
        toMbps(devices.reduce((s, d) => {
          const logs = d.bandwidthLogs;
          return s + (logs.length > 0 ? logs[logs.length - 1].totalBps : 0);
        }, 0)),
        allLogs.length,
        peakDownload > downloadThresholdMbps * 1_000_000 ? "YES" : "No",
        peakUpload > uploadThresholdMbps * 1_000_000 ? "YES" : "No",
      ].join(","));
    }

    // Footer info
    rows.push("");
    rows.push(`Export Date,${new Date().toISOString()}`);
    rows.push(`Date Range,${startDate.toISOString()} to ${endDate.toISOString()}`);
    rows.push(`Download Threshold,${downloadThresholdMbps} Mbps`);
    rows.push(`Upload Threshold,${uploadThresholdMbps} Mbps`);

    const csv = [header, ...rows].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="bandwidth-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Bandwidth export error:", error);
    return NextResponse.json(
      { error: "Failed to export bandwidth data" },
      { status: 500 }
    );
  }
}
