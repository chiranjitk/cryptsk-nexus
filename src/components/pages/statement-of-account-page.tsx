"use client";

// ─── Reports Phase 2 ─────────────────────────────────────────────────────────
// Nav registration (coordinator): label "Statement of Account" · href "/statement-of-account"
// Two modes: REGISTER (no subscriber) = per-subscriber rollup rows;
// LEDGER (subscriberId set) = subscriber info card + debit/credit entries.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users, IndianRupee, CheckCircle2, Wallet, AlertTriangle, Download, Printer,
  RefreshCw, Search, ArrowLeft, FileText, Eye,
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
type RegisterSummary = {
  from: string; to: string; subscriberCount: number;
  totalBilled: number; totalCollected: number; totalOutstanding: number;
};
type RegisterRow = {
  subscriberId: string; subscriberCode: string; name: string; phone: string;
  area: string; plan: string; invoiceCount: number;
  totalBilled: number; totalCollected: number; totalOutstanding: number;
  walletBalance: number; lastPaymentAt: string;
};
type RegisterData = { summary: RegisterSummary; rows: RegisterRow[] };

type LedgerSubscriber = {
  code: string; name: string; phone: string; email: string; status: string;
  plan: string; area: string; activationDate: string;
};
type LedgerSummary = {
  from: string; to: string; totalBilled: number; totalPaid: number;
  totalOutstanding: number; walletBalance: number; entryCount: number;
};
type LedgerEntry = {
  date: string; type: string; ref: string; description: string;
  debit: number; credit: number; balance: number;
};
type LedgerData = { summary: LedgerSummary; subscriber: LedgerSubscriber; entries: LedgerEntry[] };

// ─── Helpers ────────────────────────────────────────────
function toISO(d: Date) { return d.toISOString().split("T")[0]; }

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// Radix Select forbids SelectItem value="" — register mode uses a sentinel
// that maps back to subscriberId "" (= register mode) in state.
const REGISTER_SENTINEL = "__REGISTER__";

const STATUS_CLS: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  SUSPENDED: "bg-amber-100 text-amber-600",
  EXPIRED: "bg-red-100 text-red-700",
  DISCONNECTED: "bg-red-100 text-red-700",
};

function StatusBadge({ status }: { status: string }) {
  if (status === "ACTIVE") return <Badge variant="outline" className={`text-[10px] ${STATUS_CLS.ACTIVE}`}>Active</Badge>;
  if (status === "SUSPENDED") return <Badge variant="outline" className={`text-[10px] ${STATUS_CLS.SUSPENDED}`}>Suspended</Badge>;
  if (status === "EXPIRED" || status === "DISCONNECTED") return <Badge variant="destructive" className="text-[10px]">{status === "EXPIRED" ? "Expired" : "Disconnected"}</Badge>;
  return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
}

function EntryBadge({ type }: { type: string }) {
  if (type === "INVOICE") return <Badge variant="outline" className="text-[10px]">Invoice</Badge>;
  if (type === "PAYMENT") return <Badge variant="outline" className="text-[10px] bg-green-100 text-green-700 border-green-200">Payment</Badge>;
  if (type === "REFUND") return <Badge variant="destructive" className="text-[10px]">Refund</Badge>;
  return <Badge variant="outline" className="text-[10px]">{type}</Badge>;
}

const REGISTER_COLUMNS: ReportColumn<RegisterRow>[] = [
  { header: "Subscriber Code", key: "subscriberCode" },
  { header: "Subscriber", key: "name" },
  { header: "Phone", key: "phone" },
  { header: "Area", key: "area" },
  { header: "Plan", key: "plan" },
  { header: "Invoices", key: "invoiceCount" },
  { header: "Total Billed", key: "totalBilled", format: (v) => fmtINRDisplay(v) },
  { header: "Collected", key: "totalCollected", format: (v) => fmtINRDisplay(v) },
  { header: "Outstanding", key: "totalOutstanding", format: (v) => fmtINRDisplay(v) },
  { header: "Wallet Balance", key: "walletBalance", format: (v) => fmtINRDisplay(v) },
  { header: "Last Payment", key: "lastPaymentAt", format: (v) => (v ? formatDate(String(v)) : "") },
];

const LEDGER_COLUMNS: ReportColumn<LedgerEntry>[] = [
  { header: "Date", key: "date", format: (v) => (v ? formatDate(String(v)) : "") },
  { header: "Type", key: "type" },
  { header: "Reference", key: "ref" },
  { header: "Description", key: "description" },
  { header: "Debit", key: "debit", format: (v) => fmtINRDisplay(v) },
  { header: "Credit", key: "credit", format: (v) => fmtINRDisplay(v) },
  { header: "Running Balance", key: "balance", format: (v) => fmtINRDisplay(v) },
];

// ─── Page ───────────────────────────────────────────────
export default function StatementOfAccountPage() {
  const now = new Date();
  const [from, setFrom] = useState(toISO(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(toISO(now));
  const [subscriberId, setSubscriberId] = useState("");
  const [q, setQ] = useState("");

  const isLedger = subscriberId !== "";

  const buildFilterParams = () => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (subscriberId) params.set("subscriberId", subscriberId);
    if (q) params.set("q", q);
    return params;
  };

  // /api/subscribers returns { subscribers:[...], total } — NOT the success/data envelope.
  const { data: subsData } = useQuery<{ subscribers: { id: string; code: string; name: string }[] }>({
    queryKey: ["soa-subscriber-options"],
    queryFn: () => apiFetch<{ subscribers: { id: string; code: string; name: string }[] }>("/api/subscribers?limit=100").catch(() => ({ subscribers: [] })),
  });
  const subscribers = subsData?.subscribers || [];

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<RegisterData | LedgerData>({
    queryKey: ["statement-of-account", from, to, subscriberId, q],
    queryFn: () => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (subscriberId) params.set("subscriberId", subscriberId);
      if (q) params.set("q", q);
      return apiFetch<{ success: boolean; data: RegisterData | LedgerData }>(`/api/reports/statement-of-account?${params}`).then((j) => j.data);
    },
  });

  const reg = !isLedger ? (data as RegisterData | undefined) : undefined;
  const led = isLedger ? (data as LedgerData | undefined) : undefined;
  const regRows = reg?.rows || [];
  const entries = led?.entries || [];
  const summary = isLedger ? led?.summary : reg?.summary;

  const handleExportCsv = () => {
    if (isLedger) {
      if (entries.length === 0) return;
      downloadCsv("statement-of-account-ledger", LEDGER_COLUMNS, entries);
      toast.success("Subscriber ledger exported as CSV");
    } else {
      if (regRows.length === 0) return;
      downloadCsv("statement-of-account", REGISTER_COLUMNS, regRows);
      toast.success("Statement of account exported as CSV");
    }
  };

  // Server PDF export — register mode only (ledger uses Print / PDF client render).
  const handleExportPdf = async () => {
    try {
      await downloadServerFormat({
        basePath: "/api/reports/statement-of-account",
        params: Object.fromEntries(buildFilterParams()),
        format: "pdf",
        baseName: "statement-of-account",
      });
      toast.success("PDF exported");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF export failed");
    }
  };

  const handlePrint = () => {
    const periodMeta = `${summary?.from || from} to ${summary?.to || to}`;
    if (isLedger && led) {
      printReport<LedgerEntry>({
        title: "Statement of Account",
        subtitle: "Per-subscriber ledger — invoices, payments and running balance",
        meta: [
          { label: "Period", value: periodMeta },
          { label: "Subscriber", value: `${led.subscriber.code} — ${led.subscriber.name}` },
        ],
        columns: LEDGER_COLUMNS,
        rows: entries,
        totals: [
          { label: "Billed", value: fmtINRDisplay(led.summary.totalBilled) },
          { label: "Paid", value: fmtINRDisplay(led.summary.totalPaid) },
          { label: "Outstanding", value: fmtINRDisplay(led.summary.totalOutstanding) },
          { label: "Wallet Balance", value: fmtINRDisplay(led.summary.walletBalance) },
        ],
        baseName: "statement-of-account-ledger",
        orientation: "landscape",
      });
    } else if (reg) {
      printReport<RegisterRow>({
        title: "Statement of Account",
        subtitle: "Per-subscriber billing rollup — billed, collected and outstanding",
        meta: [
          { label: "Period", value: periodMeta },
          ...(q ? [{ label: "Search", value: q }] : []),
        ],
        columns: REGISTER_COLUMNS,
        rows: regRows,
        totals: [
          { label: "Subscribers", value: String(reg.summary.subscriberCount) },
          { label: "Total Billed", value: fmtINRDisplay(reg.summary.totalBilled) },
          { label: "Collected", value: fmtINRDisplay(reg.summary.totalCollected) },
          { label: "Outstanding", value: fmtINRDisplay(reg.summary.totalOutstanding) },
        ],
        baseName: "statement-of-account",
        orientation: "landscape",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div><Skeleton className="skeleton-wave h-7 w-56 mb-2" /><Skeleton className="skeleton-wave h-4 w-80" /></div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
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
          <h1 className="text-2xl font-bold text-foreground">Statement of Account</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Per-subscriber billing rollup and itemized ledgers</p>
        </div>
        <Card className="border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20">
          <CardContent className="flex items-center gap-4 p-6">
            <AlertTriangle className="h-6 w-6 text-red-500 shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-red-700 dark:text-red-300">Failed to load statement of account</p>
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
          <h1 className="text-2xl font-bold text-foreground">Statement of Account</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Per-subscriber billing rollup and itemized ledgers</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isLedger && (
            <Button variant="outline" size="sm" onClick={() => setSubscriberId("")}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1" />Back to Register
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={isLedger ? entries.length === 0 : regRows.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1" />Export CSV
          </Button>
          {!isLedger && (
            <Button variant="outline" size="sm" disabled={regRows.length === 0} onClick={handleExportPdf}>
              <FileText className="h-3.5 w-3.5 mr-1" />Export PDF
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handlePrint} disabled={isLedger ? entries.length === 0 : regRows.length === 0}>
            <Printer className="h-3.5 w-3.5 mr-1" />Print / PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="rounded-xl border border-border/50 shadow-sm">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {isLedger ? (
              <div className="relative" />
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search name, code, phone..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
              </div>
            )}
            <Select value={subscriberId === "" ? REGISTER_SENTINEL : subscriberId} onValueChange={(v) => setSubscriberId(v === REGISTER_SENTINEL ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Subscriber" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={REGISTER_SENTINEL}>All Subscribers — Register</SelectItem>
                {subscribers.map((s) => <SelectItem key={s.id} value={s.id}>{s.code} — {s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="From date" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} placeholder="To date" />
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isLedger ? (
          <>
            <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-teal-100 text-teal-600"><FileText className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Billed</p></div><p className="text-xl font-bold tabular-nums">{fmtINRDisplay(led?.summary.totalBilled ?? 0)}</p></CardContent></Card>
            <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-emerald-100 text-emerald-600"><CheckCircle2 className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Paid</p></div><p className="text-xl font-bold tabular-nums text-emerald-600">{fmtINRDisplay(led?.summary.totalPaid ?? 0)}</p></CardContent></Card>
            <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-amber-100 text-amber-600"><Wallet className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Outstanding</p></div><p className="text-xl font-bold tabular-nums text-red-600">{fmtINRDisplay(led?.summary.totalOutstanding ?? 0)}</p></CardContent></Card>
            <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-blue-100 text-blue-600"><IndianRupee className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Wallet Balance</p></div><p className="text-xl font-bold tabular-nums">{fmtINRDisplay(led?.summary.walletBalance ?? 0)}</p></CardContent></Card>
          </>
        ) : (
          <>
            <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-teal-100 text-teal-600"><Users className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Subscribers</p></div><p className="text-xl font-bold tabular-nums">{reg?.summary.subscriberCount ?? 0}</p></CardContent></Card>
            <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-amber-100 text-amber-600"><FileText className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Total Billed</p></div><p className="text-xl font-bold tabular-nums">{fmtINRDisplay(reg?.summary.totalBilled ?? 0)}</p></CardContent></Card>
            <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-emerald-100 text-emerald-600"><CheckCircle2 className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Collected</p></div><p className="text-xl font-bold tabular-nums text-emerald-600">{fmtINRDisplay(reg?.summary.totalCollected ?? 0)}</p></CardContent></Card>
            <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200"><CardContent className="p-4"><div className="flex items-center gap-2 mb-2"><div className="p-1.5 rounded-md bg-red-100 text-red-600"><Wallet className="h-4 w-4" /></div><p className="text-xs font-medium text-muted-foreground">Outstanding</p></div><p className="text-xl font-bold tabular-nums text-red-600">{fmtINRDisplay(reg?.summary.totalOutstanding ?? 0)}</p></CardContent></Card>
          </>
        )}
      </div>

      {/* Ledger mode: subscriber info card */}
      {isLedger && led?.subscriber && (
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <p className="text-sm font-bold">{led.subscriber.name}</p>
                <p className="text-xs text-muted-foreground">{led.subscriber.code}{led.subscriber.plan ? ` · ${led.subscriber.plan}` : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={led.subscriber.status} />
                <Button variant="outline" size="sm" title="View 360° Customer View" onClick={() => openSubscriber360(subscriberId)}>
                  <Eye className="h-3.5 w-3.5 mr-1" />View 360°
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div><p className="text-muted-foreground">Phone</p><p className="font-medium mt-0.5">{led.subscriber.phone || "—"}</p></div>
              <div><p className="text-muted-foreground">Email</p><p className="font-medium mt-0.5 max-w-[200px] truncate">{led.subscriber.email || "—"}</p></div>
              <div><p className="text-muted-foreground">Area</p><p className="font-medium mt-0.5">{led.subscriber.area || "—"}</p></div>
              <div><p className="text-muted-foreground">Activation Date</p><p className="font-medium mt-0.5">{led.subscriber.activationDate ? formatDate(led.subscriber.activationDate) : "—"}</p></div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table: register rollup OR itemized ledger */}
      <Card className="rounded-xl border border-border/50 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {isLedger ? (
                    <>
                      <TableHead className="text-xs font-medium uppercase">Date</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Type</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Reference</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Description</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-right">Debit</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-right">Credit</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-right">Running Balance</TableHead>
                    </>
                  ) : (
                    <>
                      <TableHead className="text-xs font-medium uppercase">Subscriber</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Phone</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Area</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Plan</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-right">Invoices</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-right">Billed</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-right">Collected</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-right">Outstanding</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-right">Wallet</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Last Payment</TableHead>
                      <TableHead className="text-xs font-medium uppercase">360°</TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLedger ? (
                  entries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No data for the selected filters</TableCell>
                    </TableRow>
                  ) : entries.map((e, i) => (
                    <TableRow key={i} className="hover:bg-muted/50 transition-colors duration-150">
                      <TableCell className="text-xs whitespace-nowrap">{e.date ? formatDate(e.date) : "—"}</TableCell>
                      <TableCell><EntryBadge type={e.type} /></TableCell>
                      <TableCell className="font-mono text-xs">{e.ref || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{e.description || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{e.debit ? fmtINRDisplay(e.debit) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-green-700">{e.credit ? fmtINRDisplay(e.credit) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm font-semibold">{fmtINRDisplay(e.balance)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  regRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center py-12 text-muted-foreground">No data for the selected filters</TableCell>
                    </TableRow>
                  ) : regRows.map((r) => (
                    <TableRow key={r.subscriberId} className="hover:bg-muted/50 transition-colors duration-150">
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium">{r.name}</p>
                          <p className="text-xs text-muted-foreground">{r.subscriberCode}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{r.phone || "—"}</TableCell>
                      <TableCell className="text-sm">{r.area || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.plan || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{r.invoiceCount}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm font-semibold">{fmtINRDisplay(r.totalBilled)}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-green-700">{fmtINRDisplay(r.totalCollected)}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm font-semibold text-red-600">{fmtINRDisplay(r.totalOutstanding)}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{fmtINRDisplay(r.walletBalance)}</TableCell>
                      <TableCell className="text-xs">{r.lastPaymentAt ? formatDate(r.lastPaymentAt) : "—"}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="View 360° Customer View"
                          onClick={() => openSubscriber360(r.subscriberId)} disabled={!r.subscriberId}>
                          <Eye className="h-3.5 w-3.5" />
                          <span className="sr-only">View 360°</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
