/**
 * Audit Log Statistics API — /api/audit-log/stats
 *
 * GET — Returns comprehensive audit statistics:
 *   - Activity timeline (last 7 days, hourly buckets)
 *   - Action distribution (pie data)
 *   - Entity distribution
 *   - User activity ranking
 *   - Recent significant events (logins, deletes, config changes)
 */

import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // ── Run all independent queries in parallel ──
    const [
      totalCount,
      todayCount,
      weekCount,
      monthCount,
      actionDistribution,
      entityDistribution,
      topUsersRaw,
      hourlyTimeline,
      recentSignificant,
    ] = await Promise.all([
      // ── Basic counts ──
      db.auditLog.count(),
      db.auditLog.count({ where: { timestamp: { gte: todayStart } } }),
      db.auditLog.count({ where: { timestamp: { gte: weekStart } } }),
      db.auditLog.count({ where: { timestamp: { gte: monthStart } } }),

      // ── Action distribution (all time, top 20) ──
      db.auditLog.groupBy({
        by: ["action"],
        _count: { action: true },
        orderBy: { _count: { action: "desc" } },
        take: 20,
      }),

      // ── Entity distribution (all time, top 20) ──
      db.auditLog.groupBy({
        by: ["entity"],
        _count: { entity: true },
        orderBy: { _count: { entity: "desc" } },
        take: 20,
      }),

      // ── Top users by action count (SQLite-compatible) ──
      db.$queryRaw<Array<{ userId: string; userName: string; email: string | null; count: number }>>`
        SELECT
          al."userId",
          COALESCE(al."userName", u."name", 'Unknown') as "userName",
          u."email",
          CAST(COUNT(*) AS int) as count
        FROM "AuditLog" al
        LEFT JOIN "User" u ON al."userId" = u."id"
        WHERE al."userId" IS NOT NULL
        GROUP BY al."userId", al."userName", u."name", u."email"
        ORDER BY count DESC
        LIMIT 15
      `,

      // ── Hourly timeline for last 7 days ──
      buildHourlyTimeline(weekStart, now),

      // ── Recent significant events ──
      db.auditLog.findMany({
        where: {
          action: {
            in: [
              "LOGIN",
              "LOGIN_FAILED",
              "DELETE",
              "BULK_DELETE",
              "CONFIG_CHANGE",
              "API_KEY_ROTATE",
              "PURGE",
              "RESTORE",
              "PASSWORD_CHANGE",
            ],
          },
        },
        orderBy: { timestamp: "desc" },
        take: 50,
        include: {
          User: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
    ]);

    // ── Build day-level timeline for last 7 days ──
    const dailyTimeline = await buildDailyTimeline(weekStart, now);

    // ── Per-hour distribution for today ──
    const hourlyToday = await buildHourlyToday(todayStart, now);

    return NextResponse.json({
      overview: {
        totalCount,
        todayCount,
        weekCount,
        monthCount,
      },
      actionDistribution: actionDistribution.map((a) => ({
        action: a.action,
        count: a._count.action,
      })),
      entityDistribution: entityDistribution.map((e) => ({
        entity: e.entity,
        count: e._count.entity,
      })),
      topUsers: topUsersRaw.map((u) => ({
        userId: u.userId,
        userName: u.userName,
        email: u.email,
        count: Number(u.count),
      })),
      timeline: {
        hourly7d: hourlyTimeline,
        daily7d: dailyTimeline,
        hourlyToday,
      },
      recentSignificantEvents: recentSignificant.map((log) => ({
        id: log.id,
        action: log.action,
        entity: log.entity,
        entityId: log.entityId,
        details: safeJsonParse(log.details),
        ipAddress: log.ipAddress,
        timestamp: log.timestamp.toISOString(),
        userName: (log as Record<string, unknown>).userName as string || log.User?.name || "System",
        user: log.User
          ? { id: log.User.id, name: log.User.name, email: log.User.email }
          : null,
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("Audit stats GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch audit statistics" },
      { status: 500 }
    );
  }
}

// ─── Timeline Builders ─────────────────────────────────────────

/**
 * Hourly buckets for the last 7 days (168 hours).
 * Each bucket: { hour: ISO string, count: number }.
 */
async function buildHourlyTimeline(
  start: Date,
  end: Date
): Promise<Array<{ hour: string; count: number }>> {
  // Fetch raw timestamp data for the range
  const logs = await db.auditLog.findMany({
    where: { timestamp: { gte: start, lte: end } },
    select: { timestamp: true },
  });

  // Bucket into hourly slots
  const buckets = new Map<string, number>();
  const current = new Date(start);
  current.setMinutes(0, 0, 0);

  // Pre-fill all hours
  while (current < end) {
    const key = current.toISOString();
    buckets.set(key, 0);
    current.setHours(current.getHours() + 1);
  }

  // Count into buckets
  for (const log of logs) {
    const hourStart = new Date(log.timestamp);
    hourStart.setMinutes(0, 0, 0);
    const key = hourStart.toISOString();
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }

  return Array.from(buckets.entries()).map(([hour, count]) => ({
    hour,
    count,
  }));
}

/**
 * Day-level aggregation for last 7 days.
 */
async function buildDailyTimeline(
  start: Date,
  end: Date
): Promise<Array<{ date: string; count: number }>> {
  // PostgreSQL-compatible daily aggregation
  const result = await db.$queryRaw<Array<{ day: string; count: number }>>`
    SELECT
      CAST("timestamp" AS date) as day,
      CAST(COUNT(*) AS int) as count
    FROM "AuditLog"
    WHERE "timestamp" >= ${start} AND "timestamp" <= ${end}
    GROUP BY CAST("timestamp" AS date)
    ORDER BY day ASC
  `;

  return result.map((r) => ({
    date: r.day,
    count: Number(r.count),
  }));
}

/**
 * Per-hour distribution for today (0-23).
 */
async function buildHourlyToday(
  todayStart: Date,
  now: Date
): Promise<Array<{ hour: number; count: number; label: string }>> {
  const currentHour = now.getHours();

  // PostgreSQL-compatible hourly aggregation
  const result = await db.$queryRaw<Array<{ hour: number; count: number }>>`
    SELECT
      CAST(EXTRACT(HOUR FROM "timestamp") AS int) as hour,
      CAST(COUNT(*) AS int) as count
    FROM "AuditLog"
    WHERE "timestamp" >= ${todayStart}
    GROUP BY EXTRACT(HOUR FROM "timestamp")
    ORDER BY hour ASC
  `;

  const buckets = new Map<number, number>();
  for (const r of result) {
    buckets.set(r.hour, Number(r.count));
  }

  // Fill all hours up to current hour
  const output: Array<{ hour: number; count: number; label: string }> = [];
  for (let h = 0; h <= currentHour; h++) {
    output.push({
      hour: h,
      count: buckets.get(h) || 0,
      label: `${String(h).padStart(2, "0")}:00`,
    });
  }

  return output;
}

// ─── Utility ───────────────────────────────────────────────────

function safeJsonParse(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}
