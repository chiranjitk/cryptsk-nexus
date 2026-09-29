import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";
import {
  csvResponse,
  generateExportFilename,
  fmtDate,
  fmtDateTime,
} from "@/lib/export-utils";

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

// GET /api/export/complaints — CSV/JSON export with filters
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);

    const { searchParams } = new URL(req.url);
    const format = searchParams.get("format") || "csv";
    const status = searchParams.get("status") || "";
    const priority = searchParams.get("priority") || "";
    const dateFrom = searchParams.get("dateFrom") || "";
    const dateTo = searchParams.get("dateTo") || "";
    const areaId = searchParams.get("areaId") || "";
    const type = searchParams.get("type") || "";

    // Build where clause
    const where: Record<string, unknown> = {};

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (type) where.type = type;
    if (areaId) where.areaId = areaId;

    // Date filtering on createdAt
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

    // CSV headers
    const headers = [
      "Ticket#",
      "Subscriber",
      "Type",
      "Priority",
      "Status",
      "Assigned To",
      "Created",
      "Resolved",
      "Area",
      "Description",
    ];

    const rows = complaints.map((c) => [
      c.ticketNumber,
      c.Subscriber?.name || (c.walkInName || "Walk-in"),
      TYPE_LABELS[c.type] || c.type,
      PRIORITY_LABELS[c.priority] || c.priority,
      STATUS_LABELS[c.status] || c.status,
      c.Technician?.name || "",
      fmtDateTime(c.createdAt),
      fmtDateTime(c.resolvedAt),
      c.Area?.name || "",
      c.description || "",
    ]);

    // JSON format
    if (format === "json") {
      return NextResponse.json({
        total: complaints.length,
        data: complaints.map((c) => ({
          ticketNumber: c.ticketNumber,
          subscriber: c.Subscriber?.name || (c.walkInName || "Walk-in"),
          type: TYPE_LABELS[c.type] || c.type,
          priority: PRIORITY_LABELS[c.priority] || c.priority,
          status: STATUS_LABELS[c.status] || c.status,
          assignedTo: c.Technician?.name,
          created: fmtDateTime(c.createdAt),
          resolved: fmtDateTime(c.resolvedAt),
          area: c.Area?.name,
        })),
      });
    }

    // CSV format (default)
    const filename = generateExportFilename("complaints");
    return csvResponse(headers, rows, filename);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("Export complaints error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to export complaints" },
      { status: 500 }
    );
  }
}
