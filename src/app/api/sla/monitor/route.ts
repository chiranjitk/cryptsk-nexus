import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ── Response Types ──────────────────────────────────────────────────

interface PriorityMetrics {
  priority: string;
  label: string;
  open: number;
  breached: number;
  total: number;
  resolvedOnTime: number;
  complianceRate: number;
}

interface SlaMonitorResponse {
  overallComplianceRate: number;
  totalComplaints: number;
  openComplaints: number;
  breachedCount: number;
  resolvedOnTimeCount: number;
  avgResolutionTimeHours: number;
  priorities: PriorityMetrics[];
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

// ── Priority definitions ────────────────────────────────────────────

const PRIORITIES = [
  { key: "P1_CRITICAL", label: "Critical" },
  { key: "P2_HIGH", label: "High" },
  { key: "P3_MEDIUM", label: "Medium" },
  { key: "P4_LOW", label: "Low" },
] as const;

// ── GET /api/sla/monitor ────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    // ── Authentication ──
    await requireAuth(request);

    const now = new Date();

    // ── 1. Total complaints count ──
    const totalComplaints = await db.complaint.count();

    // ── 2. Open complaints (not RESOLVED or CLOSED) ──
    const openComplaints = await db.complaint.count({
      where: {
        status: { notIn: ["RESOLVED", "CLOSED"] },
      },
    });

    // ── 3. Resolved complaints ──
    const resolvedComplaints = await db.complaint.findMany({
      where: {
        status: { in: ["RESOLVED", "CLOSED"] },
        resolvedAt: { not: null },
        slaDeadline: { not: null },
      },
      select: {
        id: true,
        resolvedAt: true,
        slaDeadline: true,
        createdAt: true,
        priority: true,
      },
    });

    // ── 4. Open complaints with SLA deadline info (for breach detection) ──
    const openWithDeadline = await db.complaint.findMany({
      where: {
        status: { notIn: ["RESOLVED", "CLOSED"] },
        slaDeadline: { not: null },
      },
      select: {
        id: true,
        slaDeadline: true,
        createdAt: true,
        priority: true,
      },
    });

    // ── 5. Calculate breach counts and compliance ──
    let totalBreached = 0;
    let totalResolvedOnTime = 0;
    let totalResolutionMs = 0;

    // Track per-priority metrics
    const priorityStats: Record<string, { open: number; breached: number; total: number; resolvedOnTime: number; totalResolutionMs: number }> = {};
    for (const p of PRIORITIES) {
      priorityStats[p.key] = { open: 0, breached: 0, total: 0, resolvedOnTime: 0, totalResolutionMs: 0 };
    }

    // Check open complaints for SLA breaches
    for (const c of openWithDeadline) {
      const deadline = new Date(c.slaDeadline!);
      if (now > deadline) {
        totalBreached++;
        if (priorityStats[c.priority]) {
          priorityStats[c.priority].breached++;
        }
      }
      if (priorityStats[c.priority]) {
        priorityStats[c.priority].open++;
      }
    }

    // Check resolved complaints for SLA compliance
    for (const c of resolvedComplaints) {
      const resolutionTime = new Date(c.resolvedAt!).getTime();
      const deadlineTime = new Date(c.slaDeadline!).getTime();
      const createdTime = new Date(c.createdAt).getTime();
      // Guard against negative resolution times (e.g., resolvedAt < createdAt in seed data)
      const resolutionMs = Math.max(0, resolutionTime - createdTime);
      totalResolutionMs += resolutionMs;

      if (priorityStats[c.priority]) {
        priorityStats[c.priority].total++;
        priorityStats[c.priority].totalResolutionMs += resolutionMs;
      }

      if (resolutionTime <= deadlineTime) {
        totalResolvedOnTime++;
        if (priorityStats[c.priority]) {
          priorityStats[c.priority].resolvedOnTime++;
        }
      } else {
        totalBreached++;
        if (priorityStats[c.priority]) {
          priorityStats[c.priority].breached++;
        }
      }
    }

    // ── 6. Calculate overall compliance rate ──
    const totalClosedWithDeadline = resolvedComplaints.length;
    const overallComplianceRate =
      totalClosedWithDeadline > 0
        ? Math.round((totalResolvedOnTime / totalClosedWithDeadline) * 10000) / 100
        : 100;

    // ── 7. Average resolution time (clamped to non-negative) ──
    const avgResolutionTimeHours =
      resolvedComplaints.length > 0
        ? Math.max(0, Math.round((totalResolutionMs / resolvedComplaints.length / (1000 * 60 * 60)) * 10) / 10)
        : 0;

    // ── 8. Build priority breakdown ──
    const priorities: PriorityMetrics[] = PRIORITIES.map((p) => {
      const stats = priorityStats[p.key];
      const total = stats.total + stats.open;
      // Compliance = resolvedOnTime / (resolvedOnTime + breached) so that
      // a priority with 0 resolved but N breached complaints shows 0% instead of 100%.
      const denominator = stats.resolvedOnTime + stats.breached;
      const complianceRate =
        denominator > 0
          ? Math.round((stats.resolvedOnTime / denominator) * 10000) / 100
          : 100;
      return {
        priority: p.key,
        label: p.label,
        open: stats.open,
        breached: stats.breached,
        total,
        resolvedOnTime: stats.resolvedOnTime,
        complianceRate,
      };
    });

    // ── 9. Build response ──
    const response: SlaMonitorResponse = {
      overallComplianceRate,
      totalComplaints,
      openComplaints,
      breachedCount: totalBreached,
      resolvedOnTimeCount: totalResolvedOnTime,
      avgResolutionTimeHours,
      priorities,
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
    console.error("SLA monitor check failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch SLA metrics" },
      { status: 500, headers: corsHeaders }
    );
  }
}
