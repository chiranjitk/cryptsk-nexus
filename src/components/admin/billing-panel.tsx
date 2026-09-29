"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Search, FileText, IndianRupee, CheckCircle, Clock,
  AlertCircle, TrendingUp, Wallet, Gift, MoreHorizontal, Eye,
  Ticket, TicketCheck, RefreshCw, Ban, Copy, Check, Loader2, Download,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { relTime } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";

type Invoice = {
  id: string; invoiceNumber: string; issueDate: string; dueDate: string;
  subtotal: number; taxAmount: number; total: number; paidAmount: number;
  balanceDue: number; status: string; paymentStatus: string;
  customer: { displayName: string; customerCode: string; email: string | null };
  _count: { lines: number; payments: number };
};

type VoucherStatusValue = "unused" | "used" | "expired" | "cancelled";

type Voucher = {
  id: string; code: string; faceValue: number; status: VoucherStatusValue;
  batchNumber: string | null; validityDays: number | null;
  usedAt: string | null; usedBy: string | null;
  activatedAt: string | null; expiresAt: string | null; createdAt: string;
};

type VoucherKpis = {
  total: number; unused: number; used: number; expired: number; cancelled: number; totalFaceValue: number;
};

type GenerateVouchersResult = { batchNumber: string; created: number; faceValue: number; codes: string[] };

const VOUCHER_STATUS_BADGES: Record<VoucherStatusValue, string> = {
  unused: "border-emerald-500/30 bg-emerald-500/5 text-emerald-600",
  used: "border-muted bg-muted/30 text-muted-foreground",
  expired: "border-amber-500/30 bg-amber-500/5 text-amber-600",
  cancelled: "border-red-500/30 bg-red-500/5 text-red-600",
};

function fmtCurrency(amount: number) {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getVoucherStatusBadge(status: VoucherStatusValue) {
  return (
    <Badge variant="outline" className={`text-[10px] capitalize ${VOUCHER_STATUS_BADGES[status] || ""}`}>
      {status}
    </Badge>
  );
}

export function BillingPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("");
  const [showCreate, setShowCreate] = React.useState(false);
  const [showPayment, setShowPayment] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<"invoices" | "payments" | "vouchers">("invoices");
  const [voucherSearch, setVoucherSearch] = React.useState("");
  const [voucherStatus, setVoucherStatus] = React.useState("");
  const [showGenerate, setShowGenerate] = React.useState(false);
  const [batchResult, setBatchResult] = React.useState<GenerateVouchersResult | null>(null);

  const { data: invData, isLoading: invLoading } = useQuery({
    queryKey: ["invoices", search, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/invoices?${params}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: payData, isLoading: payLoading } = useQuery({
    queryKey: ["payments", search, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/payments?${params}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: voucherData, isLoading: vouchersLoading, isError: vouchersError, refetch: refetchVouchers } = useQuery({
    queryKey: ["vouchers", voucherSearch, voucherStatus],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (voucherSearch) params.set("search", voucherSearch);
      if (voucherStatus) params.set("status", voucherStatus);
      params.set("limit", "100");
      const res = await fetch(`/api/vouchers?${params}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const invoices: Invoice[] = invData?.invoices || [];
  const payments: any[] = payData?.payments || [];
  const vouchers: Voucher[] = voucherData?.vouchers || [];
  const voucherKpis: VoucherKpis | undefined = voucherData?.kpis;
  const expiredOrCancelled = (voucherKpis?.expired ?? 0) + (voucherKpis?.cancelled ?? 0);

  const cancelVoucher = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/vouchers/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed"); }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Voucher cancelled", description: "The code can no longer be redeemed." });
      qc.invalidateQueries({ queryKey: ["vouchers"] });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // Voucher CSV export — plain fetch (same credentials as every request in
  // this file) → blob → programmatic <a download> click. The status filter
  // always rides along; batchNumber only when the search text is a batch
  // number (otherwise the search box matches code substrings, which the
  // export does not filter on). No query keys — this is not cached.
  const [exportingCsv, setExportingCsv] = React.useState(false);

  async function handleExportCsv() {
    if (exportingCsv || vouchers.length === 0) return;
    setExportingCsv(true);
    try {
      const params = new URLSearchParams();
      if (voucherStatus) params.set("status", voucherStatus);
      const batchMatch = /^VCH-/i.test(voucherSearch.trim());
      if (batchMatch) params.set("batchNumber", voucherSearch.trim());
      const res = await fetch(`/api/vouchers/export?${params}`);
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Prefer the server's attachment filename; derive a truthful fallback
      // in the same vouchers-<batch|all>-<YYYYMMDD>.csv shape.
      const cd = res.headers.get("content-disposition");
      const serverName = cd?.match(/filename\*?="?([^";]+)"?/i)?.[1];
      const now = new Date();
      const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
      a.download = serverName || `vouchers-${batchMatch ? voucherSearch.trim() : "all"}-${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      // Row count is only derivable when no filters are active — kpis.total
      // is the whole-table aggregate, so it equals the unfiltered export.
      const noFilters = !voucherStatus && !batchMatch;
      if (noFilters && voucherKpis) {
        toast({ title: "Voucher CSV exported", description: `${voucherKpis.total} rows` });
      } else {
        toast({ title: "Voucher CSV exported" });
      }
    } catch {
      toast({ title: "Could not export vouchers", variant: "destructive" });
    } finally {
      setExportingCsv(false);
    }
  }

  // Stats
  const totalIssued = invoices.reduce((sum, i) => sum + i.total, 0);
  const totalPaid = invoices.reduce((sum, i) => sum + i.paidAmount, 0);
  const totalOutstanding = invoices.reduce((sum, i) => sum + i.balanceDue, 0);
  const overdueCount = invoices.filter(i => i.status === "overdue" || (i.status === "issued" && new Date(i.dueDate) < new Date())).length;

  function getStatusBadge(status: string, dueDate?: string) {
    if (status === "paid") return <Badge variant="outline" className="text-[10px] border-emerald-500/30 bg-emerald-500/5 text-emerald-600"><CheckCircle className="size-3 mr-1" />Paid</Badge>;
    if (status === "partial") return <Badge variant="outline" className="text-[10px] border-amber-500/30 bg-amber-500/5 text-amber-600"><Clock className="size-3 mr-1" />Partial</Badge>;
    if (status === "overdue" || (status === "issued" && dueDate && new Date(dueDate) < new Date())) return <Badge variant="outline" className="text-[10px] border-rose-500/30 bg-rose-500/5 text-rose-600"><AlertCircle className="size-3 mr-1" />Overdue</Badge>;
    if (status === "issued") return <Badge variant="outline" className="text-[10px] border-blue-500/30 bg-blue-500/5 text-blue-600"><Clock className="size-3 mr-1" />Issued</Badge>;
    if (status === "draft") return <Badge variant="outline" className="text-[10px] text-muted-foreground">Draft</Badge>;
    if (status === "cancelled" || status === "void") return <Badge variant="outline" className="text-[10px] border-muted text-muted-foreground">{status}</Badge>;
    return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 cryptsk-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Billing &amp; Finance</h1>
          <p className="text-sm text-muted-foreground">
            {invoices.length} invoices · {payments.length} payments{voucherKpis ? ` · ${voucherKpis.total} vouchers` : ""} · GST 18%
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex rounded-md border p-0.5" role="tablist" aria-label="Billing views">
            {([
              { id: "invoices" as const, label: "Invoices", icon: FileText },
              { id: "payments" as const, label: "Payments", icon: Wallet },
              { id: "vouchers" as const, label: "Vouchers", icon: Ticket },
            ]).map((v) => (
              <button
                key={v.id}
                role="tab"
                aria-selected={tab === v.id}
                onClick={() => setTab(v.id)}
                className={`flex items-center gap-1.5 rounded-[4px] px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  tab === v.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <v.icon className="size-3.5" aria-hidden="true" />
                {v.label}
              </button>
            ))}
          </div>
          {tab === "invoices" && (
            <Button className="gap-2" onClick={() => setShowCreate(true)}>
              <Plus className="size-4" /> Create Invoice
            </Button>
          )}
          {tab === "vouchers" && (
            <Button className="gap-2" onClick={() => setShowGenerate(true)}>
              <Plus className="size-4" /> Generate Batch
            </Button>
          )}
        </div>
      </div>

      {/* Stats cards */}
      {tab === "vouchers" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card className="card-lift cryptsk-card-load">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Total Vouchers</CardTitle>
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10"><Ticket className="size-4 text-primary" /></div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums">{voucherKpis?.total ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">prepaid recharge codes</p>
            </CardContent>
          </Card>
          <Card className="card-lift cryptsk-card-load" style={{ animationDelay: "50ms" }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Unused</CardTitle>
              <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10"><CheckCircle className="size-4 text-emerald-500" /></div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums text-emerald-600">{voucherKpis?.unused ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">ready to hand out</p>
            </CardContent>
          </Card>
          <Card className="card-lift cryptsk-card-load" style={{ animationDelay: "100ms" }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Used</CardTitle>
              <div className="flex size-8 items-center justify-center rounded-lg bg-muted"><TicketCheck className="size-4 text-muted-foreground" /></div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums">{voucherKpis?.used ?? 0}</div>
              <p className="text-xs text-muted-foreground mt-1">redeemed</p>
            </CardContent>
          </Card>
          <Card className="card-lift cryptsk-card-load" style={{ animationDelay: "150ms" }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Expired / Cancelled</CardTitle>
              <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10"><AlertCircle className="size-4 text-amber-500" /></div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums text-amber-600">{expiredOrCancelled}</div>
              <p className="text-xs text-muted-foreground mt-1">void codes</p>
            </CardContent>
          </Card>
          <Card className="card-lift cryptsk-card-load" style={{ animationDelay: "200ms" }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Total Face Value</CardTitle>
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10"><IndianRupee className="size-4 text-primary" /></div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums text-primary">{fmtCurrency(voucherKpis?.totalFaceValue ?? 0)}</div>
              <p className="text-xs text-muted-foreground mt-1">all vouchers issued</p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="card-lift cryptsk-card-load">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total Issued</CardTitle>
            <div className="flex size-8 items-center justify-center rounded-lg bg-blue-500/10"><IndianRupee className="size-4 text-blue-500" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{fmtCurrency(totalIssued)}</div>
            <p className="text-xs text-muted-foreground mt-1">{invoices.length} invoices</p>
          </CardContent>
        </Card>
        <Card className="card-lift cryptsk-card-load" style={{ animationDelay: "50ms" }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Collected</CardTitle>
            <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10"><TrendingUp className="size-4 text-emerald-500" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-emerald-600">{fmtCurrency(totalPaid)}</div>
            <p className="text-xs text-muted-foreground mt-1">{payments.length} payments</p>
          </CardContent>
        </Card>
        <Card className="card-lift cryptsk-card-load" style={{ animationDelay: "100ms" }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Outstanding</CardTitle>
            <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10"><Clock className="size-4 text-amber-500" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-amber-600">{fmtCurrency(totalOutstanding)}</div>
            <p className="text-xs text-muted-foreground mt-1">awaiting payment</p>
          </CardContent>
        </Card>
        <Card className="card-lift cryptsk-card-load" style={{ animationDelay: "150ms" }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Overdue</CardTitle>
            <div className="flex size-8 items-center justify-center rounded-lg bg-rose-500/10"><AlertCircle className="size-4 text-rose-500" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-rose-600">{overdueCount}</div>
            <p className="text-xs text-muted-foreground mt-1">past due date</p>
          </CardContent>
        </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{tab === "invoices" ? "All Invoices" : tab === "payments" ? "All Payments" : "Voucher Batches"}</CardTitle>
            <div className="flex gap-2">
              {tab === "vouchers" ? (
                <>
                  <select value={voucherStatus} onChange={(e) => setVoucherStatus(e.target.value)} aria-label="Filter vouchers by status" className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">All status</option>
                    <option value="unused">Unused</option>
                    <option value="used">Used</option>
                    <option value="expired">Expired</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  <Button variant="outline" size="sm" className="h-9 gap-1.5 px-3" onClick={() => refetchVouchers()} disabled={vouchersLoading} aria-label="Refresh vouchers">
                    <RefreshCw className={`size-3.5 ${vouchersLoading ? "animate-spin" : ""}`} /> Refresh
                  </Button>
                  <Button
                    variant="outline" size="sm" className="h-9 gap-1.5 px-3"
                    onClick={handleExportCsv}
                    disabled={exportingCsv || vouchers.length === 0}
                    aria-label="Export vouchers as CSV"
                  >
                    {exportingCsv ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />} Export CSV
                  </Button>
                </>
              ) : (
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status" className="h-9 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">All status</option>
                  <option value="issued">Issued</option>
                  <option value="paid">Paid</option>
                  <option value="partial">Partial</option>
                  <option value="overdue">Overdue</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              )}
              <div className="relative">
                <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={tab === "vouchers" ? "Search code or batch…" : `Search ${tab}…`}
                  value={tab === "vouchers" ? voucherSearch : search}
                  onChange={(e) => (tab === "vouchers" ? setVoucherSearch(e.target.value) : setSearch(e.target.value))}
                  className="h-9 w-48 pl-8 text-sm"
                  aria-label={tab === "vouchers" ? "Search vouchers" : `Search ${tab}`}
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {tab === "vouchers" ? (
            <VouchersTable
              vouchers={vouchers}
              loading={vouchersLoading}
              isError={!!vouchersError}
              onRetry={() => refetchVouchers()}
              onCancel={(id) => cancelVoucher.mutate(id)}
              cancelling={cancelVoucher.isPending}
              onGenerate={() => setShowGenerate(true)}
            />
          ) : tab === "invoices" ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Issue Date</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invLoading ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-8"><div className="size-6 mx-auto rounded-full border-2 border-primary border-t-transparent cryptsk-spin" /></TableCell></TableRow>
                  ) : invoices.map((inv) => (
                    <TableRow key={inv.id} className="hover:bg-muted/50">
                      <TableCell className="text-sm font-mono font-medium">{inv.invoiceNumber}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="size-6"><AvatarFallback className="bg-primary/10 text-primary text-[9px] font-bold">{inv.customer.displayName.charAt(0)}</AvatarFallback></Avatar>
                          <div>
                            <p className="text-sm font-medium">{inv.customer.displayName}</p>
                            <p className="text-[10px] text-muted-foreground">{inv.customer.customerCode}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(inv.issueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(inv.dueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</TableCell>
                      <TableCell className="text-sm font-semibold tabular-nums">{fmtCurrency(inv.total)}</TableCell>
                      <TableCell className="text-sm tabular-nums text-emerald-600">{fmtCurrency(inv.paidAmount)}</TableCell>
                      <TableCell className="text-sm tabular-nums text-amber-600">{fmtCurrency(inv.balanceDue)}</TableCell>
                      <TableCell>{getStatusBadge(inv.status, inv.dueDate)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem><Eye className="mr-2 size-4" /> View</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setShowPayment(inv.id)}><Wallet className="mr-2 size-4" /> Record Payment</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem><Gift className="mr-2 size-4" /> Send Reminder</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                  {invoices.length === 0 && !invLoading && (
                    <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">No invoices found. Click "Create Invoice" to make one.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payment #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payLoading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8"><div className="size-6 mx-auto rounded-full border-2 border-primary border-t-transparent cryptsk-spin" /></TableCell></TableRow>
                  ) : payments.map((pay) => (
                    <TableRow key={pay.id} className="hover:bg-muted/50">
                      <TableCell className="text-sm font-mono">{pay.paymentNumber}</TableCell>
                      <TableCell className="text-sm">{pay.customer?.displayName || "—"}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{pay.invoice?.invoiceNumber || "—"}</TableCell>
                      <TableCell className="text-sm font-semibold tabular-nums text-emerald-600">{fmtCurrency(pay.amount)}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px] capitalize">{pay.method}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(pay.receivedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${pay.status === "completed" ? "border-emerald-500/30 text-emerald-600" : "border-amber-500/30 text-amber-600"}`}>{pay.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {payments.length === 0 && !payLoading && (
                    <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">No payments recorded yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {showCreate && <CreateInvoiceDialog onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ["invoices"] }); }} />}
      {showPayment && <PaymentDialog invoiceId={showPayment} onClose={() => setShowPayment(null)} onSaved={() => { setShowPayment(null); qc.invalidateQueries({ queryKey: ["invoices"] }); qc.invalidateQueries({ queryKey: ["payments"] }); }} />}
      {showGenerate && (
        <GenerateVouchersDialog
          onClose={() => setShowGenerate(false)}
          onSaved={(result) => {
            setShowGenerate(false);
            setBatchResult(result);
            qc.invalidateQueries({ queryKey: ["vouchers"] });
            toast({ title: `Batch ${result.batchNumber} · ${result.created} vouchers created` });
          }}
        />
      )}
      {batchResult && <VoucherBatchResultDialog result={batchResult} onClose={() => setBatchResult(null)} />}
    </div>
  );
}

function CreateInvoiceDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [customerId, setCustomerId] = React.useState("");
  const [dueDate, setDueDate] = React.useState(new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10));
  const [description, setDescription] = React.useState("Monthly Broadband Plan");
  const [quantity, setQuantity] = React.useState("1");
  const [unitPrice, setUnitPrice] = React.useState("500");
  const [taxRate, setTaxRate] = React.useState("18");
  const [discountPercent, setDiscountPercent] = React.useState("0");

  // Fetch customers
  const { data: custData } = useQuery({
    queryKey: ["customers-for-invoice"],
    queryFn: async () => { const res = await fetch("/api/customers"); if (!res.ok) return { customers: [] }; return res.json(); },
  });
  const customers: any[] = custData?.customers || [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const lines = [{ description, quantity: Number(quantity), unitPrice: Number(unitPrice) }];
      const res = await fetch("/api/invoices", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, dueDate, lines, taxRate: Number(taxRate), discountPercent: Number(discountPercent) }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed"); }
      const data = await res.json();
      toast({ title: "Invoice created", description: `${data.invoice.invoiceNumber} — ₹${data.invoice.total.toFixed(2)}` });
      onSaved();
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
  }

  const subtotal = Number(quantity) * Number(unitPrice);
  const discount = subtotal * (Number(discountPercent) / 100);
  const taxable = subtotal - discount;
  const tax = taxable * (Number(taxRate) / 100);
  const total = taxable + tax;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg cryptsk-card-load">
        <DialogHeader><DialogTitle>Create Invoice</DialogTitle><DialogDescription>Bill a customer for services</DialogDescription></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Customer</Label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Select customer…</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.displayName} ({c.customerCode})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Due Date</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required className="h-9" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Tax Rate (GST %)</Label><Input type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className="h-9" /></div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} required className="h-9" /></div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">Qty</Label><Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="h-9" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Unit Price (₹)</Label><Input type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className="h-9" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Discount %</Label><Input type="number" value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} className="h-9" /></div>
          </div>
          <div className="rounded-lg border bg-muted/50 p-3 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">₹{subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="tabular-nums">-₹{discount.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Tax ({taxRate}%)</span><span className="tabular-nums">₹{tax.toFixed(2)}</span></div>
            <div className="flex justify-between font-bold border-t pt-1"><span>Total</span><span className="tabular-nums">₹{total.toFixed(2)}</span></div>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit">Create Invoice</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PaymentDialog({ invoiceId, onClose, onSaved }: { invoiceId: string; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState("cash");
  const [transactionId, setTransactionId] = React.useState("");
  const [notes, setNotes] = React.useState("");

  // Get invoice to know balance + customer
  const { data: invData } = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: async () => {
      const res = await fetch(`/api/invoices/${invoiceId}`);
      if (!res.ok) return null;
      return res.json();
    },
  });
  const invoice = invData?.invoice;
  const customerId = invoice?.customerId || "";
  const balance = invoice?.balanceDue || 0;

  React.useEffect(() => { if (balance > 0 && !amount) setAmount(String(balance)); }, [balance]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch("/api/payments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId, customerId, amount: Number(amount), method, transactionId, notes }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed"); }
      toast({ title: "Payment recorded", description: `₹${Number(amount).toFixed(2)} via ${method}` });
      onSaved();
    } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md cryptsk-card-load">
        <DialogHeader><DialogTitle>Record Payment</DialogTitle><DialogDescription>{invoice?.invoiceNumber} — Balance: ₹{balance.toFixed(2)}</DialogDescription></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5"><Label className="text-xs">Amount (₹)</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} required className="h-9" /></div>
          <div className="space-y-1.5"><Label className="text-xs">Method</Label>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
              <option value="cash">Cash</option><option value="card">Card</option><option value="upi">UPI</option>
              <option value="bank_transfer">Bank Transfer</option><option value="wallet">Wallet</option>
              <option value="cheque">Cheque</option><option value="razorpay">Razorpay</option><option value="stripe">Stripe</option>
            </select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Transaction ID (optional)</Label><Input value={transactionId} onChange={(e) => setTransactionId(e.target.value)} className="h-9 font-mono" /></div>
          <div className="space-y-1.5"><Label className="text-xs">Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-9" /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit">Record Payment</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- vouchers tab: table ----------

function VouchersTable({ vouchers, loading, isError, onRetry, onCancel, cancelling, onGenerate }: {
  vouchers: Voucher[]; loading: boolean; isError: boolean; onRetry: () => void;
  onCancel: (id: string) => void; cancelling: boolean; onGenerate: () => void;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Batch</TableHead>
            <TableHead>Face Value</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Used</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={7} className="py-4">
                <div className="space-y-2 px-4" aria-busy="true">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
                </div>
              </TableCell>
            </TableRow>
          ) : isError ? (
            <TableRow>
              <TableCell colSpan={7} className="py-10">
                <div className="flex flex-col items-center gap-1.5" role="alert">
                  <AlertCircle className="size-8 text-amber-500" />
                  <p className="text-sm font-medium">Failed to load vouchers</p>
                  <p className="text-xs text-muted-foreground">The request failed. Check your connection and try again.</p>
                  <Button size="sm" variant="outline" className="mt-2 gap-1.5" onClick={onRetry}>
                    <RefreshCw className="size-3.5" /> Retry
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            <>
              {vouchers.map((v) => (
                <TableRow key={v.id} className="hover:bg-muted/50">
                  <TableCell className="text-sm font-mono font-medium tracking-wide">{v.code}</TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">{v.batchNumber || "—"}</TableCell>
                  <TableCell className="text-sm font-semibold tabular-nums">{fmtCurrency(v.faceValue)}</TableCell>
                  <TableCell>{getVoucherStatusBadge(v.status)}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {v.usedAt ? (
                      <span title={`${new Date(v.usedAt).toLocaleString("en-IN")}${v.usedBy ? ` · used by ${v.usedBy}` : ""}`}>
                        {relTime(v.usedAt)}
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {v.expiresAt ? (
                      <span title={new Date(v.expiresAt).toLocaleString("en-IN")}>
                        {new Date(v.expiresAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    {v.status === "unused" ? (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost" size="icon"
                            className="size-8 text-muted-foreground hover:text-destructive"
                            disabled={cancelling}
                            aria-label={`Cancel voucher ${v.code}`}
                          >
                            <Ban className="size-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-base">Cancel voucher {v.code}?</AlertDialogTitle>
                            <AlertDialogDescription className="text-sm">
                              The code will be voided and can no longer be redeemed for {fmtCurrency(v.faceValue)}. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep Voucher</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => onCancel(v.id)}
                            >
                              Cancel Voucher
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {vouchers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10">
                    <div className="flex flex-col items-center gap-1.5">
                      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                        <Gift className="size-6 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium">No vouchers yet</p>
                      <p className="max-w-sm text-center text-xs text-muted-foreground">Generate a batch to hand out prepaid recharge codes.</p>
                      <Button size="sm" className="mt-2 gap-1.5" onClick={onGenerate}>
                        <Plus className="size-3.5" /> Generate Batch
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------- vouchers tab: generate batch dialog ----------

function GenerateVouchersDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (result: GenerateVouchersResult) => void }) {
  const { toast } = useToast();
  const [count, setCount] = React.useState("10");
  const [faceValue, setFaceValue] = React.useState("100");
  const [validityDays, setValidityDays] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const countNum = Number(count);
  const fvNum = Number(faceValue);
  const vdNum = Number(validityDays);
  const countInvalid = count.trim() === "" || !Number.isInteger(countNum) || countNum < 1 || countNum > 100;
  const fvInvalid = faceValue.trim() === "" || !(fvNum > 0);
  const vdInvalid = validityDays.trim() !== "" && (!Number.isInteger(vdNum) || vdNum < 1 || vdNum > 3650);
  const totalValue = countNum > 0 && fvNum > 0 ? countNum * fvNum : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (countInvalid || fvInvalid || submitting) return;
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { count: countNum, faceValue: fvNum };
      if (validityDays.trim() !== "" && !vdInvalid) body.validityDays = vdNum;
      const res = await fetch("/api/vouchers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed"); }
      const data: GenerateVouchersResult = await res.json();
      onSaved(data);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md cryptsk-card-load">
        <DialogHeader>
          <DialogTitle>Generate Voucher Batch</DialogTitle>
          <DialogDescription>Create a batch of one-time prepaid recharge codes</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="voucher-count">Number of codes</Label>
              <Input
                id="voucher-count" type="number" min={1} max={100} step={1}
                value={count} onChange={(e) => setCount(e.target.value)} required className="h-9"
                aria-invalid={count !== "" && countInvalid ? true : undefined}
              />
              <p className="text-[10px] text-muted-foreground">Between 1 and 100 codes per batch.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="voucher-face-value">Face value (₹)</Label>
              <Input
                id="voucher-face-value" type="number" min={0.01} step={0.01}
                value={faceValue} onChange={(e) => setFaceValue(e.target.value)} required className="h-9"
                aria-invalid={faceValue !== "" && fvInvalid ? true : undefined}
              />
              <p className="text-[10px] text-muted-foreground">Recharge value per code.</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor="voucher-validity">Validity days (optional)</Label>
            <Input
              id="voucher-validity" type="number" min={1} step={1}
              value={validityDays} onChange={(e) => setValidityDays(e.target.value)}
              placeholder="e.g. 90" className="h-9"
              aria-invalid={vdInvalid ? true : undefined}
            />
            <p className={`text-[10px] ${vdInvalid ? "font-medium text-red-600" : "text-muted-foreground"}`}>
              {vdInvalid ? "Whole days between 1 and 3650." : "Days the code stays redeemable after generation."}
            </p>
          </div>
          {totalValue > 0 && (
            <div className="rounded-lg border bg-muted/50 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Batch total face value</span>
                <span className="font-semibold tabular-nums">{fmtCurrency(totalValue)}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="gap-1.5" disabled={countInvalid || fvInvalid || vdInvalid || submitting}>
              {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              Generate{!countInvalid ? ` ${countNum}` : ""} Codes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- vouchers tab: batch result dialog (codes are one-time secrets — full visibility) ----------

function VoucherBatchResultDialog({ result, onClose }: { result: GenerateVouchersResult; onClose: () => void }) {
  const { toast } = useToast();
  const [copied, setCopied] = React.useState(false);

  async function copyAll() {
    const text = result.codes.join("\n");
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      toast({ title: "Copied to clipboard", description: `${result.codes.length} codes copied — paste into your dispensing sheet.` });
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast({ title: "Copy failed", description: "Select the codes below and copy them manually.", variant: "destructive" });
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md cryptsk-card-load">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="size-4 text-emerald-500" /> Batch {result.batchNumber} generated
          </DialogTitle>
          <DialogDescription>
            {result.created} vouchers · {fmtCurrency(result.faceValue)} face value each — one-time secrets; share each code with a single customer.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-72 overflow-y-auto rounded-md border bg-muted/30 p-3 cryptsk-scrollbar" aria-label="Generated voucher codes">
          <ol className="space-y-1 font-mono text-xs">
            {result.codes.map((c, i) => (
              <li key={c} className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">{i + 1}</span>
                <span className="font-medium tracking-wide">{c}</span>
              </li>
            ))}
          </ol>
        </div>
        <DialogFooter>
          <Button variant="outline" className="gap-1.5" onClick={copyAll}>
            {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
            {copied ? "Copied" : `Copy all (${result.codes.length})`}
          </Button>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
