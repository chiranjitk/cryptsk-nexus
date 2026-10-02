// ═══════════════════════════════════════════════════════════════
// CRYPTSK nDPI Service — Port 3031
//
// Domain-to-Application Correlator (architecture §35 DPI Classification).
//
// Real nDPI requires libndpi + packet capture (pcap on a mirror port) and
// is not feasible in a Node sandbox. Instead, this service consumes NatLog
// rows written by mini-services/nat-logger (port 3016) and correlates
// dstDomain → application using a hardcoded catalog of 100+ known apps
// plus TLD-based fallback for unknown domains.
//
// Resulting DpiClassification rows are aggregated per (subscriberIp, appName,
// hour bucket) and persisted via Prisma `upsert()` against the
// (subscriberIp, appName, detectedAt) @@unique constraint.
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
// 100+ entries covering common ISP subscriber traffic across streaming,
// music, social, messaging, collaboration, gaming, cloud, developer, AI,
// CDN, search, shopping, news, P2P/anonymizer, and general categories.
// Match priority: exact match (lowercase) → suffix match (subdomain of a
// known app) → TLD-based fallback → DEFAULT_APP.

interface AppInfo {
  name: string;
  category: string;
  protocol: string;
  risk: string; // LOW | MEDIUM | HIGH | CRITICAL
}

const APP_MAP: Record<string, AppInfo> = {
  // ── Streaming (17) ──
  "youtube.com":        { name: "YouTube",           category: "Streaming",      protocol: "HTTPS",   risk: "LOW" },
  "youtu.be":           { name: "YouTube",           category: "Streaming",      protocol: "HTTPS",   risk: "LOW" },
  "tv.youtube.com":     { name: "YouTube TV",        category: "Streaming",      protocol: "HTTPS",   risk: "LOW" },
  "netflix.com":        { name: "Netflix",           category: "Streaming",      protocol: "HTTPS",   risk: "LOW" },
  "primevideo.com":     { name: "Prime Video",       category: "Streaming",      protocol: "HTTPS",   risk: "LOW" },
  "disneyplus.com":     { name: "Disney+",           category: "Streaming",      protocol: "HTTPS",   risk: "LOW" },
  "hulu.com":           { name: "Hulu",              category: "Streaming",      protocol: "HTTPS",   risk: "LOW" },
  "hbomax.com":         { name: "HBO Max",           category: "Streaming",      protocol: "HTTPS",   risk: "LOW" },
  "paramountplus.com":  { name: "Paramount+",        category: "Streaming",      protocol: "HTTPS",   risk: "LOW" },
  "peacocktv.com":      { name: "Peacock",           category: "Streaming",      protocol: "HTTPS",   risk: "LOW" },
  "tv.apple.com":       { name: "Apple TV+",         category: "Streaming",      protocol: "HTTPS",   risk: "LOW" },
  "crunchyroll.com":    { name: "Crunchyroll",       category: "Streaming",      protocol: "HTTPS",   risk: "LOW" },
  "bbc.co.uk":          { name: "BBC iPlayer",       category: "Streaming",      protocol: "HTTPS",   risk: "LOW" },
  "sling.com":          { name: "Sling TV",          category: "Streaming",      protocol: "HTTPS",   risk: "LOW" },
  "pluto.tv":           { name: "Pluto TV",          category: "Streaming",      protocol: "HTTPS",   risk: "LOW" },
  "tubitv.com":         { name: "Tubi",              category: "Streaming",      protocol: "HTTPS",   risk: "LOW" },
  "twitch.tv":          { name: "Twitch",            category: "Streaming",      protocol: "HTTPS",   risk: "MEDIUM" },

  // ── Music (10) ──
  "spotify.com":         { name: "Spotify",            category: "Music",          protocol: "HTTPS",   risk: "LOW" },
  "music.apple.com":    { name: "Apple Music",        category: "Music",          protocol: "HTTPS",   risk: "LOW" },
  "music.youtube.com":  { name: "YouTube Music",      category: "Music",          protocol: "HTTPS",   risk: "LOW" },
  "music.amazon.com":   { name: "Amazon Music",       category: "Music",          protocol: "HTTPS",   risk: "LOW" },
  "soundcloud.com":     { name: "SoundCloud",         category: "Music",          protocol: "HTTPS",   risk: "LOW" },
  "pandora.com":        { name: "Pandora",            category: "Music",          protocol: "HTTPS",   risk: "LOW" },
  "deezer.com":         { name: "Deezer",             category: "Music",          protocol: "HTTPS",   risk: "LOW" },
  "tidal.com":          { name: "Tidal",              category: "Music",          protocol: "HTTPS",   risk: "LOW" },
  "iheart.com":         { name: "iHeartRadio",        category: "Music",          protocol: "HTTPS",   risk: "LOW" },
  "audible.com":        { name: "Audible",            category: "Music",          protocol: "HTTPS",   risk: "LOW" },

  // ── Social (14) ──
  "facebook.com":       { name: "Facebook",           category: "Social",          protocol: "HTTPS",   risk: "MEDIUM" },
  "fb.com":             { name: "Facebook",           category: "Social",          protocol: "HTTPS",   risk: "MEDIUM" },
  "instagram.com":     { name: "Instagram",          category: "Social",          protocol: "HTTPS",   risk: "MEDIUM" },
  "twitter.com":        { name: "Twitter/X",          category: "Social",          protocol: "HTTPS",   risk: "MEDIUM" },
  "x.com":              { name: "Twitter/X",          category: "Social",          protocol: "HTTPS",   risk: "MEDIUM" },
  "tiktok.com":         { name: "TikTok",             category: "Social",          protocol: "HTTPS",   risk: "MEDIUM" },
  "linkedin.com":       { name: "LinkedIn",           category: "Social",          protocol: "HTTPS",   risk: "LOW" },
  "reddit.com":         { name: "Reddit",             category: "Social",          protocol: "HTTPS",   risk: "LOW" },
  "pinterest.com":      { name: "Pinterest",          category: "Social",          protocol: "HTTPS",   risk: "LOW" },
  "snapchat.com":       { name: "Snapchat",           category: "Social",          protocol: "HTTPS",   risk: "MEDIUM" },
  "tumblr.com":         { name: "Tumblr",             category: "Social",          protocol: "HTTPS",   risk: "LOW" },
  "threads.net":        { name: "Threads",            category: "Social",          protocol: "HTTPS",   risk: "MEDIUM" },
  "mastodon.social":    { name: "Mastodon",           category: "Social",          protocol: "HTTPS",   risk: "LOW" },
  "vk.com":             { name: "VK",                 category: "Social",          protocol: "HTTPS",   risk: "MEDIUM" },

  // ── Messaging (8) ──
  "whatsapp.com":       { name: "WhatsApp",           category: "Messaging",       protocol: "TLS",     risk: "LOW" },
  "telegram.org":       { name: "Telegram",           category: "Messaging",       protocol: "TLS",     risk: "LOW" },
  "discord.com":        { name: "Discord",            category: "Messaging",       protocol: "TLS",     risk: "LOW" },
  "slack.com":          { name: "Slack",              category: "Messaging",       protocol: "HTTPS",   risk: "LOW" },
  "teams.microsoft.com":{ name: "Microsoft Teams",   category: "Messaging",       protocol: "TLS",     risk: "LOW" },
  "signal.org":         { name: "Signal",             category: "Messaging",       protocol: "TLS",     risk: "LOW" },
  "weixin.qq.com":      { name: "WeChat",             category: "Messaging",       protocol: "TLS",     risk: "MEDIUM" },
  "line.me":            { name: "Line",               category: "Messaging",       protocol: "TLS",     risk: "LOW" },

  // ── Collaboration (5) ──
  "zoom.us":            { name: "Zoom",               category: "Collaboration",   protocol: "UDP",      risk: "LOW" },
  "meet.google.com":    { name: "Google Meet",        category: "Collaboration",   protocol: "HTTPS",   risk: "LOW" },
  "webex.com":          { name: "Webex",              category: "Collaboration",   protocol: "HTTPS",   risk: "LOW" },
  "gotomeeting.com":    { name: "GoToMeeting",        category: "Collaboration",   protocol: "HTTPS",   risk: "LOW" },
  "bluejeans.com":      { name: "BlueJeans",          category: "Collaboration",   protocol: "HTTPS",   risk: "LOW" },

  // ── Gaming (8) ──
  "steampowered.com":   { name: "Steam",              category: "Gaming",          protocol: "HTTPS",   risk: "LOW" },
  "epicgames.com":      { name: "Epic Games",         category: "Gaming",          protocol: "HTTPS",   risk: "LOW" },
  "fortnite.com":       { name: "Fortnite",           category: "Gaming",          protocol: "UDP",      risk: "MEDIUM" },
  "roblox.com":         { name: "Roblox",             category: "Gaming",          protocol: "UDP",      risk: "MEDIUM" },
  "minecraft.net":      { name: "Minecraft",          category: "Gaming",          protocol: "TCP/UDP",  risk: "LOW" },
  "playstation.com":    { name: "PlayStation Network", category: "Gaming",          protocol: "HTTPS",   risk: "LOW" },
  "xbox.com":           { name: "Xbox Live",          category: "Gaming",          protocol: "HTTPS",   risk: "LOW" },
  "battle.net":         { name: "Battle.net",         category: "Gaming",          protocol: "TCP/UDP",  risk: "LOW" },

  // ── Cloud/Storage (6) ──
  "drive.google.com":   { name: "Google Drive",       category: "Cloud",           protocol: "HTTPS",   risk: "LOW" },
  "dropbox.com":        { name: "Dropbox",            category: "Cloud",           protocol: "HTTPS",   risk: "LOW" },
  "onedrive.live.com":  { name: "OneDrive",           category: "Cloud",           protocol: "HTTPS",   risk: "LOW" },
  "icloud.com":         { name: "iCloud",             category: "Cloud",           protocol: "HTTPS",   risk: "LOW" },
  "box.com":             { name: "Box",                 category: "Cloud",           protocol: "HTTPS",   risk: "LOW" },
  "wetransfer.com":      { name: "WeTransfer",         category: "Cloud",           protocol: "HTTPS",   risk: "LOW" },

  // ── Developer (6) ──
  "github.com":         { name: "GitHub",             category: "Developer",       protocol: "HTTPS",   risk: "LOW" },
  "gitlab.com":         { name: "GitLab",             category: "Developer",       protocol: "HTTPS",   risk: "LOW" },
  "bitbucket.org":      { name: "Bitbucket",          category: "Developer",       protocol: "HTTPS",   risk: "LOW" },
  "stackoverflow.com":  { name: "Stack Overflow",     category: "Developer",       protocol: "HTTPS",   risk: "LOW" },
  "npmjs.com":          { name: "npm",                category: "Developer",       protocol: "HTTPS",   risk: "LOW" },
  "hub.docker.com":     { name: "Docker Hub",          category: "Developer",       protocol: "HTTPS",   risk: "LOW" },

  // ── AI (5) ──
  "openai.com":         { name: "OpenAI",             category: "AI",              protocol: "HTTPS",   risk: "MEDIUM" },
  "chatgpt.com":        { name: "ChatGPT",            category: "AI",              protocol: "HTTPS",   risk: "MEDIUM" },
  "anthropic.com":      { name: "Claude",              category: "AI",              protocol: "HTTPS",   risk: "MEDIUM" },
  "gemini.google.com":  { name: "Google Gemini",      category: "AI",              protocol: "HTTPS",   risk: "MEDIUM" },
  "copilot.microsoft.com":{ name: "Microsoft Copilot",  category: "AI",              protocol: "HTTPS",   risk: "MEDIUM" },

  // ── CDN/Infrastructure (4) ──
  "cloudflare.com":     { name: "Cloudflare",         category: "CDN",             protocol: "HTTPS",   risk: "LOW" },
  "fastly.com":         { name: "Fastly",             category: "CDN",             protocol: "HTTPS",   risk: "LOW" },
  "akamai.com":         { name: "Akamai",             category: "CDN",             protocol: "HTTPS",   risk: "LOW" },
  "s3.amazonaws.com":   { name: "AWS S3",             category: "CDN",             protocol: "HTTPS",   risk: "LOW" },

  // ── Search/Reference (4) ──
  "google.com":         { name: "Google Search",      category: "Search",          protocol: "HTTPS",   risk: "LOW" },
  "bing.com":           { name: "Bing",               category: "Search",          protocol: "HTTPS",   risk: "LOW" },
  "duckduckgo.com":     { name: "DuckDuckGo",         category: "Search",          protocol: "HTTPS",   risk: "LOW" },
  "wikipedia.org":      { name: "Wikipedia",         category: "Reference",       protocol: "HTTPS",   risk: "LOW" },

  // ── Shopping (5) ──
  "amazon.com":         { name: "Amazon",             category: "Shopping",        protocol: "HTTPS",   risk: "LOW" },
  "ebay.com":           { name: "eBay",               category: "Shopping",        protocol: "HTTPS",   risk: "LOW" },
  "walmart.com":        { name: "Walmart",            category: "Shopping",        protocol: "HTTPS",   risk: "LOW" },
  "alibaba.com":        { name: "Alibaba",            category: "Shopping",        protocol: "HTTPS",   risk: "LOW" },
  "flipkart.com":       { name: "Flipkart",           category: "Shopping",        protocol: "HTTPS",   risk: "LOW" },

  // ── News (4) ──
  "cnn.com":            { name: "CNN",                category: "News",            protocol: "HTTPS",   risk: "LOW" },
  "bbc.com":            { name: "BBC",                category: "News",            protocol: "HTTPS",   risk: "LOW" },
  "reuters.com":        { name: "Reuters",            category: "News",            protocol: "HTTPS",   risk: "LOW" },
  "nytimes.com":        { name: "New York Times",     category: "News",            protocol: "HTTPS",   risk: "LOW" },

  // ── P2P/Anonymizer (4) ──
  "bittorrent.com":     { name: "BitTorrent",         category: "P2P",             protocol: "TCP/UDP",  risk: "HIGH" },
  "torproject.org":     { name: "Tor",                category: "Anonymizer",      protocol: "TLS",      risk: "CRITICAL" },
  "protonvpn.com":       { name: "ProtonVPN",           category: "Anonymizer",      protocol: "TLS",      risk: "HIGH" },
  "nordvpn.com":         { name: "NordVPN",            category: "Anonymizer",      protocol: "TLS",      risk: "HIGH" },

  // ── Other (4) ──
  "apple.com":          { name: "Apple",              category: "Cloud",           protocol: "HTTPS",   risk: "LOW" },
  "microsoft.com":      { name: "Microsoft",          category: "Cloud",           protocol: "HTTPS",   risk: "LOW" },
  "yahoo.com":          { name: "Yahoo",              category: "Search",          protocol: "HTTPS",   risk: "LOW" },
  "baidu.com":          { name: "Baidu",              category: "Search",          protocol: "HTTPS",   risk: "LOW" },
};

const DEFAULT_APP: AppInfo = {
  name: "Unknown",
  category: "Other",
  protocol: "HTTPS",
  risk: "LOW",
};

// TLD-based fallback for domains not in APP_MAP. Provides a more useful
// classification than DEFAULT_APP when the domain has a recognizable TLD.
// TLD is extracted as the last segment after the final dot in the hostname.
const TLD_FALLBACK: Record<string, AppInfo> = {
  gov:  { name: "Government Site",  category: "Reference", protocol: "HTTPS", risk: "LOW" },
  edu:  { name: "Educational Site", category: "Reference", protocol: "HTTPS", risk: "LOW" },
  mil:  { name: "Military Site",    category: "Reference", protocol: "HTTPS", risk: "LOW" },
  dev:  { name: "Developer Site",   category: "Developer",  protocol: "HTTPS", risk: "LOW" },
  io:   { name: "Tech Startup",    category: "Cloud",      protocol: "HTTPS", risk: "LOW" },
  ai:   { name: "AI Service",       category: "AI",          protocol: "HTTPS", risk: "MEDIUM" },
  xxx:  { name: "Adult Content",    category: "Adult",       protocol: "HTTPS", risk: "HIGH" },
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

  // 3. TLD-based fallback for unknown domains (better than DEFAULT_APP).
  // Extracts the last segment after the final dot in the hostname.
  const tld = cleaned.split(".").pop() || "";
  if (tld && TLD_FALLBACK[tld]) return TLD_FALLBACK[tld];

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
// Uses Prisma's native upsert() against the @@unique([subscriberIp, appName,
// detectedAt]) composite key — no manual findFirst→update/create, which
// eliminates the race window where two concurrent runs could both create
// duplicate rows for the same (subscriberIp, appName, hour) triple.

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

  // Upsert each bucket via Prisma's native upsert() against the composite
  // unique key (subscriberIp_appName_detectedAt) — created in schema.prisma
  // by @@unique([subscriberIp, appName, detectedAt]). This eliminates the
  // findFirst+create race condition that produced duplicate rows under
  // concurrent correlation runs. We do this sequentially (not in parallel)
  // to avoid overwhelming Prisma's connection pool. With ~100 distinct apps
  // per subscriber and ~100 subscribers, that's at most ~10000 buckets per
  // run — well within budget.
  let rowsUpserted = 0;
  for (const bucket of buckets.values()) {
    try {
      await db.dpiClassification.upsert({
        where: {
          subscriberIp_appName_detectedAt: {
            subscriberIp: bucket.subscriberIp,
            appName: bucket.appName,
            detectedAt: bucket.bucket,
          },
        },
        create: {
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
        update: {
          bytesIn: { increment: bucket.bytesIn },
          bytesOut: { increment: bucket.bytesOut },
          flows: { increment: bucket.flows },
          // Refresh subscriberId with the latest non-empty value (last-write-wins).
          // Skipped when bucket has no subscriberId to avoid blanking the field.
          ...(bucket.subscriberId ? { subscriberId: bucket.subscriberId } : {}),
        },
      });
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
console.log(`║  Domain-to-App correlator (${Object.keys(APP_MAP).length} apps + TLD fallback) ║`);
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
