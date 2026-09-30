// ═══════════════════════════════════════════════════════════════
// CRYPTSK nDPI Service — Port 3031
//
// Domain-to-Application Correlator (architecture §35 DPI Classification).
//
// Real nDPI requires libndpi + packet capture (pcap on a mirror port) and
// is not feasible in a Node sandbox. Instead, this service consumes NatLog
// rows written by mini-services/nat-logger (port 3016) and correlates
// dstDomain → application using a hardcoded catalog of ~30 known apps.
//
// Resulting DpiClassification rows are aggregated per (subscriberIp, appName,
// hour bucket) and persisted via Prisma.
//
// Endpoints:
//   GET  /health                — service status
//   GET  /classifications?limit=100 — recent DpiClassification rows
//   POST /correlate             — manually trigger a correlation run
//   GET  /stats                 — aggregate stats over all classifications
//
// Auto-run: every 60s via setInterval.
// ═══════════════════════════════════════════════════════════════

import { PrismaClient, Prisma } from "@prisma/client";

// ─── Configuration ────────────────────────────────────────────────
const PORT = 3031;
const SERVICE_START = Date.now();
const CORRELATION_WINDOW_MIN = 5; // look back N minutes
const CORRELATION_INTERVAL_MS = 60_000; // auto-run every 60s

const db = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL ||
        "postgresql://cryptsk:Cryptsk2026@localhost:5432/ispplatform",
    },
  },
});

// ─── CORS ─────────────────────────────────────────────────────────
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
  "Access-Control-Allow-Credentials": "true",
};

// BigInt-safe JSON serialization
function json(data: unknown, status = 200): Response {
  return new Response(
    JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
    {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    }
  );
}

function jsonErr(message: string, status = 400): Response {
  return json({ error: message }, status);
}

// ─── Domain → Application Map ─────────────────────────────────────
// 30 entries covering common ISP subscriber traffic.
// Match priority: exact match (lowercase) → suffix match (.youtube.com) → default.

interface AppInfo {
  name: string;
  category: string;
  protocol: string;
  risk: string; // LOW | MEDIUM | HIGH | CRITICAL
}

const APP_MAP: Record<string, AppInfo> = {
  "youtube.com":      { name: "YouTube",      category: "Streaming",      protocol: "HTTPS",   risk: "LOW" },
  "youtu.be":         { name: "YouTube",      category: "Streaming",      protocol: "HTTPS",   risk: "LOW" },
  "netflix.com":      { name: "Netflix",      category: "Streaming",      protocol: "HTTPS",   risk: "LOW" },
  "whatsapp.com":     { name: "WhatsApp",     category: "Messaging",      protocol: "TLS",     risk: "LOW" },
  "instagram.com":    { name: "Instagram",    category: "Social",          protocol: "HTTPS",   risk: "MEDIUM" },
  "tiktok.com":       { name: "TikTok",       category: "Social",          protocol: "HTTPS",   risk: "MEDIUM" },
  "zoom.us":          { name: "Zoom",         category: "Collaboration",   protocol: "UDP",      risk: "LOW" },
  "fortnite.com":     { name: "Fortnite",     category: "Gaming",          protocol: "UDP",      risk: "MEDIUM" },
  "bittorrent.com":   { name: "BitTorrent",   category: "P2P",             protocol: "TCP/UDP",  risk: "HIGH" },
  "torproject.org":   { name: "Tor",          category: "Anonymizer",      protocol: "TLS",      risk: "CRITICAL" },
  "spotify.com":      { name: "Spotify",      category: "Music",           protocol: "HTTPS",   risk: "LOW" },
  "github.com":       { name: "GitHub",       category: "Developer",       protocol: "HTTPS",   risk: "LOW" },
  "microsoft.com":    { name: "Microsoft 365", category: "Cloud",          protocol: "HTTPS",   risk: "LOW" },
  "telegram.org":     { name: "Telegram",     category: "Messaging",       protocol: "TLS",     risk: "LOW" },
  "twitch.tv":        { name: "Twitch",       category: "Streaming",      protocol: "HTTPS",   risk: "MEDIUM" },
  "steampowered.com": { name: "Steam",        category: "Gaming",          protocol: "HTTPS",   risk: "LOW" },
  "google.com":       { name: "Google",       category: "Search",          protocol: "HTTPS",   risk: "LOW" },
  "facebook.com":     { name: "Facebook",     category: "Social",          protocol: "HTTPS",   risk: "MEDIUM" },
  "twitter.com":      { name: "Twitter",      category: "Social",          protocol: "HTTPS",   risk: "MEDIUM" },
  "amazon.com":       { name: "Amazon",       category: "Shopping",        protocol: "HTTPS",   risk: "LOW" },
  "cloudflare.com":   { name: "Cloudflare",   category: "CDN",             protocol: "HTTPS",   risk: "LOW" },
  "reddit.com":       { name: "Reddit",       category: "Social",          protocol: "HTTPS",   risk: "LOW" },
  "linkedin.com":     { name: "LinkedIn",     category: "Social",          protocol: "HTTPS",   risk: "LOW" },
  "discord.com":      { name: "Discord",       category: "Messaging",       protocol: "TLS",     risk: "LOW" },
  "slack.com":        { name: "Slack",         category: "Collaboration",   protocol: "HTTPS",   risk: "LOW" },
  "dropbox.com":      { name: "Dropbox",       category: "Cloud",           protocol: "HTTPS",   risk: "LOW" },
  "apple.com":        { name: "Apple",          category: "Cloud",           protocol: "HTTPS",   risk: "LOW" },
  "wikipedia.org":    { name: "Wikipedia",     category: "Reference",       protocol: "HTTPS",   risk: "LOW" },
  "openai.com":       { name: "OpenAI",        category: "AI",              protocol: "HTTPS",   risk: "MEDIUM" },
  "chatgpt.com":      { name: "ChatGPT",        category: "AI",              protocol: "HTTPS",   risk: "MEDIUM" },
};

const DEFAULT_APP: AppInfo = {
  name: "Unknown",
  category: "Other",
  protocol: "HTTPS",
  risk: "LOW",
};

// Pre-compute sorted list of known suffix domains for suffix matching.
// Sorted by length descending so we match the most specific suffix first
// (e.g. "m.youtube.com" should match "youtube.com" not "google.com").
const APP_SUFFIXES = Object.keys(APP_MAP)
  .map((d) => d.toLowerCase())
  .sort((a, b) => b.length - a.length);

function lookupApp(rawDomain: string): AppInfo {
  if (!rawDomain) return DEFAULT_APP;
  const d = rawDomain.toLowerCase().trim();
  // strip leading dot(s) and trailing dot
  const cleaned = d.replace(/^\.+/, "").replace(/\.+$/, "");
  if (!cleaned) return DEFAULT_APP;

  // 1. Exact match
  if (APP_MAP[cleaned]) return APP_MAP[cleaned];

  // 2. Suffix match — subdomain of a known app domain
  for (const suffix of APP_SUFFIXES) {
    if (cleaned.endsWith("." + suffix)) {
      return APP_MAP[suffix];
    }
  }

  return DEFAULT_APP;
}

// ─── Runtime state ────────────────────────────────────────────────
let classificationsGenerated = 0;
let lastRunAt: Date | null = null;
let lastRunSummary: { natLogScanned: number; rowsUpserted: number; durationMs: number } | null = null;

// Track the timestamp of the most recent NatLog entry we've already processed.
// Initial value: now - 5min so the first run picks up recent entries only.
let lastProcessedNatLogAt: Date = new Date(Date.now() - CORRELATION_WINDOW_MIN * 60 * 1000);

// ─── Hour bucket helper ──────────────────────────────────────────
// Truncate a Date to the start of its hour (UTC).
function hourBucket(d: Date): Date {
  const ms = d.getTime();
  const bucketMs = Math.floor(ms / 3_600_000) * 3_600_000;
  return new Date(bucketMs);
}

// ─── Correlation Logic ────────────────────────────────────────────
// Pulls NatLog rows newer than lastProcessedNatLogAt, aggregates by
// (subscriberIp, appName, hour bucket), and upserts DpiClassification rows.
//
// Upsert is "manual" because DpiClassification has no @@unique constraint
// on (subscriberIp, appName, detectedAt) — we look up the existing row
// first, then either create or increment.

interface AggBucket {
  subscriberIp: string;
  subscriberId: string;
  appName: string;
  appCategory: string;
  protocol: string;
  riskLevel: string;
  bytesIn: bigint;
  bytesOut: bigint;
  flows: number;
  bucket: Date; // hour-truncated timestamp
}

interface CorrelateResult {
  natLogScanned: number;
  rowsUpserted: number;
  durationMs: number;
  startedAt: Date;
  finishedAt: Date;
  lastProcessedNatLogAt: Date;
}

async function runCorrelation(): Promise<CorrelateResult> {
  const startedAt = new Date();
  const t0 = Date.now();

  // Window floor: last 5 minutes. Ceiling: lastProcessedNatLogAt (avoid reprocessing).
  const windowFloor = new Date(Date.now() - CORRELATION_WINDOW_MIN * 60 * 1000);
  const since = lastProcessedNatLogAt.getTime() < windowFloor.getTime()
    ? windowFloor
    : lastProcessedNatLogAt;

  // Fetch NatLog entries newer than `since` (and at most last 5 min anyway).
  // Sort ascending so we can advance lastProcessedNatLogAt to the max timestamp.
  const natLogs = await db.natLog.findMany({
    where: {
      timestamp: { gt: since },
      // Also enforce the 5-min window ceiling (in case clock skew pushes some entries past the window)
    },
    orderBy: { timestamp: "asc" },
    take: 5000, // safety cap
  });

  if (natLogs.length === 0) {
    const finishedAt = new Date();
    lastRunAt = finishedAt;
    lastRunSummary = { natLogScanned: 0, rowsUpserted: 0, durationMs: Date.now() - t0 };
    return {
      natLogScanned: 0,
      rowsUpserted: 0,
      durationMs: Date.now() - t0,
      startedAt,
      finishedAt,
      lastProcessedNatLogAt: lastProcessedNatLogAt,
    };
  }

  // Aggregate
  const buckets = new Map<string, AggBucket>();

  for (const nl of natLogs) {
    const app = lookupApp(nl.dstDomain);
    const bucket = hourBucket(nl.timestamp);
    const key = `${nl.subscriberIp || "unknown"}|${app.name}|${bucket.toISOString()}`;

    const existing = buckets.get(key);
    if (existing) {
      existing.bytesIn += nl.bytesReceived || 0n;
      existing.bytesOut += nl.bytesSent || 0n;
      existing.flows += 1;
      // Prefer non-empty subscriberId from any flow
      if (!existing.subscriberId && nl.subscriberId) {
        existing.subscriberId = nl.subscriberId;
      }
    } else {
      buckets.set(key, {
        subscriberIp: nl.subscriberIp || "unknown",
        subscriberId: nl.subscriberId || "",
        appName: app.name,
        appCategory: app.category,
        protocol: app.protocol,
        riskLevel: app.risk,
        bytesIn: nl.bytesReceived || 0n,
        bytesOut: nl.bytesSent || 0n,
        flows: 1,
        bucket,
      });
    }
  }

  // Upsert each bucket. We do this sequentially (not in parallel) to avoid
  // overwhelming Prisma's connection pool. With ~30 distinct apps per subscriber
  // and ~100 subscribers, that's at most ~3000 buckets per run — well within budget.
  let rowsUpserted = 0;
  for (const bucket of buckets.values()) {
    try {
      // Look up existing row for (subscriberIp, appName, bucket).
      const existing = await db.dpiClassification.findFirst({
        where: {
          subscriberIp: bucket.subscriberIp,
          appName: bucket.appName,
          detectedAt: bucket.bucket,
        },
      });

      if (existing) {
        // Increment bytes/flows on the existing row.
        await db.dpiClassification.update({
          where: { id: existing.id },
          data: {
            bytesIn: { increment: bucket.bytesIn },
            bytesOut: { increment: bucket.bytesOut },
            flows: { increment: bucket.flows },
            // refresh subscriberId if we have a better one
            ...(bucket.subscriberId && !existing.subscriberId
              ? { subscriberId: bucket.subscriberId }
              : {}),
          },
        });
      } else {
        await db.dpiClassification.create({
          data: {
            subscriberIp: bucket.subscriberIp,
            subscriberId: bucket.subscriberId,
            appName: bucket.appName,
            appCategory: bucket.appCategory,
            protocol: bucket.protocol,
            bytesIn: bucket.bytesIn,
            bytesOut: bucket.bytesOut,
            flows: bucket.flows,
            riskLevel: bucket.riskLevel,
            detectedAt: bucket.bucket,
          },
        });
      }
      rowsUpserted++;
    } catch (err: unknown) {
      // Log and continue — one bad bucket shouldn't fail the whole run.
      console.error(
        `[ndpi] upsert failed for subscriber=${bucket.subscriberIp} app=${bucket.appName} bucket=${bucket.bucket.toISOString()}:`,
        (err as Error)?.message ?? String(err)
      );
    }
  }

  // Advance the high-water mark to the latest NatLog timestamp we processed.
  const maxTimestamp = natLogs[natLogs.length - 1].timestamp;
  lastProcessedNatLogAt = maxTimestamp;
  classificationsGenerated += rowsUpserted;

  const finishedAt = new Date();
  const durationMs = Date.now() - t0;
  lastRunAt = finishedAt;
  lastRunSummary = { natLogScanned: natLogs.length, rowsUpserted, durationMs };

  return {
    natLogScanned: natLogs.length,
    rowsUpserted,
    durationMs,
    startedAt,
    finishedAt,
    lastProcessedNatLogAt: lastProcessedNatLogAt,
  };
}

// ─── HTTP Handlers ────────────────────────────────────────────────
async function handleRequest(req: Request, path: string, url: URL): Promise<Response> {
  // ── GET /health ──────────────────────────────────────────────
  if (path === "/health" && req.method === "GET") {
    let natLogCount = 0;
    let dpiCount = 0;
    try {
      [natLogCount, dpiCount] = await Promise.all([
        db.natLog.count(),
        db.dpiClassification.count(),
      ]);
    } catch {
      // DB not ready — return zeros
    }
    return json({
      status: "ok",
      service: "ndpi-service",
      port: PORT,
      uptime: Math.floor((Date.now() - SERVICE_START) / 1000),
      classificationsGenerated,
      lastRunAt,
      lastRunSummary,
      db: {
        natLogRows: natLogCount,
        dpiClassificationRows: dpiCount,
      },
      correlation: {
        windowMin: CORRELATION_WINDOW_MIN,
        intervalMs: CORRELATION_INTERVAL_MS,
        lastProcessedNatLogAt,
      },
    });
  }

  // ── GET /classifications?limit=100 ───────────────────────────
  if (path === "/classifications" && req.method === "GET") {
    const limitRaw = parseInt(url.searchParams.get("limit") ?? "100", 10);
    const limit = Math.min(
      Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 100,
      1000
    );
    const subscriberIp = url.searchParams.get("subscriberIp");
    const appName = url.searchParams.get("appName");

    const where: Prisma.DpiClassificationWhereInput = {};
    if (subscriberIp) where.subscriberIp = subscriberIp;
    if (appName) where.appName = appName;

    const rows = await db.dpiClassification.findMany({
      where,
      orderBy: { detectedAt: "desc" },
      take: limit,
    });

    return json({
      count: rows.length,
      classifications: rows.map((r) => ({
        ...r,
        bytesIn: r.bytesIn.toString(),
        bytesOut: r.bytesOut.toString(),
      })),
    });
  }

  // ── POST /correlate ──────────────────────────────────────────
  if (path === "/correlate" && req.method === "POST") {
    try {
      const result = await runCorrelation();
      return json({
        ok: true,
        ...result,
        classificationsGenerated,
      });
    } catch (err: unknown) {
      console.error("[ndpi] correlation failed:", err);
      return jsonErr(
        `Correlation failed: ${(err as Error)?.message ?? String(err)}`,
        500
      );
    }
  }

  // ── GET /stats ───────────────────────────────────────────────
  if (path === "/stats" && req.method === "GET") {
    // Aggregate all DpiClassification rows in memory.
    // For very large DBs this would need SQL GROUP BY, but for an ISP with
    // a few thousand classifications per hour it's fine.
    const all = await db.dpiClassification.findMany({
      select: {
        appName: true,
        appCategory: true,
        riskLevel: true,
        bytesIn: true,
        bytesOut: true,
        flows: true,
      },
    });

    const byRisk: Record<string, number> = {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
      CRITICAL: 0,
    };
    const byCategory: Record<string, number> = {};
    const topAppsMap = new Map<
      string,
      { name: string; count: number; bytes: bigint }
    >();

    for (const r of all) {
      const risk = (r.riskLevel || "LOW").toUpperCase();
      byRisk[risk] = (byRisk[risk] ?? 0) + 1;

      const cat = r.appCategory || "Other";
      byCategory[cat] = (byCategory[cat] ?? 0) + 1;

      const appName = r.appName || "Unknown";
      const cur = topAppsMap.get(appName) ?? {
        name: appName,
        count: 0,
        bytes: 0n,
      };
      cur.count += 1;
      cur.bytes += (r.bytesIn || 0n) + (r.bytesOut || 0n);
      topAppsMap.set(appName, cur);
    }

    const topApps = Array.from(topAppsMap.values())
      .sort((a, b) => (b.bytes > a.bytes ? 1 : b.bytes < a.bytes ? -1 : 0))
      .slice(0, 20)
      .map((a) => ({
        name: a.name,
        count: a.count,
        bytes: a.bytes.toString(),
      }));

    return json({
      totalClassifications: all.length,
      byRisk,
      byCategory,
      topApps,
      classificationsGenerated,
      lastRunAt,
      lastRunSummary,
    });
  }

  // ── GET / — service banner ───────────────────────────────────
  if (path === "/" && req.method === "GET") {
    return json({
      service: "ndpi-service",
      port: PORT,
      endpoints: ["/health", "/classifications", "/correlate", "/stats"],
      appCatalogSize: Object.keys(APP_MAP).length,
    });
  }

  return jsonErr(`Not Found: ${path}`, 404);
}

// ─── HTTP Server ─────────────────────────────────────────────────
const server = Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    return handleRequest(req, path, url).catch((err: unknown) => {
      console.error("[ndpi] unhandled error:", err);
      return jsonErr(
        `Internal Server Error: ${(err as Error)?.message ?? String(err)}`,
        500
      );
    });
  },
});

// ─── Auto-correlation timer ──────────────────────────────────────
const correlationTimer = setInterval(() => {
  runCorrelation().catch((err: unknown) =>
    console.error(
      "[ndpi] interval correlation failed:",
      (err as Error)?.message ?? String(err)
    )
  );
}, CORRELATION_INTERVAL_MS);
correlationTimer.unref?.();

// Kick off an initial run shortly after boot (give Prisma time to connect).
setTimeout(() => {
  runCorrelation().catch((err: unknown) =>
    console.error(
      "[ndpi] initial correlation failed:",
      (err as Error)?.message ?? String(err)
    )
  );
}, 5000);

// ─── Startup Banner ──────────────────────────────────────────────
console.log("╔══════════════════════════════════════════╗");
console.log(`║  CRYPTSK nDPI Service — Port ${PORT}          ║`);
console.log(`║  Domain-to-App correlator (30 apps)       ║`);
console.log(`║  Correlation interval: ${CORRELATION_INTERVAL_MS / 1000}s           ║`);
console.log("╚══════════════════════════════════════════╝");

// ─── Graceful shutdown ───────────────────────────────────────────
async function shutdown(sig: string): Promise<void> {
  console.log(`[ndpi] shutting down (${sig})...`);
  try {
    await db.$disconnect();
  } catch {
    // ignore
  }
  server.stop();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

export {};
