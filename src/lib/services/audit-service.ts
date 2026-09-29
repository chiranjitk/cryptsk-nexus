/**
 * Cryptsk — Centralized Audit Logging Service
 *
 * EVERY API route should use this to log actions.
 * Auto-captures: userId, userName, ipAddress, userAgent, endpoint, method.
 * Supports: change diffs (before/after), bulk operations, silent mode.
 *
 * Usage in API routes:
 *   import { auditLog } from "@/lib/services/audit-service";
 *
 *   // Basic
 *   await auditLog(request, "CREATE", "Subscriber", newId, { name, phone, planId });
 *
 *   // With diff (UPDATE)
 *   await auditLog(request, "UPDATE", "Plan", planId, { name: "Fiber 200" }, previousPlan);
 *
 *   // Login
 *   await auditLog(request, "LOGIN", "Auth", userId, { email });
 *
 *   // With explicit userId (recommended when route already has auth)
 *   await auditLog(request, "UPDATE", "Subscriber", id, { status: "suspended" }, null, { userId });
 */

import { db } from "@/lib/db";
import { optionalAuth } from "@/lib/api-auth";
import type { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { logger } from "@/lib/logger";

// ─── Types ──────────────────────────────────────────────────────

interface AuditOptions {
  /** What happened — details of the action (stored as JSON) */
  details?: Record<string, unknown> | unknown[];
  /** The before-state for UPDATE actions — enables diff tracking */
  previousValues?: Record<string, unknown>;
  /** Override the auto-detected user ID */
  userId?: string;
  /** Override the auto-detected user name */
  userName?: string;
  /** Override the auto-detected endpoint */
  endpoint?: string;
  /** Override the auto-detected HTTP method */
  method?: string;
  /** If true, the log write is fire-and-forget (non-blocking). Use for non-critical logs. */
  silent?: boolean;
  /** Allow extra properties for flexible audit context (e.g., provider, type, count, etc.) */
  [key: string]: unknown;
}

type AuditAction =
  | "CREATE" | "UPDATE" | "DELETE" | "BULK_CREATE" | "BULK_UPDATE" | "BULK_DELETE"
  | "LOGIN" | "LOGOUT" | "LOGIN_FAILED" | "PASSWORD_CHANGE"
  | "STATUS_CHANGE" | "PLAN_CHANGE" | "ASSIGN" | "UNASSIGN"
  | "PAYMENT" | "REFUND" | "INVOICE_GENERATE" | "INVOICE_PAID"
  | "EXPORT" | "IMPORT" | "BACKUP" | "RESTORE" | "PURGE"
  | "CONFIG_CHANGE" | "INTEGRATION_TEST" | "API_KEY_ROTATE"
  | "VIEW" | "DOWNLOAD" | "UPLOAD"
  | "VERIFICATION" | "REJECTION" | "APPROVAL"
  | string; // Allow custom actions

// ─── Helpers ────────────────────────────────────────────────────

function extractClientInfo(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";

  const userAgent = request.headers.get("user-agent") || "unknown";
  const endpoint = request.nextUrl.pathname;
  const method = request.method;

  return { ip, userAgent, endpoint, method };
}

function computeDiff(
  previous: Record<string, unknown> | undefined | null,
  current: Record<string, unknown> | unknown[] | undefined | null
): Record<string, { old: unknown; new: unknown }> | null {
  if (!previous || !current || !Array.isArray(current) && typeof current !== "object") {
    return null;
  }

  const prev = previous as Record<string, unknown>;
  const curr = (Array.isArray(current) ? current[0] || {} : current) as Record<string, unknown>;

  const diff: Record<string, { old: unknown; new: unknown }> = {};

  // Only compare keys that exist in BOTH prev and curr (actual changes)
  for (const key of Object.keys(curr)) {
    if (prev[key] === undefined) {
      diff[key] = { old: null, new: curr[key] };
      continue;
    }
    const oldVal = prev[key];
    const newVal = curr[key];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      diff[key] = { old: oldVal, new: newVal };
    }
  }

  return Object.keys(diff).length > 0 ? diff : null;
}

/**
 * Resolve user identity from the request.
 * Tries multiple strategies:
 * 1. Use explicit userId from options (most reliable — route already called requireAuth)
 * 2. Read session cookie via optionalAuth
 * 3. Look up user name from DB when userId is known
 */
async function resolveUser(
  request: NextRequest,
  options: AuditOptions
): Promise<{ userId: string | null; userName: string }> {
  const { userId: overrideUserId, userName: overrideUserName } = options;

  // Strategy 1: Use explicit userId from caller (most reliable)
  let userId = overrideUserId || null;
  let userName = overrideUserName || null;

  // Strategy 2: Try to get userId from session cookie
  if (!userId) {
    try {
      userId = await optionalAuth(request);
    } catch {
      // Session not found or invalid — will log as System
    }
  }

  // Strategy 3: Look up user name from database if we have a userId but no userName
  // Also validates that the userId actually exists (prevents FK constraint violations)
  if (userId) {
    try {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      });
      if (user) {
        if (!userName) userName = user.name || user.email || userId;
      } else {
        // User not found in DB — clear userId to prevent FK constraint violation
        userId = null;
        if (!userName) userName = "Unknown User";
      }
    } catch {
      // DB lookup failed — clear userId to be safe
      userId = null;
      userName = userName || "Unknown User";
    }
  }

  return {
    userId,
    userName: userName || "System",
  };
}

// ─── Main Export ───────────────────────────────────────────────

/**
 * Log an audit event. This is the single entry-point for ALL audit logging.
 *
 * @param request - The NextRequest object (auto-extracts IP, UA, endpoint, method)
 * @param action  - Action type (CREATE, UPDATE, DELETE, LOGIN, etc.)
 * @param entity  - Entity name (Subscriber, Payment, Invoice, etc.)
 * @param entityId - The ID of the affected record
 * @param options - Optional: details, previousValues, overrides, silent mode
 */
export async function auditLog(
  request: NextRequest,
  action: AuditAction,
  entity: string,
  entityId: string,
  options: AuditOptions = {}
): Promise<void> {
  const {
    details,
    previousValues,
    endpoint: overrideEndpoint,
    method: overrideMethod,
    silent = false,
  } = options;

  // Resolve user identity
  const { userId, userName } = await resolveUser(request, options);

  // Auto-detect request metadata
  const clientInfo = extractClientInfo(request);
  const endpoint = overrideEndpoint || clientInfo.endpoint;
  const method = overrideMethod || clientInfo.method;

  // Compute diff if previous values provided
  const diff = computeDiff(
    previousValues,
    details as Record<string, unknown> | undefined
  );

  const logData = {
    id: randomUUID(),
    userId,
    userName,
    action,
    entity,
    entityId,
    details: JSON.stringify(details || {}),
    previousValues: previousValues
      ? JSON.stringify(previousValues)
      : diff
        ? JSON.stringify(diff)
        : "null",
    endpoint,
    method,
    ipAddress: clientInfo.ip,
    userAgent: clientInfo.userAgent.substring(0, 500), // Truncate very long UA strings
  };

  if (silent) {
    // Fire-and-forget — don't block the response
    db.auditLog.create({ data: logData }).catch((err) => {
      logger.error("audit_log_write_failed_silent", { error: err instanceof Error ? err.message : String(err), action, resource, resourceId });
    });
    return;
  }

  try {
    await db.auditLog.create({ data: logData });
  } catch (error) {
    // Audit log failure should never break the main operation
    logger.error("audit_log_write_failed", { error: error instanceof Error ? error.message : String(error), action, resource, resourceId });
  }
}

// ─── Convenience Wrappers ───────────────────────────────────────

/**
 * Log a CREATE event
 */
export async function auditCreate(
  request: NextRequest,
  entity: string,
  entityId: string,
  details?: Record<string, unknown>,
  options?: Omit<AuditOptions, "details" | "previousValues">
): Promise<void> {
  return auditLog(request, "CREATE", entity, entityId, { ...options, details });
}

/**
 * Log an UPDATE event with optional before/after diff
 */
export async function auditUpdate(
  request: NextRequest,
  entity: string,
  entityId: string,
  newValues?: Record<string, unknown>,
  previousValues?: Record<string, unknown>,
  options?: Omit<AuditOptions, "details" | "previousValues">
): Promise<void> {
  return auditLog(request, "UPDATE", entity, entityId, {
    ...options,
    details: newValues,
    previousValues,
  });
}

/**
 * Log a DELETE event
 */
export async function auditDelete(
  request: NextRequest,
  entity: string,
  entityId: string,
  deletedRecord?: Record<string, unknown>,
  options?: Omit<AuditOptions, "details">
): Promise<void> {
  return auditLog(request, "DELETE", entity, entityId, {
    ...options,
    details: deletedRecord ? { deleted: deletedRecord } : undefined,
  });
}

/**
 * Log a STATUS_CHANGE event
 */
export async function auditStatusChange(
  request: NextRequest,
  entity: string,
  entityId: string,
  fromStatus: string,
  toStatus: string,
  extra?: Record<string, unknown>
): Promise<void> {
  return auditLog(request, "STATUS_CHANGE", entity, entityId, {
    details: { from: fromStatus, to: toStatus, ...extra },
  });
}

/**
 * Log a LOGIN event
 */
export async function auditLogin(
  request: NextRequest,
  userId: string,
  email: string,
  success: boolean = true
): Promise<void> {
  return auditLog(request, success ? "LOGIN" : "LOGIN_FAILED", "Auth", userId, {
    userId,
    details: { email, success },
  });
}

/**
 * Log bulk operations
 */
export async function auditBulk(
  request: NextRequest,
  action: "BULK_CREATE" | "BULK_UPDATE" | "BULK_DELETE",
  entity: string,
  count: number,
  ids?: string[],
  details?: Record<string, unknown>
): Promise<void> {
  return auditLog(request, action, entity, `bulk_${Date.now()}`, {
    details: { count, ids, ...details },
  });
}

/**
 * Log an EXPORT event
 */
export async function auditExport(
  request: NextRequest,
  entity: string,
  format: string,
  recordCount: number
): Promise<void> {
  return auditLog(request, "EXPORT", entity, `export_${Date.now()}`, {
    details: { format, recordCount },
    silent: true, // Exports are lower priority
  });
}
