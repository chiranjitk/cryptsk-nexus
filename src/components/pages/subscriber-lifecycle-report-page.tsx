"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  UserPlus, UserMinus, TrendingUp, TrendingDown, Users, Activity, MapPin, Layers,
  AlertTriangle, Download, Printer, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { downloadCsv, printReport } from "@/lib/report-export";
import type { ReportColumn } from "@/lib/report-export";

// ─── Types ──────────────────────────────────────────────
type LifecycleSummary = {
  totalSubscribers: number;
  statusCounts: Record<string, number>;
  activations: number; disconnections: number; netGrowth: number;
};

type AreaCount = { area: string; count: number };
type PlanCount = { plan: string; count: number };

type LifecycleEvent = {
  timestamp: string; event: string; action: string;
  subscriberCode: string; subscriberName: string; area: string; plan: string;
  userName: string; details: string;
};

type LifecycleData = {
  summary: LifecycleSummary; byArea: AreaCount[]; byPlan: PlanCount[]; events: LifecycleEvent[];
};

// ─── Helpers ────────────────────────────────────────────
function toISO(d: Date) { return d.toISOString().split("T")[0]; }

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const EVENT_LABELS: Record<string, string> = {
  ACTIVATED: "Activated", DISCONNECTED: "Disconnected", SUSPENDED: "Suspended",
  REACTIVATED: "Reactivated", CREATED: "Created", UPDATED: "Updated",
};

function EventBadge({ event }: { event: string }) {
  if (event === "ACTIVATED") return <Badge variant="outline" className="text-[10px] bg-green-100 text-green-700 border-green-200">Activated</Badge>;
  if (event === "DISCONNECTED") return <Badge variant="destructive" className="text-[10px]">Disconnected</Badge>;
  if (event === "SUSPENDED") return <Badge variant="secondary" className="text-[10px]">Suspended</Badge>;
  if (event === "REACTIVATED") return <Badge variant="default" className="text-[10px]">Reactivated</Badge>;
  return <Badge variant="outline" className="text-[10px]">{EVENT_LABELS[event] || event}</Badge>;
}

const STATUS_CLS: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  DISCONNECTED: "bg-red-100 text-red-700",
  SUSPENDED: "bg-amber-100 text-amber-600",
  GRACE_PERIOD: "bg-yellow-100 text-yellow-700",
};

const statusCls = (s: string) => STATUS_CLS[s] || "bg-gray-100 text-gray-500";

const EXPORT_COLUMNS: ReportColumn<LifecycleEvent>[] = [
  { header: "Timestamp", key: "timestamp", format: (v) => (v ? formatDateTime(String(v)) : "") },
  { header: "Event", key: "event", format: (v) => EVENT_LABELS[String(v)] || String(v) },
  { header: "Action", key: "action" },
  { header: "Subscriber Code", key: "subscriberCode" },
  { header: "Subscriber", key: "subscriberName" },
  { header: "Area", key: "area" },
  { header: "Plan", key: "plan" },
  { header: "Performed By", key: "userName" },
  { header: "Details", key: "details" },
];

// ─── Page ───────────────────────────────────────────────
export default function SubscriberLifecycleReportPage() {
  const now = new Date();
  const [from, setFrom] = useState(toISO(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(toISO(now));

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<LifecycleData>({
    queryKey: ["lifecycle-report", from, to],
    queryFn: () => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      return apiFetch<{ success: boolean; data: LifecycleData }>(`/api/reports/lifecycle?${params}`).then((j) => j.data);
    },
  });

  const summary = data?.summary;
  const byArea = data?.byArea || [];
  const byPlan = data?.byPlan || [];
  const events = data?.events || [];
  const maxArea = Math.max(...byArea.map((a) => a.count), 1);
  const maxPlan = Math.max(...byPlan.map((p) => p.count), 1);
  const netGrowth = summary?.netGrowth ?? 0;

  const handleExportCsv = () => {
    if (events.length === 0) return;
    downloadCsv("subscriber-lifecycle-events", EXPORT_COLUMNS, events);
    toast.success("Lifecycle events exported as CSV");
  };

  const handlePrint = () => {
    printReport<LifecycleEvent>({
      title: "Subscriber Lifecycle Report",
      subtitle: "Activations, disconnections and status events across the base",
      meta: [{ label: "Period", value: `${from || "—"} to ${to || "—"}` }],
      columns: EXPORT_COLUMNS.filter((c) => c.header !== "Action"),
      rows: events,
      totals: [
        { label: "Activations", value: String(summary?.activations ?? 0) },
        { label: "Disconnections", value: String(summary?.disconnections ?? 0) },
        { label: "Net Growth", value: `${netGrowth >= 0 ? "+" : ""}${netGrowth}` },
        { label: "Total Base", value: String(summary?.totalSubscribers ?? 0) },
      ],
      baseName: "subscriber-lifecycle-report",
      orientation: "landscape",
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div><Skeleton className="skeleton-wave h-7 w-64 mb-2" /><Skeleton className="skeleton-wave h-4 w-80" /></div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="border shadow-sm"><CardContent className="p-4"><Skeleton className="skeleton-wave h-3 w-20 mb-2" /><Skeleton className="skeleton-wave h-7 w-24" /></CardContent></Card>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="skeleton-wave h-9 w-full" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="skeleton-wave h-64 w-full" />
          <Skeleton className="skeleton-wave h-64 w-full" />
        </div>
        <Skeleton className="skeleton-wave h-96 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Subscriber Lifecycle Report</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Activations, disconnections and status events across the base</p>
        </div>
        <Card className="border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20">
          <CardContent className="flex items-center gap-4 p-6">
            <AlertTriangle className="h-6 w-6 text-red-500 shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-red-700 dark:text-red-300">Failed to load lifecycle report</p>
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
          <h1 className="text-2xl font-bold text-foreground">Subscriber Lifecycle Report</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Activations, disconnections and status events across the base</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={events.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1" />Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-3.5 w-3.5 mr-1" />Print / PDF
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-emerald-100 text-emerald-600"><UserPlus className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Activations</p></div><p className="text-xl font-bold tabular-nums text-emerald-600">+{summary?.activations ?? 0}</p></CardContent></Card>
        <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-rose-100 text-rose-600"><UserMinus className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Disconnections</p></div><p className="text-xl font-bold tabular-nums text-rose-600">{(summary?.disconnections ?? 0) > 0 ? `-${summary?.disconnections ?? 0}` : "0"}</p></CardContent></Card>
        <Card className={`border shadow-sm hover:shadow-md transition-shadow duration-200 ${netGrowth >= 0 ? "bg-emerald-50/60" : "bg-rose-50/60"}`}><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className={`p-1.5 rounded-md ${netGrowth >= 0 ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"}`}>{netGrowth >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}</div><p className="text-xs font-medium text-muted-foreground">Net Growth</p></div><p className={`text-xl font-bold tabular-nums ${netGrowth >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{netGrowth >= 0 ? "+" : ""}{netGrowth}</p></CardContent></Card>
        <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-red-100 text-red-600"><Users className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Total Base</p></div><p className="text-xl font-bold tabular-nums">{summary?.totalSubscribers ?? 0}</p></CardContent></Card>
        <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-teal-100 text-teal-600"><Activity className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Active Now</p></div><p className="text-xl font-bold tabular-nums">{summary?.statusCounts?.ACTIVE ?? 0}</p></CardContent></Card>
      </div>

      {/* Date Range Filter */}
      <Card className="rounded-xl border border-border/50 shadow-sm">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="From date" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} placeholder="To date" />
          </div>
        </CardContent>
      </Card>

      {/* Status Snapshot */}
      <Card className="border shadow-sm">
        <CardContent className="p-4 flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium text-muted-foreground mr-2">Status Snapshot:</p>
          {Object.entries(summary?.statusCounts || {}).length === 0 ? (
            <p className="text-xs text-muted-foreground">No status data</p>
          ) : Object.entries(summary?.statusCounts || {}).map(([s, n]) => (
            <Badge key={s} variant="outline" className={`text-[10px] ${statusCls(s)}`}>{s}: {n}</Badge>
          ))}
        </CardContent>
      </Card>

      {/* Two-Column Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2"><MapPin className="h-4 w-4 text-red-600" />By Area</CardTitle>
          </CardHeader>
          <CardContent>
            {byArea.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-2"><MapPin className="h-8 w-8 text-muted-foreground/30" /><p className="text-sm text-muted-foreground">No area data</p></div>
            ) : (
              <div className="space-y-3">
                {byArea.map((a, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium">{a.area || "—"}</p>
                      <span className="text-xs text-muted-foreground tabular-nums">{a.count}</span>
                    </div>
                    <Progress value={maxArea > 0 ? Math.min(100, (a.count / maxArea) * 100) : 0} className="h-2" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2"><Layers className="h-4 w-4 text-teal-600" />By Plan</CardTitle>
          </CardHeader>
          <CardContent>
            {byPlan.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-2"><Layers className="h-8 w-8 text-muted-foreground/30" /><p className="text-sm text-muted-foreground">No plan data</p></div>
            ) : (
              <div className="space-y-3">
                {byPlan.map((p, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium">{p.plan || "—"}</p>
                      <span className="text-xs text-muted-foreground tabular-nums">{p.count}</span>
                    </div>
                    <Progress value={maxPlan > 0 ? Math.min(100, (p.count / maxPlan) * 100) : 0} className="h-2" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Events Table */}
      <Card className="rounded-xl border border-border/50 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Lifecycle Events</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs font-medium uppercase">Timestamp</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Event</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Subscriber</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Area</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Plan</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Performed By</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No data for the selected filters</TableCell>
                  </TableRow>
                ) : events.map((e, i) => (
                  <TableRow key={i} className="hover:bg-muted/50 transition-colors duration-150">
                    <TableCell className="text-xs whitespace-nowrap">{e.timestamp ? formatDateTime(e.timestamp) : "—"}</TableCell>
                    <TableCell><EventBadge event={e.event} /></TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{e.subscriberName}</p>
                        <p className="text-xs text-muted-foreground">{e.subscriberCode}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{e.area || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{e.plan || "—"}</TableCell>
                    <TableCell className="text-sm">{e.userName || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{e.details || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
