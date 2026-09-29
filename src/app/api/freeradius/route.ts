import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/freeradius?tab=overview|users|groups|sessions|accounting|authlog|nas|plan-mapping|subscriber-dashboard
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const tab = searchParams.get("tab") || "overview";

    switch (tab) {
      case "overview":
        return handleOverview();
      case "users":
        return handleUsers();
      case "groups":
        return handleGroups();
      case "sessions":
        return handleSessions(searchParams);
      case "accounting":
        return handleAccounting(searchParams);
      case "authlog":
        return handleAuthLog(searchParams);
      case "nas":
        return handleNas();
      case "plan-mapping":
        return handlePlanMapping();
      case "subscriber-dashboard":
        return handleSubscriberDashboard(searchParams);
      default:
        return NextResponse.json(
          { error: `Unknown tab: ${tab}. Valid tabs: overview, users, groups, sessions, accounting, authlog, nas, plan-mapping, subscriber-dashboard` },
          { status: 400 }
        );
    }
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[freeradius] GET error:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── tab=overview ────────────────────────────────────────────────────────────
// Uses both raw FreeRADIUS tables and views for comprehensive stats

async function handleOverview() {
  const results = await db.$queryRawUnsafe<Record<string, unknown>[]>(`
    SELECT
      -- Core RADIUS counts
      (SELECT CAST(count(*) AS int) FROM radcheck WHERE attribute = 'Cleartext-Password') as total_users,
      (SELECT CAST(count(DISTINCT groupname) AS int) FROM radusergroup) as total_groups,
      (SELECT CAST(count(*) AS int) FROM radacct WHERE acctstoptime IS NULL) as active_sessions,
      (SELECT CAST(count(*) AS int) FROM radacct) as total_sessions,
      (SELECT CAST(count(*) AS int) FROM radpostauth WHERE reply = 'Access-Accept') as total_auth_success,
      (SELECT CAST(count(*) AS int) FROM radpostauth WHERE reply = 'Access-Reject') as total_auth_failed,
      (SELECT CAST(count(*) AS int) FROM nas) as total_nas,
      -- Data transfer
      (SELECT CAST(COALESCE(SUM(acctinputoctets), 0) AS bigint) FROM radacct) as total_data_downloaded,
      (SELECT CAST(COALESCE(SUM(acctoutputoctets), 0) AS bigint) FROM radacct) as total_data_uploaded,
      -- ISP Platform linkage
      (SELECT CAST(count(*) AS int) FROM "Subscriber" WHERE "radiusEnabled" = true) as radius_enabled_subscribers,
      (SELECT CAST(count(*) AS int) FROM "Subscriber") as total_subscribers,
      (SELECT CAST(count(*) AS int) FROM "Plan") as total_plans,
      -- From views
      (SELECT CAST(count(*) AS int) FROM vw_radius_user_full WHERE active_session_id IS NOT NULL) as users_with_active_sessions,
      (SELECT CAST(COALESCE(SUM(total_users), 0) AS int) FROM vw_radius_group_summary) as group_user_total,
      (SELECT CAST(COALESCE(SUM(active_users), 0) AS int) FROM vw_radius_group_summary) as group_active_total
  `);

  const row = results[0] || {};
  const totalDataDownloaded = Number(row.total_data_downloaded || 0);
  const totalDataUploaded = Number(row.total_data_uploaded || 0);

  return NextResponse.json({
    overview: {
      totalUsers: Number(row.total_users || 0),
      totalGroups: Number(row.total_groups || 0),
      activeSessions: Number(row.active_sessions || 0),
      totalSessions: Number(row.total_sessions || 0),
      totalAuthSuccess: Number(row.total_auth_success || 0),
      totalAuthFailed: Number(row.total_auth_failed || 0),
      totalNas: Number(row.total_nas || 0),
      totalDataDownloaded,
      totalDataUploaded,
      totalDataGB: Number(((totalDataDownloaded + totalDataUploaded) / 1073741824).toFixed(2)),
      radiusEnabledSubscribers: Number(row.radius_enabled_subscribers || 0),
      totalSubscribers: Number(row.total_subscribers || 0),
      totalPlans: Number(row.total_plans || 0),
      usersWithActiveSessions: Number(row.users_with_active_sessions || 0),
      syncRate: Number(row.total_subscribers || 0) > 0
        ? Number(((Number(row.radius_enabled_subscribers || 0) / Number(row.total_subscribers || 0)) * 100).toFixed(1))
        : 0,
    },
  });
}

// ─── tab=users ───────────────────────────────────────────────────────────────
// Uses vw_radius_user_full for full subscriber+plan+group+session info

async function handleUsers() {
  const users = await db.$queryRawUnsafe<any[]>(`
    SELECT
      username,
      password,
      subscriber_status,
      connection_type,
      radius_enabled,
      subscriber_ip,
      mac_address,
      plan_name,
      plan_download_kbps,
      plan_upload_kbps,
      plan_price,
      group_name,
      group_download_kbps,
      group_upload_kbps,
      effective_rate_limit,
      max_sessions,
      data_limit_mb,
      active_session_id,
      active_session_ip,
      active_session_nas,
      active_session_rate,
      session_start_time,
      session_duration_seconds,
      last_auth_at,
      last_auth_result
    FROM vw_radius_user_full
    ORDER BY username
  `);

  return NextResponse.json({ users: serializeRows(users) });
}

// ─── tab=groups ──────────────────────────────────────────────────────────────
// Uses vw_radius_group_summary with user counts and attributes

async function handleGroups() {
  const groups = await db.$queryRawUnsafe<any[]>(`
    SELECT
      group_id,
      group_name,
      description,
      download_kbps,
      upload_kbps,
      data_limit,
      session_timeout,
      priority,
      total_users,
      active_users,
      data_cap_mb,
      rate_limit,
      idle_timeout,
      reply_count
    FROM vw_radius_group_summary
    ORDER BY priority, group_name
  `);

  return NextResponse.json({ groups: serializeRows(groups) });
}

// ─── tab=sessions ────────────────────────────────────────────────────────────
// Uses vw_radius_active_sessions with subscriber, plan, and NAS context

async function handleSessions(searchParams: URLSearchParams) {
  const activeOnly = searchParams.get("active") !== "false";
  const limit = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") || "100")));
  const search = searchParams.get("search")?.trim();

  let whereClause = activeOnly ? "WHERE is_active = true" : "";
  const params: string[] = [];

  if (search) {
    params.push(`%${search}%`);
    whereClause += whereClause ? " AND" : " WHERE";
    whereClause += ` (username ILIKE $1 OR nas_ip ILIKE $1 OR nas_name ILIKE $1 OR plan_name ILIKE $1)`;
  }

  const [sessions, countResult] = await Promise.all([
    db.$queryRawUnsafe<any[]>(
      `SELECT
        session_id, username, nas_ip, nas_port, nas_port_type,
        start_time, last_update, stop_time, session_time, auth_type,
        connect_info, input_octets, output_octets,
        called_station_id, calling_station_id, framed_protocol,
        framed_ip, terminate_cause,
        subscriber_id, subscriber_status, connection_type, mac_address,
        plan_name, plan_dl_kbps, plan_ul_kbps,
        nas_name, nas_type,
        is_active, total_octets, download_gb, upload_gb
      FROM vw_radius_active_sessions
      ${whereClause}
      ORDER BY
        CASE WHEN is_active THEN 0 ELSE 1 END,
        start_time DESC
      LIMIT ${limit}`,
      ...params
    ),
    db.$queryRawUnsafe<{ count: string }[]>(
      `SELECT CAST(count(*) AS text) as count FROM vw_radius_active_sessions ${whereClause}`,
      ...params
    ),
  ]);

  const activeResult = await db.$queryRawUnsafe<{ count: string }[]>(
    `SELECT CAST(count(*) AS text) as count FROM vw_radius_active_sessions WHERE is_active = true`
  );

  return NextResponse.json({
    sessions: serializeRows(sessions),
    active: Number(activeResult[0]?.count || 0),
    total: Number(countResult[0]?.count || 0),
  });
}

// ─── tab=accounting ──────────────────────────────────────────────────────────
// Uses vw_radius_accounting_detail with full context

async function handleAccounting(searchParams: URLSearchParams) {
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "20")));
  const offset = (page - 1) * limit;
  const search = searchParams.get("search")?.trim();
  const activeOnly = searchParams.get("active") === "true";

  let whereClause = "";
  const params: string[] = [];

  if (activeOnly) {
    whereClause = "WHERE is_active = true";
  }
  if (search) {
    params.push(`%${search}%`);
    whereClause += whereClause ? " AND" : " WHERE";
    whereClause += ` (username ILIKE $1 OR nas_ip ILIKE $1 OR nas_name ILIKE $1 OR plan_name ILIKE $1 OR device_name ILIKE $1)`;
  }

  const [rows, totalResult] = await Promise.all([
    db.$queryRawUnsafe<any[]>(
      `SELECT
        unique_id, session_id, username, nas_ip, nas_port, nas_port_type,
        start_time, update_time, stop_time, session_time_seconds, auth_type,
        connect_info, input_octets, output_octets,
        called_station_id, calling_station_id, framed_protocol, framed_ip,
        framed_ipv6, framed_ipv6_prefix, delegated_ipv6_prefix,
        terminate_cause, service_type,
        subscriber_id, subscriber_status, connection_type,
        plan_name, radius_group,
        nas_name, device_name,
        is_active, download_mb, upload_mb, total_mb
      FROM vw_radius_accounting_detail
      ${whereClause}
      ORDER BY start_time DESC
      LIMIT ${limit} OFFSET ${offset}`,
      ...params
    ),
    db.$queryRawUnsafe<{ count: string }[]>(
      `SELECT CAST(count(*) AS text) as count FROM vw_radius_accounting_detail ${whereClause}`,
      ...params
    ),
  ]);

  const total = Number(totalResult[0]?.count || 0);
  const totalPages = Math.ceil(total / limit);

  return NextResponse.json({
    accounting: serializeRows(rows),
    pagination: { page, limit, total, totalPages },
  });
}

// ─── tab=authlog ─────────────────────────────────────────────────────────────
// Uses vw_radius_auth_logs with subscriber and group context

async function handleAuthLog(searchParams: URLSearchParams) {
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "100")));
  const offset = (page - 1) * limit;
  const search = searchParams.get("search")?.trim();
  const result = searchParams.get("result")?.trim();

  let whereClause = "";
  const params: string[] = [];

  if (search) {
    params.push(`%${search}%`);
    whereClause += "WHERE username ILIKE $1";
  }
  if (result) {
    whereClause += whereClause ? " AND" : " WHERE";
    whereClause += ` auth_result = '${result === "accept" ? "Access-Accept" : result === "reject" ? "Access-Reject" : result}'`;
  }

  const [logs, totalResult] = await Promise.all([
    db.$queryRawUnsafe<any[]>(
      `SELECT
        id, username, password_used, auth_result, auth_date,
        called_station_id, calling_station_id,
        subscriber_id, subscriber_status, connection_type,
        plan_name, radius_group
      FROM vw_radius_auth_logs
      ${whereClause}
      ORDER BY auth_date DESC
      LIMIT ${limit} OFFSET ${offset}`,
      ...params
    ),
    db.$queryRawUnsafe<{ count: string }[]>(
      `SELECT CAST(count(*) AS text) as count FROM vw_radius_auth_logs ${whereClause}`,
      ...params
    ),
  ]);

  const total = Number(totalResult[0]?.count || 0);
  const totalPages = Math.ceil(total / limit);

  return NextResponse.json({ authLogs: serializeRows(logs), total, pagination: { page, limit, total, totalPages } });
}

// ─── tab=nas ─────────────────────────────────────────────────────────────────
// Uses vw_radius_nas_status with device info and session counts

async function handleNas() {
  const nasList = await db.$queryRawUnsafe<any[]>(`
    SELECT
      nas_id, nas_ip, short_name, nas_type, max_ports,
      nas_secret, nas_description, server,
      device_id, device_name, vendor, model, device_status,
      active_sessions, total_sessions,
      nas_identifier, config_type, coa_enabled
    FROM vw_radius_nas_status
    ORDER BY nas_ip
  `);

  return NextResponse.json({ nas: serializeRows(nasList) });
}

// ─── tab=plan-mapping ───────────────────────────────────────────────────────
// Uses vw_radius_plan_group_mapping

async function handlePlanMapping() {
  const mappings = await db.$queryRawUnsafe<any[]>(`
    SELECT
      plan_id, plan_name, download_kbps, upload_kbps,
      monthly_price, plan_status, contention_ratio,
      data_limit_gb, max_sessions,
      group_id, group_name, group_dl_kbps, group_ul_kbps, group_data_limit_mb,
      total_subscribers, active_subscribers, radius_synced
    FROM vw_radius_plan_group_mapping
    ORDER BY download_kbps
  `);

  return NextResponse.json({ plans: serializeRows(mappings) });
}

// ─── tab=subscriber-dashboard ───────────────────────────────────────────────
// Uses vw_radius_subscriber_dashboard for per-subscriber RADIUS stats

async function handleSubscriberDashboard(searchParams: URLSearchParams) {
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "40")));
  const offset = (page - 1) * limit;
  const search = searchParams.get("search")?.trim();
  const status = searchParams.get("status")?.trim();
  const synced = searchParams.get("synced")?.trim();

  let whereClause = "";
  const params: string[] = [];

  if (search) {
    params.push(`%${search}%`);
    whereClause = "WHERE username ILIKE $1";
  }
  if (status) {
    whereClause += whereClause ? " AND" : " WHERE";
    whereClause += ` status = '${status}'`;
  }
  if (synced === "true") {
    whereClause += whereClause ? " AND" : " WHERE";
    whereClause += " radius_enabled = true";
  } else if (synced === "false") {
    whereClause += whereClause ? " AND" : " WHERE";
    whereClause += " radius_enabled = false";
  }

  const [rows, totalResult] = await Promise.all([
    db.$queryRawUnsafe<any[]>(
      `SELECT
        subscriber_id, username, status, connection_type, radius_enabled,
        plan_name, radius_group, rate_limit,
        active_sessions, total_sessions,
        total_input_octets, total_output_octets, total_session_time,
        total_auth_attempts, successful_auths, failed_auths,
        last_auth_date, last_auth_result
      FROM vw_radius_subscriber_dashboard
      ${whereClause}
      ORDER BY username
      LIMIT ${limit} OFFSET ${offset}`,
      ...params
    ),
    db.$queryRawUnsafe<{ count: string }[]>(
      `SELECT CAST(count(*) AS text) as count FROM vw_radius_subscriber_dashboard ${whereClause}`,
      ...params
    ),
  ]);

  const total = Number(totalResult[0]?.count || 0);
  const totalPages = Math.ceil(total / limit);

  return NextResponse.json({
    subscribers: serializeRows(rows),
    pagination: { page, limit, total, totalPages },
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function serializeRows(rows: any[]): any[] {
  return rows.map((row) => {
    const serialized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      serialized[key] = typeof value === "bigint" ? Number(value) : value;
    }
    return serialized;
  });
}
