import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const sp = req.nextUrl.searchParams;
    const search = sp.get("search") || "";
    const result = sp.get("result") || "";
    const dateFrom = sp.get("dateFrom") || "";
    const dateTo = sp.get("dateTo") || "";
    const nasIp = sp.get("nasIp") || "";
    const page = Math.max(1, parseInt(sp.get("page") || "1"));
    const limit = Math.min(100, Math.max(10, parseInt(sp.get("limit") || "50")));
    const offset = (page - 1) * limit;

    // Build WHERE clause for radpostauth
    const conditions: string[] = [];
    const params: any[] = [];

    if (search) {
      conditions.push(`username ILIKE $${params.length + 1}`);
      params.push(`%${search}%`);
    }
    if (result) {
      conditions.push(`reply ILIKE $${params.length + 1}`);
      params.push(`%${result}%`);
    }
    if (dateFrom) {
      conditions.push(`authdate >= $${params.length + 1}`);
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push(`authdate <= $${params.length + 1}`);
      params.push(dateTo + " 23:59:59");
    }
    if (nasIp) {
      conditions.push(`CAST(nasipaddress AS text) ILIKE $${params.length + 1}`);
      params.push(`%${nasIp}%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Count
    const countResult = await db.$queryRawUnsafe(
      `SELECT CAST(COUNT(*) AS int) as total FROM radpostauth ${where}`,
      ...params
    ) as any[];
    const total = Number(countResult[0]?.total || 0);

    // Rows
    const rows = await db.$queryRawUnsafe(
      `SELECT id, username, reply, authdate, 
              calledstationid as "calledStationId",
              callingstationid as "callingStationId"
       FROM radpostauth ${where}
       ORDER BY authdate DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      ...params, limit, offset
    ) as any[];

    // Stats for today
    const statsResult = await db.$queryRawUnsafe(`
      SELECT 
        CAST(COUNT(*) AS int) as total_today,
        CAST(COUNT(*) FILTER (WHERE reply = 'Access-Accept') AS int) as accept_count,
        CAST(COUNT(*) FILTER (WHERE reply = 'Access-Reject') AS int) as reject_count
      FROM radpostauth
      WHERE authdate >= CURRENT_DATE
    `) as any[];
    const statsRaw = statsResult[0] || { total_today: 0, accept_count: 0, reject_count: 0 };
    const stats = {
      total_today: Number(statsRaw.total_today),
      accept_count: Number(statsRaw.accept_count),
      reject_count: Number(statsRaw.reject_count),
    };

    // Active sessions count (from radacct where stop is null)
    const activeResult = await db.$queryRawUnsafe(`
      SELECT CAST(COUNT(*) AS int) as active FROM radacct WHERE acctstoptime IS NULL
    `) as any[];
    const activeSessions = activeResult[0]?.active || 0;

    return NextResponse.json({
      data: rows.map((r: any) => ({ ...r, id: Number(r.id) })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      stats: {
        totalToday: stats.total_today,
        acceptCount: stats.accept_count,
        rejectCount: stats.reject_count,
        activeSessions,
      },
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[auth-log] Error:", error);
    const msg = error instanceof Error ? error.message : "Failed to fetch auth log";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
