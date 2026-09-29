import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

const PRIORITY_LABELS: Record<string, string> = {
  P1_CRITICAL: "Critical",
  P2_HIGH: "High",
  P3_MEDIUM: "Medium",
  P4_LOW: "Low",
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  REOPENED: "Reopened",
};

const TYPE_LABELS: Record<string, string> = {
  NO_INTERNET: "No Internet",
  SLOW_SPEED: "Slow Speed",
  CABLE_CUT: "Cable Cut",
  WIFI_ISSUE: "WiFi Issue",
  PLAN_CHANGE: "Plan Change",
  BILLING_QUERY: "Billing Query",
  VOIP_ISSUE: "VoIP Issue",
  IPTV_ISSUE: "IPTV Issue",
  NEW_CONNECTION: "New Connection",
  OTHER: "Other",
};

export async function GET(req: NextRequest) {
  try {
    try {
      await requireAuth(req as unknown as import("next/server").NextRequest);
    } catch (error) {
      if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const type = searchParams.get("type");
    const areaId = searchParams.get("areaId");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (type) where.type = type;
    if (areaId) where.areaId = areaId;

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) (where.createdAt as Record<string, unknown>).gte = new Date(dateFrom);
      if (dateTo) (where.createdAt as Record<string, unknown>).lte = new Date(dateTo + "T23:59:59.999Z");
    }

    const complaints = await db.complaint.findMany({
      where,
      include: {
        Subscriber: { select: { name: true, phone: true, code: true } },
        Area: { select: { name: true } },
        Technician: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10000,
    });

    // Build CSV
    const headers = [
      "Ticket #",
      "Customer Name",
      "Customer Code",
      "Customer Phone",
      "Walk-in Name",
      "Type",
      "Priority",
      "Status",
      "Area",
      "Assigned To",
      "SLA Hours",
      "SLA Deadline",
      "Created At",
      "Resolved At",
      "Resolution Time (hrs)",
      "Customer Rating",
      "Customer Feedback",
      "Description",
    ];

    const escapeCsv = (val: string | null | undefined) => {
      if (!val) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = complaints.map((c) => {
      let resolutionTime = "";
      if (c.resolvedAt && c.createdAt) {
        const diffMs = new Date(c.resolvedAt).getTime() - new Date(c.createdAt).getTime();
        const diffHrs = Math.round((diffMs / 3600000) * 10) / 10;
        resolutionTime = String(diffHrs);
      }

      return [
        escapeCsv(c.ticketNumber),
        escapeCsv(c.Subscriber?.name),
        escapeCsv(c.Subscriber?.code),
        escapeCsv(c.Subscriber?.phone),
        escapeCsv(c.walkInName),
        escapeCsv(TYPE_LABELS[c.type] || c.type),
        escapeCsv(PRIORITY_LABELS[c.priority] || c.priority),
        escapeCsv(STATUS_LABELS[c.status] || c.status),
        escapeCsv(c.Area?.name),
        escapeCsv(c.Technician?.name),
        String(c.slaHours),
        escapeCsv(c.slaDeadline ? new Date(c.slaDeadline).toISOString() : ""),
        escapeCsv(c.createdAt ? new Date(c.createdAt).toISOString() : ""),
        escapeCsv(c.resolvedAt ? new Date(c.resolvedAt).toISOString() : ""),
        resolutionTime,
        c.customerRating ? String(c.customerRating) : "",
        escapeCsv(c.customerFeedback),
        escapeCsv(c.description),
      ].join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="complaints-export-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error("Complaints export error:", error);
    return NextResponse.json({ error: "Failed to export complaints" }, { status: 500 });
  }
}
