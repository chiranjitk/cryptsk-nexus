import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditLog } from "@/lib/services/audit-service";

// ─── Helpers ──────────────────────────────────────────────────────

function parseOS(ua: string): string {
  if (!ua) return "Unknown";
  if (ua.includes("Windows")) return "Windows";
  if (ua.includes("Macintosh")) return "macOS";
  if (ua.includes("iPhone")) return "iOS";
  if (ua.includes("iPad")) return "iPadOS";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("CrOS")) return "Chrome OS";
  if (ua.includes("Linux")) return "Linux";
  return "Unknown";
}

function parseBrowser(ua: string): { browser: string; device: string; os: string } {
  if (!ua) return { browser: "Unknown", device: "Unknown", os: "Unknown" };
  let browser = "Unknown";
  let device = "Desktop";

  if (ua.includes("OPR/") || ua.includes("Opera")) browser = "Opera";
  else if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("Chrome/") && !ua.includes("Edg/")) browser = "Chrome";
  else if (ua.includes("Firefox/")) browser = "Firefox";
  else if (ua.includes("Safari/") && !ua.includes("Chrome") && !ua.includes("Edg/")) browser = "Safari";
  else if (ua.includes("CriOS")) browser = "Chrome iOS";

  const versionPatterns = [
    /(?:Edg|OPR|Chrome|Firefox|Safari|CriOS)\/(\d+[\.\d]*)/,
  ];
  for (const pattern of versionPatterns) {
    const match = ua.match(pattern);
    if (match) {
      browser += ` ${match[1]}`;
      break;
    }
  }

  if (ua.includes("iPhone")) device = "iPhone";
  else if (ua.includes("iPad")) device = "iPad";
  else if (ua.includes("Android")) device = "Android";
  else if (ua.includes("Macintosh")) device = "macOS";
  else if (ua.includes("Windows")) device = "Windows";
  else if (ua.includes("Linux")) device = "Linux";
  else if (ua.includes("CrOS")) device = "Chrome OS";

  return { browser, device, os: parseOS(ua) };
}

function deriveLocation(ip: string): string {
  if (!ip) return "Unknown";
  if (ip.startsWith("192.168.") || ip.startsWith("10.") || ip.startsWith("172.16.") || ip === "127.0.0.1" || ip === "::1") {
    return "Local Network";
  }
  if (ip === "localhost") return "Local Network";
  if (ip.startsWith("169.254.")) return "Link-Local";
  return `IP: ${ip}`;
}

function mapSessionToResponse(s: any) {
  const { browser, device, os } = parseBrowser(s.userAgent);
  return {
    id: s.id,
    userId: s.userId,
    userName: s.User?.name || "Unknown",
    role: s.User?.role || "N/A",
    email: s.User?.email || "",
    ip: s.ipAddress,
    macAddress: "",
    userAgent: s.userAgent,
    device,
    browser,
    os,
    location: s.location || deriveLocation(s.ipAddress),
    loginTime: s.loginAt.toISOString(),
    logoutTime: s.logoutAt?.toISOString() || null,
    lastActivity: s.logoutAt ? s.logoutAt.toISOString() : new Date().toISOString(),
    duration: s.duration,
    downloadBytes: 0,
    uploadBytes: 0,
    status: s.status,
  };
}

// ─── GET: Sessions, login history, stats ──────────────────────────
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const historyPage = parseInt(searchParams.get("historyPage") || "1");
    const historyLimit = parseInt(searchParams.get("historyLimit") || "10");
    const dateFrom = searchParams.get("dateFrom") || "";
    const dateTo = searchParams.get("dateTo") || "";
    const tab = searchParams.get("tab") || "all";

    const sessionWhere: Record<string, unknown> = { status: { in: ["active", "idle"] } };
    if (search) {
      sessionWhere.OR = [
        { ipAddress: { contains: search } },
        { userAgent: { contains: search } },
        { User: { name: { contains: search } } },
        { User: { email: { contains: search } } },
      ];
    }
    if (status && status !== "All") {
      sessionWhere.status = status.toLowerCase();
    }

    const historyWhere: Record<string, unknown> = {};
    if (search) {
      historyWhere.OR = [
        { ipAddress: { contains: search } },
        { userAgent: { contains: search } },
        { User: { name: { contains: search } } },
        { User: { email: { contains: search } } },
      ];
    }
    if (dateFrom || dateTo) {
      historyWhere.loginAt = {};
      if (dateFrom) (historyWhere.loginAt as Record<string, unknown>).gte = new Date(dateFrom);
      if (dateTo) (historyWhere.loginAt as Record<string, unknown>).lte = new Date(dateTo + "T23:59:59");
    }

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const fetchSessions = tab === "all" || tab === "sessions";
    const fetchHistory = tab === "all" || tab === "history";

    const queries: Promise<any>[] = [
      db.user.count({ where: { status: "LOCKED" } }),
      db.userSession.count({ where: { status: { in: ["active", "idle"] } } }),
      db.userSession.count({ where: { loginAt: { gte: startOfDay } } }),
      db.userSession.count({ where: { loginAt: { gte: startOfWeek } } }),
      db.userSession.count({ where: { status: "failed" } }),
      db.userSession.groupBy({
        by: ["ipAddress"],
        where: { status: "failed" },
        _count: { id: true },
      }),
    ];

    if (fetchSessions) {
      queries.push(
        db.userSession.findMany({
          where: sessionWhere,
          include: { User: { select: { id: true, name: true, email: true, role: true, status: true } } },
          orderBy: { loginAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
        }),
        db.userSession.count({ where: sessionWhere }),
      );
    }

    if (fetchHistory) {
      queries.push(
        db.userSession.findMany({
          where: historyWhere,
          include: { User: { select: { id: true, name: true, email: true, role: true, status: true } } },
          orderBy: { loginAt: "desc" },
          skip: (historyPage - 1) * historyLimit,
          take: historyLimit,
        }),
        db.userSession.count({ where: historyWhere }),
      );
    }

    const results = await Promise.all(queries);

    let idx = 0;
    const statsLocked = results[idx++] as number;
    const statsActive = results[idx++] as number;
    const statsToday = results[idx++] as number;
    const statsWeek = results[idx++] as number;
    const statsFailed = results[idx++] as number;
    const failedIpGroups = results[idx++] as { ipAddress: string; _count: { id: number } }[];
    const suspiciousIps = failedIpGroups.filter((g) => g._count.id > 3);

    let activeSessions: any[] = [];
    let totalSessions = 0;
    let history: any[] = [];
    let totalHistory = 0;

    if (fetchSessions) {
      activeSessions = results[idx++] as any[];
      totalSessions = results[idx++] as number;
    }
    if (fetchHistory) {
      history = results[idx++] as any[];
      totalHistory = results[idx++] as number;
    }

    const suspiciousCount = suspiciousIps.reduce((sum, ip) => sum + ip._count.id, 0);

    return NextResponse.json({
      activeSessions: activeSessions.map(mapSessionToResponse),
      sessionsPagination: {
        page,
        totalPages: Math.max(1, Math.ceil(totalSessions / limit)),
        total: totalSessions,
      },
      loginHistory: history.map(mapSessionToResponse),
      historyPagination: {
        page: historyPage,
        totalPages: Math.max(1, Math.ceil(totalHistory / historyLimit)),
        total: totalHistory,
      },
      stats: {
        active: statsActive,
        today: statsToday,
        week: statsWeek,
        locked: statsLocked,
        suspicious: suspiciousCount,
        failedAttempts: statsFailed,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[SESSIONS_GET]", error);
    return NextResponse.json(
      { error: "Failed to fetch sessions" },
      { status: 500 }
    );
  }
}

// ─── POST: Actions ────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();
    const { action, sessionId } = body;

    if (action === "logout" || action === "terminate") {
      if (!sessionId) {
        return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
      }
      const existing = await db.userSession.findUnique({ where: { id: sessionId }, include: { User: { select: { name: true } } } });
      if (!existing) {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
      }
      const duration = Math.floor((Date.now() - existing.loginAt.getTime()) / 60000);
      const session = await db.userSession.update({
        where: { id: sessionId },
        data: {
          status: "inactive",
          logoutAt: new Date(),
          duration,
        },
      });
      await auditLog(request, "SESSION_TERMINATE", "UserSession", sessionId, {
        targetUserId: existing.userId,
        targetUserName: existing.User?.name,
        ipAddress: existing.ipAddress,
        duration,
      });
      return NextResponse.json({ success: true, message: "Session terminated", session });
    }

    if (action === "lock-user") {
      const { targetUserId } = body;
      if (!targetUserId) {
        return NextResponse.json({ error: "targetUserId is required" }, { status: 400 });
      }
      const targetUser = await db.user.findUnique({ where: { id: targetUserId } });
      if (!targetUser) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      const previousStatus = targetUser.status;
      const updated = await db.user.update({
        where: { id: targetUserId },
        data: { status: "LOCKED" },
      });
      // Terminate all active sessions for the locked user
      await db.userSession.updateMany({
        where: { userId: targetUserId, status: { in: ["active", "idle"] } },
        data: { status: "inactive", logoutAt: new Date() },
      });
      await auditLog(request, "ACCOUNT_LOCK", "User", targetUserId, {
        previousStatus,
        newStatus: "LOCKED",
        targetUserName: targetUser.name,
        targetUserEmail: targetUser.email,
      });
      return NextResponse.json({ success: true, message: `User ${targetUser.name} has been locked` });
    }

    if (action === "unlock-user") {
      const { targetUserId } = body;
      if (!targetUserId) {
        return NextResponse.json({ error: "targetUserId is required" }, { status: 400 });
      }
      const targetUser = await db.user.findUnique({ where: { id: targetUserId } });
      if (!targetUser) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      const updated = await db.user.update({
        where: { id: targetUserId },
        data: { status: "ACTIVE" },
      });
      await auditLog(request, "ACCOUNT_UNLOCK", "User", targetUserId, {
        previousStatus: targetUser.status,
        newStatus: "ACTIVE",
        targetUserName: targetUser.name,
        targetUserEmail: targetUser.email,
      });
      return NextResponse.json({ success: true, message: `User ${targetUser.name} has been unlocked` });
    }

    if (action === "terminate-all-suspicious") {
      const failedIpGroups = await db.userSession.groupBy({
        by: ["ipAddress"],
        where: { status: "failed" },
        _count: { id: true },
      });
      const suspiciousIpList = failedIpGroups
        .filter((g) => g._count.id > 3)
        .map((g) => g.ipAddress)
        .filter(Boolean);

      if (suspiciousIpList.length === 0) {
        return NextResponse.json({ success: true, message: "No suspicious sessions found", terminated: 0 });
      }

      const result = await db.userSession.updateMany({
        where: {
          ipAddress: { in: suspiciousIpList },
          status: { in: ["active", "idle"] },
        },
        data: {
          status: "inactive",
          logoutAt: new Date(),
        },
      });

      await auditLog(request, "BULK_DELETE", "UserSession", "suspicious_bulk", {
        suspiciousIps: suspiciousIpList,
        terminatedCount: result.count,
      });

      return NextResponse.json({
        success: true,
        message: `Terminated ${result.count} suspicious session(s)`,
        terminated: result.count,
        suspiciousIps: suspiciousIpList,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[SESSIONS_POST]", error);
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}
