/**
 * Enhanced Audit Log API — /api/audit-log
 *
 * GET    — Query audit logs with full filtering, pagination, and statistics
 * POST   — Create a manual audit log entry
 * PATCH  — Archive / restore log rows (retention lifecycle, settings.update RBAC)
 * DELETE — Purge old audit logs (requires authenticated user)
 */

import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, optionalAuth, requirePermission, AuthError } from "@/lib/api-auth";
import { auditLog, auditExport } from "@/lib/services/audit-service";
import { csvResponse, generateExportFilename } from "@/lib/export-utils";

// ─── Helpers ────────────────────────────────────────────────────

function parsePagination(
  page: string | null,
  limit: string | null
): { page: number; limit: number; skip: number } {
  const p = Math.max(1, parseInt(page || "1") || 1);
  const l = Math.min(200, Math.max(1, parseInt(limit || "50") || 50));
  return { page: p, limit: l, skip: (p - 1) * l };
}

function buildWhereClause(searchParams: URLSearchParams) {
  const where: Record<string, unknown> = {};

  const action = searchParams.get("action");
  if (action) where.action = action;

  const entity = searchParams.get("entity");
  if (entity) where.entity = entity;

  const entityId = searchParams.get("entityId");
  if (entityId) where.entityId = entityId;

  const userId = searchParams.get("userId");
  if (userId) where.userId = userId;

  // Archived lifecycle filter [NEW-FEATURE]: job-009 marks rows isArchived at
  // the retention window. UI chips: active → exclude, archived → only,
  // all → include (default "all" keeps backward compatibility).
  const archived = searchParams.get("archived");
  if (archived === "exclude") where.isArchived = false;
  else if (archived === "only") where.isArchived = true;

  const search = searchParams.get("search");
  if (search) {
    where.OR = [
      { action: { contains: search, mode: "insensitive" } },
      { entity: { contains: search, mode: "insensitive" } },
      { entityId: { contains: search, mode: "insensitive" } },
      { details: { contains: search, mode: "insensitive" } },
      { ipAddress: { contains: search, mode: "insensitive" } },
      { endpoint: { contains: search, mode: "insensitive" } },
      { User: { name: { contains: search, mode: "insensitive" } } },
    ];
  }

  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  if (startDate || endDate) {
    const timestampFilter: Record<string, unknown> = {};
    if (startDate) timestampFilter.gte = new Date(startDate);
    if (endDate) timestampFilter.lte = new Date(endDate);
    where.timestamp = timestampFilter;
  }

  return where;
}

// ─── GET: Query Audit Logs ─────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const type = searchParams.get("type");

    if (type === "anomalies") {
      return GET_anomalies(request);
    }

    if (type === "export-all") {
      return GET_export_all(request);
    }

    if (type === "retention-info") {
      return GET_retention_info(request);
    }

    const userId = await requireAuth(request);
    const where = buildWhereClause(searchParams);
    const { page, limit, skip } = parsePagination(
      searchParams.get("page"),
      searchParams.get("limit")
    );

    const sortDir = searchParams.get("sort") === "asc" ? "asc" : "desc";

    // Fetch logs + total count in parallel
    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { timestamp: sortDir },
        include: {
          User: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      db.auditLog.count({ where }),
    ]);

    // ── Compute statistics ──
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);
    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Pre-compute daily counts for the last 7 days (single query, grouped in JS)
    const weekLogs = await db.auditLog.findMany({
      where: { timestamp: { gte: weekStart } },
      select: { timestamp: true },
      take: 100000,
    });
    const dailyCounts: { date: string; count: number }[] = Array.from({ length: 7 }, (_, i) => {
      const dayStart = new Date(todayStart);
      dayStart.setDate(dayStart.getDate() - (6 - i));
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const count = weekLogs.filter((l) => l.timestamp >= dayStart && l.timestamp < dayEnd).length;
      return { date: dayStart.toISOString().split("T")[0], count };
    });

    // Get distinct active users count (not capped)
    const uniqueUserCount = await db.auditLog.groupBy({
      by: ["userId"],
      where: { userId: { not: null } },
    }).then((groups) => groups.length);

    const [
      totalCount,
      todayCount,
      weekCount,
      prevWeekCount,
      monthCount,
      topActions,
      topEntities,
      topUsers,
      recentActions,
    ] = await Promise.all([
      // Basic counts
      db.auditLog.count(),
      db.auditLog.count({ where: { timestamp: { gte: todayStart } } }),
      db.auditLog.count({ where: { timestamp: { gte: weekStart } } }),
      db.auditLog.count({ where: { timestamp: { gte: prevWeekStart, lt: weekStart } } }),
      db.auditLog.count({ where: { timestamp: { gte: monthStart } } }),

      // Top actions (grouped)
      db.auditLog.groupBy({
        by: ["action"],
        _count: { action: true },
        orderBy: { _count: { action: "desc" } },
        take: 10,
      }),

      // Top entities (grouped)
      db.auditLog.groupBy({
        by: ["entity"],
        _count: { entity: true },
        orderBy: { _count: { entity: "desc" } },
        take: 10,
      }),

      // Top users (single groupBy — no N+1)
      db.auditLog.groupBy({
        by: ["userId"],
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 10,
      }).then(async (userCounts) => {
        // Fetch user names for top users
        const userIds = userCounts.map((u) => u.userId).filter(Boolean) as string[];
        const users = userIds.length > 0
          ? await db.user.findMany({
              where: { id: { in: userIds } },
              select: { id: true, name: true, email: true },
            })
          : [];
        const userMap = new Map(users.map((u) => [u.id, u]));
        return userCounts.map((u) => ({
          userId: u.userId,
          userName: userMap.get(u.userId || "")?.name || "Unknown",
          count: u._count.id,
        }));
      }),

      // Recent actions (last hour, grouped by action+entity)
      db.auditLog.groupBy({
        by: ["action", "entity"],
        where: {
          timestamp: { gte: new Date(Date.now() - 60 * 60 * 1000) },
        },
        _count: { action: true },
        orderBy: { _count: { action: "desc" } },
        take: 10,
      }),
    ]);

    return NextResponse.json({
      logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      stats: {
        totalCount,
        todayCount,
        weekCount,
        prevWeekCount,
        monthCount,
        uniqueUserCount,
        dailyCounts,
        topActions: topActions.map((a) => ({
          action: a.action,
          count: a._count.action,
        })),
        topEntities: topEntities.map((e) => ({
          entity: e.entity,
          count: e._count.entity,
        })),
        topUsers,
        recentActions: recentActions.map((r) => ({
          action: r.action,
          entity: r.entity,
          count: r._count.action,
          hours: 1,
        })),
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("Audit log GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch audit logs" },
      { status: 500 }
    );
  }
}

// ─── GET /api/audit-log?type=anomalies: Detect Anomalies ──────

export async function GET_anomalies(request: NextRequest) {
  try {
    await requireAuth(request);

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const anomalies: { type: string; description: string; severity: string; count: number; details: unknown[] }[] = [];

    // 1. >5 failed logins in last 24h per user
    const failedLogins = await db.auditLog.groupBy({
      by: ["userId"],
      where: {
        action: "LOGIN_FAILED",
        timestamp: { gte: twentyFourHoursAgo },
      },
      _count: { id: true },
      having: {
        id: { _count: { gt: 5 } },
      },
    });

    if (failedLogins.length > 0) {
      for (const fl of failedLogins) {
        const userLogs = await db.auditLog.findMany({
          where: { userId: fl.userId, action: "LOGIN_FAILED", timestamp: { gte: twentyFourHoursAgo } },
          take: 5,
          include: { User: { select: { name: true, email: true } } },
        });
        anomalies.push({
          type: "brute_force_login",
          description: `${fl._count.id} failed login attempts in the last 24 hours`,
          severity: "high",
          count: fl._count.id,
          details: userLogs.map((l) => ({ ip: l.ipAddress, time: l.timestamp, user: l.User?.name || l.userId })),
        });
      }
    }

    // 2. Bulk delete events (>10 deletes in 1 hour)
    const bulkDeletes = await db.auditLog.groupBy({
      by: ["userId"],
      where: {
        action: { in: ["DELETE", "BULK_DELETE"] },
        timestamp: { gte: oneHourAgo },
      },
      _count: { id: true },
      having: {
        id: { _count: { gt: 10 } },
      },
    });

    if (bulkDeletes.length > 0) {
      for (const bd of bulkDeletes) {
        const userLogs = await db.auditLog.findMany({
          where: { userId: bd.userId, action: { in: ["DELETE", "BULK_DELETE"] }, timestamp: { gte: oneHourAgo } },
          take: 5,
          include: { User: { select: { name: true, email: true } } },
        });
        anomalies.push({
          type: "bulk_delete",
          description: `${bd._count.id} delete operations in the last hour`,
          severity: "medium",
          count: bd._count.id,
          details: userLogs.map((l) => ({ entity: l.entity, entityId: l.entityId, time: l.timestamp, user: l.User?.name || l.userId })),
        });
      }
    }

    // 3. >50 total actions in 1 hour per user (flagged as anomalous)
    const highActivityUsers = await db.auditLog.groupBy({
      by: ["userId"],
      where: {
        timestamp: { gte: oneHourAgo },
      },
      _count: { id: true },
      having: {
        id: { _count: { gt: 50 } },
      },
    });

    const flaggedUserIds: string[] = [];
    if (highActivityUsers.length > 0) {
      for (const hu of highActivityUsers) {
        if (!hu.userId) continue;
        flaggedUserIds.push(hu.userId);
        const userLogs = await db.auditLog.findMany({
          where: { userId: hu.userId, timestamp: { gte: oneHourAgo } },
          take: 5,
          include: { User: { select: { name: true, email: true } } },
        });
        anomalies.push({
          type: "high_activity",
          description: `${hu._count.id} actions in the last hour (threshold: 50)`,
          severity: "warning",
          count: hu._count.id,
          details: userLogs.map((l) => ({ action: l.action, entity: l.entity, time: l.timestamp, user: l.User?.name || l.userId })),
        });
      }
    }

    return NextResponse.json({ anomalies, totalAnomalies: anomalies.length, flaggedUserIds, checkedAt: now.toISOString() });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Anomaly detection error:", error);
    return NextResponse.json({ error: "Failed to detect anomalies" }, { status: 500 });
  }
}

// ─── GET /api/audit-log?type=export-all: Export All Logs ─────

async function GET_export_all(request: NextRequest) {
  try {
    await requireAuth(request);

    const logs = await db.auditLog.findMany({
      orderBy: { timestamp: "desc" },
      take: 10000,
      include: { User: { select: { id: true, name: true, email: true } } },
    });

    // ?type=export-all&format=csv — direct CSV download (Export Manager card).
    // The plain export-all JSON branch stays for the audit-log page's client export.
    const format = new URL(request.url).searchParams.get("format");
    if (format === "csv") {
      const headers = [
        "Timestamp", "User", "Action", "Entity", "Entity ID", "Endpoint", "IP", "Details",
      ];
      const rows = logs.map((l) => [
        l.timestamp.toISOString(),
        l.User?.name || l.userName || "System",
        l.action,
        l.entity,
        l.entityId,
        l.endpoint,
        l.ipAddress,
        (l.details || "").slice(0, 500),
      ]);
      await auditExport(request, "AuditLog", "csv", rows.length);
      return csvResponse(headers, rows, generateExportFilename("audit-log"));
    }

    return NextResponse.json({ logs, total: logs.length });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Export all error:", error);
    return NextResponse.json({ error: "Failed to export logs" }, { status: 500 });
  }
}

// ─── GET /api/audit-log?type=retention-info: Retention Info ───

async function GET_retention_info(request: NextRequest) {
  try {
    await requireAuth(request);

    const settings = await db.ispSettings.findUnique({ where: { id: "default" } });
    const retentionDays = settings?.auditRetentionDays ?? 90;
    const autoDelete = settings?.auditAutoDelete ?? false;
    const totalCount = await db.auditLog.count();
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const oldCount = await db.auditLog.count({ where: { timestamp: { lt: cutoff } } });
    const todayCount = await db.auditLog.count({
      where: { timestamp: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    });
    const [archivedCount, activeCount] = await Promise.all([
      db.auditLog.count({ where: { isArchived: true } }),
      db.auditLog.count({ where: { isArchived: false } }),
    ]);
    // Estimate: ~500 bytes per log entry average
    const estimatedStorageMB = Math.round((totalCount * 500) / (1024 * 1024) * 100) / 100;

    // [NEW-FEATURE] Automation status — job-009 in billing-cron performs the
    // two-stage archival automatically and writes a RETENTION_SWEEP trail row
    // per run. Windows mirror the cron's env-configurable defaults.
    const lastSweep = await db.auditLog.findFirst({
      where: { action: "RETENTION_SWEEP" },
      orderBy: { timestamp: "desc" },
    });
    let lastSweepResult: Record<string, unknown> | null = null;
    if (lastSweep?.details) {
      try { lastSweepResult = JSON.parse(lastSweep.details); } catch { /* ignore */ }
    }

    const envNum = (name: string, fb: number) => {
      const v = parseInt(process.env[name] || "", 10);
      return Number.isFinite(v) && v > 0 ? v : fb;
    };

    return NextResponse.json({
      retentionDays,
      autoDelete,
      totalCount,
      oldCount,
      todayCount,
      archivedCount,
      activeCount,
      estimatedStorageMB,
      cutoffDate: cutoff.toISOString(),
      automation: {
        enabled: true,
        jobId: "job-009",
        jobName: "Retention & Archival Sweep",
        schedule: "30 4 * * *",
        archiveDays: envNum("RETENTION_AUDIT_ARCHIVE_DAYS", 90),
        purgeDays: envNum("RETENTION_AUDIT_PURGE_DAYS", 180),
        sessionDays: envNum("RETENTION_SESSION_DAYS", 30),
        notificationDays: envNum("RETENTION_NOTIFICATION_DAYS", 60),
        lastSweepAt: lastSweep?.timestamp?.toISOString() ?? null,
        lastSweepResult,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Retention info error:", error);
    return NextResponse.json({ error: "Failed to get retention info" }, { status: 500 });
  }
}

// ─── POST: Create Manual Audit Log Entry ───────────────────────

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);

    const body = await request.json();
    const { action, entity, entityId, details } = body;

    if (!action || !entity || !entityId) {
      return NextResponse.json(
        { success: false, error: "action, entity, and entityId are required" },
        { status: 400 }
      );
    }

    await auditLog(request, action, entity, String(entityId), {
      details: details || {},
    });

    return NextResponse.json({
      success: true,
      message: "Audit log entry created",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("Audit log POST error:", error);
    return NextResponse.json(
      { error: "Failed to create audit log entry" },
      { status: 500 }
    );
  }
}

// ─── PATCH: Archive / Restore (retention lifecycle) ────────────
// [NEW-FEATURE] Restore archived rows (undo job-009 archival) or archive
// rows manually. Gated behind settings.update (ADMIN/SUPER_ADMIN) and
// self-auditing: every batch writes an ARCHIVE/RESTORE trail row.

export async function PATCH(request: NextRequest) {
  try {
    const userId = await requirePermission(request, "settings.update");

    const body = await request.json();
    const { action, ids } = body;

    if (action !== "archive" && action !== "restore") {
      return NextResponse.json(
        { success: false, error: 'action must be "archive" or "restore"' },
        { status: 400 }
      );
    }
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { success: false, error: "ids must be a non-empty array of log ids" },
        { status: 400 }
      );
    }
    if (ids.length > 500) {
      return NextResponse.json(
        { success: false, error: "Too many ids (max 500 per batch)" },
        { status: 400 }
      );
    }

    const restore = action === "restore";

    // Guard: only flip rows that are actually in the opposite state, so the
    // returned count reflects real changes and repeated clicks are no-ops.
    // restore → where isArchived=true (archived rows), set isArchived=false;
    // archive → where isArchived=false (active rows), set isArchived=true.
    const result = await db.auditLog.updateMany({
      where: { id: { in: ids }, isArchived: restore },
      data: { isArchived: !restore },
    });

    if (result.count === 0) {
      return NextResponse.json({
        success: true,
        updatedCount: 0,
        message: restore
          ? "No archived rows matched — nothing to restore"
          : "No active rows matched — nothing to archive",
      });
    }

    // Self-auditing trail (direct DB write to avoid circular logging)
    db.auditLog
      .create({
        data: {
          userId,
          action: restore ? "RESTORE" : "ARCHIVE",
          entity: "AuditLog",
          entityId: `${action}_${Date.now()}`,
          details: JSON.stringify({
            updatedCount: result.count,
            requestedCount: ids.length,
            via: restore ? "manual-restore" : "manual-archive",
          }),
          endpoint: request.nextUrl.pathname,
          method: "PATCH",
          ipAddress:
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            "unknown",
          userAgent:
            request.headers.get("user-agent")?.substring(0, 500) || "unknown",
        },
      })
      .catch(() => {});

    return NextResponse.json({
      success: true,
      updatedCount: result.count,
      message: restore
        ? `Restored ${result.count} log ${result.count === 1 ? "entry" : "entries"} from archive`
        : `Archived ${result.count} log ${result.count === 1 ? "entry" : "entries"}`,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("Audit log PATCH error:", error);
    return NextResponse.json(
      { error: "Failed to update audit log lifecycle" },
      { status: 500 }
    );
  }
}

// ─── DELETE: Purge Old Audit Logs ──────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const userId = await requireAuth(request);

    const body = await request.json();
    const { beforeDate, entity, ids, action } = body;

    // Bulk delete by IDs
    if (action === "delete-selected" && Array.isArray(ids) && ids.length > 0) {
      const deletedCount = await db.auditLog.deleteMany({
        where: { id: { in: ids } },
      });
      db.auditLog.create({
        data: {
          userId,
          action: "BULK_DELETE",
          entity: "AuditLog",
          entityId: `bulk_${Date.now()}`,
          details: JSON.stringify({ deletedCount }),
          endpoint: request.nextUrl.pathname,
          method: "DELETE",
          ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
          userAgent: request.headers.get("user-agent")?.substring(0, 500) || "unknown",
        },
      }).catch(() => {});
      return NextResponse.json({ success: true, deletedCount });
    }

    if (!beforeDate) {
      return NextResponse.json(
        { success: false, error: "beforeDate is required (ISO date string)" },
        { status: 400 }
      );
    }

    const cutoff = new Date(beforeDate);
    if (isNaN(cutoff.getTime())) {
      return NextResponse.json(
        { success: false, error: "beforeDate must be a valid ISO date string" },
        { status: 400 }
      );
    }

    // Build the purge condition
    const purgeWhere: Record<string, unknown> = {
      timestamp: { lt: cutoff },
    };
    if (entity) {
      purgeWhere.entity = entity;
    }

    // Safety: log the purge action itself before executing
    // Use direct DB write to avoid circular logging
    const [deletedCount] = await Promise.all([
      // Execute the purge
      db.auditLog.deleteMany({ where: purgeWhere }),

      // Log the purge action
      db.auditLog.create({
        data: {
          userId,
          action: "PURGE",
          entity: "AuditLog",
          entityId: `purge_${Date.now()}`,
          details: JSON.stringify({
            beforeDate: cutoff.toISOString(),
            entity: entity || "ALL",
            deletedCount: "pending", // will be updated by the parallel delete
          }),
          endpoint: request.nextUrl.pathname,
          method: "DELETE",
          ipAddress:
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            "unknown",
          userAgent:
            request.headers.get("user-agent")?.substring(0, 500) || "unknown",
        },
      }),
    ]);

    // Update the purge log with actual count
    // Find the most recent PURGE log for this user and update it
    // (fire-and-forget — best effort)
    db.auditLog
      .findFirst({
        where: { userId, action: "PURGE", entity: "AuditLog" },
        orderBy: { timestamp: "desc" },
      })
      .then((log) => {
        if (log) {
          db.auditLog.update({
            where: { id: log.id },
            data: {
              details: JSON.stringify({
                beforeDate: cutoff.toISOString(),
                entity: entity || "ALL",
                deletedCount,
              }),
            },
          }).catch(() => {
            // Silent — don't let meta-logging break anything
          });
        }
      });

    return NextResponse.json({
      success: true,
      deletedCount,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("Audit log DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to purge audit logs" },
      { status: 500 }
    );
  }
}
