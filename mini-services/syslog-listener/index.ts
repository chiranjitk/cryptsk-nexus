// ============================================================
// CRYPTSK Nexus — syslog-listener mini-service
// UDP listener on 0.0.0.0:30514 for RFC3164/5424 syslog lines
// from network devices (NAS/Olt/switches) and automation.
// Parses PRI + tolerant timestamp/host/tag, batch-inserts into
// the syslog_entries table (flush every 2s or 50 messages).
// 100% real ingest — whatever a device sends is what gets stored.
// ============================================================
import { createSocket, type RemoteInfo } from "node:dgram";
import { db } from "../../src/lib/db";

const UDP_PORT = 30514;
const FLUSH_INTERVAL_MS = 2000;
const FLUSH_BATCH_SIZE = 50;
const MAX_BUFFER = 5000;

type SyslogRow = {
  facility: number;
  severity: number;
  tag: string | null;
  host: string | null;
  sourceIp: string | null;
  message: string;
};

/** Tolerant RFC3164/RFC5424 parser — same logic as src/lib/monitoring.ts. NEVER throws. */
function parseSyslog(raw: string): SyslogRow {
  const fallback: SyslogRow = { facility: 16, severity: 6, tag: null, host: null, sourceIp: null, message: raw };
  try {
    let rest = raw.trim();
    let facility = 16;
    let severity = 6;

    const priMatch = rest.match(/^<(\d{1,3})>/);
    if (priMatch) {
      const pri = Number(priMatch[1]);
      if (Number.isFinite(pri) && pri >= 0 && pri <= 191) {
        facility = Math.floor(pri / 8);
        severity = pri % 8;
      }
      rest = rest.slice(priMatch[0].length).trim();
    }

    let host: string | null = null;
    let tag: string | null = null;
    let message = rest;

    // RFC3164: "Mmm dd HH:MM:SS host tag[pid]: message"
    const m3164 = rest.match(/^[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+(\S+)\s+([^\s:\[]+)(?:\[\d+\])?:?\s*(.*)$/);
    // RFC5424: "VERSION TIMESTAMP HOST APP-NAME PROCID MSGID STRUCTURED-DATA MSG"
    const m5424 = !m3164 ? rest.match(/^\d+\s+\S+\s+(\S+)\s+(\S+)\s+\S+\s+\S+\s*(.*)$/) : null;

    if (m3164) {
      host = m3164[1];
      tag = m3164[2];
      message = m3164[3];
    } else if (m5424) {
      host = m5424[1] === "-" ? null : m5424[1];
      tag = m5424[2] === "-" ? null : m5424[2];
      message = m5424[3];
    }

    return {
      facility,
      severity,
      host: host || null,
      tag: tag || null,
      sourceIp: null,
      message: message.length ? message : rest,
    };
  } catch {
    return fallback;
  }
}

const buffer: SyslogRow[] = [];
let flushing = false;

async function flush(): Promise<void> {
  if (flushing || buffer.length === 0) return;
  flushing = true;
  const batch = buffer.splice(0, buffer.length);
  try {
    await db.syslogEntry.createMany({ data: batch });
    console.log(`syslog-listener: stored ${batch.length} messages`);
  } catch (err) {
    // Re-queue at the front (bounded) so transient DB issues don't drop logs
    console.error("syslog-listener: flush failed, re-queueing:", err);
    buffer.unshift(...batch.slice(0, MAX_BUFFER - buffer.length));
  } finally {
    flushing = false;
  }
}

const socket = createSocket("udp4");

socket.on("message", (msg: Buffer, rinfo: RemoteInfo) => {
  const text = msg.toString("utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = parseSyslog(trimmed);
    parsed.sourceIp = rinfo.address; // real UDP sender
    if (buffer.length < MAX_BUFFER) buffer.push(parsed);
  }
  if (buffer.length >= FLUSH_BATCH_SIZE) void flush();
});

socket.on("error", (err) => {
  console.error("syslog-listener: socket error:", err.message);
});

socket.on("listening", () => {
  const addr = socket.address();
  console.log(`syslog-listener: listening on udp://${addr.address}:${addr.port}`);
});

try {
  socket.bind(UDP_PORT, "0.0.0.0");
} catch (err) {
  console.error(
    `syslog-listener: FAILED to bind UDP port ${UDP_PORT} — is another process using it?`,
    err
  );
  process.exit(1);
}

const flushTimer = setInterval(() => void flush(), FLUSH_INTERVAL_MS);

async function shutdown(signal: string) {
  console.log(`syslog-listener: received ${signal}, shutting down…`);
  clearInterval(flushTimer);
  try {
    socket.close();
  } catch {
    // already closed
  }
  await flush();
  await db.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
