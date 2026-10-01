"use client";

// ═══════════════════════════════════════════════════════════════
// PAYMENTS — the ISP's money page. Zero revenue leak is the goal.
// Tabs: Overview | All Payments | Verification | Reconciliation |
//       Aging & Collectors
// Design language matches INTEGRATIONS + ALERT MANAGEMENT modules
// (teal/emerald good, amber warn, red danger, violet reconciliation).
// ═══════════════════════════════════════════════════════════════

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
  RefreshCw, ShieldAlert, FileX2, Clock3, Unlink, Link2,
  Send, Mail, MessageSquare, MessageCircle, Trophy, Medal,
  Award, Users, ChevronDown, ChevronUp, ScanLine, History,
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import PageHeader from "@/components/page-header";
import { MiniStat, AsyncActionButton, WarningStrip, EnvironmentPill } from "@/components/integrations/shared";
import { EmptyState, timeAgo } from "@/components/alerts/shared";

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

interface SubOption { id: string; name: string; code: string }

interface RefundRecord {
  id: string; amount: number; reason: string; status: string; createdAt: string;
  processedBy?: { name: string } | null;
}

interface ReceiptSendResult {
  channel: string; success: boolean; detail: string;
}

// ─── Analytics payload (GET /api/payments/analytics) ────
interface OrphanGatewayPayment {
  id: string; amount: number; transactionRef: string; receiptNumber: string;
  status: string; createdAt: string;
  subscriber: { name: string; code: string } | null;
}

interface AnalyticsSummary {
  collectedTodayCount: number; collectedTodayTotal: number;
  collectedMonthTotal: number; collectedMonthCount: number;
  pendingVerifyCount: number; pendingVerifyAmount: number;
  oldestPendingHours: number; failed30d: number; refunded30d: number;
}

interface LeakRadar {
  autoVerifiedCount: number; missingReceiptCount: number;
  stalePendingCount: number; unmatchedGatewayCount: number;
  orphanGatewayPayments: OrphanGatewayPayment[];
}

interface AgingBucket { key: string; label: string; count: number; amount: number }

interface TopDebtor {
  subscriberId: string; name: string; code: string;
  invoiceCount: number; outstanding: number; daysOverdue: number; oldestDueDate: string | null;
}

interface CollectorRow { userId: string | null; name: string; total: number; count: number; lastAt: string | null }

interface ModeRow { mode: string; total: number; count: number }

interface TrendPoint { date: string; total: number }

interface AnalyticsPayload {
  summary: AnalyticsSummary;
  leakRadar: LeakRadar;
  aging: {
    buckets: AgingBucket[]; totalOutstanding: number; totalCount: number;
    invoiceCount: number; topDebtors: TopDebtor[];
  };
  collectors: CollectorRow[];
  modes: ModeRow[];
  trend: TrendPoint[];
}

// ─── Reconciliation payload (GET /api/payments/reconcile) ─
interface ReconSuggestion {
  paymentId: string; receiptNumber: string; amount: number;
  confidence: "exact" | "high" | "possible";
}

interface ReconTxn {
  id: string; gatewayType: string; gatewayName: string; environment: string;
  transactionType: string; amount: number; status: string; externalRef: string;
  createdAt: string; matched: boolean;
  suggestion: ReconSuggestion | null;
  payment?: { id: string; receiptNumber: string; amount: number; status: string };
}

interface ReconLocalPayment {
  id: string; receiptNumber: string; amount: number; status: string;
  transactionRef: string; gatewayPaymentId: string; orderId: string;
  createdAt: string;
  subscriber: { name: string; code: string } | null;
  invoiceNumber: string; hasGatewayRecord: boolean;
}

interface ReconPayload {
  stats: { totalTransactions: number; matchedCount: number; unmatchedTransactionCount: number; unmatchedPaymentCount: number };
  matched: ReconTxn[];
  unmatchedTransactions: ReconTxn[];
  unmatchedPayments: ReconLocalPayment[];
}

// ─── Constants ──────────────────────────────────────────
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

const REFUND_REASONS = ["Error", "Duplicate", "Customer Request", "Service Issue", "Other"];
const REFUND_MODES = ["Original", "Bank Transfer", "UPI"];

const SEND_CHANNELS: { key: string; label: string; icon: LucideIcon }[] = [
  { key: "EMAIL", label: "Email", icon: Mail },
  { key: "SMS", label: "SMS", icon: MessageSquare },
  { key: "WHATSAPP", label: "WhatsApp", icon: MessageCircle },
];

const GATEWAY_META: Record<string, { label: string; class: string }> = {
  razorpay: { label: "Razorpay", class: "bg-teal-500/10 text-teal-700 dark:text-teal-400" },
  stripe: { label: "Stripe", class: "bg-violet-500/10 text-violet-700 dark:text-violet-400" },
  cashfree: { label: "Cashfree", class: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
};

const CONFIDENCE_META: Record<string, { label: string; class: string }> = {
  exact: { label: "Exact match", class: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  high: { label: "High confidence", class: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  possible: { label: "Possible match", class: "bg-slate-500/10 text-slate-600 dark:text-slate-400" },
};

const AGING_BAR: Record<string, string> = {
  current: "bg-slate-400 dark:bg-slate-500",
  d1_30: "bg-amber-400 dark:bg-amber-500",
  d31_60: "bg-orange-500 dark:bg-orange-500",
  d61_90: "bg-red-500 dark:bg-red-500",
  d90p: "bg-red-700 dark:bg-red-600",
};

type SortField = "createdAt" | "amount" | "paymentMode" | "status" | "receiptNumber";
type SortOrder = "asc" | "desc";
type TabKey = "overview" | "payments" | "verify" | "reconcile" | "aging";

// ─── Helpers ────────────────────────────────────────────
function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/** apiFetch throws `API <status>: <body>` — extract the backend's own error text. */
function parseApiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "Request failed";
  const m = raw.match(/^API \d+?:\s*([\s\S]*)$/);
  if (!m) return raw;
  const body = m[1].trim();
  try {
    const parsed = JSON.parse(body);
    return parsed?.error || parsed?.message || body;
  } catch {
    return body || raw;
  }
}

function ageInfo(createdAt: string): { label: string; tone: "red" | "amber" | "slate"; hours: number } {
  const ms = Math.max(0, Date.now() - new Date(createdAt).getTime());
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (hours >= 24) {
    return { label: days > 0 ? `${days}d ${hours % 24}h waiting` : `${hours}h waiting`, tone: "red", hours };
  }
  if (hours >= 2) return { label: `${hours}h waiting`, tone: "amber", hours };
  return { label: mins >= 1 ? `${mins}m waiting` : "just now", tone: "slate", hours };
}

function debtorChip(days: number): { label: string; class: string } {
  if (days <= 0) return { label: "Current", class: "bg-slate-500/10 text-slate-600 dark:text-slate-400" };
  if (days <= 30) return { label: `${days}d overdue`, class: "bg-amber-500/10 text-amber-700 dark:text-amber-400" };
  if (days <= 60) return { label: `${days}d overdue`, class: "bg-orange-500/10 text-orange-700 dark:text-orange-400" };
  return { label: `${days}d overdue`, class: "bg-red-500/10 text-red-700 dark:text-red-400" };
}

function StatusPill({ status }: { status: string }) {
  const meta = STATUS_MAP[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${meta?.class || ""}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta?.dot || "bg-gray-400"} ${status === "PENDING" ? "animate-pulse" : ""}`} />
      {meta?.label || status}
    </span>
  );
}

function ModePill({ mode }: { mode: string }) {
  const pill = MODE_PILL_MAP[mode];
  if (!pill) return <span className="text-xs font-medium text-muted-foreground">{mode}</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${pill.bg} ${pill.text}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
      {MODE_LABELS[mode] || mode}
    </span>
  );
}

function AgeChip({ createdAt }: { createdAt: string }) {
  const info = ageInfo(createdAt);
  const cls = info.tone === "red"
    ? "bg-red-500/10 text-red-700 dark:text-red-400"
    : info.tone === "amber"
      ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
      : "bg-slate-500/10 text-slate-600 dark:text-slate-400";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      <Clock3 className="h-2.5 w-2.5" />{info.label}
    </span>
  );
}

function GatewayChip({ type, name }: { type: string; name: string }) {
  const meta = GATEWAY_META[String(type).toLowerCase()] || { label: name || type || "Gateway", class: "bg-slate-500/10 text-slate-600 dark:text-slate-400" };
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${meta.class}`}>
      {meta.label}
    </span>
  );
}

function ConfidenceChip({ confidence }: { confidence: string }) {
  const meta = CONFIDENCE_META[confidence] || CONFIDENCE_META.possible;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.class}`}>
      <ScanLine className="h-2.5 w-2.5" />{meta.label}
    </span>
  );
}

// ─── Stat tile (wraps the shared MiniStat in a card) ────
function StatCard({ label, value, tone = "default", icon, hint, loading, onClick, ariaLabel }: {
  label: string; value: string; tone?: "default" | "good" | "bad" | "warn";
  icon: React.ReactNode; hint?: string; loading?: boolean;
  onClick?: () => void; ariaLabel?: string;
}) {
  return (
    <Card
      className={`rounded-xl border shadow-sm transition-all duration-200 ${onClick ? "cursor-pointer hover:ring-1 hover:ring-border hover:shadow-md" : "hover:scale-[1.01]"}`}
      onClick={onClick}
      aria-label={ariaLabel}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
    >
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          {icon}
        </div>
        {loading ? (
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="skeleton-wave h-3 w-20" />
            <Skeleton className="skeleton-wave h-5 w-14" />
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <MiniStat label={label} value={value} tone={tone} />
            {hint && <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{hint}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Pure-CSS 14-day trend bars ─────────────────────────
function TrendChart({ trend }: { trend: TrendPoint[] }) {
  const max = Math.max(...trend.map((t) => t.total), 1);
  const total = trend.reduce((s, t) => s + t.total, 0);
  if (!trend.length) {
    return <p className="py-10 text-center text-xs text-muted-foreground">No trend data yet.</p>;
  }
  return (
    <div>
      <div className="flex h-36 items-end gap-1.5">
        {trend.map((t) => {
          const pct = Math.max(2, Math.round((t.total / max) * 100));
          return (
            <div key={t.date} className="group flex h-full flex-1 flex-col justify-end" title={`${formatDate(t.date)} — ${formatINR(t.total)}`}>
              <div
                className={`rounded-t bg-emerald-500/50 transition-colors group-hover:bg-emerald-500 dark:bg-emerald-500/40 dark:group-hover:bg-emerald-400 ${t.total === 0 ? "!bg-muted" : ""}`}
                style={{ height: `${pct}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {trend.map((t) => (
          <span key={t.date} className="flex-1 text-center text-[9px] text-muted-foreground">{t.date.slice(8)}</span>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        14-day collected total <span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatINR(total)}</span> — hover a bar for the day&apos;s figure.
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// TAB 1 — OVERVIEW
// ═══════════════════════════════════════════════════════
function OverviewTab({ analytics, loading, onGoTab }: {
  analytics: AnalyticsPayload | undefined; loading: boolean; onGoTab: (t: TabKey) => void;
}) {
  const s = analytics?.summary;
  const radar = analytics?.leakRadar;
  const ar = analytics?.aging;

  const radarTotal = (radar?.autoVerifiedCount ?? 0) + (radar?.missingReceiptCount ?? 0) + (radar?.stalePendingCount ?? 0) + (radar?.unmatchedGatewayCount ?? 0);
  const radarClean = radarTotal === 0;

  // Recent verified payments (last 6)
  const { data: recentData, isLoading: recentLoading } = useQuery<{ payments: Payment[] }>({
    queryKey: ["payments-recent-verified"],
    queryFn: () => apiFetch<{ payments: Payment[] }>("/api/payments?page=1&limit=6&status=VERIFIED&sortBy=createdAt&sortOrder=desc"),
  });
  const recentVerified = recentData?.payments ?? [];

  const maxModeTotal = Math.max(...(analytics?.modes ?? []).map((m) => m.total), 1);

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* ── 6-tile stat strip ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Collected Today" loading={loading}
          value={formatINR(s?.collectedTodayTotal ?? 0)} tone="good"
          icon={<IndianRupee className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />}
          hint={`${s?.collectedTodayCount ?? 0} payments today`}
        />
        <StatCard
          label="Collected MTD" loading={loading}
          value={formatINR(s?.collectedMonthTotal ?? 0)} tone="good"
          icon={<TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />}
          hint={`${s?.collectedMonthCount ?? 0} payments this month`}
        />
        <StatCard
          label="Pending Verify" loading={loading}
          value={formatINR(s?.pendingVerifyAmount ?? 0)} tone={((s?.pendingVerifyCount ?? 0) > 0) ? "warn" : "good"}
          icon={<Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />}
          hint={`${s?.pendingVerifyCount ?? 0} waiting · oldest ${s?.oldestPendingHours ?? 0}h`}
          onClick={() => onGoTab("verify")} ariaLabel="Open verification queue"
        />
        <StatCard
          label="Outstanding AR" loading={loading}
          value={formatINR(ar?.totalOutstanding ?? 0)} tone={((ar?.totalOutstanding ?? 0) > 0) ? "bad" : "good"}
          icon={<AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />}
          hint={`${ar?.invoiceCount ?? 0} open invoices`}
          onClick={() => onGoTab("aging")} ariaLabel="Open aging and collectors"
        />
        <StatCard
          label="Failed 30d" loading={loading}
          value={String(s?.failed30d ?? 0)}
          icon={<XIcon className="h-5 w-5 text-slate-500" />}
          hint="last 30 days"
        />
        <StatCard
          label="Refunded 30d" loading={loading}
          value={String(s?.refunded30d ?? 0)}
          icon={<RotateCcw className="h-5 w-5 text-slate-500" />}
          hint="last 30 days"
        />
      </div>

      {/* ── Leak Radar strip ── */}
      <Card className="rounded-xl border border-violet-200 bg-violet-50/40 shadow-sm dark:border-violet-900/60 dark:bg-violet-950/20">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
              <ShieldAlert className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <p className="text-sm font-semibold">Leak Radar</p>
              <p className="text-[11px] text-muted-foreground">Four counters that catch money slipping through the cracks</p>
            </div>
            {radarClean ? (
              <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" /> All clean — every rupee traced
              </span>
            ) : (
              <Badge className="ml-auto border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                {radarTotal} item{radarTotal === 1 ? "" : "s"} need attention
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Button type="button" variant="outline" className="h-auto justify-start gap-2.5 p-3" onClick={() => onGoTab("verify")}>
              <ScanLine className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
              <span className="min-w-0 text-left">
                <span className="block text-sm font-bold tabular-nums">{radar?.autoVerifiedCount ?? 0}</span>
                <span className="block truncate text-[10px] text-muted-foreground">Auto-verified (maker = checker)</span>
              </span>
            </Button>
            <Button type="button" variant="outline" className="h-auto justify-start gap-2.5 p-3" onClick={() => onGoTab("payments")}>
              <FileX2 className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
              <span className="min-w-0 text-left">
                <span className="block text-sm font-bold tabular-nums">{radar?.missingReceiptCount ?? 0}</span>
                <span className="block truncate text-[10px] text-muted-foreground">Missing receipts</span>
              </span>
            </Button>
            <Button type="button" variant="outline" className="h-auto justify-start gap-2.5 p-3" onClick={() => onGoTab("verify")}>
              <Clock3 className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
              <span className="min-w-0 text-left">
                <span className="block text-sm font-bold tabular-nums">{radar?.stalePendingCount ?? 0}</span>
                <span className="block truncate text-[10px] text-muted-foreground">Stale pending &gt; 24h</span>
              </span>
            </Button>
            <Button type="button" variant="outline" className="h-auto justify-start gap-2.5 p-3" onClick={() => onGoTab("reconcile")}>
              <Unlink className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
              <span className="min-w-0 text-left">
                <span className="block text-sm font-bold tabular-nums">{radar?.unmatchedGatewayCount ?? 0}</span>
                <span className="block truncate text-[10px] text-muted-foreground">Unmatched gateway txns</span>
              </span>
            </Button>
          </div>
          {!radarClean && (radar?.orphanGatewayPayments?.length ?? 0) > 0 && (
            <div className="rounded-lg border border-violet-200 bg-background/60 p-2 dark:border-violet-900/60">
              <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Orphan gateway payments — no ledger link</p>
              <div className="space-y-1">
                {radar!.orphanGatewayPayments.slice(0, 5).map((o) => (
                  <button
                    key={o.id} type="button" onClick={() => onGoTab("reconcile")}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-muted/60"
                  >
                    <span className="font-mono text-[11px] font-medium">{o.receiptNumber || "no receipt"}</span>
                    <span className="truncate text-muted-foreground">{o.subscriber?.name || "—"}</span>
                    <span className="ml-auto font-semibold tabular-nums">{formatINR(o.amount)}</span>
                    <StatusPill status={o.status} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Trend + mode breakdown / recent ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-xl border shadow-sm">
          <CardContent className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <p className="text-sm font-semibold">Collection Trend — last 14 days</p>
            </div>
            {loading ? <Skeleton className="skeleton-wave h-40 w-full" /> : <TrendChart trend={analytics?.trend ?? []} />}
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Card className="rounded-xl border shadow-sm">
            <CardContent className="p-4">
              <div className="mb-3 flex items-center gap-2">
                <Wallet className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                <p className="text-sm font-semibold">Mode Breakdown — MTD</p>
              </div>
              {loading ? (
                <Skeleton className="skeleton-wave h-28 w-full" />
              ) : (analytics?.modes?.length ?? 0) === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">No verified collections this month yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {(analytics?.modes ?? []).map((m) => {
                    const Icon = MODE_ICONS[m.mode];
                    return (
                      <div key={m.mode}>
                        <div className="flex items-center gap-2 text-xs">
                          {Icon ? <Icon className="h-3.5 w-3.5 text-muted-foreground" /> : null}
                          <span className="font-medium">{MODE_LABELS[m.mode] || m.mode}</span>
                          <Badge variant="secondary" className="h-4 px-1.5 text-[9px]">{m.count}</Badge>
                          <span className="ml-auto font-semibold tabular-nums">{formatINR(m.total)}</span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-teal-500/70 dark:bg-teal-500/60" style={{ width: `${Math.max(2, Math.round((m.total / maxModeTotal) * 100))}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="rounded-xl border shadow-sm">
            <CardContent className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <p className="text-sm font-semibold">Recently Verified</p>
              </div>
              {recentLoading ? (
                <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="skeleton-wave h-8 w-full" />)}</div>
              ) : recentVerified.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">No verified payments yet.</p>
              ) : (
                <div className="space-y-1">
                  {recentVerified.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-xs hover:bg-muted/50">
                      <span className="font-mono text-[11px] font-medium">{p.receiptNumber || "—"}</span>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">{p.subscriber?.name || "—"}</span>
                      <span className="font-semibold tabular-nums">{formatINR(p.amount)}</span>
                      <span className="w-16 text-right text-[10px] text-muted-foreground">{timeAgo(p.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// TAB 3 — VERIFICATION QUEUE
// ═══════════════════════════════════════════════════════
function VerificationQueue({ serverPendingCount, onOpenReceipt }: {
  serverPendingCount: number; onOpenReceipt: (p: Payment) => void;
}) {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"verify" | "reject" | null>(null);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<Payment | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<{ payments: Payment[] }>({
    queryKey: ["payments-verify-queue"],
    queryFn: () => apiFetch<{ payments: Payment[] }>("/api/payments?page=1&limit=100&status=PENDING&sortBy=createdAt&sortOrder=asc"),
    refetchInterval: 30000,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["payments"] });
    queryClient.invalidateQueries({ queryKey: ["payments-verify-queue"] });
    queryClient.invalidateQueries({ queryKey: ["payments-analytics"] });
  };

  const verifyMutation = useMutation({
    mutationFn: ({ id }: { id: string }) => apiFetch(`/api/payments/${id}`, { method: "PUT", body: JSON.stringify({ status: "VERIFIED" }) }),
    onSuccess: () => { toast.success("Payment verified"); invalidateAll(); },
    onError: (err) => toast.error(parseApiError(err)),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id }: { id: string }) => apiFetch(`/api/payments/${id}`, { method: "PUT", body: JSON.stringify({ status: "FAILED" }) }),
    onSuccess: () => {
      toast.success("Payment rejected");
      setRejectTarget(null); setRejectReason("");
      invalidateAll();
    },
    onError: (err) => toast.error(parseApiError(err)),
  });

  const bulkMutation = useMutation({
    mutationFn: ({ action, ids }: { action: string; ids: string[] }) =>
      apiFetch<{ message?: string }>("/api/payments", { method: "POST", body: JSON.stringify({ action, paymentIds: ids }) }),
    onSuccess: (d) => {
      toast.success(d.message || "Bulk action completed");
      setSelectedIds(new Set()); setBulkConfirmOpen(false); setBulkAction(null);
      invalidateAll();
    },
    onError: (err) => toast.error(parseApiError(err)),
  });

  const payments = data?.payments ?? [];
  const pendingAmount = payments.reduce((sum, p) => sum + p.amount, 0);
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayPending = payments.filter((p) => new Date(p.createdAt).getTime() >= todayStart.getTime());
  const oldest = payments.length
    ? payments.reduce((acc, p) => Math.max(acc, ageInfo(p.createdAt).hours), 0)
    : 0;
  const oldestTone = oldest >= 24 ? "text-red-600 dark:text-red-400" : oldest >= 2 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400";

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === payments.length && payments.length > 0) setSelectedIds(new Set());
    else setSelectedIds(new Set(payments.map((p) => p.id)));
  };

  const confirmBulk = () => {
    if (!bulkAction || selectedIds.size === 0) return;
    bulkMutation.mutate({ action: bulkAction === "verify" ? "bulk_verify" : "bulk_reject", ids: Array.from(selectedIds) });
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Stat chips */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs dark:border-amber-900/60 dark:bg-amber-950/30">
          <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          <span className="font-semibold text-amber-800 dark:text-amber-300">{payments.length} pending</span>
          <span className="text-amber-700/70 dark:text-amber-400/70">·</span>
          <span className="font-bold tabular-nums text-amber-800 dark:text-amber-300">{formatINR(pendingAmount)}</span>
        </span>
        <span className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs">
          <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Oldest</span>
          <span className={`font-bold tabular-nums ${oldestTone}`}>{oldest}h</span>
          <span className={`text-[10px] font-semibold ${oldestTone}`}>{oldest >= 24 ? "SLA breach" : oldest >= 2 ? "aging" : "healthy"}</span>
        </span>
        <span className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs">
          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Today</span>
          <span className="font-bold tabular-nums">{todayPending.length}</span>
          <span className="text-muted-foreground tabular-nums">({formatINR(todayPending.reduce((s, p) => s + p.amount, 0))})</span>
        </span>
        <span className="ml-auto inline-flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" /></span>
          auto-refresh 30s {isFetching ? "· syncing" : ""}
          <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Refresh verification queue" onClick={() => refetch()}>
            <RefreshCw className="h-3 w-3" />
          </Button>
        </span>
      </div>

      {/* Bulk bar */}
      {selectedIds.size > 0 && (
        <Card className="rounded-xl border shadow-sm bg-muted/50">
          <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3">
            <span className="text-sm font-medium">{selectedIds.size} payment(s) selected</span>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => { setBulkAction("verify"); setBulkConfirmOpen(true); }} disabled={bulkMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <CheckCircle2 className="h-4 w-4 mr-2" />Verify Selected ({selectedIds.size})
              </Button>
              <Button size="sm" variant="destructive" onClick={() => { setBulkAction("reject"); setBulkConfirmOpen(true); }} disabled={bulkMutation.isPending}>
                <XIcon className="h-4 w-4 mr-2" />Reject Selected ({selectedIds.size})
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())}>Clear</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Queue table */}
      <Card className="rounded-xl border shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="skeleton-wave h-10 w-full" />)}</div>
          ) : isError ? (
            <EmptyState
              icon={AlertCircle} title="Could not load the verification queue"
              hint={parseApiError(error)}
              action={<AsyncActionButton label="Retry" pendingLabel="Retrying…" pending={isFetching} icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => refetch()} />}
            />
          ) : payments.length === 0 ? (
            serverPendingCount > 0 ? (
              <EmptyState icon={Clock} title="No pending payments to show" hint="The queue may be momentarily out of sync — it refreshes automatically every 30 seconds." />
            ) : (
              <EmptyState
                icon={CheckCircle2} title="Queue clear — every payment verified"
                hint="Nothing is waiting for verification. New PENDING payments will appear here the moment they are collected."
              />
            )
          ) : (
            <div className="max-h-[62vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="sticky top-0 z-10 bg-muted hover:bg-muted">
                    <TableHead className="w-10 text-xs font-semibold uppercase tracking-wider">
                      <Checkbox
                        aria-label="Select all pending payments"
                        checked={payments.length > 0 && selectedIds.size === payments.length}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Collected</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Subscriber</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Amount</TableHead>
                    <TableHead className="hidden text-xs font-semibold uppercase tracking-wider sm:table-cell">Mode</TableHead>
                    <TableHead className="hidden text-xs font-semibold uppercase tracking-wider md:table-cell">Reference</TableHead>
                    <TableHead className="hidden text-xs font-semibold uppercase tracking-wider lg:table-cell">Receipt</TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id} className="odd:bg-muted/10 hover:bg-muted/30 transition-colors duration-150">
                      <TableCell>
                        <Checkbox aria-label={`Select payment ${p.receiptNumber || p.id}`} checked={selectedIds.has(p.id)} onCheckedChange={() => toggleSelect(p.id)} />
                      </TableCell>
                      <TableCell>
                        <p className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(p.createdAt)}</p>
                        <div className="mt-0.5"><AgeChip createdAt={p.createdAt} /></div>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm font-medium">{p.subscriber?.name || "—"}</p>
                        <p className="text-xs text-muted-foreground">{p.subscriber?.code || ""}</p>
                      </TableCell>
                      <TableCell className="text-sm font-semibold tabular-nums">{formatINR(p.amount)}</TableCell>
                      <TableCell className="hidden sm:table-cell"><ModePill mode={p.paymentMode} /></TableCell>
                      <TableCell className="hidden max-w-[160px] truncate font-mono text-xs text-muted-foreground md:table-cell">{p.transactionRef || "—"}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <button type="button" className="font-mono text-xs font-medium hover:underline" onClick={() => onOpenReceipt(p)}>
                          {p.receiptNumber || "—"}
                        </button>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <AsyncActionButton
                            label="Verify" pendingLabel="Verifying…"
                            pending={verifyMutation.isPending && verifyMutation.variables?.id === p.id}
                            icon={<Check className="h-3.5 w-3.5" />}
                            onClick={() => verifyMutation.mutate({ id: p.id })}
                            className="h-7 border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                          />
                          <Button
                            variant="ghost" size="sm" className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40"
                            onClick={() => { setRejectTarget(p); setRejectReason(""); }}
                          >
                            <XIcon className="h-3.5 w-3.5 mr-1" />Reject
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Single reject dialog — reason is a deliberate double-check */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => { if (!o) { setRejectTarget(null); setRejectReason(""); } }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600"><XIcon className="h-5 w-5" />Reject Payment</DialogTitle>
            <DialogDescription>
              Mark {rejectTarget?.receiptNumber || "this payment"} ({rejectTarget ? formatINR(rejectTarget.amount) : ""}) as FAILED. The subscriber&apos;s balance stays unpaid.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-2">
              <Label htmlFor="reject-reason">Reason *</Label>
              <Textarea
                id="reject-reason" rows={2} value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Why is this payment being rejected? (e.g. cheque bounced, duplicate entry)"
              />
              <p className="text-[10px] text-muted-foreground">The reason is recorded in the audit trail when you confirm.</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setRejectTarget(null); setRejectReason(""); }}>Cancel</Button>
            <Button
              variant="destructive" disabled={rejectReason.trim().length < 3 || rejectMutation.isPending}
              onClick={() => rejectTarget && rejectMutation.mutate({ id: rejectTarget.id })}
            >
              {rejectMutation.isPending ? "Rejecting…" : "Reject Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk confirm */}
      <Dialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{bulkAction === "verify" ? "Verify Selected Payments" : "Reject Selected Payments"}</DialogTitle>
            <DialogDescription>
              Are you sure you want to {bulkAction} {selectedIds.size} payment(s)?
              {bulkAction === "reject" && (
                <span className="mt-1 block text-xs font-medium text-red-600">
                  Rejected payments will be marked as failed and cannot be recovered.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBulkConfirmOpen(false)}>Cancel</Button>
            <Button
              variant={bulkAction === "verify" ? "default" : "destructive"}
              onClick={confirmBulk} disabled={bulkMutation.isPending}
              className={bulkAction === "verify" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}
            >
              {bulkMutation.isPending ? "Processing…" : bulkAction === "verify" ? "Verify" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// TAB 4 — RECONCILIATION (violet domain)
// ═══════════════════════════════════════════════════════
function ReconciliationPanel() {
  const queryClient = useQueryClient();
  const [manualLink, setManualLink] = useState<Record<string, string>>({});
  const [unlinkTarget, setUnlinkTarget] = useState<ReconTxn | null>(null);
  const [showMatched, setShowMatched] = useState(false);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<ReconPayload>({
    queryKey: ["reconcile"],
    queryFn: () => apiFetch<ReconPayload>("/api/payments/reconcile"),
  });

  const invalidateRecon = () => {
    queryClient.invalidateQueries({ queryKey: ["reconcile"] });
    queryClient.invalidateQueries({ queryKey: ["payments-analytics"] });
    queryClient.invalidateQueries({ queryKey: ["payments"] });
  };

  const syncMutation = useMutation({
    mutationFn: () => apiFetch<{ message: string }>("/api/payments/reconcile", {
      method: "POST", body: JSON.stringify({ action: "sync-from-payments" }),
    }),
    onSuccess: (d) => { toast.success(d.message || "Gateway sync complete"); invalidateRecon(); },
    onError: (err) => toast.error(parseApiError(err)),
  });

  const linkMutation = useMutation({
    mutationFn: ({ transactionId, paymentId }: { transactionId: string; paymentId: string }) =>
      apiFetch<{ message?: string }>("/api/payments/reconcile", {
        method: "POST", body: JSON.stringify({ action: "link", transactionId, paymentId }),
      }),
    onSuccess: (d, vars) => {
      toast.success(d.message || "Gateway transaction linked");
      setManualLink((m) => { const n = { ...m }; delete n[vars.transactionId]; return n; });
      invalidateRecon();
    },
    onError: (err) => toast.error(parseApiError(err)),
  });

  const unlinkMutation = useMutation({
    mutationFn: (transactionId: string) =>
      apiFetch<{ message?: string }>("/api/payments/reconcile", {
        method: "POST", body: JSON.stringify({ action: "unlink", transactionId }),
      }),
    onSuccess: (d) => { toast.success(d.message || "Link removed"); setUnlinkTarget(null); invalidateRecon(); },
    onError: (err) => toast.error(parseApiError(err)),
  });

  const unmatchedTxns = data?.unmatchedTransactions ?? [];
  const unmatchedPayments = data?.unmatchedPayments ?? [];
  const matchedSorted = [...(data?.matched ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Header row: stats + sync */}
      <div className="flex flex-wrap items-stretch gap-3">
        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3 lg:max-w-2xl">
          <StatCard
            label="Gateway txns" loading={isLoading}
            value={String(data?.stats.totalTransactions ?? 0)}
            icon={<Globe className="h-5 w-5 text-slate-500" />}
            hint="ingested from gateways"
          />
          <StatCard
            label="Matched" loading={isLoading}
            value={String(data?.stats.matchedCount ?? 0)} tone="good"
            icon={<CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />}
            hint="tied to a ledger payment"
          />
          <StatCard
            label="Unmatched" loading={isLoading}
            value={String(data?.stats.unmatchedTransactionCount ?? 0)} tone={(data?.stats.unmatchedTransactionCount ?? 0) > 0 ? "warn" : "good"}
            icon={<Unlink className="h-5 w-5 text-violet-600 dark:text-violet-400" />}
            hint={`${data?.stats.unmatchedPaymentCount ?? 0} local payments without a gateway record`}
          />
        </div>
        <div className="flex items-center gap-2">
          <AsyncActionButton
            label="Sync Gateway Data" pendingLabel="Syncing…"
            pending={syncMutation.isPending} icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => syncMutation.mutate()}
          />
          <AsyncActionButton
            label="Refresh" pendingLabel="…" pending={isFetching}
            icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => refetch()}
          />
        </div>
      </div>

      {isError && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50/70 p-3 text-sm text-red-800 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 break-words">{parseApiError(error)}</span>
          <Button variant="outline" size="sm" onClick={() => refetch()}><RotateCcw className="h-3.5 w-3.5 mr-1" />Retry</Button>
        </div>
      )}

      {/* (a) Unmatched gateway transactions */}
      <Card className="rounded-xl border shadow-sm">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Unlink className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            <p className="text-sm font-semibold">Unmatched Gateway Transactions</p>
            <Badge variant="outline" className="ml-auto border-violet-300 text-violet-700 dark:border-violet-800 dark:text-violet-400">{unmatchedTxns.length}</Badge>
          </div>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="skeleton-wave h-10 w-full" />)}</div>
          ) : unmatchedTxns.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Every gateway transaction is matched" hint="Nothing is floating — all gateway money maps to a ledger payment." />
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="sticky top-0 z-10 bg-muted hover:bg-muted">
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Gateway Ref</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Gateway</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Amount</TableHead>
                    <TableHead className="hidden text-xs font-semibold uppercase tracking-wider sm:table-cell">Status</TableHead>
                    <TableHead className="hidden text-xs font-semibold uppercase tracking-wider md:table-cell">Date</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Suggestion</TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unmatchedTxns.map((t) => {
                    const selectedPaymentId = manualLink[t.id] || "";
                    return (
                      <TableRow key={t.id} className="odd:bg-muted/10 hover:bg-muted/30">
                        <TableCell className="max-w-[180px] truncate font-mono text-xs" title={t.externalRef}>{t.externalRef || "—"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <GatewayChip type={t.gatewayType} name={t.gatewayName} />
                            {t.environment ? <EnvironmentPill environment={t.environment} /> : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm font-semibold tabular-nums">{formatINR(t.amount)}</TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <span className="text-xs capitalize text-muted-foreground">{String(t.status || "").toLowerCase() || "—"}</span>
                        </TableCell>
                        <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground md:table-cell">{formatDateTime(t.createdAt)}</TableCell>
                        <TableCell>
                          {t.suggestion ? (
                            <div className="flex items-center gap-1.5">
                              <ConfidenceChip confidence={t.suggestion.confidence} />
                              <span className="font-mono text-[10px] text-muted-foreground">{t.suggestion.receiptNumber || "—"}</span>
                            </div>
                          ) : (
                            <Select
                              value={selectedPaymentId}
                              onValueChange={(v) => setManualLink((m) => ({ ...m, [t.id]: v }))}
                            >
                              <SelectTrigger className="h-7 w-[190px] text-xs"><SelectValue placeholder="Select payment…" /></SelectTrigger>
                              <SelectContent>
                                <div className="max-h-56 overflow-y-auto">
                                  {unmatchedPayments.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>
                                      {p.receiptNumber || p.id} — {formatINR(p.amount)} ({p.subscriber?.name || "—"})
                                    </SelectItem>
                                  ))}
                                  {unmatchedPayments.length === 0 && <SelectItem value="none" disabled>No unmatched local payments</SelectItem>}
                                </div>
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {t.suggestion ? (
                            <AsyncActionButton
                              label={`Link to ${t.suggestion.receiptNumber || "payment"}`} pendingLabel="Linking…"
                              pending={linkMutation.isPending && linkMutation.variables?.transactionId === t.id}
                              icon={<Link2 className="h-3.5 w-3.5" />}
                              onClick={() => linkMutation.mutate({ transactionId: t.id, paymentId: t.suggestion!.paymentId })}
                              className="border-violet-300 text-violet-700 hover:bg-violet-50 hover:text-violet-800 dark:border-violet-800 dark:text-violet-400 dark:hover:bg-violet-950/40"
                            />
                          ) : (
                            <AsyncActionButton
                              label="Link" pendingLabel="Linking…"
                              pending={linkMutation.isPending && linkMutation.variables?.transactionId === t.id}
                              disabled={!selectedPaymentId || selectedPaymentId === "none"}
                              icon={<Link2 className="h-3.5 w-3.5" />}
                              onClick={() => linkMutation.mutate({ transactionId: t.id, paymentId: selectedPaymentId })}
                              className="border-violet-300 text-violet-700 hover:bg-violet-50 hover:text-violet-800 dark:border-violet-800 dark:text-violet-400 dark:hover:bg-violet-950/40"
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* (b) Unmatched local gateway payments — info only */}
      <Card className="rounded-xl border shadow-sm">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <p className="text-sm font-semibold">Unmatched Local Gateway Payments</p>
            <Badge variant="outline" className="ml-auto">{unmatchedPayments.length}</Badge>
          </div>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="skeleton-wave h-10 w-full" />)}</div>
          ) : unmatchedPayments.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="No orphan local payments" hint="Every local gateway-mode payment has a gateway record behind it." />
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="sticky top-0 z-10 bg-muted hover:bg-muted">
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Receipt</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Amount</TableHead>
                    <TableHead className="hidden text-xs font-semibold uppercase tracking-wider md:table-cell">Gateway Ref (order | payment)</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Subscriber</TableHead>
                    <TableHead className="hidden text-xs font-semibold uppercase tracking-wider lg:table-cell">Date</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Gateway record</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unmatchedPayments.map((p) => (
                    <TableRow key={p.id} className="odd:bg-muted/10 hover:bg-muted/30">
                      <TableCell className="font-mono text-xs font-medium">{p.receiptNumber || "—"}</TableCell>
                      <TableCell className="text-sm font-semibold tabular-nums">{formatINR(p.amount)}</TableCell>
                      <TableCell className="hidden max-w-[240px] truncate font-mono text-[10px] text-muted-foreground md:table-cell" title={p.transactionRef}>
                        {p.orderId || "?"} | {p.gatewayPaymentId || "?"}
                      </TableCell>
                      <TableCell>
                        <p className="text-xs font-medium">{p.subscriber?.name || "—"}</p>
                        <p className="text-[10px] text-muted-foreground">{p.subscriber?.code || ""}{p.invoiceNumber ? ` · ${p.invoiceNumber}` : ""}</p>
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground lg:table-cell">{formatDateTime(p.createdAt)}</TableCell>
                      <TableCell>
                        {p.hasGatewayRecord ? (
                          <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 text-[10px] dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400">record exists</Badge>
                        ) : (
                          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 text-[10px] dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">no gateway record</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* (c) Matched — collapsed */}
      <Card className="rounded-xl border shadow-sm">
        <CardContent className="p-4">
          <button
            type="button"
            className="flex w-full items-center gap-2 text-left"
            onClick={() => setShowMatched((v) => !v)}
            aria-expanded={showMatched}
          >
            {showMatched ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            <Link2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <p className="text-sm font-semibold">Matched Transactions</p>
            <Badge variant="outline" className="border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400">{data?.stats.matchedCount ?? 0}</Badge>
            <span className="ml-auto text-[10px] text-muted-foreground">{showMatched ? "click to collapse" : "click to expand last 20"}</span>
          </button>
          {showMatched && (
            isLoading ? (
              <div className="mt-3 space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="skeleton-wave h-10 w-full" />)}</div>
            ) : matchedSorted.length === 0 ? (
              <p className="mt-3 py-4 text-center text-xs text-muted-foreground">No matched transactions yet — run a sync first.</p>
            ) : (
              <div className="mt-3 max-h-[60vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="sticky top-0 z-10 bg-muted hover:bg-muted">
                      <TableHead className="text-xs font-semibold uppercase tracking-wider">Gateway Ref</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider">Gateway</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider">Amount</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider">Ledger Payment</TableHead>
                      <TableHead className="hidden text-xs font-semibold uppercase tracking-wider md:table-cell">Date</TableHead>
                      <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {matchedSorted.slice(0, 20).map((t) => (
                      <TableRow key={t.id} className="odd:bg-muted/10 hover:bg-muted/30">
                        <TableCell className="max-w-[180px] truncate font-mono text-xs" title={t.externalRef}>{t.externalRef || "—"}</TableCell>
                        <TableCell><GatewayChip type={t.gatewayType} name={t.gatewayName} /></TableCell>
                        <TableCell className="text-sm font-semibold tabular-nums">{formatINR(t.amount)}</TableCell>
                        <TableCell>
                          <span className="font-mono text-xs font-medium">{t.payment?.receiptNumber || "—"}</span>
                          <span className="ml-2 text-[10px] text-muted-foreground tabular-nums">{formatINR(t.payment?.amount ?? 0)}</span>
                        </TableCell>
                        <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground md:table-cell">{formatDateTime(t.createdAt)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost" size="sm" className="h-7 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40"
                            onClick={() => setUnlinkTarget(t)}
                          >
                            <Unlink className="h-3.5 w-3.5 mr-1" />Unlink
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
          )}
        </CardContent>
      </Card>

      <WarningStrip>
        Reconciliation is read-only on money — linking never moves balances; it only connects gateway truth to ledger rows.
      </WarningStrip>

      {/* Unlink confirm */}
      <AlertDialog open={!!unlinkTarget} onOpenChange={(o) => { if (!o) setUnlinkTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this link?</AlertDialogTitle>
            <AlertDialogDescription>
              Gateway transaction {unlinkTarget?.externalRef || ""} will be detached from payment {unlinkTarget?.payment?.receiptNumber || ""}. Money does not move — the gateway row simply returns to the unmatched pool for re-linking.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={unlinkMutation.isPending}
              onClick={(e) => { e.preventDefault(); if (unlinkTarget) unlinkMutation.mutate(unlinkTarget.id); }}
            >
              {unlinkMutation.isPending ? "Unlinking…" : "Unlink"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// TAB 5 — AGING & COLLECTORS
// ═══════════════════════════════════════════════════════
function AgingCollectors({ analytics, loading }: { analytics: AnalyticsPayload | undefined; loading: boolean }) {
  const buckets = analytics?.aging?.buckets ?? [];
  const debtors = analytics?.aging?.topDebtors ?? [];
  const collectors = analytics?.collectors ?? [];
  const maxBucket = Math.max(...buckets.map((b) => b.amount), 1);

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      {/* ── Left: aging ── */}
      <div className="space-y-4 lg:col-span-3">
        <Card className="rounded-xl border border-red-200 bg-red-50/50 shadow-sm dark:border-red-900/60 dark:bg-red-950/20">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-500/10">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div className="min-w-0 flex-1">
              <MiniStat label="Total Outstanding AR" value={formatINR(analytics?.aging?.totalOutstanding ?? 0)} tone={(analytics?.aging?.totalOutstanding ?? 0) > 0 ? "bad" : "good"} />
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                across {analytics?.aging?.invoiceCount ?? 0} open invoices · {analytics?.aging?.totalCount ?? 0} bucket entries
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(loading ? Array.from({ length: 5 }) : buckets).map((b, i) => {
            const bucket = b as AgingBucket | undefined;
            const pct = bucket ? Math.max(2, Math.round((bucket.amount / maxBucket) * 100)) : 0;
            return (
              <Card key={bucket?.key ?? i} className="rounded-xl border shadow-sm">
                <CardContent className="p-4">
                  {loading || !bucket ? (
                    <div className="space-y-2">
                      <Skeleton className="skeleton-wave h-3 w-20" />
                      <Skeleton className="skeleton-wave h-5 w-24" />
                      <Skeleton className="skeleton-wave h-1.5 w-full" />
                    </div>
                  ) : (
                    <>
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{bucket.label}</p>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="text-lg font-bold tabular-nums">{formatINR(bucket.amount)}</span>
                        <span className="text-[10px] text-muted-foreground">{bucket.count} invoice{bucket.count === 1 ? "" : "s"}</span>
                      </div>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className={`h-full rounded-full ${AGING_BAR[bucket.key] || "bg-slate-400"}`} style={{ width: `${bucket.amount > 0 ? pct : 0}%` }} />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="rounded-xl border shadow-sm">
          <CardContent className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-red-600 dark:text-red-400" />
              <p className="text-sm font-semibold">Top Debtors</p>
              <Badge variant="outline" className="ml-auto">{debtors.length}</Badge>
            </div>
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="skeleton-wave h-9 w-full" />)}</div>
            ) : debtors.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="No outstanding debtors" hint="Every subscriber invoice is settled — nothing is aging." />
            ) : (
              <div className="max-h-[46vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="sticky top-0 z-10 bg-muted hover:bg-muted">
                      <TableHead className="text-xs font-semibold uppercase tracking-wider">Subscriber</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider">Invoices</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider">Outstanding</TableHead>
                      <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">Age</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {debtors.map((d) => {
                      const chip = debtorChip(d.daysOverdue);
                      return (
                        <TableRow key={d.subscriberId} className="odd:bg-muted/10 hover:bg-muted/30">
                          <TableCell>
                            <p className="text-sm font-medium">{d.name}</p>
                            <p className="text-xs text-muted-foreground">{d.code}</p>
                          </TableCell>
                          <TableCell className="text-sm tabular-nums">{d.invoiceCount}</TableCell>
                          <TableCell className="text-sm font-semibold tabular-nums text-red-600 dark:text-red-400">{formatINR(d.outstanding)}</TableCell>
                          <TableCell className="text-right">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${chip.class}`}>{chip.label}</span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Right: collectors leaderboard ── */}
      <div className="space-y-4 lg:col-span-2">
        <Card className="rounded-xl border shadow-sm">
          <CardContent className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <p className="text-sm font-semibold">Collector Leaderboard</p>
              <Badge variant="outline" className="ml-auto text-[9px]">VERIFIED only · MTD</Badge>
            </div>
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="skeleton-wave h-10 w-full" />)}</div>
            ) : collectors.length === 0 ? (
              <EmptyState icon={Users} title="No collections yet this month" hint="Verified collections will rank collectors here as the month progresses." />
            ) : (
              <div className="max-h-[62vh] space-y-1 overflow-y-auto">
                {collectors.map((c, i) => (
                  <div key={c.userId || `unattributed-${i}`} className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm hover:bg-muted/40">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                      {i === 0 ? <Trophy className="h-4 w-4 text-amber-500" aria-label="Rank 1" />
                        : i === 1 ? <Medal className="h-4 w-4 text-slate-400" aria-label="Rank 2" />
                        : i === 2 ? <Award className="h-4 w-4 text-orange-600" aria-label="Rank 3" />
                        : <span className="text-xs font-semibold text-muted-foreground">#{i + 1}</span>}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{c.name}</p>
                      <p className="text-[10px] text-muted-foreground">{c.count} payments · last {timeAgo(c.lastAt)}</p>
                    </div>
                    <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatINR(c.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════
export default function PaymentsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>("overview");
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

  // Collect form state
  const [formSubId, setFormSubId] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formMode, setFormMode] = useState("CASH");
  const [formRef, setFormRef] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formSubSearch, setFormSubSearch] = useState("");
  const [formInvoiceId, setFormInvoiceId] = useState("");

  // Edit form state
  const [editAmount, setEditAmount] = useState("");
  const [editMode, setEditMode] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editRef, setEditRef] = useState("");

  // Send-receipt state (receipt dialog)
  const [sendChannels, setSendChannels] = useState<Record<string, boolean>>({ EMAIL: true, SMS: false, WHATSAPP: false });
  const [sendEmail, setSendEmail] = useState("");
  const [sendPhone, setSendPhone] = useState("");
  const [sendResults, setSendResults] = useState<ReceiptSendResult[] | null>(null);

  const [refreshing, setRefreshing] = useState(false);

  // ─── Queries ────────────────────────────────────────
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

  const { data: analytics, isLoading: analyticsLoading } = useQuery<AnalyticsPayload>({
    queryKey: ["payments-analytics"],
    queryFn: () => apiFetch<AnalyticsPayload>("/api/payments/analytics"),
    refetchInterval: 60000,
  });

  // Fetch subscribers for collection form
  const { data: subscribers } = useQuery<SubOption[]>({
    queryKey: ["payment-subs"],
    queryFn: () => apiFetch("/api/subscribers?limit=200").then((d: { subscribers?: { id: string; name: string; code: string }[] }) => d.subscribers?.map((s) => ({ id: s.id, name: s.name, code: s.code })) || []),
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

  // Refund history — used for refund-history dialog AND cumulative cap in refund dialog
  const { data: refundHistory } = useQuery<{ refunds: RefundRecord[] }>({
    queryKey: ["payment-refunds", selectedPayment?.id],
    queryFn: () => apiFetch(`/api/payments/${selectedPayment?.id}/refund`),
    enabled: !!selectedPayment?.id && (refundOpen || refundHistoryOpen),
  });

  const filteredSubs = subscribers?.filter((s) =>
    !formSubSearch || s.name.toLowerCase().includes(formSubSearch.toLowerCase()) || s.code.toLowerCase().includes(formSubSearch.toLowerCase())
  ) ?? [];

  // ─── Mutations ──────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: () => {
      const amount = parseFloat(formAmount);
      if (!formSubId || !amount || amount <= 0) return Promise.reject("Valid subscriber and amount required");
      const body: Record<string, unknown> = { subscriberId: formSubId, amount, paymentMode: formMode, transactionRef: formRef, notes: formNotes };
      if (formInvoiceId) body.invoiceId = formInvoiceId;
      return apiFetch("/api/payments", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: (d: { error?: string }) => {
      if (d.error) { toast.error(d.error); return; }
      toast.success("Payment collected successfully");
      setCollectOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["payments-analytics"] });
    },
    onError: (err) => toast.error(parseApiError(err)),
  });

  const verifyMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => apiFetch(`/api/payments/${id}`, { method: "PUT", body: JSON.stringify({ status }) }),
    onSuccess: (d: { error?: string }, vars) => {
      if (d.error) { toast.error(d.error); return; }
      toast.success(vars.status === "VERIFIED" ? "Payment verified" : "Payment rejected");
      setVerifyOpen(false);
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["payments-analytics"] });
      queryClient.invalidateQueries({ queryKey: ["payments-verify-queue"] });
    },
    onError: (err) => toast.error(parseApiError(err)),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, amount, paymentMode, notes, transactionRef }: { id: string; amount: number; paymentMode: string; notes: string; transactionRef: string }) =>
      apiFetch(`/api/payments/${id}`, {
        method: "PUT",
        body: JSON.stringify({ amount, paymentMode, notes, transactionRef }),
      }),
    onSuccess: (d: { error?: string }) => {
      if (d.error) { toast.error(d.error); return; }
      toast.success("Payment updated successfully");
      setEditOpen(false);
      queryClient.invalidateQueries({ queryKey: ["payments"] });
    },
    onError: (err) => toast.error(parseApiError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/payments/${id}`, { method: "DELETE" }),
    onSuccess: (d: { error?: string }) => {
      if (d.error) { toast.error(d.error); return; }
      toast.success("Payment deleted successfully");
      setDeleteOpen(false);
      setSelectedPayment(null);
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["payments-analytics"] });
    },
    onError: (err) => toast.error(parseApiError(err)),
  });

  const refundMutation = useMutation({
    mutationFn: ({ id, amount, reason, notes, refundMode }: { id: string; amount: number; reason: string; notes: string; refundMode: string }) =>
      apiFetch<{ message?: string }>(`/api/payments/${id}/refund`, {
        method: "POST",
        body: JSON.stringify({ amount, reason, notes, refundMode }),
      }),
    onSuccess: (d) => {
      toast.success(d.message || "Refund processed successfully");
      setRefundOpen(false);
      setSelectedPayment(null);
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["payments-analytics"] });
      queryClient.invalidateQueries({ queryKey: ["payment-refunds"] });
    },
    onError: (err) => toast.error(parseApiError(err)),
  });

  const bulkVerifyMutation = useMutation({
    mutationFn: ({ action, ids }: { action: string; ids: string[] }) => apiFetch<{ message?: string }>("/api/payments", {
      method: "POST",
      body: JSON.stringify({ action, paymentIds: ids }),
    }),
    onSuccess: (d) => {
      toast.success(d.message || "Action completed");
      setSelectedIds(new Set());
      setBulkMode(false);
      setBulkConfirmOpen(false);
      setBulkAction(null);
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["payments-analytics"] });
      queryClient.invalidateQueries({ queryKey: ["payments-verify-queue"] });
    },
    onError: (err) => toast.error(parseApiError(err)),
  });

  const sendReceiptMutation = useMutation({
    mutationFn: () => {
      const channels = Object.entries(sendChannels).filter(([, v]) => v).map(([k]) => k);
      if (!channels.length) return Promise.reject("Select at least one channel");
      if (!selectedPayment?.id) return Promise.reject("No payment selected");
      const body: Record<string, unknown> = { paymentId: selectedPayment.id, channels };
      if (sendEmail.trim()) body.email = sendEmail.trim();
      if (sendPhone.trim()) body.phone = sendPhone.trim();
      return apiFetch<{ message: string; results: ReceiptSendResult[] }>("/api/payments/receipt-send", {
        method: "POST", body: JSON.stringify(body),
      });
    },
    onSuccess: (d) => {
      setSendResults(d.results || []);
      toast.success(d.message || "Receipt send attempted");
    },
    onError: (err) => toast.error(parseApiError(err)),
  });

  // ─── Derived values ─────────────────────────────────
  const pendingVerifyCount = data?.pendingVerifyCount ?? 0;
  const summary = data?.summary;
  const payments = data?.payments ?? [];
  const total = data?.total ?? 0;
  const pendingPayments = payments.filter((p) => p.status === "PENDING");
  const unmatchedReconCount = analytics?.leakRadar?.unmatchedGatewayCount ?? 0;

  const refundedSoFar = (refundHistory?.refunds ?? [])
    .filter((r) => r.status === "PROCESSED")
    .reduce((s, r) => s + r.amount, 0);
  const refundRemaining = selectedPayment ? Math.max(0, selectedPayment.amount - refundedSoFar) : 0;

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
    setSendResults(null);
    setSendEmail("");
    setSendPhone("");
    setSendChannels({ EMAIL: true, SMS: false, WHATSAPP: false });
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
            <span class="verified">${paymentDetail.status || "VERIFIED"}</span>
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

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["payments"] }),
        queryClient.invalidateQueries({ queryKey: ["payments-analytics"] }),
        queryClient.invalidateQueries({ queryKey: ["reconcile"] }),
        queryClient.invalidateQueries({ queryKey: ["payments-verify-queue"] }),
        queryClient.invalidateQueries({ queryKey: ["payments-recent-verified"] }),
      ]);
      toast.success("Payments data refreshed");
    } finally {
      setRefreshing(false);
    }
  };

  const resetForm = () => {
    setFormSubId(""); setFormAmount(""); setFormMode("CASH"); setFormRef(""); setFormNotes(""); setFormSubSearch(""); setFormInvoiceId("");
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

  const renderSortIcon = (field: SortField) => {
    if (sortBy !== field) return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-40" />;
    return sortOrder === "asc"
      ? <ArrowUp className="ml-1 inline h-3 w-3 text-foreground" />
      : <ArrowDown className="ml-1 inline h-3 w-3 text-foreground" />;
  };

  const goTab = (t: string) => setTab(t as TabKey);

  // Refresh payments when the verification tab opens (fresh SLA data)
  useEffect(() => {
    if (tab === "verify") {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
    }
  }, [tab, queryClient]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* ── Header ── */}
      <PageHeader
        icon={Wallet}
        title="Payments"
        description="Every rupee traced — collections, verification, refunds and gateway reconciliation with zero revenue leak."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <FileSpreadsheet className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Export CSV</span><span className="sm:hidden">Export</span>
            </Button>
            <AsyncActionButton
              label="Refresh" pendingLabel="Refreshing…" pending={refreshing}
              icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={handleRefresh}
              disabled={refreshing}
            />
            <Button onClick={() => setCollectOpen(true)} className="bg-red-600 hover:bg-red-700 text-white">
              <Plus className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Collect Payment</span><span className="sm:hidden">Collect</span>
            </Button>
          </>
        }
      />

      {/* ── Tabs ── */}
      <Tabs value={tab} onValueChange={goTab} className="gap-4">
        <TabsList className="h-auto flex-wrap bg-muted/50">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="payments">All Payments</TabsTrigger>
          <TabsTrigger value="verify">
            Verification
            {pendingVerifyCount > 0 && (
              <Badge className="ml-1 h-4 border-amber-300 bg-amber-100 px-1.5 text-[9px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                {pendingVerifyCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="reconcile">
            Reconciliation
            {unmatchedReconCount > 0 && (
              <Badge className="ml-1 h-4 border-violet-300 bg-violet-100 px-1.5 text-[9px] text-violet-800 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300">
                {unmatchedReconCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="aging">Aging &amp; Collectors</TabsTrigger>
        </TabsList>

        {/* ═══ TAB 1 — OVERVIEW ═══ */}
        <TabsContent value="overview" className="mt-0">
          <OverviewTab analytics={analytics} loading={analyticsLoading} onGoTab={goTab} />
        </TabsContent>

        {/* ═══ TAB 2 — ALL PAYMENTS ═══ */}
        <TabsContent value="payments" className="mt-0 space-y-4">
          {/* Total Collected Today highlight */}
          <div className="flex items-center gap-4 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 p-4 text-white shadow-lg animate-slide-up" style={{ animationDelay: "50ms" }}>
            <div className="rounded-xl bg-white/20 p-3 backdrop-blur-sm">
              <IndianRupee className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-green-100">Total Collected Today</p>
              <p className="text-2xl font-bold tracking-tight sm:text-3xl">{summary ? formatINR(summary.todayTotal) : formatINR(0)}</p>
            </div>
            <div className="hidden items-center gap-4 text-sm sm:flex">
              <div className="text-center">
                <p className="text-xs text-green-100">Verified</p>
                <p className="text-lg font-bold">{summary?.todayCount ?? 0}</p>
              </div>
              <div className="h-8 w-px bg-white/20" />
              <div className="text-center">
                <p className="text-xs text-green-100">Pending</p>
                <p className="text-lg font-bold">{summary?.todayPendingCount ?? 0}</p>
              </div>
            </div>
          </div>

          {/* Filters */}
          <Card className="animate-slide-up rounded-xl border shadow-sm" style={{ animationDelay: "250ms" }}>
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-3">
                <div className="relative min-w-[200px] flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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
                    <XIcon className="mr-1 h-3 w-3" />Clear
                  </Button>
                )}
                <Button
                  variant={bulkMode ? "secondary" : "outline"} size="sm"
                  onClick={() => { setBulkMode(!bulkMode); setSelectedIds(new Set()); }}
                >
                  <Check className="mr-1 h-3 w-3" />{bulkMode ? "Exit bulk" : "Bulk"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Bulk actions bar */}
          {bulkMode && selectedIds.size > 0 && (
            <Card className="rounded-xl border bg-muted/50 shadow-sm">
              <CardContent className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span className="text-sm font-medium">{selectedIds.size} payment(s) selected</span>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => handleBulkAction("verify")} disabled={bulkVerifyMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    <CheckCircle2 className="mr-2 h-4 w-4" />Verify Selected
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleBulkAction("reject")} disabled={bulkVerifyMutation.isPending}>
                    <XIcon className="mr-2 h-4 w-4" />Reject Selected
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())}>Clear</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Payment table */}
          <Card className="animate-slide-up rounded-xl border shadow-sm" style={{ animationDelay: "300ms" }}>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="skeleton-wave h-11 w-full" />)}</div>
              ) : (
                <div className="max-h-[62vh] overflow-y-auto overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="sticky top-0 z-10 bg-muted hover:bg-muted">
                        {bulkMode && (
                          <TableHead className="w-10 text-xs font-semibold uppercase tracking-wider">
                            <Checkbox
                              aria-label="Select all pending payments on page"
                              checked={pendingPayments.length > 0 && selectedIds.size === pendingPayments.length}
                              onCheckedChange={toggleSelectAll}
                            />
                          </TableHead>
                        )}
                        <TableHead className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wider hover:text-foreground" onClick={() => handleSort("receiptNumber")}>
                          Receipt # {renderSortIcon("receiptNumber")}
                        </TableHead>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider">Subscriber</TableHead>
                        <TableHead className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wider hover:text-foreground" onClick={() => handleSort("amount")}>
                          Amount {renderSortIcon("amount")}
                        </TableHead>
                        <TableHead className="hidden cursor-pointer select-none text-xs font-semibold uppercase tracking-wider hover:text-foreground sm:table-cell" onClick={() => handleSort("paymentMode")}>
                          Mode {renderSortIcon("paymentMode")}
                        </TableHead>
                        <TableHead className="hidden text-xs font-semibold uppercase tracking-wider md:table-cell">Reference</TableHead>
                        <TableHead className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wider hover:text-foreground" onClick={() => handleSort("status")}>
                          Status {renderSortIcon("status")}
                        </TableHead>
                        <TableHead className="hidden cursor-pointer select-none text-xs font-semibold uppercase tracking-wider hover:text-foreground lg:table-cell" onClick={() => handleSort("createdAt")}>
                          Date {renderSortIcon("createdAt")}
                        </TableHead>
                        <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!payments.length ? (
                        <TableRow>
                          <TableCell className="py-20 text-center" colSpan={bulkMode ? 9 : 8}>
                            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-950/20">
                              <CreditCard className="h-8 w-8 text-red-400/60" />
                            </div>
                            <p className="text-base font-semibold text-foreground">No payments found</p>
                            <p className="mb-4 mt-1 text-xs text-muted-foreground/70">Collect your first payment to get started</p>
                            <Button size="sm" onClick={() => setCollectOpen(true)} className="bg-red-600 hover:bg-red-700 text-white">
                              <Plus className="mr-1.5 h-4 w-4" />Collect Payment
                            </Button>
                          </TableCell>
                        </TableRow>
                      ) : (
                        payments.map((pay) => (
                          <TableRow key={pay.id} className={`border-l-4 ${STATUS_BORDER_MAP[pay.status] || "border-l-muted"} odd:bg-muted/10 transition-colors duration-150 hover:bg-muted/30`}>
                            {bulkMode && (
                              <TableCell>
                                {pay.status === "PENDING" ? (
                                  <Checkbox
                                    aria-label={`Select payment ${pay.receiptNumber || pay.id}`}
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
                            <TableCell className="hidden text-xs sm:table-cell"><ModePill mode={pay.paymentMode} /></TableCell>
                            <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                              {pay.transactionRef || "—"}
                              {pay.invoice && (
                                <span className="ml-2 font-mono text-[10px]">
                                  → {pay.invoice.invoiceNumber}
                                </span>
                              )}
                            </TableCell>
                            <TableCell><StatusPill status={pay.status} /></TableCell>
                            <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground lg:table-cell">{formatDateTime(pay.createdAt)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openReceipt(pay)} title="Print receipt" aria-label={`Print receipt for ${pay.receiptNumber || pay.id}`}>
                                  <Printer className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openReceipt(pay)} title="View details" aria-label={`View details for ${pay.receiptNumber || pay.id}`}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                                {pay.status === "PENDING" && (
                                  <>
                                    <Button variant="ghost" size="sm" className="h-7 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/40" onClick={() => openVerify(pay)}>
                                      <Check className="mr-1 h-3.5 w-3.5" />Verify
                                    </Button>
                                    <Button variant="ghost" size="sm" className="h-7 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40" onClick={() => openVerify(pay)}>
                                      <XIcon className="mr-1 h-3.5 w-3.5" />Reject
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(pay)} title="Edit payment" aria-label={`Edit payment ${pay.receiptNumber || pay.id}`}>
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40" onClick={() => openDelete(pay)} title="Delete payment" aria-label={`Delete payment ${pay.receiptNumber || pay.id}`}>
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </>
                                )}
                                {pay.status === "VERIFIED" && (
                                  <Button variant="ghost" size="sm" className="h-7 text-orange-600 hover:bg-orange-50 hover:text-orange-700 dark:hover:bg-orange-950/40" onClick={() => openRefund(pay)}>
                                    <RotateCcw className="mr-1 h-3.5 w-3.5" />Refund
                                  </Button>
                                )}
                                {pay.status === "REFUNDED" && (
                                  <Button variant="ghost" size="sm" className="h-7" onClick={() => { setSelectedPayment(pay); setRefundHistoryOpen(true); }}>
                                    <History className="mr-1 h-3.5 w-3.5" />History
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
              )}
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
        </TabsContent>

        {/* ═══ TAB 3 — VERIFICATION QUEUE ═══ */}
        <TabsContent value="verify" className="mt-0">
          <VerificationQueue serverPendingCount={pendingVerifyCount} onOpenReceipt={openReceipt} />
        </TabsContent>

        {/* ═══ TAB 4 — RECONCILIATION ═══ */}
        <TabsContent value="reconcile" className="mt-0">
          <ReconciliationPanel />
        </TabsContent>

        {/* ═══ TAB 5 — AGING & COLLECTORS ═══ */}
        <TabsContent value="aging" className="mt-0">
          <AgingCollectors analytics={analytics} loading={analyticsLoading} />
        </TabsContent>
      </Tabs>

      {/* ═════════ DIALOGS (shared across tabs) ═════════ */}

      {/* ─── Collect Payment Dialog ─── */}
      <Dialog open={collectOpen} onOpenChange={(open) => { setCollectOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="rounded-lg bg-red-100 p-1.5 dark:bg-red-900/30"><Wallet className="h-5 w-5 text-red-600" /></div>
              Collect Payment
            </DialogTitle>
            <DialogDescription>Record a new payment from a subscriber.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Subscriber search */}
            <div className="space-y-2">
              <Label className="text-sm font-medium" htmlFor="collect-sub-search">Search Subscriber *</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="collect-sub-search"
                  placeholder="Type name or code..."
                  value={formSubSearch}
                  onChange={(e) => setFormSubSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Select Subscriber</Label>
              <Select value={formSubId} onValueChange={(v) => { setFormSubId(v); setFormAmount(""); setFormInvoiceId(""); autoFilledRef.current = false; }}>
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

            {/* Outstanding Balance + invoice pick */}
            {formSubId && (
              <div className="space-y-2">
                {balanceLoading ? (
                  <Skeleton className="skeleton-wave h-12 w-full" />
                ) : subBalance ? (
                  <>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
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
                              <TableHead className="hidden text-[10px] sm:table-cell">Due Date</TableHead>
                            </TableRow></TableHeader>
                            <TableBody>
                              {subBalance.pendingInvoices.map((inv) => (
                                <TableRow
                                  key={inv.id}
                                  className={`cursor-pointer transition-colors hover:bg-muted/50 ${formInvoiceId === inv.id ? "bg-emerald-500/10" : ""}`}
                                  onClick={() => { setFormInvoiceId(inv.id); setFormAmount(String(inv.balanceAmount)); }}
                                >
                                  <TableCell className="text-xs font-mono">{inv.invoiceNumber}</TableCell>
                                  <TableCell className="text-xs font-semibold text-red-600 tabular-nums">{formatINR(inv.balanceAmount)}</TableCell>
                                  <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">{formatDate(inv.dueDate)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        <p className="text-[10px] text-muted-foreground">Click an invoice to link it and auto-fill the amount</p>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">No outstanding balance found</p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Payment amount */}
              <div className="space-y-2">
                <Label className="text-sm font-medium" htmlFor="collect-amount">Amount *</Label>
                <div className="relative">
                  <IndianRupee className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="collect-amount" type="number" className="pl-9" placeholder="Enter amount" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} />
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-sm font-medium" htmlFor="collect-ref">Reference / Transaction ID</Label>
                <Input id="collect-ref" placeholder="UPI ref, cheque number..." value={formRef} onChange={(e) => setFormRef(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium" htmlFor="collect-notes">Notes</Label>
                <Input id="collect-notes" placeholder="Optional notes" value={formNotes} onChange={(e) => setFormNotes(e.target.value)} />
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

      {/* ─── Verify/Reject Confirm (All Payments tab) ─── */}
      <Dialog open={verifyOpen} onOpenChange={setVerifyOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Verify Payment</DialogTitle>
            <DialogDescription>
              Verify payment details before confirming.
            </DialogDescription>
            <div className="mt-2 space-y-1">
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
            <Button onClick={() => selectedPayment && verifyMutation.mutate({ id: selectedPayment.id, status: "VERIFIED" })} disabled={verifyMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
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
              Edit details for receipt <span className="font-mono font-medium">{selectedPayment?.receiptNumber}</span> — only PENDING payments can be edited.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-amount">Amount *</Label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="edit-amount" type="number" className="pl-9" placeholder="Enter amount" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} />
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
              <Label htmlFor="edit-ref">Reference / Transaction ID</Label>
              <Input id="edit-ref" placeholder="UPI ref, cheque number, etc." value={editRef} onChange={(e) => setEditRef(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-notes">Notes</Label>
              <Input id="edit-notes" placeholder="Optional notes" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
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
              Are you sure you want to delete this payment? This action cannot be undone. Only PENDING payments can be deleted.
            </DialogDescription>
            <div className="mt-2 space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/30">
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
                <span className="mt-1 block text-xs font-medium text-red-600">
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
              className={bulkAction === "verify" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}
            >
              {bulkVerifyMutation.isPending ? "Processing..." : bulkAction === "verify" ? "Verify" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-800 dark:bg-orange-950/30">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-orange-800 dark:text-orange-300">Payment Amount</span>
                <span className="text-lg font-bold text-orange-700 dark:text-orange-400">{selectedPayment ? formatINR(selectedPayment.amount) : formatINR(0)}</span>
              </div>
              {refundedSoFar > 0 && (
                <div className="mt-1.5 flex items-center justify-between border-t border-orange-200/70 pt-1.5 dark:border-orange-800/70">
                  <span className="text-xs font-medium text-orange-800/80 dark:text-orange-300/80">Already refunded</span>
                  <span className="text-xs font-bold tabular-nums text-orange-700 dark:text-orange-400">{formatINR(refundedSoFar)}</span>
                </div>
              )}
              <div className="mt-1 flex items-center justify-between">
                <span className="text-xs font-medium text-orange-800/80 dark:text-orange-300/80">Refundable now (cumulative cap)</span>
                <span className="text-xs font-bold tabular-nums text-orange-700 dark:text-orange-400">{formatINR(refundRemaining)}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="refund-amount">Refund Amount *</Label>
              <div className="relative">
                <IndianRupee className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="refund-amount"
                  type="number"
                  placeholder="0.00"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  min={0}
                  max={selectedPayment?.amount || 0}
                  className="pl-9"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Partial refund leaves the payment VERIFIED for the remainder; refunding the full remaining amount marks the payment REFUNDED. The backend refuses refunds beyond the cumulative cap.
              </p>
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
              <Label htmlFor="refund-notes">Notes</Label>
              <Textarea
                id="refund-notes"
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
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/30">
              <p className="text-xs font-medium text-red-700 dark:text-red-400">Warning: this action cannot be undone</p>
              <p className="mt-1 text-xs text-red-600/80 dark:text-red-400/70">If the cumulative refund reaches the payment amount, the payment will be marked as REFUNDED and the amount added to the subscriber&apos;s balance. If linked to an invoice, the invoice status will be updated.</p>
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
            <div className="max-h-[300px] space-y-2 overflow-y-auto">
              {refundHistory.refunds.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-orange-700 dark:text-orange-400">{formatINR(r.amount)}</p>
                    <p className="text-xs text-muted-foreground">{r.reason}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatDateTime(r.createdAt)}{r.processedBy ? ` — by ${r.processedBy.name}` : ""}
                    </p>
                  </div>
                  <Badge variant="outline" className={`shrink-0 text-[10px] ${r.status === "PROCESSED" ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400" : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400"}`}>
                    {r.status}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">No refunds found for this payment.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundHistoryOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Receipt Dialog (view / print / send) ─── */}
      <Dialog open={receiptOpen} onOpenChange={setReceiptOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="rounded-lg bg-emerald-100 p-1.5 dark:bg-emerald-900/30"><Printer className="h-5 w-5 text-emerald-600" /></div>
              Payment Receipt
            </DialogTitle>
            <DialogDescription>Receipt for {selectedPayment?.receiptNumber}</DialogDescription>
          </DialogHeader>
          {paymentDetail ? (
            <div className="space-y-4">
              <div className="space-y-4 rounded-xl border-2 border-dashed border-muted bg-gradient-to-b from-muted/20 to-transparent p-5">
                {/* ISP Header */}
                <div className="border-b-2 border-border pb-4 text-center">
                  <h2 className="text-lg font-bold tracking-tight">{paymentDetail.ispSettings?.companyName || "My ISP"}</h2>
                  {paymentDetail.ispSettings?.address && (
                    <p className="mt-1 text-xs text-muted-foreground">{[
                      paymentDetail.ispSettings.address,
                      paymentDetail.ispSettings.city,
                      paymentDetail.ispSettings.state,
                      paymentDetail.ispSettings.pincode,
                    ].filter(Boolean).join(", ")}</p>
                  )}
                  {(paymentDetail.ispSettings?.phone || paymentDetail.ispSettings?.email) && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {paymentDetail.ispSettings?.phone && `Phone: ${paymentDetail.ispSettings.phone}`}
                      {paymentDetail.ispSettings?.phone && paymentDetail.ispSettings?.email && " | "}
                      {paymentDetail.ispSettings?.email}
                    </p>
                  )}
                  {paymentDetail.ispSettings?.gstin && (
                    <p className="mt-0.5 text-[10px] text-muted-foreground">GSTIN: {paymentDetail.ispSettings.gstin}</p>
                  )}
                </div>
                {/* Receipt Details */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Receipt #</span>
                    <span className="font-mono text-xs font-medium">{paymentDetail.receiptNumber}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Date</span>
                    <span className="text-xs">{formatDateTime(paymentDetail.createdAt)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Status</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_MAP[paymentDetail.status]?.dot || "bg-gray-400"}`} />
                      <Badge variant="outline" className={`badge-bounce px-1.5 py-0 text-[10px] ${STATUS_MAP[paymentDetail.status]?.class || ""}`}>
                        {STATUS_MAP[paymentDetail.status]?.label || paymentDetail.status}
                      </Badge>
                    </div>
                  </div>
                </div>
                {/* Subscriber Info */}
                <div className="space-y-1.5 rounded-lg bg-muted/40 p-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Subscriber Details</p>
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
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Payment Details</p>
                  {paymentDetail.invoice && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Invoice</span>
                      <span className="font-mono text-xs">{paymentDetail.invoice.invoiceNumber}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm">
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
                <div className="flex items-center justify-between border-t-2 border-border pt-3">
                  <span className="text-sm font-bold">Total Amount</span>
                  <span className="text-xl font-bold tracking-tight">{formatINR(paymentDetail.amount)}</span>
                </div>
                {paymentDetail.notes && (
                  <p className="border-l-2 border-muted pl-2 text-xs italic text-muted-foreground">
                    {paymentDetail.notes}
                  </p>
                )}
              </div>

              {/* ── Send Receipt section ── */}
              <div className="rounded-xl border bg-muted/20 p-3.5">
                <div className="mb-2.5 flex items-center gap-2">
                  <Send className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  <p className="text-sm font-semibold">Send Receipt</p>
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {SEND_CHANNELS.map((ch) => {
                    const ChIcon = ch.icon;
                    return (
                      <div key={ch.key} className="flex items-center gap-1.5">
                        <Checkbox
                          id={`send-ch-${ch.key}`}
                          checked={!!sendChannels[ch.key]}
                          onCheckedChange={(v) => setSendChannels((m) => ({ ...m, [ch.key]: v === true }))}
                        />
                        <Label htmlFor={`send-ch-${ch.key}`} className="flex cursor-pointer items-center gap-1 text-xs font-normal">
                          <ChIcon className="h-3 w-3 text-muted-foreground" />{ch.label}
                        </Label>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="send-email" className="text-[10px] text-muted-foreground">Email override</Label>
                    <Input
                      id="send-email" type="email" className="h-8 text-xs"
                      placeholder={paymentDetail.subscriber?.email || "subscriber@example.com"}
                      value={sendEmail} onChange={(e) => setSendEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="send-phone" className="text-[10px] text-muted-foreground">Phone override (E.164)</Label>
                    <Input
                      id="send-phone" type="tel" className="h-8 text-xs"
                      placeholder={paymentDetail.subscriber?.phone || "+9198xxxxxxxx"}
                      value={sendPhone} onChange={(e) => setSendPhone(e.target.value)}
                    />
                  </div>
                </div>
                <div className="mt-2.5 flex items-center gap-2">
                  <AsyncActionButton
                    label="Send Receipt" pendingLabel="Sending…"
                    pending={sendReceiptMutation.isPending}
                    icon={<Send className="h-3.5 w-3.5" />}
                    onClick={() => sendReceiptMutation.mutate()}
                    disabled={sendReceiptMutation.isPending}
                    variant="default"
                    className="bg-teal-600 text-white hover:bg-teal-700 dark:bg-teal-600 dark:hover:bg-teal-700"
                  />
                  <p className="text-[10px] text-muted-foreground">Override fields are optional — leave blank to use the subscriber&apos;s contact on file.</p>
                </div>
                {sendResults && sendResults.length > 0 && (
                  <div className="mt-3 space-y-1.5" role="status">
                    {sendResults.map((r) => (
                      <div
                        key={r.channel}
                        className={`flex items-start gap-2 rounded-lg border p-2 text-xs ${
                          r.success
                            ? "border-emerald-200 bg-emerald-50/70 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300"
                            : "border-red-200 bg-red-50/70 text-red-800 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300"
                        }`}
                      >
                        {r.success ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <XIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                        <span className="font-semibold">{r.channel}</span>
                        <span className="min-w-0 flex-1 break-words opacity-90">{r.detail}</span>
                      </div>
                    ))}
                  </div>
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
              <Printer className="mr-2 h-4 w-4" />Print Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
