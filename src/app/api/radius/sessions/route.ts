import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditLog } from "@/lib/services/audit-service";

// ─── Helpers ──────────────────────────────────────────────────────

function formatBytes(bytes: bigint): string {
  const b = Number(bytes);
  if (b === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  const idx = Math.min(i, units.length - 1);
  return `${(b / Math.pow(1024, idx)).toFixed(idx === 0 ? 0 : 2)} ${units[idx]}`;
}

function computeDuration(startTime: Date | string | null, stopTime: Date | string | null): number {
  if (!startTime) return 0;
  const start = startTime instanceof Date ? startTime.getTime() : new Date(startTime).getTime();
  const end = stopTime ? (stopTime instanceof Date ? stopTime.getTime() : new Date(stopTime).getTime()) : Date.now();
  return Math.floor((end - start) / 1000);
}

function formatDurationSeconds(seconds: number): string {
  if (seconds < 1) return "< 1s";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (d === 0 && h === 0 && s > 0) parts.push(`${s}s`);
  return parts.join(" ") || "< 1s";
}

function mapRadiusSession(s: any) {
  const duration = computeDuration(s.startTime, s.stopTime);
  const isActive = !s.stopTime;
  return {
    id: s.id,
    sessionId: s.sessionId,
    radiusUserId: s.radiusUserId,
    username: s.RadiusUser?.username || "—",
    subscriberName: s.RadiusUser?.Subscriber?.name || null,
    subscriberCode: s.RadiusUser?.Subscriber?.code || null,
    nasIp: s.nasIp || "",
    nasPort: s.nasPort || "",
    framedIp: s.framedIp || "",
    callingStationId: s.callingStationId || "",
    inputOctets: s.inputOctets?.toString() || "0",
    outputOctets: s.outputOctets?.toString() || "0",
    inputOctetsFormatted: formatBytes(s.inputOctets || BigInt(0)),
    outputOctetsFormatted: formatBytes(s.outputOctets || BigInt(0)),
    totalOctetsFormatted: formatBytes((s.inputOctets || BigInt(0)) + (s.outputOctets || BigInt(0))),
    startTime: s.startTime?.toISOString() || null,
    stopTime: s.stopTime?.toISOString() || null,
    lastUpdate: s.lastUpdate?.toISOString() || null,
    terminateCause: s.terminateCause || "",
    acctSessionTime: s.acctSessionTime || 0,
    duration,
    durationFormatted: formatDurationSeconds(duration),
    isActive,
  };
}

// ─── GET: RADIUS sessions with pagination, search, stats ─────────
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = request.nextUrl;
    const search = searchParams.get("search") || "";
    const activeOnly = searchParams.get("active") === "true";
    const rawPage = parseInt(searchParams.get("page") || "1") || 1;
    const rawLimit = parseInt(searchParams.get("limit") || "20") || 20;
    const safeLimit = Math.min(Math.max(rawLimit, 1), 100);
    const safePage = Math.max(rawPage, 1);
    const safeOffset = Math.max((safePage - 1) * safeLimit, 0);

    // Build where clause
    const where: Record<string, unknown> = {};
    if (activeOnly) {
      where.stopTime = null;
    }
    if (search) {
      where.OR = [
        { RadiusUser: { username: { contains: search } } },
        { RadiusUser: { Subscriber: { name: { contains: search } } } },
        { framedIp: { contains: search } },
        { callingStationId: { contains: search } },
        { nasIp: { contains: search } },
        { sessionId: { contains: search } },
      ];
    }

    // Fetch sessions with pagination + stats in parallel
    // Use parameterized raw SQL to prevent SQL injection
    const [sessionsRaw, total, activeCount, totalBytes] = await Promise.all([
      db.$queryRaw`
        SELECT rs.*, ru."id" as "ru_id", ru."subscriberId" as "ru_subscriberId",
          s."id" as "s_id", s."name" as "s_name", s."code" as "s_code",
          s."serviceUsername" as "s_serviceUsername"
        FROM "RadiusSession" rs
        LEFT JOIN "RadiusUser" ru ON ru."id" = rs."radiusUserId"
        LEFT JOIN "Subscriber" s ON s."id" = ru."subscriberId"
        ORDER BY rs."startTime" DESC
        LIMIT ${safeLimit} OFFSET ${safeOffset}
      ` as any[],
      db.radiusSession.count({ where }),
      db.radiusSession.count({ where: { stopTime: null } }),
      db.radiusSession.aggregate({
        _sum: { inputOctets: true, outputOctets: true },
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / safeLimit));

    // Map raw sessions to frontend-expected format with nested subscriber
    const sessions = sessionsRaw.map((s) => {
      const duration = computeDuration(s.startTime, s.stopTime);
      const isActive = !s.stopTime;
      return {
        id: s.id,
        radiusUserId: s.radiusUserId,
        sessionId: s.sessionId,
        nasIp: s.nasIp || "",
        nasPort: s.nasPort || "",
        framedIp: s.framedIp || "",
        callingStationId: s.callingStationId || "",
        acctSessionTime: s.acctSessionTime || 0,
        inputOctets: s.inputOctets || BigInt(0),
        outputOctets: s.outputOctets || BigInt(0),
        startTime: s.startTime?.toISOString() || null,
        lastUpdate: s.lastUpdate?.toISOString() || null,
        terminateCause: s.terminateCause || "",
        radiusUser: s.ru_id
          ? {
              id: s.ru_id,
              subscriber: s.s_id
                ? {
                    id: s.s_id,
                    name: s.s_name || "",
                    code: s.s_code || "",
                    serviceUsername: s.s_serviceUsername || "",
                  }
                : null,
            }
          : null,
        duration,
        durationFormatted: formatDurationSeconds(duration),
        isActive,
        inputOctetsFormatted: formatBytes(s.inputOctets || BigInt(0)),
        outputOctetsFormatted: formatBytes(s.outputOctets || BigInt(0)),
        totalOctetsFormatted: formatBytes((s.inputOctets || BigInt(0)) + (s.outputOctets || BigInt(0))),
      };
    });

    return NextResponse.json({
      sessions,
      pagination: { page: safePage, totalPages, total, limit: safeLimit },
      stats: {
        totalActive: activeCount,
        totalSessions: total,
        totalInputBytes: Number(totalBytes._sum.inputOctets || BigInt(0)),
        totalOutputBytes: Number(totalBytes._sum.outputOctets || BigInt(0)),
        totalBytes: Number((totalBytes._sum.inputOctets || BigInt(0)) + (totalBytes._sum.outputOctets || BigInt(0))),
        totalDownloadBytes: totalBytes._sum.inputOctets?.toString() || "0",
        totalUploadBytes: totalBytes._sum.outputOctets?.toString() || "0",
        totalDownloadFormatted: formatBytes(totalBytes._sum.inputOctets || BigInt(0)),
        totalUploadFormatted: formatBytes(totalBytes._sum.outputOctets || BigInt(0)),
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[RADIUS_SESSIONS_GET]", error);
    return NextResponse.json(
      { error: "Failed to fetch RADIUS sessions" },
      { status: 500 }
    );
  }
}

// ─── POST: Disconnect session with audit logging ─────────────────
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();
    const { action, sessionId } = body;

    if (action === "disconnect") {
      if (!sessionId) {
        return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
      }

      // Find the session with user info
      const session = await db.radiusSession.findUnique({
        where: { id: sessionId },
      });

      if (!session) {
        return NextResponse.json({ error: "RADIUS session not found" }, { status: 404 });
      }

      if (session.stopTime) {
        return NextResponse.json({ error: "Session is already terminated" }, { status: 400 });
      }

      // Mark session as terminated
      const duration = computeDuration(session.startTime, session.stopTime);
      const updated = await db.radiusSession.update({
        where: { id: sessionId },
        data: {
          stopTime: new Date(),
          terminateCause: "Admin-Disconnect",
          acctSessionTime: duration,
        },
      });

      // Audit log the disconnect action
      await auditLog(request, "SESSION_DISCONNECT", "RadiusSession", sessionId, {
        action: "disconnect",
        targetUsername: session.radiusUserId,
        nasIp: session.nasIp,
        framedIp: session.framedIp,
        callingStationId: session.callingStationId,
        sessionDuration: duration,
        inputOctets: session.inputOctets?.toString(),
        outputOctets: session.outputOctets?.toString(),
        disconnectByUserId: userId,
      });

      return NextResponse.json({
        success: true,
        message: `Session for ${session.radiusUserId || "unknown"} disconnected`,
        session: mapRadiusSession(updated),
      });
    }

    if (action === "disconnect-all") {
      const { username, nasIp } = body;

      const where: Record<string, unknown> = { stopTime: null };
      if (username) {
        where.RadiusUser = { username };
      }
      if (nasIp) {
        where.nasIp = nasIp;
      }

      const activeSessions = await db.radiusSession.findMany({
        where,
      });

      if (activeSessions.length === 0) {
        return NextResponse.json({
          success: true,
          message: "No active sessions found to disconnect",
          disconnected: 0,
        });
      }

      const now = new Date();
      const ids = activeSessions.map((s) => s.id);

      // Disconnect all matching sessions
      const result = await db.radiusSession.updateMany({
        where: { id: { in: ids } },
        data: {
          stopTime: now,
          terminateCause: "Admin-Bulk-Disconnect",
        },
      });

      // Audit log bulk disconnect
      await auditLog(request, "BULK_DELETE", "RadiusSession", `bulk_${Date.now()}`, {
        action: "disconnect-all",
        filterUsername: username || null,
        filterNasIp: nasIp || null,
        disconnectedCount: result.count,
        usernames: activeSessions.map((s) => s.radiusUserId).filter(Boolean),
      });

      return NextResponse.json({
        success: true,
        message: `Disconnected ${result.count} session(s)`,
        disconnected: result.count,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[RADIUS_SESSIONS_POST]", error);
    return NextResponse.json(
      { error: "Failed to process RADIUS session action" },
      { status: 500 }
    );
  }
}
