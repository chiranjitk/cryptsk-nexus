// GET/POST/DELETE /api/reports/snapshots — Report snapshot management (Phase 3, RPT-P3-A)
//
// GET    → list snapshots (light fields only — payloadJson EXCLUDED) + catalog + due map.
//          Params: reportKey? | frequency? | status? | take (default 100, cap 500)
// POST   → generate a snapshot on demand: body { reportKey, frequency? (default DAILY) }.
//          Idempotent per (reportKey, frequency, periodKey) — returns duplicate=true
//          when the snapshot already exists for the current period.
// DELETE → ?id= required; removes a stored snapshot.
//
// All handlers are requireAuth-first with the standard AuthError envelope.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { auditLog } from "@/lib/services/audit-service";
import {
  getCatalog,
  generateSnapshot,
  snapshotDueMap,
  SNAPSHOT_FREQUENCIES,
  type SnapshotFrequency,
} from "@/lib/report-snapshot-engine";

// ── Helpers ────────────────────────────────────────────────────────

function parseJsonSafe(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Light row shape — payloadJson deliberately excluded (can be megabytes). */
function toLight(row: {
  id: string;
  reportKey: string;
  label: string;
  frequency: string;
  periodKey: string;
  rowCount: number;
  status: string;
  error: string | null;
  paramsJson: string;
  summaryJson: string;
  generatedBy: string;
  createdAt: Date;
}) {
  return {
    id: row.id,
    reportKey: row.reportKey,
    label: row.label,
    frequency: row.frequency,
    periodKey: row.periodKey,
    rowCount: row.rowCount,
    status: row.status,
    error: row.error,
    params: parseJsonSafe(row.paramsJson),
    summary: parseJsonSafe(row.summaryJson),
    generatedBy: row.generatedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

// ── GET ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const reportKey = (searchParams.get("reportKey") || "").trim();
    const frequency = (searchParams.get("frequency") || "").trim().toUpperCase();
    const status = (searchParams.get("status") || "").trim().toUpperCase();

    const takeRaw = parseInt(searchParams.get("take") || "100", 10);
    const take = Number.isFinite(takeRaw) ? Math.min(Math.max(takeRaw, 1), 500) : 100;

    const rows = await db.reportSnapshot.findMany({
      where: {
        ...(reportKey ? { reportKey } : {}),
        ...(frequency ? { frequency } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        reportKey: true,
        label: true,
        frequency: true,
        periodKey: true,
        rowCount: true,
        status: true,
        error: true,
        paramsJson: true,
        summaryJson: true,
        generatedBy: true,
        createdAt: true,
      },
    });

    const catalog = getCatalog().map((c) => ({
      key: c.key,
      label: c.label,
      description: c.description,
      frequencies: SNAPSHOT_FREQUENCIES,
    }));

    const due = await snapshotDueMap();

    return NextResponse.json({
      success: true,
      data: { snapshots: rows.map(toLight), catalog, due },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("report-snapshots list failed:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to list report snapshots" },
      { status: 500 }
    );
  }
}

// ── POST ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);

    let body: { reportKey?: string; frequency?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Request body must be JSON: { reportKey, frequency? }" },
        { status: 400 }
      );
    }

    const reportKey = (body.reportKey || "").trim();
    const frequency = ((body.frequency || "DAILY") as string).trim().toUpperCase() as SnapshotFrequency;

    const catalogEntry = getCatalog().find((c) => c.key === reportKey);
    if (!catalogEntry) {
      return NextResponse.json(
        {
          success: false,
          error: `Unknown reportKey "${reportKey}". Valid keys: ${getCatalog().map((c) => c.key).join(", ")}`,
        },
        { status: 400 }
      );
    }
    if (!SNAPSHOT_FREQUENCIES.includes(frequency)) {
      return NextResponse.json(
        { success: false, error: `Invalid frequency "${frequency}". Valid: ${SNAPSHOT_FREQUENCIES.join(", ")}` },
        { status: 400 }
      );
    }

    const { snapshot, duplicate } = await generateSnapshot(reportKey, frequency, {
      generatedBy: "manual",
    });

    // Audit trail — action SNAPSHOT_RUN on entity Report (actor = caller).
    await auditLog(request, "SNAPSHOT_RUN", "Report", reportKey, {
      userId,
      details: {
        frequency,
        duplicate,
        status: snapshot.status,
        rowCount: snapshot.rowCount,
        periodKey: snapshot.periodKey,
      },
    });

    return NextResponse.json({ success: true, data: { snapshot, duplicate } });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("report-snapshot generate failed:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to generate report snapshot" },
      { status: 500 }
    );
  }
}

// ── DELETE ─────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const id = (searchParams.get("id") || "").trim();
    if (!id) {
      return NextResponse.json(
        { success: false, error: "Query param 'id' is required" },
        { status: 400 }
      );
    }

    const existing = await db.reportSnapshot.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Snapshot not found" },
        { status: 404 }
      );
    }

    await db.reportSnapshot.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("report-snapshot delete failed:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to delete report snapshot" },
      { status: 500 }
    );
  }
}
