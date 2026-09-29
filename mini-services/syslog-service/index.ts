import { PrismaClient } from "@prisma/client";
import dgram from "dgram";

const db = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || "postgresql://cryptsk:Cryptsk2026@localhost:5432/ispplatform",
    },
  },
});
const server = dgram.createSocket("udp4");

let PORT = parseInt(process.env.SYSLOG_PORT || "1514", 10);

// Parse RFC 3164 syslog: <priority>hostname appname[pid]: message
function parseSyslog(data: Buffer, rinfo: { address: string }) {
  const raw = data.toString("utf-8").trim();
  const match = raw.match(/^<(\d+)>(.*)$/);
  if (!match) return null;

  const pri = parseInt(match[1], 10);
  const facility = Math.floor(pri / 8);
  const severity = pri % 8;
  const rest = match[2].trim();

  const facilityNames = ["kern", "user", "mail", "daemon", "auth", "syslog", "lpr", "news", "uucp", "cron", "authpriv", "ftp", "ntp", "logaudit", "logalert", "clock", "local0", "local1", "local2", "local3", "local4", "local5", "local6", "local7"];
  const severityNames = ["emerg", "alert", "crit", "err", "warn", "notice", "info", "debug"];

  // Try to extract hostname, appname, message
  const parts = rest.split(/\s+/);
  let hostname = "";
  let appname = "";
  let procid = "";
  let message = rest;
  let timestamp = new Date();

  // Try to parse timestamp at start (RFC 3164: Mmm dd hh:mm:ss)
  const tsMatch = rest.match(/^([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{2}:\d{2}:\d{2})\s+(.*)$/);
  if (tsMatch) {
    const [, mon, day, time, restAfterTs] = tsMatch;
    const now = new Date();
    const parsedTs = new Date(`${mon} ${day} ${time} ${now.getFullYear()} UTC`);
    if (!isNaN(parsedTs.getTime())) timestamp = parsedTs;
    const remaining = restAfterTs;

    // hostname appname[pid]: message
    const hostAppMatch = remaining.match(/^(\S+)\s+(\S+?)(?:\[(\d+)\])?:\s*(.*)$/);
    if (hostAppMatch) {
      hostname = hostAppMatch[1];
      appname = hostAppMatch[2];
      procid = hostAppMatch[3] || "";
      message = hostAppMatch[4];
    } else {
      hostname = remaining.split(/\s+/)[0] || "";
      message = remaining;
    }
  } else {
    // Try: hostname appname[pid]: message
    const hostAppMatch2 = rest.match(/^(\S+)\s+(\S+?)(?:\[(\d+)\])?:\s*(.*)$/);
    if (hostAppMatch2) {
      hostname = hostAppMatch2[1];
      appname = hostAppMatch2[2];
      procid = hostAppMatch2[3] || "";
      message = hostAppMatch2[4];
    }
  }

  return {
    timestamp,
    facility: facilityNames[facility] || `facility${facility}`,
    severity: severityNames[severity] || `severity${severity}`,
    hostname: hostname || rinfo.address,
    appname: appname || null,
    procid: procid || null,
    message,
    source: rinfo.address,
  };
}

server.on("message", async (msg, rinfo) => {
  try {
    const parsed = parseSyslog(msg, rinfo);
    if (parsed) {
      await db.syslogMessage.create({ data: parsed });
    }
  } catch (err) {
    console.error("[syslog] Error storing message:", err);
  }
});

server.on("error", (err) => {
  console.error("[syslog] Server error:", err);
});

server.on("listening", () => {
  const addr = server.address();
  console.log(`[syslog] Syslog server listening on port ${typeof addr === "object" && addr ? addr.port : PORT}`);
});

// Handle port 514 (requires root) fallback
function startServer(port: number) {
  PORT = port;
  server.bind(port, "0.0.0.0");
}

// Start on port 1514 by default (non-root)
startServer(PORT);

// Graceful shutdown
process.on("SIGTERM", () => {
  server.close(() => {
    console.log("[syslog] Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  server.close(() => {
    console.log("[syslog] Server closed");
    process.exit(0);
  });
});
