"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Wallet, FileText, Users, AlertTriangle, Download, Printer, RefreshCw, CalendarDays,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { downloadCsv, printReport, fmtINRDisplay } from "@/lib/report-export";
import type { ReportColumn } from "@/lib/report-export";

// ─── Types ──────────────────────────────────────────────
type BucketStat = { count: number; total: number };

type BucketMap = {
  notDue: BucketStat; d1_30: BucketStat; d31_60: BucketStat; d61_90: BucketStat; d90plus: BucketStat;
};

type ArAgingSummary = {
  asOf: string; totalOutstanding: number; invoiceCount: number; subscriberCount: number; buckets: BucketMap;
};

type ArAgingRow = {
  invoiceNumber: string; subscriberCode: string; subscriberName: string; phone: string;
  area: string; plan: string; issueDate: string; dueDate: string;
  daysOverdue: number; grandTotal: number; paidAmount: number; balanceAmount: number;
  bucket: string; status: string;
};

type ArAgingData = { summary: ArAgingSummary; rows: ArAgingRow[] };

// ─── Helpers ────────────────────────────────────────────
function toISO(d: Date) { return d.toISOString().split("T")[0]; }

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const BUCKETS: { key: keyof BucketMap; label: string; cls: string }[] = [
  { key: "notDue", label: "Not Due", cls: "bg-green-100 text-green-700" },
  { key: "d1_30", label: "1-30 Days", cls: "bg-green-100 text-green-700" },
  { key: "d31_60", label: "31-60 Days", cls: "bg-yellow-100 text-yellow-700" },
  { key: "d61_90", label: "61-90 Days", cls: "bg-orange-100 text-orange-700" },
  { key: "d90plus", label: "90+ Days", cls: "bg-red-100 text-red-700" },
];

const BUCKET_LABELS: Record<string, string> = {
  notDue: "Not Due", NOT_DUE: "Not Due",
  d1_30: "1-30 Days", D1_30: "1-30 Days", "1-30": "1-30 Days",
  d31_60: "31-60 Days", D31_60: "31-60 Days", "31-60": "31-60 Days",
  d61_90: "61-90 Days", D61_90: "61-90 Days", "61-90": "61-90 Days",
  d90plus: "90+ Days", D90PLUS: "90+ Days", D90_PLUS: "90+ Days", "90+": "90+ Days",
};

const bucketLabel = (b: string) => BUCKET_LABELS[b] || b;

// Bucket accent escalates with age — same risk classes as the aging tab in Revenue Reports.
const bucketCls = (days: number) =>
  days > 90 ? "bg-red-100 text-red-700"
    : days > 60 ? "bg-orange-100 text-orange-700"
      : days > 30 ? "bg-yellow-100 text-yellow-700"
        : "bg-green-100 text-green-700";

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "PAID":
      return <Badge variant="outline" className="text-[10px] bg-green-100 text-green-700 border-green-200">Paid</Badge>;
    case "PARTIALLY_PAID":
      return <Badge variant="secondary" className="text-[10px]">Partially Paid</Badge>;
    case "OVERDUE":
      return <Badge variant="destructive" className="text-[10px]">Overdue</Badge>;
    case "CANCELLED":
      return <Badge variant="outline" className="text-[10px] text-muted-foreground">Cancelled</Badge>;
    case "SENT":
      return <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400">Sent</Badge>;
    default:
      return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
  }
}

const EXPORT_COLUMNS: ReportColumn<ArAgingRow>[] = [
  { header: "Invoice #", key: "invoiceNumber" },
  { header: "Subscriber Code", key: "subscriberCode" },
  { header: "Subscriber", key: "subscriberName" },
  { header: "Phone", key: "phone" },
  { header: "Area", key: "area" },
  { header: "Plan", key: "plan" },
  { header: "Issue Date", key: "issueDate", format: (v) => (v ? formatDate(String(v)) : "") },
  { header: "Due Date", key: "dueDate", format: (v) => (v ? formatDate(String(v)) : "") },
  { header: "Days Overdue", key: "daysOverdue" },
  { header: "Grand Total", key: "grandTotal", format: (v) => fmtINRDisplay(v) },
  { header: "Paid", key: "paidAmount", format: (v) => fmtINRDisplay(v) },
  { header: "Balance", key: "balanceAmount", format: (v) => fmtINRDisplay(v) },
  { header: "Bucket", key: "bucket", format: (v) => bucketLabel(String(v)) },
  { header: "Status", key: "status" },
];

// ─── Page ───────────────────────────────────────────────
export default function ArAgingPage() {
  const [asOf, setAsOf] = useState(toISO(new Date()));

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<ArAgingData>({
    queryKey: ["ar-aging", asOf],
    queryFn: () => {
      const params = new URLSearchParams();
      if (asOf) params.set("asOf", asOf);
      return apiFetch<{ success: boolean; data: ArAgingData }>(`/api/reports/ar-aging?${params}`).then((j) => j.data);
    },
  });

  const summary = data?.summary;
  const rows = data?.rows || [];

  const handleExportCsv = () => {
    if (rows.length === 0) return;
    downloadCsv("ar-aging", EXPORT_COLUMNS, rows);
    toast.success("AR aging report exported as CSV");
  };

  const handlePrint = () => {
    if (!summary) return;
    printReport<ArAgingRow>({
      title: "AR Aging",
      subtitle: "Outstanding receivables by overdue bucket",
      meta: [{ label: "As Of", value: summary.asOf ? formatDate(summary.asOf) : asOf }],
      columns: EXPORT_COLUMNS,
      rows,
      totals: [
        ...BUCKETS.map((b) => ({ label: b.label, value: fmtINRDisplay(summary.buckets?.[b.key]?.total ?? 0) })),
        { label: "Total Outstanding", value: fmtINRDisplay(summary.totalOutstanding) },
      ],
      baseName: "ar-aging",
      orientation: "landscape",
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div><Skeleton className="skeleton-wave h-7 w-40 mb-2" /><Skeleton className="skeleton-wave h-4 w-64" /></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="border shadow-sm"><CardContent className="p-4"><Skeleton className="skeleton-wave h-3 w-24 mb-2" /><Skeleton className="skeleton-wave h-8 w-32" /></CardContent></Card>
          ))}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="border shadow-sm"><CardContent className="p-4"><Skeleton className="skeleton-wave h-3 w-16 mb-2" /><Skeleton className="skeleton-wave h-6 w-24" /></CardContent></Card>
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
          <h1 className="text-2xl font-bold text-foreground">AR Aging</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Outstanding receivables by overdue bucket</p>
        </div>
        <Card className="border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20">
          <CardContent className="flex items-center gap-4 p-6">
            <AlertTriangle className="h-6 w-6 text-red-500 shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-red-700 dark:text-red-300">Failed to load AR aging data</p>
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
          <h1 className="text-2xl font-bold text-foreground">AR Aging</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Outstanding receivables by overdue bucket</p>
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border bg-red-50"><CardContent className="p-4"><p className="text-xs text-red-600">Total Outstanding</p><p className="text-2xl font-bold mt-1 tabular-nums text-red-700">{fmtINRDisplay(summary?.totalOutstanding ?? 0)}</p></CardContent></Card>
        <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-amber-100 text-amber-600"><FileText className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Unpaid Invoices</p></div><p className="text-xl font-bold tabular-nums">{summary?.invoiceCount ?? 0}</p></CardContent></Card>
        <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-teal-100 text-teal-600"><Users className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Subscribers Owing</p></div><p className="text-xl font-bold tabular-nums">{summary?.subscriberCount ?? 0}</p></CardContent></Card>
      </div>

      {/* Bucket Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {BUCKETS.map((b) => {
          const stat = summary?.buckets?.[b.key] ?? { count: 0, total: 0 };
          return (
            <Card key={b.key} className="border shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold">{b.label}</p>
                  <Badge variant="outline" className={`text-[9px] ${b.cls}`}>{stat.count}</Badge>
                </div>
                <p className="text-xl font-bold mt-1 tabular-nums">{fmtINRDisplay(stat.total)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{stat.count} invoice(s)</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* As-Of Filter */}
      <Card className="rounded-xl border border-border/50 shadow-sm">
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">As Of Date</Label>
            <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="w-full sm:w-44" />
          </div>
          <Button variant="outline" size="sm" onClick={() => setAsOf(toISO(new Date()))}>
            <CalendarDays className="h-3.5 w-3.5 mr-1" />Today
          </Button>
        </CardContent>
      </Card>

      {/* Aging Table */}
      <Card className="rounded-xl border border-border/50 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs font-medium uppercase">Invoice #</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Subscriber</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Area</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Due Date</TableHead>
                  <TableHead className="text-xs font-medium uppercase text-right">Days Overdue</TableHead>
                  <TableHead className="text-xs font-medium uppercase text-right">Balance</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Bucket</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">No data for the selected filters</TableCell>
                  </TableRow>
                ) : rows.map((r) => (
                  <TableRow key={r.invoiceNumber} className="hover:bg-muted/50 transition-colors duration-150">
                    <TableCell className="font-mono text-xs">{r.invoiceNumber}</TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{r.subscriberName}</p>
                        <p className="text-xs text-muted-foreground">{r.subscriberCode}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{r.area || "—"}</TableCell>
                    <TableCell className="text-xs">{r.dueDate ? formatDate(r.dueDate) : "—"}</TableCell>
                    <TableCell className={`text-right tabular-nums text-sm ${r.daysOverdue > 60 ? "font-semibold text-red-600" : ""}`}>{r.daysOverdue}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm font-semibold text-red-600">{fmtINRDisplay(r.balanceAmount)}</TableCell>
                    <TableCell><Badge variant="outline" className={`text-[10px] ${bucketCls(r.daysOverdue)}`}>{bucketLabel(r.bucket)}</Badge></TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
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
