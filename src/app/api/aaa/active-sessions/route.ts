import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + " " + units[i];
}

function formatDuration(seconds: number): string {
  if (!seconds) return "0m";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(d + "d");
  if (h > 0) parts.push(h + "h");
  if (m > 0 || parts.length === 0) parts.push(m + "m");
  return parts.join(" ");
}

export async function GET(req: NextRequest) {
  try {
    await requireAuth(req).catch(() => {});
    
    const sp = req.nextUrl.searchParams;
    const limit = Math.min(200, parseInt(sp.get("limit") || "50"));
    const offset = 0;
    
    const sessions = await db.$queryRawUnsafe("SELECT * FROM v_active_sessions LIMIT $" + "1 OFFSET $" + "2", limit, offset) as any[];
    const countResult = await db.$queryRawUnsafe("SELECT CAST(COUNT(*) AS int) AS total FROM v_active_sessions") as any[];
    const total = Number(countResult[0]?.total ?? 0);
    
    const data = sessions.map((s: any) => ({
      acctSessionId: s.acctsessionid || "",
      userName: s.username || "",
      username: s.username || "",
      nasIpAddress: s.nasipaddress || "",
      framedIpAddress: s.framedipaddress || "",
      callingStationId: s.callingstationid || "",
      startTime: s.acctstarttime,
      sessionTime: Number(s.acctsessiontime) || 0,
      sessionTimeFormatted: formatDuration(Number(s.acctsessiontime) || 0),
      inputOctets: Number(s.acctinputoctets) || 0,
      outputOctets: Number(s.acctoutputoctets) || 0,
      totalOctets: Number(s.total_octets) || 0,
      inputOctetsFormatted: formatBytes(Number(s.acctinputoctets) || 0),
      outputOctetsFormatted: formatBytes(Number(s.acctoutputoctets) || 0),
      totalOctetsFormatted: formatBytes(Number(s.total_octets) || 0),
      planName: s.plan_name || s.group_name || "",
      subscriberName: s.sub_name || "",
      subscriberCode: s.sub_code || "",
      subscriberPhone: s.sub_phone || "",
      groupName: s.group_name || "",
      planDownloadSpeed: Number(s.plan_download_speed) || 0,
      planUploadSpeed: Number(s.plan_upload_speed) || 0,
      nasName: s.nas_name || "",
    }));
    
    const statsResult = await db.$queryRawUnsafe("SELECT CAST(COUNT(*) AS int) AS active_count, COALESCE(SUM(acctinputoctets + acctoutputoctets), 0) AS total_bandwidth, CAST(COALESCE(AVG(acctsessiontime), 0) AS int) AS avg_session_time, CAST(COUNT(DISTINCT nasipaddress) AS int) AS nas_count, CAST(COUNT(DISTINCT username) AS int) AS user_count FROM v_active_sessions") as any[];
    const statsRaw = statsResult[0] || {};
    
    return NextResponse.json({
      sessions: data,
      total,
      stats: {
        activeCount: Number(statsRaw.active_count || 0),
        totalBandwidth: Number(statsRaw.total_bandwidth || 0),
        avgSessionTime: Number(statsRaw.avg_session_time || 0),
        nasCount: Number(statsRaw.nas_count || 0),
        userCount: Number(statsRaw.user_count || 0),
      },
    });
  } catch (error: any) {
    console.error("[Active Sessions] Error:", error?.message || error);
    return NextResponse.json({ sessions: [], total: 0, stats: { activeCount: 0, totalBandwidth: 0, avgSessionTime: 0, nasCount: 0, userCount: 0 } });
  }
}
