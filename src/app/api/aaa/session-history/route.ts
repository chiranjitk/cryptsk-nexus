import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const sp = req.nextUrl.searchParams;
    const search = sp.get("search") || "";
    const dateFrom = sp.get("dateFrom") || "";
    const dateTo = sp.get("dateTo") || "";
    const nasIp = sp.get("nasIp") || "";
    const terminateCause = sp.get("terminateCause") || "";
    const page = Math.max(1, parseInt(sp.get("page") || "1"));
    const limit = Math.min(100, Math.max(10, parseInt(sp.get("limit") || "50")));
    const offset = (page - 1) * limit;

    const conditions: string[] = ["a.acctstoptime IS NOT NULL"];
    const params: any[] = [];

    if (search) {
      conditions.push(`a.username ILIKE $${params.length + 1}`);
      params.push(`%${search}%`);
    }
    if (dateFrom) {
      conditions.push(`a.acctstarttime >= $${params.length + 1}`);
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push(`a.acctstarttime <= $${params.length + 1}`);
      params.push(dateTo + " 23:59:59");
    }
    if (nasIp) {
      conditions.push(`CAST(a.nasipaddress AS text) ILIKE $${params.length + 1}`);
      params.push(`%${nasIp}%`);
    }
    if (terminateCause) {
      conditions.push(`a.acctterminatecause ILIKE $${params.length + 1}`);
      params.push(`%${terminateCause}%`);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    // Count
    const countResult = await db.$queryRawUnsafe(
      `SELECT CAST(COUNT(*) AS int) as total FROM radacct a ${where}`,
      ...params
    ) as any[];
    const total = countResult[0]?.total || 0;

    // Rows
    const rows = await db.$queryRawUnsafe(
      `SELECT 
        a.acctsessionid as "sessionId",
        a.username,
        a.acctstarttime as "startTime",
        a.acctstoptime as "stopTime",
        a.acctsessiontime as "sessionTime",
        a.acctinputoctets as "inputOctets",
        a.acctoutputoctets as "outputOctets",
        CAST(a.nasipaddress AS text) as "nasIp",
        a.acctterminatecause as "terminateCause",
        CAST(a.framedipaddress AS text) as "framedIp",
        a.callingstationid as "callingStationId",
        a."group_name" as "groupName",
        a.nas_type as "nasType"
       FROM radacct a ${where}
       ORDER BY a.acctstoptime DESC NULLS LAST
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      ...params, limit, offset
    ) as any[];

    // Stats
    const statsResult = await db.$queryRawUnsafe(`
      SELECT 
        CAST(COUNT(*) AS int) as total_sessions,
        CAST(COUNT(DISTINCT username) AS int) as unique_users,
        CAST(COALESCE(AVG(acctsessiontime), 0) AS int) as avg_duration,
        CAST(COALESCE(SUM(acctinputoctets + acctoutputoctets), 0) AS bigint) as total_data
      FROM radacct
      WHERE acctstoptime IS NOT NULL
    `) as any[];
    const stats = statsResult[0] || { total_sessions: 0, unique_users: 0, avg_duration: 0, total_data: 0 };

    return NextResponse.json({
      data: rows,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      stats: {
        totalSessions: stats.total_sessions,
        uniqueUsers: stats.unique_users,
        avgDuration: stats.avg_duration,
        totalData: Number(stats.total_data),
      },
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[session-history] Error:", error);
    const msg = error instanceof Error ? error.message : "Failed to fetch session history";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
