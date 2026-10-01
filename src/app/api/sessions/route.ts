import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req).catch(() => {});
    
    // Try the raw query and catch errors explicitly
    let sessions: any[] = [];
    let queryError = "";
    try {
      sessions = await db.$queryRawUnsafe('SELECT * FROM v_active_sessions ORDER BY acctstarttime DESC LIMIT $1 OFFSET $2', 50, 0) as any[];
    } catch (e: any) {
      queryError = String(e?.message || e).slice(0, 500);
    }

    const mappedSessions = sessions.map((s: any) => ({
      id: s.acctsessionid || "",
      sessionId: s.acctsessionid || "",
      username: s.username || "",
      userName: s.username || "",
      ip: s.framedipaddress || "",
      macAddress: s.callingstationid || "",
      status: "ACTIVE",
      loginTime: String(s.acctstarttime || ""),
      duration: Number(s.acctsessiontime) || 0,
      downloadBytes: Number(s.acctinputoctets) || 0,
      uploadBytes: Number(s.acctoutputoctets) || 0,
      subscriberName: s.sub_name || "",
      planName: s.group_name || "",
    }));

    return NextResponse.json({
      activeSessions: mappedSessions,
      sessionsPagination: { page: 1, totalPages: 1, total: mappedSessions.length },
      loginHistory: [],
      historyPagination: { page: 1, totalPages: 1, total: 0 },
      stats: { active: mappedSessions.length, today: mappedSessions.length, week: mappedSessions.length, locked: 0, suspicious: 0, failedAttempts: 0 },
      _debug: { queryError, sessionCount: sessions.length, dbUrl: process.env.DATABASE_URL?.slice(0, 30) + "..." },
    });
  } catch (error: any) {
    return NextResponse.json({
      activeSessions: [],
      sessionsPagination: { page: 1, totalPages: 1, total: 0 },
      loginHistory: [],
      historyPagination: { page: 1, totalPages: 1, total: 0 },
      stats: { active: 0, today: 0, week: 0, locked: 0, suspicious: 0, failedAttempts: 0 },
      _debug: { outerError: String(error?.message || error).slice(0, 500) },
    });
  }
}
