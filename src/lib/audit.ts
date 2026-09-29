import { db } from "@/lib/db";
import type { AuditAction, Prisma } from "@prisma/client";

// ============================================================
// CRYPTSK Nexus — Audit Service
// Per: docs/architecture/08_SECURITY_RBAC_SPECIFICATION.md §24
// Audit records are IMMUTABLE — never updated or deleted.
// ============================================================

type AuditInput = {
  userId?: string | null;
  action?: AuditAction; // optional — helper wrappers (auditUpdate etc.) force their own action
  resource: string;
  resourceId?: string | null;
  resourceName?: string | null;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  sessionId?: string | null;
  result?: string; // success | failure | denied
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
};

function safeStringify(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

export async function auditCreate(input: AuditInput) {
  try {
    await db.auditEvent.create({
      data: {
        userId: input.userId || null,
        action: input.action ?? "update",
        resource: input.resource,
        resourceId: input.resourceId || null,
        resourceName: input.resourceName || null,
        before: safeStringify(input.before),
        after: safeStringify(input.after),
        ipAddress: input.ipAddress || null,
        userAgent: input.userAgent || null,
        sessionId: input.sessionId || null,
        result: input.result || "success",
        errorMessage: input.errorMessage || null,
        metadata: safeStringify(input.metadata),
      },
    });
  } catch (err) {
    // Audit must never block the operation — log but don't throw
    console.error("[audit] failed to create event:", err);
  }
}

export async function auditLogin(input: {
  userId: string | null;
  email: string;
  ip: string;
  success: boolean;
  errorMessage?: string;
}) {
  return auditCreate({
    userId: input.userId,
    action: input.success ? "login" : "login_failed",
    resource: "auth",
    resourceId: input.userId,
    resourceName: input.email,
    ipAddress: input.ip,
    result: input.success ? "success" : "failure",
    errorMessage: input.errorMessage,
  });
}

export async function auditUpdate(input: AuditInput) {
  return auditCreate({ ...input, action: "update" });
}

export async function auditDelete(input: AuditInput) {
  return auditCreate({ ...input, action: "delete" });
}

export async function auditCreateEntity(input: AuditInput) {
  return auditCreate({ ...input, action: "create" });
}

export async function auditConfigChange(input: AuditInput) {
  return auditCreate({ ...input, action: "config_change" });
}

export async function auditPermissionChange(input: AuditInput) {
  return auditCreate({ ...input, action: "permission_change" });
}

export async function auditRoleChange(input: AuditInput) {
  return auditCreate({ ...input, action: "role_change" });
}

export async function auditModuleToggle(input: AuditInput) {
  return auditCreate({ ...input, action: "module_toggle" });
}

export async function auditFeatureFlagToggle(input: AuditInput) {
  return auditCreate({ ...input, action: "feature_flag_toggle" });
}

export async function auditLogout(input: {
  userId: string;
  ip: string;
}) {
  return auditCreate({
    userId: input.userId,
    action: "logout",
    resource: "auth",
    resourceId: input.userId,
    ipAddress: input.ip,
    result: "success",
  });
}

// Query audit events (for the audit log UI)
export async function getAuditEvents(params: {
  page?: number;
  pageSize?: number;
  userId?: string;
  action?: AuditAction;
  resource?: string;
  result?: string;
  startDate?: Date;
  endDate?: Date;
}) {
  const page = params.page || 1;
  const pageSize = params.pageSize || 50;
  const skip = (page - 1) * pageSize;

  const where: Prisma.AuditEventWhereInput = {};
  if (params.userId) where.userId = params.userId;
  if (params.action) where.action = params.action;
  if (params.resource) where.resource = params.resource;
  if (params.result) where.result = params.result;
  if (params.startDate || params.endDate) {
    where.createdAt = {
      ...(params.startDate ? { gte: params.startDate } : {}),
      ...(params.endDate ? { lte: params.endDate } : {}),
    };
  }

  const [events, total] = await Promise.all([
    db.auditEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      include: { user: { select: { name: true, email: true } } },
    }),
    db.auditEvent.count({ where }),
  ]);

  return { events, total, page, pageSize };
}
