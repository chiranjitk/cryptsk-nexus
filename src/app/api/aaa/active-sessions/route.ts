/**
 * CRYPTSKINTELLIGENT ISP Platform — Active Sessions Management
 *
 * GET  /api/aaa/active-sessions   — Query live RADIUS sessions from radacct
 * POST /api/aaa/active-sessions   — Perform session actions (disconnect, bulk, update, etc.)
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Format bytes → human-readable (B / KB / MB / GB / TB) */
function formatBytes(bytes: number): string {
  if (typeof bytes !== "number" || isNaN(bytes) || !isFinite(bytes) || bytes < 0)
    return "0 B";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
  const val = bytes / Math.pow(k, i);
  return `${val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)} ${units[i]}`;
}

/** Format seconds → human-readable duration (Xd Xh Xm / Xh Xm / Xm) */
function formatDuration(seconds: number): string {
  if (typeof seconds !== "number" || isNaN(seconds) || !isFinite(seconds) || seconds < 0)
    return "0m";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || parts.length === 0) parts.push(`${m}m`);
  return parts.join(" ");
}

// ── GET Handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const sp = req.nextUrl.searchParams;
    const search = sp.get("search")?.trim() || "";
    const nas = sp.get("nas")?.trim() || "";
    const group = sp.get("group")?.trim() || "";
    const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
    const limit = Math.min(200, Math.max(10, parseInt(sp.get("limit") || "50", 10)));
    const offset = (page - 1) * limit;

    // ── Build dynamic WHERE clause ──
    const conditions: string[] = ["a.acctstoptime IS NULL"];
    const params: any[] = [];

    if (search) {
      conditions.push(
        `(a.username ILIKE $${params.length + 1} ` +
        `OR CAST(a.framedipaddress AS text) ILIKE $${params.length + 1} ` +
        `OR a.callingstationid ILIKE $${params.length + 1})`
      );
      params.push(`%${search}%`);
    }

    if (nas) {
      conditions.push(`CAST(a.nasipaddress AS text) ILIKE $${params.length + 1}`);
      params.push(`%${nas}%`);
    }

    if (group) {
      conditions.push(
        `EXISTS (SELECT 1 FROM radusergroup ug WHERE ug.username = a.username AND ug.groupname ILIKE $${params.length + 1})`
      );
      params.push(`%${group}%`);
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    // ── Total count ──
    const countResult = (await db.$queryRawUnsafe(
      `SELECT CAST(COUNT(*) AS int) AS total FROM radacct a ${whereClause}`,
      ...params
    )) as any[];
    const total = Number(countResult[0]?.total ?? 0);

    // ── Session rows with enrichment ──
    const sessions = (await db.$queryRawUnsafe(
      `SELECT
        a.acctsessionid,
        a.username,
        a.nasipaddress,
        a.nasportid,
        a.nasporttype,
        a.framedipaddress,
        a.callingstationid,
        a.acctstarttime,
        a.acctupdatetime,
        a.acctsessiontime,
        a.acctinputoctets,
        a.acctoutputoctets,
        a.framedprotocol,
        a.servicetype,
        a.acctauthentic,
        a.connectinfo_start,
        s.name         AS sub_name,
        s.code         AS sub_code,
        s.status       AS sub_status,
        s."connectionType" AS sub_connection_type,
        rg.name        AS group_name,
        rg."speedLimitDown" AS group_speed_down,
        rg."speedLimitUp"   AS group_speed_up,
        nd.name        AS nas_name,
        nd.type        AS nas_type,
        nd.status      AS nas_status
      FROM radacct a
      LEFT JOIN "Subscriber" s ON s."serviceUsername" = a.username
      LEFT JOIN "RadiusGroup" rg ON rg.name = (
        SELECT ug.groupname FROM radusergroup ug
        WHERE ug.username = a.username
        ORDER BY ug.priority ASC
        LIMIT 1
      )
      LEFT JOIN "NetworkDevice" nd ON nd."ipAddress" = CAST(a.nasipaddress AS text)
      ${whereClause}
      ORDER BY a.acctstarttime DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      ...params,
      limit,
      offset
    )) as any[];

    // ── Format each session row ──
    const data = sessions.map((s) => ({
      acctSessionId: s.acctsessionid,
      username: s.username ?? "",
      nasIpAddress: s.nasipaddress ?? "",
      nasPortId: s.nasportid ?? "",
      nasPortType: s.nasporttype ?? "",
      framedIpAddress: s.framedipaddress ?? "",
      callingStationId: s.callingstationid ?? "",
      startTime: s.acctstarttime,
      updateTime: s.acctupdatetime,
      sessionTime: Number(s.acctsessiontime ?? 0),
      sessionTimeFormatted: formatDuration(Number(s.acctsessiontime ?? 0)),
      inputOctets: Number(s.acctinputoctets ?? 0),
      outputOctets: Number(s.acctoutputoctets ?? 0),
      inputOctetsFormatted: formatBytes(Number(s.acctinputoctets ?? 0)),
      outputOctetsFormatted: formatBytes(Number(s.acctoutputoctets ?? 0)),
      totalOctets: Number(s.acctinputoctets ?? 0) + Number(s.acctoutputoctets ?? 0),
      totalOctetsFormatted: formatBytes(
        Number(s.acctinputoctets ?? 0) + Number(s.acctoutputoctets ?? 0)
      ),
      framedProtocol: s.framedprotocol ?? "",
      serviceType: s.servicetype ?? "",
      acctAuthentic: s.acctauthentic ?? "",
      connectInfoStart: s.connectinfo_start ?? "",
      // Enriched subscriber info
      subscriber: s.sub_name
        ? {
            name: s.sub_name,
            code: s.sub_code ?? "",
            status: s.sub_status ?? "",
            connectionType: s.sub_connection_type ?? "",
          }
        : null,
      // Enriched RADIUS group info
      radiusGroup: s.group_name
        ? {
            name: s.group_name,
            speedLimitDown: s.group_speed_down ?? 0,
            speedLimitUp: s.group_speed_up ?? 0,
          }
        : null,
      // Enriched NAS device info
      nasDevice: s.nas_name
        ? {
            name: s.nas_name,
            type: s.nas_type ?? "",
            status: s.nas_status ?? "",
          }
        : null,
    }));

    // ── Aggregate statistics (active sessions only) ──
    const statsResult = (await db.$queryRawUnsafe(`
      SELECT
        CAST(COUNT(*) AS int)                                          AS active_count,
        COALESCE(SUM(acctinputoctets + acctoutputoctets), 0)   AS total_bandwidth,
        CAST(COALESCE(AVG(acctsessiontime), 0) AS int)                 AS avg_session_time,
        CAST(COUNT(DISTINCT nasipaddress) AS int)                      AS nas_count,
        CAST(COUNT(DISTINCT username) AS int)                          AS user_count
      FROM radacct
      WHERE acctstoptime IS NULL
    `)) as any[];

    const statsRaw = statsResult[0] ?? {
      active_count: 0,
      total_bandwidth: 0,
      avg_session_time: 0,
      nas_count: 0,
      user_count: 0,
    };
    const stats = {
      active_count: Number(statsRaw.active_count),
      total_bandwidth: Number(statsRaw.total_bandwidth),
      avg_session_time: Number(statsRaw.avg_session_time),
      nas_count: Number(statsRaw.nas_count),
      user_count: Number(statsRaw.user_count),
    };

    // ── Per-NAS breakdown ──
    const nasBreakdown = (await db.$queryRawUnsafe(`
      SELECT
        a.nasipaddress,
        nd.name AS nas_name,
        CAST(COUNT(*) AS int) AS session_count,
        COALESCE(SUM(a.acctinputoctets + a.acctoutputoctets), 0) AS total_bandwidth
      FROM radacct a
      LEFT JOIN "NetworkDevice" nd ON nd."ipAddress" = CAST(a.nasipaddress AS text)
      WHERE a.acctstoptime IS NULL
      GROUP BY a.nasipaddress, nd.name
      ORDER BY session_count DESC
    `)) as any[];

    // ── Per-group breakdown ──
    const groupBreakdown = (await db.$queryRawUnsafe(`
      SELECT
        ug.groupname,
        CAST(COUNT(DISTINCT a.acctsessionid) AS int) AS session_count,
        CAST(COUNT(DISTINCT a.username) AS int) AS user_count
      FROM radacct a
      JOIN radusergroup ug ON ug.username = a.username
      WHERE a.acctstoptime IS NULL
      GROUP BY ug.groupname
      ORDER BY session_count DESC
    `)) as any[];

    return NextResponse.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      stats: {
        activeCount: stats.active_count,
        totalBandwidth: Number(stats.total_bandwidth),
        totalBandwidthFormatted: formatBytes(Number(stats.total_bandwidth)),
        avgSessionTime: stats.avg_session_time,
        avgSessionTimeFormatted: formatDuration(stats.avg_session_time),
        nasCount: stats.nas_count,
        userCount: stats.user_count,
      },
      breakdown: {
        byNas: nasBreakdown.map((n) => ({
          nasIpAddress: n.nasipaddress,
          nasName: n.nas_name ?? "",
          sessionCount: n.session_count,
          totalBandwidth: Number(n.total_bandwidth),
          totalBandwidthFormatted: formatBytes(Number(n.total_bandwidth)),
        })),
        byGroup: groupBreakdown.map((g) => ({
          groupName: g.groupname,
          sessionCount: g.session_count,
          userCount: g.user_count,
        })),
      },
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("[active-sessions] GET error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch active sessions" },
      { status: 500 }
    );
  }
}

// ── POST Handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);

    const body = await req.json();
    const { action } = body;

    switch (action) {
      // ── Disconnect single session ──
      case "disconnect": {
        const { acctsessionid } = body;
        if (!acctsessionid) {
          return NextResponse.json(
            { success: false, error: "acctsessionid is required" },
            { status: 400 }
          );
        }

        // Find the session first
        const sessions = (await db.$queryRawUnsafe(
          `SELECT acctsessionid, acctstarttime, acctupdatetime
           FROM radacct
           WHERE acctstoptime IS NULL AND acctsessionid = $1`,
          acctsessionid
        )) as any[];

        if (sessions.length === 0) {
          return NextResponse.json(
            { success: false, error: "Active session not found" },
            { status: 404 }
          );
        }

        const session = sessions[0];

        // Set acctstoptime = NOW() and calculate final session time
        const result = (await db.$queryRawUnsafe(
          `UPDATE radacct
           SET acctstoptime = NOW(),
               acctsessiontime = CAST(EXTRACT(EPOCH FROM (NOW() - acctstarttime)) AS bigint),
               acctupdatetime = NOW()
           WHERE acctsessionid = $1 AND acctstoptime IS NULL
           RETURNING acctsessionid, username, nasipaddress`,
          acctsessionid
        )) as any[];

        if (result.length === 0) {
          return NextResponse.json(
            { success: false, error: "Failed to disconnect session — may have already stopped" },
            { status: 409 }
          );
        }

        return NextResponse.json({
          success: true,
          message: "Session disconnected successfully",
          session: {
            acctSessionId: result[0].acctsessionid,
            username: result[0].username,
            nasIpAddress: result[0].nasipaddress,
          },
        });
      }

      // ── Bulk disconnect multiple sessions ──
      case "bulk-disconnect": {
        const { acctsessionids } = body;
        if (!Array.isArray(acctsessionids) || acctsessionids.length === 0) {
          return NextResponse.json(
            { success: false, error: "acctsessionids must be a non-empty array" },
            { status: 400 }
          );
        }

        if (acctsessionids.length > 500) {
          return NextResponse.json(
            { success: false, error: "Cannot disconnect more than 500 sessions at once" },
            { status: 400 }
          );
        }

        // Build parameterized placeholders for the IN clause
        const placeholders = acctsessionids.map((_, i) => `$${i + 1}`).join(", ");

        // Disconnect all matching active sessions
        const result = (await db.$queryRawUnsafe(
          `UPDATE radacct
           SET acctstoptime = NOW(),
               acctsessiontime = CAST(EXTRACT(EPOCH FROM (NOW() - acctstarttime)) AS bigint),
               acctupdatetime = NOW()
           WHERE acctstoptime IS NULL
             AND acctsessionid IN (${placeholders})
           RETURNING acctsessionid, username, nasipaddress`,
          ...acctsessionids
        )) as any[];

        return NextResponse.json({
          success: true,
          message: `${result.length} session(s) disconnected successfully`,
          disconnectedCount: result.length,
          requestedCount: acctsessionids.length,
          sessions: result.map((r) => ({
            acctSessionId: r.acctsessionid,
            username: r.username,
            nasIpAddress: r.nasipaddress,
          })),
        });
      }

      // ── Interim accounting update ──
      case "update-accounting": {
        const { acctsessionid, acctinputoctets, acctoutputoctets } = body;

        if (!acctsessionid) {
          return NextResponse.json(
            { success: false, error: "acctsessionid is required" },
            { status: 400 }
          );
        }

        if (typeof acctinputoctets !== "number" || typeof acctoutputoctets !== "number") {
          return NextResponse.json(
            { success: false, error: "acctinputoctets and acctoutputoctets must be numbers" },
            { status: 400 }
          );
        }

        if (acctinputoctets < 0 || acctoutputoctets < 0) {
          return NextResponse.json(
            { success: false, error: "octets values must be non-negative" },
            { status: 400 }
          );
        }

        const result = (await db.$queryRawUnsafe(
          `UPDATE radacct
           SET acctinputoctets = CAST($2 AS bigint),
               acctoutputoctets = CAST($3 AS bigint),
               acctsessiontime = CAST(EXTRACT(EPOCH FROM (NOW() - acctstarttime)) AS bigint),
               acctupdatetime = NOW()
           WHERE acctsessionid = $1 AND acctstoptime IS NULL
           RETURNING acctsessionid, username, acctinputoctets, acctoutputoctets, acctsessiontime`,
          acctsessionid,
          acctinputoctets,
          acctoutputoctets
        )) as any[];

        if (result.length === 0) {
          return NextResponse.json(
            { success: false, error: "Active session not found for update" },
            { status: 404 }
          );
        }

        const updated = result[0];
        return NextResponse.json({
          success: true,
          message: "Accounting updated successfully",
          session: {
            acctSessionId: updated.acctsessionid,
            username: updated.username,
            inputOctets: Number(updated.acctinputoctets),
            outputOctets: Number(updated.acctoutputoctets),
            inputOctetsFormatted: formatBytes(Number(updated.acctinputoctets)),
            outputOctetsFormatted: formatBytes(Number(updated.acctoutputoctets)),
            sessionTime: Number(updated.acctsessiontime),
            sessionTimeFormatted: formatDuration(Number(updated.acctsessiontime)),
          },
        });
      }

      // ── Disconnect all sessions for a user ──
      case "disconnect-user": {
        const { username } = body;

        if (!username) {
          return NextResponse.json(
            { success: false, error: "username is required" },
            { status: 400 }
          );
        }

        // First count how many active sessions this user has
        const countResult = (await db.$queryRawUnsafe(
          `SELECT CAST(COUNT(*) AS int) AS total
           FROM radacct
           WHERE acctstoptime IS NULL AND username = $1`,
          username
        )) as any[];

        const activeCount = countResult[0]?.total ?? 0;

        if (activeCount === 0) {
          return NextResponse.json({
            success: true,
            message: "No active sessions found for this user",
            disconnectedCount: 0,
          });
        }

        // Disconnect all active sessions for the user
        const result = (await db.$queryRawUnsafe(
          `UPDATE radacct
           SET acctstoptime = NOW(),
               acctsessiontime = CAST(EXTRACT(EPOCH FROM (NOW() - acctstarttime)) AS bigint),
               acctupdatetime = NOW()
           WHERE acctstoptime IS NULL AND username = $1
           RETURNING acctsessionid, nasipaddress, framedipaddress, callingstationid`,
          username
        )) as any[];

        return NextResponse.json({
          success: true,
          message: `Disconnected ${result.length} session(s) for user "${username}"`,
          username,
          disconnectedCount: result.length,
          sessions: result.map((r) => ({
            acctSessionId: r.acctsessionid,
            nasIpAddress: r.nasipaddress,
            framedIpAddress: r.framedipaddress,
            callingStationId: r.callingstationid,
          })),
        });
      }

      default:
        return NextResponse.json(
          {
            success: false,
            error: `Unknown action: "${action}". Valid actions: disconnect, bulk-disconnect, update-accounting, disconnect-user`,
          },
          { status: 400 }
        );
    }
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("[active-sessions] POST error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Session action failed" },
      { status: 500 }
    );
  }
}
