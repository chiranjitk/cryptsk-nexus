import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/hotspot/users/[id]/history — Session history for a specific user
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const { id } = await params;

    const sessions = await db.radiusSession.findMany({
      where: { radiusUserId: id },
      orderBy: { startTime: "desc" },
      take: 100,
    });

    const formatBytes = (b: number) => {
      if (b >= 1073741824) return `${(b / 1073741824).toFixed(2)} GB`;
      if (b >= 1048576) return `${(b / 1048576).toFixed(1)} MB`;
      if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`;
      return `${b} B`;
    };

    const formatDuration = (secs: number) => {
      if (secs >= 3600) return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
      if (secs >= 60) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
      return `${secs}s`;
    };

    const sessionList = sessions.map((s) => ({
      id: s.id,
      sessionId: s.sessionId || "",
      nasIp: s.nasIp || "",
      startTime: s.startTime ? s.startTime.toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—",
      stopTime: s.stopTime ? s.stopTime.toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Active",
      duration: formatDuration(s.acctSessionTime || 0),
      download: formatBytes(Number(s.inputOctets || 0)),
      upload: formatBytes(Number(s.outputOctets || 0)),
      totalBytes: Number(s.inputOctets || 0) + Number(s.outputOctets || 0),
      total: formatBytes(Number(s.inputOctets || 0) + Number(s.outputOctets || 0)),
      mac: s.callingStationId || "",
      framedIp: s.framedIp || "",
      terminateCause: s.terminateCause || "",
      isActive: !s.stopTime,
    }));

    const totalDataUsed = sessions.reduce(
      (sum, s) => sum + Number(s.inputOctets || 0) + Number(s.outputOctets || 0),
      0
    );
    const totalSessionDuration = sessions.reduce((sum, s) => sum + (s.acctSessionTime || 0), 0);
    const activeSessions = sessions.filter((s) => !s.stopTime).length;

    return NextResponse.json({
      userId: id,
      sessions: sessionList,
      summary: {
        totalSessions: sessions.length,
        activeSessions,
        totalDataUsed: formatBytes(totalDataUsed),
        totalSessionDuration: formatDuration(totalSessionDuration),
        avgSessionDuration: sessions.length > 0 ? formatDuration(Math.round(totalSessionDuration / sessions.length)) : "0s",
      },
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("User history error:", error);
    return NextResponse.json({ error: "Failed to fetch user history" }, { status: 500 });
  }
}
