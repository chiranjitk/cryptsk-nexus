import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// GET /api/hotspot/data-history — Historical RADIUS session data for hotspot users
export async function GET(request: Request) {
  try {
    await requireAuth(request as unknown as import("next/server").NextRequest);

    const sessions = await db.radiusSession.findMany({
      where: {
        stopTime: { not: null },
        inputOctets: { gt: 0 },
      },
      orderBy: { startTime: "desc" },
      take: 200,
    });

    const history = sessions.map((s) => {
      const downloadBytes = Number(s.inputOctets || 0);
      const uploadBytes = Number(s.outputOctets || 0);
      const totalBytes = downloadBytes + uploadBytes;
      const sessionSecs = s.acctSessionTime || 0;

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

      return {
        id: s.id,
        username: s.radiusUserId,
        sessionStart: s.startTime ? s.startTime.toLocaleString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—",
        duration: formatDuration(sessionSecs),
        download: formatBytes(downloadBytes),
        upload: formatBytes(uploadBytes),
        total: formatBytes(totalBytes),
        mac: s.callingStationId || "",
      };
    });

    return NextResponse.json({ history });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    console.error("Data history error:", error);
    return NextResponse.json({ error: "Failed to fetch data history" }, { status: 500 });
  }
}
