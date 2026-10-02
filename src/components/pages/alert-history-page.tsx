"use client";

// ═══════════════════════════════════════════════════════════════
// Alert History — audit-grade archive of acknowledged/resolved alerts.
//
//   GET /api/alerts/history   → paginated rows (search/severity/status/
//                               page/limit/dateFrom/dateTo server-side)
//   GET /api/alerts/analytics → 30d summary strip (resolved, MTTR, rate)
//   GET /api/alerts/export    → CSV blob of the current filter slice
//   POST /api/alerts          → get-comments / add-comment / resolve etc.
//                               via the shared AlertDetailDialog
//
// CONTRACT NOTES (verified against src/app/api/alerts/history/route.ts):
//  - There is NO `days` param; the route accepts ISO `dateFrom`/`dateTo`,
//    so the range Select maps 24h/7d/30d/90d to a computed `dateFrom`.
//  - History rows expose `triggeredAt` (creation), `device` (deviceId ||
//    source), `acknowledgedBy` (name only — NO acknowledgedAt timestamp)
//    and a numeric `duration` (minutes) for resolved rows.
//  - Severity/status arrive CAPITALIZED ("Critical"/"Resolved"); the
//    shared-kit badges normalize both, so no local sevBadge copies.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Archive, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Download,
  Gauge, History, Percent, RotateCcw, Search, SlidersHorizontal, Timer,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { apiFetch } from "@/lib/utils";
import {
  AlertDetailDialog, type AlertDetailData,
} from "@/components/pages/alert-center-page";
import {
  AsyncActionButton, EmptyState, EnabledSwitch, SeverityBadge, StatusBadge,
  SEVERITY_META, SEVERITY_ORDER, durationBetween, formatTimestamp, timeAgo,
} from "@/components/alerts/shared";

// ─── API payload types (verified against the history route) ─────

interface HistoryRow {
  id: string;
  severity: string;              // "Critical" | "High" | "Medium" | "Low"
  type: string;                  // rule name || title || "Custom"
  title: string;
  message: string;
  device: string;                // deviceId || source
  triggeredAt: string;           // ISO creation timestamp
  resolvedAt: string | null;
  resolution: string;
  acknowledgedBy: string;        // assignedTo?.name || acknowledgedBy
  status: string;                // "Active" | "Acknowledged" | "Resolved" | "Suppressed"
  duration: number | null;       // minutes, resolved rows only
  duplicateCount: number;
  escalationLevel: number;
  assignedTo: string | null;
}

interface HistoryPayload {
  history: HistoryRow[];
  total: number;
  page: number;
  totalPages: number;
}

interface Analytics {
  summary: {
    totalAlerts: number; resolvedCount: number; avgResolutionMin: number;
    medianResolutionMin: number; resolveRate: number;
  };
}

// ─── Filter option constants ────────────────────────────────────

const SEVERITY_OPTIONS = SEVERITY_ORDER.filter((s) => s !== "INFO");
const STATUS_OPTIONS = ["RESOLVED", "ACKNOWLEDGED", "ACTIVE", "SUPPRESSED"] as const;

const RANGE_OPTIONS = [
  { value: "all", label: "All time", ms: null as number | null },
  { value: "24h", label: "Last 24 hours", ms: 24 * 60 * 60 * 1000 },
  { value: "7d", label: "Last 7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { value: "30d", label: "Last 30 days", ms: 30 * 24 * 60 * 60 * 1000 },
  { value: "90d", label: "Last 90 days", ms: 90 * 24 * 60 * 60 * 1000 },
];

const LIMIT_OPTIONS = [25, 50, 100];

// ─── Local components ───────────────────────────────────────────

function ErrorStrip({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50/70 p-3 text-sm text-red-800 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-200"
    >
      <RotateCcw className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 break-words">{message}</span>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Retry
        </Button>
      )}
    </div>
  );
}

function StatCard({ label, value, tone = "default", icon, iconChip, hint, loading }: {
  label: string; value: string;
  tone?: "default" | "good" | "bad" | "warn";
  icon: ReactNode; iconChip: string; hint?: string; loading?: boolean;
}) {
  return (
    <Card className="border shadow-sm">
      <CardContent className="flex items-start gap-3 p-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconChip}`}>
          {icon}
        </div>
        {loading ? (
          <div className="flex-1 space-y-2 pt-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-2.5 w-28" />
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-0.5">
              <span className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                {label}
              </span>
              <span
                className={`text-sm font-semibold ${
                  tone === "good" ? "text-emerald-600 dark:text-emerald-400"
                    : tone === "bad" ? "text-red-600 dark:text-red-400"
                      : tone === "warn" ? "text-amber-600 dark:text-amber-400"
                        : "text-foreground"
                }`}
              >
                {value}
              </span>
            </div>
            {hint && <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{hint}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Map a history row into the shared detail-dialog data shape. */
function toDetailData(h: HistoryRow): AlertDetailData {
  return {
    id: h.id,
    title: h.title || h.type || "Untitled alert",
    message: h.message,
    severity: h.severity,
    status: h.status,
    source: h.device || undefined,
    device: h.device || undefined,
    ruleName: h.type || undefined,
    triggeredAt: h.triggeredAt,
    acknowledgedAt: null, // history payload carries no ack timestamp (see header note)
    acknowledgedBy: h.acknowledgedBy || h.assignedTo || null,
    assignedTo: h.assignedTo || null,
    resolvedAt: h.resolvedAt,
    resolution: h.resolution || null,
    duplicateCount: h.duplicateCount,
    escalationLevel: h.escalationLevel,
  };
}

// ═══════════════════════════════════════════════════════════════
// Page component
// ═══════════════════════════════════════════════════════════════

export function AlertHistoryPage() {
  // Filters
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState("all");
  const [status, setStatus] = useState("all");
  const [range, setRange] = useState("all");
  const [limit, setLimit] = useState(50);
  const [page, setPage] = useState(1);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Detail dialog
  const [detailAlert, setDetailAlert] = useState<AlertDetailData | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const hasActiveFilters = search !== "" || severity !== "all" || status !== "all" || range !== "all";

  // Debounce search input (350ms) and reset pagination on commit.
  useEffect(() => {
    const t = setTimeout(() => {
      const next = searchInput.trim();
      setSearch((prev) => {
        if (prev !== next) setPage(1);
        return next;
      });
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Server-side date window: history route takes ISO dateFrom/dateTo.
  const dateFrom = useMemo(() => {
    const opt = RANGE_OPTIONS.find((r) => r.value === range);
    if (!opt?.ms) return "";
    return new Date(Date.now() - opt.ms).toISOString();
  }, [range]);

  const rangeLabel = RANGE_OPTIONS.find((r) => r.value === range)?.label ?? "All time";

  // ── Queries ───────────────────────────────────────────────────
  const history = useQuery<HistoryPayload>({
    queryKey: ["alert-history", search, severity, status, page, limit, dateFrom],
    queryFn: () => {
      const params = new URLSearchParams({
        search,
        severity: severity === "all" ? "" : severity,
        status: status === "all" ? "" : status,
        page: String(page),
        limit: String(limit),
      });
      if (dateFrom) params.set("dateFrom", dateFrom);
      return apiFetch<HistoryPayload>(`/api/alerts/history?${params.toString()}`);
    },
    refetchInterval: autoRefresh ? 30000 : false,
  });

  // Fixed 30-day analytics window feeds the stat strip.
  const analytics = useQuery<Analytics>({
    queryKey: ["alert-history-analytics", 30],
    queryFn: () => apiFetch<Analytics>("/api/alerts/analytics?days=30"),
    refetchInterval: autoRefresh ? 30000 : false,
  });

  // ── Export CSV (blob download, mirrors integrations pages) ────
  async function exportCsv() {
    setExporting(true);
    toast.info("Preparing CSV export...");
    try {
      const params = new URLSearchParams({
        search,
        severity: severity === "all" ? "" : severity,
        status: status === "all" ? "" : status,
      });
      const res = await fetch(`/api/alerts/export?${params.toString()}`);
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const stamp = new Date().toISOString().slice(0, 10);
      const rangeTag = range === "all" ? "all-time" : range;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `alert-history-${rangeTag}-${stamp}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(`Export downloaded — ${rangeLabel.toLowerCase()} slice`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  // ── Derived ───────────────────────────────────────────────────
  const rows = history.data?.history ?? [];
  const total = history.data?.total ?? 0;
  const totalPages = Math.max(1, history.data?.totalPages ?? 1);
  const summary = analytics.data?.summary;
  const resolveRate = summary?.resolveRate ?? 0;
  const resolveRateTone = resolveRate >= 90 ? "good" : resolveRate >= 70 ? "default" : "warn";

  function openDetail(h: HistoryRow) {
    setDetailAlert(toDetailData(h));
    setDetailOpen(true);
  }

  function resetFilters() {
    setSearchInput("");
    setSearch("");
    setSeverity("all");
    setStatus("all");
    setRange("all");
    setPage(1);
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* ── Header row ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <History className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
            Alert History
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Audit-grade archive of every alert with its acknowledgement and resolution trail.
            {history.isLoading ? " Counting records..." : ` ${total.toLocaleString()} records in archive${range === "all" ? "" : ` (${rangeLabel.toLowerCase()})`}.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Auto-refresh</span>
            <EnabledSwitch
              checked={autoRefresh}
              onChange={(v) => setAutoRefresh(v)}
              ariaLabel="Toggle 30 second auto-refresh of the history table"
            />
          </div>
          <AsyncActionButton
            label="Export CSV"
            pendingLabel="Exporting..."
            pending={exporting}
            icon={<Download className="h-3.5 w-3.5" />}
            onClick={() => void exportCsv()}
            className="h-8"
          />
        </div>
      </div>

      {/* ── Stat strip (fixed 30d analytics window) ────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Resolved (30d)"
          value={String(summary?.resolvedCount ?? 0)}
          tone="good"
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />}
          iconChip="bg-emerald-100 dark:bg-emerald-950/40"
          hint={`${summary?.totalAlerts ?? 0} raised in the window`}
          loading={analytics.isLoading}
        />
        <StatCard
          label="Avg Resolution"
          value={`${summary?.avgResolutionMin ?? 0} min`}
          tone="warn"
          icon={<Timer className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden />}
          iconChip="bg-amber-100 dark:bg-amber-950/40"
          hint="mean time to resolve"
          loading={analytics.isLoading}
        />
        <StatCard
          label="Median Resolution"
          value={`${summary?.medianResolutionMin ?? 0} min`}
          icon={<Gauge className="h-5 w-5 text-sky-600 dark:text-sky-400" aria-hidden />}
          iconChip="bg-sky-100 dark:bg-sky-950/40"
          hint="50th percentile close time"
          loading={analytics.isLoading}
        />
        <StatCard
          label="Resolve Rate"
          value={`${resolveRate}%`}
          tone={resolveRateTone}
          icon={<Percent className="h-5 w-5 text-violet-600 dark:text-violet-400" aria-hidden />}
          iconChip="bg-violet-100 dark:bg-violet-950/40"
          hint="resolved vs raised (30d)"
          loading={analytics.isLoading}
        />
      </div>

      {/* ── Filter bar ─────────────────────────────────────────── */}
      <Card className="border shadow-sm rounded-xl">
        <CardContent className="flex flex-wrap items-center gap-2 p-4">
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="relative min-w-[200px] flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search title, message, source, device..."
              aria-label="Search alert history"
              className="h-8 pl-8 text-xs"
            />
          </div>
          <Select value={severity} onValueChange={(v) => { setSeverity(v); setPage(1); }}>
            <SelectTrigger aria-label="Filter by severity" className="h-8 w-[130px] text-xs">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All severities</SelectItem>
              {SEVERITY_OPTIONS.map((s) => (
                <SelectItem key={s} value={s} className="text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${SEVERITY_META[s].dot}`} aria-hidden />
                    {s}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger aria-label="Filter by status" className="h-8 w-[150px] text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All statuses</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={range} onValueChange={(v) => { setRange(v); setPage(1); }}>
            <SelectTrigger aria-label="Filter by date range" className="h-8 w-[150px] text-xs">
              <SelectValue placeholder="Date range" />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((r) => (
                <SelectItem key={r.value} value={r.value} className="text-xs">{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1); }}>
            <SelectTrigger aria-label="Rows per page" className="h-8 w-[120px] text-xs">
              <SelectValue placeholder="Rows" />
            </SelectTrigger>
            <SelectContent>
              {LIMIT_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)} className="text-xs">{n} rows / page</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs text-muted-foreground"
              onClick={resetFilters}
              aria-label="Clear all history filters"
            >
              <RotateCcw className="h-3 w-3" aria-hidden /> Reset
            </Button>
          )}
          {(search || severity !== "all" || status !== "all" || dateFrom) && (
            <span className="text-[10px] text-muted-foreground">
              filters apply to the CSV export too
            </span>
          )}
        </CardContent>
      </Card>

      {/* ── Archive table ──────────────────────────────────────── */}
      <Card className="border shadow-sm rounded-xl">
        <CardContent className="p-0">
          {history.isError ? (
            <div className="p-4">
              <ErrorStrip
                message={history.error instanceof Error ? history.error.message : "History archive unavailable"}
                onRetry={() => void history.refetch()}
              />
            </div>
          ) : (
            <div className="max-h-[62vh] overflow-auto nice-scroll rounded-xl">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background shadow-[0_1px_0_0_hsl(var(--border))]">
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="text-xs font-semibold">Alert</TableHead>
                    <TableHead className="text-xs font-semibold">Severity</TableHead>
                    <TableHead className="text-xs font-semibold">Source</TableHead>
                    <TableHead className="text-xs font-semibold">Duration</TableHead>
                    <TableHead className="text-xs font-semibold">Acknowledged</TableHead>
                    <TableHead className="text-xs font-semibold">Resolved</TableHead>
                    <TableHead className="text-xs font-semibold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.isLoading ? (
                    [...Array(8)].map((_, i) => (
                      <TableRow key={`sk-${i}`}>
                        <TableCell colSpan={7} className="py-1.5">
                          <Skeleton className="h-9 w-full rounded-md" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-6">
                        <EmptyState
                          icon={hasActiveFilters ? Search : Archive}
                          title={hasActiveFilters ? "No records match the current filters" : "Archive is empty"}
                          hint={hasActiveFilters
                            ? "Try widening the date range or clearing the search term."
                            : "Acknowledged and resolved alerts are archived here automatically."}
                          action={hasActiveFilters ? (
                            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={resetFilters}>
                              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Clear filters
                            </Button>
                          ) : undefined}
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((h) => {
                      return (
                        <TableRow
                          key={h.id}
                          className="group cursor-pointer hover:bg-muted/30"
                          onClick={() => openDetail(h)}
                          title="Open alert details"
                        >
                          <TableCell className="max-w-[260px] text-xs">
                            <p className="flex items-center gap-1.5 truncate font-semibold">
                              {h.title || h.type || "Untitled alert"}
                              {(h.duplicateCount ?? 1) > 1 && (
                                <Badge variant="secondary" className="shrink-0 text-[9px] tabular-nums">x{h.duplicateCount}</Badge>
                              )}
                            </p>
                            <p className="truncate text-[11px] text-muted-foreground">{h.message}</p>
                            <p className="hidden font-mono text-[9px] text-muted-foreground group-hover:block">{h.id}</p>
                          </TableCell>
                          <TableCell><SeverityBadge severity={h.severity} /></TableCell>
                          <TableCell className="max-w-[140px] text-xs">
                            <span className="block truncate font-mono text-[11px] text-muted-foreground" title={h.device}>
                              {h.device || "—"}
                            </span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs tabular-nums">
                            {h.resolvedAt ? (
                              <span className="inline-flex items-center gap-1">
                                <Clock3 className="h-3 w-3 text-muted-foreground" aria-hidden />
                                {h.duration != null
                                  ? formatDurationLabel(h.duration)
                                  : durationBetween(h.triggeredAt, h.resolvedAt)}
                              </span>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            {h.acknowledgedBy || h.assignedTo ? (
                              <span className="truncate">{h.acknowledgedBy || h.assignedTo}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs">
                            {h.resolvedAt ? (
                              <span title={timeAgo(h.resolvedAt)}>{formatTimestamp(h.resolvedAt)}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <StatusBadge status={h.status} />
                              {(h.escalationLevel ?? 0) > 0 && (
                                <Badge variant="outline" className="border-red-300 bg-red-50 text-[9px] font-semibold text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                                  L{h.escalationLevel}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {/* ── Pagination footer ─────────────────────────────── */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5">
            <p className="text-xs text-muted-foreground">
              Page {Math.min(page, totalPages)} of {totalPages} · {total.toLocaleString()} records
              {history.isFetching && !history.isLoading ? (
                <span className="ml-2 inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden /> syncing
                </span>
              ) : null}
            </p>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                disabled={page <= 1 || history.isLoading}
                aria-label="Previous page"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                disabled={page >= totalPages || history.isLoading}
                aria-label="Next page"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Shared detail dialog (same component as Alert Center) ── */}
      <AlertDetailDialog
        key={detailAlert?.id ?? "none"}
        alert={detailAlert}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        initialMode="view"
      />
    </div>
  );
}

/** Minutes → compact human label ("42m", "3h 12m", "1d 4h"). */
function formatDurationLabel(mins: number): string {
  if (!Number.isFinite(mins) || mins < 0) return "—";
  if (mins < 60) return `${Math.round(mins)}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${Math.round(mins % 60)}m`;
  return `${Math.floor(hrs / 24)}d ${hrs % 24}h`;
}

export default AlertHistoryPage;
