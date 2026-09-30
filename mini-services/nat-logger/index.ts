// ═══════════════════════════════════════════════════════════════
// CRYPTSK NAT Logger — Port 3016
// Buffered NAT event pipeline (architecture §34)
//
// Accepts NAT events via HTTP, buffers in memory (max 5000),
// flushes to NatLog table every 5s or when buffer reaches 500.
// Synthetic event generator runs every 10s if subscribers exist.
// ═══════════════════════════════════════════════════════════════

import { PrismaClient } from "@prisma/client";
import { createLogger } from "../shared/logger.ts";

const db = new PrismaClient();
const logger = createLogger("nat-logger");
const SERVICE_START = Date.now();
const PORT = 3016;

// ─── CORS — Allow all origins ──────────────────────────────────
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
  "Access-Control-Allow-Credentials": "true",
};

// JSON with BigInt-safe replacer
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v)), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function jsonErr(message: string, status = 400) {
  return json({ error: message }, status);
}

// ─── In-Memory Buffer ──────────────────────────────────────────
interface NatEventInput {
  subscriberId?: string | null;
  subscriberIp: string;
  protocol: string; // TCP | UDP | ICMP
  srcIp: string;
  srcPort: number;
  dstIp: string;
  dstPort: number;
  dstDomain?: string;
  dstCountry?: string;
  bytesSent: number;
  bytesReceived: number;
  duration: number;
  natAction: string; // SNAT | DNAT | MASQUERADE
  ingestedAt: Date;
}

const BUFFER_MAX = 5000;
const BUFFER_FLUSH_THRESHOLD = 500;
const FLUSH_BATCH_SIZE = 500;

const buffer: NatEventInput[] = [];
let totalFlushed = 0;
let lastFlushAt: Date | null = null;
let lastEventAt: Date | null = null;

function pushEvent(ev: NatEventInput): void {
  if (buffer.length >= BUFFER_MAX) {
    // Drop oldest to make room — never exceed 5000
    buffer.shift();
  }
  buffer.push(ev);
  lastEventAt = new Date();
  if (buffer.length >= BUFFER_FLUSH_THRESHOLD) {
    // Non-blocking flush trigger
    flushBuffer().catch((e) =>
      logger.error("auto-flush failed", { error: e?.message ?? String(e) })
    );
  }
}

// ─── Flush Logic ───────────────────────────────────────────────
async function flushBuffer(): Promise<number> {
  if (buffer.length === 0) return 0;
  const batch = buffer.splice(0, Math.min(FLUSH_BATCH_SIZE, buffer.length));
  const data = batch.map((ev) => ({
    subscriberId: ev.subscriberId ?? null,
    subscriberIp: ev.subscriberIp,
    protocol: ev.protocol,
    srcIp: ev.srcIp,
    srcPort: ev.srcPort,
    dstIp: ev.dstIp,
    dstPort: ev.dstPort,
    dstDomain: ev.dstDomain ?? "",
    dstCountry: ev.dstCountry ?? "",
    bytesSent: BigInt(ev.bytesSent || 0),
    bytesReceived: BigInt(ev.bytesReceived || 0),
    duration: ev.duration,
    natAction: ev.natAction,
    timestamp: ev.ingestedAt,
  }));
  try {
    await db.natLog.createMany({ data });
    totalFlushed += batch.length;
    lastFlushAt = new Date();
    // Persist singleton NatEventBuffer row for cross-service visibility
    await db.natEventBuffer.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        bufferSize: buffer.length,
        flushedAt: lastFlushAt,
        totalFlushed,
        lastEventAt: lastEventAt ?? undefined,
      },
      update: {
        bufferSize: buffer.length,
        flushedAt: lastFlushAt,
        totalFlushed,
        ...(lastEventAt ? { lastEventAt } : {}),
      },
    });
    logger.info("flush ok", {
      count: batch.length,
      totalFlushed,
      remaining: buffer.length,
    });
    return batch.length;
  } catch (err: unknown) {
    // Push back to front if failed — preserves order, will retry next interval
    buffer.unshift(...batch);
    logger.error("flush failed", { error: (err as Error)?.message ?? String(err) });
    return 0;
  }
}

// ─── Synthetic Event Generator ─────────────────────────────────
const DST_DOMAINS = [
  "google.com", "facebook.com", "youtube.com", "netflix.com", "github.com",
  "whatsapp.com", "instagram.com", "twitter.com", "amazon.com", "cloudflare.com",
];
const DST_COUNTRIES = ["US", "DE", "SG", "JP", "GB", "FR", "NL", "CA", "IN", "AU"];

function randIp(): string {
  return `${1 + Math.floor(Math.random() * 254)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${1 + Math.floor(Math.random() * 254)}`;
}

function randPort(): number {
  const wellKnown = [80, 443, 53, 853, 5228, 5222, 993, 445, 25, 587];
  return Math.random() < 0.5
    ? wellKnown[Math.floor(Math.random() * wellKnown.length)]
    : 1024 + Math.floor(Math.random() * 60000);
}

function randBytes(min = 1024, max = 10 * 1024 * 1024): number {
  return Math.floor(Math.random() * (max - min)) + min;
}

async function generateSyntheticEvents(): Promise<void> {
  try {
    // Try to find an ACTIVE NasSession first (real "online" subscriber)
    let subscriberId: string | null = null;
    let subscriberIp = "";

    const totalActive = await db.nasSession.count({ where: { status: "ACTIVE" } });
    if (totalActive > 0) {
      const skip = Math.floor(Math.random() * totalActive);
      const session = await db.nasSession.findFirst({
        where: { status: "ACTIVE" },
        skip,
      });
      if (session) {
        subscriberId = session.subscriberId;
        subscriberIp =
          session.framedIp || session.assignedIp || session.callingStationId;
      }
    }

    // Fallback: pick a random Subscriber
    if (!subscriberId && !subscriberIp) {
      const totalSubs = await db.subscriber.count();
      if (totalSubs === 0) return; // No subscribers in DB — skip
      const skip = Math.floor(Math.random() * totalSubs);
      const sub = await db.subscriber.findFirst({ skip });
      if (!sub) return;
      subscriberId = sub.id;
      subscriberIp = sub.ipAddress || `10.0.${Math.floor(Math.random() * 255)}.${1 + Math.floor(Math.random() * 254)}`;
    }

    if (!subscriberIp) {
      subscriberIp = `10.0.${Math.floor(Math.random() * 255)}.${1 + Math.floor(Math.random() * 254)}`;
    }

    const n = 1 + Math.floor(Math.random() * 3); // 1..3 events
    for (let i = 0; i < n; i++) {
      const proto = Math.random() < 0.7 ? "TCP" : "UDP";
      const dstDomain = DST_DOMAINS[Math.floor(Math.random() * DST_DOMAINS.length)];
      const dstCountry = DST_COUNTRIES[Math.floor(Math.random() * DST_COUNTRIES.length)];
      pushEvent({
        subscriberId: subscriberId ?? undefined,
        subscriberIp,
        protocol: proto,
        srcIp: subscriberIp,
        srcPort: randPort(),
        dstIp: randIp(),
        dstPort: randPort(),
        dstDomain,
        dstCountry,
        bytesSent: randBytes(),
        bytesReceived: randBytes(),
        duration: 1 + Math.floor(Math.random() * 600),
        natAction: "SNAT",
        ingestedAt: new Date(),
      });
    }
    logger.debug("synthetic events pushed", {
      count: n,
      subscriberIp,
      subscriberId,
    });
  } catch (err: unknown) {
    logger.warn("synthetic generator error", {
      error: (err as Error)?.message ?? String(err),
    });
  }
}

// ─── HTTP Handlers ─────────────────────────────────────────────
async function handleRequest(req: Request, path: string, url: URL): Promise<Response> {
  // ── GET /health ────────────────────────────────────────────
  if (path === "/health" && req.method === "GET") {
    let subscribersTracked = 0;
    try {
      subscribersTracked = await db.nasSession.count({ where: { status: "ACTIVE" } });
    } catch {
      subscribersTracked = 0;
    }
    return json({
      status: "ok",
      port: PORT,
      uptime: Math.floor((Date.now() - SERVICE_START) / 1000),
      buffer: {
        size: buffer.length,
        capacity: BUFFER_MAX,
        totalFlushed,
        lastFlushAt,
        lastEventAt,
      },
      subscribersTracked,
    });
  }

  // ── POST /events — single event ────────────────────────────
  if (path === "/events" && req.method === "POST") {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonErr("Invalid JSON body", 400);
    }
    const ev = body as Partial<NatEventInput>;
    if (!ev.subscriberIp || !ev.protocol || !ev.srcIp) {
      return jsonErr("Missing required fields: subscriberIp, protocol, srcIp", 422);
    }
    const validProtos = ["TCP", "UDP", "ICMP"];
    if (!validProtos.includes(ev.protocol)) {
      return jsonErr(`Invalid protocol; must be one of ${validProtos.join(",")}`, 422);
    }
    const validActions = ["SNAT", "DNAT", "MASQUERADE"];
    if (ev.natAction && !validActions.includes(ev.natAction)) {
      return jsonErr(`Invalid natAction; must be one of ${validActions.join(",")}`, 422);
    }
    const event: NatEventInput = {
      subscriberId: ev.subscriberId ?? undefined,
      subscriberIp: ev.subscriberIp,
      protocol: ev.protocol,
      srcIp: ev.srcIp,
      srcPort: Number(ev.srcPort) || 0,
      dstIp: ev.dstIp ?? "",
      dstPort: Number(ev.dstPort) || 0,
      dstDomain: ev.dstDomain,
      dstCountry: ev.dstCountry,
      bytesSent: Number(ev.bytesSent) || 0,
      bytesReceived: Number(ev.bytesReceived) || 0,
      duration: Number(ev.duration) || 0,
      natAction: ev.natAction ?? "SNAT",
      ingestedAt: new Date(),
    };
    pushEvent(event);
    return json({ accepted: true, bufferSize: buffer.length });
  }

  // ── POST /events/batch ─────────────────────────────────────
  if (path === "/events/batch" && req.method === "POST") {
    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray((body as { events?: unknown[] }).events)) {
      return jsonErr("Body must contain events: [...]", 422);
    }
    const validProtos = ["TCP", "UDP", "ICMP"];
    let accepted = 0;
    for (const ev of (body as { events: Partial<NatEventInput>[] }).events) {
      if (!ev || typeof ev !== "object") continue;
      if (!ev.subscriberIp || !ev.protocol || !ev.srcIp) continue;
      if (!validProtos.includes(ev.protocol)) continue;
      pushEvent({
        subscriberId: ev.subscriberId ?? undefined,
        subscriberIp: ev.subscriberIp,
        protocol: ev.protocol,
        srcIp: ev.srcIp,
        srcPort: Number(ev.srcPort) || 0,
        dstIp: ev.dstIp ?? "",
        dstPort: Number(ev.dstPort) || 0,
        dstDomain: ev.dstDomain,
        dstCountry: ev.dstCountry,
        bytesSent: Number(ev.bytesSent) || 0,
        bytesReceived: Number(ev.bytesReceived) || 0,
        duration: Number(ev.duration) || 0,
        natAction: ev.natAction ?? "SNAT",
        ingestedAt: new Date(),
      });
      accepted++;
    }
    return json({ accepted, bufferSize: buffer.length });
  }

  // ── POST /flush — force immediate flush ────────────────────
  if (path === "/flush" && req.method === "POST") {
    const flushed = await flushBuffer();
    return json({ flushed, remainingBuffer: buffer.length });
  }

  // ── GET /events/recent?limit=100 ───────────────────────────
  if (path === "/events/recent" && req.method === "GET") {
    const limitRaw = parseInt(url.searchParams.get("limit") ?? "100", 10);
    const limit = Math.min(Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 100, 500);
    const events = await db.natLog.findMany({
      orderBy: { timestamp: "desc" },
      take: limit,
    });
    const total = await db.natLog.count();
    // Serialize BigInt fields to string
    const sanitized = events.map((e) => ({
      ...e,
      bytesSent: e.bytesSent.toString(),
      bytesReceived: e.bytesReceived.toString(),
    }));
    return json({ events: sanitized, total });
  }

  // ── GET /stats?minutes=60 ──────────────────────────────────
  if (path === "/stats" && req.method === "GET") {
    const minutesRaw = parseInt(url.searchParams.get("minutes") ?? "60", 10);
    const minutes = Math.min(
      Number.isFinite(minutesRaw) && minutesRaw > 0 ? minutesRaw : 60,
      60 * 24 * 7 // cap at 1 week
    );
    const since = new Date(Date.now() - minutes * 60 * 1000);
    const events = await db.natLog.findMany({
      where: { timestamp: { gte: since } },
      select: {
        subscriberIp: true,
        dstDomain: true,
        protocol: true,
        bytesSent: true,
        bytesReceived: true,
        timestamp: true,
      },
    });

    let totalEvents = events.length;
    let totalBytesSent = 0n;
    let totalBytesReceived = 0n;
    const byDomain = new Map<string, bigint>();
    const bySubscriberIp = new Map<string, bigint>();
    const byProtocol = new Map<string, { bytes: bigint; count: number }>();

    for (const e of events) {
      const sent = e.bytesSent || 0n;
      const recv = e.bytesReceived || 0n;
      const total = sent + recv;
      totalBytesSent += sent;
      totalBytesReceived += recv;
      if (e.dstDomain) {
        byDomain.set(e.dstDomain, (byDomain.get(e.dstDomain) ?? 0n) + total);
      }
      if (e.subscriberIp) {
        bySubscriberIp.set(
          e.subscriberIp,
          (bySubscriberIp.get(e.subscriberIp) ?? 0n) + total
        );
      }
      const p = e.protocol || "UNKNOWN";
      const cur = byProtocol.get(p) ?? { bytes: 0n, count: 0 };
      cur.bytes += total;
      cur.count += 1;
      byProtocol.set(p, cur);
    }

    const cmpBig = (a: string, b: string) => {
      const ba = BigInt(a);
      const bb = BigInt(b);
      return bb > ba ? 1 : bb < ba ? -1 : 0;
    };
    const topDstDomains = Array.from(byDomain.entries())
      .map(([domain, bytes]) => ({ domain, bytes: bytes.toString() }))
      .sort((a, b) => cmpBig(a.bytes, b.bytes))
      .slice(0, 10);
    const topSubscriberIps = Array.from(bySubscriberIp.entries())
      .map(([subscriberIp, bytes]) => ({ subscriberIp, bytes: bytes.toString() }))
      .sort((a, b) => cmpBig(a.bytes, b.bytes))
      .slice(0, 10);
    const bytesPerProtocol = Array.from(byProtocol.entries()).map(([protocol, v]) => ({
      protocol,
      bytes: v.bytes.toString(),
      count: v.count,
    }));

    return json({
      minutes,
      totalEvents,
      totalBytesSent: totalBytesSent.toString(),
      totalBytesReceived: totalBytesReceived.toString(),
      topDstDomains,
      topSubscriberIps,
      bytesPerProtocol,
    });
  }

  // ── GET /buffer ────────────────────────────────────────────
  if (path === "/buffer" && req.method === "GET") {
    const oldest = buffer.length > 0 ? buffer[0].ingestedAt : null;
    const oldestEventAgeMs = oldest ? Date.now() - oldest.getTime() : null;
    return json({
      size: buffer.length,
      capacity: BUFFER_MAX,
      lastEventAt,
      oldestEventAt: oldest,
      oldestEventAgeMs,
    });
  }

  // ── Fallback ───────────────────────────────────────────────
  return json({ error: "Not Found", path }, 404);
}

// ─── HTTP Server ───────────────────────────────────────────────
const server = Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    return handleRequest(req, path, url);
  },
});

// ─── Timers ────────────────────────────────────────────────────
// Flush every 5s
const flushTimer = setInterval(() => {
  flushBuffer().catch((e) =>
    logger.error("interval flush failed", { error: e?.message ?? String(e) })
  );
}, 5000);
flushTimer.unref?.();

// Synthetic event generator every 10s
const synthTimer = setInterval(() => {
  generateSyntheticEvents().catch((e) =>
    logger.warn("synthetic generator failed", { error: e?.message ?? String(e) })
  );
}, 10000);
synthTimer.unref?.();

// Kick off initial synthetic batch shortly after boot
setTimeout(() => {
  generateSyntheticEvents().catch((e) =>
    logger.warn("initial synthetic generator failed", { error: e?.message ?? String(e) })
  );
}, 3000);

// ─── Startup Banner ────────────────────────────────────────────
console.log(`╔══════════════════════════════════════════╗`);
console.log(`║  CRYPTSK NAT Logger — Port ${PORT}            ║`);
console.log(`║  Buffer: 5000 max, flush every 5s         ║`);
console.log(`╚══════════════════════════════════════════╝`);
logger.info("nat-logger started", { port: PORT, bufferMax: BUFFER_MAX });

// ─── Graceful shutdown ────────────────────────────────────────
async function shutdown(sig: string) {
  logger.info("shutting down — flushing remaining buffer", { signal: sig });
  try {
    await flushBuffer();
  } catch (e) {
    logger.error("shutdown flush failed", { error: (e as Error)?.message });
  }
  server.stop();
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

export {};
