/**
 * CRYPTSKINTELLIGENT ISP Platform — FreeRADIUS Single Group Operations
 *
 * Provides detailed view and management for a single RADIUS group by name.
 *
 * GET    /api/aaa/groups/[groupname]  — Full group detail with attrs, users, enrichment
 * PUT    /api/aaa/groups/[groupname]  — Rename a group (accepts { name: 'new-name' })
 * DELETE /api/aaa/groups/[groupname]  — Delete a specific group by name (path param)
 */

import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ─── Serialization helper ────────────────────────────────────────────────────

function serializeRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => {
    const serialized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      serialized[key] = typeof value === "bigint" ? Number(value) : value;
    }
    return serialized;
  });
}

// ─── GET /api/aaa/groups/[groupname] ─────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ groupname: string }> }
) {
  try {
    await requireAuth(req);
    const { groupname } = await params;
    const groupName = decodeURIComponent(groupname);

    // ── Fetch group check attributes ──
    const checks = await db.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT id, groupname, attribute, op, value
       FROM radgroupcheck
       WHERE groupname = $1
       ORDER BY attribute`,
      groupName
    );

    // ── Fetch group reply attributes ──
    const replies = await db.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT id, groupname, attribute, op, value
       FROM radgroupreply
       WHERE groupname = $1
       ORDER BY attribute`,
      groupName
    );

    // If neither exists in RADIUS tables, check RadiusGroup Prisma model
    const enrichment = await db.radiusGroup.findUnique({
      where: { name: groupName },
      select: {
        id: true, name: true, description: true, priority: true,
        speedLimitDown: true, speedLimitUp: true, dataLimit: true,
        sessionTimeout: true, framedIpv6Pool: true, delegatedIpv6PrefixPool: true,
        Plan: {
          select: { id: true, name: true, downloadSpeed: true, uploadSpeed: true, priceMonthly: true, status: true },
        },
        Subscriber: {
          select: { id: true, name: true, code: true, status: true },
          take: 100,
          orderBy: { name: "asc" },
        },
      },
    });

    if (checks.length === 0 && replies.length === 0 && !enrichment) {
      return NextResponse.json({ success: false, error: `Group '${groupName}' not found` }, { status: 404 });
    }

    // ── Fetch users assigned to this group via radusergroup ──
    const assignedUsers = await db.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT
         ug.username,
         ug.priority AS group_priority,
         ug.groupname AS user_group,
         s.id AS "subscriberId",
         s.name AS "subscriberName",
         s.code AS "subscriberCode",
         s.status AS "subscriberStatus",
         s."planId",
         p.name AS "planName"
       FROM radusergroup ug
       LEFT JOIN "Subscriber" s ON s."serviceUsername" = ug.username
       LEFT JOIN "Plan" p ON p.id = s."planId"
       WHERE ug.groupname = $1
       ORDER BY ug.username`,
      groupName
    );

    // ── Count active sessions for users in this group ──
    const activeSessions = await db.$queryRawUnsafe<{ count: string }[]>(
      `SELECT CAST(COUNT(*) AS text) AS count
       FROM radacct a
       INNER JOIN radusergroup ug ON ug.username = a.username
       WHERE ug.groupname = $1 AND a.acctstoptime IS NULL`,
      groupName
    );

    // ── Build structured check attributes map ──
    const checkAttrsMap: Record<string, { id: number; attribute: string; op: string; value: string }> = {};
    for (const row of checks) {
      checkAttrsMap[row.attribute as string] = {
        id: Number(row.id),
        attribute: row.attribute as string,
        op: row.op as string,
        value: row.value as string,
      };
    }

    // ── Build structured reply attributes map ──
    const replyAttrsMap: Record<string, { id: number; attribute: string; op: string; value: string }> = {};
    for (const row of replies) {
      replyAttrsMap[row.attribute as string] = {
        id: Number(row.id),
        attribute: row.attribute as string,
        op: row.op as string,
        value: row.value as string,
      };
    }

    // ── Session/accounting stats for this group ──
    const sessionStats = await db.$queryRawUnsafe<Record<string, unknown>[]>(`
      SELECT
        CAST(COUNT(*) AS int) AS total_sessions,
        CAST(COUNT(CASE WHEN acctstoptime IS NULL THEN 1 END) AS int) AS active_sessions,
        CAST(COALESCE(SUM(acctinputoctets), 0) AS bigint) AS total_download_bytes,
        CAST(COALESCE(SUM(acctoutputoctets), 0) AS bigint) AS total_upload_bytes,
        CAST(COALESCE(SUM(acctsessiontime), 0) AS bigint) AS total_session_seconds
      FROM radacct a
      INNER JOIN radusergroup ug ON ug.username = a.username
      WHERE ug.groupname = $1
    `, groupName);

    const stats = sessionStats[0] || {};
    const totalDownloadBytes = Number(stats.total_download_bytes || 0);
    const totalUploadBytes = Number(stats.total_upload_bytes || 0);

    return NextResponse.json({
      success: true,
      RadiusGroup: {
        groupname: groupName,
        checkAttrs: serializeRows(checks),
        replyAttrs: serializeRows(replies),
        checkAttrsMap,
        replyAttrsMap,
        checkCount: checks.length,
        replyCount: replies.length,
        userCount: assignedUsers.length,
        assignedUsers: serializeRows(assignedUsers),
        enrichment,
        // Session stats
        sessionStats: {
          totalSessions: Number(stats.total_sessions || 0),
          activeSessions: Number(stats.active_sessions || 0),
          totalDownloadGB: Number((totalDownloadBytes / 1073741824).toFixed(2)),
          totalUploadGB: Number((totalUploadBytes / 1073741824).toFixed(2)),
          totalDataGB: Number(((totalDownloadBytes + totalUploadBytes) / 1073741824).toFixed(2)),
          totalSessionSeconds: Number(stats.total_session_seconds || 0),
          totalSessionHours: Number(((Number(stats.total_session_seconds || 0)) / 3600).toFixed(1)),
        },
      },
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error("[aaa/groups/[groupname]] GET error:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── PUT /api/aaa/groups/[groupname] ───────────────────────────────────────────
// Rename a group (accepts { name: 'new-name' } or { newGroupname: 'new-name' })

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ groupname: string }> }
) {
  try {
    await requireAuth(req);
    const { groupname } = await params;
    const groupName = decodeURIComponent(groupname);

    const body = await req.json();
  const newName = (body.name as string)?.trim() || (body.newGroupname as string)?.trim();

    if (!newName) {
      return NextResponse.json({ success: false, error: "name or newGroupname is required" }, { status: 400 });
    }

    if (newName.length > 64) {
      return NextResponse.json({ success: false, error: "new name must not exceed 64 characters" }, { status: 400 });
    }

    // Verify group exists in FreeRADIUS tables
    const exists = await db.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT EXISTS(
        SELECT 1 FROM radgroupcheck WHERE groupname = $1
        UNION
        SELECT 1 FROM radgroupreply WHERE groupname = $1
      ) AS exists`,
      groupName
    );

    if (!exists[0]?.exists) {
      return NextResponse.json({ success: false, error: `Group '${groupName}' not found` }, { status: 404 });
    }

    // Check if new name already exists in RADIUS tables
    const newNameExists = await db.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT EXISTS(
        SELECT 1 FROM radgroupcheck WHERE groupname = $1
        UNION
        SELECT 1 FROM radgroupreply WHERE groupname = $1
      ) AS exists`,
      newName
    );
    if (newNameExists[0]?.exists) {
      return NextResponse.json({ success: false, error: `Group '${newName}' already exists` }, { status: 409 });
    }

    // Check RadiusGroup Prisma model
    const rgExists = await db.radiusGroup.findUnique({ where: { name: newName } });
    if (rgExists) {
      return NextResponse.json({ success: false, error: `Group '${newName}' already exists in RadiusGroup model` }, { status: 409 });
    }

    // Rename in radgroupcheck
    await db.$queryRawUnsafe(`UPDATE radgroupcheck SET groupname = $1 WHERE groupname = $2`, newName, groupName);

    // Rename in radgroupreply
    await db.$queryRawUnsafe(`UPDATE radgroupreply SET groupname = $1 WHERE groupname = $2`, newName, groupName);

    // Rename in radusergroup
    await db.$queryRawUnsafe(`UPDATE radusergroup SET groupname = $1 WHERE groupname = $2`, newName, groupName);

    // Rename in RadiusGroup Prisma model
    const existingRG = await db.radiusGroup.findUnique({ where: { name: groupName } });
    if (existingRG) {
      await db.radiusGroup.update({ where: { name: groupName }, data: { name: newName } });
    }

    return NextResponse.json({
      success: true,
      action: "rename",
      oldGroupname: groupName,
      newGroupname: newName,
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error("[aaa/groups/[groupname]] PUT error:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ─── DELETE /api/aaa/groups/[groupname] ──────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ groupname: string }> }
) {
  try {
    try {
      await requireAuth(req);
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
      throw e;
    }
    const { groupname } = await params;
    const groupName = decodeURIComponent(groupname);

    // Verify group exists
    const exists = await db.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT EXISTS(
        SELECT 1 FROM radgroupcheck WHERE groupname = $1
        UNION
        SELECT 1 FROM radgroupreply WHERE groupname = $1
      ) AS exists`,
      groupName
    );

    if (!exists[0]?.exists) {
      return NextResponse.json({ success: false, error: `Group '${groupName}' not found` }, { status: 404 });
    }

    // Pre-delete counts
    const [checkCountResult, replyCountResult, userCountResult] = await Promise.all([
      db.$queryRawUnsafe<{ count: string }[]>(
        `SELECT CAST(COUNT(*) AS text) AS count FROM radgroupcheck WHERE groupname = $1`,
        groupName
      ),
      db.$queryRawUnsafe<{ count: string }[]>(
        `SELECT CAST(COUNT(*) AS text) AS count FROM radgroupreply WHERE groupname = $1`,
        groupName
      ),
      db.$queryRawUnsafe<{ count: string }[]>(
        `SELECT CAST(COUNT(*) AS text) AS count FROM radusergroup WHERE groupname = $1`,
        groupName
      ),
    ]);

    const deletedChecks = Number(checkCountResult[0]?.count || 0);
    const deletedReplies = Number(replyCountResult[0]?.count || 0);
    const unassignedUsers = Number(userCountResult[0]?.count || 0);

    // Execute deletions
    await db.$queryRawUnsafe(`DELETE FROM radgroupcheck WHERE groupname = $1`, groupName);
    await db.$queryRawUnsafe(`DELETE FROM radgroupreply WHERE groupname = $1`, groupName);
    await db.$queryRawUnsafe(`DELETE FROM radusergroup WHERE groupname = $1`, groupName);

    // Remove RadiusGroup Prisma model if exists
    try {
      await db.radiusGroup.deleteMany({ where: { name: groupName } });
    } catch {
      // RadiusGroup might not exist — that's fine
    }

    return NextResponse.json({
      success: true,
      deleted: {
        groupname: groupName,
        deletedChecks,
        deletedReplies,
        unassignedUsers,
      },
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    console.error("[aaa/groups/[groupname]] DELETE error:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
