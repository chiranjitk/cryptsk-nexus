import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

function formatBytes(bytes: bigint | number): string {
  const b = Number(bytes);
  if (b >= 1073741824) return `${(b / 1073741824).toFixed(2)} GB`;
  if (b >= 1048576) return `${(b / 1048576).toFixed(2)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(2)} KB`;
  return `${b} B`;
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0s";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

const CAUSE_LABELS: Record<string, string> = {
  "User-Request": "User Logout",
  "Idle-Timeout": "Idle Timeout",
  "Session-Timeout": "Session Timeout",
  "Admin-Reset": "Admin Disconnect",
  "NAS-Error": "NAS Error",
  "NAS-Reboot": "NAS Reboot",
  "Port-Error": "Port Error",
  "Lost-Carrier": "Lost Carrier",
  "Service-Unavailable": "Service Unavailable",
};

// GET /api/hotspot/export — Export hotspot sessions as CSV
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request as unknown as NextRequest);

    const { searchParams } = new URL(request.url);
    const tab = searchParams.get("tab") || "active";

    if (tab === "plans") {
      // Export hotspot plans
      const plans = await db.plan.findMany({
        where: { category: "HOTSPOT" },
        include: { _count: { select: { Subscriber: true } } },
        orderBy: { createdAt: "desc" },
      });

      const escapeCsv = (val: string | null | undefined) => {
        if (!val) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      };

      const headers = [
        "Name",
        "Download (Mbps)",
        "Upload (Mbps)",
        "Data Limit (GB)",
        "Validity (Days)",
        "Price",
        "Status",
        "Active Subscribers",
        "Description",
        "Created At",
      ];

      const rows = plans.map((p) => {
        return [
          escapeCsv(p.name),
          String(p.downloadSpeed), // plan speeds stored in Mbps (unit migration)
          String(p.uploadSpeed),
          p.dataLimitGb ? String(p.dataLimitGb) : "Unlimited",
          String(p.validityDays),
          String(p.priceMonthly),
          escapeCsv(p.status),
          String(p._count.Subscriber),
          escapeCsv(p.description),
          p.createdAt ? new Date(p.createdAt).toISOString() : "",
        ].join(",");
      });

      const csv = [headers.join(","), ...rows].join("\n");

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="hotspot-plans-${new Date().toISOString().split("T")[0]}.csv"`,
        },
      });
    }

    // Default: export sessions (both active and historical)
    const sessions = await db.radiusSession.findMany({
      where: {},
      orderBy: { startTime: "desc" },
      take: 10000,
    });

    const escapeCsv = (val: string | null | undefined) => {
      if (!val) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const headers = [
      "Session ID",
      "Username",
      "Subscriber",
      "Subscriber Code",
      "Plan",
      "NAS IP",
      "Framed IP",
      "MAC Address",
      "Start Time",
      "Stop Time",
      "Duration",
      "Download",
      "Upload",
      "Total",
      "Terminate Cause",
      "Status",
    ];

    const rows = sessions.map((s) => {
      const isActive = !s.stopTime;
      const sessionTime = isActive
        ? s.startTime
          ? Math.floor((Date.now() - new Date(s.startTime).getTime()) / 1000)
          : 0
        : s.acctSessionTime;

      const totalBytes = Number(s.inputOctets) + Number(s.outputOctets);

      return [
        escapeCsv(s.sessionId),
        escapeCsv(s.radiusUserId),
        escapeCsv(""),
        escapeCsv(""),
        escapeCsv(""),
        escapeCsv(s.nasIp),
        escapeCsv(s.framedIp),
        escapeCsv(s.callingStationId),
        s.startTime ? new Date(s.startTime).toISOString() : "",
        s.stopTime ? new Date(s.stopTime).toISOString() : "",
        formatDuration(sessionTime),
        formatBytes(s.inputOctets),
        formatBytes(s.outputOctets),
        formatBytes(totalBytes),
        escapeCsv(CAUSE_LABELS[s.terminateCause] || s.terminateCause),
        isActive ? "Active" : "Ended",
      ].join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="hotspot-sessions-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Hotspot export error:", error);
    return NextResponse.json({ error: "Failed to export hotspot data" }, { status: 500 });
  }
}
