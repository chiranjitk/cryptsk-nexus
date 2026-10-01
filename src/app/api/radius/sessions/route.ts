import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
    const sp = req.nextUrl.searchParams;
    const limit = Math.min(200, parseInt(sp.get("limit") || "50"));

    const sessions = await db.$queryRawUnsafe(
      'SELECT * FROM v_active_sessions ORDER BY acctstarttime DESC LIMIT $1',
      limit
    ) as any[];

    const mappedSessions = sessions.map((s: any) => ({
      sessionId: s.acctsessionid || "",
      username: s.username || "",
      userName: s.username || "",
      nasIp: s.nasipaddress || "",
      framedIp: s.framedipaddress || "",
      callingStationId: s.callingstationid || "",
      startTime: s.acctstarttime?.toISOString?.() || s.acctstarttime || "",
      sessionTime: Number(s.acctsessiontime) || 0,
      inputOctets: Number(s.acctinputoctets) || 0,
      outputOctets: Number(s.acctoutputoctets) || 0,
      ipv6InputOctets: 0,
      ipv6OutputOctets: 0,
      sessionTimeout: 0,
      idleTimeout: 0,
      subscriberName: s.sub_name || "",
      subscriberCode: s.sub_code || "",
      subscriberPhone: "",
      planName: s.group_name || "",
    }));

    const totalActive = mappedSessions.length;
    const totalInputBytes = mappedSessions.reduce((sum: number, s: any) => sum + Number(s.inputOctets), 0);
    const totalOutputBytes = mappedSessions.reduce((sum: number, s: any) => sum + Number(s.outputOctets), 0);

    return NextResponse.json({
      sessions: mappedSessions,
      stats: { totalActive, totalInputBytes, totalOutputBytes, totalBytes: totalInputBytes + totalOutputBytes },
    });
  } catch (error) {
    console.error("RADIUS sessions error:", error);
    return NextResponse.json({ sessions: [], stats: { totalActive: 0, totalInputBytes: 0, totalOutputBytes: 0, totalBytes: 0 } });
  }
}
