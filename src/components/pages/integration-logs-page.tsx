"use client";

// ═══════════════════════════════════════════════════════════════
// Integration Logs — global cross-integration API call viewer.
// Every provider API call (credential tests, sends, webhooks) with
// latency + response summaries. Data: GET /api/integrations/logs
// (supports integrationId/status/page/limit server-side; search,
// method, time-range and pagination are applied client-side).
// ═══════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FileText, Download, Search, Loader2, AlertCircle, RefreshCw,
  ChevronDown, ChevronRight, Activity, CheckCircle2, Timer, XCircle, Inbox,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { apiFetch, cn } from "@/lib/utils";
import { MiniStat } from "@/components/integrations/shared";
import type { IntegrationLogRow } from "@/lib/integrations/client-types";

const FETCH_LIMIT = 200;    // single fetch ceiling; pagination below is client-side
const PAGE_SIZE = 50;       // rows revealed per "Load more"
const REFRESH_MS = 30_000;  // auto-refresh poll interval

type TimeRange = "all" | "1h" | "24h" | "7d";

const RANGE_MS: Record<Exclude<TimeRange, "all">, number> = {
  "1h": 3_600_000,
  "24h": 86_400_000,
  "7d": 604_800_000,
};

// ─── Formatting helpers ───────────────────────────────────────

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function absoluteTime(iso: string): string {
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? "—" : t.toLocaleString();
}

function methodBadgeClass(method: string): string {
  if (method === "TEST") return "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300";
  if (method === "SEND") return "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300";
  return "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400";
}

function statusBadgeClass(status: string): string {
  if (status === "success") return "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300";
  if (status === "failed") return "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300";
  if (status === "pending") return "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300";
  return "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400";
}

function durationTone(ms: number): "good" | "warn" | "bad" {
  if (ms < 800) return "good";
  if (ms < 2500) return "warn";
  return "bad";
}

const DURATION_CLASSES: Record<"good" | "warn" | "bad", string> = {
  good: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  bad: "text-red-600 dark:text-red-400",
};

/** CSV cell: always quote, escape inner quotes per RFC 4180. */
function csvCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function IntegrationLogsPage() {
  // ── Data ──
  const [logs, setLogs] = useState<IntegrationLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Filters (all client-side, combined) ──
  const [query, setQuery] = useState("");
  const [methodFilter, setMethodFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [integrationFilter, setIntegrationFilter] = useState("all");
  const [rangeFilter, setRangeFilter] = useState<TimeRange>("all");

  // ── Table state ──
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLogs = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ logs: IntegrationLogRow[] }>(
        `/api/integrations/logs?limit=${FETCH_LIMIT}&page=1`,
      );
      setLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to fetch logs";
      setError(msg);
      if (!silent) toast.error(msg);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Single fetch on mount
  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  // Auto-refresh: silent 30s polling, interval cleared on toggle-off and unmount
  useEffect(() => {
    if (!autoRefresh) return;
    intervalRef.current = setInterval(() => {
      void fetchLogs({ silent: true });
    }, REFRESH_MS);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefresh, fetchLogs]);

  // Reset page window when filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, methodFilter, statusFilter, integrationFilter, rangeFilter]);

  // ── Integration filter options (id + name/provider when joined) ──
  const integrationOptions = useMemo(() => {
    const map = new Map<string, { label: string; sub: string }>();
    for (const log of logs) {
      if (map.has(log.integrationId)) continue;
      const name = log.integration?.name;
      const provider = log.integration?.provider;
      map.set(log.integrationId, {
        label: name ?? (log.integrationId ? log.integrationId.slice(0, 8) : "unknown"),
        sub: provider ?? (log.integrationId ? log.integrationId.slice(0, 8) : "unknown"),
      });
    }
    return [...map.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label));
  }, [logs]);

  const integrationLabel = useCallback(
    (log: IntegrationLogRow) =>
      log.integration?.name ?? (log.integrationId ? log.integrationId.slice(0, 8) : "unknown"),
    [],
  );

  // ── Combined filters ──
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const now = Date.now();
    const rangeMs = rangeFilter === "all" ? 0 : RANGE_MS[rangeFilter];
    return logs.filter((log) => {
      if (methodFilter !== "all" && log.method !== methodFilter) return false;
      if (statusFilter !== "all" && log.status !== statusFilter) return false;
      if (integrationFilter !== "all" && log.integrationId !== integrationFilter) return false;
      if (rangeMs > 0) {
        const t = new Date(log.createdAt).getTime();
        if (Number.isNaN(t) || now - t > rangeMs) return false;
      }
      if (q) {
        const haystack = `${log.requestSummary} ${log.responseSummary} ${log.url} ${log.integrationId}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [logs, query, methodFilter, statusFilter, integrationFilter, rangeFilter]);

  const visibleRows = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  // ── Stats (from fetched logs) ──
  const stats = useMemo(() => {
    const dayAgo = Date.now() - 86_400_000;
    let total24h = 0;
    let ok = 0;
    let errors = 0;
    let latencySum = 0;
    for (const log of logs) {
      const t = new Date(log.createdAt).getTime();
      if (!Number.isNaN(t) && t >= dayAgo) total24h++;
      if (log.status === "success") ok++;
      else errors++;
      latencySum += log.durationMs || 0;
    }
    const total = logs.length;
    return {
      total24h,
      successRate: total > 0 ? Math.round((ok / total) * 100) : 100,
      avgLatency: total > 0 ? Math.round(latencySum / total) : 0,
      errors,
    };
  }, [logs]);

  const hasActiveFilters =
    query.trim() !== "" ||
    methodFilter !== "all" ||
    statusFilter !== "all" ||
    integrationFilter !== "all" ||
    rangeFilter !== "all";

  function resetFilters() {
    setQuery("");
    setMethodFilter("all");
    setStatusFilter("all");
    setIntegrationFilter("all");
    setRangeFilter("all");
    setExpandedId(null);
  }

  // ── CSV export of the rows currently rendered ──
  function exportCsv() {
    try {
      const header = [
        "time", "method", "provider/integrationId", "url", "statusCode",
        "status", "durationMs", "requestSummary", "responseSummary", "errorMessage",
      ];
      const lines = [header.map(csvCell).join(",")];
      for (const log of visibleRows) {
        lines.push([
          absoluteTime(log.createdAt),
          log.method,
          log.integration?.provider ?? log.integrationId,
          log.url,
          log.statusCode,
          log.status,
          log.durationMs,
          log.requestSummary,
          log.responseSummary,
          log.errorMessage,
        ].map(csvCell).join(","));
      }
      const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `integration-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${visibleRows.length} log row${visibleRows.length === 1 ? "" : "s"}`);
    } catch {
      toast.error("CSV export failed");
    }
  }

  function toggleRow(id: string) {
    setExpandedId((cur) => (cur === id ? null : id));
  }

  // ── Render ──
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <FileText className="h-5 w-5 text-primary" />
            Integration Logs
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Every provider API call — credential tests, sends, and webhook activity — with latency and response summaries.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border px-3 py-1.5">
            <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} aria-label="Toggle auto-refresh" id="auto-refresh" />
            <Label htmlFor="auto-refresh" className="cursor-pointer text-xs">
              Auto-refresh <span className="text-muted-foreground">(30s)</span>
            </Label>
          </div>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={exportCsv} disabled={visibleRows.length === 0}>
            <Download className="h-3.5 w-3.5" />Export CSV
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <Card className="border shadow-sm">
        <CardContent className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
          <MiniStat label="Total Calls (24h)" value={String(stats.total24h)} icon={<Activity className="h-3 w-3" />} />
          <MiniStat
            label="Success Rate"
            value={`${stats.successRate}%`}
            tone={stats.successRate >= 95 ? "good" : stats.successRate >= 80 ? "warn" : "bad"}
            icon={<CheckCircle2 className="h-3 w-3" />}
          />
          <MiniStat
            label="Avg Latency"
            value={`${stats.avgLatency} ms`}
            tone={durationTone(stats.avgLatency)}
            icon={<Timer className="h-3 w-3" />}
          />
          <MiniStat
            label="Errors"
            value={String(stats.errors)}
            tone={stats.errors > 0 ? "bad" : "default"}
            icon={<XCircle className="h-3 w-3" />}
          />
        </CardContent>
      </Card>

      {/* Filter bar */}
      <Card className="border">
        <CardContent className="p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="relative sm:col-span-2">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search request, response, URL, integration id…"
                aria-label="Search logs"
                className="pl-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Method</Label>
              <Select value={methodFilter} onValueChange={setMethodFilter}>
                <SelectTrigger className="h-8 text-xs" aria-label="Filter by method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Methods</SelectItem>
                  {["TEST", "SEND", "POST", "GET"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 text-xs" aria-label="Filter by status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Integration</Label>
              <Select value={integrationFilter} onValueChange={setIntegrationFilter}>
                <SelectTrigger className="h-8 text-xs" aria-label="Filter by integration"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Integrations</SelectItem>
                  {integrationOptions.map(([id, opt]) => (
                    <SelectItem key={id || "unknown"} value={id}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Time Range</Label>
              <Select value={rangeFilter} onValueChange={(v) => setRangeFilter(v as TimeRange)}>
                <SelectTrigger className="h-8 text-xs" aria-label="Filter by time range"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="1h">Last hour</SelectItem>
                  <SelectItem value="24h">Last 24 hours</SelectItem>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {hasActiveFilters && (
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                {filtered.length} of {logs.length} logs match the active filters
              </p>
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px]" onClick={resetFilters}>
                <RefreshCw className="h-3 w-3" />Reset filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Logs table */}
      <Card className="border">
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => <Skeleton key={i} className="h-10 w-full rounded-md" />)}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <AlertCircle className="h-10 w-10 text-red-500" />
              <p className="text-sm font-medium">Failed to load integration logs</p>
              <p className="max-w-md text-xs text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => void fetchLogs()}>
                <Loader2 className="h-3.5 w-3.5" />Retry
              </Button>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-14 text-center">
              <Inbox className="h-12 w-12 text-muted-foreground" />
              <p className="text-base font-semibold">No integration activity yet</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Run a credential test or send a test message from the Payment Gateways, SMS/Email or WhatsApp &amp; Push pages — every provider API call will appear here.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Search className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">No logs match the active filters</p>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={resetFilters}>Clear filters</Button>
            </div>
          ) : (
            <>
              <div className="max-h-[60vh] overflow-y-auto nice-scroll">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/60 hover:bg-muted/60">
                      <TableHead className="w-8 sticky top-0 z-10 bg-background" aria-label="Expand" />
                      <TableHead className="sticky top-0 z-10 bg-background text-xs">Time</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-background text-xs">Method</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-background text-xs">Code</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-background text-xs">Status</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-background text-xs">Integration</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-background text-xs">Request</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-background text-xs">Response</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-background text-xs">Error</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-background text-right text-xs">Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleRows.map((log) => {
                      const expanded = expandedId === log.id;
                      const tone = durationTone(log.durationMs || 0);
                      return (
                        <TableRow
                          key={log.id}
                          className={cn("cursor-pointer", expanded && "bg-muted/40")}
                          onClick={() => toggleRow(log.id)}
                        >
                          <TableCell className="w-8 px-2">
                            {expanded
                              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-label="Collapse row" />
                              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-label="Expand row" />}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground" title={absoluteTime(log.createdAt)}>
                            {timeAgo(log.createdAt)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn("text-[10px]", methodBadgeClass(log.method))}>{log.method}</Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{log.statusCode || "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn("text-[10px]", statusBadgeClass(log.status))}>{log.status}</Badge>
                          </TableCell>
                          <TableCell className="max-w-[140px] truncate text-xs font-medium" title={`${integrationLabel(log)} · ${log.integration?.provider ?? log.integrationId}`}>
                            {integrationLabel(log)}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-xs" title={log.requestSummary}>
                            {log.requestSummary || "—"}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground" title={log.responseSummary}>
                            {log.responseSummary || "—"}
                          </TableCell>
                          <TableCell className="max-w-[180px] truncate text-xs text-red-600 dark:text-red-400" title={log.errorMessage}>
                            {log.errorMessage || ""}
                          </TableCell>
                          <TableCell className={cn("whitespace-nowrap text-right font-mono text-xs", DURATION_CLASSES[tone])}>
                            {log.durationMs} ms
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {expandedId && visibleRows.some((l) => l.id === expandedId) && (() => {
                      const log = visibleRows.find((l) => l.id === expandedId);
                      if (!log) return null;
                      return (
                        <TableRow key={`${log.id}-detail`} className="bg-muted/30 hover:bg-muted/30">
                          <TableCell colSpan={10} className="p-0">
                            <div className="space-y-2 p-4 text-xs" onClick={(e) => e.stopPropagation()}>
                              <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
                                <span>id: {log.id}</span>
                                <span>integrationId: {log.integrationId || "—"}</span>
                                <span>url: {log.url || "—"}</span>
                                <span>method: {log.method}</span>
                                <span>statusCode: {log.statusCode || "—"}</span>
                                <span>createdAt: {absoluteTime(log.createdAt)}</span>
                              </div>
                              <div>
                                <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Request</p>
                                <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-black/5 p-2 font-mono text-[11px] leading-relaxed dark:bg-white/5">
                                  {log.requestSummary || "—"}
                                </pre>
                              </div>
                              <div>
                                <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Response</p>
                                <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-black/5 p-2 font-mono text-[11px] leading-relaxed dark:bg-white/5">
                                  {log.responseSummary || "—"}
                                </pre>
                              </div>
                              {log.errorMessage && (
                                <div>
                                  <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">Error</p>
                                  <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded border border-red-200 bg-red-50/70 p-2 font-mono text-[11px] leading-relaxed text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                                    {log.errorMessage}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })()}
                  </TableBody>
                </Table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5">
                <p className="text-[11px] text-muted-foreground">
                  Showing {visibleRows.length} of {filtered.length} filtered · {logs.length} fetched
                  {logs.length >= FETCH_LIMIT ? ` (capped at ${FETCH_LIMIT})` : ""}
                </p>
                {visibleCount < filtered.length && (
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
                    Load more ({Math.min(PAGE_SIZE, filtered.length - visibleCount)} of {filtered.length - visibleCount} remaining)
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default IntegrationLogsPage;
