"use client";

// ─── Reports Phase 2 ─────────────────────────────────────────────────────────
// Nav registration (coordinator): label "Plan & Area MIS" · href "/plan-area-mis"
// By-Plan / By-Area management summary — base, growth, revenue, outstanding, ARPU.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users, IndianRupee, Wallet, Layers, MapPin, AlertTriangle, Download, Printer, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { downloadCsv, printReport, fmtINRDisplay } from "@/lib/report-export";
import type { ReportColumn } from "@/lib/report-export";

// ─── Types ──────────────────────────────────────────────
type MisTotals = { activeSubs: number; revenueInPeriod: number; outstanding: number };

type PlanAreaMisSummary = {
  from: string; to: string;
  totals: MisTotals;
  topPlan: { name: string; revenue: number };
  topArea: { name: string; revenue: number };
  planCount: number; areaCount: number;
};

type PlanRow = {
  plan: string; category: string; priceMonthly: number;
  activeSubs: number; suspendedSubs: number; trialSubs: number; totalSubs: number;
  newInPeriod: number; revenueInPeriod: number; outstanding: number; arpu: number;
};

type AreaRow = {
  area: string;
  activeSubs: number; suspendedSubs: number; trialSubs: number; totalSubs: number;
  newInPeriod: number; revenueInPeriod: number; outstanding: number; arpu: number;
};

type PlanAreaMisData = { summary: PlanAreaMisSummary; byPlan: PlanRow[]; byArea: AreaRow[] };

// ─── Helpers ────────────────────────────────────────────
function toISO(d: Date) { return d.toISOString().split("T")[0]; }

const PLAN_COLUMNS: ReportColumn<PlanRow>[] = [
  { header: "Plan", key: "plan" },
  { header: "Category", key: "category" },
  { header: "Monthly Price", key: "priceMonthly", format: (v) => fmtINRDisplay(v) },
  { header: "Active", key: "activeSubs" },
  { header: "Suspended", key: "suspendedSubs" },
  { header: "Trial", key: "trialSubs" },
  { header: "Total", key: "totalSubs" },
  { header: "New In Period", key: "newInPeriod" },
  { header: "Revenue", key: "revenueInPeriod", format: (v) => fmtINRDisplay(v) },
  { header: "Outstanding", key: "outstanding", format: (v) => fmtINRDisplay(v) },
  { header: "ARPU", key: "arpu", format: (v) => fmtINRDisplay(v) },
];

const AREA_COLUMNS: ReportColumn<AreaRow>[] = [
  { header: "Area", key: "area" },
  { header: "Active", key: "activeSubs" },
  { header: "Suspended", key: "suspendedSubs" },
  { header: "Trial", key: "trialSubs" },
  { header: "Total", key: "totalSubs" },
  { header: "New In Period", key: "newInPeriod" },
  { header: "Revenue", key: "revenueInPeriod", format: (v) => fmtINRDisplay(v) },
  { header: "Outstanding", key: "outstanding", format: (v) => fmtINRDisplay(v) },
  { header: "ARPU", key: "arpu", format: (v) => fmtINRDisplay(v) },
];

// ─── Page ───────────────────────────────────────────────
export default function PlanAreaMisPage() {
  const now = new Date();
  const [from, setFrom] = useState(toISO(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(toISO(now));
  const [view, setView] = useState<"plan" | "area">("plan");

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<PlanAreaMisData>({
    queryKey: ["plan-area-mis", from, to],
    queryFn: () => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      return apiFetch<{ success: boolean; data: PlanAreaMisData }>(`/api/reports/plan-area-mis?${params}`).then((j) => j.data);
    },
  });

  const summary = data?.summary;
  const byPlan = data?.byPlan || [];
  const byArea = data?.byArea || [];

  const handleExportCsv = () => {
    if (view === "plan") {
      if (byPlan.length === 0) return;
      downloadCsv("plan-area-mis-by-plan", PLAN_COLUMNS, byPlan);
      toast.success("Plan MIS exported as CSV");
    } else {
      if (byArea.length === 0) return;
      downloadCsv("plan-area-mis-by-area", AREA_COLUMNS, byArea);
      toast.success("Area MIS exported as CSV");
    }
  };

  const handlePrint = () => {
    if (!summary) return;
    if (view === "plan") {
      printReport<PlanRow>({
        title: "Plan & Area MIS — By Plan",
        subtitle: "Per-plan subscriber base, growth, revenue, outstanding and ARPU",
        meta: [{ label: "Period", value: `${summary.from || from || "—"} to ${summary.to || to || "—"}` }],
        columns: PLAN_COLUMNS,
        rows: byPlan,
        totals: [
          { label: "Active Subscribers", value: String(summary.totals?.activeSubs ?? 0) },
          { label: "Revenue In Period", value: fmtINRDisplay(summary.totals?.revenueInPeriod ?? 0) },
          { label: "Outstanding", value: fmtINRDisplay(summary.totals?.outstanding ?? 0) },
          { label: "Top Plan", value: `${summary.topPlan?.name || "—"} (${fmtINRDisplay(summary.topPlan?.revenue ?? 0)})` },
        ],
        baseName: "plan-area-mis-by-plan",
        orientation: "landscape",
      });
    } else {
      printReport<AreaRow>({
        title: "Plan & Area MIS — By Area",
        subtitle: "Per-area subscriber base, growth, revenue, outstanding and ARPU",
        meta: [{ label: "Period", value: `${summary.from || from || "—"} to ${summary.to || to || "—"}` }],
        columns: AREA_COLUMNS,
        rows: byArea,
        totals: [
          { label: "Active Subscribers", value: String(summary.totals?.activeSubs ?? 0) },
          { label: "Revenue In Period", value: fmtINRDisplay(summary.totals?.revenueInPeriod ?? 0) },
          { label: "Outstanding", value: fmtINRDisplay(summary.totals?.outstanding ?? 0) },
          { label: "Top Area", value: `${summary.topArea?.name || "—"} (${fmtINRDisplay(summary.topArea?.revenue ?? 0)})` },
        ],
        baseName: "plan-area-mis-by-area",
        orientation: "landscape",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div><Skeleton className="skeleton-wave h-7 w-44 mb-2" /><Skeleton className="skeleton-wave h-4 w-80" /></div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="border shadow-sm"><CardContent className="p-4"><Skeleton className="skeleton-wave h-3 w-20 mb-2" /><Skeleton className="skeleton-wave h-7 w-28 mb-1" /><Skeleton className="skeleton-wave h-3 w-16" /></CardContent></Card>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="skeleton-wave h-9 w-full" />)}
        </div>
        <Skeleton className="skeleton-wave h-96 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Plan & Area MIS</h1>
          <p className="text-sm text-muted-foreground mt-0.5">By-plan and by-area management summary</p>
        </div>
        <Card className="border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20">
          <CardContent className="flex items-center gap-4 p-6">
            <AlertTriangle className="h-6 w-6 text-red-500 shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-red-700 dark:text-red-300">Failed to load plan & area MIS</p>
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
          <h1 className="text-2xl font-bold text-foreground">Plan & Area MIS</h1>
          <p className="text-sm text-muted-foreground mt-0.5">By-plan and by-area management summary</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={view === "plan" ? byPlan.length === 0 : byArea.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1" />Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint} disabled={view === "plan" ? byPlan.length === 0 : byArea.length === 0}>
            <Printer className="h-3.5 w-3.5 mr-1" />Print / PDF
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-teal-100 text-teal-600"><Users className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Active Subscribers</p></div><p className="text-xl font-bold tabular-nums">{summary?.totals?.activeSubs ?? 0}</p></CardContent></Card>
        <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-emerald-100 text-emerald-600"><IndianRupee className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Revenue In Period</p></div><p className="text-xl font-bold tabular-nums text-emerald-600">{fmtINRDisplay(summary?.totals?.revenueInPeriod ?? 0)}</p></CardContent></Card>
        <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-amber-100 text-amber-600"><Wallet className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Outstanding</p></div><p className="text-xl font-bold tabular-nums text-red-600">{fmtINRDisplay(summary?.totals?.outstanding ?? 0)}</p></CardContent></Card>
        <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-purple-100 text-purple-600"><Layers className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Top Plan</p></div><p className="text-sm font-bold truncate max-w-[200px]">{summary?.topPlan?.name || "—"}</p><p className="text-xs text-muted-foreground tabular-nums mt-0.5">{fmtINRDisplay(summary?.topPlan?.revenue ?? 0)}</p></CardContent></Card>
        <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-blue-100 text-blue-600"><MapPin className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Top Area</p></div><p className="text-sm font-bold truncate max-w-[200px]">{summary?.topArea?.name || "—"}</p><p className="text-xs text-muted-foreground tabular-nums mt-0.5">{fmtINRDisplay(summary?.topArea?.revenue ?? 0)}</p></CardContent></Card>
      </div>

      {/* Filters + View Toggle */}
      <Card className="rounded-xl border border-border/50 shadow-sm">
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 flex-1">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="From date" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} placeholder="To date" />
          </div>
          <div className="flex items-center gap-1">
            <Button variant={view === "plan" ? "default" : "outline"} size="sm" onClick={() => setView("plan")}>By Plan</Button>
            <Button variant={view === "area" ? "default" : "outline"} size="sm" onClick={() => setView("area")}>By Area</Button>
          </div>
        </CardContent>
      </Card>

      {/* MIS Table */}
      <Card className="rounded-xl border border-border/50 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            {view === "plan" ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs font-medium uppercase">Plan</TableHead>
                    <TableHead className="text-xs font-medium uppercase">Category</TableHead>
                    <TableHead className="text-xs font-medium uppercase text-right">Monthly Price</TableHead>
                    <TableHead className="text-xs font-medium uppercase text-right">Active</TableHead>
                    <TableHead className="text-xs font-medium uppercase text-right">Susp</TableHead>
                    <TableHead className="text-xs font-medium uppercase text-right">Trial</TableHead>
                    <TableHead className="text-xs font-medium uppercase text-right">Total</TableHead>
                    <TableHead className="text-xs font-medium uppercase text-right">New</TableHead>
                    <TableHead className="text-xs font-medium uppercase text-right">Revenue</TableHead>
                    <TableHead className="text-xs font-medium uppercase text-right">Outstanding</TableHead>
                    <TableHead className="text-xs font-medium uppercase text-right">ARPU</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byPlan.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center py-12 text-muted-foreground">No data for the selected filters</TableCell>
                    </TableRow>
                  ) : byPlan.map((r) => (
                    <TableRow key={r.plan} className="hover:bg-muted/50 transition-colors duration-150">
                      <TableCell className="text-sm font-medium">{r.plan || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.category || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{fmtINRDisplay(r.priceMonthly)}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{r.activeSubs}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{r.suspendedSubs}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{r.trialSubs}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm font-semibold">{r.totalSubs}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-emerald-600">+{r.newInPeriod}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm font-semibold">{fmtINRDisplay(r.revenueInPeriod)}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm font-semibold text-red-600">{fmtINRDisplay(r.outstanding)}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{fmtINRDisplay(r.arpu)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs font-medium uppercase">Area</TableHead>
                    <TableHead className="text-xs font-medium uppercase text-right">Active</TableHead>
                    <TableHead className="text-xs font-medium uppercase text-right">Susp</TableHead>
                    <TableHead className="text-xs font-medium uppercase text-right">Trial</TableHead>
                    <TableHead className="text-xs font-medium uppercase text-right">Total</TableHead>
                    <TableHead className="text-xs font-medium uppercase text-right">New</TableHead>
                    <TableHead className="text-xs font-medium uppercase text-right">Revenue</TableHead>
                    <TableHead className="text-xs font-medium uppercase text-right">Outstanding</TableHead>
                    <TableHead className="text-xs font-medium uppercase text-right">ARPU</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byArea.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">No data for the selected filters</TableCell>
                    </TableRow>
                  ) : byArea.map((r) => (
                    <TableRow key={r.area} className="hover:bg-muted/50 transition-colors duration-150">
                      <TableCell className="text-sm font-medium">{r.area || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{r.activeSubs}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{r.suspendedSubs}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{r.trialSubs}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm font-semibold">{r.totalSubs}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-emerald-600">+{r.newInPeriod}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm font-semibold">{fmtINRDisplay(r.revenueInPeriod)}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm font-semibold text-red-600">{fmtINRDisplay(r.outstanding)}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{fmtINRDisplay(r.arpu)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
