import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ── Response Types ──────────────────────────────────────────────────

interface SystemAlert {
  id: string;
  type: string;
  severity: "CRITICAL" | "HIGH" | "WARNING" | "INFO";
  title: string;
  description: string;
  timestamp: string;
  source: "Complaint" | "Payment" | "Device" | "Invoice" | "Subscriber";
}

interface AlertsSummaryResponse {
  summary: {
    criticalAlerts: number;
    highAlerts: number;
    warnings: number;
    info: number;
  };
  alerts: SystemAlert[];
  networkDevices: {
    online: number;
    offline: number;
    warning: number;
    maintenance: number;
  };
  overdueSummary: {
    count: number;
    totalAmount: number;
  };
  timestamp: string;
}

// ── CORS Headers ────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ── OPTIONS handler for CORS preflight ──────────────────────────────

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// ── GET /api/system/alerts-summary ─────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    // ── Authentication ──
    await requireAuth(request);

    const now = new Date();

    // ── Time windows ──
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

    const alerts: SystemAlert[] = [];

    // ── 1. Open P1_CRITICAL and P2_HIGH complaints ──
    const criticalComplaints = await db.complaint.findMany({
      where: {
        priority: { in: ["P1_CRITICAL", "P2_HIGH"] },
        status: { notIn: ["RESOLVED", "CLOSED"] },
      },
      select: {
        id: true,
        ticketNumber: true,
        type: true,
        priority: true,
        description: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    for (const c of criticalComplaints) {
      alerts.push({
        id: `complaint-${c.id}`,
        type: "COMPLAINT",
        severity: c.priority === "P1_CRITICAL" ? "CRITICAL" : "HIGH",
        title: `${c.type.replace(/_/g, " ")} — ${c.ticketNumber}`,
        description:
          c.description.length > 80
            ? c.description.substring(0, 80) + "..."
            : c.description,
        timestamp: c.createdAt.toISOString(),
        source: "Complaint",
      });
    }

    // ── 2. Suspended subscribers count (info alert) ──
    const suspendedCount = await db.subscriber.count({
      where: { status: "SUSPENDED" },
    });

    if (suspendedCount > 0) {
      alerts.push({
        id: "suspended-subscribers",
        type: "SUBSCRIBER_STATUS",
        severity: "WARNING",
        title: `${suspendedCount} Suspended Subscriber${suspendedCount > 1 ? "s" : ""}`,
        description:
          "Subscribers with suspended status may need attention for reactivation or payment follow-up.",
        timestamp: now.toISOString(),
        source: "Subscriber",
      });
    }

    // ── 3. Overdue invoices count and total amount ──
    const overdueInvoices = await db.invoice.findMany({
      where: {
        status: "OVERDUE",
      },
      select: {
        id: true,
        invoiceNumber: true,
        grandTotal: true,
        dueDate: true,
        subscriberId: true,
      },
      orderBy: { dueDate: "asc" },
      take: 50,
    });

    const overdueCount = overdueInvoices.length;
    const overdueTotalAmount =
      overdueInvoices.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0);

    // Overdue invoices due today
    const overdueDueToday = overdueInvoices.filter((inv) => {
      const dueDate = new Date(inv.dueDate);
      return dueDate >= startOfToday && dueDate < endOfToday;
    });

    for (const inv of overdueDueToday.slice(0, 3)) {
      alerts.push({
        id: `invoice-today-${inv.id}`,
        type: "OVERDUE_DUE_TODAY",
        severity: "HIGH",
        title: `Overdue: ${inv.invoiceNumber}`,
        description: `Invoice ${inv.invoiceNumber} is overdue with amount ₹${Math.round(inv.grandTotal).toLocaleString("en-IN")}.`,
        timestamp: inv.dueDate.toISOString(),
        source: "Invoice",
      });
    }

    // General overdue summary
    if (overdueCount > 0 && overdueDueToday.length === 0) {
      alerts.push({
        id: "overdue-summary",
        type: "OVERDUE_SUMMARY",
        severity: "WARNING",
        title: `${overdueCount} Overdue Invoice${overdueCount > 1 ? "s" : ""}`,
        description: `Total outstanding amount: ₹${Math.round(overdueTotalAmount).toLocaleString("en-IN")}. Review and follow up.`,
        timestamp: now.toISOString(),
        source: "Invoice",
      });
    }

    // ── 4. Failed payments in last 7 days ──
    const failedPayments = await db.payment.findMany({
      where: {
        status: "FAILED",
        createdAt: { gte: sevenDaysAgo },
      },
      select: {
        id: true,
        amount: true,
        paymentMode: true,
        createdAt: true,
        subscriberId: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const failedCount = failedPayments.length;

    // Failed payments in last 24h (critical alerts)
    const failedLast24h = failedPayments.filter(
      (p) => new Date(p.createdAt) >= twentyFourHoursAgo
    );

    for (const p of failedLast24h.slice(0, 3)) {
      alerts.push({
        id: `payment-failed-${p.id}`,
        type: "PAYMENT_FAILED",
        severity: "HIGH",
        title: `Payment Failed — ₹${Math.round(p.amount).toLocaleString("en-IN")}`,
        description: `A ${p.paymentMode} payment of ₹${Math.round(p.amount).toLocaleString("en-IN")} failed. Check transaction details.`,
        timestamp: p.createdAt.toISOString(),
        source: "Payment",
      });
    }

    // Failed payments summary for 7 days
    if (failedCount > 0 && failedLast24h.length === 0) {
      alerts.push({
        id: "failed-payments-summary",
        type: "FAILED_PAYMENTS_SUMMARY",
        severity: "WARNING",
        title: `${failedCount} Failed Payment${failedCount > 1 ? "s" : ""} (7d)`,
        description:
          "Multiple payment failures detected in the last 7 days. Review payment gateway status.",
        timestamp: now.toISOString(),
        source: "Payment",
      });
    }

    // ── 5. NetworkDevice count by status ──
    const allDeviceStatuses = await db.networkDevice.groupBy({
      by: ["status"],
      _count: true,
    });

    const deviceCounts = {
      online: 0,
      offline: 0,
      warning: 0,
      maintenance: 0,
    };

    for (const ds of allDeviceStatuses) {
      switch (ds.status) {
        case "ONLINE":
          deviceCounts.online += ds._count;
          break;
        case "OFFLINE":
          deviceCounts.offline += ds._count;
          break;
        case "WARNING":
          deviceCounts.warning += ds._count;
          break;
        case "MAINTENANCE":
          deviceCounts.maintenance += ds._count;
          break;
        default:
          break;
      }
    }

    // Offline critical devices (alerts)
    const offlineDevices = await db.networkDevice.findMany({
      where: {
        status: "OFFLINE",
      },
      select: {
        id: true,
        name: true,
        type: true,
        location: true,
        lastSeenAt: true,
      },
      orderBy: { lastSeenAt: "asc" },
      take: 5,
    });

    for (const d of offlineDevices) {
      alerts.push({
        id: `device-offline-${d.id}`,
        type: "DEVICE_OFFLINE",
        severity: "CRITICAL",
        title: `Device Offline: ${d.name}`,
        description: `${d.type} at ${d.location || "Unknown location"} is offline.${d.lastSeenAt ? ` Last seen ${d.lastSeenAt.toISOString()}.` : ""}`,
        timestamp: (d.lastSeenAt || now).toISOString(),
        source: "Device",
      });
    }

    // Warning status devices
    const warningDevices = await db.networkDevice.findMany({
      where: {
        status: "WARNING",
      },
      select: {
        id: true,
        name: true,
        type: true,
        location: true,
      },
      take: 3,
    });

    for (const d of warningDevices) {
      alerts.push({
        id: `device-warning-${d.id}`,
        type: "DEVICE_WARNING",
        severity: "WARNING",
        title: `Device Warning: ${d.name}`,
        description: `${d.type} at ${d.location || "Unknown location"} is in WARNING state.`,
        timestamp: now.toISOString(),
        source: "Device",
      });
    }

    // ── 6. Sort alerts: CRITICAL first, then HIGH, WARNING, INFO; then by timestamp desc ──
    const severityOrder: Record<string, number> = {
      CRITICAL: 0,
      HIGH: 1,
      WARNING: 2,
      INFO: 3,
    };

    alerts.sort((a, b) => {
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    // Take top 10
    const topAlerts = alerts.slice(0, 10);

    // ── 7. Compute summary counts ──
    const summary = {
      criticalAlerts: alerts.filter((a) => a.severity === "CRITICAL").length,
      highAlerts: alerts.filter((a) => a.severity === "HIGH").length,
      warnings: alerts.filter((a) => a.severity === "WARNING").length,
      info: alerts.filter((a) => a.severity === "INFO").length,
    };

    // ── 8. Build response ──
    const response: AlertsSummaryResponse = {
      summary,
      alerts: topAlerts,
      networkDevices: deviceCounts,
      overdueSummary: {
        count: overdueCount,
        totalAmount: overdueTotalAmount,
      },
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response, { headers: corsHeaders });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode, headers: corsHeaders }
      );
    }
    console.error("System alerts summary failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch system alerts summary" },
      { status: 500, headers: corsHeaders }
    );
  }
}
