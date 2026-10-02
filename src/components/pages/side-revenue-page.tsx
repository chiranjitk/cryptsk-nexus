"use client";

// ─── Reports Phase 2 ─────────────────────────────────────────────────────────
// Nav registration (coordinator): label "Side Revenue" · href "/side-revenue"
// Non-plan revenue (top-ups, vouchers, add-ons) with per-source breakdown.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  IndianRupee, Wallet, Ticket, Puzzle, AlertTriangle, Download, Printer, RefreshCw,
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { downloadCsv, printReport, fmtINRDisplay } from "@/lib/report-export";
import type { ReportColumn } from "@/lib/report-export";

// ─── Types ──────────────────────────────────────────────
type SourceStat = { count: number; total: number };

type SideRevenueSummary = {
  from: string; to: string; totalSideRevenue: number; count: number;
  bySource: Record<string, SourceStat>;
  topSpenders: { subscriberCode: string; name: string; total: number }[];
};

type SideRevenueRow = {
  date: string; source: string; subscriberCode: string; name: string;
  area: string; item: string; type: string; amount: number; reference: string;
};

type SideRevenueData = { summary: SideRevenueSummary; rows: SideRevenueRow[] };

// ─── Helpers ────────────────────────────────────────────
function toISO(d: Date) { return d.toISOString().split("T")[0]; }

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const SOURCES = ["TOPUP", "VOUCHER", "ADDON"];

const SOURCE_META: Record<string, { label: string; iconCls: string }> = {
  TOPUP: { label: "Top-ups", iconCls: "bg-emerald-100 text-emerald-600" },
  VOUCHER: { label: "Vouchers", iconCls: "bg-purple-100 text-purple-600" },
  ADDON: { label: "Add-ons", iconCls: "bg-blue-100 text-blue-600" },
};

function SourceBadge({ source }: { source: string }) {
  if (source === "TOPUP") return <Badge variant="default" className="text-[10px]">Top-up</Badge>;
  if (source === "VOUCHER") return <Badge variant="secondary" className="text-[10px]">Voucher</Badge>;
  if (source === "ADDON") return <Badge variant="outline" className="text-[10px]">Add-on</Badge>;
  return <Badge variant="outline" className="text-[10px]">{source}</Badge>;
}

const EXPORT_COLUMNS: ReportColumn<SideRevenueRow>[] = [
  { header: "Date", key: "date", format: (v) => (v ? formatDate(String(v)) : "") },
  { header: "Source", key: "source" },
  { header: "Subscriber Code", key: "subscriberCode" },
  { header: "Subscriber", key: "name" },
  { header: "Area", key: "area" },
  { header: "Item", key: "item" },
  { header: "Type", key: "type" },
  { header: "Reference", key: "reference" },
  { header: "Amount", key: "amount", format: (v) => fmtINRDisplay(v) },
];

// ─── Page ───────────────────────────────────────────────
export default function SideRevenuePage() {
  const now = new Date();
  // Default window = last 30 days (matches API contract; MTD hides most
  // top-up/voucher/add-on activity for a monthly-cycle ISP).
  const [from, setFrom] = useState(toISO(new Date(now.getTime() - 29 * 86_400_000)));
  const [to, setTo] = useState(toISO(now));
  const [source, setSource] = useState("ALL");

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<SideRevenueData>({
    queryKey: ["side-revenue", from, to, source],
    queryFn: () => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (source !== "ALL") params.set("source", source);
      return apiFetch<{ success: boolean; data: SideRevenueData }>(`/api/reports/side-revenue?${params}`).then((j) => j.data);
    },
  });

  const summary = data?.summary;
  const rows = data?.rows || [];
  const topSpenders = (summary?.topSpenders || []).slice(0, 10);
  const maxSpend = Math.max(...topSpenders.map((s) => s.total), 1);

  const handleExportCsv = () => {
    if (rows.length === 0) return;
    downloadCsv("side-revenue", EXPORT_COLUMNS, rows);
    toast.success("Side revenue report exported as CSV");
  };

  const handlePrint = () => {
    if (!summary) return;
    printReport<SideRevenueRow>({
      title: "Side Revenue",
      subtitle: "Non-plan revenue — top-ups, vouchers and add-on purchases",
      meta: [
        { label: "Period", value: `${summary.from || from || "—"} to ${summary.to || to || "—"}` },
        { label: "Source", value: source === "ALL" ? "All" : SOURCE_META[source]?.label || source },
      ],
      columns: EXPORT_COLUMNS,
      rows,
      totals: [
        { label: "Total Side Revenue", value: fmtINRDisplay(summary.totalSideRevenue) },
        { label: "Top-ups", value: fmtINRDisplay(summary.bySource?.TOPUP?.total ?? 0) },
        { label: "Vouchers", value: fmtINRDisplay(summary.bySource?.VOUCHER?.total ?? 0) },
        { label: "Add-ons", value: fmtINRDisplay(summary.bySource?.ADDON?.total ?? 0) },
      ],
      baseName: "side-revenue",
      orientation: "landscape",
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div><Skeleton className="skeleton-wave h-7 w-40 mb-2" /><Skeleton className="skeleton-wave h-4 w-72" /></div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border shadow-sm"><CardContent className="p-4"><Skeleton className="skeleton-wave h-3 w-20 mb-2" /><Skeleton className="skeleton-wave h-7 w-28 mb-1" /><Skeleton className="skeleton-wave h-3 w-16" /></CardContent></Card>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="skeleton-wave h-9 w-full" />)}
        </div>
        <Skeleton className="skeleton-wave h-96 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Side Revenue</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Non-plan revenue — top-ups, vouchers and add-on purchases</p>
        </div>
        <Card className="border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20">
          <CardContent className="flex items-center gap-4 p-6">
            <AlertTriangle className="h-6 w-6 text-red-500 shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-red-700 dark:text-red-300">Failed to load side revenue report</p>
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
          <h1 className="text-2xl font-bold text-foreground">Side Revenue</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Non-plan revenue — top-ups, vouchers and add-on purchases</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={rows.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1" />Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint} disabled={rows.length === 0}>
            <Printer className="h-3.5 w-3.5 mr-1" />Print / PDF
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border bg-emerald-50"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-emerald-100 text-emerald-600"><IndianRupee className="h-4 w-4" /></div><p className="text-xs font-medium text-emerald-700">Total Side Revenue</p></div><p className="text-2xl font-bold mt-1 tabular-nums text-emerald-700">{fmtINRDisplay(summary?.totalSideRevenue ?? 0)}</p><p className="text-xs text-muted-foreground mt-0.5">{summary?.count ?? 0} transaction(s)</p></CardContent></Card>
        {SOURCES.map((s) => {
          const meta = SOURCE_META[s];
          const stat = summary?.bySource?.[s] ?? { count: 0, total: 0 };
          return (
            <Card key={s} className="border shadow-sm hover:shadow-md transition-shadow duration-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`p-1.5 rounded-md ${meta.iconCls}`}>
                    {s === "TOPUP" ? <Wallet className="h-4 w-4" /> : s === "VOUCHER" ? <Ticket className="h-4 w-4" /> : <Puzzle className="h-4 w-4" />}
                  </div>
                  <p className="text-xs font-medium text-muted-foreground">{meta.label}</p>
                </div>
                <p className="text-xl font-bold tabular-nums">{fmtINRDisplay(stat.total)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{stat.count} transaction(s)</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <Card className="rounded-xl border border-border/50 shadow-sm">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="From date" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} placeholder="To date" />
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Sources</SelectItem>
                {SOURCES.map((s) => <SelectItem key={s} value={s}>{SOURCE_META[s]?.label || s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Top Spenders */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2"><Wallet className="h-4 w-4 text-emerald-600" />Top Spenders</CardTitle>
        </CardHeader>
        <CardContent>
          {topSpenders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2"><Wallet className="h-8 w-8 text-muted-foreground/30" /><p className="text-sm text-muted-foreground">No spender data</p></div>
          ) : (
            <div className="space-y-3">
              {topSpenders.map((s, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium">{s.name || "—"} <span className="text-muted-foreground">({s.subscriberCode})</span></p>
                    <span className="text-xs text-muted-foreground tabular-nums">{fmtINRDisplay(s.total)}</span>
                  </div>
                  <Progress value={maxSpend > 0 ? Math.min(100, (s.total / maxSpend) * 100) : 0} className="h-2" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transactions Table */}
      <Card className="rounded-xl border border-border/50 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs font-medium uppercase">Date</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Source</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Subscriber</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Area</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Item</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Type</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Reference</TableHead>
                  <TableHead className="text-xs font-medium uppercase text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">No data for the selected filters</TableCell>
                  </TableRow>
                ) : rows.map((r, i) => (
                  <TableRow key={i} className="hover:bg-muted/50 transition-colors duration-150">
                    <TableCell className="text-xs whitespace-nowrap">{r.date ? formatDate(r.date) : "—"}</TableCell>
                    <TableCell><SourceBadge source={r.source} /></TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{r.name || "—"}</p>
                        <p className="text-xs text-muted-foreground">{r.subscriberCode}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{r.area || "—"}</TableCell>
                    <TableCell className="text-sm">{r.item || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.type || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.reference || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm font-semibold">{fmtINRDisplay(r.amount)}</TableCell>
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
