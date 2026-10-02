"use client";

// ─── Reports Phase 2 ─────────────────────────────────────────────────────────
// Nav registration (coordinator): label "Collection Register" · href "/collection-register"
// Receipt-level collection register with mode/status/area filters.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  IndianRupee, Receipt, Users, AlertTriangle, Download, Printer, RefreshCw, Search, Eye, FileText,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { downloadCsv, printReport, fmtINRDisplay, downloadServerFormat } from "@/lib/report-export";
import type { ReportColumn } from "@/lib/report-export";
import { openSubscriber360 } from "@/store/report-drill-store";

// ─── Types ──────────────────────────────────────────────
type ModeStat = { count: number; total: number };

type CollectionSummary = {
  from: string; to: string; totalCollected: number; paymentCount: number;
  uniqueSubscribers: number;
  byMode: Record<string, ModeStat>;
  byStatus: Record<string, ModeStat>;
};

type CollectionRow = {
  receiptNumber: string; paymentDate: string; subscriberId: string | null;
  subscriberCode: string; name: string; area: string; invoiceNumber: string; amount: number;
  paymentMode: string; status: string; collectedBy: string; transactionRef: string; notes: string;
};

type CollectionData = { summary: CollectionSummary; rows: CollectionRow[] };

// ─── Helpers ────────────────────────────────────────────
function toISO(d: Date) { return d.toISOString().split("T")[0]; }

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const MODES = ["CASH", "UPI", "ONLINE", "BANK_TRANSFER", "CHEQUE", "WALLET"];

const MODE_LABELS: Record<string, string> = {
  CASH: "Cash", UPI: "UPI", ONLINE: "Online",
  BANK_TRANSFER: "Bank Transfer", CHEQUE: "Cheque", WALLET: "Wallet",
};

function ModeBadge({ mode }: { mode: string }) {
  return <Badge variant="outline" className="text-[10px]">{MODE_LABELS[mode] || mode}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "VERIFIED":
      return <Badge variant="outline" className="text-[10px] bg-green-100 text-green-700 border-green-200">Verified</Badge>;
    case "PENDING":
      return <Badge variant="secondary" className="text-[10px]">Pending</Badge>;
    case "FAILED":
      return <Badge variant="destructive" className="text-[10px]">Failed</Badge>;
    case "REFUNDED":
      return <Badge variant="outline" className="text-[10px] text-muted-foreground">Refunded</Badge>;
    default:
      return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
  }
}

const EXPORT_COLUMNS: ReportColumn<CollectionRow>[] = [
  { header: "Receipt #", key: "receiptNumber" },
  { header: "Date", key: "paymentDate", format: (v) => (v ? formatDate(String(v)) : "") },
  { header: "Subscriber Code", key: "subscriberCode" },
  { header: "Subscriber", key: "name" },
  { header: "Area", key: "area" },
  { header: "Invoice #", key: "invoiceNumber" },
  { header: "Amount", key: "amount", format: (v) => fmtINRDisplay(v) },
  { header: "Mode", key: "paymentMode", format: (v) => MODE_LABELS[String(v)] || String(v) },
  { header: "Status", key: "status" },
  { header: "Collected By", key: "collectedBy" },
  { header: "Transaction Ref", key: "transactionRef" },
  { header: "Notes", key: "notes" },
];

// ─── Page ───────────────────────────────────────────────
export default function CollectionRegisterPage() {
  const now = new Date();
  const [from, setFrom] = useState(toISO(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(toISO(now));
  const [mode, setMode] = useState("ALL");
  const [status, setStatus] = useState("VERIFIED");
  const [areaId, setAreaId] = useState("ALL");
  const [q, setQ] = useState("");

  // /api/areas returns { items:[...], pagination } — NOT the success/data envelope.
  const { data: areasData } = useQuery<{ items: { id: string; name: string; code: string }[] }>({
    queryKey: ["collection-register-areas"],
    queryFn: () => apiFetch<{ items: { id: string; name: string; code: string }[] }>("/api/areas?limit=100").catch(() => ({ items: [] })),
  });
  const areas = areasData?.items || [];

  const buildFilterParams = () => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (mode !== "ALL") params.set("mode", mode);
    if (status !== "ALL") params.set("status", status);
    if (areaId !== "ALL") params.set("areaId", areaId);
    if (q) params.set("q", q);
    return params;
  };

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<CollectionData>({
    queryKey: ["collection-register", from, to, mode, status, areaId, q],
    queryFn: () => {
      const params = buildFilterParams();
      return apiFetch<{ success: boolean; data: CollectionData }>(`/api/reports/collection-register?${params}`).then((j) => j.data);
    },
  });

  const summary = data?.summary;
  const rows = data?.rows || [];

  const handleExportCsv = () => {
    if (rows.length === 0) return;
    downloadCsv("collection-register", EXPORT_COLUMNS, rows);
    toast.success("Collection register exported as CSV");
  };

  const handleExportPdf = async () => {
    try {
      await downloadServerFormat({
        basePath: "/api/reports/collection-register",
        params: Object.fromEntries(buildFilterParams()),
        format: "pdf",
        baseName: "collection-register",
      });
      toast.success("PDF exported");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF export failed");
    }
  };

  const handlePrint = () => {
    if (!summary) return;
    printReport<CollectionRow>({
      title: "Collection Register",
      subtitle: "Receipt-level collection register with mode and status breakdown",
      meta: [
        { label: "Period", value: `${summary.from || from || "—"} to ${summary.to || to || "—"}` },
        { label: "Mode", value: mode === "ALL" ? "All" : MODE_LABELS[mode] || mode },
        { label: "Status", value: status === "ALL" ? "All" : status },
        { label: "Area", value: areaId === "ALL" ? "All" : areas.find((a) => a.id === areaId)?.name || areaId },
        ...(q ? [{ label: "Search", value: q }] : []),
      ],
      columns: EXPORT_COLUMNS,
      rows,
      totals: [
        { label: "Total Collected", value: fmtINRDisplay(summary.totalCollected) },
        { label: "Payments", value: String(summary.paymentCount) },
        { label: "Unique Subscribers", value: String(summary.uniqueSubscribers) },
      ],
      baseName: "collection-register",
      orientation: "landscape",
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div><Skeleton className="skeleton-wave h-7 w-48 mb-2" /><Skeleton className="skeleton-wave h-4 w-72" /></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="border shadow-sm"><CardContent className="p-4"><Skeleton className="skeleton-wave h-3 w-20 mb-2" /><Skeleton className="skeleton-wave h-7 w-28 mb-1" /><Skeleton className="skeleton-wave h-3 w-16" /></CardContent></Card>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="border shadow-sm"><CardContent className="p-4"><Skeleton className="skeleton-wave h-3 w-16 mb-2" /><Skeleton className="skeleton-wave h-6 w-20" /></CardContent></Card>
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
          <h1 className="text-2xl font-bold text-foreground">Collection Register</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Receipt-level collection register with mode and status breakdown</p>
        </div>
        <Card className="border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20">
          <CardContent className="flex items-center gap-4 p-6">
            <AlertTriangle className="h-6 w-6 text-red-500 shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-red-700 dark:text-red-300">Failed to load collection register</p>
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
          <h1 className="text-2xl font-bold text-foreground">Collection Register</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Receipt-level collection register with mode and status breakdown</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={rows.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1" />Export CSV
          </Button>
          <Button variant="outline" size="sm" disabled={rows.length === 0} onClick={handleExportPdf}>
            <FileText className="h-3.5 w-3.5 mr-1" />Export PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint} disabled={rows.length === 0}>
            <Printer className="h-3.5 w-3.5 mr-1" />Print / PDF
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border bg-emerald-50"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-emerald-100 text-emerald-600"><IndianRupee className="h-4 w-4" /></div><p className="text-xs font-medium text-emerald-700">Total Collected</p></div><p className="text-2xl font-bold mt-1 tabular-nums text-emerald-700">{fmtINRDisplay(summary?.totalCollected ?? 0)}</p></CardContent></Card>
        <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-teal-100 text-teal-600"><Receipt className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Payments</p></div><p className="text-xl font-bold tabular-nums">{summary?.paymentCount ?? 0}</p></CardContent></Card>
        <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-blue-100 text-blue-600"><Users className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Unique Subscribers</p></div><p className="text-xl font-bold tabular-nums">{summary?.uniqueSubscribers ?? 0}</p></CardContent></Card>
      </div>

      {/* Modes Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {MODES.map((m) => {
          const stat = summary?.byMode?.[m] ?? { count: 0, total: 0 };
          return (
            <Card key={m} className="border shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold">{MODE_LABELS[m]}</p>
                  <Badge variant="outline" className="text-[9px]">{stat.count}</Badge>
                </div>
                <p className="text-xl font-bold mt-1 tabular-nums">{fmtINRDisplay(stat.total)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{stat.count} payment(s)</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <Card className="rounded-xl border border-border/50 shadow-sm">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search receipt #, name, invoice..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
            </div>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger><SelectValue placeholder="Mode" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Modes</SelectItem>
                {MODES.map((m) => <SelectItem key={m} value={m}>{MODE_LABELS[m]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                {["VERIFIED", "PENDING", "FAILED", "REFUNDED", "ALL"].map((s) => (
                  <SelectItem key={s} value={s}>{s === "ALL" ? "All Status" : s.charAt(0) + s.slice(1).toLowerCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={areaId} onValueChange={setAreaId}>
              <SelectTrigger><SelectValue placeholder="Area" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Areas</SelectItem>
                {areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="From date" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} placeholder="To date" />
          </div>
        </CardContent>
      </Card>

      {/* Register Table */}
      <Card className="rounded-xl border border-border/50 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs font-medium uppercase">Receipt #</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Date</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Subscriber</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Area</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Invoice #</TableHead>
                  <TableHead className="text-xs font-medium uppercase text-right">Amount</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Mode</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Status</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Collected By</TableHead>
                  <TableHead className="text-xs font-medium uppercase">360°</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">No data for the selected filters</TableCell>
                  </TableRow>
                ) : rows.map((r) => (
                  <TableRow key={r.receiptNumber} className="hover:bg-muted/50 transition-colors duration-150">
                    <TableCell className="font-mono text-xs">{r.receiptNumber}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{r.paymentDate ? formatDate(r.paymentDate) : "—"}</TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{r.name}</p>
                        <p className="text-xs text-muted-foreground">{r.subscriberCode}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{r.area || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.invoiceNumber || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm font-semibold">{fmtINRDisplay(r.amount)}</TableCell>
                    <TableCell><ModeBadge mode={r.paymentMode} /></TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell className="text-sm">{r.collectedBy || "—"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="View 360° Customer View"
                        onClick={() => openSubscriber360(r.subscriberId)} disabled={!r.subscriberId}>
                        <Eye className="h-3.5 w-3.5" />
                        <span className="sr-only">View 360°</span>
                      </Button>
                    </TableCell>
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
