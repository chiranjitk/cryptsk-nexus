"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Wallet, Plus, Search, Filter,
  AlertTriangle, TrendingUp, Users, ChevronLeft, ChevronRight,
  IndianRupee, CheckCircle2, Loader2, Download, Printer,
  ChevronDown, X, Target, CalendarDays, ShieldAlert, Undo2, RefreshCw,
  FileText, ReceiptText, CircleDollarSign, Clock, TimerReset,
  Smartphone, Landmark,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch, formatINR } from "@/lib/utils";
import { escapeHtml } from "@/lib/utils/html-escape";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line,
} from "recharts";

// ─── Entry Animation ──────────────────────────────────
function FadeIn({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <div
      className={`animate-in fade-in slide-in-from-bottom-2 duration-500 ${className}`}
      style={{ animationDelay: `${delay}ms`, animationFillMode: "both" }}
    >
      {children}
    </div>
  );
}

// ─── Overdue Aging Bucket ───────────────────────────────
function AgingBucketCard({ days, count, amount, icon: Icon }: { days: string; count: number; amount: number; icon: React.ElementType }) {
  const colorMap: Record<string, { bg: string; border: string; iconBg: string; iconText: string; text: string; bar: string }> = {
    "1-30": { bg: "bg-amber-50", border: "border-amber-200", iconBg: "bg-amber-100", iconText: "text-amber-700", text: "text-amber-800", bar: "bg-amber-400" },
    "31-60": { bg: "bg-orange-50", border: "border-orange-200", iconBg: "bg-orange-100", iconText: "text-orange-700", text: "text-orange-800", bar: "bg-orange-500" },
    "61-90": { bg: "bg-rose-50", border: "border-rose-200", iconBg: "bg-rose-100", iconText: "text-rose-700", text: "text-rose-800", bar: "bg-rose-500" },
    "90+": { bg: "bg-red-50", border: "border-red-200", iconBg: "bg-red-100", iconText: "text-red-700", text: "text-red-800", bar: "bg-red-600" },
  };
  const c = colorMap[days] || colorMap["90+"];
  const maxAmount = 100000;
  const pct = Math.min(100, amount > 0 ? (amount / maxAmount) * 100 : 0);
  return (
    <Card className={`${c.bg} border ${c.border} transition-all duration-200 hover:shadow-md hover:-translate-y-0.5`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-md ${c.iconBg} ${c.iconText}`}><Icon className="h-4 w-4" /></div>
            <div>
              <p className="text-xs font-semibold ${c.text}">{days} days</p>
              <p className="text-[10px] text-muted-foreground">{count} invoices</p>
            </div>
          </div>
          <p className={`text-lg font-bold tabular-nums ${c.text}`}>{formatINR(amount)}</p>
        </div>
        <div className="w-full h-1.5 rounded-full bg-white/60 overflow-hidden">
          <div className={`h-full rounded-full ${c.bar} transition-all duration-700`} style={{ width: `${pct}%` }} />
        </div>
      </CardContent>
    </Card>
  );
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

const PAYMENT_MODE_LABELS: Record<string, string> = {
  CASH: "Cash", UPI: "UPI", ONLINE: "Online",
  BANK_TRANSFER: "Bank Transfer", CHEQUE: "Cheque", WALLET: "Wallet",
};

const PAYMENT_STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Pending", cls: "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20" },
  VERIFIED: { label: "Verified", cls: "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20" },
  FAILED: { label: "Failed", cls: "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20" },
  REFUNDED: { label: "Refunded", cls: "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20" },
};

const BAR_COLORS = ["#DC2626", "#16A34A", "#0891B2", "#D97706", "#E11D48", "#EC4899", "#14B8A6", "#F97316"];

interface CollectionSummary {
  today: { collected: number; target: number; pending: number; percent: number };
  month: { collected: number; target: number; pending: number; percent: number };
  overdueInvoices: {
    id: string; invoiceNumber: string; subscriberName: string; subscriberCode: string;
    phone: string; area: string; dueDate: string; grandTotal: number; paidAmount: number; balanceAmount: number;
  }[];
  agentBreakdown: { agentId: string; agentName: string; totalCollected: number; todayCollected: number; paymentCount: number }[];
  modeBreakdown: Record<string, number>;
  dailyCollection: { day: number; amount: number }[];
  efficiencyTrend?: { date: string; efficiency: number }[];
  weeklyEfficiencyTrend?: { week: string; efficiency: number }[];
  monthlyEfficiencyTrend?: { month: string; efficiency: number }[];
}

interface PaymentItem {
  id: string;
  receiptNumber: string;
  subscriber: { id: string; name: string; code: string; phone: string; address: string; area: { name: string } | null };
  invoice: { id: string; invoiceNumber: string } | null;
  amount: number;
  paymentMode: string;
  transactionRef: string;
  status: string;
  notes: string;
  collectedBy: { id: string; name: string } | null;
  verifiedBy: { id: string; name: string } | null;
  createdAt: string;
}

interface InvoiceItem {
  id: string; invoiceNumber: string; subscriberName: string;
  grandTotal: number; paidAmount: number; balanceAmount: number; status: string;
}

// ─── Print Receipt ────────────────────────────────────────
function openPrintReceiptWindow(payment: PaymentItem, isp: { companyName: string; address: string; city: string; state: string; pincode: string; phone: string; email: string; gstin: string; receiptFooterText: string }) {
  const printWin = window.open("", "_blank");
  if (!printWin) { toast.error("Please allow popups"); return; }
  const addr = [isp.address, isp.city, isp.state, isp.pincode].filter(Boolean).join(", ");
  printWin.document.write(`<!DOCTYPE html><html><head><title>Receipt - ${escapeHtml(payment.receiptNumber)}</title>
<style>
  body{font-family:'Segoe UI',system-ui,sans-serif;margin:24px;color:#1f2937;max-width:400px;margin:0 auto;padding:32px}
  .header{text-align:center;border-bottom:2px solid #DC2626;padding-bottom:12px;margin-bottom:16px}
  .header h1{font-size:18px;margin:0;color:#DC2626} .header p{font-size:11px;color:#666;margin:2px 0}
  .divider{border-top:1px dashed #ccc;margin:12px 0}
  .row{display:flex;justify-content:space-between;font-size:13px;padding:3px 0} .label{color:#666} .value{font-weight:600}
  .total{font-size:18px;font-weight:700;border-top:2px solid #333;padding-top:8px;margin-top:4px}
  .footer{text-align:center;font-size:10px;color:#999;margin-top:20px;padding-top:12px;border-top:1px solid #eee}
  .no-print{text-align:center;margin-bottom:16px}
  @media print{.no-print{display:none!important}}
</style></head><body>
<div class="no-print"><button onclick="window.print()" style="padding:8px 24px;background:#DC2626;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600">Print Receipt</button></div>
<div class="header">
  <h1>${escapeHtml(isp.companyName)}</h1>
  ${addr ? `<p>${escapeHtml(addr)}</p>` : ""}
  ${isp.phone ? `<p>Phone: ${escapeHtml(isp.phone)}</p>` : ""}
  ${isp.email ? `<p>Email: ${escapeHtml(isp.email)}</p>` : ""}
  ${isp.gstin ? `<p>GSTIN: ${escapeHtml(isp.gstin)}</p>` : ""}
</div>
<p style="text-align:center;font-weight:600;font-size:14px;margin-bottom:12px">PAYMENT RECEIPT</p>
<div class="row"><span class="label">Receipt #</span><span class="value">${escapeHtml(payment.receiptNumber)}</span></div>
<div class="row"><span class="label">Date</span><span class="value">${formatDate(payment.createdAt)} ${formatTime(payment.createdAt)}</span></div>
<div class="divider"></div>
<div class="row"><span class="label">Subscriber</span><span class="value">${escapeHtml(payment.subscriber.name)}</span></div>
<div class="row"><span class="label">Code</span><span class="value">${escapeHtml(payment.subscriber.code)}</span></div>
${payment.invoice ? `<div class="row"><span class="label">Invoice</span><span class="value">${escapeHtml(payment.invoice.invoiceNumber)}</span></div>` : ""}
${payment.subscriber.phone ? `<div class="row"><span class="label">Phone</span><span class="value">${escapeHtml(payment.subscriber.phone)}</span></div>` : ""}
<div class="divider"></div>
<div class="row total"><span>Amount</span><span>${formatINR(payment.amount)}</span></div>
<div class="row"><span class="label">Mode</span><span class="value">${PAYMENT_MODE_LABELS[payment.paymentMode] || payment.paymentMode}</span></div>
${payment.transactionRef ? `<div class="row"><span class="label">Reference</span><span class="value">${escapeHtml(payment.transactionRef)}</span></div>` : ""}
<div class="divider"></div>
${payment.collectedBy ? `<div class="row"><span class="label">Collected By</span><span class="value">${escapeHtml(payment.collectedBy.name)}</span></div>` : ""}
<div class="row"><span class="label">Status</span><span class="value">${PAYMENT_STATUS_BADGE[payment.status]?.label || payment.status}</span></div>
<div class="footer">${escapeHtml(isp.receiptFooterText)}</div>
</body></html>`);
  printWin.document.close();
}

// ─── Target Setting Dialog ────────────────────────────────
function TargetSettingDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: targetsData, isLoading } = useQuery<{ agents: { id: string; name: string; monthlyTarget: number; dailyTarget: number; totalCollectedMonth: number; user: { name: string } | null }[] }>({
    queryKey: ["collection-targets"],
    queryFn: () => apiFetch("/api/collection/targets"),
    enabled: open,
  });

  const agents = targetsData?.agents || [];

  const setTargetMutation = useMutation({
    mutationFn: (body: { agentId: string; monthlyTarget: number }) =>
      apiFetch("/api/collection/targets", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      toast.success("Target updated");
      queryClient.invalidateQueries({ queryKey: ["collection-targets"] });
    },
    onError: () => toast.error("Failed to update target"),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Set Collection Targets</DialogTitle><DialogDescription>Configure monthly collection targets per agent</DialogDescription></DialogHeader>
        <div className="max-h-96 overflow-y-auto space-y-3">
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : agents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No collection agents configured</p>
          ) : agents.map((agent) => {
            const percent = agent.monthlyTarget > 0 ? Math.round((agent.totalCollectedMonth / agent.monthlyTarget) * 100) : 0;
            const barColor = percent >= 100 ? "bg-green-500" : percent >= 50 ? "bg-amber-500" : "bg-red-500";
            return (
              <div key={agent.id} className="flex items-center gap-3 p-3 border rounded-lg transition-all duration-200 hover:shadow-sm hover:border-red-200">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-7 h-7 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-xs font-bold">{(agent.name || agent.user?.name || "?").charAt(0)}</div>
                    <span className="text-sm font-medium truncate">{agent.name || agent.user?.name || "Unknown"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Collected: {formatINR(agent.totalCollectedMonth)}</span>
                    <div className="w-full h-2 rounded-full bg-muted overflow-hidden flex-1"><div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${Math.min(100, percent)}%` }} /></div>
                    <span className={`tabular-nums w-12 text-right font-medium ${percent >= 100 ? "text-green-600" : percent >= 50 ? "text-amber-600" : "text-red-500"}`}>{percent}%</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 w-32">
                  <span className="text-xs text-muted-foreground">₹</span>
                  <Input
                    type="number"
                    value={agent.monthlyTarget || ""}
                    onChange={(e) => setTargetMutation.mutate({ agentId: agent.id, monthlyTarget: Number(e.target.value) })}
                    className="h-8 text-xs"
                    placeholder="Target"
                    min="0"
                  />
                </div>
              </div>
            );
          })}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reconcile Section ────────────────────────────────────
function ReconcileSection() {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [openingBalance, setOpeningBalance] = useState("");

  const { data, isLoading } = useQuery<{ payments: PaymentItem[]; cashTotal: number; onlineTotal: number; upiTotal: number; bankTotal: number }>({
    queryKey: ["reconcile", date],
    queryFn: () => fetch(`/api/collection/reconcile?date=${date}`).then((r) => r.json()),
    enabled: !!date,
  });

  const reconcileMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/api/collection/reconcile", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Reconciliation saved"); queryClient.invalidateQueries({ queryKey: ["reconcile"] }); },
    onError: () => toast.error("Reconciliation failed"),
  });

  return (
    <div className="space-y-4">
      <Card className="border shadow-sm"><CardContent className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><Label className="text-xs">Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div><Label className="text-xs">Opening Cash Balance (₹)</Label><Input type="number" value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} placeholder="0" /></div>
          <div className="flex items-end"><Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => reconcileMut.mutate({ date, openingBalance: Number(openingBalance) })} disabled={reconcileMut.isPending}>{reconcileMut.isPending ? "Saving..." : "Save Reconciliation"}</Button></div>
        </div>
      </CardContent></Card>
      {isLoading ? <Skeleton className="skeleton-wave h-32 w-full" /> : data ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 ring-1 ring-border/50 rounded-xl hover:scale-[1.02] transition-all duration-200"><CardContent className="p-4"><div className="flex items-center gap-3 mb-1"><div className="h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg"><Wallet className="h-4 w-4 text-white" /></div><p className="text-xs font-medium text-muted-foreground">Cash Collections</p></div><p className="text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{formatINR(data.cashTotal || 0)}</p></CardContent></Card>
          <Card className="bg-gradient-to-br from-violet-500/10 to-violet-600/5 ring-1 ring-border/50 rounded-xl hover:scale-[1.02] transition-all duration-200"><CardContent className="p-4"><div className="flex items-center gap-3 mb-1"><div className="h-9 w-9 rounded-lg bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center shadow-lg"><Smartphone className="h-4 w-4 text-white" /></div><p className="text-xs font-medium text-muted-foreground">UPI</p></div><p className="text-xl font-bold tabular-nums text-violet-700 dark:text-violet-400">{formatINR(data.upiTotal || 0)}</p></CardContent></Card>
          <Card className="bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 ring-1 ring-border/50 rounded-xl hover:scale-[1.02] transition-all duration-200"><CardContent className="p-4"><div className="flex items-center gap-3 mb-1"><div className="h-9 w-9 rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center shadow-lg"><Landmark className="h-4 w-4 text-white" /></div><p className="text-xs font-medium text-muted-foreground">Online / Bank</p></div><p className="text-xl font-bold tabular-nums text-cyan-700 dark:text-cyan-400">{formatINR((data.onlineTotal || 0) + (data.bankTotal || 0))}</p></CardContent></Card>
          <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 ring-1 ring-border/50 rounded-xl hover:scale-[1.02] transition-all duration-200"><CardContent className="p-4"><div className="flex items-center gap-3 mb-1"><div className="h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg"><CheckCircle2 className="h-4 w-4 text-white" /></div><p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Expected Cash</p></div><p className="text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{formatINR((data.cashTotal || 0) + Number(openingBalance || 0))}</p></CardContent></Card>
        </div>
      ) : null}
    </div>
  );
}

// ─── Refunds Section ──────────────────────────────────────
function RefundsSection() {
  const queryClient = useQueryClient();
  const [showRefund, setShowRefund] = useState(false);
  const [refundPaymentId, setRefundPaymentId] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundMode, setRefundMode] = useState("Original");

  // GET /api/refunds exposes the true Refund records — reason/mode/status live
  // there (the old workaround scraped REFUNDED payments and guessed fields).
  type RefundRow = {
    id: string; amount: number; reason: string; mode: string; status: string;
    createdAt: string;
    payment: { id: string; receiptNumber: string; amount: number; paymentMode: string; status: string; subscriber: { name: string; code: string } | null } | null;
    processedBy: { id: string; name: string } | null;
  };
  const { data, isLoading } = useQuery<{ refunds: RefundRow[]; summary: { totalRefunded: number; count: number; statusCounts: { status: string; count: number; amount: number }[] } }>({
    queryKey: ["collection-refunds"],
    queryFn: () => fetch("/api/refunds?limit=50").then((r) => r.json()),
  });

  const refundMut = useMutation({
    // The refund API expects the payment UUID, but operators know receipts by
    // their number — resolve "RCT-…" (or raw uuid) to the payment id first and
    // surface a clear error when nothing matches.
    mutationFn: async (body: Record<string, string>) => {
      const entered = body.paymentId.trim();
      let paymentId = entered;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entered)) {
        const res = await apiFetch<{ payments: { id: string; receiptNumber: string; status: string }[] }>(
          `/api/payments?search=${encodeURIComponent(entered)}&limit=10`
        );
        const match = (res.payments || []).find((p) => p.receiptNumber === entered) || (res.payments || [])[0];
        if (!match) throw new Error(`No payment found for receipt "${entered}"`);
        if (match.status !== "VERIFIED") throw new Error(`Payment ${match.receiptNumber} is ${match.status} — only VERIFIED payments can be refunded`);
        paymentId = match.id;
      }
      return apiFetch(`/api/payments/${paymentId}/refund`, { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => { toast.success("Refund initiated"); setShowRefund(false); setRefundAmount(""); setRefundReason(""); queryClient.invalidateQueries({ queryKey: ["collection-refunds"] }); queryClient.invalidateQueries({ queryKey: ["collection-payments"] }); },
    onError: (e: Error) => toast.error(e.message || "Refund failed"),
  });

  const refunds = data?.refunds || [];
  const summary = data?.summary;
  const refundTotal = summary?.totalRefunded ?? refunds.reduce((s, r) => s + (r.amount || 0), 0);
  const processedCount = summary?.statusCounts?.find((s) => s.status === "PROCESSED")?.count ?? refunds.filter((r) => r.status === "PROCESSED").length;

  const REFUND_STATUS_STYLES: Record<string, string> = {
    PROCESSED: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
    PENDING: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
    CANCELLED: "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700",
    FAILED: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900",
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <p className="text-sm text-muted-foreground">Processed refunds</p>
          <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900 font-semibold tabular-nums">{formatINR(refundTotal)}</Badge>
          <Badge variant="outline" className="text-[10px] text-muted-foreground border-border">{processedCount} processed</Badge>
        </div>
        <Dialog open={showRefund} onOpenChange={setShowRefund}>
          <DialogTrigger asChild><Button variant="outline" size="sm"><Undo2 className="h-4 w-4 mr-1" />Process Refund</Button></DialogTrigger>
          <DialogContent className="max-w-md"><DialogHeader><DialogTitle>Process Refund</DialogTitle><DialogDescription>Refund a VERIFIED payment — the amount is credited back to the subscriber balance and the linked invoice is reversed.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-4">
            <div><Label className="text-xs">Payment Receipt #</Label><Input value={refundPaymentId} onChange={(e) => setRefundPaymentId(e.target.value)} placeholder="Enter receipt number" /></div>
            <div><Label className="text-xs">Amount (₹)</Label><Input type="number" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} /></div>
            <div><Label className="text-xs">Reason</Label><Textarea value={refundReason} onChange={(e) => setRefundReason(e.target.value)} rows={2} /></div>
            <div><Label className="text-xs">Refund Mode</Label><Select value={refundMode} onValueChange={setRefundMode}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Original">Original</SelectItem><SelectItem value="UPI">UPI</SelectItem><SelectItem value="BANK">Bank Transfer</SelectItem></SelectContent></Select></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowRefund(false)}>Cancel</Button><Button className="bg-red-600 hover:bg-red-700 text-white" onClick={() => { if (!refundPaymentId || !refundAmount) { toast.error("Payment ID and amount required"); return; } refundMut.mutate({ paymentId: refundPaymentId, amount: refundAmount, reason: refundReason, mode: refundMode }); }}>Process</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card className="border shadow-sm"><CardContent className="p-0"><div className="overflow-x-auto max-h-96 overflow-y-auto nice-scroll">
        <Table><TableHeader><TableRow><TableHead className="text-xs">Date</TableHead><TableHead className="text-xs">Receipt #</TableHead><TableHead className="text-xs">Subscriber</TableHead><TableHead className="text-xs text-right">Amount</TableHead><TableHead className="text-xs">Refund Mode</TableHead><TableHead className="text-xs">Reason</TableHead><TableHead className="text-xs">Processed By</TableHead><TableHead className="text-xs">Status</TableHead></TableRow></TableHeader>
        <TableBody>{isLoading ? Array.from({ length: 3 }).map((_, i) => <TableRow key={i}><TableCell colSpan={8}><Skeleton className="skeleton-wave h-8" /></TableCell></TableRow>) : refunds.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-10"><div className="flex flex-col items-center"><Undo2 className="h-8 w-8 text-muted-foreground/30 mb-2" /><p className="text-muted-foreground">No refunds processed</p><p className="text-[11px] text-muted-foreground/70 mt-0.5">Refunds appear here once processed against VERIFIED payments</p></div></TableCell></TableRow> : refunds.map((r, i) => (
          <TableRow key={r.id || i} className="transition-colors hover:bg-muted/40">
            <TableCell className="text-xs whitespace-nowrap">{r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—"}</TableCell>
            <TableCell className="font-mono text-xs">{r.payment?.receiptNumber || "—"}</TableCell>
            <TableCell className="text-xs"><span className="font-medium inline-block max-w-[140px] truncate align-middle" title={r.payment?.subscriber?.name || undefined}>{r.payment?.subscriber?.name || "—"}</span>{r.payment?.subscriber?.code && <span className="text-muted-foreground ml-1.5 font-mono text-[10px]">{r.payment.subscriber.code}</span>}</TableCell>
            <TableCell className="text-xs text-right font-semibold tabular-nums text-orange-600 dark:text-orange-400">{formatINR(r.amount || 0)}</TableCell>
            <TableCell className="text-xs">{r.mode || "—"}</TableCell>
            <TableCell className="text-xs text-muted-foreground max-w-[170px] truncate" title={r.reason || undefined}>{r.reason || "—"}</TableCell>
            <TableCell className="text-xs text-muted-foreground">{r.processedBy?.name || "System"}</TableCell>
            <TableCell><Badge variant="outline" className={`text-[10px] font-medium ${REFUND_STATUS_STYLES[r.status] || "bg-gray-100 text-gray-500 border-gray-200"}`}>{r.status}</Badge></TableCell>
          </TableRow>
        ))}</TableBody></Table>
      </div></CardContent></Card>
    </div>
  );
}

// ─── Disputes Section ─────────────────────────────────────
function CollectionDisputesSection() {
  const queryClient = useQueryClient();
  const [showRaise, setShowRaise] = useState(false);
  const [disputeSubId, setDisputeSubId] = useState("");
  const [disputeInvId, setDisputeInvId] = useState("");
  const [disputeAmount, setDisputeAmount] = useState("");
  const [disputeReason, setDisputeReason] = useState("");

  const { data, isLoading } = useQuery<{ disputes: { id: string; subscriberId: string; invoiceId: string; amount: number; reason: string; status: string; resolution: string; createdAt: string; subscriber: { name: string; code: string } | null; resolvedBy: { name: string } | null }[] }>({
    queryKey: ["collection-disputes"],
    queryFn: () => apiFetch("/api/disputes"),
  });

  const disputeMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/api/disputes", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Dispute raised"); setShowRaise(false); setDisputeAmount(""); setDisputeReason(""); queryClient.invalidateQueries({ queryKey: ["collection-disputes"] }); },
    onError: () => toast.error("Failed to raise dispute"),
  });

  const resolveMut = useMutation({
    mutationFn: (body: { id: string; status: string; resolution: string }) => apiFetch("/api/disputes", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => { toast.success("Dispute resolved"); queryClient.invalidateQueries({ queryKey: ["collection-disputes"] }); },
    onError: () => toast.error("Failed to resolve dispute"),
  });

  const disputes = data?.disputes || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3"><ShieldAlert className="h-4 w-4 text-amber-600" /><p className="text-sm font-medium">Invoice Disputes</p><Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200">{disputes.length}</Badge></div>
        <Dialog open={showRaise} onOpenChange={setShowRaise}><DialogTrigger asChild><Button variant="outline" size="sm" className="text-amber-600"><ShieldAlert className="h-4 w-4 mr-1" />Raise Dispute</Button></DialogTrigger>
          <DialogContent className="max-w-md"><DialogHeader><DialogTitle>Raise Dispute</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div><Label className="text-xs">Subscriber ID</Label><Input value={disputeSubId} onChange={(e) => setDisputeSubId(e.target.value)} placeholder="Subscriber ID" /></div>
            <div><Label className="text-xs">Invoice ID</Label><Input value={disputeInvId} onChange={(e) => setDisputeInvId(e.target.value)} placeholder="Invoice ID" /></div>
            <div><Label className="text-xs">Disputed Amount (₹)</Label><Input type="number" value={disputeAmount} onChange={(e) => setDisputeAmount(e.target.value)} /></div>
            <div><Label className="text-xs">Reason *</Label><Textarea value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)} rows={3} placeholder="Describe the issue..." /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowRaise(false)}>Cancel</Button><Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => { if (!disputeSubId || !disputeReason) { toast.error("Subscriber ID and reason required"); return; } disputeMut.mutate({ subscriberId: disputeSubId, invoiceId: disputeInvId, amount: Number(disputeAmount) || 0, reason: disputeReason }); }}>Raise Dispute</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card className="border shadow-sm"><CardContent className="p-0"><div className="overflow-x-auto max-h-96 overflow-y-auto">
        <Table><TableHeader><TableRow><TableHead className="text-xs">Date</TableHead><TableHead className="text-xs">Subscriber</TableHead><TableHead className="text-xs text-right">Amount</TableHead><TableHead className="text-xs">Reason</TableHead><TableHead className="text-xs">Status</TableHead><TableHead className="text-xs text-right">Actions</TableHead></TableRow></TableHeader>
        <TableBody>{isLoading ? Array.from({ length: 3 }).map((_, i) => <TableRow key={i}><TableCell colSpan={7}><Skeleton className="skeleton-wave h-8" /></TableCell></TableRow>) : disputes.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-10"><div className="flex flex-col items-center"><ShieldAlert className="h-8 w-8 text-muted-foreground/30 mb-2" /><p className="text-muted-foreground">No disputes</p></div></TableCell></TableRow> : disputes.map((d) => (
          <TableRow key={d.id}><TableCell className="text-xs">{new Date(d.createdAt).toLocaleDateString("en-IN")}</TableCell><TableCell className="text-xs font-medium"><span className="block max-w-[140px] truncate" title={d.subscriber?.name || undefined}>{d.subscriber?.name || "—"}</span></TableCell><TableCell className="text-xs text-right font-semibold tabular-nums">{formatINR(d.amount)}</TableCell><TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{d.reason}</TableCell><TableCell><Badge variant="outline" className={`text-[10px] ${d.status === "OPEN" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>{d.status}</Badge></TableCell><TableCell className="text-right">{d.status === "OPEN" ? <Button variant="ghost" size="sm" className="h-7 text-xs text-green-600" onClick={() => resolveMut.mutate({ id: d.id, status: "RESOLVED", resolution: "Resolved" })}>Resolve</Button> : <span className="text-[10px] text-muted-foreground">{d.resolution || "—"}</span>}</TableCell></TableRow>
        ))}</TableBody></Table>
      </div></CardContent></Card>
    </div>
  );
}

export default function CollectionPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [modeFilter, setModeFilter] = useState("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState("20");
  const [showPaymentEntry, setShowPaymentEntry] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showTargets, setShowTargets] = useState(false);
  const [efficiencyPeriod, setEfficiencyPeriod] = useState<"daily" | "weekly" | "monthly">("daily");

  // Receipt print state
  const [receiptPayment, setReceiptPayment] = useState<PaymentItem | null>(null);
  const [receiptIsp, setReceiptIsp] = useState<{ companyName: string; address: string; city: string; state: string; pincode: string; phone: string; email: string; gstin: string; receiptFooterText: string } | null>(null);

  // Summary data
  const { data: summary, isLoading: summaryLoading } = useQuery<CollectionSummary>({
    queryKey: ["collection-summary"],
    queryFn: () => apiFetch("/api/collection/summary"),
  });

  // Payments history
  const { data, isLoading: paymentsLoading } = useQuery({
    queryKey: ["collection-payments", search, statusFilter, modeFilter, startDate, endDate, page, perPage],
    queryFn: () => {
      const params = new URLSearchParams({ page: page.toString(), limit: perPage });
      if (search) params.set("search", search);
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (modeFilter !== "ALL") params.set("paymentMode", modeFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      return apiFetch(`/api/collection?${params}`);
    },
    enabled: activeTab === "history",
  });

  // Subscribers for payment entry
  const { data: subscribersData } = useQuery({
    queryKey: ["subscribers-collection"],
    queryFn: () => apiFetch("/api/subscribers?limit=200").catch(() => ({ subscribers: [] })),
    enabled: showPaymentEntry,
  });

  // Invoices for a subscriber (partial payment linkage)
  const [selectedSubId, setSelectedSubId] = useState("");
  const { data: invoicesData } = useQuery({
    queryKey: ["subscriber-invoices", selectedSubId],
    queryFn: () => apiFetch(`/api/invoices?subscriberId=${selectedSubId}&limit=50`).catch(() => ({ invoices: [] })),
    enabled: !!selectedSubId,
  });

  // Create payment mutation
  const createPaymentMutation = useMutation({
    mutationFn: (values: Record<string, string>) =>
      apiFetch("/api/collection", { method: "POST", body: JSON.stringify(values) }),
    onSuccess: (res) => {
      if (res.error) { toast.error(res.error); return; }
      toast.success(`Payment of ${formatINR(res.payment.amount)} recorded - ${res.payment.receiptNumber}`);
      setShowPaymentEntry(false);
      queryClient.invalidateQueries({ queryKey: ["collection-summary"] });
      queryClient.invalidateQueries({ queryKey: ["collection-payments"] });
    },
    onError: () => toast.error("Failed to record payment"),
  });

  const payments = (data?.payments || []) as PaymentItem[];
  const total = data?.total || 0;
  const limit = parseInt(perPage);
  const totalPages = Math.ceil(total / limit);

  const verifyPayment = (paymentId: string) => {
    createPaymentMutation.mutate({ action: "verify", paymentId } as unknown as Record<string, string>);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };
  const toggleAll = () => {
    if (selectedIds.length === payments.length) setSelectedIds([]);
    else setSelectedIds(payments.map((p) => p.id));
  };

  const modeData = (() => {
    if (!summary?.modeBreakdown) return [];
    return Object.entries(summary.modeBreakdown)
      .map(([mode, amount]) => ({ mode: PAYMENT_MODE_LABELS[mode] || mode, amount: Math.round(amount) }))
      .sort((a, b) => b.amount - a.amount);
  })();

  // Efficiency data based on period
  const efficiencyData = (() => {
    if (efficiencyPeriod === "weekly" && summary?.weeklyEfficiencyTrend) {
      return summary.weeklyEfficiencyTrend.map((d) => ({ date: d.week, efficiency: d.efficiency }));
    }
    if (efficiencyPeriod === "monthly" && summary?.monthlyEfficiencyTrend) {
      return summary.monthlyEfficiencyTrend.map((d) => ({ date: d.month, efficiency: d.efficiency }));
    }
    return summary?.efficiencyTrend?.map((d) => ({ date: d.date, efficiency: d.efficiency })) || [];
  })();

  // Handle receipt print
  const handlePrintReceipt = async (payment: PaymentItem) => {
    try {
      const receiptData = await apiFetch<{ payment: PaymentItem; isp: { companyName: string; address: string; city: string; state: string; pincode: string; phone: string; email: string; gstin: string; receiptFooterText: string } }>(`/api/collection/receipt?paymentId=${payment.id}`);
      openPrintReceiptWindow(payment, receiptData.isp);
    } catch {
      // Fallback with default ISP settings
      openPrintReceiptWindow(payment, {
        companyName: "My ISP", address: "", city: "", state: "", pincode: "",
        phone: "", email: "", gstin: "", receiptFooterText: "Thank you for choosing us!",
      });
    }
  };

  const handleExportCSV = () => {
    const rows = [["Receipt #", "Subscriber", "Invoice", "Amount", "Mode", "Status", "Collected By", "Date"]];
    payments.forEach((p) => rows.push([p.receiptNumber, p.subscriber.name, p.invoice?.invoiceNumber || "", String(p.amount), p.paymentMode, p.status, p.collectedBy?.name || "", String(p.createdAt)]));
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `collections_${new Date().toISOString().split("T")[0]}.csv`; a.click();
    toast.success("Collection exported as CSV");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Collection</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track payments and manage collections</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowTargets(true)}><Target className="h-4 w-4 mr-1" />Set Targets</Button>
          <Button variant="outline" size="sm" onClick={handleExportCSV}><Download className="h-4 w-4 mr-1" />Export CSV</Button>
          <Button onClick={() => setShowPaymentEntry(true)} className="bg-red-600 hover:bg-red-700 text-white"><Plus className="h-4 w-4 mr-1" />Record Payment</Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="overdue">Overdue</TabsTrigger>
          <TabsTrigger value="reconcile">Reconcile</TabsTrigger>
          <TabsTrigger value="refunds">Refunds</TabsTrigger>
          <TabsTrigger value="disputes">Disputes</TabsTrigger>
        </TabsList>

        {/* Dashboard Tab */}
        <TabsContent value="dashboard" className="space-y-6 mt-4">
          {summaryLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => (<Card key={i} className="border shadow-sm"><CardContent className="p-4"><Skeleton className="skeleton-wave h-3 w-24 mb-2" /><Skeleton className="skeleton-wave h-8 w-32" /></CardContent></Card>))}</div>
          ) : summary ? (<>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 ring-1 ring-border/50 rounded-xl hover:scale-[1.02] transition-all duration-200"><CardContent className="p-4"><div className="flex items-center justify-between mb-2"><div className="flex items-center gap-2"><div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg"><Wallet className="h-5 w-5 text-white" /></div><p className="text-xs font-medium text-muted-foreground">Collected Today</p></div></div><p className="text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400 truncate" title={formatINR(summary.today.collected)}>{formatINR(summary.today.collected)}</p><Progress value={summary.today.percent} className="h-1.5 mt-2" /><p className="text-[10px] text-muted-foreground mt-1">{summary.today.percent}% of {formatINR(summary.today.target)} target</p></CardContent></Card>
              <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 ring-1 ring-border/50 rounded-xl hover:scale-[1.02] transition-all duration-200"><CardContent className="p-4"><div className="flex items-center justify-between mb-2"><div className="flex items-center gap-2"><div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg"><Clock className="h-5 w-5 text-white" /></div><p className="text-xs font-medium text-muted-foreground">Pending Today</p></div></div><p className="text-xl font-bold tabular-nums text-amber-700 dark:text-amber-400 truncate" title={formatINR(summary.today.pending)}>{formatINR(summary.today.pending)}</p></CardContent></Card>
              <Card className="bg-gradient-to-br from-teal-500/10 to-teal-600/5 ring-1 ring-border/50 rounded-xl hover:scale-[1.02] transition-all duration-200"><CardContent className="p-4"><div className="flex items-center justify-between mb-2"><div className="flex items-center gap-2"><div className="h-10 w-10 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center shadow-lg"><IndianRupee className="h-5 w-5 text-white" /></div><p className="text-xs font-medium text-muted-foreground">Monthly Collection</p></div></div><p className="text-xl font-bold tabular-nums truncate" title={formatINR(summary.month.collected)}>{formatINR(summary.month.collected)}</p><Progress value={summary.month.percent} className="h-1.5 mt-2" /><p className="text-[10px] text-muted-foreground mt-1">{summary.month.percent}% of {formatINR(summary.month.target)} target</p></CardContent></Card>
              <Card className="bg-gradient-to-br from-red-500/10 to-red-600/5 ring-1 ring-border/50 rounded-xl hover:scale-[1.02] transition-all duration-200"><CardContent className="p-4"><div className="flex items-center justify-between mb-2"><div className="flex items-center gap-2"><div className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-lg"><AlertTriangle className="h-5 w-5 text-white" /></div><p className="text-xs font-medium text-muted-foreground">Total Outstanding</p></div>{summary.overdueInvoices.length > 0 && <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-red-500" title={`${summary.overdueInvoices.length} overdue invoice${summary.overdueInvoices.length === 1 ? "" : "s"} — see Overdue tab`} aria-label={`${summary.overdueInvoices.length} overdue invoices`}><AlertTriangle className="h-3 w-3" aria-hidden="true" />{summary.overdueInvoices.length}</span>}</div><p className="text-xl font-bold tabular-nums text-red-600 dark:text-red-400 truncate" title={formatINR(summary.month.pending)}>{formatINR(summary.month.pending)}</p><p className="text-[10px] text-muted-foreground mt-1">{summary.overdueInvoices.length} overdue invoices</p></CardContent></Card>
            </div>

            {/* Daily Collection + Payment Mode */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="border shadow-sm transition-all duration-200 hover:shadow-md min-w-0"><CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-red-600" />Daily Collection (This Month)</CardTitle></CardHeader><CardContent className="pt-0"><div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={summary.dailyCollection}><CartesianGrid strokeDasharray="3 3" className="stroke-border/50" /><XAxis dataKey="day" tick={{ fill: "#94A3B8", fontSize: 11 }} /><YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} /><Tooltip formatter={(value: number) => formatINR(value)} /><Bar dataKey="amount" name="Collected" radius={[3, 3, 0, 0]} barSize={12} fill="#DC2626" /></BarChart></ResponsiveContainer></div></CardContent></Card>
              <Card className="border shadow-sm transition-all duration-200 hover:shadow-md min-w-0"><CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><CircleDollarSign className="h-4 w-4 text-teal-600" />Payment Mode Breakdown</CardTitle></CardHeader><CardContent className="pt-0">{modeData.length > 0 ? (<div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={modeData} layout="vertical" margin={{ left: 10 }}><CartesianGrid strokeDasharray="3 3" className="stroke-border/50" horizontal={false} /><XAxis type="number" tick={{ fill: "#94A3B8", fontSize: 11 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} /><YAxis dataKey="mode" type="category" tick={{ fill: "#64748B", fontSize: 11 }} width={80} /><Tooltip formatter={(value: number) => formatINR(value)} /><Bar dataKey="amount" name="Amount" radius={[0, 3, 3, 0]} barSize={16}>{modeData.map((_, index) => <Cell key={`cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer></div>) : (<div className="flex flex-col items-center justify-center h-48 gap-2"><CircleDollarSign className="h-10 w-10 text-muted-foreground/30" /><p className="text-sm text-muted-foreground">No payment mode data yet</p></div>)}</CardContent></Card>
            </div>

            {/* Collection Efficiency Trend with period toggle */}
            {efficiencyData.length > 0 && (
              <Card className="border shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-teal-600" />Collection Efficiency Trend</CardTitle>
                    <div className="flex items-center gap-1">
                      {(["daily", "weekly", "monthly"] as const).map((p) => (
                        <Button key={p} variant={efficiencyPeriod === p ? "default" : "outline"} size="sm" className="text-[10px] h-6 px-2 capitalize" onClick={() => setEfficiencyPeriod(p)}>{p}</Button>
                      ))}
                    </div>
                  </div>
                  <CardDescription className="text-xs">(collected / target) × 100 per {efficiencyPeriod === "daily" ? "day" : efficiencyPeriod === "weekly" ? "week" : "month"}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0"><div className="h-56"><ResponsiveContainer width="100%" height="100%"><LineChart data={efficiencyData}><CartesianGrid strokeDasharray="3 3" className="stroke-border/50" /><XAxis dataKey="date" tick={{ fill: "#94A3B8", fontSize: 10 }} /><YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} /><Tooltip formatter={(v: number) => `${v}%`} /><Line type="monotone" dataKey="efficiency" name="Efficiency" stroke="#16A34A" strokeWidth={2} dot={{ r: 3 }} /></LineChart></ResponsiveContainer></div></CardContent>
              </Card>
            )}

            {/* Agent Breakdown with Progress */}
            {summary.agentBreakdown.length > 0 && (
              <Card className="border shadow-sm transition-all duration-200 hover:shadow-md"><CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><Users className="h-4 w-4 text-teal-600" />Agent Target Tracking</CardTitle></CardHeader><CardContent className="pt-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow className="hover:bg-muted/50"><TableHead className="text-xs">Agent</TableHead><TableHead className="text-xs text-center">Payments</TableHead><TableHead className="text-xs text-right">Today</TableHead><TableHead className="text-xs text-right">This Month</TableHead><TableHead className="text-xs text-right">Target Achievement</TableHead></TableRow></TableHeader><TableBody>{summary.agentBreakdown.map((agent, i) => { const totalAgentCollected = summary.agentBreakdown.reduce((s, a) => s + a.totalCollected, 0); const contribution = totalAgentCollected > 0 ? ((agent.totalCollected / totalAgentCollected) * 100).toFixed(1) : "0"; const achievementPct = summary.month.target > 0 ? Math.round((agent.totalCollected / summary.month.target) * (summary.agentBreakdown.length / 1) * 100) : 0; const barColor = achievementPct >= 100 ? "bg-green-500" : achievementPct >= 50 ? "bg-amber-500" : "bg-red-500"; return (<TableRow key={agent.agentId} className="hover:bg-muted/50 transition-colors"><TableCell className="text-xs font-medium"><div className="flex items-center gap-2 min-w-0"><div className="w-7 h-7 shrink-0 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-[10px] font-bold">{agent.agentName.charAt(0)}</div><span className="max-w-[160px] truncate" title={agent.agentName}>{agent.agentName}</span></div></TableCell><TableCell className="text-xs text-center tabular-nums">{agent.paymentCount}</TableCell><TableCell className="text-xs text-right font-semibold tabular-nums">{formatINR(agent.todayCollected)}</TableCell><TableCell className="text-xs text-right font-semibold tabular-nums">{formatINR(agent.totalCollected)}</TableCell><TableCell className="text-xs text-right"><div className="flex items-center justify-end gap-2"><div className="w-20 h-2 rounded-full bg-muted overflow-hidden"><div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${Math.min(100, parseFloat(contribution))}%` }} /></div><span className={`tabular-nums w-12 text-right font-medium ${parseFloat(contribution) >= 20 ? "text-green-600" : "text-muted-foreground"}`}>{contribution}%</span></div></TableCell></TableRow>); })}</TableBody></Table></div></CardContent></Card>
            )}
          </>) : null}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4 mt-4">
          {/* Bulk action bar */}
          {selectedIds.length > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200">{selectedIds.length} selected</Badge>
              <Button variant="outline" size="sm" onClick={() => setSelectedIds([])} className="ml-auto" aria-label="Clear selection"><X className="h-3.5 w-3.5" aria-hidden="true" /></Button>
            </div>
          )}

          <Card className="border shadow-sm"><CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search receipt, name, code..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9" /></div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}><SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="ALL">All Status</SelectItem><SelectItem value="VERIFIED">Verified</SelectItem><SelectItem value="PENDING">Pending</SelectItem><SelectItem value="FAILED">Failed</SelectItem><SelectItem value="REFUNDED">Refunded</SelectItem></SelectContent></Select>
              <Select value={modeFilter} onValueChange={(v) => { setModeFilter(v); setPage(1); }}><SelectTrigger><SelectValue placeholder="Mode" /></SelectTrigger><SelectContent><SelectItem value="ALL">All Modes</SelectItem><SelectItem value="CASH">Cash</SelectItem><SelectItem value="UPI">UPI</SelectItem><SelectItem value="ONLINE">Online</SelectItem><SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem><SelectItem value="CHEQUE">Cheque</SelectItem><SelectItem value="WALLET">Wallet</SelectItem></SelectContent></Select>
              <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} />
              <div className="flex gap-2"><Input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} /><Button variant="outline" size="sm" onClick={() => { setSearch(""); setStatusFilter("ALL"); setModeFilter("ALL"); setStartDate(""); setEndDate(""); setPage(1); }} aria-label="Clear filters"><Filter className="h-4 w-4" aria-hidden="true" /></Button></div>
            </div>
          </CardContent></Card>

          <Card className="border shadow-sm transition-all duration-200 hover:shadow-md"><CardContent className="p-0">
            {paymentsLoading ? (<div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>) : payments.length === 0 ? (<div className="flex flex-col items-center justify-center py-16"><FileText className="h-12 w-12 text-muted-foreground/30 mb-3" /><p className="text-muted-foreground font-medium">No payments found</p><p className="text-sm text-muted-foreground/70 mt-1">Try adjusting your filters or record a new payment</p></div>) : (<div className="overflow-x-auto"><Table><TableHeader><TableRow>
              <TableHead className="w-10"><Checkbox checked={selectedIds.length === payments.length && payments.length > 0} onCheckedChange={toggleAll} /></TableHead>
              <TableHead className="text-xs">Receipt #</TableHead><TableHead className="text-xs">Subscriber</TableHead><TableHead className="text-xs">Invoice</TableHead><TableHead className="text-xs text-right">Amount</TableHead><TableHead className="text-xs">Mode</TableHead><TableHead className="text-xs">Status</TableHead><TableHead className="text-xs">Collected By</TableHead><TableHead className="text-xs">Date</TableHead><TableHead className="text-xs text-right">Actions</TableHead>
            </TableRow></TableHeader><TableBody>{payments.map((p) => (<TableRow key={p.id}>
              <TableCell><Checkbox checked={selectedIds.includes(p.id)} onCheckedChange={() => toggleSelect(p.id)} /></TableCell>
              <TableCell className="font-mono text-xs font-semibold">{p.receiptNumber}</TableCell>
              <TableCell><div><p className="text-xs font-medium max-w-[160px] truncate" title={p.subscriber.name}>{p.subscriber.name}</p><p className="text-[10px] text-muted-foreground">{p.subscriber.code}</p></div></TableCell>
              <TableCell className="font-mono text-xs">{p.invoice?.invoiceNumber || "—"}</TableCell>
              <TableCell className="text-xs text-right font-semibold tabular-nums">{formatINR(p.amount)}</TableCell>
              <TableCell className="text-xs">{PAYMENT_MODE_LABELS[p.paymentMode] || p.paymentMode}</TableCell>
              <TableCell><Badge variant="outline" className={`text-[10px] px-1.5 py-0 badge-bounce ${PAYMENT_STATUS_BADGE[p.status]?.cls || ""}`}>{PAYMENT_STATUS_BADGE[p.status]?.label || p.status}</Badge></TableCell>
              <TableCell className="text-xs">{p.collectedBy?.name || "Self"}</TableCell>
              <TableCell className="text-xs">{formatDate(p.createdAt)} {formatTime(p.createdAt)}</TableCell>
              <TableCell className="text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handlePrintReceipt(p)}><Printer className="h-3 w-3 mr-1" />Receipt</Button>{p.status === "PENDING" && <Button variant="ghost" size="sm" className="h-7 text-xs text-green-600" onClick={() => verifyPayment(p.id)}><CheckCircle2 className="h-3 w-3 mr-1" />Verify</Button>}{p.status === "VERIFIED" && <Badge variant="outline" className="text-[10px] bg-green-100 text-green-700 border-green-200 ml-1" aria-label="Verified">✓</Badge>}</div></TableCell>
            </TableRow>))}</TableBody></Table></div>)}
          </CardContent>
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <div className="flex items-center gap-2"><p className="text-xs text-muted-foreground">Showing {(page - 1) * limit + 1}-{Math.min(page * limit, total)} of {total}</p>
                <Select value={perPage} onValueChange={(v) => { setPerPage(v); setPage(1); }}><SelectTrigger className="h-7 w-16 text-[10px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="10">10</SelectItem><SelectItem value="20">20</SelectItem><SelectItem value="50">50</SelectItem><SelectItem value="100">100</SelectItem></SelectContent></Select>
              </div>
              <div className="flex items-center gap-1"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" aria-hidden="true" /></Button>{Array.from({ length: Math.min(5, totalPages) }, (_, i) => { let pn: number; if (totalPages <= 5) pn = i + 1; else if (page <= 3) pn = i + 1; else if (page >= totalPages - 2) pn = totalPages - 4 + i; else pn = page - 2 + i; return (<Button key={pn} variant={page === pn ? "default" : "outline"} size="sm" className="h-7 w-8 text-xs" onClick={() => setPage(pn)}>{pn}</Button>); })}<Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" aria-hidden="true" /></Button></div>
            </div>
          )}
        </Card>
        </TabsContent>

        {/* Overdue Tab */}
        <TabsContent value="overdue" className="space-y-4 mt-4">
          {summaryLoading ? (<Card className="border shadow-sm"><CardContent className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</CardContent></Card>) : summary && summary.overdueInvoices.length > 0 ? (<>
            {/* Aging Bucket Cards */}
            {(() => {
              const now = new Date();
              const buckets = ["1-30", "31-60", "61-90", "90+"] as const;
              const bucketData = buckets.map((b) => {
                const [min, max] = b === "90+" ? [90, 9999] : b.split("-").map(Number);
                const invoices = summary.overdueInvoices.filter((inv) => {
                  const due = new Date(inv.dueDate);
                  const diffDays = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
                  return diffDays >= min && diffDays <= max;
                });
                return { days: b, count: invoices.length, amount: invoices.reduce((s, inv) => s + inv.balanceAmount, 0) };
              });
              const icons = [TimerReset, Clock, AlertTriangle, ShieldAlert];
              return (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {bucketData.map((b, i) => (
                    <FadeIn key={b.days} delay={i * 80}>
                      <AgingBucketCard days={b.days} count={b.count} amount={b.amount} icon={icons[i]} />
                    </FadeIn>
                  ))}
                </div>
              );
            })()}
            <Card className="border shadow-sm transition-all duration-200 hover:shadow-md"><CardHeader className="pb-2"><CardTitle className="text-base font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-600" />Overdue Subscribers<Badge variant="outline" className="bg-red-100 text-red-700 border-red-200 text-[10px] px-1.5 py-0">{summary.overdueInvoices.length} invoices</Badge></CardTitle></CardHeader><CardContent className="pt-0"><div className="overflow-x-auto max-h-[500px] overflow-y-auto"><Table><TableHeader><TableRow><TableHead className="text-xs">Invoice #</TableHead><TableHead className="text-xs">Subscriber</TableHead><TableHead className="text-xs">Phone</TableHead><TableHead className="text-xs">Area</TableHead><TableHead className="text-xs">Due Date</TableHead><TableHead className="text-xs text-right">Total</TableHead><TableHead className="text-xs text-right">Paid</TableHead><TableHead className="text-xs text-right">Balance</TableHead></TableRow></TableHeader><TableBody>{summary.overdueInvoices.map((inv) => (<TableRow key={inv.id} className="hover:bg-red-50/50 transition-colors"><TableCell className="font-mono text-xs font-semibold">{inv.invoiceNumber}</TableCell><TableCell><div><p className="text-xs font-medium max-w-[160px] truncate" title={inv.subscriberName}>{inv.subscriberName}</p><p className="text-[10px] text-muted-foreground">{inv.subscriberCode}</p></div></TableCell><TableCell className="text-xs">{inv.phone}</TableCell><TableCell className="text-xs">{inv.area}</TableCell><TableCell className="text-xs text-red-600 font-medium">{formatDate(inv.dueDate)}</TableCell><TableCell className="text-xs text-right tabular-nums">{formatINR(inv.grandTotal)}</TableCell><TableCell className="text-xs text-right tabular-nums text-green-600">{formatINR(inv.paidAmount)}</TableCell><TableCell className="text-xs text-right font-bold tabular-nums text-red-600">{formatINR(inv.balanceAmount)}</TableCell></TableRow>))}</TableBody></Table></div></CardContent></Card>
          </>) : (<Card className="border shadow-sm"><CardContent className="flex flex-col items-center justify-center py-16"><CheckCircle2 className="h-12 w-12 text-green-300 mb-3" /><p className="text-muted-foreground font-medium">No overdue invoices</p><p className="text-sm text-muted-foreground/70 mt-1">All payments are up to date!</p></CardContent></Card>)}
        </TabsContent>

        {/* Reconcile Tab */}
        <TabsContent value="reconcile" className="space-y-4 mt-4">
          <ReconcileSection />
        </TabsContent>

        {/* Refunds Tab */}
        <TabsContent value="refunds" className="space-y-4 mt-4">
          <RefundsSection />
        </TabsContent>

        {/* Disputes Tab */}
        <TabsContent value="disputes" className="space-y-4 mt-4">
          <CollectionDisputesSection />
        </TabsContent>
      </Tabs>

      {/* Record Payment Dialog */}
      <Dialog open={showPaymentEntry} onOpenChange={setShowPaymentEntry}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-red-600" />Record Payment</DialogTitle><DialogDescription>Enter payment (partial or full amount)</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <QuickPaymentForm
              subscribers={subscribersData?.subscribers || []}
              invoices={(invoicesData?.invoices || []) as InvoiceItem[]}
              onSubscriberChange={(id) => setSelectedSubId(id)}
              onSubmit={(values) => createPaymentMutation.mutate(values)}
              isSubmitting={createPaymentMutation.isPending}
              onClose={() => { setShowPaymentEntry(false); setSelectedSubId(""); }}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Target Setting Dialog */}
      <TargetSettingDialog open={showTargets} onClose={() => setShowTargets(false)} />
    </div>
  );
}

function QuickPaymentForm({ subscribers, invoices, onSubscriberChange, onSubmit, isSubmitting, onClose }: {
  subscribers: { id: string; name: string; code: string; planId: string | null }[];
  invoices: InvoiceItem[];
  onSubscriberChange: (id: string) => void;
  onSubmit: (values: Record<string, string>) => void;
  isSubmitting: boolean;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ subscriberId: "", amount: "", paymentMode: "CASH", transactionRef: "", notes: "", invoiceId: "", partial: "false" });
  const [partialAmount, setPartialAmount] = useState("");

  const handleSubChange = (id: string) => {
    setForm({ ...form, subscriberId: id, invoiceId: "" });
    setPartialAmount("");
    onSubscriberChange(id);
  };

  const handleInvoiceSelect = (invoiceId: string) => {
    const inv = invoices.find((i) => i.id === invoiceId);
    if (inv) {
      setForm({ ...form, invoiceId, amount: String(inv.balanceAmount) });
      setPartialAmount(String(inv.balanceAmount));
    }
  };

  const handleSubmit = () => {
    if (!form.subscriberId) { toast.error("Please select a subscriber"); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { toast.error("Please enter a valid amount"); return; }
    onSubmit({ ...form, amount: partialAmount || form.amount });
  };

  const selectedInvoice = invoices.find((i) => i.id === form.invoiceId);

  return (
    <div className="space-y-4">
      <div className="space-y-2"><Label className="text-xs font-medium">Subscriber *</Label><Select value={form.subscriberId} onValueChange={handleSubChange}><SelectTrigger><SelectValue placeholder="Select subscriber" /></SelectTrigger><SelectContent className="max-h-60">{subscribers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.code})</SelectItem>)}</SelectContent></Select></div>
      
      {form.subscriberId && invoices.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs font-medium">Link to Invoice (optional)</Label>
          <Select value={form.invoiceId} onValueChange={handleInvoiceSelect}>
            <SelectTrigger><SelectValue placeholder="Select invoice" /></SelectTrigger>
            <SelectContent className="max-h-60">
              {invoices.filter((i) => i.balanceAmount > 0).map((inv) => (
                <SelectItem key={inv.id} value={inv.id}>
                  {inv.invoiceNumber} — Balance: {formatINR(inv.balanceAmount)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedInvoice && (
            <div className="p-2 rounded bg-muted/50 text-[10px] space-y-0.5">
              <p>Invoice: <strong>{selectedInvoice.invoiceNumber}</strong></p>
              <p>Total: {formatINR(selectedInvoice.grandTotal)} | Paid: {formatINR(selectedInvoice.paidAmount)} | Balance: <strong className="text-red-600">{formatINR(selectedInvoice.balanceAmount)}</strong></p>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium">Amount (₹) *</Label>
          <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={form.partial === "true"} onChange={(e) => setForm({ ...form, partial: e.target.checked ? "true" : "false" })} className="rounded" />
            Partial payment
          </label>
        </div>
        {form.partial === "true" && selectedInvoice ? (
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Balance due: {formatINR(selectedInvoice.balanceAmount)}</p>
            <Input type="number" value={partialAmount} onChange={(e) => setPartialAmount(e.target.value)} placeholder="Enter partial amount" max={selectedInvoice.balanceAmount} />
            {parseFloat(partialAmount) > selectedInvoice.balanceAmount && <p className="text-[10px] text-red-500 mt-1">Amount cannot exceed balance</p>}
          </div>
        ) : (
          <Input type="number" min="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Enter amount" />
        )}
      </div>

      <div className="space-y-2"><Label className="text-xs font-medium">Payment Mode *</Label><Select value={form.paymentMode} onValueChange={(v) => setForm({ ...form, paymentMode: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="CASH">Cash</SelectItem><SelectItem value="UPI">UPI</SelectItem><SelectItem value="ONLINE">Online</SelectItem><SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem><SelectItem value="CHEQUE">Cheque</SelectItem><SelectItem value="WALLET">Wallet</SelectItem></SelectContent></Select></div>
      <div className="space-y-2"><Label className="text-xs font-medium">Transaction Reference</Label><Input value={form.transactionRef} onChange={(e) => setForm({ ...form, transactionRef: e.target.value })} placeholder="UPI ref, txn ID, etc." /></div>
      <div className="space-y-2"><Label className="text-xs font-medium">Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" rows={2} /></div>
      <div className="flex gap-2 pt-2"><Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button><Button onClick={handleSubmit} disabled={isSubmitting} className="flex-1 bg-green-600 hover:bg-green-700 text-white">{isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{isSubmitting ? "Recording..." : "Record Payment"}</Button></div>
    </div>
  );
}
