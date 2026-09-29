import { promises as dnsPromises } from "node:dns";
import { db } from "@/lib/db";

// ============================================================
// CRYPTSK Nexus — Monitoring helpers (Phase 10)
// Real service probes + syslog parsing shared by the
// /api/monitoring/* routes. No mock data: every probe performs
// an actual network/DB operation and reports the real result —
// a down service is a real down, never a placeholder.
// ============================================================

export type ProbeStatus = "up" | "degraded" | "down";

export type ServiceProbeResult = {
  key: string;
  label: string;
  status: ProbeStatus;
  latencyMs: number;
  detail: string;
};

/** RFC3164 severity labels — index = numeric severity 0..7 */
export const SEVERITY_LABELS = ["emerg", "alert", "crit", "err", "warning", "notice", "info", "debug"] as const;

/** Latency above which a 2xx health response is reported as degraded (ms) */
const DEGRADED_LATENCY_MS = 1000;

/**
 * Probe an HTTP health endpoint with a hard timeout.
 * 2xx fast → up · 2xx slow → degraded · non-2xx / network error / timeout → down.
 */
export async function probeHttpService(key: string, label: string, baseUrl: string, timeoutMs = 1500): Promise<ServiceProbeResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/health`, {
      signal: controller.signal,
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    const latencyMs = Date.now() - started;
    if (res.ok) {
      return latencyMs >= DEGRADED_LATENCY_MS
        ? { key, label, status: "degraded", latencyMs, detail: `HTTP ${res.status} but slow (${latencyMs}ms)` }
        : { key, label, status: "up", latencyMs, detail: `HTTP ${res.status} in ${latencyMs}ms` };
    }
    return { key, label, status: "down", latencyMs, detail: `HTTP ${res.status} ${res.statusText} in ${latencyMs}ms`.trim() };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const detail = controller.signal.aborted
      ? `no response within ${timeoutMs}ms (timeout)`
      : err instanceof Error
        ? err.message
        : "connection failed";
    return { key, label, status: "down", latencyMs, detail };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probe the platform DNS resolver (127.0.0.1) by resolving "localhost".
 * Real lookup — timeout or failure reports down.
 */
export async function probeDnsService(timeoutMs = 1500): Promise<ServiceProbeResult> {
  const key = "dnsResolver";
  const label = "DNS Resolver";
  const started = Date.now();
  const resolver = new dnsPromises.Resolver({ timeout: timeoutMs, tries: 1 });
  resolver.setServers(["127.0.0.1"]);
  try {
    const addresses = await resolver.resolve4("localhost");
    const latencyMs = Date.now() - started;
    const detail = `resolved localhost → ${addresses.slice(0, 2).join(", ")} via 127.0.0.1 in ${latencyMs}ms`;
    return latencyMs >= DEGRADED_LATENCY_MS
      ? { key, label, status: "degraded", latencyMs, detail }
      : { key, label, status: "up", latencyMs, detail };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const detail = err instanceof Error ? err.message : `lookup of "localhost" via 127.0.0.1 failed`;
    return { key, label, status: "down", latencyMs, detail };
  }
}

/**
 * Persist probe results with flood protection:
 * - skip a service if it already has a probe row in the last 60s
 *   (the UI polls every ~30s — never flood service_probe_logs)
 * - prune rows older than 24h
 */
export async function recordServiceProbes(results: ServiceProbeResult[]): Promise<void> {
  if (!results.length) return;
  const now = new Date();
  const keys = results.map((r) => r.key);
  const recent = await db.serviceProbeLog.findMany({
    where: { service: { in: keys }, checkedAt: { gte: new Date(now.getTime() - 60_000) } },
    select: { service: true },
    distinct: ["service"],
  });
  const recentSet = new Set(recent.map((r) => r.service));
  const toWrite = results.filter((r) => !recentSet.has(r.key));
  await Promise.all([
    toWrite.length
      ? db.serviceProbeLog.createMany({
          data: toWrite.map((r) => ({ service: r.key, status: r.status, latencyMs: r.latencyMs, detail: r.detail })),
        })
      : Promise.resolve(),
    // Retention: probes older than 24h are pruned on every overview run
    db.serviceProbeLog.deleteMany({ where: { checkedAt: { lt: new Date(now.getTime() - 24 * 3600 * 1000) } } }),
  ]);
}

/**
 * Probe the full service matrix (PostgreSQL is probed by the caller since
 * the DB is already in use; session engine + VPP adapter + DNS here).
 */
export async function probePlatformServices(): Promise<ServiceProbeResult[]> {
  const sessionEngineUrl = process.env.SESSION_ENGINE_URL || "http://127.0.0.1:3010";
  const vppAdapterUrl = process.env.VPP_ADAPTER_URL || "http://127.0.0.1:3015";
  const [sessionEngine, vppAdapter, dns] = await Promise.all([
    probeHttpService("sessionEngine", "Session Engine", sessionEngineUrl),
    probeHttpService("vppAdapter", "VPP Adapter", vppAdapterUrl),
    probeDnsService(),
  ]);
  return [sessionEngine, vppAdapter, dns];
}

export type ParsedSyslogLine = {
  facility: number;
  severity: number;
  host: string | null;
  tag: string | null;
  message: string;
};

/**
 * Tolerant RFC3164/RFC5424 syslog line parser.
 * Extracts PRI (facility/severity), then best-effort host/tag/message.
 * NEVER throws — unparseable parts stay in the message.
 */
export function parseSyslogLine(raw: string): ParsedSyslogLine {
  const fallback: ParsedSyslogLine = { facility: 16, severity: 6, host: null, tag: null, message: raw };
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
      message: message.length ? message : rest,
    };
  } catch {
    return fallback;
  }
}
