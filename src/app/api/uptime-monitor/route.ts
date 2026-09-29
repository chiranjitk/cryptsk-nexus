import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { exec } from "child_process";
import { promisify } from "util";
import net from "net";
import dns from "dns";
import { requireAuth, AuthError } from "@/lib/api-auth";

const execAsync = promisify(exec);
const dnsResolve = promisify(dns.resolve);

// In-memory interval tracking
const intervals: Record<string, ReturnType<typeof setInterval>> = {};

async function performCheck(target: { id: string; type: string; target: string; timeout: number; retries: number }) {
  let lastError = "";
  for (let attempt = 0; attempt < target.retries; attempt++) {
    try {
      const start = Date.now();
      let status = "up" as string;
      let latency: number | null = null;
      let statusCode: number | null = null;
      let message: string | null = null;

      if (target.type === "http") {
        // Validate target is a valid URL to prevent SSRF
        try {
          const url = target.target.startsWith("http") ? target.target : `https://${target.target}`;
          const parsedUrl = new URL(url);
          if (!["http:", "https:"].includes(parsedUrl.protocol)) {
            status = "down";
            message = "Invalid protocol";
          } else {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), target.timeout * 1000);
            try {
              const res = await fetch(url, { method: "GET", signal: controller.signal, redirect: "follow" });
              statusCode = res.status;
              latency = Date.now() - start;
              if (res.status >= 500) {
                status = "down";
                message = `HTTP ${res.status}`;
              }
            } catch (fetchErr: unknown) {
              clearTimeout(timeoutId);
              if (fetchErr instanceof Error && fetchErr.name === "AbortError") {
                status = "timeout";
                message = `Timeout after ${target.timeout}s`;
              } else {
                status = "down";
                message = fetchErr instanceof Error ? fetchErr.message : "Connection failed";
              }
            }
            clearTimeout(timeoutId);
          }
        } catch {
          status = "down";
          message = "Invalid URL";
        }
      } else if (target.type === "ping") {
        // Validate target is a valid hostname/IP to prevent command injection
        const hostRegex = /^[a-zA-Z0-9._-]+$/;
        if (!hostRegex.test(target.target)) {
          status = "down";
          message = "Invalid hostname";
        } else {
          const { stdout } = await execAsync(`ping -c 1 -W ${target.timeout} ${target.target}`, {
            timeout: (target.timeout + 2) * 1000,
          });
          const timeMatch = stdout.match(/time[=<]([\d.]+)/);
          latency = timeMatch ? parseFloat(timeMatch[1]) : (Date.now() - start);
          if (stdout.includes("100% packet loss")) {
            status = "down";
            message = "100% packet loss";
          }
        }
      } else if (target.type === "tcp") {
        latency = await new Promise<number>((resolve, reject) => {
          const socket = new net.Socket();
          const timeoutId = setTimeout(() => {
            socket.destroy();
            reject(new Error(`Timeout after ${target.timeout}s`));
          }, target.timeout * 1000);
          const [host, portStr] = target.target.split(":");
          const port = parseInt(portStr || "80", 10);
          const connStart = Date.now();
          socket.connect(port, host, () => {
            clearTimeout(timeoutId);
            latency = Date.now() - connStart;
            socket.destroy();
            resolve(latency);
          });
          socket.on("error", (err) => {
            clearTimeout(timeoutId);
            socket.destroy();
            reject(err);
          });
        });
      } else if (target.type === "dns") {
        const dnsStart = Date.now();
        await dnsResolve(target.target);
        latency = Date.now() - dnsStart;
      }

      await db.uptimeCheck.create({
        data: {
          targetId: target.id,
          status,
          latency,
          statusCode,
          message,
        },
      });

      return { status, latency, statusCode, message };
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  // All retries failed
  await db.uptimeCheck.create({
    data: {
      targetId: target.id,
      status: "down",
      message: lastError,
    },
  });
  return { status: "down", message: lastError };
}

function startMonitoring(targetId: string) {
  if (intervals[targetId]) return;
  (async () => {
    const target = await db.uptimeTarget.findUnique({ where: { id: targetId } });
    if (!target || target.paused) return;
    await performCheck(target);
    intervals[targetId] = setInterval(async () => {
      const t = await db.uptimeTarget.findUnique({ where: { id: targetId } });
      if (!t || t.paused) {
        clearInterval(intervals[targetId]);
        delete intervals[targetId];
        return;
      }
      await performCheck(t);
    }, (target.interval || 60) * 1000);
  })();
}

function stopMonitoring(targetId: string) {
  if (intervals[targetId]) {
    clearInterval(intervals[targetId]);
    delete intervals[targetId];
  }
}

// Initialize monitoring for all active targets
async function initMonitoring() {
  const targets = await db.uptimeTarget.findMany({ where: { paused: false } });
  for (const t of targets) {
    startMonitoring(t.id);
  }
}
// Delayed init to avoid crashing the module at import time
setTimeout(() => { initMonitoring().catch(console.error); }, 2000);

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "status";

  if (action === "status") {
    const targets = await db.uptimeTarget.findMany({
      include: {
        UptimeCheck: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });
    const enriched = await Promise.all(
      targets.map(async (t) => {
        const totalChecks = await db.uptimeCheck.count({ where: { targetId: t.id } });
        const upChecks = await db.uptimeCheck.count({ where: { targetId: t.id, status: "up" } });
        const uptimePercent = totalChecks > 0 ? (upChecks / totalChecks) * 100 : 100;
        return {
          ...t,
          lastCheck: t.uptimeChecks[0] || null,
          totalChecks,
          upChecks,
          uptimePercent: Math.round(uptimePercent * 100) / 100,
        };
      })
    );
    return NextResponse.json({ targets: enriched });
  }

  if (action === "history") {
    const targetId = searchParams.get("targetId");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const statusFilter = searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (targetId) where.targetId = targetId;
    if (statusFilter) where.status = statusFilter;

    const [checks, total] = await Promise.all([
      db.uptimeCheck.findMany({
        where,
        include: { UptimeTarget: { select: { name: true, type: true, target: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.uptimeCheck.count({ where }),
    ]);
    return NextResponse.json({ checks, total, page, limit });
  }

  if (action === "incidents") {
    // Find consecutive failed checks (incidents)
    const checks = await db.uptimeCheck.findMany({
      orderBy: { createdAt: "asc" },
      include: { UptimeTarget: true },
    });

    const incidents: Array<Record<string, unknown>> = [];
    let current: Record<string, unknown> | null = null;

    for (const check of checks) {
      if (check.status === "down" || check.status === "timeout") {
        if (!current) {
          current = {
            id: check.id,
            targetName: check.uptimeTarget.name,
            targetId: check.targetId,
            startAt: check.createdAt,
            endAt: null,
            checks: 1,
            message: check.message,
          };
        } else if (current.targetId === check.targetId) {
          current.checks = (current.checks as number) + 1;
          current.endAt = check.createdAt;
          current.message = check.message;
        } else {
          // Different target
          if (current) incidents.push(current);
          current = {
            id: check.id,
            targetName: check.uptimeTarget.name,
            targetId: check.targetId,
            startAt: check.createdAt,
            endAt: null,
            checks: 1,
            message: check.message,
          };
        }
      } else {
        if (current) {
          incidents.push(current);
          current = null;
        }
      }
    }
    if (current) incidents.push(current);

    // Sort by start time desc
    incidents.sort((a, b) => new Date(b.startAt as string).getTime() - new Date(a.startAt as string).getTime());

    return NextResponse.json({ incidents });
  }

  if (action === "suggested-services") {
    const suggested = [
      { name: "Grafana", type: "http", target: "http://localhost:3000", interval: 60 },
      { name: "Prometheus", type: "http", target: "http://localhost:9090", interval: 60 },
      { name: "FRR BGP", type: "tcp", target: "localhost:179", interval: 30 },
      { name: "FRR OSPF", type: "tcp", target: "localhost:2604", interval: 30 },
      { name: "DNS Resolver", type: "tcp", target: "localhost:53", interval: 30 },
      { name: "RADIUS Auth", type: "tcp", target: "localhost:1812", interval: 30 },
      { name: "RADIUS Acct", type: "tcp", target: "localhost:1813", interval: 30 },
      { name: "SNMP Service", type: "tcp", target: "localhost:3020", interval: 60 },
      { name: "MikroTik Service", type: "tcp", target: "localhost:3021", interval: 60 },
      { name: "GenieACS", type: "http", target: "http://localhost:7547", interval: 60 },
      { name: "Syslog UDP", type: "tcp", target: "localhost:1514", interval: 60 },
      { name: "Node Exporter", type: "http", target: "http://localhost:9100", interval: 60 },
      { name: "Blackbox Exporter", type: "http", target: "http://localhost:9115", interval: 60 },
      { name: "Captive Portal", type: "http", target: "http://localhost:8080", interval: 60 },
      { name: "Uptime Kuma", type: "http", target: "http://localhost:3002", interval: 60 },
      { name: "MongoDB", type: "tcp", target: "localhost:27017", interval: 60 },
      { name: "strongSwan", type: "tcp", target: "localhost:500", interval: 60 },
      { name: "PPPoE Server", type: "tcp", target: "localhost:16004", interval: 60 },
      { name: "DHCP Server", type: "tcp", target: "localhost:67", interval: 60 },
      { name: "NAT Service", type: "ping", target: "8.8.8.8", interval: 30 },
    ];
    return NextResponse.json({ services: suggested });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function POST(request: NextRequest) {
  try {
    try {
      await requireAuth(request);
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
      throw e;
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
  }
  const body = await request.json();
  const { action } = body;

  if (action === "add-target") {
    const { name, type, target, interval = 60, retries = 3, timeout = 10 } = body;
    if (!name || !type || !target) {
      return NextResponse.json({ error: "name, type, and target are required" }, { status: 400 });
    }
    const t = await db.uptimeTarget.create({ data: { name, type, target, interval, retries, timeout } });
    startMonitoring(t.id);
    return NextResponse.json({ target: t });
  }

  if (action === "remove-target") {
    const { id } = body;
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    stopMonitoring(id);
    await db.uptimeTarget.delete({ where: { id } });
    return NextResponse.json({ success: true });
  }

  if (action === "check-now") {
    const { id } = body;
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const target = await db.uptimeTarget.findUnique({ where: { id } });
    if (!target) return NextResponse.json({ error: "Target not found" }, { status: 404 });
    const result = await performCheck(target);
    return NextResponse.json(result);
  }

  if (action === "pause") {
    const { id } = body;
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    await db.uptimeTarget.update({ where: { id }, data: { paused: true } });
    stopMonitoring(id);
    return NextResponse.json({ success: true });
  }

  if (action === "resume") {
    const { id } = body;
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    await db.uptimeTarget.update({ where: { id }, data: { paused: false } });
    startMonitoring(id);
    return NextResponse.json({ success: true });
  }

  if (action === "bulk-add") {
    // NOTE: Bulk-add checks for existing targets by name:target key to avoid duplicates.
    // There is no automatic seedDefaults — targets are only created via explicit API calls.
    const { services } = body;
    if (!Array.isArray(services) || services.length === 0) {
      return NextResponse.json({ error: "services array is required" }, { status: 400 });
    }

    // Get existing targets to skip duplicates
    const existing = await db.uptimeTarget.findMany({
      select: { name: true, target: true },
    });
    const existingKeys = new Set(existing.map((e) => `${e.name}:${e.target}`));

    const results: Array<{ name: string; target: string; success: boolean; reason?: string }> = [];
    let addedCount = 0;

    for (const svc of services) {
      const key = `${svc.name}:${svc.target}`;
      if (existingKeys.has(key)) {
        results.push({ name: svc.name, target: svc.target, success: false, reason: "Already exists" });
        continue;
      }
      if (!svc.name || !svc.type || !svc.target) {
        results.push({ name: svc.name || "Unknown", target: svc.target || "Unknown", success: false, reason: "Missing fields" });
        continue;
      }
      try {
        const t = await db.uptimeTarget.create({
          data: {
            name: svc.name,
            type: svc.type,
            target: svc.target,
            interval: svc.interval || 60,
            retries: svc.retries || 3,
            timeout: svc.timeout || 10,
          },
        });
        startMonitoring(t.id);
        existingKeys.add(key);
        results.push({ name: svc.name, target: svc.target, success: true });
        addedCount++;
      } catch (err: unknown) {
        console.error("[Uptime Monitor] Add service error:", err);
        results.push({ name: svc.name, target: svc.target, success: false, reason: "Failed to add service" });
      }
    }

    return NextResponse.json({ added: addedCount, total: services.length, results });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
