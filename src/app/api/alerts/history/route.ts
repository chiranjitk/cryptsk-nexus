import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";

function mapSeverity(severity: string): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1).toLowerCase();
}

function mapAlertStatus(status: string): string {
  switch (status) {
    case "ACTIVE": return "Active";
    case "ACKNOWLEDGED": return "Acknowledged";
    case "RESOLVED": return "Resolved";
    case "SUPPRESSED": return "Suppressed";
    default: return status;
  }
}

// GET /api/alerts/history — Fetch paginated alert history with date range filtering
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const severity = searchParams.get("severity") || "";
    const status = searchParams.get("status") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const dateFrom = searchParams.get("dateFrom") || "";
    const dateTo = searchParams.get("dateTo") || "";

    const where: Record<string, unknown> = {};
    if (status && status !== "ALL") {
      where.status = status.toUpperCase();
    } else {
      // Default: show all alerts (not just resolved) for history view
      where.status = { in: ["RESOLVED", "ACKNOWLEDGED", "ACTIVE"] };
    }

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { message: { contains: search } },
        { source: { contains: search } },
        { deviceId: { contains: search } },
      ];
    }
    if (severity && severity !== "ALL") {
      where.severity = severity.toUpperCase();
    }

    // Date range filter (feature 10)
    if (dateFrom || dateTo) {
      const dateFilter: Record<string, unknown> = {};
      if (dateFrom) {
        dateFilter.gte = new Date(dateFrom);
      }
      if (dateTo) {
        // Set end of day for dateTo
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        dateFilter.lte = endDate;
      }
      where.createdAt = dateFilter;
    }

    const [history, total] = await Promise.all([
      db.networkAlert.findMany({
        where,
        include: {
          AlertRule: { select: { id: true, name: true } },
          User: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.networkAlert.count({ where }),
    ]);

    const transformed = history.map((h) => ({
      id: h.id,
      severity: mapSeverity(h.severity),
      type: h.AlertRule?.name || h.title || "Custom",
      title: h.title || "",
      message: h.message,
      device: h.deviceId || h.source || "",
      triggeredAt: h.createdAt.toISOString(),
      resolvedAt: h.resolvedAt?.toISOString() || null,
      resolution: h.resolution || "",
      acknowledgedBy: h.User?.name || h.acknowledgedBy || "",
      status: mapAlertStatus(h.status),
      duration: h.resolvedAt && h.createdAt
        ? Math.round((h.resolvedAt.getTime() - h.createdAt.getTime()) / 60000)
        : null,
      duplicateCount: h.duplicateCount || 1,
      escalationLevel: h.escalationLevel || 0,
      assignedTo: h.User?.name || null,
    }));

    return NextResponse.json({
      history: transformed,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: unknown) {
    console.error("Alerts history GET error:", error);
    return NextResponse.json({ error: "Failed to fetch alert history" }, { status: 500 });
  }
}
