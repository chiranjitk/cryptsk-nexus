import { NextRequest, NextResponse } from "next/server";
import { promises as dnsPromises } from "node:dns";
import net from "node:net";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { auditCreate } from "@/lib/audit";

// ============================================================
// CRYPTSK Nexus — POST /api/monitoring/diagnostics
// Admin network diagnostic toolbox (ISP ops tool):
//   dns  — resolve A / AAAA / PTR / MX / TXT via the system resolver
//   tcp  — raw TCP connect to target:port (measures connect latency)
//   http — HEAD request (measures TTFB, reports status + server header)
// Private IPs are intentionally allowed: this is an internal
// ISP operations tool. Every run is recorded in service_probe_logs
// as service "diagnostic:<tool>" and audit-logged.
// RBAC: monitoring.update
// ============================================================

const DNS_RECORD_TYPES = ["A", "AAAA", "PTR", "MX", "TXT"] as const;
type DnsRecordType = (typeof DNS_RECORD_TYPES)[number];

const DIAGNOSTIC_TIMEOUT_MS = 5000;

// Next.js redirect() inside requireAuth surfaces as a thrown NEXT_REDIRECT —
// map it to a clean 401 JSON instead of a 500.
function isRedirectError(err: unknown): boolean {
  return typeof err === "object" && err !== null && String((err as any)?.digest || "").startsWith("NEXT_REDIRECT");
}

/** Raw TCP connect probe — resolves exactly once, always destroys the socket. */
function tcpConnect(host: string, port: number, timeoutMs: number) {
  return new Promise<{ ok: boolean; latencyMs: number; remoteAddress?: string; remotePort?: number; error?: string }>((resolve) => {
    const started = Date.now();
    const socket = net.connect({ host, port });
    let settled = false;
    const finish = (r: { ok: boolean; latencyMs: number; remoteAddress?: string; remotePort?: number; error?: string }) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(r);
    };
    socket.setTimeout(timeoutMs);
    socket.on("connect", () =>
      finish({ ok: true, latencyMs: Date.now() - started, remoteAddress: socket.remoteAddress ?? undefined, remotePort: socket.remotePort ?? undefined })
    );
    socket.on("timeout", () => finish({ ok: false, latencyMs: Date.now() - started, error: `no connection within ${timeoutMs}ms (timeout)` }));
    socket.on("error", (err) => finish({ ok: false, latencyMs: Date.now() - started, error: err.message }));
  });
}

export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("monitoring", "update");
    const body = await req.json();
    const { tool, target, port, recordType } = body;

    // ── Validation ──
    if (tool !== "dns" && tool !== "tcp" && tool !== "http") {
      return NextResponse.json({ error: "tool must be one of: dns, tcp, http" }, { status: 400 });
    }
    if (typeof target !== "string" || !target.trim() || /\s/.test(target) || target.length > 255) {
      return NextResponse.json({ error: "target is required, must not contain spaces and be ≤ 255 chars" }, { status: 400 });
    }
    const cleanTarget = target.trim();

    if (tool === "dns") {
      if (recordType !== undefined && !DNS_RECORD_TYPES.includes(recordType)) {
        return NextResponse.json({ error: `recordType must be one of: ${DNS_RECORD_TYPES.join(", ")}` }, { status: 400 });
      }
      const rt = (recordType as DnsRecordType) || "A";
      // PTR targets must be IP literals (reverse lookup)
      if (rt === "PTR" && net.isIP(cleanTarget) === 0) {
        return NextResponse.json({ error: "PTR lookups require an IP address target" }, { status: 400 });
      }

      const resolver = new dnsPromises.Resolver({ timeout: DIAGNOSTIC_TIMEOUT_MS, tries: 2 });
      const started = Date.now();
      try {
        let result: Record<string, unknown>;
        if (rt === "A") result = { addresses: await resolver.resolve4(cleanTarget) };
        else if (rt === "AAAA") result = { addresses: await resolver.resolve6(cleanTarget) };
        else if (rt === "PTR") result = { addresses: await resolver.reverse(cleanTarget) };
        else if (rt === "MX") result = { records: await resolver.resolveMx(cleanTarget) };
        else result = { records: await resolver.resolveTxt(cleanTarget) };
        const latencyMs = Date.now() - started;

        await db.serviceProbeLog.create({
          data: { service: "diagnostic:dns", status: "up", latencyMs, detail: `${rt} ${cleanTarget}` },
        });
        await auditCreate({
          userId: user.id, action: "execute", resource: "monitoring",
          resourceName: `dns:${rt}:${cleanTarget}`,
          metadata: { tool: "dns", target: cleanTarget, recordType: rt, ok: true, latencyMs },
          ipAddress: req.headers.get("x-forwarded-for") || "unknown",
        });
        return NextResponse.json({ tool, target: cleanTarget, ok: true, latencyMs, result, checkedAt: new Date().toISOString() });
      } catch (err) {
        const latencyMs = Date.now() - started;
        const error = err instanceof Error ? err.message : "DNS lookup failed";
        await db.serviceProbeLog.create({
          data: { service: "diagnostic:dns", status: "down", latencyMs, detail: `${rt} ${cleanTarget}` },
        });
        await auditCreate({
          userId: user.id, action: "execute", resource: "monitoring",
          resourceName: `dns:${rt}:${cleanTarget}`,
          metadata: { tool: "dns", target: cleanTarget, recordType: rt, ok: false, error },
          ipAddress: req.headers.get("x-forwarded-for") || "unknown",
        });
        return NextResponse.json({ tool, target: cleanTarget, ok: false, latencyMs, error, checkedAt: new Date().toISOString() });
      }
    }

    if (tool === "tcp") {
      let portNum = 80;
      if (port !== undefined) {
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
          return NextResponse.json({ error: "port must be an integer between 1 and 65535" }, { status: 400 });
        }
        portNum = port;
      }

      const probe = await tcpConnect(cleanTarget, portNum, DIAGNOSTIC_TIMEOUT_MS);

      await db.serviceProbeLog.create({
        data: {
          service: "diagnostic:tcp",
          status: probe.ok ? "up" : "down",
          latencyMs: probe.latencyMs,
          detail: `${cleanTarget}:${portNum}`,
        },
      });
      await auditCreate({
        userId: user.id, action: "execute", resource: "monitoring",
        resourceName: `tcp:${cleanTarget}:${portNum}`,
        metadata: { tool: "tcp", target: cleanTarget, port: portNum, ok: probe.ok, latencyMs: probe.latencyMs, error: probe.error },
        ipAddress: req.headers.get("x-forwarded-for") || "unknown",
      });
      return NextResponse.json({
        tool,
        target: cleanTarget,
        ok: probe.ok,
        latencyMs: probe.latencyMs,
        result: probe.ok ? { remoteAddress: probe.remoteAddress, remotePort: probe.remotePort } : undefined,
        error: probe.error,
        checkedAt: new Date().toISOString(),
      });
    }

    // ── tool === "http" ──
    let url = cleanTarget;
    if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: "invalid URL for http probe" }, { status: 400 });
    }

    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DIAGNOSTIC_TIMEOUT_MS);
    try {
      const res = await fetch(url, { method: "HEAD", signal: controller.signal, redirect: "follow" });
      const latencyMs = Date.now() - started; // TTFB (headers received)
      const result = {
        statusCode: res.status,
        statusText: res.statusText,
        serverHeader: res.headers.get("server"),
        finalUrl: res.url,
      };
      await db.serviceProbeLog.create({
        data: { service: "diagnostic:http", status: "up", latencyMs, detail: url },
      });
      await auditCreate({
        userId: user.id, action: "execute", resource: "monitoring",
        resourceName: `http:${url}`,
        metadata: { tool: "http", target: cleanTarget, ok: true, statusCode: res.status, latencyMs },
        ipAddress: req.headers.get("x-forwarded-for") || "unknown",
      });
      return NextResponse.json({ tool, target: cleanTarget, ok: true, latencyMs, result, checkedAt: new Date().toISOString() });
    } catch (err) {
      const latencyMs = Date.now() - started;
      const error = controller.signal.aborted
        ? `no response within ${DIAGNOSTIC_TIMEOUT_MS}ms (timeout)`
        : err instanceof Error
          ? err.message
          : "HTTP request failed";
      await db.serviceProbeLog.create({
        data: { service: "diagnostic:http", status: "down", latencyMs, detail: url },
      });
      await auditCreate({
        userId: user.id, action: "execute", resource: "monitoring",
        resourceName: `http:${url}`,
        metadata: { tool: "http", target: cleanTarget, ok: false, error },
        ipAddress: req.headers.get("x-forwarded-for") || "unknown",
      });
      return NextResponse.json({ tool, target: cleanTarget, ok: false, latencyMs, error, checkedAt: new Date().toISOString() });
    } finally {
      clearTimeout(timer);
    }
  } catch (err: any) {
    if (err instanceof Response) return err;
    if (isRedirectError(err)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[/api/monitoring/diagnostics] POST failed:", err);
    return NextResponse.json({ error: "Diagnostic run failed" }, { status: 500 });
  }
}
