import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

const SEVERITY_LABELS: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  ACKNOWLEDGED: "Acknowledged",
  RESOLVED: "Resolved",
  SUPPRESSED: "Suppressed",
};

// GET /api/alerts/export — Export alerts as CSV
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request as unknown as NextRequest);

    const { searchParams } = new URL(request.url);
    const severity = searchParams.get("severity") || "";
    const status = searchParams.get("status") || "";
    const search = searchParams.get("search") || "";

    const where: Record<string, unknown> = {};

    if (severity && severity !== "ALL") {
      where.severity = severity.toUpperCase();
    }
    if (status && status !== "ALL") {
      where.status = status.toUpperCase();
    }
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { message: { contains: search } },
        { source: { contains: search } },
      ];
    }

    const alerts = await db.networkAlert.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: {
        AlertRule: { select: { name: true } },
        User: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10000,
    });

    const escapeCsv = (val: string | null | undefined) => {
      if (!val) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const headers = [
      "Alert ID",
      "Rule",
      "Severity",
      "Title",
      "Message",
      "Source",
      "Device ID",
      "Status",
      "Assigned To",
      "Escalation Level",
      "Duplicate Count",
      "Acknowledged By",
      "Acknowledged At",
      "Resolution",
      "Resolved At",
      "Created At",
    ];

    const rows = alerts.map((a) => {
      return [
        escapeCsv(a.id),
        escapeCsv(a.AlertRule?.name || "Manual"),
        escapeCsv(SEVERITY_LABELS[a.severity] || a.severity),
        escapeCsv(a.title),
        escapeCsv(a.message),
        escapeCsv(a.source),
        escapeCsv(a.deviceId),
        escapeCsv(STATUS_LABELS[a.status] || a.status),
        escapeCsv(a.User?.name || ""),
        String(a.escalationLevel),
        String(a.duplicateCount),
        escapeCsv(a.acknowledgedBy || ""),
        a.acknowledgedAt ? new Date(a.acknowledgedAt).toISOString() : "",
        escapeCsv(a.resolution),
        a.resolvedAt ? new Date(a.resolvedAt).toISOString() : "",
        a.createdAt ? new Date(a.createdAt).toISOString() : "",
      ].join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="network-alerts-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Alerts export error:", error);
    return NextResponse.json({ error: "Failed to export alerts" }, { status: 500 });
  }
}
