// GET /api/reports/lifecycle — Subscriber Lifecycle report (Task 2-a)
// Params: from,to (YYYY-MM-DD, default last 30 days) | areaId | planId | format=csv
// Sections: summary (status mix + activations/disconnections/net growth),
// byArea, byPlan, events (latest 500 AuditLog rows for entity="Subscriber").
//
// Lifecycle event mapping — data reality (verified by live DB query during build):
// AuditLog currently holds ZERO rows with entity="Subscriber" (only entity="Auth").
// The vocabulary below is therefore taken from the audit-service AuditAction union
// (src/lib/services/audit-service.ts:51) and the actual write call-sites:
//   auditCreate→CREATE, auditUpdate→UPDATE, auditBulk→BULK_*, auditStatusChange→
//   STATUS_CHANGE, churn-alerts→CHURN_ACTION. STATUS_CHANGE/UPDATE rows are refined
//   per-row by inspecting the status transition inside details/previousValues JSON
//   (auditLog stores details=JSON.stringify(details||{}); previousValues is either
//   JSON.stringify(prev) or a computed diff {field:{old,new}}, or "null").
// Fallback for any unknown action: "UPDATED".

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { xlsxResponse } from "@/lib/xlsx-export";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/api-auth";
import { csvResponse, generateExportFilename } from "@/lib/export-utils";
import { pdfResponse } from "@/lib/pdf-export";
import { auditExport } from "@/lib/services/audit-service";

const MAX_AUDIT_ROWS = 2000; // scan cap for disconnection counting (documented limitation)
const EVENT_LIMIT = 500;
const DETAILS_TRUNCATE = 200;

type LifecycleEvent =
  | "ACTIVATED"
  | "SUSPENDED"
  | "REACTIVATED"
  | "DISCONNECTED"
  | "CREATED"
  | "UPDATED";

type SubscriberStatusKey =
  | "ACTIVE"
  | "SUSPENDED"
  | "DISCONNECTED"
  | "TRIAL"
  | "PENDING_ACTIVATION";

const ACTION_EVENT_MAP: Record<string, LifecycleEvent> = {
  CREATE: "CREATED",
  BULK_CREATE: "CREATED",
  IMPORT: "CREATED",
  UPDATE: "UPDATED",
  BULK_UPDATE: "UPDATED",
  PLAN_CHANGE: "UPDATED",
  CHURN_ACTION: "UPDATED",
  STATUS_CHANGE: "UPDATED", // refined per-row via status transition below
  // Deletion implies service end: the subscribers API refuses to delete ACTIVE
  // subscribers (financial-history guard), so DELETE ⇒ connection already over.
  DELETE: "DISCONNECTED",
  BULK_DELETE: "DISCONNECTED",
};

// ── Helpers ────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Validate a YYYY-MM-DD string → Date at local midnight, else null. */
function parseYmd(s: string | null): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** Truncate a stringified details blob to N chars. */
function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 3)}...` : s;
}

/** Extract {oldStatus,newStatus} from stored audit JSON (handles prev-object and diff shapes). */
function extractStatusPair(
  detailsRaw: string | null,
  previousRaw: string | null
): { oldStatus?: string; newStatus?: string } {
  let oldStatus: string | undefined;
  let newStatus: string | undefined;
  try {
    if (detailsRaw && detailsRaw !== "null") {
      const d = JSON.parse(detailsRaw) as Record<string, unknown>;
      const s = d?.status;
      if (typeof s === "string") newStatus = s;
      else if (s && typeof s === "object" && "new" in (s as Record<string, unknown>)) {
        newStatus = String((s as Record<string, unknown>).new);
      }
    }
  } catch {
    /* malformed details — ignore */
  }
  try {
    if (previousRaw && previousRaw !== "null") {
      const p = JSON.parse(previousRaw) as Record<string, unknown>;
      const s = p?.status;
      if (typeof s === "string") oldStatus = s;
      else if (s && typeof s === "object" && "old" in (s as Record<string, unknown>)) {
        oldStatus = String((s as Record<string, unknown>).old);
      }
    }
  } catch {
    /* malformed previousValues — ignore */
  }
  return { oldStatus, newStatus };
}

/** Map an AuditLog row to a lifecycle event, refining status transitions when possible. */
function mapEvent(row: { action: string; details: string | null; previousValues: string | null }): LifecycleEvent {
  const base = ACTION_EVENT_MAP[row.action] ?? "UPDATED";
  const { oldStatus, newStatus } = extractStatusPair(row.details, row.previousValues);
  if (!newStatus) return base;
  if (newStatus === "ACTIVE") {
    return oldStatus === "SUSPENDED" || oldStatus === "DISCONNECTED" ? "REACTIVATED" : "ACTIVATED";
  }
  if (newStatus === "SUSPENDED") return "SUSPENDED";
  if (newStatus === "DISCONNECTED") return "DISCONNECTED";
  return base;
}

// ── GET ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { userId } = await requireAuth(request);

    const { searchParams } = new URL(request.url);
    const now = new Date();

    // Range — default last 30 days
    const from =
      parseYmd(searchParams.get("from")) ??
      new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
    const to = endOfDay(parseYmd(searchParams.get("to")) ?? now);

    const areaId = searchParams.get("areaId") || "";
    const planId = searchParams.get("planId") || "";
    const hasSubFilter = Boolean(areaId || planId);

    const subWhere: Prisma.SubscriberWhereInput = {};
    if (areaId) subWhere.areaId = areaId;
    if (planId) subWhere.planId = planId;

    // ── Summary: status mix + activation counts ─────────────────────
    const rangeActivationWhere: Prisma.SubscriberWhereInput = {
      ...subWhere,
      activationDate: { gte: from, lte: to },
    };

    const [statusGroups, totalSubscribers, activations] = await Promise.all([
      db.subscriber.groupBy({ by: ["status"], _count: { _all: true }, where: subWhere }),
      db.subscriber.count({ where: subWhere }),
      db.subscriber.count({ where: rangeActivationWhere }),
    ]);

    const statusCounts: Record<string, number> = {};
    for (const g of statusGroups) statusCounts[g.status as SubscriberStatusKey] = g._count._all;

    // ── AuditLog events for entity="Subscriber" ─────────────────────
    let auditWhere: Prisma.AuditLogWhereInput = {
      entity: "Subscriber",
      timestamp: { gte: from, lte: to },
    };
    if (hasSubFilter) {
      // AuditLog has no areaId/planId — restrict via matching subscriber ids (entityId)
      const matching = await db.subscriber.findMany({ where: subWhere, select: { id: true } });
      auditWhere = { ...auditWhere, entityId: { in: matching.map((s) => s.id) } };
    }

    const auditRows = await db.auditLog.findMany({
      where: auditWhere,
      orderBy: { timestamp: "desc" },
      take: MAX_AUDIT_ROWS,
    });

    // NOTE: disconnection counts reflect at most the latest MAX_AUDIT_ROWS rows
    // in the range — adequate today (table holds no Subscriber rows yet) and
    // documented here so the cap is not mistaken for an exact DB-side aggregate.
    const mappedEvents = auditRows.map((row) => ({
      timestamp: row.timestamp,
      action: row.action,
      event: mapEvent(row),
      entityId: row.entityId,
      userName: row.userName || "System",
      details: truncate(String(row.details ?? ""), DETAILS_TRUNCATE),
    }));

    const disconnections = mappedEvents.filter((e) => e.event === "DISCONNECTED").length;

    const summary = {
      totalSubscribers,
      statusCounts,
      activations,
      disconnections,
      netGrowth: activations - disconnections,
      range: { from: `${from.toISOString().slice(0, 10)}T00:00:00`, to: to.toISOString() },
    };

    // ── byArea: activations grouped by area ─────────────────────────
    const areaGroups = await db.subscriber.groupBy({
      by: ["areaId"],
      _count: { _all: true },
      where: rangeActivationWhere,
    });
    const areaIds = areaGroups.map((g) => g.areaId).filter((id): id is string => Boolean(id));
    const areaRows = areaIds.length
      ? await db.area.findMany({ where: { id: { in: areaIds } }, select: { id: true, name: true } })
      : [];
    const areaNameMap = new Map(areaRows.map((a) => [a.id, a.name]));
    const byArea = areaGroups
      .map((g) => ({
        areaId: g.areaId,
        area: g.areaId ? areaNameMap.get(g.areaId) ?? "Unknown" : "Unassigned",
        activations: g._count._all,
      }))
      .sort((a, b) => b.activations - a.activations);

    // ── byPlan: activations grouped by plan ─────────────────────────
    const planGroups = await db.subscriber.groupBy({
      by: ["planId"],
      _count: { _all: true },
      where: rangeActivationWhere,
    });
    const planIds = planGroups.map((g) => g.planId).filter((id): id is string => Boolean(id));
    const planRows = planIds.length
      ? await db.plan.findMany({ where: { id: { in: planIds } }, select: { id: true, name: true } })
      : [];
    const planNameMap = new Map(planRows.map((p) => [p.id, p.name]));
    const byPlan = planGroups
      .map((g) => ({
        planId: g.planId,
        plan: g.planId ? planNameMap.get(g.planId) ?? "Unknown" : "No Plan",
        activations: g._count._all,
      }))
      .sort((a, b) => b.activations - a.activations);

    // ── events: latest 500, resolved to subscriber context ──────────
    const latest = mappedEvents.slice(0, EVENT_LIMIT);
    const eventSubIds = [...new Set(latest.map((e) => e.entityId))];
    const eventSubs = eventSubIds.length
      ? await db.subscriber.findMany({
          where: { id: { in: eventSubIds } },
          select: {
            id: true,
            code: true,
            name: true,
            Area: { select: { name: true } },
            Plan: { select: { name: true } },
          },
        })
      : [];
    const subMap = new Map(eventSubs.map((s) => [s.id, s]));

    const events = latest.map((e) => {
      const sub = subMap.get(e.entityId);
      return {
        subscriberId: sub?.id ?? null,
        timestamp: new Date(e.timestamp).toISOString(),
        action: e.action,
        event: e.event,
        subscriberCode: sub?.code ?? "",
        subscriberName: sub?.name ?? "",
        area: sub?.Area?.name ?? "",
        plan: sub?.Plan?.name ?? "",
        userName: e.userName,
        details: e.details,
      };
    });

    // ── CSV / XLSX / PDF export branch (events) ───────────────────
    const format = (searchParams.get("format") || "").toLowerCase();
    if (format === "csv" || format === "xlsx" || format === "pdf") {
      const headers = [
        "Timestamp",
        "Event",
        "Action",
        "Subscriber Code",
        "Subscriber Name",
        "Area",
        "Plan",
        "Performed By",
        "Details",
      ];
      const rows = events.map((e) => [
        e.timestamp,
        e.event,
        e.action,
        e.subscriberCode,
        e.subscriberName,
        e.area,
        e.plan,
        e.userName,
        e.details,
      ]);
      await auditExport(request, "Subscriber", format, rows.length);
      const filename = generateExportFilename("subscriber-lifecycle", format);
      if (format === "pdf") {
        return pdfResponse(headers, rows, filename, {
          title: "Subscriber Lifecycle Report",
          subtitle: `Period ${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)} · ${events.length} events`,
        });
      }
      if (format === "xlsx") {
        return xlsxResponse(headers, rows, filename);
      }
      return csvResponse(headers, rows, filename);
    }

    return NextResponse.json({
      success: true,
      data: { summary, byArea, byPlan, events },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("lifecycle report failed:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to build lifecycle report" },
      { status: 500 }
    );
  }
}
