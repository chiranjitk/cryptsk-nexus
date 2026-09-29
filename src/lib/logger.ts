/**
 * Cryptsk — Structured Logger
 * Phase 0 deliverable: structured logging baseline.
 *
 * Uses JSON format in production, pretty-print in development.
 * All log entries include ISO timestamp, level, message, contextual fields.
 * Integrates with audit-service.ts (which writes to audit_events table)
 * and PM2 out/error logs (which capture stdout/stderr).
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info("user_logged_in", { userId, ip });
 *   logger.error("db_query_failed", { error: err.message, query });
 *   logger.warn("rate_limit_warning", { ip, attempts });
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service?: string;
  [key: string]: unknown;
}

const SERVICE_NAME = process.env.NEXT_PUBLIC_APP_NAME || "cryptsk-nexus";
const IS_PROD = process.env.NODE_ENV === "production";
const MIN_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || (IS_PROD ? "info" : "debug");

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_LEVEL];
}

function formatEntry(level: LogLevel, message: string, context?: Record<string, unknown>): string {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: SERVICE_NAME,
    ...(context || {}),
  };

  if (IS_PROD) {
    // JSON format for production (easy to parse by log aggregators)
    return JSON.stringify(entry);
  }
  // Pretty format for development (human-readable)
  const ctx = context ? " " + JSON.stringify(context) : "";
  return `[${entry.timestamp}] ${level.toUpperCase().padEnd(5)} [${SERVICE_NAME}] ${message}${ctx}`;
}

function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;
  const line = formatEntry(level, message, context);
  if (level === "error") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => log("debug", message, context),
  info: (message: string, context?: Record<string, unknown>) => log("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => log("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => log("error", message, context),

  // ─── Convenience helpers ───────────────────────────────────
  /** Log API request lifecycle event */
  api: (method: string, path: string, context?: Record<string, unknown>) =>
    log("info", `api_request`, { method, path, ...context }),

  /** Log DB query event (debug-level by default) */
  db: (operation: string, model: string, context?: Record<string, unknown>) =>
    log("debug", `db_${operation}`, { model, ...context }),

  /** Log security event (always info-level, audit-service handles persistence) */
  security: (event: string, context?: Record<string, unknown>) =>
    log("info", `security_${event}`, context),

  /** Log performance metric */
  metric: (name: string, value: number, unit?: string, context?: Record<string, unknown>) =>
    log("info", `metric_${name}`, { value, unit, ...context }),
};

// ─── Default export ─────────────────────────────────────────
export default logger;
