"use client";

// ─── Reports Phase 2 ─────────────────────────────────────────────────────────
// Nav registration (coordinator): label "Expiry & Renewal" · href "/expiry-renewal"
// Expiring-soon and expired subscribers with renewal-pipeline buckets.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users, AlertTriangle, UserCheck, Coins,
  Download, Printer, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { downloadCsv, printReport, fmtINRDisplay } from "@/lib/report-export";
import type { ReportColumn } from "@/lib/report-export";

// ─── Types ──────────────────────────────────────────────
type ExpirySummary = {
  asOf: string; withinDays: number;
  expiringCount: number; expiredCount: number;
  dueIn7: number; dueIn30: number; laterCount: number;
  potentialMrrAtRisk: number; renewalsLast30Days: number;
};

type ExpiryRow = {
  subscriberCode: string; name: string; phone: string; area: string;
  plan: string; planPrice: number; lastRenewal: string; expiryDate: string;
  daysToExpiry: number; bucket: string; status: string;
};

type ExpiryData = { summary: ExpirySummary; rows: ExpiryRow[] };

// ─── Helpers ────────────────────────────────────────────
function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// Escalating risk accents — same vocabulary as the AR-aging bucket cards.
const BUCKET_CARDS = [
  { key: "expired", label: "Expired", cls: "bg-red-100 text-red-700" },
  { key: "due7", label: "Due ≤ 7 Days", cls: "bg-orange-100 text-orange-700" },
  { key: "due30", label: "Due ≤ 30 Days", cls: "bg-yellow-100 text-yellow-700" },
  { key: "later", label: "Later", cls: "bg-green-100 text-green-700" },
] as const;

const BUCKET_LABELS: Record<string, string> = {
  EXPIRED: "Expired", DUE_7: "Due ≤ 7d", DUE_30: "Due ≤ 30d", LATER: "Later",
};

function BucketBadge({ bucket }: { bucket: string }) {
  switch (bucket) {
    case "EXPIRED":
      return <Badge variant="destructive" className="text-[10px]">Expired</Badge>;
    case "DUE_7":
      return <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400">Due ≤ 7d</Badge>;
    case "DUE_30":
      return <Badge variant="outline" className="text-[10px]">Due ≤ 30d</Badge>;
    case "LATER":
      return <Badge variant="secondary" className="text-[10px]">Later</Badge>;
    default:
      return <Badge variant="outline" className="text-[10px]">{BUCKET_LABELS[bucket] || bucket}</Badge>;
  }
}

const STATUS_CLS: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  SUSPENDED: "bg-amber-100 text-amber-600",
  EXPIRED: "bg-red-100 text-red-700",
  DISCONNECTED: "bg-red-100 text-red-700",
  GRACE_PERIOD: "bg-yellow-100 text-yellow-700",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={`text-[10px] ${STATUS_CLS[status] || "bg-gray-100 text-gray-500"}`}>
      {status === "GRACE_PERIOD" ? "Grace Period" : status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
  );
}

const WITHIN_OPTIONS = ["7", "15", "30", "60", "90"];

const EXPORT_COLUMNS: ReportColumn<ExpiryRow>[] = [
  { header: "Subscriber Code", key: "subscriberCode" },
  { header: "Subscriber", key: "name" },
  { header: "Phone", key: "phone" },
  { header: "Area", key: "area" },
  { header: "Plan", key: "plan" },
  { header: "Plan Price", key: "planPrice", format: (v) => fmtINRDisplay(v) },
  { header: "Last Renewal", key: "lastRenewal", format: (v) => (v ? formatDate(String(v)) : "") },
  { header: "Expiry Date", key: "expiryDate", format: (v) => (v ? formatDate(String(v)) : "") },
  { header: "Days To Expiry", key: "daysToExpiry" },
  { header: "Bucket", key: "bucket", format: (v) => BUCKET_LABELS[String(v)] || String(v) },
  { header: "Status", key: "status" },
];

// ─── Page ───────────────────────────────────────────────
export default function ExpiryRenewalPage() {
  const [withinDays, setWithinDays] = useState("7");
  const [areaId, setAreaId] = useState("ALL");

  // /api/areas returns { items:[...], pagination } — NOT the success/data envelope.
  const { data: areasData } = useQuery<{ items: { id: string; name: string; code: string }[] }>({
    queryKey: ["expiry-renewal-areas"],
    queryFn: () => apiFetch<{ items: { id: string; name: string; code: string }[] }>("/api/areas?limit=100").catch(() => ({ items: [] })),
  });
  const areas = areasData?.items || [];

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<ExpiryData>({
    queryKey: ["expiry-renewal", withinDays, areaId],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("withinDays", withinDays);
      if (areaId !== "ALL") params.set("areaId", areaId);
      return apiFetch<{ success: boolean; data: ExpiryData }>(`/api/reports/expiry-renewal?${params}`).then((j) => j.data);
    },
  });

  const summary = data?.summary;
  const rows = data?.rows || [];

  const bucketStat = (key: (typeof BUCKET_CARDS)[number]["key"]) => {
    if (!summary) return 0;
    if (key === "expired") return summary.expiredCount;
    if (key === "due7") return summary.dueIn7;
    if (key === "due30") return summary.dueIn30;
    return summary.laterCount;
  };

  const handleExportCsv = () => {
    if (rows.length === 0) return;
    downloadCsv("expiry-renewal", EXPORT_COLUMNS, rows);
    toast.success("Expiry & renewal report exported as CSV");
  };

  const handlePrint = () => {
    if (!summary) return;
    printReport<ExpiryRow>({
      title: "Expiry & Renewal",
      subtitle: "Subscribers expiring within the selected window, sorted by days to expiry",
      meta: [
        { label: "As Of", value: summary.asOf ? formatDate(summary.asOf) : "—" },
        { label: "Window", value: `${summary.withinDays ?? withinDays} days` },
        { label: "Area", value: areaId === "ALL" ? "All" : areas.find((a) => a.id === areaId)?.name || areaId },
      ],
      columns: EXPORT_COLUMNS,
      rows,
      totals: [
        { label: "Expiring In Window", value: String(summary.expiringCount) },
        { label: "Expired", value: String(summary.expiredCount) },
        { label: "Renewals Last 30 Days", value: String(summary.renewalsLast30Days) },
        { label: "Potential MRR At Risk", value: fmtINRDisplay(summary.potentialMrrAtRisk) },
      ],
      baseName: "expiry-renewal",
      orientation: "landscape",
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div><Skeleton className="skeleton-wave h-7 w-48 mb-2" /><Skeleton className="skeleton-wave h-4 w-80" /></div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border shadow-sm"><CardContent className="p-4"><Skeleton className="skeleton-wave h-3 w-24 mb-2" /><Skeleton className="skeleton-wave h-7 w-28 mb-1" /><Skeleton className="skeleton-wave h-3 w-16" /></CardContent></Card>
          ))}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border shadow-sm"><CardContent className="p-4"><Skeleton className="skeleton-wave h-3 w-20 mb-2" /><Skeleton className="skeleton-wave h-6 w-24" /></CardContent></Card>
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
          <h1 className="text-2xl font-bold text-foreground">Expiry & Renewal</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Subscribers expiring soon and renewal momentum</p>
        </div>
        <Card className="border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20">
          <CardContent className="flex items-center gap-4 p-6">
            <AlertTriangle className="h-6 w-6 text-red-500 shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-red-700 dark:text-red-300">Failed to load expiry & renewal data</p>
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
          <h1 className="text-2xl font-bold text-foreground">Expiry & Renewal</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Subscribers expiring soon and renewal momentum</p>
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
        <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-amber-100 text-amber-600"><Users className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Expiring In Window</p></div><p className="text-xl font-bold tabular-nums">{summary?.expiringCount ?? 0}</p></CardContent></Card>
        <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-rose-100 text-rose-600"><AlertTriangle className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Expired</p></div><p className="text-xl font-bold tabular-nums text-rose-600">{summary?.expiredCount ?? 0}</p></CardContent></Card>
        <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-emerald-100 text-emerald-600"><UserCheck className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Renewals Last 30 Days</p></div><p className="text-xl font-bold tabular-nums text-emerald-600">{summary?.renewalsLast30Days ?? 0}</p></CardContent></Card>
        <Card className="border bg-red-50"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-red-100 text-red-600"><Coins className="h-4 w-4" /></div><p className="text-xs font-medium text-red-700">Potential MRR At Risk</p></div><p className="text-2xl font-bold mt-1 tabular-nums text-red-700">{fmtINRDisplay(summary?.potentialMrrAtRisk ?? 0)}</p></CardContent></Card>
      </div>

      {/* Bucket Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {BUCKET_CARDS.map((b) => (
          <Card key={b.key} className="border shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold">{b.label}</p>
                <Badge variant="outline" className={`text-[9px] ${b.cls}`}>{bucketStat(b.key)}</Badge>
              </div>
              <p className="text-xl font-bold mt-1 tabular-nums">{bucketStat(b.key)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">subscriber(s)</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="rounded-xl border border-border/50 shadow-sm">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Select value={withinDays} onValueChange={setWithinDays}>
              <SelectTrigger><SelectValue placeholder="Within days" /></SelectTrigger>
              <SelectContent>
                {WITHIN_OPTIONS.map((d) => <SelectItem key={d} value={d}>Next {d} days</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={areaId} onValueChange={setAreaId}>
              <SelectTrigger><SelectValue placeholder="Area" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Areas</SelectItem>
                {areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Expiry Table */}
      <Card className="rounded-xl border border-border/50 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs font-medium uppercase">Subscriber</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Phone</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Area</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Plan</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Last Renewal</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Expiry Date</TableHead>
                  <TableHead className="text-xs font-medium uppercase text-right">Days To Expiry</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Bucket</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">No data for the selected filters</TableCell>
                  </TableRow>
                ) : rows.map((r) => (
                  <TableRow key={r.subscriberCode} className="hover:bg-muted/50 transition-colors duration-150">
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{r.name}</p>
                        <p className="text-xs text-muted-foreground">{r.subscriberCode}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{r.phone || "—"}</TableCell>
                    <TableCell className="text-sm">{r.area || "—"}</TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm">{r.plan || "—"}</p>
                        <p className="text-xs text-muted-foreground tabular-nums">{fmtINRDisplay(r.planPrice)}/mo</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{r.lastRenewal ? formatDate(r.lastRenewal) : "—"}</TableCell>
                    <TableCell className="text-xs">{r.expiryDate ? formatDate(r.expiryDate) : "—"}</TableCell>
                    <TableCell className={`text-right tabular-nums text-sm ${r.daysToExpiry < 0 ? "font-semibold text-red-600" : r.daysToExpiry <= 7 ? "font-semibold text-amber-600" : ""}`}>{r.daysToExpiry}</TableCell>
                    <TableCell><BucketBadge bucket={r.bucket} /></TableCell>
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
