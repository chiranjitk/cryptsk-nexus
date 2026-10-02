"use client";

// ─── Reports Phase 3 ─────────────────────────────────────────────────────────
// Nav registration (3-touchpoint): label "Report Snapshots" · href "/report-snapshots"
// Point-in-time MIS snapshots — schedule catalog (daily/weekly/monthly "Run now"),
// snapshot history with CSV / XLSX / PDF downloads and delete.
//
// API contract (server-side agent RPT-P3-A):
//   GET    /api/reports/snapshots?reportKey=&frequency=&status=&take=
//          → { success, data: { snapshots, catalog, due } }
//   POST   /api/reports/snapshots { reportKey, frequency }
//          → { success, data: { snapshot, duplicate } }
//   DELETE /api/reports/snapshots?id= → { success }
//   GET    /api/reports/snapshots/download?id=&format=csv|xlsx|pdf[&dimension=plan|area]

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Camera, CheckCircle2, Inbox, AlertTriangle, Download, Printer, RefreshCw,
  Play, Trash2, FileText, FileSpreadsheet, CalendarClock,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { downloadServerFormat } from "@/lib/report-export";

// ─── Types ──────────────────────────────────────────────
type Frequency = "DAILY" | "WEEKLY" | "MONTHLY";
type SnapshotStatus = "OK" | "EMPTY" | "FAILED";

type Snapshot = {
  id: string;
  reportKey: string;
  label: string;
  frequency: Frequency;
  periodKey: string;
  rowCount: number;
  status: SnapshotStatus;
  error: string | null;
  generatedBy: string;
  summary: Record<string, unknown> | null;
  createdAt: string;
};

type CatalogEntry = {
  key: string;
  label: string;
  description: string;
  frequencies: string[];
};

type SnapshotsData = {
  snapshots: Snapshot[];
  catalog: CatalogEntry[];
  due: Record<string, { DAILY: boolean; WEEKLY: boolean; MONTHLY: boolean }>;
};

// ─── Helpers ────────────────────────────────────────────
// Radix Select forbids SelectItem value="" — filters use the "__ALL__"
// sentinel that maps back to "" in state (same pattern as Phase-2 pages).
const ALL_SENTINEL = "__ALL__";

const FREQUENCIES: Frequency[] = ["DAILY", "WEEKLY", "MONTHLY"];
const STATUSES: SnapshotStatus[] = ["OK", "EMPTY", "FAILED"];

const FREQ_LABELS: Record<string, string> = {
  DAILY: "Daily", WEEKLY: "Weekly", MONTHLY: "Monthly",
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function relativeTime(dateStr: string) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(dateStr);
}

function FrequencyBadge({ frequency }: { frequency: string }) {
  if (frequency === "DAILY") return <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-700 dark:text-blue-400">Daily</Badge>;
  if (frequency === "WEEKLY") return <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400">Weekly</Badge>;
  if (frequency === "MONTHLY") return <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-700 dark:text-purple-400">Monthly</Badge>;
  return <Badge variant="outline" className="text-[10px]">{frequency}</Badge>;
}

function SnapshotStatusBadge({ status, error }: { status: string; error: string | null }) {
  if (status === "OK")
    return <Badge variant="outline" className="text-[10px] bg-green-100 text-green-700 border-green-200">OK</Badge>;
  if (status === "EMPTY")
    return <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-700">Empty</Badge>;
  if (status === "FAILED")
    return (
      <Badge variant="destructive" className="text-[10px]" title={error || "Snapshot generation failed"}>
        Failed
      </Badge>
    );
  return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
}

// ─── Page ───────────────────────────────────────────────
export default function ReportSnapshotsPage() {
  const [reportKey, setReportKey] = useState("");
  const [frequency, setFrequency] = useState("");
  const [status, setStatus] = useState("");
  const qc = useQueryClient();

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<SnapshotsData>({
    queryKey: ["report-snapshots", reportKey, frequency, status],
    queryFn: () => {
      const params = new URLSearchParams();
      if (reportKey) params.set("reportKey", reportKey);
      if (frequency) params.set("frequency", frequency);
      if (status) params.set("status", status);
      return apiFetch<{ success: boolean; data: SnapshotsData }>(`/api/reports/snapshots?${params}`).then((j) => j.data);
    },
    refetchInterval: 60_000,
  });

  const snapshots = data?.snapshots || [];
  const catalog = data?.catalog || [];
  const due = data?.due || {};

  // KPI counts describe the UNFILTERED truth on the server side only when no
  // filters are set; with filters set they describe the returned window.
  const okCount = snapshots.filter((s) => s.status === "OK").length;
  const emptyCount = snapshots.filter((s) => s.status === "EMPTY").length;
  const failedCount = snapshots.filter((s) => s.status === "FAILED").length;

  // ─── "Run now" mutation ────────────────────────────────────
  const runNow = useMutation({
    mutationFn: (vars: { reportKey: string; frequency: string }) =>
      apiFetch<{ success: boolean; data: { snapshot: Snapshot; duplicate: boolean } }>("/api/reports/snapshots", {
        method: "POST",
        body: JSON.stringify(vars),
      }).then((j) => j.data),
    onSuccess: (res, vars) => {
      const entry = catalog.find((c) => c.key === vars.reportKey);
      const label = entry?.label || vars.reportKey;
      if (res.duplicate) {
        toast.info(`${label} ${FREQ_LABELS[vars.frequency] || vars.frequency} snapshot already exists for this period`);
      } else {
        toast.success(`${label} ${FREQ_LABELS[vars.frequency] || vars.frequency} snapshot generated — ${res.snapshot.rowCount} row(s)`);
      }
      void qc.invalidateQueries({ queryKey: ["report-snapshots"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Snapshot generation failed"),
  });

  // ─── Delete mutation ───────────────────────────────────────
  const del = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/api/reports/snapshots?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Snapshot deleted");
      void qc.invalidateQueries({ queryKey: ["report-snapshots"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Snapshot delete failed"),
  });

  const handleDelete = (snap: Snapshot) => {
    if (!window.confirm(`Delete the ${snap.label} ${FREQ_LABELS[snap.frequency] || snap.frequency} snapshot for period ${snap.periodKey}?`)) return;
    del.mutate(snap.id);
  };

  // plan-area-mis file export takes a dimension (plan|area); default plan.
  const handleDownload = async (snap: Snapshot, format: "csv" | "xlsx" | "pdf") => {
    try {
      await downloadServerFormat({
        basePath: "/api/reports/snapshots/download",
        params: {
          id: snap.id,
          ...(snap.reportKey === "plan-area-mis" ? { dimension: "plan" } : {}),
        },
        format,
        baseName: `${snap.reportKey}-snapshot-${snap.periodKey}`,
      });
      toast.success(`${format.toUpperCase()} downloaded`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div><Skeleton className="skeleton-wave h-7 w-48 mb-2" /><Skeleton className="skeleton-wave h-4 w-96" /></div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border shadow-sm"><CardContent className="p-4"><Skeleton className="skeleton-wave h-3 w-20 mb-2" /><Skeleton className="skeleton-wave h-7 w-16" /></CardContent></Card>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="border shadow-sm"><CardContent className="p-4"><Skeleton className="skeleton-wave h-4 w-32 mb-2" /><Skeleton className="skeleton-wave h-3 w-48 mb-3" /><Skeleton className="skeleton-wave h-8 w-full" /></CardContent></Card>
          ))}
        </div>
        <Skeleton className="skeleton-wave h-96 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Report Snapshots</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Point-in-time MIS snapshots generated on schedule — daily 06:30 IST, weekly Monday, monthly on the 1st</p>
        </div>
        <Card className="border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20">
          <CardContent className="flex items-center gap-4 p-6">
            <AlertTriangle className="h-6 w-6 text-red-500 shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-red-700 dark:text-red-300">Failed to load report snapshots</p>
              <p className="text-sm text-red-600 dark:text-red-400 mt-0.5">{error instanceof Error ? error.message : "Unknown error"}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-1.5" />Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Report Snapshots</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Point-in-time MIS snapshots generated on schedule — daily 06:30 IST, weekly Monday, monthly on the 1st</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} />Refresh
          </Button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-teal-100 text-teal-600"><Camera className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Total Snapshots</p></div><p className="text-xl font-bold tabular-nums">{snapshots.length}</p></CardContent></Card>
        <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-green-100 text-green-600"><CheckCircle2 className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">OK</p></div><p className="text-xl font-bold tabular-nums text-green-700">{okCount}</p></CardContent></Card>
        <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-amber-100 text-amber-600"><Inbox className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Empty</p></div><p className="text-xl font-bold tabular-nums text-amber-600">{emptyCount}</p></CardContent></Card>
        <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-red-100 text-red-600"><AlertTriangle className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Failed</p></div><div className="flex items-center gap-2"><p className="text-xl font-bold tabular-nums text-red-600">{failedCount}</p>{failedCount > 0 && <Badge variant="destructive" className="text-[10px]">Failed</Badge>}</div></CardContent></Card>
      </div>

      {/* Schedule Catalog */}
      <div>
        <CardHeader className="pb-2 px-0">
          <CardTitle className="text-base font-semibold flex items-center gap-2"><CalendarClock className="h-4 w-4 text-teal-600" />Schedule Catalog</CardTitle>
        </CardHeader>
        {catalog.length === 0 ? (
          <Card className="border shadow-sm">
            <CardContent className="p-4">
              <div className="flex flex-col items-center justify-center h-32 gap-2"><CalendarClock className="h-8 w-8 text-muted-foreground/30" /><p className="text-sm text-muted-foreground">No scheduled reports registered yet</p></div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 mt-2">
            {catalog.map((c) => {
              const last = snapshots.find((s) => s.reportKey === c.key);
              return (
                <Card key={c.key} className="border shadow-sm hover:shadow-md transition-shadow duration-200">
                  <CardContent className="p-4 space-y-3">
                    <div>
                      <p className="text-sm font-semibold">{c.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {last ? (
                        <>
                          <span className="font-mono">{last.periodKey}</span> · {last.rowCount} row(s) · {relativeTime(last.createdAt)}
                        </>
                      ) : (
                        "No snapshots yet"
                      )}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {c.frequencies.map((f) => {
                        const isDue = !!due[c.key]?.[f as Frequency];
                        const isRunning = runNow.isPending && runNow.variables?.reportKey === c.key && runNow.variables?.frequency === f;
                        return (
                          <div key={f} className="flex items-center gap-1">
                            {isDue && <Badge variant="outline" className="text-[9px] bg-amber-100 text-amber-700">Due</Badge>}
                            <Button variant="outline" size="sm" disabled={isRunning} title={`Generate ${c.label} ${FREQ_LABELS[f] || f} snapshot now`}
                              onClick={() => runNow.mutate({ reportKey: c.key, frequency: f })}>
                              <Play className="h-3 w-3 mr-1" />{FREQ_LABELS[f] || f}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Snapshot History */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Snapshot History</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Select value={reportKey === "" ? ALL_SENTINEL : reportKey} onValueChange={(v) => setReportKey(v === ALL_SENTINEL ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Report" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SENTINEL}>All Reports</SelectItem>
                {catalog.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={frequency === "" ? ALL_SENTINEL : frequency} onValueChange={(v) => setFrequency(v === ALL_SENTINEL ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Frequency" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SENTINEL}>All Frequencies</SelectItem>
                {FREQUENCIES.map((f) => <SelectItem key={f} value={f}>{FREQ_LABELS[f]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status === "" ? ALL_SENTINEL : status} onValueChange={(v) => setStatus(v === ALL_SENTINEL ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_SENTINEL}>All Statuses</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s === "EMPTY" ? "Empty" : s === "FAILED" ? "Failed" : "OK"}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs font-medium uppercase">Report</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Frequency</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Period</TableHead>
                  <TableHead className="text-xs font-medium uppercase text-right">Rows</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Status</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Generated</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Generated By</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshots.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">No snapshots yet — use “Run now” in the schedule catalog above</TableCell>
                  </TableRow>
                ) : snapshots.map((s) => (
                  <TableRow key={s.id} className="hover:bg-muted/50 transition-colors duration-150">
                    <TableCell className="text-sm font-medium">{s.label}</TableCell>
                    <TableCell><FrequencyBadge frequency={s.frequency} /></TableCell>
                    <TableCell className="font-mono text-xs">{s.periodKey}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{s.rowCount}</TableCell>
                    <TableCell><SnapshotStatusBadge status={s.status} error={s.error} /></TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{s.createdAt ? formatDateTime(s.createdAt) : "—"}</TableCell>
                    <TableCell className="text-sm">{s.generatedBy || "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Download CSV" disabled={del.isPending} onClick={() => handleDownload(s, "csv")}>
                          <Download className="h-3.5 w-3.5" />
                          <span className="sr-only">Download CSV</span>
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Download XLSX" disabled={del.isPending} onClick={() => handleDownload(s, "xlsx")}>
                          <FileSpreadsheet className="h-3.5 w-3.5" />
                          <span className="sr-only">Download XLSX</span>
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Download PDF" disabled={del.isPending} onClick={() => handleDownload(s, "pdf")}>
                          <FileText className="h-3.5 w-3.5" />
                          <span className="sr-only">Download PDF</span>
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Delete snapshot" disabled={del.isPending} onClick={() => handleDelete(s)}>
                          <Trash2 className="h-3.5 w-3.5" />
                          <span className="sr-only">Delete snapshot</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
            <Printer className="h-3 w-3" />Downloads render server-side from the frozen snapshot — they stay stable even if live data changes later.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
