import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ─── Helpers ──────────────────────────────────────────────────────

function parseBrowser(ua: string): { browser: string; device: string } {
  if (!ua) return { browser: "Unknown", device: "Unknown" };
  let browser = "Unknown";
  let device = "Desktop";

  if (ua.includes("OPR/") || ua.includes("Opera")) browser = "Opera";
  else if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("Chrome/") && !ua.includes("Edg/")) browser = "Chrome";
  else if (ua.includes("Firefox/")) browser = "Firefox";
  else if (ua.includes("Safari/") && !ua.includes("Chrome") && !ua.includes("Edg/")) browser = "Safari";
  else if (ua.includes("CriOS")) browser = "Chrome iOS";

  const match = ua.match(/(?:Edg|OPR|Chrome|Firefox|Safari|CriOS)\/(\d+[\.\d]*)/);
  if (match) browser += ` ${match[1]}`;

  if (ua.includes("iPhone")) device = "iPhone";
  else if (ua.includes("iPad")) device = "iPad";
  else if (ua.includes("Android")) device = "Android";
  else if (ua.includes("Macintosh")) device = "macOS";
  else if (ua.includes("Windows")) device = "Windows";
  else if (ua.includes("Linux")) device = "Linux";
  else if (ua.includes("CrOS")) device = "Chrome OS";

  return { browser, device };
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

function escapeCsv(value: string): string {
  if (!value) return '""';
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ─── GET: Export sessions as CSV ──────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    try {
      await requireAuth(request as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "active"; // "active" or "history"
    const search = searchParams.get("search") || "";
    const dateFrom = searchParams.get("dateFrom") || "";
    const dateTo = searchParams.get("dateTo") || "";

    const where: Record<string, unknown> = {};

    // For active sessions, only show active/idle
    if (type === "active") {
      where.status = { in: ["active", "idle"] };
    }

    if (search) {
      where.OR = [
        { ipAddress: { contains: search } },
        { userAgent: { contains: search } },
        { User: { name: { contains: search } } },
        { User: { email: { contains: search } } },
      ];
    }

    if (dateFrom || dateTo) {
      where.loginAt = {};
      if (dateFrom) (where.loginAt as Record<string, unknown>).gte = new Date(dateFrom);
      if (dateTo) (where.loginAt as Record<string, unknown>).lte = new Date(dateTo + "T23:59:59");
    }

    const sessions = await db.userSession.findMany({
      where,
      include: { User: { select: { id: true, name: true, email: true, role: true, status: true } } },
      orderBy: { loginAt: "desc" },
      take: 10000, // Safety limit
    });

    const headers = [
      "User Name",
      "Role",
      "Email",
      "IP Address",
      "Browser",
      "Device",
      "Location",
      "Status",
      "Login Time",
      "Logout Time",
      "Duration (min)",
      "User Agent",
    ];

    const rows = sessions.map((s) => {
      const { browser, device } = parseBrowser(s.userAgent);
      const location = s.location || deriveLocation(s.ipAddress);
      const loginTime = s.loginAt.toISOString();
      const logoutTime = s.logoutAt?.toISOString() || "N/A";

      return [
        escapeCsv(s.User?.name || "Unknown"),
        escapeCsv(s.User?.role || "N/A"),
        escapeCsv(s.User?.email || ""),
        escapeCsv(s.ipAddress),
        escapeCsv(browser),
        escapeCsv(device),
        escapeCsv(location),
        escapeCsv(s.status),
        escapeCsv(loginTime),
        escapeCsv(logoutTime),
        String(s.duration),
        escapeCsv(s.userAgent),
      ].join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    const filename = `${type === "active" ? "active-sessions" : "login-history"}-${new Date().toISOString().split("T")[0]}.csv`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv;charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[SESSIONS_EXPORT]", error);
    return NextResponse.json(
      { error: "Failed to export sessions" },
      { status: 500 }
    );
  }
}
