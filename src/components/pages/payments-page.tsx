"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, formatINR } from "@/lib/utils";
import { escapeHtml } from "@/lib/utils/html-escape";
import {
  CreditCard, Plus, Search, Check, X as XIcon, IndianRupee,
  Wallet, Clock, Eye, FileSpreadsheet, Printer,
  CalendarDays, CheckCircle2, AlertCircle, Pencil, Trash2,
  ArrowUpDown, ArrowUp, ArrowDown, RotateCcw, Banknote,
  Smartphone, Globe, FileText, Building, TrendingUp,
  Calendar as CalendarIcon, type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import PageHeader from "@/components/page-header";

// ─── Types ──────────────────────────────────────────────
interface Payment {
  id: string; subscriberId: string; invoiceId: string | null;
  amount: number; paymentMode: string; transactionRef: string;
  status: string; receiptNumber: string; notes: string; createdAt: string;
  subscriber: { id: string; name: string; code: string; phone: string; email: string; address: string } | null;
  invoice: { id: string; invoiceNumber: string } | null;
}

interface PaymentDetail extends Payment {
  subscriber: { id: string; name: string; code: string; phone: string; email: string; address: string } | null;
  invoice: { id: string; invoiceNumber: string; grandTotal: number; status: string } | null;
  collectedBy: { id: string; name: string } | null;
  verifiedBy: { id: string; name: string } | null;
  ispSettings?: { companyName: string; address: string; city: string; state: string; pincode: string; phone: string; email: string; gstin: string; website: string; receiptFooterText: string };
}

interface PaymentSummary {
  todayCount: number; todayTotal: number; todayPendingCount: number; todayPendingAmount: number;
}

interface PendingInvoice {
  id: string; invoiceNumber: string; grandTotal: number; paidAmount: number; balanceAmount: number;
  status: string; dueDate: string;
}

interface SubBalance {
  outstandingBalance: number;
  pendingInvoices: PendingInvoice[];
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_MAP: Record<string, { label: string; class: string; dot: string }> = {
  PENDING: { label: "Pending", class: "bg-amber-500/10 text-amber-700 dark:text-amber-400", dot: "bg-amber-500" },
  VERIFIED: { label: "Verified", class: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500" },
  FAILED: { label: "Failed", class: "bg-red-500/10 text-red-700 dark:text-red-400", dot: "bg-red-500" },
  REFUNDED: { label: "Refunded", class: "bg-slate-500/10 text-slate-700 dark:text-slate-400", dot: "bg-slate-400" },
};

const STATUS_BORDER_MAP: Record<string, string> = {
  PENDING: "border-l-amber-500",
  VERIFIED: "border-l-emerald-500",
  FAILED: "border-l-red-500",
  REFUNDED: "border-l-slate-400",
};

const MODE_LABELS: Record<string, string> = {
  CASH: "Cash", UPI: "UPI", ONLINE: "Online", BANK_TRANSFER: "Bank Transfer", CHEQUE: "Cheque", WALLET: "Wallet",
};

const MODE_ICONS: Record<string, LucideIcon> = {
  CASH: Banknote, UPI: Smartphone, ONLINE: Globe, BANK_TRANSFER: Building, CHEQUE: FileText, WALLET: Wallet,
};

const MODE_PILL_MAP: Record<string, { bg: string; text: string }> = {
  CASH: { bg: "bg-green-500/10", text: "text-green-700 dark:text-green-400" },
  UPI: { bg: "bg-purple-500/10", text: "text-purple-700 dark:text-purple-400" },
  BANK_TRANSFER: { bg: "bg-blue-500/10", text: "text-blue-700 dark:text-blue-400" },
  ONLINE: { bg: "bg-teal-500/10", text: "text-teal-700 dark:text-teal-400" },
  CHEQUE: { bg: "bg-amber-500/10", text: "text-amber-700 dark:text-amber-400" },
  WALLET: { bg: "bg-slate-500/10", text: "text-slate-700 dark:text-slate-400" },
};

interface SubOption { id: string; name: string; code: string }

interface RefundRecord {
  id: string; amount: number; reason: string; status: string; createdAt: string;
  processedBy?: { name: string } | null;
}

const REFUND_REASONS = ["Error", "Duplicate", "Customer Request", "Service Issue", "Other"];
const REFUND_MODES = ["Original", "Bank Transfer", "UPI"];

type SortField = "createdAt" | "amount" | "paymentMode" | "status" | "receiptNumber";
type SortOrder = "asc" | "desc";

export default function PaymentsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [modeFilter, setModeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [dateFromOpen, setDateFromOpen] = useState(false);
  const [dateToOpen, setDateToOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Multi-select mode
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Dialogs
  const [collectOpen, setCollectOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState<"verify" | "reject" | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundNotes, setRefundNotes] = useState("");
  const [refundMode, setRefundMode] = useState("Original");
  const [refundHistoryOpen, setRefundHistoryOpen] = useState(false);

  // Form state
  const [formSubId, setFormSubId] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formMode, setFormMode] = useState("CASH");
  const [formRef, setFormRef] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formSubSearch, setFormSubSearch] = useState("");

  // Edit form state
  const [editAmount, setEditAmount] = useState("");
  const [editMode, setEditMode] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editRef, setEditRef] = useState("");

  const receiptRef = useRef<HTMLDivElement>(null);

  // Fetch payments
  const { data, isLoading } = useQuery<{ payments: Payment[]; total: number; page: number; totalPages: number; summary: PaymentSummary; pendingVerifyCount: number }>({
    queryKey: ["payments", page, search, statusFilter, modeFilter, dateFrom, dateTo, sortBy, sortOrder],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: "15", status: statusFilter, mode: modeFilter, sortBy, sortOrder });
      if (search) params.set("search", search);
      if (dateFrom) params.set("dateFrom", dateFrom.toISOString());
      if (dateTo) params.set("dateTo", dateTo.toISOString());
      return apiFetch<{ payments: Payment[]; total: number; page: number; totalPages: number; summary: PaymentSummary; pendingVerifyCount: number }>(`/api/payments?${params}`);
    },
  });

  // Fetch subscribers for collection form
  const { data: subscribers } = useQuery<SubOption[]>({
    queryKey: ["payment-subs"],
    queryFn: () => apiFetch("/api/subscribers?limit=200").then((d: any) => d.subscribers?.map((s: SubOption) => ({ id: s.id, name: s.name, code: s.code })) || []),
  });

  // Fetch subscriber balance when subscriber is selected in collect form
  const { data: subBalance, isLoading: balanceLoading } = useQuery<SubBalance>({
    queryKey: ["sub-balance", formSubId],
    queryFn: () => apiFetch<SubBalance>(`/api/subscribers/${formSubId}/balance`),
    enabled: !!formSubId && collectOpen,
  });

  // Auto-fill amount when subscriber balance loads (one-shot auto-fill)
  const outstandingBalance = subBalance?.outstandingBalance;
  const autoFilledRef = useRef(false);
  useEffect(() => {
    if (outstandingBalance && outstandingBalance > 0 && !autoFilledRef.current && formAmount === "") {
      autoFilledRef.current = true;
      // Use flushSync-like scheduling to avoid direct setState in effect
      const val = String(outstandingBalance);
      setTimeout(() => setFormAmount(val), 0);
    }
  }, [outstandingBalance, formAmount]);

  // Fetch payment detail for receipt
  const { data: paymentDetail } = useQuery<PaymentDetail>({
    queryKey: ["payment-detail", selectedPayment?.id],
    queryFn: () => apiFetch<PaymentDetail>(`/api/payments/${selectedPayment?.id}`),
    enabled: !!selectedPayment?.id && receiptOpen,
  });

  const filteredSubs = subscribers?.filter((s) =>
    !formSubSearch || s.name.toLowerCase().includes(formSubSearch.toLowerCase()) || s.code.toLowerCase().includes(formSubSearch.toLowerCase())
  ) ?? [];

  // ─── Mutations ──────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: () => {
      const amount = parseFloat(formAmount);
      if (!formSubId || !amount || amount <= 0) return Promise.reject("Valid subscriber and amount required");
      return apiFetch("/api/payments", {
        method: "POST",
        body: JSON.stringify({ subscriberId: formSubId, amount, paymentMode: formMode, transactionRef: formRef, notes: formNotes }),
      });
    },
    onSuccess: (d) => {
      if (d.error) { toast.error(d.error); return; }
      toast.success("Payment collected successfully");
      setCollectOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["payments"] });
    },
    onError: (err) => toast.error(typeof err === "string" ? err : "Failed to collect payment"),
  });

  const verifyMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => apiFetch(`/api/payments/${id}`, { method: "PUT", body: JSON.stringify({ status }) }),
    onSuccess: (d, vars) => {
      if (d.error) { toast.error(d.error); return; }
      toast.success(vars.status === "VERIFIED" ? "Payment verified" : "Payment rejected");
      setVerifyOpen(false);
      queryClient.invalidateQueries({ queryKey: ["payments"] });
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, amount, paymentMode, notes, transactionRef }: { id: string; amount: number; paymentMode: string; notes: string; transactionRef: string }) =>
      apiFetch(`/api/payments/${id}`, {
        method: "PUT",
        body: JSON.stringify({ amount, paymentMode, notes, transactionRef }),
      }),
    onSuccess: (d) => {
      if (d.error) { toast.error(d.error); return; }
      toast.success("Payment updated successfully");
      setEditOpen(false);
      queryClient.invalidateQueries({ queryKey: ["payments"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to update payment"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/payments/${id}`, { method: "DELETE" }),
    onSuccess: (d) => {
      if (d.error) { toast.error(d.error); return; }
      toast.success("Payment deleted successfully");
      setDeleteOpen(false);
      setSelectedPayment(null);
      queryClient.invalidateQueries({ queryKey: ["payments"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to delete payment"),
  });

  // Fetch refund history for a payment
  const { data: refundHistory } = useQuery<{ refunds: RefundRecord[] }>({
    queryKey: ["payment-refunds", selectedPayment?.id],
    queryFn: () => apiFetch(`/api/payments/${selectedPayment?.id}/refund`),
    enabled: refundHistoryOpen && !!selectedPayment?.id,
  });

  const refundMutation = useMutation({
    mutationFn: ({ id, amount, reason, notes, refundMode }: { id: string; amount: number; reason: string; notes: string; refundMode: string }) =>
      apiFetch(`/api/payments/${id}/refund`, {
        method: "POST",
        body: JSON.stringify({ amount, reason, notes, refundMode }),
      }),
    onSuccess: (d) => {
      if (d.error) { toast.error(d.error); return; }
      toast.success(d.message || "Refund processed successfully");
      setRefundOpen(false);
      setSelectedPayment(null);
      queryClient.invalidateQueries({ queryKey: ["payments"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to process refund"),
  });

  const bulkVerifyMutation = useMutation({
    mutationFn: ({ action, ids }: { action: string; ids: string[] }) => apiFetch("/api/payments", {
      method: "POST",
      body: JSON.stringify({ action, paymentIds: ids }),
    }),
    onSuccess: (d) => {
      if (d.error) { toast.error(d.error); return; }
      toast.success(d.message || `Action completed`);
      setSelectedIds(new Set());
      setBulkMode(false);
      setBulkConfirmOpen(false);
      setBulkAction(null);
      queryClient.invalidateQueries({ queryKey: ["payments"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Bulk action failed"),
  });

  // ─── Handlers ───────────────────────────────────────
  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setPage(1);
  };

  const openVerify = (payment: Payment) => {
    setSelectedPayment(payment);
    setVerifyOpen(true);
  };

  const openReceipt = (payment: Payment) => {
    setSelectedPayment(payment);
    setReceiptOpen(true);
  };

  const openEdit = (payment: Payment) => {
    setSelectedPayment(payment);
    setEditAmount(String(payment.amount));
    setEditMode(payment.paymentMode);
    setEditNotes(payment.notes || "");
    setEditRef(payment.transactionRef || "");
    setEditOpen(true);
  };

  const openDelete = (payment: Payment) => {
    setSelectedPayment(payment);
    setDeleteOpen(true);
  };

  const openRefund = (payment: Payment) => {
    setSelectedPayment(payment);
    setRefundAmount(String(payment.amount));
    setRefundReason("");
    setRefundNotes("");
    setRefundMode("Original");
    setRefundOpen(true);
  };

  const handleRefund = () => {
    if (!selectedPayment) return;
    const amount = parseFloat(refundAmount);
    if (!amount || amount <= 0) { toast.error("Please enter a valid refund amount"); return; }
    if (amount > selectedPayment.amount) { toast.error(`Refund amount cannot exceed ${formatINR(selectedPayment.amount)}`); return; }
    if (!refundReason.trim()) { toast.error("Please enter a reason for the refund"); return; }
    refundMutation.mutate({ id: selectedPayment.id, amount, reason: refundReason.trim(), notes: refundNotes.trim(), refundMode });
  };

  const handleEditSave = () => {
    if (!selectedPayment) return;
    const amount = parseFloat(editAmount);
    if (!amount || amount <= 0) { toast.error("Please enter a valid amount"); return; }
    editMutation.mutate({ id: selectedPayment.id, amount, paymentMode: editMode, notes: editNotes, transactionRef: editRef });
  };

  const handleBulkAction = (action: "verify" | "reject") => {
    setBulkAction(action);
    setBulkConfirmOpen(true);
  };

  const confirmBulkAction = () => {
    if (!bulkAction || selectedIds.size === 0) return;
    const actionStr = bulkAction === "verify" ? "bulk_verify" : "bulk_reject";
    bulkVerifyMutation.mutate({ action: actionStr, ids: Array.from(selectedIds) });
  };

  const handlePrintReceipt = () => {
    if (!paymentDetail) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const ispName = paymentDetail.ispSettings?.companyName || "My ISP";
    const ispAddress = [
      paymentDetail.ispSettings?.address,
      paymentDetail.ispSettings?.city,
      paymentDetail.ispSettings?.state,
      paymentDetail.ispSettings?.pincode,
    ].filter(Boolean).join(", ");
    const ispPhone = paymentDetail.ispSettings?.phone || "";
    const ispEmail = paymentDetail.ispSettings?.email || "";
    const ispGstin = paymentDetail.ispSettings?.gstin || "";
    const footerText = paymentDetail.ispSettings?.receiptFooterText || "Thank you for your payment!";

    printWindow.document.write(`
      <html>
        <head>
          <title>Receipt - ${escapeHtml(paymentDetail.receiptNumber || "")}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; max-width: 400px; margin: 0 auto; color: #333; }
            .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 16px; margin-bottom: 20px; }
            .header h1 { font-size: 20px; margin: 0 0 4px 0; }
            .header p { font-size: 11px; color: #666; margin: 2px 0; }
            .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #ddd; font-size: 14px; }
            .row .label { color: #666; }
            .row .value { font-weight: 600; }
            .total { font-size: 18px; font-weight: 700; border-top: 2px solid #333; border-bottom: none; padding-top: 12px; }
            .footer { text-align: center; margin-top: 30px; font-size: 11px; color: #999; }
            .verified { display: inline-block; padding: 4px 12px; background: #dcfce7; color: #166534; border-radius: 4px; font-weight: 600; font-size: 12px; margin-top: 10px; }
            @media print { body { padding: 20px; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${escapeHtml(ispName)}</h1>
            ${ispAddress ? `<p>${escapeHtml(ispAddress)}</p>` : ""}
            ${ispPhone ? `<p>Phone: ${escapeHtml(ispPhone)}</p>` : ""}
            ${ispEmail ? `<p>${escapeHtml(ispEmail)}</p>` : ""}
            ${ispGstin ? `<p>GSTIN: ${escapeHtml(ispGstin)}</p>` : ""}
          </div>
          <div class="row"><span class="label">Receipt #</span><span class="value">${escapeHtml(paymentDetail.receiptNumber || "—")}</span></div>
          <div class="row"><span class="label">Date</span><span class="value">${formatDateTime(paymentDetail.createdAt)}</span></div>
          <div class="row"><span class="label">Subscriber</span><span class="value">${escapeHtml(paymentDetail.subscriber?.name || "—")}</span></div>
          <div class="row"><span class="label">Code</span><span class="value">${escapeHtml(paymentDetail.subscriber?.code || "—")}</span></div>
          ${paymentDetail.subscriber?.phone ? `<div class="row"><span class="label">Phone</span><span class="value">${escapeHtml(paymentDetail.subscriber.phone)}</span></div>` : ""}
          ${paymentDetail.invoice ? `<div class="row"><span class="label">Invoice</span><span class="value">${escapeHtml(paymentDetail.invoice.invoiceNumber)}</span></div>` : ""}
          <div class="row"><span class="label">Payment Mode</span><span class="value">${MODE_LABELS[paymentDetail.paymentMode] || paymentDetail.paymentMode}</span></div>
          ${paymentDetail.transactionRef ? `<div class="row"><span class="label">Reference</span><span class="value">${escapeHtml(paymentDetail.transactionRef)}</span></div>` : ""}
          ${paymentDetail.verifiedBy ? `<div class="row"><span class="label">Verified By</span><span class="value">${escapeHtml(paymentDetail.verifiedBy.name)}</span></div>` : ""}
          ${paymentDetail.collectedBy ? `<div class="row"><span class="label">Collected By</span><span class="value">${escapeHtml(paymentDetail.collectedBy.name)}</span></div>` : ""}
          <div class="row total"><span class="label">Amount</span><span class="value">${formatINR(paymentDetail.amount)}</span></div>
          <div style="text-align:center">
            <span class="verified">✓ ${paymentDetail.status || "VERIFIED"}</span>
          </div>
          <div class="footer">
            <p>${escapeHtml(footerText)}</p>
            <p>Generated on ${new Date().toLocaleString("en-IN")}</p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 500);
  };

  const handleExportCSV = () => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (modeFilter) params.set("mode", modeFilter);
    if (search) params.set("search", search);
    if (dateFrom) params.set("dateFrom", dateFrom.toISOString());
    if (dateTo) params.set("dateTo", dateTo.toISOString());
    window.open(`/api/payments/export?${params}`, "_blank");
    toast.success("Exporting CSV...");
  };

  const resetForm = () => {
    setFormSubId(""); setFormAmount(""); setFormMode("CASH"); setFormRef(""); setFormNotes(""); setFormSubSearch("");
  };

  const handleCollect = () => {
    if (!formSubId) { toast.error("Please select a subscriber"); return; }
    const amount = parseFloat(formAmount);
    if (!amount || amount <= 0) { toast.error("Please enter a valid amount"); return; }
    createMutation.mutate();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === pendingPayments.length && pendingPayments.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingPayments.map((i) => i.id)));
    }
  };

  const summary = data?.summary;
  const pendingVerifyCount = data?.pendingVerifyCount ?? 0;

  const renderSortIcon = (field: SortField) => {
    if (sortBy !== field) return <ArrowUpDown className="h-3 w-3 ml-1 inline opacity-40" />;
    return sortOrder === "asc"
      ? <ArrowUp className="h-3 w-3 ml-1 inline text-foreground" />
      : <ArrowDown className="h-3 w-3 ml-1 inline text-foreground" />;
  };

  const renderSkeleton = () => (
    <div className="space-y-6 animate-in fade-in duration-300">
      <Skeleton className="skeleton-wave h-7 w-40 mb-2" />
      <Skeleton className="skeleton-wave h-4 w-60" />
      <Skeleton className="skeleton-wave h-20 w-full rounded-xl" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
      </div>
      <Card className="border shadow-sm"><CardContent className="p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full mb-2" />)}</CardContent></Card>
    </div>
  );

  if (isLoading) return renderSkeleton();

  const payments = data?.payments ?? [];
  const total = data?.total ?? 0;
  const pendingPayments = payments.filter((p) => p.status === "PENDING");

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <PageHeader
        icon={Wallet}
        title="Payments"
        description="Track and manage payment collections, verifications, and refunds."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <FileSpreadsheet className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Export CSV</span><span className="sm:hidden">Export</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setBulkMode(!bulkMode); setSelectedIds(new Set()); }}>
              {bulkMode ? "Cancel" : "Bulk"}
            </Button>
            <Button onClick={() => setCollectOpen(true)} className="bg-red-600 hover:bg-red-700 text-white">
              <Plus className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Collect Payment</span><span className="sm:hidden">Collect</span>
            </Button>
          </>
        }
      />

      {/* Total Collected Today Highlight */}
      <div className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-lg animate-slide-up" style={{ animationDelay: "50ms" }}>
        <div className="p-3 rounded-xl bg-white/20 backdrop-blur-sm">
          <IndianRupee className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-green-100">Total Collected Today</p>
          <p className="text-2xl font-bold tracking-tight sm:text-3xl">{summary ? formatINR(summary.todayTotal) : formatINR(0)}</p>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-sm">
          <div className="text-center">
            <p className="text-green-100 text-xs">Verified</p>
            <p className="font-bold text-lg">{summary?.todayCount ?? 0}</p>
          </div>
          <div className="w-px h-8 bg-white/20" />
          <div className="text-center">
            <p className="text-green-100 text-xs">Pending</p>
            <p className="font-bold text-lg">{summary?.todayPendingCount ?? 0}</p>
          </div>
        </div>
      </div>

      {/* Summary Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="rounded-xl bg-gradient-to-br from-blue-500/10 to-blue-600/5 ring-1 ring-border/50 shadow-sm hover:scale-[1.02] transition-all duration-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg"><Wallet className="h-5 w-5 text-white" /></div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{total}</p>
                <p className="text-xs text-muted-foreground">Total Payments</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 ring-1 ring-border/50 shadow-sm hover:scale-[1.02] transition-all duration-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg"><CalendarIcon className="h-5 w-5 text-white" /></div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{summary ? formatINR(summary.todayTotal) : formatINR(0)}</p>
                <p className="text-xs text-muted-foreground">This Month</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl bg-gradient-to-br from-amber-500/10 to-amber-600/5 ring-1 ring-border/50 shadow-sm hover:scale-[1.02] transition-all duration-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg"><RotateCcw className="h-5 w-5 text-white" /></div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-bold tabular-nums">{pendingVerifyCount}</p>
                  {pendingVerifyCount > 0 && <span className="relative flex h-2.5 w-2.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" /><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" /></span>}
                </div>
                <p className="text-xs text-muted-foreground">Pending Refunds</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl bg-gradient-to-br from-red-500/10 to-red-600/5 ring-1 ring-border/50 shadow-sm hover:scale-[1.02] transition-all duration-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-lg"><AlertCircle className="h-5 w-5 text-white" /></div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{payments.filter((p) => p.status === "FAILED").length}</p>
                <p className="text-xs text-muted-foreground">Failed Transactions</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="rounded-xl border shadow-sm animate-slide-up" style={{ animationDelay: "250ms" }}>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search receipt # or subscriber..." className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <Select value={statusFilter || "all"} onValueChange={(v) => { setStatusFilter(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="VERIFIED">Verified</SelectItem>
                <SelectItem value="FAILED">Failed</SelectItem>
                <SelectItem value="REFUNDED">Refunded</SelectItem>
              </SelectContent>
            </Select>
            <Select value={modeFilter || "all"} onValueChange={(v) => { setModeFilter(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Mode" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Modes</SelectItem>
                <SelectItem value="CASH">Cash</SelectItem>
                <SelectItem value="UPI">UPI</SelectItem>
                <SelectItem value="ONLINE">Online</SelectItem>
                <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                <SelectItem value="CHEQUE">Cheque</SelectItem>
                <SelectItem value="WALLET">Wallet</SelectItem>
              </SelectContent>
            </Select>
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
            {(statusFilter || modeFilter || search || dateFrom || dateTo) && (
              <Button variant="outline" size="sm" onClick={() => { setStatusFilter(""); setModeFilter(""); setSearch(""); setPage(1); setDateFrom(undefined); setDateTo(undefined); }}>
                <XIcon className="h-3 w-3 mr-1" />Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Bulk actions bar */}
      {bulkMode && selectedIds.size > 0 && (
        <Card className="rounded-xl border shadow-sm bg-muted/50">
          <CardContent className="p-3 flex items-center justify-between">
            <span className="text-sm font-medium">{selectedIds.size} payment(s) selected</span>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => handleBulkAction("verify")} disabled={bulkVerifyMutation.isPending} className="bg-green-600 hover:bg-green-700 text-white">
                <CheckCircle2 className="h-4 w-4 mr-2" />Verify Selected
              </Button>
              <Button size="sm" variant="destructive" onClick={() => handleBulkAction("reject")} disabled={bulkVerifyMutation.isPending}>
                <XIcon className="h-4 w-4 mr-2" />Reject Selected
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())}>Clear</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment Table */}
      <Card className="rounded-xl border shadow-sm animate-slide-up" style={{ animationDelay: "300ms" }}>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  {bulkMode && (
                    <TableHead className="text-xs font-semibold uppercase tracking-wider w-10">
                      <Checkbox
                        checked={pendingPayments.length > 0 && selectedIds.size === pendingPayments.length}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                  )}
                  <TableHead className="text-xs font-semibold uppercase tracking-wider cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("receiptNumber")}>
                    Receipt # {renderSortIcon("receiptNumber")}
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Subscriber</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("amount")}>
                    Amount {renderSortIcon("amount")}
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider hidden sm:table-cell cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("paymentMode")}>
                    Mode {renderSortIcon("paymentMode")}
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider hidden md:table-cell">Reference</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("status")}>
                    Status {renderSortIcon("status")}
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider hidden lg:table-cell cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("createdAt")}>
                    Date {renderSortIcon("createdAt")}
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!payments.length ? (
                  <TableRow>
                    <TableCell colSpan={bulkMode ? 9 : 8} className="text-center py-20">
                      <div className="h-16 w-16 rounded-2xl bg-red-50 dark:bg-red-950/20 flex items-center justify-center mx-auto mb-4">
                        <CreditCard className="h-8 w-8 text-red-400/60" />
                      </div>
                      <p className="text-foreground font-semibold text-base">No payments found</p>
                      <p className="text-xs text-muted-foreground/70 mt-1 mb-4">Collect your first payment to get started</p>
                      <Button size="sm" onClick={() => setCollectOpen(true)} className="bg-red-600 hover:bg-red-700 text-white">
                        <Plus className="h-4 w-4 mr-1.5" />Collect Payment
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  payments.map((pay) => (
                    <TableRow key={pay.id} className={`border-l-4 ${STATUS_BORDER_MAP[pay.status] || "border-l-muted"} odd:bg-muted/10 hover:bg-muted/30 transition-colors duration-150`}>
                      {bulkMode && (
                        <TableCell>
                          {pay.status === "PENDING" ? (
                            <Checkbox
                              checked={selectedIds.has(pay.id)}
                              onCheckedChange={() => toggleSelect(pay.id)}
                            />
                          ) : null}
                        </TableCell>
                      )}
                      <TableCell className="font-mono text-xs font-medium">{pay.receiptNumber || "—"}</TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium">{pay.subscriber?.name || "—"}</p>
                          <p className="text-xs text-muted-foreground">{pay.subscriber?.code || ""}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-semibold tabular-nums text-foreground">{formatINR(pay.amount)}</TableCell>
                      <TableCell className="text-xs hidden sm:table-cell">
                        {(() => { const pill = MODE_PILL_MAP[pay.paymentMode]; return pill ? (
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${pill.bg} ${pill.text}`}>
                            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                            {MODE_LABELS[pay.paymentMode] || pay.paymentMode}
                          </span>
                        ) : <span className="text-xs font-medium text-muted-foreground">{pay.paymentMode}</span>; })()}
                      </TableCell>
                      <TableCell className="text-xs hidden md:table-cell text-muted-foreground">
                        {pay.transactionRef || "—"}
                        {pay.invoice && (
                          <span className="ml-2 font-mono text-[10px]">
                            → {pay.invoice.invoiceNumber}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_MAP[pay.status]?.class || ""}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_MAP[pay.status]?.dot || "bg-gray-400"} ${pay.status === "PENDING" ? "animate-pulse" : ""}`} />
                          {STATUS_MAP[pay.status]?.label || pay.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs hidden lg:table-cell text-muted-foreground whitespace-nowrap">{formatDateTime(pay.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openReceipt(pay)} title="Print Receipt">
                            <Printer className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openReceipt(pay)} title="View Details">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {pay.status === "PENDING" && (
                            <>
                              <Button variant="ghost" size="sm" className="h-7 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => openVerify(pay)}>
                                <Check className="h-3.5 w-3.5 mr-1" />Verify
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => openVerify(pay)}>
                                <XIcon className="h-3.5 w-3.5 mr-1" />Reject
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(pay)} title="Edit Payment">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => openDelete(pay)} title="Delete Payment">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                          {pay.status === "VERIFIED" && (
                            <Button variant="ghost" size="sm" className="h-7 text-orange-600 hover:text-orange-700 hover:bg-orange-50" onClick={() => openRefund(pay)}>
                              <RotateCcw className="h-3.5 w-3.5 mr-1" />Refund
                            </Button>
                          )}
                          {pay.status === "REFUNDED" && (
                            <Button variant="ghost" size="sm" className="h-7" onClick={() => { setSelectedPayment(pay); setRefundHistoryOpen(true); }}>
                              <RotateCcw className="h-3.5 w-3.5 mr-1" />History
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

      {/* ─── Refund Dialog ─── */}
      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-orange-600" />
              Process Refund
            </DialogTitle>
            <DialogDescription>
              Issue a refund for payment {selectedPayment?.receiptNumber || ""} ({selectedPayment?.subscriber?.name || ""})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-orange-800 dark:text-orange-300">Payment Amount</span>
                <span className="text-lg font-bold text-orange-700 dark:text-orange-400">{selectedPayment ? formatINR(selectedPayment.amount) : formatINR(0)}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Refund Amount *</Label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  placeholder="0.00"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  min={0}
                  max={selectedPayment?.amount || 0}
                  className="pl-9"
                />
              </div>
              <p className="text-xs text-muted-foreground">Max: {selectedPayment ? formatINR(selectedPayment.amount) : formatINR(0)}</p>
            </div>
            <div className="space-y-2">
              <Label>Reason *</Label>
              <Select value={refundReason} onValueChange={setRefundReason}>
                <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                <SelectContent>
                  {REFUND_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Additional notes about this refund..."
                value={refundNotes}
                onChange={(e) => setRefundNotes(e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Refund Mode</Label>
              <Select value={refundMode} onValueChange={setRefundMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REFUND_MODES.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
              <p className="text-xs text-red-700 dark:text-red-400 font-medium">⚠ This action cannot be undone</p>
              <p className="text-xs text-red-600/80 dark:text-red-400/70 mt-1">The payment will be marked as REFUNDED and the amount will be added to the subscriber&apos;s balance. If linked to an invoice, the invoice status will be updated.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundOpen(false)}>Cancel</Button>
            <Button
              onClick={handleRefund}
              disabled={refundMutation.isPending}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              {refundMutation.isPending ? "Processing..." : "Process Refund"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Refund History Dialog ─── */}
      <Dialog open={refundHistoryOpen} onOpenChange={setRefundHistoryOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-orange-600" />
              Refund History
            </DialogTitle>
            <DialogDescription>
              Refunds for payment {selectedPayment?.receiptNumber}
            </DialogDescription>
          </DialogHeader>
          {refundHistory?.refunds && refundHistory.refunds.length > 0 ? (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {refundHistory.refunds.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-muted/30">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-orange-700">{formatINR(r.amount)}</p>
                    <p className="text-xs text-muted-foreground">{r.reason}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatDateTime(r.createdAt)}{r.processedBy ? ` — by ${r.processedBy.name}` : ""}
                    </p>
                  </div>
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${r.status === "PROCESSED" ? "bg-green-100 text-green-700 border-green-200" : "bg-yellow-100 text-yellow-700 border-yellow-200"}`}>
                    {r.status}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">No refunds found for this payment.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundHistoryOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Collect Payment Dialog ─── */}
      <Dialog open={collectOpen} onOpenChange={(open) => { setCollectOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-red-100 dark:bg-red-900/30"><Wallet className="h-5 w-5 text-red-600" /></div>
              Collect Payment
            </DialogTitle>
            <DialogDescription>Record a new payment from a subscriber.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Subscriber search */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Search Subscriber *</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Type name or code..."
                  value={formSubSearch}
                  onChange={(e) => setFormSubSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Select Subscriber</Label>
              <Select value={formSubId} onValueChange={(v) => { setFormSubId(v); setFormAmount(""); }}>
                <SelectTrigger><SelectValue placeholder="Choose subscriber" /></SelectTrigger>
                <SelectContent>
                  <div className="max-h-60 overflow-y-auto">
                    {filteredSubs.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </SelectItem>
                    ))}
                    {!filteredSubs.length && (
                      <SelectItem value="none" disabled>No subscribers found</SelectItem>
                    )}
                  </div>
                </SelectContent>
              </Select>
            </div>

            {/* Outstanding Balance */}
            {formSubId && (
              <div className="space-y-2">
                {balanceLoading ? (
                  <Skeleton className="skeleton-wave h-12 w-full" />
                ) : subBalance ? (
                  <>
                    <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-amber-600" />
                          <span className="text-sm font-medium text-amber-800 dark:text-amber-300">Outstanding Balance</span>
                        </div>
                        <span className="text-lg font-bold text-amber-700 dark:text-amber-400">
                          {formatINR(subBalance.outstandingBalance)}
                        </span>
                      </div>
                    </div>

                    {/* Pending Invoices */}
                    {subBalance.pendingInvoices.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">Pending Invoices</p>
                        <div className="max-h-40 overflow-y-auto rounded-lg border">
                          <Table>
                            <TableHeader><TableRow>
                              <TableHead className="text-[10px]">Invoice</TableHead>
                              <TableHead className="text-[10px] text-right">Balance</TableHead>
                              <TableHead className="text-[10px] hidden sm:table-cell">Due Date</TableHead>
                            </TableRow></TableHeader>
                            <TableBody>
                              {subBalance.pendingInvoices.map((inv) => (
                                <TableRow key={inv.id} className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setFormAmount(String(inv.balanceAmount))}>
                                  <TableCell className="text-xs font-mono">{inv.invoiceNumber}</TableCell>
                                  <TableCell className="text-xs text-right font-semibold text-red-600">{formatINR(inv.balanceAmount)}</TableCell>
                                  <TableCell className="text-xs text-muted-foreground hidden sm:table-cell">{formatDate(inv.dueDate)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        <p className="text-[10px] text-muted-foreground">Click an invoice to auto-fill the amount</p>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">No outstanding balance found</p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Payment amount */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Amount *</Label>
                <div className="relative">
                  <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input type="number" className="pl-9" placeholder="Enter amount" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Payment Mode</Label>
                <Select value={formMode} onValueChange={setFormMode}>
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
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Reference / Transaction ID</Label>
                <Input placeholder="UPI ref, cheque number..." value={formRef} onChange={(e) => setFormRef(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Notes</Label>
                <Input placeholder="Optional notes" value={formNotes} onChange={(e) => setFormNotes(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCollectOpen(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleCollect} disabled={createMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white">
              {createMutation.isPending ? "Collecting..." : "Collect Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Verify/Reject Confirm ─── */}
      <Dialog open={verifyOpen} onOpenChange={setVerifyOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Verify Payment</DialogTitle>
            <DialogDescription>
              Verify payment details before confirming.
            </DialogDescription>
            <div className="space-y-1 mt-2">
              <p className="text-sm">Amount: <span className="font-semibold">{selectedPayment ? formatINR(selectedPayment.amount) : ""}</span></p>
              <p className="text-sm">Subscriber: <span className="font-semibold">{selectedPayment?.subscriber?.name}</span></p>
              <p className="text-sm">Mode: <span className="font-semibold">{selectedPayment ? MODE_LABELS[selectedPayment.paymentMode] : ""}</span></p>
              {selectedPayment?.transactionRef && <p className="text-sm">Reference: <span className="font-mono">{selectedPayment.transactionRef}</span></p>}
            </div>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setVerifyOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => selectedPayment && verifyMutation.mutate({ id: selectedPayment.id, status: "FAILED" })} disabled={verifyMutation.isPending}>
              Reject
            </Button>
            <Button onClick={() => selectedPayment && verifyMutation.mutate({ id: selectedPayment.id, status: "VERIFIED" })} disabled={verifyMutation.isPending} className="bg-green-600 hover:bg-green-700 text-white">
              {verifyMutation.isPending ? "Processing..." : "Verify"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Payment Dialog ─── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              Edit Payment
            </DialogTitle>
            <DialogDescription>
              Edit details for receipt <span className="font-mono font-medium">{selectedPayment?.receiptNumber}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Amount *</Label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input type="number" className="pl-9" placeholder="Enter amount" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Payment Mode</Label>
              <Select value={editMode} onValueChange={setEditMode}>
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
              <Label>Reference / Transaction ID</Label>
              <Input placeholder="UPI ref, cheque number, etc." value={editRef} onChange={(e) => setEditRef(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input placeholder="Optional notes" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={editMutation.isPending}>
              {editMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Payment Confirm ─── */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-red-600">Delete Payment</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this payment? This action cannot be undone.
            </DialogDescription>
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 space-y-1 mt-2">
              <p className="text-sm">Receipt: <span className="font-mono font-medium">{selectedPayment?.receiptNumber}</span></p>
              <p className="text-sm">Subscriber: <span className="font-medium">{selectedPayment?.subscriber?.name}</span></p>
              <p className="text-sm">Amount: <span className="font-semibold">{selectedPayment ? formatINR(selectedPayment.amount) : ""}</span></p>
            </div>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => selectedPayment && deleteMutation.mutate(selectedPayment.id)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting..." : "Delete Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Bulk Action Confirm ─── */}
      <Dialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>
              {bulkAction === "verify" ? "Verify Selected Payments" : "Reject Selected Payments"}
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to {bulkAction} {selectedIds.size} payment(s)?
              {bulkAction === "reject" && (
                <span className="text-xs text-red-600 font-medium block mt-1">
                  Rejected payments will be marked as failed and cannot be recovered.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBulkConfirmOpen(false)}>Cancel</Button>
            <Button
              variant={bulkAction === "verify" ? "default" : "destructive"}
              onClick={confirmBulkAction}
              disabled={bulkVerifyMutation.isPending}
              className={bulkAction === "verify" ? "bg-green-600 hover:bg-green-700 text-white" : ""}
            >
              {bulkVerifyMutation.isPending ? "Processing..." : bulkAction === "verify" ? "Verify" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Receipt Dialog ─── */}
      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30"><Printer className="h-5 w-5 text-emerald-600" /></div>
              Payment Receipt
            </DialogTitle>
            <DialogDescription>Receipt for {selectedPayment?.receiptNumber}</DialogDescription>
          </DialogHeader>
          {paymentDetail ? (
            <div ref={receiptRef}>
              <div className="border-2 border-dashed border-muted rounded-xl p-5 space-y-4 bg-gradient-to-b from-muted/20 to-transparent">
                {/* ISP Header */}
                <div className="text-center pb-4 border-b-2 border-border">
                  <h2 className="text-lg font-bold tracking-tight">{paymentDetail.ispSettings?.companyName || "My ISP"}</h2>
                  {paymentDetail.ispSettings?.address && (
                    <p className="text-xs text-muted-foreground mt-1">{[
                      paymentDetail.ispSettings.address,
                      paymentDetail.ispSettings.city,
                      paymentDetail.ispSettings.state,
                      paymentDetail.ispSettings.pincode,
                    ].filter(Boolean).join(", ")}</p>
                  )}
                  {(paymentDetail.ispSettings?.phone || paymentDetail.ispSettings?.email) && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {paymentDetail.ispSettings?.phone && `Phone: ${paymentDetail.ispSettings.phone}`}
                      {paymentDetail.ispSettings?.phone && paymentDetail.ispSettings?.email && " | "}
                      {paymentDetail.ispSettings?.email}
                    </p>
                  )}
                  {paymentDetail.ispSettings?.gstin && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">GSTIN: {paymentDetail.ispSettings.gstin}</p>
                  )}
                </div>
                {/* Receipt Details */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Receipt #</span>
                    <span className="font-mono font-medium text-xs">{paymentDetail.receiptNumber}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Date</span>
                    <span className="text-xs">{formatDateTime(paymentDetail.createdAt)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Status</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_MAP[paymentDetail.status]?.dot || "bg-gray-400"}`} />
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 badge-bounce ${STATUS_MAP[paymentDetail.status]?.class || ""}`}>
                        {STATUS_MAP[paymentDetail.status]?.label || paymentDetail.status}
                      </Badge>
                    </div>
                  </div>
                </div>
                {/* Subscriber Info */}
                <div className="bg-muted/40 rounded-lg p-3 space-y-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Subscriber Details</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Name</span>
                    <span className="font-medium">{paymentDetail.subscriber?.name || "—"}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Code</span>
                    <span className="font-mono text-xs">{paymentDetail.subscriber?.code || "—"}</span>
                  </div>
                  {paymentDetail.subscriber?.phone && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Phone</span>
                      <span className="text-xs">{paymentDetail.subscriber.phone}</span>
                    </div>
                  )}
                </div>
                {/* Payment Info */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Payment Details</p>
                  {paymentDetail.invoice && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Invoice</span>
                      <span className="font-mono text-xs">{paymentDetail.invoice.invoiceNumber}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Payment Mode</span>
                    <div className="flex items-center gap-1.5">
                      {(() => { const ModeIcon = MODE_ICONS[paymentDetail.paymentMode]; return ModeIcon ? <ModeIcon className="h-3.5 w-3.5 text-muted-foreground" /> : null; })()}
                      <span className="text-xs font-medium">{MODE_LABELS[paymentDetail.paymentMode] || paymentDetail.paymentMode}</span>
                    </div>
                  </div>
                  {paymentDetail.transactionRef && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Reference</span>
                      <span className="font-mono text-xs">{paymentDetail.transactionRef}</span>
                    </div>
                  )}
                  {paymentDetail.verifiedBy && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Verified By</span>
                      <span className="text-xs">{paymentDetail.verifiedBy.name}</span>
                    </div>
                  )}
                  {paymentDetail.collectedBy && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Collected By</span>
                      <span className="text-xs">{paymentDetail.collectedBy.name}</span>
                    </div>
                  )}
                </div>
                {/* Amount */}
                <div className="flex justify-between items-center pt-3 border-t-2 border-border">
                  <span className="text-sm font-bold">Total Amount</span>
                  <span className="text-xl font-bold tracking-tight">{formatINR(paymentDetail.amount)}</span>
                </div>
                {paymentDetail.notes && (
                  <p className="text-xs text-muted-foreground italic border-l-2 border-muted pl-2">
                    {paymentDetail.notes}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <Skeleton className="skeleton-wave h-40 w-full" />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiptOpen(false)}>Close</Button>
            <Button onClick={handlePrintReceipt} className="bg-red-600 hover:bg-red-700 text-white">
              <Printer className="h-4 w-4 mr-2" />Print Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
