"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileText, IndianRupee, CheckCircle2, Wallet, Ban, AlertTriangle,
  Download, Printer, RefreshCw, Search, Eye,
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
type InvoiceRegisterSummary = {
  count: number; totalBilled: number; totalPaid: number; totalOutstanding: number; cancelledCount: number;
};

type InvoiceRegisterRow = {
  invoiceNumber: string; issueDate: string; dueDate: string;
  subscriberId: string | null;
  subscriberCode: string; subscriberName: string; phone: string;
  area: string; plan: string;
  subtotal: number; cgst: number; sgst: number; grandTotal: number;
  paidAmount: number; balanceAmount: number; status: string;
};

type InvoiceRegisterData = { summary: InvoiceRegisterSummary; rows: InvoiceRegisterRow[] };

// ─── Helpers ────────────────────────────────────────────
function toISO(d: Date) { return d.toISOString().split("T")[0]; }

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft", SENT: "Sent", PAID: "Paid",
  PARTIALLY_PAID: "Partially Paid", OVERDUE: "Overdue",
  CANCELLED: "Cancelled", CREDIT_NOTE: "Credit Note",
};

const STATUS_ORDER = ["DRAFT", "SENT", "PAID", "PARTIALLY_PAID", "OVERDUE", "CANCELLED", "CREDIT_NOTE"];

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
    case "DRAFT":
      return <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-700 dark:text-blue-400">Draft</Badge>;
    case "SENT":
      return <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400">Sent</Badge>;
    case "CREDIT_NOTE":
      return <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-700 dark:text-purple-400">Credit Note</Badge>;
    default:
      return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
  }
}

const EXPORT_COLUMNS: ReportColumn<InvoiceRegisterRow>[] = [
  { header: "Invoice #", key: "invoiceNumber" },
  { header: "Issue Date", key: "issueDate", format: (v) => (v ? formatDate(String(v)) : "") },
  { header: "Due Date", key: "dueDate", format: (v) => (v ? formatDate(String(v)) : "") },
  { header: "Subscriber Code", key: "subscriberCode" },
  { header: "Subscriber", key: "subscriberName" },
  { header: "Phone", key: "phone" },
  { header: "Area", key: "area" },
  { header: "Plan", key: "plan" },
  { header: "Grand Total", key: "grandTotal", format: (v) => fmtINRDisplay(v) },
  { header: "Paid", key: "paidAmount", format: (v) => fmtINRDisplay(v) },
  { header: "Balance", key: "balanceAmount", format: (v) => fmtINRDisplay(v) },
  { header: "Status", key: "status", format: (v) => STATUS_LABELS[String(v)] || String(v) },
];

// ─── Page ───────────────────────────────────────────────
export default function InvoiceRegisterPage() {
  const now = new Date();
  const [from, setFrom] = useState(toISO(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(toISO(now));
  const [status, setStatus] = useState("ALL");
  const [q, setQ] = useState("");

  const buildFilterParams = () => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (status !== "ALL") params.set("status", status);
    if (q) params.set("q", q);
    params.set("limit", "1000");
    return params;
  };

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<InvoiceRegisterData>({
    queryKey: ["invoice-register", from, to, status, q],
    queryFn: () => {
      const params = buildFilterParams();
      return apiFetch<{ success: boolean; data: InvoiceRegisterData }>(`/api/reports/invoice-register?${params}`).then((j) => j.data);
    },
  });

  const summary = data?.summary;
  const rows = data?.rows || [];

  const handleExportCsv = () => {
    if (rows.length === 0) return;
    downloadCsv("invoice-register", EXPORT_COLUMNS, rows);
    toast.success("Invoice register exported as CSV");
  };

  const handleExportPdf = async () => {
    try {
      await downloadServerFormat({
        basePath: "/api/reports/invoice-register",
        params: Object.fromEntries(buildFilterParams()),
        format: "pdf",
        baseName: "invoice-register",
      });
      toast.success("PDF exported");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF export failed");
    }
  };

  const handlePrint = () => {
    if (!summary) return;
    printReport<InvoiceRegisterRow>({
      title: "Invoice Register",
      subtitle: "Every invoice issued — filterable register with billing totals",
      meta: [
        { label: "Period", value: `${from || "—"} to ${to || "—"}` },
        { label: "Status", value: status === "ALL" ? "All" : STATUS_LABELS[status] || status },
        ...(q ? [{ label: "Search", value: q }] : []),
      ],
      columns: EXPORT_COLUMNS,
      rows,
      totals: [
        { label: "Total Billed", value: fmtINRDisplay(summary.totalBilled) },
        { label: "Collected", value: fmtINRDisplay(summary.totalPaid) },
        { label: "Outstanding", value: fmtINRDisplay(summary.totalOutstanding) },
      ],
      baseName: "invoice-register",
      orientation: "landscape",
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div><Skeleton className="skeleton-wave h-7 w-48 mb-2" /><Skeleton className="skeleton-wave h-4 w-72" /></div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="border shadow-sm"><CardContent className="p-4"><Skeleton className="skeleton-wave h-3 w-20 mb-2" /><Skeleton className="skeleton-wave h-7 w-28 mb-1" /><Skeleton className="skeleton-wave h-3 w-16" /></CardContent></Card>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="skeleton-wave h-9 w-full" />)}
        </div>
        <Skeleton className="skeleton-wave h-96 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Invoice Register</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Every invoice issued — filterable register with billing totals</p>
        </div>
        <Card className="border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20">
          <CardContent className="flex items-center gap-4 p-6">
            <AlertTriangle className="h-6 w-6 text-red-500 shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-red-700 dark:text-red-300">Failed to load invoice register</p>
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
          <h1 className="text-2xl font-bold text-foreground">Invoice Register</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Every invoice issued — filterable register with billing totals</p>
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
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-red-100 text-red-600"><FileText className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Invoices</p></div><p className="text-xl font-bold tabular-nums">{summary?.count ?? 0}</p></CardContent></Card>
        <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-teal-100 text-teal-600"><IndianRupee className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Total Billed</p></div><p className="text-xl font-bold tabular-nums">{fmtINRDisplay(summary?.totalBilled ?? 0)}</p></CardContent></Card>
        <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-emerald-100 text-emerald-600"><CheckCircle2 className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Collected</p></div><p className="text-xl font-bold tabular-nums text-emerald-600">{fmtINRDisplay(summary?.totalPaid ?? 0)}</p></CardContent></Card>
        <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-amber-100 text-amber-600"><Wallet className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Outstanding</p></div><p className="text-xl font-bold tabular-nums text-red-600">{fmtINRDisplay(summary?.totalOutstanding ?? 0)}</p></CardContent></Card>
        <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-muted text-muted-foreground"><Ban className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Cancelled</p></div><p className="text-xl font-bold tabular-nums text-muted-foreground">{summary?.cancelledCount ?? 0}</p></CardContent></Card>
      </div>

      {/* Filters */}
      <Card className="rounded-xl border border-border/50 shadow-sm">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search invoice #, name, phone..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Status</SelectItem>
                {STATUS_ORDER.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
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
                  <TableHead className="text-xs font-medium uppercase">Invoice #</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Issue Date</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Due Date</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Subscriber</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Area</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Plan</TableHead>
                  <TableHead className="text-xs font-medium uppercase text-right">Grand Total</TableHead>
                  <TableHead className="text-xs font-medium uppercase text-right">Paid</TableHead>
                  <TableHead className="text-xs font-medium uppercase text-right">Balance</TableHead>
                  <TableHead className="text-xs font-medium uppercase">Status</TableHead>
                  <TableHead className="text-xs font-medium uppercase">360°</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-12 text-muted-foreground">No data for the selected filters</TableCell>
                  </TableRow>
                ) : rows.map((r) => (
                  <TableRow key={r.invoiceNumber} className="hover:bg-muted/50 transition-colors duration-150">
                    <TableCell className="font-mono text-xs">{r.invoiceNumber}</TableCell>
                    <TableCell className="text-xs">{r.issueDate ? formatDate(r.issueDate) : "—"}</TableCell>
                    <TableCell className="text-xs">{r.dueDate ? formatDate(r.dueDate) : "—"}</TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{r.subscriberName}</p>
                        <p className="text-xs text-muted-foreground">{r.subscriberCode}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{r.area || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.plan || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm font-semibold">{fmtINRDisplay(r.grandTotal)}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm text-green-700">{fmtINRDisplay(r.paidAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm font-semibold text-red-600">{fmtINRDisplay(r.balanceAmount)}</TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
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
