import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { db } from "@/lib/db";

const GW = process.env.GATEWAY_SERVICE_URL || "http://localhost:3005";

// ═══════════════════════════════════════════════════════════════
// Helper: convert ms range string to Date
// ═══════════════════════════════════════════════════════════════
function getRangeStart(range: string): Date {
  const now = new Date();
  const ms: Record<string, number> = {
    "1h": 60 * 60 * 1000,
    "6h": 6 * 60 * 60 * 1000,
    "12h": 12 * 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
    "90d": 90 * 24 * 60 * 60 * 1000,
    "1y": 365 * 24 * 60 * 60 * 1000,
  };
  return new Date(now.getTime() - (ms[range] || ms["24h"]));
}

function getIntervalSeconds(interval: string): number {
  const map: Record<string, number> = {
    "5m": 300,
    "15m": 900,
    "1h": 3600,
    "6h": 21600,
    "1d": 86400,
  };
  return map[interval] || 900;
}

function formatTimeLabel(ts: Date, range: string): string {
  if (["1h", "6h", "12h", "24h"].includes(range)) {
    return ts.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  }
  return ts.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ═══════════════════════════════════════════════════════════════
// Prisma Fallback: query bandwidthLog directly
// ═══════════════════════════════════════════════════════════════

async function prismaTimeseries(range: string, interval: string) {
  const start = getRangeStart(range);
  const intervalSec = getIntervalSeconds(interval);
  const logs = await db.bandwidthLog.findMany({
    where: { timestamp: { gte: start } },
    orderBy: { timestamp: "asc" },
  });

  if (!logs.length) {
    return { data: [] };
  }

  // Group logs into time buckets
  const buckets = new Map<string, { download: number; upload: number; count: number }>();
  for (const log of logs) {
    const ts = new Date(log.timestamp).getTime();
    const bucketTs = Math.floor(ts / (intervalSec * 1000)) * (intervalSec * 1000);
    const key = String(bucketTs);
    if (!buckets.has(key)) {
      buckets.set(key, { download: 0, upload: 0, count: 0 });
    }
    const b = buckets.get(key)!;
    b.download += log.downloadBps;
    b.upload += log.uploadBps;
    b.count += 1;
  }

  // Convert to timeseries format — average per interval
  const data = Array.from(buckets.entries())
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([bucketTs, vals]) => ({
      time: formatTimeLabel(new Date(Number(bucketTs)), range),
      download: Math.round(vals.download / vals.count),
      upload: Math.round(vals.upload / vals.count),
    }));

  return { data };
}

async function prismaSummary(range: string) {
  const start = getRangeStart(range);
  const logs = await db.bandwidthLog.findMany({
    where: { timestamp: { gte: start } },
    orderBy: { timestamp: "asc" },
  });

  if (!logs.length) {
    return {
      data: {
        peakDown: 0,
        avgDown: 0,
        minDown: 0,
        peakUp: 0,
        avgUp: 0,
        minUp: 0,
        totalData: 0,
        dataPoints: 0,
        p95: 0,
        activeSessions: 0,
        currentUtil: 0,
      },
    };
  }

  const downloads = logs.map((l) => l.downloadBps);
  const uploads = logs.map((l) => l.uploadBps);
  const all = [...downloads, ...uploads].sort((a, b) => a - b);
  const p95Idx = Math.floor(all.length * 0.95);

  return {
    data: {
      peakDown: Math.max(...downloads),
      avgDown: Math.round(downloads.reduce((s, v) => s + v, 0) / downloads.length),
      minDown: Math.min(...downloads),
      peakUp: Math.max(...uploads),
      avgUp: Math.round(uploads.reduce((s, v) => s + v, 0) / uploads.length),
      minUp: Math.min(...uploads),
      totalData: logs.reduce((s, l) => s + l.totalBps, 0),
      dataPoints: logs.length,
      p95: all[p95Idx] || 0,
      activeSessions: await db.subscriber.count({ where: { status: "ACTIVE" } }),
      currentUtil: Math.round(((logs[logs.length - 1]?.totalBps || 0) / 1_000_000_000) * 100),
    },
  };
}

async function prismaTopUsers(limit: number, _period: string) {
  // Top users from usageLog (subscriber-level data)
  const usageLogs = await db.usageLog.findMany({
    orderBy: { totalBytes: "desc" },
    take: limit,
    include: {
      Subscriber: {
        select: { serviceUsername: true, ipAddress: true, Plan: { select: { name: true } } },
      },
    },
  });

  const periodSeconds: Record<string, number> = {
    "24h": 86400,
    "7d": 604800,
    "30d": 2592000,
  };

  const data = usageLogs.map((log, i) => {
    const dl = Number(log.downloadBytes);
    const ul = Number(log.uploadBytes);
    return {
      rank: i + 1,
      username: log.Subscriber?.serviceUsername || "unknown",
      ip: log.Subscriber?.ipAddress || "",
      download: dl,
      upload: ul,
      total: dl + ul,
      avgSpeed: Math.round((dl + ul) / (periodSeconds[_period] || 604800)),
    };
  });

  return { data };
}

async function prismaPoolReport(range: string) {
  const start = getRangeStart(range);

  // Group bandwidth logs by device (as pool proxy)
  const deviceLogs = await db.bandwidthLog.groupBy({
    by: ["deviceId"],
    where: { timestamp: { gte: start } },
    _avg: { downloadBps: true, uploadBps: true },
    _sum: { totalBps: true },
    _count: { id: true },
  });

  const deviceIds = deviceLogs.map((d) => d.deviceId);
  const devices = await db.networkDevice.findMany({
    where: { id: { in: deviceIds } },
    select: { id: true, name: true, ipAddress: true, type: true },
  });
  const deviceMap = new Map(devices.map((d) => [d.id, d]));

  const data = deviceLogs.map((dl) => {
    const dev = deviceMap.get(dl.deviceId);
    const avgDown = dl._avg.downloadBps || 0;
    const avgUp = dl._avg.uploadBps || 0;
    return {
      name: dev?.name || dl.deviceId,
      subnet: dev?.ipAddress || "N/A",
      utilization: Math.min(100, Math.round((avgDown / 1_000_000_000) * 100)),
      avgDown,
      avgUp,
      totalData: dl._sum.totalBps || 0,
    };
  });

  return { data };
}

// ═══════════════════════════════════════════════════════════════
// Prisma Fallback: pool timeseries
// ═══════════════════════════════════════════════════════════════

async function prismaPoolTimeseries(range: string, interval: string) {
  const start = getRangeStart(range);
  const intervalSec = getIntervalSeconds(interval);

  const logs = await db.bandwidthLog.findMany({
    where: { timestamp: { gte: start } },
    orderBy: { timestamp: "asc" },
    include: {
      device: { select: { id: true, name: true } },
    },
  });

  if (!logs.length) return { data: [], pools: [] };

  // Group by time bucket AND device
  const bucketDeviceMap = new Map<string, Map<string, { download: number; upload: number; count: number }>>();
  const poolNames = new Set<string>();

  for (const log of logs) {
    const ts = new Date(log.timestamp).getTime();
    const bucketTs = Math.floor(ts / (intervalSec * 1000)) * (intervalSec * 1000);
    const timeKey = String(bucketTs);
    const poolName = log.device?.name || log.deviceId;

    if (!bucketDeviceMap.has(timeKey)) {
      bucketDeviceMap.set(timeKey, new Map());
    }
    const deviceMap = bucketDeviceMap.get(timeKey)!;

    if (!deviceMap.has(poolName)) {
      deviceMap.set(poolName, { download: 0, upload: 0, count: 0 });
    }
    const vals = deviceMap.get(poolName)!;
    vals.download += log.downloadBps;
    vals.upload += log.uploadBps;
    vals.count += 1;
    poolNames.add(poolName);
  }

  const pools = Array.from(poolNames).sort();
  const data = Array.from(bucketDeviceMap.entries())
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([bucketTs, deviceMap]) => {
      const row: Record<string, number | string> = {
        time: formatTimeLabel(new Date(Number(bucketTs)), range),
      };
      for (const pool of pools) {
        const vals = deviceMap.get(pool);
        row[pool] = vals ? Math.round(vals.download / vals.count) : 0;
      }
      return row;
    });

  return { data, pools };
}

// ═══════════════════════════════════════════════════════════════
// Route handler
// ═══════════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") || "timeseries";
  const range = searchParams.get("range") || "24h";
  const interval = searchParams.get("interval") || "15m";
  const limit = parseInt(searchParams.get("limit") || "10", 10);
  const period = searchParams.get("period") || "7d";

  // Try auth
  try {
    await requireAuth(req);
  } catch (error) {
    if (error instanceof AuthError)
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }

  // Build gateway path
  const sp = searchParams.toString();
  const basePath = new URL(req.url).pathname.replace("/api/bw-reports", "/api/bw");

  // Try gateway service first
  try {
    const gwUrl = `${GW}${basePath}${sp ? "?" + sp : ""}`;
    const res = await fetch(gwUrl, {
      headers: { Cookie: req.headers.get("Cookie") || "" },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data, { status: res.status });
    }
  } catch {
    // Gateway unavailable — fall through to Prisma
  }

  // ═════════════════════════════════════════════════════════
  // PRISMA FALLBACK
  // ═════════════════════════════════════════════════════════
  try {
    switch (type) {
      case "summary":
        return NextResponse.json(await prismaSummary(range));
      case "top-users":
        return NextResponse.json(await prismaTopUsers(limit, period));
      case "pool-report":
        return NextResponse.json(await prismaPoolReport(range));
      case "pool-timeseries":
        return NextResponse.json(await prismaPoolTimeseries(range, interval));
      case "timeseries":
      default:
        return NextResponse.json(await prismaTimeseries(range, interval));
    }
  } catch (error) {
    console.error("BW Reports Prisma fallback error:", error);
    return NextResponse.json(
      { error: "Failed to fetch bandwidth data" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    try {
      await requireAuth(req);
    } catch (error) {
      if (error instanceof AuthError)
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    const body = await req.json();
    const res = await fetch(`${GW}/api/bw/samples`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: req.headers.get("Cookie") || "",
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: "Gateway service unavailable" },
      { status: 503 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const sp = new URL(req.url).searchParams.toString();
  try {
    try {
      await requireAuth(req);
    } catch (error) {
      if (error instanceof AuthError)
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const res = await fetch(`${GW}/api/bw/samples/cleanup?${sp}`, {
      method: "DELETE",
      headers: { Cookie: req.headers.get("Cookie") || "" },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: "Gateway service unavailable" },
      { status: 503 }
    );
  }
}
