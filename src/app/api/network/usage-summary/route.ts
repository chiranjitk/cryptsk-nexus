import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ── CORS Headers ────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ── OPTIONS handler for CORS preflight ──────────────────────────────

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// ── GET /api/network/usage-summary ──────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Aggregate bandwidth stats from the last 24 hours
    const summary = await db.bandwidthLog.aggregate({
      _sum: {
        downloadBps: true,
        uploadBps: true,
        totalBps: true,
      },
      _avg: {
        downloadBps: true,
        uploadBps: true,
        totalBps: true,
      },
      _max: {
        downloadBps: true,
        uploadBps: true,
        totalBps: true,
      },
      _count: true,
      where: {
        timestamp: { gte: oneDayAgo },
      },
    });

    // Find peak usage entry
    const peakEntry = await db.bandwidthLog.findFirst({
      where: { timestamp: { gte: oneDayAgo } },
      orderBy: { totalBps: "desc" },
      select: {
        totalBps: true,
        downloadBps: true,
        uploadBps: true,
        timestamp: true,
        device: { select: { id: true, name: true, ipAddress: true } },
      },
    });

    // Count unique devices with activity
    const activeDevices = await db.bandwidthLog.groupBy({
      by: ["deviceId"],
      where: { timestamp: { gte: oneDayAgo } },
    });

    // Get per-device breakdown
    const deviceBreakdown = await db.bandwidthLog.groupBy({
      by: ["deviceId"],
      where: { timestamp: { gte: oneDayAgo } },
      _sum: {
        downloadBps: true,
        uploadBps: true,
        totalBps: true,
      },
      _avg: {
        downloadBps: true,
        uploadBps: true,
        totalBps: true,
      },
    });

    // Enrich device breakdown with device names
    const deviceIds = deviceBreakdown.map((d) => d.deviceId);
    const deviceNames = deviceIds.length > 0
      ? await db.networkDevice.findMany({
          where: { id: { in: deviceIds } },
          select: { id: true, name: true, ipAddress: true },
        })
      : [];

    const nameMap = new Map(deviceNames.map((d) => [d.id, d]));

    const devices = deviceBreakdown
      .map((d) => ({
        deviceId: d.deviceId,
        deviceName: nameMap.get(d.deviceId)?.name ?? "Unknown",
        ipAddress: nameMap.get(d.deviceId)?.ipAddress ?? "",
        totalDownload: Number(d._sum.downloadBps ?? 0),
        totalUpload: Number(d._sum.uploadBps ?? 0),
        totalBandwidth: Number(d._sum.totalBps ?? 0),
        avgDownload: Number(d._avg.downloadBps ?? 0),
        avgUpload: Number(d._avg.uploadBps ?? 0),
        avgBandwidth: Number(d._avg.totalBps ?? 0),
      }))
      .sort((a, b) => b.totalBandwidth - a.totalBandwidth);

    return NextResponse.json(
      {
        period: "24h",
        from: oneDayAgo.toISOString(),
        to: now.toISOString(),
        aggregate: {
          totalDownload: Number(summary._sum.downloadBps ?? 0),
          totalUpload: Number(summary._sum.uploadBps ?? 0),
          totalBandwidth: Number(summary._sum.totalBps ?? 0),
          avgDownload: Number(summary._avg.downloadBps ?? 0),
          avgUpload: Number(summary._avg.uploadBps ?? 0),
          avgBandwidth: Number(summary._avg.totalBps ?? 0),
          peakDownload: Number(summary._max.downloadBps ?? 0),
          peakUpload: Number(summary._max.uploadBps ?? 0),
          peakBandwidth: Number(summary._max.totalBps ?? 0),
        },
        peakUsage: peakEntry
          ? {
              totalBps: Number(peakEntry.totalBps),
              downloadBps: Number(peakEntry.downloadBps),
              uploadBps: Number(peakEntry.uploadBps),
              timestamp: peakEntry.timestamp.toISOString(),
              device: peakEntry.device,
            }
          : null,
        activeDeviceCount: activeDevices.length,
        logCount: Number(summary._count ?? 0),
        devices,
        timestamp: now.toISOString(),
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode, headers: corsHeaders }
      );
    }
    console.error("Network usage summary fetch failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch usage summary" },
      { status: 500, headers: corsHeaders }
    );
  }
}
