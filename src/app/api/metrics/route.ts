/**
 * /api/metrics — Prometheus-format metrics endpoint
 * Phase 0 deliverable: tracing/metrics baseline.
 *
 * Returns process + DB + HTTP request metrics in Prometheus text format.
 * No auth required (so external scrapers can access).
 *
 * Metrics exposed:
 * - process_uptime_seconds
 * - process_memory_rss_bytes
 * - process_memory_heap_used_bytes
 * - process_memory_heap_total_bytes
 * - db_connections_active (via Prisma client)
 * - db_size_bytes
 * - http_requests_total (simple counter, resets on restart)
 * - http_request_duration_ms (histogram buckets)
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ─── Simple in-memory HTTP counters (resets on restart) ─────
interface HttpCounter {
  count: number;
  durations: number[];
}

const httpCounters = new Map<string, HttpCounter>();

export function recordHttpRequest(method: string, path: string, durationMs: number) {
  const key = `${method}:${path}`;
  const counter = httpCounters.get(key) || { count: 0, durations: [] };
  counter.count += 1;
  counter.durations.push(durationMs);
  // Keep last 1000 samples per endpoint
  if (counter.durations.length > 1000) {
    counter.durations.shift();
  }
  httpCounters.set(key, counter);
}

// ─── Helper: format Prometheus metric ─────────────────────────
function metric(
  name: string,
  value: number,
  labels?: Record<string, string>,
  help?: string,
  type?: "counter" | "gauge" | "histogram"
): string {
  const lines: string[] = [];
  if (help) lines.push(`# HELP ${name} ${help}`);
  if (type) lines.push(`# TYPE ${name} ${type}`);
  const labelStr = labels
    ? "{" + Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(",") + "}"
    : "";
  lines.push(`${name}${labelStr} ${value}`);
  return lines.join("\n");
}

function histogramLines(name: string, durations: number[], help: string): string {
  const buckets = [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000]; // ms
  const sorted = [...durations].sort((a, b) => a - b);
  const lines: string[] = [];
  lines.push(`# HELP ${name} ${help}`);
  lines.push(`# TYPE ${name} histogram`);

  for (const bucket of buckets) {
    const count = sorted.filter((d) => d <= bucket).length;
    lines.push(`${name}_bucket{le="${bucket}"} ${count}`);
  }
  lines.push(`${name}_bucket{le="+Inf"} ${sorted.length}`);
  lines.push(`${name}_sum ${sorted.reduce((a, b) => a + b, 0)}`);
  lines.push(`${name}_count ${sorted.length}`);
  return lines.join("\n");
}

// ─── GET handler — Prometheus text format ──────────────────────
export async function GET() {
  const mem = process.memoryUsage();
  const uptime = process.uptime();
  const lines: string[] = [];

  // ── Process metrics ───────────────────────────────────────
  lines.push(metric("process_uptime_seconds", uptime, undefined, "Process uptime in seconds", "gauge"));
  lines.push(metric("process_memory_rss_bytes", mem.rss, undefined, "Resident set size in bytes", "gauge"));
  lines.push(metric("process_memory_heap_used_bytes", mem.heapUsed, undefined, "Heap used in bytes", "gauge"));
  lines.push(metric("process_memory_heap_total_bytes", mem.heapTotal, undefined, "Heap total in bytes", "gauge"));
  lines.push(metric("process_memory_external_bytes", mem.external, undefined, "External memory in bytes", "gauge"));

  // ── Database metrics ──────────────────────────────────────
  let dbConnected = 0;
  let dbSize = 0;
  try {
    const result = await db.$queryRaw`SELECT pg_database_size(current_database())::bigint AS size, count(*)::int AS connections FROM pg_stat_activity WHERE datname = current_database()` as Array<{ size: bigint; connections: number }>;
    if (result.length > 0) {
      dbConnected = result[0].connections;
      dbSize = Number(result[0].size);
    }
  } catch (err) {
    logger.warn("metrics_db_query_failed", { error: err instanceof Error ? err.message : String(err) });
  }
  lines.push(metric("db_connections_active", dbConnected, undefined, "Active DB connections", "gauge"));
  lines.push(metric("db_size_bytes", dbSize, undefined, "Database size in bytes", "gauge"));

  // ── HTTP request metrics ───────────────────────────────────
  let totalReqs = 0;
  for (const [key, counter] of httpCounters.entries()) {
    const [method, path] = key.split(":");
    lines.push(metric("http_requests_total", counter.count, { method, path }, "Total HTTP requests", "counter"));
    if (counter.durations.length > 0) {
      lines.push(histogramLines("http_request_duration_ms", counter.durations, "HTTP request duration in ms"));
    }
    totalReqs += counter.count;
  }
  lines.push(metric("http_requests_total_sum", totalReqs, undefined, "Total HTTP requests across all endpoints", "counter"));

  return new NextResponse(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
