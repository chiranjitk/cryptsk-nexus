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
    include: { Plan: true },
  });
}

// GET /api/selfcare/speed-history — Daily speed aggregation over last 30 days
export async function GET(req: NextRequest) {
  try {
    const subscriber = await getSubscriberFromToken(req);
    if (!subscriber) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    // Get last 30 days of usage data
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    const startDateStr = startDate.toISOString().slice(0, 10);

    const usageRecords = await db.dataUsage.findMany({
      where: {
        subscriberId: subscriber.id,
        date: { gte: startDateStr },
      },
      orderBy: { date: "asc" },
    });

    if (usageRecords.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          daily: [],
          averages: { download: 0, upload: 0 },
          peak: { download: 0, upload: 0, date: null },
        },
      });
    }

    // Aggregate daily and convert MB to approximate Mbps
    // Mbps = (MB * 8 * 1024 * 1024) / (seconds in a day)
    // Using MB → Mbps: Mbps ≈ MB * 0.0000886 (assuming spread over 86400 seconds)
    // Simplified: we show MB as a proxy for daily throughput
    // For a more meaningful metric, we convert to average Mbps assuming 24h usage
    const secondsPerDay = 86400;
    const mbToBits = 8 * 1024 * 1024; // 1 MB in bits

    const daily = usageRecords.map((r) => {
      const downloadMbps = parseFloat(
        ((r.downloadMb * mbToBits) / secondsPerDay).toFixed(2)
      );
      const uploadMbps = parseFloat(
        ((r.uploadMb * mbToBits) / secondsPerDay).toFixed(2)
      );
      return {
        date: r.date,
        downloadMbps,
        uploadMbps,
        downloadMb: r.downloadMb,
        uploadMb: r.uploadMb,
      };
    });

    // Calculate averages
    const avgDownload =
      daily.reduce((sum, d) => sum + d.downloadMbps, 0) / daily.length;
    const avgUpload =
      daily.reduce((sum, d) => sum + d.uploadMbps, 0) / daily.length;

    // Calculate peak
    let peakDownload = 0;
    let peakUpload = 0;
    let peakDate: string | null = null;
    for (const d of daily) {
      if (d.downloadMbps > peakDownload) {
        peakDownload = d.downloadMbps;
        peakDate = d.date;
      }
      if (d.uploadMbps > peakUpload) {
        peakUpload = d.uploadMbps;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        daily,
        averages: {
          download: parseFloat(avgDownload.toFixed(2)),
          upload: parseFloat(avgUpload.toFixed(2)),
        },
        peak: {
          download: parseFloat(peakDownload.toFixed(2)),
          upload: parseFloat(peakUpload.toFixed(2)),
          date: peakDate,
        },
        planSpeedDown: (subscriber.Plan?.downloadSpeed || 0) / 1000,
        planSpeedUp: (subscriber.Plan?.uploadSpeed || 0) / 1000,
      },
    });
  } catch (error) {
    console.error("[selfcare-speed-history] Error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
