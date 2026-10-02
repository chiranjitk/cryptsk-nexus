// Reports Phase 3 (RPT-P3-A) — Report Snapshot Engine
//
// Captures point-in-time snapshots of snapshotable reports into the
// ReportSnapshot table. The engine invokes each report's route handler
// IN-PROCESS (no HTTP hop) under a short-lived internal admin session,
// then stores a light summary + row payload keyed idempotently by
// (reportKey, frequency, periodKey).
//
// Guarantees:
//  - Idempotent: generating the same (report, frequency, period) twice
//    returns the existing row with duplicate=true (FAILED rows are the
//    one exception — they are retryable and overwritten on re-run).
//  - Never crashes the scheduler: every failure is recorded as a FAILED
//    snapshot row and returned, never rethrown.
//  - Service session hygiene: the internal admin session minted for the
//    in-process call is always revoked in a finally block.

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { createSessionToken, verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/session";
import { recordUserSession, revokeSessionByToken } from "@/lib/session-store";

// ── Types ──────────────────────────────────────────────────────────

export type SnapshotFrequency = "DAILY" | "WEEKLY" | "MONTHLY";
export const SNAPSHOT_FREQUENCIES: SnapshotFrequency[] = ["DAILY", "WEEKLY", "MONTHLY"];

export type ReportKey =
  | "invoice-register"
  | "ar-aging"
  | "collection-register"
  | "expiry-renewal"
  | "side-revenue"
  | "plan-area-mis";

export interface SnapshotCatalogEntry {
  key: ReportKey;
  label: string;
  description: string;
  /** Query params for the report route's GET (default-period params). */
  buildParams: (now: Date) => URLSearchParams;
}

type RouteModule = { GET: (request: NextRequest) => Promise<Response> };

// ── Constants ──────────────────────────────────────────────────────

/** Safe cap for payloadJson (~4MB) — rows are sliced when exceeded. */
const MAX_PAYLOAD_BYTES = 4 * 1024 * 1024;
/** Candidate row-count slices when the payload exceeds the cap. */
const PAYLOAD_SLICES = [2000, 1000, 500, 250, 100];
const DAY_MS = 86_400_000;
/** UTC hour gate — snapshots only run at/after 01:00 UTC (≥ 06:30 IST). */
const MIN_UTC_HOUR = 1;

// ── Catalog ────────────────────────────────────────────────────────

/** Local YYYY-MM-DD (matches the ymd() helpers inside each report route). */
function localYmd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function firstOfMonth(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/**
 * Static loader map — statically analyzable dynamic imports so the bundler
 * keeps every route module reachable (a fully dynamic template-literal
 * import would fail to resolve under Turbopack/webpack).
 */
const ROUTE_LOADERS: Record<ReportKey, () => Promise<RouteModule>> = {
  "invoice-register": () => import("@/app/api/reports/invoice-register/route"),
  "ar-aging": () => import("@/app/api/reports/ar-aging/route"),
  "collection-register": () => import("@/app/api/reports/collection-register/route"),
  "expiry-renewal": () => import("@/app/api/reports/expiry-renewal/route"),
  "side-revenue": () => import("@/app/api/reports/side-revenue/route"),
  "plan-area-mis": () => import("@/app/api/reports/plan-area-mis/route"),
};

const CATALOG: SnapshotCatalogEntry[] = [
  {
    key: "invoice-register",
    label: "Invoice Register",
    description: "Month-to-date invoice book with GST split",
    buildParams: (now) => {
      const p = new URLSearchParams();
      p.set("from", localYmd(firstOfMonth(now)));
      p.set("to", localYmd(now));
      return p;
    },
  },
  {
    key: "ar-aging",
    label: "AR Aging",
    description: "Open-invoice aging buckets as of today",
    buildParams: (now) => {
      const p = new URLSearchParams();
      p.set("asOf", localYmd(now));
      return p;
    },
  },
  {
    key: "collection-register",
    label: "Collection Register",
    description: "Month-to-date collections with mode split",
    buildParams: (now) => {
      const p = new URLSearchParams();
      p.set("from", localYmd(firstOfMonth(now)));
      p.set("to", localYmd(now));
      return p;
    },
  },
  {
    key: "expiry-renewal",
    label: "Expiry & Renewal",
    description: "Subscribers expiring within the next 30 days",
    buildParams: () => {
      const p = new URLSearchParams();
      p.set("withinDays", "30");
      return p;
    },
  },
  {
    key: "side-revenue",
    label: "Side Revenue",
    description: "Top-ups, vouchers and add-ons over the last 30 days",
    buildParams: (now) => {
      const p = new URLSearchParams();
      p.set("from", localYmd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30)));
      p.set("to", localYmd(now));
      return p;
    },
  },
  {
    key: "plan-area-mis",
    label: "Plan & Area MIS",
    description: "Month-to-date plan and area performance MIS",
    buildParams: (now) => {
      const p = new URLSearchParams();
      p.set("from", localYmd(firstOfMonth(now)));
      p.set("to", localYmd(now));
      return p;
    },
  },
];

export function getCatalog(): SnapshotCatalogEntry[] {
  return CATALOG;
}

export function getCatalogEntry(reportKey: string): SnapshotCatalogEntry | undefined {
  return CATALOG.find((c) => c.key === reportKey);
}

// ── Period keys (UTC) ──────────────────────────────────────────────

/** ISO-8601 week key: YYYY-Www (UTC). */
function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7; // Sunday → 7 (ISO week runs Mon..Sun)
  date.setUTCDate(date.getUTCDate() + 4 - dayNum); // Thursday of this ISO week
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

export function periodKeyFor(frequency: SnapshotFrequency, now: Date): string {
  switch (frequency) {
    case "DAILY":
      return now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
    case "WEEKLY":
      return isoWeekKey(now); // YYYY-Www
    case "MONTHLY":
      return now.toISOString().slice(0, 7); // YYYY-MM
  }
}

// ── Payload helpers ────────────────────────────────────────────────

/** Shrink a payload object until its JSON fits MAX_PAYLOAD_BYTES. */
function fitPayload(payload: Record<string, unknown>): string {
  const candidates: Record<string, unknown>[] = [payload];
  const rowCount = Array.isArray(payload.rows) ? payload.rows.length : 0;
  for (const slice of PAYLOAD_SLICES) {
    if (rowCount <= slice) break;
    const shrunk: Record<string, unknown> = { ...payload, rows: payload.rows.slice(0, slice) };
    if (Array.isArray(payload.byArea) && payload.byArea.length > 500) {
      shrunk.byArea = payload.byArea.slice(0, 500);
    }
    candidates.push(shrunk);
  }
  for (const candidate of candidates) {
    const json = JSON.stringify(candidate);
    if (json.length <= MAX_PAYLOAD_BYTES) return json;
  }
  return JSON.stringify({ ...candidates[candidates.length - 1], rows: [] });
}

// ── Internal service session ───────────────────────────────────────

async function findServiceAdmin(): Promise<{ id: string; email: string }> {
  // Role is the UserRole enum — the platform's admin may hold either ADMIN or
  // SUPER_ADMIN (the seed uses SUPER_ADMIN), so match both, oldest first.
  const admin = await db.user.findFirst({
    where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });
  if (admin) return admin;
  // Fallback: seed admin email
  const byEmail = await db.user.findUnique({
    where: { email: "admin@cryptsk.com" },
    select: { id: true, email: true },
  });
  if (byEmail) return byEmail;
  throw new Error("No admin user found for the snapshot service session");
}

// ── Snapshot generation ────────────────────────────────────────────

export interface GenerateSnapshotResult {
  snapshot: {
    id: string;
    reportKey: string;
    label: string;
    frequency: string;
    periodKey: string;
    rowCount: number;
    status: string;
    error: string | null;
    summary: Record<string, unknown>;
    generatedBy: string;
    createdAt: Date;
  };
  duplicate: boolean;
}

/**
 * Generate (or return the existing) snapshot for (reportKey, frequency, periodKey).
 * Idempotent: an existing OK/EMPTY row short-circuits with duplicate=true.
 * FAILED rows are retryable — a re-run overwrites them.
 */
export async function generateSnapshot(
  reportKey: string,
  frequency: SnapshotFrequency,
  opts?: { generatedBy?: string; now?: Date }
): Promise<GenerateSnapshotResult> {
  const entry = getCatalogEntry(reportKey);
  if (!entry) throw new Error(`Unknown report key: ${reportKey}`);
  if (!SNAPSHOT_FREQUENCIES.includes(frequency)) {
    throw new Error(`Invalid frequency: ${frequency}`);
  }

  const now = opts?.now ?? new Date();
  const periodKey = periodKeyFor(frequency, now);
  const generatedBy = opts?.generatedBy || "system";
  const unique = { reportKey, frequency, periodKey };

  const shapeSnapshot = (row: {
    id: string;
    reportKey: string;
    label: string;
    frequency: string;
    periodKey: string;
    rowCount: number;
    status: string;
    error: string | null;
    summaryJson: string;
    generatedBy: string;
    createdAt: Date;
  }) => {
    let summary: Record<string, unknown> = {};
    try {
      summary = JSON.parse(row.summaryJson || "{}");
    } catch {
      summary = {};
    }
    return {
      id: row.id,
      reportKey: row.reportKey,
      label: row.label,
      frequency: row.frequency,
      periodKey: row.periodKey,
      rowCount: row.rowCount,
      status: row.status,
      error: row.error,
      summary,
      generatedBy: row.generatedBy,
      createdAt: row.createdAt,
    };
  };

  try {
    // 1. Idempotency check — OK/EMPTY rows are final; FAILED rows retry.
    const existing = await db.reportSnapshot.findUnique({ where: { reportKey_frequency_periodKey: unique } });
    if (existing && existing.status !== "FAILED") {
      return { snapshot: shapeSnapshot(existing), duplicate: true };
    }

    // 2. Mint a short-lived internal service session for the in-process call.
    const admin = await findServiceAdmin();
    const token = await createSessionToken(admin.id);
    await recordUserSession({
      userId: admin.id,
      token,
      ipAddress: "127.0.0.1",
      userAgent: "ReportSnapshotEngine/1.0 (internal)",
    });

    try {
      // Verify the token round-trips before invoking the route (defense in depth).
      const verified = await verifySessionToken(token);
      if (!verified) throw new Error("Internal service session failed verification");

      // 3. Invoke the route handler IN-PROCESS (no HTTP hop).
      const { GET } = await ROUTE_LOADERS[entry.key]();
      const url = new URL(`http://internal.local/api/reports/${reportKey}?${entry.buildParams(now).toString()}`);
      const request = new NextRequest(url, {
        headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      });
      const res = await GET(request);

      // 4. Parse the envelope.
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        data?: Record<string, unknown>;
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Report route returned status ${res.status}`);
      }
      const data = json.data ?? {};

      // plan-area-mis is dual-dimension: byPlan + byArea; everything else: rows.
      const payload: Record<string, unknown> =
        reportKey === "plan-area-mis"
          ? { rows: data.byPlan ?? [], byArea: data.byArea ?? [] }
          : { rows: data.rows ?? [] };
      const rows = payload.rows as unknown[];
      const summary = (data.summary ?? {}) as Record<string, unknown>;
      const rowCount = Array.isArray(rows) ? rows.length : 0;
      const status = rowCount > 0 ? "OK" : "EMPTY";

      // 5. Upsert the snapshot row.
      const snapshot = await db.reportSnapshot.upsert({
        where: { reportKey_frequency_periodKey: unique },
        create: {
          ...unique,
          label: entry.label,
          rowCount,
          status,
          error: null,
          paramsJson: JSON.stringify(Object.fromEntries(entry.buildParams(now))),
          summaryJson: JSON.stringify(summary),
          payloadJson: fitPayload(payload),
          generatedBy,
        },
        update: {
          label: entry.label,
          rowCount,
          status,
          error: null,
          paramsJson: JSON.stringify(Object.fromEntries(entry.buildParams(now))),
          summaryJson: JSON.stringify(summary),
          payloadJson: fitPayload(payload),
          generatedBy,
        },
      });
      return { snapshot: shapeSnapshot(snapshot), duplicate: false };
    } finally {
      // Always revoke the service session, success or failure.
      await revokeSessionByToken(token);
    }
  } catch (error) {
    // The engine must never crash the scheduler — record FAILED and return.
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    console.error(`[snapshots] generateSnapshot(${reportKey}, ${frequency}, ${periodKey}) failed:`, error);
    try {
      const failed = await db.reportSnapshot.upsert({
        where: { reportKey_frequency_periodKey: unique },
        create: {
          ...unique,
          label: entry.label,
          rowCount: 0,
          status: "FAILED",
          error: message,
          paramsJson: JSON.stringify(Object.fromEntries(entry.buildParams(now))),
          summaryJson: "{}",
          payloadJson: "{}",
          generatedBy,
        },
        update: {
          label: entry.label,
          rowCount: 0,
          status: "FAILED",
          error: message,
          generatedBy,
        },
      });
      return { snapshot: shapeSnapshot(failed), duplicate: false };
    } catch (dbError) {
      console.error("[snapshots] FAILED-row upsert also failed:", dbError);
      throw dbError instanceof Error ? dbError : new Error(String(dbError));
    }
  }
}

// ── Scheduler ──────────────────────────────────────────────────────

export interface RunDueResult {
  generated: string[];
  skipped: number;
  failed: string[];
}

/**
 * Run every due snapshot. Due = UTC hour >= 1 (≥ 06:30 IST) AND:
 *   DAILY  → every day
 *   WEEKLY → UTC day-of-week === 1 (Monday)
 *   MONTHLY→ UTC date === 1
 * Re-entrancy is guarded by a global in-flight flag.
 */
export async function runDueSnapshots(now: Date = new Date()): Promise<RunDueResult> {
  const g = globalThis as { __snapEngineRunning?: boolean };
  if (g.__snapEngineRunning) {
    return { generated: [], skipped: 0, failed: [] };
  }
  g.__snapEngineRunning = true;

  const result: RunDueResult = { generated: [], skipped: 0, failed: [] };
  try {
    const utcHour = now.getUTCHours();
    if (utcHour < MIN_UTC_HOUR) return result;

    const utcDay = now.getUTCDay(); // 0=Sun .. 6=Sat
    const utcDate = now.getUTCDate();

    for (const entry of CATALOG) {
      for (const frequency of SNAPSHOT_FREQUENCIES) {
        const due =
          frequency === "DAILY"
            ? true
            : frequency === "WEEKLY"
              ? utcDay === 1
              : utcDate === 1;
        if (!due) continue;

        try {
          const periodKey = periodKeyFor(frequency, now);
          const existing = await db.reportSnapshot.findUnique({
            where: { reportKey_frequency_periodKey: { reportKey: entry.key, frequency, periodKey } },
            select: { id: true, status: true },
          });
          if (existing && existing.status !== "FAILED") {
            result.skipped += 1;
            continue;
          }
          const { snapshot, duplicate } = await generateSnapshot(entry.key, frequency, { now });
          if (snapshot.status === "FAILED") {
            result.failed.push(`${entry.key}:${frequency}`);
          } else if (!duplicate) {
            result.generated.push(`${entry.key}:${frequency}`);
          } else {
            result.skipped += 1;
          }
        } catch (error) {
          console.error(`[snapshots] run ${entry.key}/${frequency} crashed:`, error);
          result.failed.push(`${entry.key}:${frequency}`);
        }
      }
    }
    if (result.generated.length || result.failed.length) {
      console.log(
        `[snapshots] runDueSnapshots: generated=${result.generated.join(",") || "none"} skipped=${result.skipped} failed=${result.failed.join(",") || "none"}`
      );
    }
    return result;
  } finally {
    g.__snapEngineRunning = false;
  }
}

// ── UI helpers ─────────────────────────────────────────────────────

/**
 * For the UI: which (report, frequency) combos are DUE right now and do not
 * yet have a non-FAILED snapshot row for the current period.
 */
export async function snapshotDueMap(
  now: Date = new Date()
): Promise<Record<string, Record<SnapshotFrequency, boolean>>> {
  const keys = CATALOG.map((c) => c.key);
  const rows = await db.reportSnapshot.findMany({
    where: { reportKey: { in: keys } },
    select: { reportKey: true, frequency: true, periodKey: true, status: true },
  });
  const existing = new Set(
    rows.filter((r) => r.status !== "FAILED").map((r) => `${r.reportKey}:${r.frequency}:${r.periodKey}`)
  );

  const utcHour = now.getUTCHours();
  const utcDay = now.getUTCDay();
  const utcDate = now.getUTCDate();

  const map: Record<string, Record<SnapshotFrequency, boolean>> = {};
  for (const entry of CATALOG) {
    const perFreq = {} as Record<SnapshotFrequency, boolean>;
    for (const frequency of SNAPSHOT_FREQUENCIES) {
      const due =
        utcHour >= MIN_UTC_HOUR &&
        (frequency === "DAILY"
          ? true
          : frequency === "WEEKLY"
            ? utcDay === 1
            : utcDate === 1);
      perFreq[frequency] = due && !existing.has(`${entry.key}:${frequency}:${periodKeyFor(frequency, now)}`);
    }
    map[entry.key] = perFreq;
  }
  return map;
}
