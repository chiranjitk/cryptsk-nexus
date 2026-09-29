"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, formatINR } from "@/lib/utils";
import {
  FileText, Search, Send, CreditCard, Eye, X, FilePlus,
  IndianRupee, Edit2, Ban, CalendarDays, FileSpreadsheet, Plus,
  Receipt, CheckCircle, Clock, DollarSign,
} from "lucide-react";
import PageHeader from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────
interface Invoice {
  id: string; invoiceNumber: string; subscriberId: string; planId: string | null;
  issueDate: string; dueDate: string; periodStart: string; periodEnd: string;
  description: string; subtotal: number; cgstAmount: number; sgstAmount: number;
  igstAmount: number; totalTax: number; totalAmount: number; discountAmount: number;
  discountType: string | null; discountValue: number;
  lateFee: number; advanceAdjustment: number; grandTotal: number; paidAmount: number;
  balanceAmount: number; status: string; paidAt: string | null; notes: string; createdAt: string;
  subscriber: { id: string; name: string; code: string } | null;
  plan: { id: string; name: string } | null;
}

interface InvoiceDetail extends Invoice {
  payments: { id: string; receiptNumber: string; amount: number; paymentMode: string; status: string; createdAt: string }[];
}

interface StatusCounts {
  DRAFT: number; SENT: number; PAID: number; PARTIALLY_PAID: number; OVERDUE: number; CANCELLED: number;
}

interface SubOption { id: string; name: string; code: string }

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_MAP: Record<string, { label: string; class: string; dotClass: string; pulse?: boolean }> = {
  DRAFT: { label: "Draft", class: "bg-gray-100 text-gray-600", dotClass: "bg-gray-400" },
  SENT: { label: "Sent", class: "bg-blue-100 text-blue-700", dotClass: "bg-blue-500" },
  PAID: { label: "Paid", class: "bg-green-100 text-green-700", dotClass: "bg-green-500" },
  PARTIALLY_PAID: { label: "Partial", class: "bg-blue-100 text-blue-700", dotClass: "bg-blue-500" },
  OVERDUE: { label: "Overdue", class: "bg-red-100 text-red-700", dotClass: "bg-red-500", pulse: true },
  CANCELLED: { label: "Cancelled", class: "bg-slate-100 text-slate-600", dotClass: "bg-slate-400" },
};

const emptyEditForm = {
  description: "", discountType: "" as string, discountValue: "", discountAmount: "", lateFee: "", notes: "",
};

export default function BillingPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [subscriberFilter, setSubscriberFilter] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [dateFromOpen, setDateFromOpen] = useState(false);
  const [dateToOpen, setDateToOpen] = useState(false);

  // Multi-select mode
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Dialogs
  const [detailOpen, setDetailOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [editForm, setEditForm] = useState(emptyEditForm);
  const [cancelReason, setCancelReason] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("CASH");
  const [paymentRef, setPaymentRef] = useState("");

  // Manual create form
  const today = new Date().toISOString().split("T")[0];
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
  const lastOfMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split("T")[0];
  const dueDate = new Date(new Date().getFullYear(), new Date().getMonth(), 10).toISOString().split("T")[0];
  const [createForm, setCreateForm] = useState({
    subscriberId: "", issueDate: today, dueDate, periodStart: firstOfMonth,
    periodEnd: lastOfMonth, description: "", discountType: "", discountValue: "",
    lateFee: "", notes: "", status: "DRAFT",
  });

  // Fetch invoices
  const { data, isLoading } = useQuery<{ invoices: Invoice[]; total: number; page: number; totalPages: number; statusCounts: StatusCounts }>({
    queryKey: ["billing", page, search, statusFilter, subscriberFilter, dateFrom, dateTo],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: "15", search, status: statusFilter });
      if (subscriberFilter) params.set("subscriberId", subscriberFilter);
      if (dateFrom) params.set("dateFrom", dateFrom.toISOString());
      if (dateTo) params.set("dateTo", dateTo.toISOString());
      return apiFetch<{ invoices: Invoice[]; total: number; page: number; totalPages: number; statusCounts: StatusCounts }>(`/api/billing?${params}`);
    },
  });

  // Fetch subscribers for filter dropdown
  const { data: subscribers } = useQuery<SubOption[]>({
    queryKey: ["billing-subs"],
    queryFn: () => apiFetch("/api/subscribers?limit=200").then((d: any) => d.subscribers?.map((s: SubOption) => ({ id: s.id, name: s.name, code: s.code })) || []),
  });

  // Invoice detail
  const { data: detail } = useQuery<InvoiceDetail>({
    queryKey: ["invoice-detail", selectedInvoice?.id],
    queryFn: () => apiFetch<InvoiceDetail>(`/api/billing/${selectedInvoice?.id}`),
    enabled: !!selectedInvoice?.id && detailOpen,
  });

  // Generate invoices
  const generateMutation = useMutation({
    mutationFn: () => apiFetch("/api/billing", { method: "POST", body: JSON.stringify({ action: "generate" }) }),
    onSuccess: (d) => {
      if (d.error) { toast.error(d.error); return; }
      if (d.count === 0) {
        toast.info("All invoices already generated for this billing period");
      } else {
        toast.success(`Generated ${d.count} invoices successfully`);
      }
      queryClient.invalidateQueries({ queryKey: ["billing"] });
    },
    onError: (err) => toast.error(err.message || "Failed to generate invoices"),
  });

  // Send invoice
  const sendMutation = useMutation({
    mutationFn: (subscriberId: string) => apiFetch("/api/billing", { method: "POST", body: JSON.stringify({ action: "send", subscriberId }) }),
    onSuccess: (d) => {
      if (d.error) { toast.error(d.error); return; }
      toast.success("Invoice sent successfully");
      queryClient.invalidateQueries({ queryKey: ["billing"] });
    },
  });

  // Bulk send invoices
  const bulkSendMutation = useMutation({
    mutationFn: (ids: string[]) => apiFetch("/api/billing", { method: "POST", body: JSON.stringify({ action: "bulk_send", invoiceIds: ids }) }),
    onSuccess: (d) => {
      if (d.error) { toast.error(d.error); return; }
      toast.success(d.message || `Sent ${d.count} invoices`);
      setSelectedIds(new Set());
      setBulkMode(false);
      queryClient.invalidateQueries({ queryKey: ["billing"] });
    },
    onError: (err) => toast.error(err.message || "Bulk send failed"),
  });

  // Edit invoice
  const editMutation = useMutation({
    mutationFn: () => {
      if (!selectedInvoice) return Promise.reject("No invoice selected");
      const payload: Record<string, unknown> = {
        description: editForm.description,
        notes: editForm.notes,
        lateFee: parseFloat(editForm.lateFee) || 0,
      };
      if (editForm.discountType) payload.discountType = editForm.discountType;
      if (editForm.discountValue) payload.discountValue = parseFloat(editForm.discountValue) || 0;
      if (editForm.discountAmount) payload.discountAmount = parseFloat(editForm.discountAmount) || 0;
      if (!editForm.discountType) { payload.discountType = null; payload.discountValue = 0; payload.discountAmount = 0; }
      return apiFetch(`/api/billing/${selectedInvoice.id}`, { method: "PUT", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      toast.success("Invoice updated successfully");
      setEditOpen(false);
      queryClient.invalidateQueries({ queryKey: ["billing"] });
      if (detailOpen) queryClient.invalidateQueries({ queryKey: ["invoice-detail"] });
    },
    onError: (err) => toast.error(err.message || "Failed to update invoice"),
  });

  // Cancel invoice
  const cancelMutation = useMutation({
    mutationFn: () => {
      if (!selectedInvoice) return Promise.reject("No invoice selected");
      return apiFetch(`/api/billing/${selectedInvoice.id}`, {
        method: "PUT",
        body: JSON.stringify({ status: "CANCELLED", notes: cancelReason ? `Cancellation: ${cancelReason}` : "Cancelled by admin" }),
      });
    },
    onSuccess: () => {
      toast.success("Invoice cancelled successfully");
      setCancelOpen(false);
      setCancelReason("");
      queryClient.invalidateQueries({ queryKey: ["billing"] });
      if (detailOpen) queryClient.invalidateQueries({ queryKey: ["invoice-detail"] });
    },
    onError: (err) => toast.error(err.message || "Failed to cancel invoice"),
  });

  // Record payment
  const recordPaymentMutation = useMutation({
    mutationFn: () => {
      if (!selectedInvoice) return Promise.reject("No invoice selected");
      const amount = parseFloat(paymentAmount);
      if (!amount || amount <= 0) return Promise.reject("Invalid amount");
      return apiFetch("/api/billing", {
        method: "POST",
        body: JSON.stringify({
          action: "record_payment",
          subscriberId: selectedInvoice.subscriberId,
          invoiceId: selectedInvoice.id,
          amount,
          paymentMode,
          transactionRef: paymentRef,
        }),
      });
    },
    onSuccess: (d) => {
      if (d.error) { toast.error(d.error); return; }
      toast.success("Payment recorded successfully");
      setPaymentOpen(false);
      setPaymentAmount("");
      setPaymentRef("");
      queryClient.invalidateQueries({ queryKey: ["billing"] });
      if (detailOpen) queryClient.invalidateQueries({ queryKey: ["invoice-detail"] });
    },
    onError: (err) => toast.error(typeof err === "string" ? err : "Failed to record payment"),
  });

  // Create manual invoice
  const createInvoiceMutation = useMutation({
    mutationFn: () => {
      if (!createForm.subscriberId || !createForm.issueDate || !createForm.dueDate || !createForm.periodStart || !createForm.periodEnd) {
        return Promise.reject("Missing required fields");
      }
      return apiFetch("/api/invoices", { method: "POST", body: JSON.stringify(createForm) });
    },
    onSuccess: (d) => {
      if (d.error) { toast.error(d.error); return; }
      toast.success(`Invoice ${d.invoice.invoiceNumber} created`);
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ["billing"] });
    },
    onError: () => toast.error("Failed to create invoice"),
  });

  // ─── Helpers ──────────────────────────────────────────
  const openDetail = (inv: Invoice) => { setSelectedInvoice(inv); setDetailOpen(true); };
  const openPayment = (inv: Invoice) => { setSelectedInvoice(inv); setPaymentAmount(String(inv.balanceAmount > 0 ? inv.balanceAmount : inv.grandTotal)); setPaymentMode("CASH"); setPaymentRef(""); setPaymentOpen(true); };
  const openEdit = (inv: Invoice) => {
    setSelectedInvoice(inv);
    setEditForm({
      description: inv.description,
      discountType: inv.discountType || "",
      discountValue: inv.discountValue ? String(inv.discountValue) : "",
      discountAmount: inv.discountAmount ? String(inv.discountAmount) : "",
      lateFee: inv.lateFee ? String(inv.lateFee) : "",
      notes: inv.notes,
    });
    setEditOpen(true);
  };
  const openCancel = (inv: Invoice) => { setSelectedInvoice(inv); setCancelReason(""); setCancelOpen(true); };

  const handleSend = (inv: Invoice) => {
    if (inv.status !== "DRAFT" && inv.status !== "SENT") {
      toast.error("Can only send Draft or Sent invoices");
      return;
    }
    sendMutation.mutate(inv.subscriberId);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === invoices.length && invoices.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(invoices.map((i) => i.id)));
    }
  };

  const exportCSV = () => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (subscriberFilter) params.set("subscriberId", subscriberFilter);
    if (search) params.set("search", search);
    if (dateFrom) params.set("dateFrom", dateFrom.toISOString());
    if (dateTo) params.set("dateTo", dateTo.toISOString());
    window.open(`/api/billing/export?${params}`, "_blank");
    toast.success("Exporting CSV...");
  };

  const renderSkeleton = () => (
    <div className="space-y-6">
      <Skeleton className="skeleton-wave h-7 w-40 mb-2" />
      <Skeleton className="skeleton-wave h-4 w-72" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
      </div>
      <Card className="border shadow-sm"><CardContent className="p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full mb-2" />)}</CardContent></Card>
    </div>
  );

  const invoices = data?.invoices ?? [];
  const total = data?.total ?? 0;
  const sc = data?.statusCounts;

  // Filtered subs for the dropdown
  const [subSearch, setSubSearch] = useState("");
  const filteredSubs = subscribers?.filter((s) =>
    !subSearch || s.name.toLowerCase().includes(subSearch.toLowerCase()) || s.code.toLowerCase().includes(subSearch.toLowerCase())
  ) ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        icon={Receipt}
        title="Billing & Invoices"
        description="Manage invoices, recurring templates, and billing cycles."
        actions={
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />Create Invoice
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setBulkMode(!bulkMode); setSelectedIds(new Set()); }}>
              {bulkMode ? "Cancel Selection" : "Bulk Select"}
            </Button>
            <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">
              <FilePlus className="h-4 w-4 mr-2" />
              {generateMutation.isPending ? "Generating..." : "Generate Invoices"}
            </Button>
          </div>
        }
      />

      {/* Summary Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-0 rounded-xl bg-gradient-to-br from-slate-50 to-slate-50 dark:from-slate-950/30 dark:to-slate-950/20 ring-1 ring-slate-200/60 hover:scale-[1.02] transition-all duration-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-900/40 dark:to-slate-800/30 shadow-sm shadow-slate-500/25">
                <FileText className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{total}</p>
                <p className="text-xs text-muted-foreground">Total Invoices</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 rounded-xl bg-gradient-to-br from-green-50 to-green-50 dark:from-green-950/30 dark:to-green-950/20 ring-1 ring-green-200/60 hover:scale-[1.02] transition-all duration-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-full bg-gradient-to-br from-green-100 to-green-200 dark:from-green-900/40 dark:to-green-800/30 shadow-sm shadow-green-500/25">
                <CheckCircle className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-green-600">{sc?.PAID ?? 0}</p>
                <p className="text-xs text-muted-foreground">Paid</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 rounded-xl bg-gradient-to-br from-amber-50 to-red-50 dark:from-amber-950/30 dark:to-red-950/20 ring-1 ring-amber-200/60 hover:scale-[1.02] transition-all duration-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-full bg-gradient-to-br from-amber-100 to-red-200 dark:from-amber-900/40 dark:to-red-800/30 shadow-sm shadow-amber-500/25">
                <Clock className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-amber-600">{(sc?.OVERDUE ?? 0) + (sc?.PARTIALLY_PAID ?? 0)}</p>
                <p className="text-xs text-muted-foreground">Pending / Overdue</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-50 dark:from-emerald-950/30 dark:to-emerald-950/20 ring-1 ring-emerald-200/60 hover:scale-[1.02] transition-all duration-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-full bg-gradient-to-br from-emerald-100 to-emerald-200 dark:from-emerald-900/40 dark:to-emerald-800/30 shadow-sm shadow-emerald-500/25">
                <DollarSign className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-emerald-600">{formatINR(invoices.reduce((sum, inv) => sum + inv.paidAmount, 0))}</p>
                <p className="text-xs text-muted-foreground">Total Revenue</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="border shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search invoice # or subscriber..." className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <Select value={statusFilter || "all"} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="SENT">Sent</SelectItem>
                <SelectItem value="PAID">Paid</SelectItem>
                <SelectItem value="PARTIALLY_PAID">Partially Paid</SelectItem>
                <SelectItem value="OVERDUE">Overdue</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={subscriberFilter || "all"} onValueChange={(v) => { setSubscriberFilter(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Subscriber" /></SelectTrigger>
              <SelectContent>
                <div className="max-h-60 overflow-y-auto p-1">
                  <Input placeholder="Search name/code..." className="mb-2" value={subSearch} onChange={(e) => setSubSearch(e.target.value)} />
                  <SelectItem value="all">All Subscribers</SelectItem>
                  {filteredSubs.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} ({s.code})</SelectItem>
                  ))}
                </div>
              </SelectContent>
            </Select>
            {/* Date From */}
            <Popover open={dateFromOpen} onOpenChange={setDateFromOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 w-[140px] justify-start text-left font-normal">
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {dateFrom ? formatDate(dateFrom.toISOString()) : "From date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateFrom} onSelect={(d) => { setDateFrom(d); setDateFromOpen(false); setPage(1); }} initialFocus />
              </PopoverContent>
            </Popover>
            {/* Date To */}
            <Popover open={dateToOpen} onOpenChange={setDateToOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 w-[140px] justify-start text-left font-normal">
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {dateTo ? formatDate(dateTo.toISOString()) : "To date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dateTo} onSelect={(d) => { setDateTo(d); setDateToOpen(false); setPage(1); }} initialFocus />
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="sm" onClick={() => { setSearch(""); setStatusFilter(""); setSubscriberFilter(""); setPage(1); setDateFrom(undefined); setDateTo(undefined); }}>
              <X className="h-3 w-3 mr-1" />Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Bulk actions bar */}
      {bulkMode && selectedIds.size > 0 && (
        <Card className="border shadow-sm bg-muted/50">
          <CardContent className="p-3 flex items-center justify-between">
            <span className="text-sm font-medium">{selectedIds.size} invoice(s) selected</span>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => bulkSendMutation.mutate(Array.from(selectedIds))} disabled={bulkSendMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">
                <Send className="h-4 w-4 mr-2" />{bulkSendMutation.isPending ? "Sending..." : "Send Selected"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())}>Clear Selection</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invoice Table */}
      <Card className="border shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  {bulkMode && (
                    <TableHead className="text-xs w-10">
                      <Checkbox
                        checked={invoices.length > 0 && selectedIds.size === invoices.length}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                  )}
                  <TableHead className="text-xs font-semibold">Invoice #</TableHead>
                  <TableHead className="text-xs font-semibold">Subscriber</TableHead>
                  <TableHead className="text-xs font-semibold hidden md:table-cell">Period</TableHead>
                  <TableHead className="text-xs font-semibold">Amount</TableHead>
                  <TableHead className="text-xs font-semibold hidden sm:table-cell">Balance</TableHead>
                  <TableHead className="text-xs font-semibold">Status</TableHead>
                  <TableHead className="text-xs font-semibold hidden lg:table-cell">Due Date</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!invoices.length ? (
                  <TableRow>
                    <TableCell colSpan={bulkMode ? 9 : 8} className="text-center py-12">
                      <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                      <p className="text-muted-foreground font-medium">No invoices found</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">Generate invoices for active subscribers to get started</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  invoices.map((inv) => (
                    <TableRow key={inv.id} className="hover:bg-muted/30 transition-colors duration-150 even:bg-muted/10">
                      {bulkMode && (
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(inv.id)}
                            onCheckedChange={() => toggleSelect(inv.id)}
                          />
                        </TableCell>
                      )}
                      <TableCell className="font-mono text-xs font-medium">{inv.invoiceNumber}</TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium">{inv.subscriber?.name || "—"}</p>
                          <p className="text-xs text-muted-foreground">{inv.subscriber?.code || ""}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs hidden md:table-cell">
                        {formatDate(inv.periodStart)} – {formatDate(inv.periodEnd)}
                      </TableCell>
                      <TableCell className="text-sm font-semibold">{formatINR(inv.grandTotal)}</TableCell>
                      <TableCell className="text-xs hidden sm:table-cell">
                        <span className={inv.balanceAmount > 0 ? "text-red-600 font-medium" : "text-green-600"}>
                          {formatINR(inv.balanceAmount)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-medium ${STATUS_MAP[inv.status]?.class || "bg-gray-100 text-gray-600"}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_MAP[inv.status]?.dotClass || "bg-gray-400"} ${STATUS_MAP[inv.status]?.pulse ? "animate-pulse" : ""}`} />
                          {STATUS_MAP[inv.status]?.label || inv.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs hidden lg:table-cell">{formatDate(inv.dueDate)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDetail(inv)} title="View">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {inv.status !== "PAID" && inv.status !== "CANCELLED" && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(inv)} title="Edit">
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {(inv.status === "DRAFT" || inv.status === "SENT") && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleSend(inv)} title="Send">
                              <Send className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {inv.balanceAmount > 0 && inv.status !== "CANCELLED" && inv.status !== "PAID" && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openPayment(inv)} title="Record Payment">
                              <CreditCard className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {inv.status !== "CANCELLED" && inv.status !== "PAID" && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => openCancel(inv)} title="Cancel">
                              <Ban className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {((page - 1) * 15) + 1}–{Math.min(page * 15, total)} of {total}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </div>
      )}

      {/* ─── Invoice Detail Dialog ─── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Invoice {detail?.invoiceNumber}
            </DialogTitle>
          </DialogHeader>
          {!detail ? (
            <div className="space-y-3 py-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}</div>
          ) : (
            <div className="space-y-5 py-2">
              {/* Subscriber info */}
              <div className="p-4 rounded-lg bg-muted/50 space-y-1">
                <p className="font-semibold">{detail.subscriber?.name}</p>
                <p className="text-xs text-muted-foreground">Code: {detail.subscriber?.code}</p>
                {detail.plan && <p className="text-xs text-muted-foreground">Plan: {detail.plan.name}</p>}
              </div>

              {/* Status & Dates */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_MAP[detail.status]?.class || "bg-gray-100 text-gray-600"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${STATUS_MAP[detail.status]?.dotClass || "bg-gray-400"} ${STATUS_MAP[detail.status]?.pulse ? "animate-pulse" : ""}`} />
                  {STATUS_MAP[detail.status]?.label || detail.status}
                </span>
                <span className="text-xs text-muted-foreground">Issued: {formatDate(detail.issueDate)}</span>
                <span className="text-xs text-muted-foreground">Due: {formatDate(detail.dueDate)}</span>
              </div>

              {/* Line items */}
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="text-xs">Description</TableHead>
                    <TableHead className="text-xs text-right">Amount</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="text-sm">{detail.description || "Internet Subscription"}</TableCell>
                      <TableCell className="text-sm text-right">{formatINR(detail.subtotal)}</TableCell>
                    </TableRow>
                    {detail.cgstAmount > 0 && (
                      <TableRow><TableCell className="text-xs text-muted-foreground">CGST (9%)</TableCell><TableCell className="text-xs text-right text-muted-foreground">{formatINR(detail.cgstAmount)}</TableCell></TableRow>
                    )}
                    {detail.sgstAmount > 0 && (
                      <TableRow><TableCell className="text-xs text-muted-foreground">SGST (9%)</TableCell><TableCell className="text-xs text-right text-muted-foreground">{formatINR(detail.sgstAmount)}</TableCell></TableRow>
                    )}
                    {detail.igstAmount > 0 && (
                      <TableRow><TableCell className="text-xs text-muted-foreground">IGST</TableCell><TableCell className="text-xs text-right text-muted-foreground">{formatINR(detail.igstAmount)}</TableCell></TableRow>
                    )}
                    {/* Discount */}
                    {detail.discountAmount > 0 && (
                      <TableRow>
                        <TableCell className="text-xs text-green-600">
                          Discount
                          {detail.discountType && (
                            <Badge variant="outline" className="text-[10px] ml-1 bg-green-50 text-green-700 border-green-200">
                              {detail.discountType === "PERCENTAGE" ? `${detail.discountValue}%` : formatINR(detail.discountValue)}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-right text-green-600">−{formatINR(detail.discountAmount)}</TableCell>
                      </TableRow>
                    )}
                    {/* Late Fee */}
                    {detail.lateFee > 0 && (
                      <TableRow>
                        <TableCell className="text-xs text-orange-600">Late Fee</TableCell>
                        <TableCell className="text-xs text-right text-orange-600">+{formatINR(detail.lateFee)}</TableCell>
                      </TableRow>
                    )}
                    <TableRow className="font-bold border-t-2">
                      <TableCell className="text-sm">Grand Total</TableCell>
                      <TableCell className="text-sm text-right">{formatINR(detail.grandTotal)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-xs text-green-600">Paid</TableCell>
                      <TableCell className="text-xs text-right text-green-600">{formatINR(detail.paidAmount)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-xs font-semibold text-red-600">Balance Due</TableCell>
                      <TableCell className="text-xs text-right font-semibold text-red-600">{formatINR(detail.balanceAmount)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {/* Notes */}
              {detail.notes && (
                <div className="p-3 rounded-lg bg-muted/30 border text-xs text-muted-foreground">
                  <span className="font-medium">Notes: </span>{detail.notes}
                </div>
              )}

              {/* Payments */}
              {detail.payments.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Payments Received</h4>
                  <div className="rounded-lg border overflow-hidden max-h-40 overflow-y-auto">
                    <Table><TableHeader><TableRow>
                      <TableHead className="text-xs">Receipt</TableHead>
                      <TableHead className="text-xs">Amount</TableHead>
                      <TableHead className="text-xs">Mode</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow></TableHeader><TableBody>
                      {detail.payments.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-xs font-mono">{p.receiptNumber}</TableCell>
                          <TableCell className="text-xs">{formatINR(p.amount)}</TableCell>
                          <TableCell className="text-xs">{p.paymentMode}</TableCell>
                          <TableCell className="text-xs"><Badge variant="outline" className={`text-[10px] ${p.status === "VERIFIED" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>{p.status}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody></Table>
                  </div>
                </div>
              )}

              {/* Actions */}
              {detail.balanceAmount > 0 && detail.status !== "CANCELLED" && detail.status !== "PAID" && (
                <div className="flex gap-2 pt-2">
                  {detail.status === "DRAFT" && (
                    <Button variant="outline" onClick={() => handleSend(detail)} className="flex-1">
                      <Send className="h-4 w-4 mr-2" />Send Invoice
                    </Button>
                  )}
                  <Button onClick={() => { setDetailOpen(false); openPayment(detail); }} className="bg-red-600 hover:bg-red-700 text-white flex-1">
                    <CreditCard className="h-4 w-4 mr-2" />Record Payment
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Edit Invoice Dialog ─── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="h-5 w-5" />
              Edit Invoice {selectedInvoice?.invoiceNumber}
            </DialogTitle>
            <DialogDescription>Update invoice details. Changes will recalculate totals.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={editForm.description}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Invoice description..."
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Discount Type</Label>
                <Select value={editForm.discountType} onValueChange={(v) => setEditForm((f) => ({ ...f, discountType: v }))}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    <SelectItem value="PERCENTAGE">Percentage (%)</SelectItem>
                    <SelectItem value="FLAT">Flat Amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Discount Value</Label>
                <div className="relative">
                  {editForm.discountType === "PERCENTAGE" && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>}
                  {editForm.discountType === "FLAT" && <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />}
                  <Input
                    type="number"
                    className={editForm.discountType === "FLAT" ? "pl-9" : ""}
                    placeholder="0"
                    value={editForm.discountValue}
                    onChange={(e) => setEditForm((f) => ({ ...f, discountValue: e.target.value }))}
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Discount Amount (₹)</Label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  className="pl-9"
                  placeholder="0"
                  value={editForm.discountAmount}
                  onChange={(e) => setEditForm((f) => ({ ...f, discountAmount: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Late Fee (₹)</Label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  className="pl-9"
                  placeholder="0"
                  value={editForm.lateFee}
                  onChange={(e) => setEditForm((f) => ({ ...f, lateFee: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={editForm.notes}
                onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Internal notes..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={() => editMutation.mutate()} disabled={editMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">
              {editMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Cancel Invoice Dialog ─── */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-red-600" />Cancel Invoice
            </DialogTitle>
            <DialogDescription>Cancel invoice {selectedInvoice?.invoiceNumber}?</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm">
              <p className="font-medium text-red-700">Warning</p>
              <p className="text-red-600 mt-1">Cancelling this invoice cannot be undone.</p>
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Why is this invoice being cancelled?" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Keep</Button>
            <Button variant="destructive" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
              {cancelMutation.isPending ? "Cancelling..." : "Cancel Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Record Payment Dialog ─── */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />Record Payment
            </DialogTitle>
            <DialogDescription>
              Invoice {selectedInvoice?.invoiceNumber} · Balance: {formatINR(selectedInvoice?.balanceAmount || 0)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Amount (₹) *</Label>
              <Input type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} placeholder="Enter amount" />
            </div>
            <div className="space-y-2">
              <Label>Payment Mode</Label>
              <Select value={paymentMode} onValueChange={setPaymentMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="UPI">UPI</SelectItem>
                  <SelectItem value="ONLINE">Online</SelectItem>
                  <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                  <SelectItem value="CHEQUE">Cheque</SelectItem>
                  <SelectItem value="WALLET">Wallet</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Transaction Reference</Label>
              <Input value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} placeholder="UPI ref, cheque #, etc." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentOpen(false)}>Cancel</Button>
            <Button onClick={() => recordPaymentMutation.mutate()} disabled={recordPaymentMutation.isPending} className="bg-green-600 hover:bg-green-700 text-white">
              {recordPaymentMutation.isPending ? "Recording..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Create Invoice Dialog ─── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-red-600" />Create Invoice
            </DialogTitle>
            <DialogDescription>Manually create a new invoice for a subscriber.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Subscriber *</Label>
              <Select value={createForm.subscriberId} onValueChange={(v) => setCreateForm({ ...createForm, subscriberId: v })}>
                <SelectTrigger><SelectValue placeholder="Select subscriber" /></SelectTrigger>
                <SelectContent>
                  <div className="max-h-60 overflow-y-auto">
                    {filteredSubs.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name} ({s.code})</SelectItem>
                    ))}
                  </div>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Issue Date *</Label>
                <Input type="date" value={createForm.issueDate} onChange={(e) => setCreateForm({ ...createForm, issueDate: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Due Date *</Label>
                <Input type="date" value={createForm.dueDate} onChange={(e) => setCreateForm({ ...createForm, dueDate: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Period Start *</Label>
                <Input type="date" value={createForm.periodStart} onChange={(e) => setCreateForm({ ...createForm, periodStart: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Period End *</Label>
                <Input type="date" value={createForm.periodEnd} onChange={(e) => setCreateForm({ ...createForm, periodEnd: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Description</Label>
              <Input value={createForm.description} onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })} placeholder="Invoice description" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Discount Type</Label>
                <Select value={createForm.discountType} onValueChange={(v) => setCreateForm({ ...createForm, discountType: v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">No Discount</SelectItem>
                    <SelectItem value="PERCENTAGE">Percentage (%)</SelectItem>
                    <SelectItem value="FLAT">Flat Amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(createForm.discountType === "PERCENTAGE" || createForm.discountType === "FLAT") && (
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Discount Value</Label>
                  <Input type="number" value={createForm.discountValue} onChange={(e) => setCreateForm({ ...createForm, discountValue: e.target.value })} placeholder={createForm.discountType === "PERCENTAGE" ? "%" : "Amount"} />
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-xs font-medium">Late Fee (₹)</Label>
                <Input type="number" value={createForm.lateFee} onChange={(e) => setCreateForm({ ...createForm, lateFee: e.target.value })} placeholder="0" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Notes</Label>
              <Textarea value={createForm.notes} onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })} placeholder="Internal notes" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createInvoiceMutation.mutate()} disabled={createInvoiceMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">
              {createInvoiceMutation.isPending ? "Creating..." : "Create Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
