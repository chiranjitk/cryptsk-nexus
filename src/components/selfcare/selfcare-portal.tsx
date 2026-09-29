"use client";

import * as React from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  LayoutDashboard, BarChart3, CreditCard, LifeBuoy, UserRound, PackageCheck,
  CheckCircle2, Clock, Pause, CircleSlash, Hourglass, Wifi, WifiOff,
  RefreshCw, AlertTriangle, Inbox, FileText, Banknote, Landmark, Wallet,
  IndianRupee, LogOut, Sun, Moon, Info, Download, Upload, Smartphone, Ticket,
  Loader2, Plus, Send, KeyRound, Pencil, Eye, EyeOff, ShieldCheck, Check, X,
  MessageSquare, Gauge,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatINR, humanBytes, formatDuration, formatNumber, relTime } from "@/lib/format";
import { cn } from "@/lib/utils";

// ============================================================
// CRYPTSK Nexus — Self-Care Portal (spec 11_FINAL_MENU §18)
// A SEPARATE customer-facing product shell (own header + nav +
// footer) that replaces the admin chrome when ?view=selfcare.
// All data is real via /api/selfcare/* (T5-a contract) and
// /api/subscribers. Zero mock values, honest empty states, and
// NO admin-only concepts (no NAS/RBAC/audit terminology).
//
// Two modes (T6):
//  - Customer session (session.user.userType === "customer"): the
//    portal is the customer's OWN account — subscriber picker, staff
//    preview banner and admin links are never rendered. API calls
//    pass NO subscriberId (the backend force-scopes customer
//    sessions and auto-picks their first subscriber); billing and
//    support use the session's own customerId.
//  - Staff session: preview mode with the subscriber picker
//    (unchanged behavior).
//
// Write actions (T7): customer sessions get a new-ticket dialog and
// per-ticket replies (Support tab), editable contact details and a
// sign-in & security card with password change (Profile tab). Every
// write UI is gated on isCustomer — staff preview stays read-only.
//
// Service Status + Payments tabs (T8): service-status is
// subscriber-scoped read-only (staff ?subscriberId=, customer mode
// sends no params — the backend auto-picks their subscriber); the
// wallet summary and transactions read in both modes while voucher
// redemption and pay-invoice-from-wallet are customer-only writes
// (POST /api/selfcare/vouchers/redeem, POST /api/selfcare/wallet/pay)
// via apiMutate with verbatim server error strings.
// ============================================================

// ---------- API contract types (T5-a) ----------

type ServiceStatusKey = "operational" | "suspended" | "terminated" | "expiring" | "pending";

interface OverviewData {
  subscriber: {
    id: string; subscriberCode: string; radiusUsername: string; status: string;
    activatedAt: string | null; expiresAt: string | null; staticIp: string | null; vlanId: number | null;
  };
  plan: { id: string; name: string; basePrice: number; billingCycle: string; dataLimitGb: number | null } | null;
  customer: { id: string; customerCode: string; displayName: string; email: string | null; phone: string | null };
  subscription: { id: string; subscriptionCode: string; status: string; basePrice: number; nextBillingDate: string | null } | null;
  usage: { month: { inBytes: number; outBytes: number; sessions: number }; today: { inBytes: number; outBytes: number } };
  session: { online: boolean; since: string | null; nasName: string | null; framedIp: string | null };
  lastInvoice: { id: string; invoiceNumber: string; total: number; balanceDue: number; status: string; dueDate: string | null; createdAt: string } | null;
  openTickets: number;
  serviceStatus: ServiceStatusKey;
  daysLeft: number | null;
}

interface UsageData {
  daily: { day: string; inBytes: number; outBytes: number; sessions: number }[];
  speedHistory: { startedAt: string; stoppedAt: string | null; durationSec: number; avgDownMbps: number; avgUpMbps: number; nasName: string | null }[];
  totals: { inBytes: number; outBytes: number; sessions: number };
}

interface InvoiceRow {
  id: string; invoiceNumber: string; status: string;
  subtotal: number; taxAmount: number; total: number; paidAmount: number; balanceDue: number;
  dueDate: string | null; createdAt: string; _count: { items: number };
}
interface PaymentRow {
  id: string; paymentNumber: string; amount: number; method: string; status: string;
  paidAt: string | null; receivedAt: string | null; invoiceNumber: string | null;
}
interface BillingData {
  invoices: InvoiceRow[];
  payments: PaymentRow[];
  totals: { invoiced: number; paid: number; outstanding: number };
}

interface TicketReply { authorName: string; message: string; createdAt: string }
interface TicketRow {
  id: string; ticketNumber: string; subject: string; status: string; priority: string;
  category: string | null; description: string; createdAt: string;
  slaDueAt: string | null; resolvedAt: string | null; replies: TicketReply[];
}
interface SupportData { tickets: TicketRow[] }

interface ScAddress {
  id: string; type: string; line1: string; line2: string | null; city: string;
  state: string | null; postalCode: string | null; country: string;
  landmark: string | null; isPrimary: boolean;
}
interface ScContact { id: string; type: string; value: string; label: string | null; isPrimary: boolean }
interface ProfileData {
  customer: {
    displayName: string; email: string | null; phone: string | null; whatsappNumber: string | null;
    companyName: string | null; gstin: string | null; pan: string | null; kycVerified: boolean;
    addresses: ScAddress[]; contacts: ScContact[];
  };
  subscriber: {
    subscriberCode: string; radiusUsername: string; status: string;
    activatedAt: string | null; expiresAt: string | null; staticIp: string | null; vlanId: number | null;
  };
}

interface PlanRow {
  id: string; name: string; basePrice: number; billingCycle: string; taxRate: number;
  dataLimitGb: number | null; setupFee: number; discountPercent: number;
  product: { name: string } | null; isCurrent: boolean;
}
interface PlansData { currentPlanId: string | null; plans: PlanRow[] }

interface PickerSubscriber {
  id: string; subscriberCode: string; radiusUsername: string; fullName: string | null; status: string;
  plan: { name: string } | null;
  customer: { id: string; customerCode: string; displayName: string };
}

// ---------- write-action response types (T7-a contract) ----------

interface ScNewTicketResponse {
  ticket: {
    id: string; ticketNumber: string; subject: string; status: string;
    category: string; priority: string; createdAt: string; slaDueAt: string | null;
  };
}
interface ScReplyResponse {
  reply: { id: string; authorName: string; message: string; createdAt: string; ticketStatus: string };
}
interface ScProfileUpdateResponse {
  customer: { id: string; email: string | null; phone: string | null; whatsappNumber: string | null };
}

// ---------- service-status + wallet types (T8-a contract) ----------

interface ServiceStatusData {
  subscriber: {
    id: string; subscriberCode: string; fullName: string; status: string;
    radiusUsername: string; staticIp: string | null; vlanId: number | null;
    activatedAt: string | null; expiresAt: string | null;
    plan: { id: string; name: string; billingCycle: string; dataLimitGb: number | null; status: string } | null;
  };
  online: boolean;
  activeSession: null | {
    startedAt: string; durationSeconds: number; ipAddress: string | null;
    nas: string | null; calledStationId: string | null;
    inputOctets: number; outputOctets: number;
  };
  recentSessions: {
    startedAt: string; stoppedAt: string | null; durationSeconds: number;
    ipAddress: string | null; inputOctets: number; outputOctets: number;
    terminateCause: string | null;
  }[];
  lifecycle: { id: string; state: string; previousState: string | null; reason: string | null; changedAt: string }[];
}

interface WalletData {
  wallet: null | { id: string; balance: number; currency: string; minBalance: number; autoRecharge: boolean };
  transactions: {
    id: string; amount: number; type: string; description: string | null;
    balanceAfter: number; createdAt: string; invoiceId: string | null;
  }[];
}

interface ScVoucherRedeemResponse {
  voucher: { code: string; faceValue: number };
  wallet: { balance: number };
}

interface ScWalletPayResponse {
  payment: { id: string; paymentNumber: string; amount: number; method: string; status: string; paidAt: string | null };
  invoice: { id: string; invoiceNumber: string; status: string; paidAmount: number; balanceDue: number; paymentStatus: string };
  wallet: { balance: number };
}

// ---------- shared helpers ----------

async function apiRequest(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || `Request failed (${res.status})`);
  }
  return res.json();
}

// Write-request variant (T7): sends a JSON body, returns parsed JSON.
// Non-2xx responses surface the backend { error } message so toasts can
// show the real reason (e.g. "This email is already in use").
async function apiMutate(url: string, method: string, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || `Request failed (${res.status})`);
  }
  return res.json();
}

// BigInt values can arrive JSON-serialized as strings — coerce defensively.
function num(v: unknown): number {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return isFinite(n) ? n : 0;
  }
  return 0;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function cycleLabel(cycle: string): string {
  return (cycle || "").replace(/_/g, " ").toLowerCase();
}

// RADIUS Acct-Terminate-Cause values arrive hyphenated ("User-Request",
// "Idle-Timeout") — display them as plain words.
function terminateCauseLabel(cause: string | null | undefined): string {
  if (!cause) return "—";
  return cause.replace(/[-_]+/g, " ");
}

function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

// Tiny strength heuristic for the password form (T7): no libraries —
// length (>=8 / >=12) + letter/digit/symbol variety → Weak / Fair / Good.
function passwordStrength(pw: string): { label: string; filled: number; className: string } {
  const hasLetter = /[A-Za-z]/.test(pw);
  const hasDigit = /[0-9]/.test(pw);
  const hasSymbol = /[^A-Za-z0-9]/.test(pw);
  const variety = [hasLetter, hasDigit, hasSymbol].filter(Boolean).length;
  if (pw.length >= 12 && variety >= 3) return { label: "Good", filled: 3, className: "bg-emerald-500" };
  if (pw.length >= 8 && variety >= 2) return { label: "Fair", filled: 2, className: "bg-amber-500" };
  return { label: "Weak", filled: 1, className: "bg-red-500" };
}

const tooltipStyle = { backgroundColor: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: "12px" };

// ---------- style maps (emerald/red/amber/violet/slate palette) ----------

const SERVICE_STATUS_META: Record<ServiceStatusKey, { label: string; badge: string; icon: typeof CheckCircle2 }> = {
  operational: { label: "Operational", badge: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", icon: CheckCircle2 },
  expiring: { label: "Expiring soon", badge: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400", icon: Clock },
  suspended: { label: "Suspended", badge: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400", icon: Pause },
  terminated: { label: "Terminated", badge: "border-slate-400/40 bg-slate-500/10 text-slate-600 dark:text-slate-400", icon: CircleSlash },
  pending: { label: "Pending activation", badge: "border-slate-400/40 bg-slate-500/10 text-slate-600 dark:text-slate-400", icon: Hourglass },
};

const TICKET_STATUS_BADGE: Record<string, string> = {
  open: "border-red-500/30 text-red-600 dark:text-red-400",
  in_progress: "border-amber-500/30 text-amber-600 dark:text-amber-400",
  pending: "border-violet-500/30 text-violet-600 dark:text-violet-400",
  resolved: "border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
  closed: "border-slate-400/30 text-slate-500",
};

const PRIORITY_BADGE: Record<string, string> = {
  critical: "border-red-500/40 text-red-600 dark:text-red-400",
  high: "border-orange-500/40 text-orange-600 dark:text-orange-400",
  medium: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  low: "border-slate-400/40 text-slate-500",
};

const MONEY_STATUS_BADGE: Record<string, string> = {
  paid: "border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
  partial: "border-amber-500/30 text-amber-600 dark:text-amber-400",
  issued: "border-violet-500/30 text-violet-600 dark:text-violet-400",
  overdue: "border-red-500/30 text-red-600 dark:text-red-400",
  failed: "border-red-500/30 text-red-600 dark:text-red-400",
  draft: "border-slate-400/30 text-slate-500",
  void: "border-slate-400/30 text-slate-500",
  cancelled: "border-slate-400/30 text-slate-500",
  refunded: "border-violet-500/30 text-violet-600 dark:text-violet-400",
  completed: "border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
};

const SERVICE_STATUS_BADGE: Record<string, string> = {
  active: "border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
  suspended: "border-red-500/30 text-red-600 dark:text-red-400",
  terminated: "border-slate-400/30 text-slate-500",
  expired: "border-slate-400/30 text-slate-500",
  inactive: "border-slate-400/30 text-slate-500",
  pending_activation: "border-amber-500/30 text-amber-600 dark:text-amber-400",
};

// Wallet ledger types (T8-a WalletTxnType enum) — credits lean emerald,
// debits neutral violet, manual corrections amber; unknown falls back slate.
const WALLET_TXN_BADGE: Record<string, string> = {
  recharge: "border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
  refund: "border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
  cashback: "border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
  payment: "border-violet-500/30 text-violet-600 dark:text-violet-400",
  adjustment: "border-amber-500/30 text-amber-600 dark:text-amber-400",
};

function moneyBadge(status: string): string {
  return MONEY_STATUS_BADGE[(status || "").toLowerCase()] || "border-slate-400/30 text-slate-500";
}

const METHOD_META: Record<string, { icon: typeof CreditCard; label: string }> = {
  cash: { icon: Banknote, label: "Cash" },
  upi: { icon: Smartphone, label: "UPI" },
  card: { icon: CreditCard, label: "Card" },
  netbanking: { icon: Landmark, label: "Net banking" },
  banktransfer: { icon: Landmark, label: "Bank transfer" },
  bank_transfer: { icon: Landmark, label: "Bank transfer" },
  neft: { icon: Landmark, label: "NEFT" },
  imps: { icon: Landmark, label: "IMPS" },
  rtgs: { icon: Landmark, label: "RTGS" },
  cheque: { icon: FileText, label: "Cheque" },
  wallet: { icon: Wallet, label: "Wallet" },
};

function methodMeta(method: string): { icon: typeof CreditCard; label: string } {
  const key = (method || "").toLowerCase().replace(/[\s_-]/g, "");
  if (METHOD_META[key]) return METHOD_META[key];
  if (/bank|neft|imps|rtgs|transfer/.test(key)) return METHOD_META.netbanking;
  if (/upi|paytm|gpay|phonepe/.test(key)) return METHOD_META.upi;
  if (/cash/.test(key)) return METHOD_META.cash;
  if (/cheque|check/.test(key)) return METHOD_META.cheque;
  if (/wallet/.test(key)) return METHOD_META.wallet;
  return { icon: CreditCard, label: method ? method.replace(/_/g, " ") : "—" };
}

// ---------- shared small pieces ----------

function ScStatChip({ label, value, danger, icon: Icon }: {
  label: string; value: string; danger?: boolean; icon?: typeof CreditCard;
}) {
  return (
    <div className={cn("rounded-md border bg-card px-3 py-2", danger && "border-red-500/30 bg-red-500/5")}>
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {Icon && <Icon className="size-3" />}
        {label}
      </div>
      <div className={cn("mt-1 text-lg font-semibold leading-none tabular-nums", danger && "text-red-600 dark:text-red-400")}>
        {value}
      </div>
    </div>
  );
}

function ScErrorState({ onRetry, message }: { onRetry: () => void; message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-10" role="alert">
      <AlertTriangle className="size-8 text-amber-500" />
      <p className="text-sm font-medium">Something went wrong</p>
      <p className="max-w-sm text-center text-xs text-muted-foreground">
        {message || "We couldn't load this section. Please try again."}
      </p>
      <Button size="sm" variant="outline" className="mt-2 gap-1.5" onClick={onRetry}>
        <RefreshCw className="size-3.5" /> Retry
      </Button>
    </div>
  );
}

function ScEmptyState({ icon: Icon, title, hint }: {
  icon: typeof Inbox; title: string; hint: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-10">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Icon className="size-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-center text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function TabSkeleton({ lines = 5 }: { lines?: number }) {
  return (
    <div className="space-y-3" aria-busy="true">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-md" />)}
      </div>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-lg" />
      ))}
    </div>
  );
}

function StatusBadge({ status, map }: { status: string; map: Record<string, string> }) {
  return (
    <Badge variant="outline" className={cn("text-[10px] capitalize", map[(status || "").toLowerCase()] || "border-slate-400/30 text-slate-500")}>
      {(status || "—").replace(/_/g, " ")}
    </Badge>
  );
}

// ---------- root component ----------

type Tab = "dashboard" | "usage" | "billing" | "support" | "profile" | "service-status" | "payments" | "plans";

const STORAGE_KEY = "selfcare.subscriberId";

// Resolved self-care context (T6). Customer sessions scope themselves:
// no subscriberId is sent (the backend auto-picks their first subscriber
// and rejects foreign ones), and customerId comes from the session.
// Staff sessions keep the explicit picker selection.
type SelfcareCtx =
  | { mode: "customer"; customerId: string; subscriberId: null }
  | { mode: "staff"; customerId: string | null; subscriberId: string };

const NAV_TABS: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "usage", label: "My Usage", icon: BarChart3 },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "support", label: "Support", icon: LifeBuoy },
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "service-status", label: "Service Status", icon: Gauge },
  { id: "payments", label: "Payments", icon: Wallet },
  { id: "plans", label: "Plans", icon: PackageCheck },
];

export function SelfCarePortal() {
  const [tab, setTab] = React.useState<Tab>("dashboard");
  const [subscriberId, setSubscriberId] = React.useState<string>(() => {
    try {
      return window.sessionStorage.getItem(STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const { theme, setTheme } = useTheme();
  const { data: session, status: sessionStatus } = useSession();

  // Customer session detection (T6 contract: session.user gains the
  // additive userType/customerId/customerName fields on customer logins).
  const sessionUser = session?.user as
    | { email?: string | null; userType?: string; customerId?: string; customerName?: string; name?: string | null }
    | undefined;
  const isCustomer = sessionStatus !== "loading" && sessionUser?.userType === "customer";
  const sessionCustomerId = isCustomer ? sessionUser?.customerId || "" : "";
  const sessionCustomerName = isCustomer
    ? sessionUser?.customerName || sessionUser?.name || ""
    : "";

  function selectSubscriber(id: string) {
    setSubscriberId(id);
    try {
      window.sessionStorage.setItem(STORAGE_KEY, id);
    } catch {
      // storage unavailable (private mode) — in-memory selection still works
    }
  }

  // Subscriber context (picker) — real /api/subscribers data.
  // Staff-only: customer sessions must never list other customers' lines.
  const pickerQuery = useQuery<PickerSubscriber[]>({
    queryKey: ["selfcare", "subscribers"],
    queryFn: async () => {
      const data = await apiRequest("/api/subscribers?limit=50") as { subscribers?: PickerSubscriber[] };
      return Array.isArray(data?.subscribers) ? data.subscribers : [];
    },
    enabled: sessionStatus !== "loading" && !isCustomer,
    refetchInterval: 60000,
    staleTime: 50000,
    retry: 1,
  });

  // Overview — powers header banner, dashboard hero + customerId derivation.
  // Customer mode: no subscriberId param — the backend scopes the session
  // to the signed-in customer and auto-picks their first subscriber.
  const overviewQuery = useQuery<OverviewData>({
    queryKey: isCustomer ? ["selfcare", "overview", "self", sessionCustomerId] : ["selfcare", "overview", subscriberId],
    queryFn: () =>
      (isCustomer
        ? apiRequest("/api/selfcare/overview")
        : apiRequest(`/api/selfcare/overview?subscriberId=${encodeURIComponent(subscriberId)}`)) as Promise<OverviewData>,
    enabled: sessionStatus !== "loading" && (isCustomer ? !!sessionCustomerId : !!subscriberId),
    refetchInterval: 60000,
    staleTime: 50000,
    retry: 1,
  });

  const overview = overviewQuery.data;

  // Resolved context: customer sessions never touch the picker state,
  // so a stale sessionStorage "selfcare.subscriberId" cannot override them.
  const ctx: SelfcareCtx = isCustomer
    ? { mode: "customer", customerId: sessionCustomerId, subscriberId: null }
    : { mode: "staff", customerId: overview?.customer?.id ?? null, subscriberId };
  const customerId = ctx.customerId;
  const customerName = isCustomer
    ? sessionCustomerName
    : (overview?.customer?.displayName ?? null);
  // Tabs that scope by subscriber receive null in customer mode (no param
  // sent) and the picker selection in staff mode — staff behavior unchanged.
  const ctxSubscriberId = ctx.mode === "customer" ? null : ctx.subscriberId;

  const main = (() => {
    if (sessionStatus === "loading") {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-sm text-muted-foreground" aria-busy="true">
          <Loader2 className="size-6 cryptsk-spin" aria-hidden="true" />
          Loading your portal…
        </div>
      );
    }
    if (isCustomer && !sessionCustomerId) {
      // Defensive only — customer sessions always carry a customerId.
      return (
        <Card className="mx-auto mt-6 max-w-lg text-center">
          <CardContent className="p-8">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-amber-500/10">
              <AlertTriangle className="size-7 text-amber-500" />
            </div>
            <h2 className="text-lg font-semibold">Account not linked yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Your sign-in isn&apos;t linked to a customer account yet. Please contact our support team so we can finish setting up your access.
            </p>
          </CardContent>
        </Card>
      );
    }
    if (!isCustomer && !subscriberId) {
      return (
        <Card className="mx-auto mt-6 max-w-lg text-center">
          <CardContent className="p-8">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-violet-500/10">
              <UserRound className="size-7 text-violet-500" />
            </div>
            <h2 className="text-lg font-semibold">Welcome to your Self-Care portal</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Choose a connection from the selector above to see your plan, usage, invoices and support requests — all in one place.
            </p>
          </CardContent>
        </Card>
      );
    }
    switch (tab) {
      case "usage":
        return <UsageTab subscriberId={ctxSubscriberId} />;
      case "billing":
        return <BillingTab customerId={customerId} />;
      case "support":
        return <SupportTab customerId={customerId} openTickets={overview?.openTickets ?? 0} isCustomer={ctx.mode === "customer"} />;
      case "profile":
        return <ProfileTab subscriberId={ctxSubscriberId} isCustomer={ctx.mode === "customer"} portalEmail={sessionUser?.email ?? null} />;
      case "service-status":
        return <ServiceStatusTab subscriberId={ctxSubscriberId} />;
      case "payments":
        return <PaymentsTab customerId={customerId} isCustomer={ctx.mode === "customer"} />;
      case "plans":
        return <PlansTab subscriberId={ctxSubscriberId} />;
      case "dashboard":
      default:
        return (
          <DashboardTab
            overview={overview}
            loading={overviewQuery.isLoading}
            error={overviewQuery.error instanceof Error ? overviewQuery.error.message : overviewQuery.isError ? "Failed to load" : null}
            retry={() => overviewQuery.refetch()}
            onGo={(t) => { setTab(t); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          />
        );
    }
  })();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* ── Self-care header (own chrome — NOT the admin shell) ── */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link
            href={isCustomer ? "/?view=selfcare" : "/"}
            className="flex items-center gap-2.5"
            aria-label={isCustomer ? "CRYPTSK Nexus Self-Care home" : "CRYPTSK Nexus home"}
          >
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary sidebar-logo-glow">
              <span className="text-sm font-bold text-primary-foreground">C</span>
            </div>
            <span className="hidden font-bold tracking-tight sm:inline">CRYPTSK Nexus</span>
          </Link>
          <Badge variant="outline" className="border-violet-500/30 bg-violet-500/10 text-[10px] font-semibold text-violet-600 dark:text-violet-400">
            Self-Care
          </Badge>

          {/* Customer sessions: own identity instead of the staff picker */}
          <div className="ml-auto flex min-w-0 items-center gap-2">
            {isCustomer ? (
              <div className="flex min-w-0 items-center gap-2" aria-label="Signed-in customer">
                <span className="hidden min-w-0 truncate text-sm font-semibold sm:inline" title={sessionCustomerName}>
                  {sessionCustomerName || "My account"}
                </span>
                <Badge
                  variant="outline"
                  className="shrink-0 border-emerald-500/30 bg-emerald-500/10 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"
                >
                  Customer
                </Badge>
              </div>
            ) : (
              <Select value={subscriberId} onValueChange={selectSubscriber}>
                <SelectTrigger
                  className="h-9 w-full max-w-[190px] text-xs sm:w-[260px] sm:max-w-none sm:text-sm"
                  aria-label="Select connection"
                >
                  <SelectValue placeholder={pickerQuery.isLoading ? "Loading connections…" : "Select connection"} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {(pickerQuery.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id} className="text-xs sm:text-sm">
                      <span className="truncate">
                        {s.customer?.displayName || s.fullName || s.radiusUsername} — {s.subscriberCode}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="size-9 shrink-0"
              aria-label="Toggle theme"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              <Sun className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="hidden h-9 gap-1.5 shrink-0 sm:inline-flex"
              onClick={() => signOut({ redirect: false }).then(() => { window.location.href = "/"; })}
            >
              <LogOut className="size-3.5" /> Sign out
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-9 shrink-0 sm:hidden"
              aria-label="Sign out"
              onClick={() => signOut({ redirect: false }).then(() => { window.location.href = "/"; })}
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>

        {/* Staff preview banner — never rendered for real customers */}
        {!isCustomer && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t bg-amber-500/5 px-4 py-1.5 text-xs text-amber-700 dark:text-amber-400">
            <Info className="size-3.5 shrink-0" aria-hidden="true" />
            <span>
              Staff preview mode — this is what {customerName ? <strong className="font-semibold">{customerName}</strong> : "the customer"} sees in the customer portal.
            </span>
            <Link href="/" className="ml-auto font-medium underline underline-offset-2 hover:text-foreground">
              Back to Admin
            </Link>
          </div>
        )}

        {/* Horizontal section nav */}
        <nav className="border-t" aria-label="Self-care sections">
          <div className="flex gap-1 overflow-x-auto px-2 cryptsk-scrollbar" role="tablist">
            {NAV_TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-xs font-medium transition-colors",
                    active
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  <t.icon className="size-3.5" aria-hidden="true" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      <main className="flex-1">
        <div className="mx-auto w-full max-w-6xl p-4 md:p-6 cryptsk-fade-in">
          {main}
        </div>
      </main>

      {/* ── Sticky footer (mt-auto keeps it at the bottom on short pages) ── */}
      <footer className="mt-auto border-t bg-background py-3 px-4">
        <p className="text-center text-xs text-muted-foreground">
          © 2026 CRYPTSK Private Limited · Self-Care v1.0
        </p>
      </footer>
    </div>
  );
}

// ============================================================
// TAB 1 — Dashboard
// ============================================================

function DashboardTab({ overview, loading, error, retry, onGo }: {
  overview: OverviewData | undefined;
  loading: boolean;
  error: string | null;
  retry: () => void;
  onGo: (tab: Tab) => void;
}) {
  if (loading) return <TabSkeleton />;
  if (error) return <ScErrorState onRetry={retry} message={error} />;
  if (!overview) return null;

  const firstName = (overview.customer?.displayName || "there").split(/\s+/)[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const statusMeta = SERVICE_STATUS_META[overview.serviceStatus] ?? SERVICE_STATUS_META.pending;
  const StatusIcon = statusMeta.icon;

  const monthIn = num(overview.usage?.month?.inBytes);
  const monthOut = num(overview.usage?.month?.outBytes);
  const monthTotal = monthIn + monthOut;
  const sessions = num(overview.usage?.month?.sessions);

  const dataLimitGb = overview.plan?.dataLimitGb ?? null;
  const limitBytes = dataLimitGb ? dataLimitGb * 1024 * 1024 * 1024 : null;
  const usagePct = limitBytes ? Math.min(100, (monthTotal / limitBytes) * 100) : null;
  const barColor = usagePct === null ? "bg-emerald-500" : usagePct >= 90 ? "bg-red-500" : usagePct >= 75 ? "bg-amber-500" : "bg-emerald-500";

  const outstanding = num(overview.lastInvoice?.balanceDue);
  const inv = overview.lastInvoice;

  return (
    <div className="space-y-4">
      {/* Welcome + status hero */}
      <Card className="cryptsk-card-load">
        <CardContent className="p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold tracking-tight">
                {greeting}, {firstName}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {overview.plan
                  ? `${overview.plan.name} · ${formatINR(overview.plan.basePrice)} / ${cycleLabel(overview.plan.billingCycle)}`
                  : "No active plan"}
              </p>
            </div>
            <div
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold",
                statusMeta.badge,
              )}
              aria-label={`Service status: ${statusMeta.label}`}
            >
              <StatusIcon className="size-4" aria-hidden="true" />
              {statusMeta.label}
              {overview.serviceStatus === "expiring" && overview.daysLeft != null && (
                <span className="font-normal">· expires in {overview.daysLeft}d</span>
              )}
            </div>
          </div>

          {/* Live session chip */}
          <div className="mt-4 flex items-center gap-2 text-xs">
            {overview.session?.online ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-600 dark:text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-500 cryptsk-pulse-dot" aria-hidden="true" />
                Online since {relTime(overview.session.since)}
                {overview.session.nasName ? ` · ${overview.session.nasName}` : ""}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-400/30 bg-slate-500/10 px-2.5 py-1 font-medium text-slate-600 dark:text-slate-400">
                <WifiOff className="size-3" aria-hidden="true" />
                Offline
              </span>
            )}
            {overview.session?.framedIp && (
              <span className="hidden font-mono text-[10px] text-muted-foreground sm:inline">
                IP {overview.session.framedIp}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Data usage progress */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Data usage this month</CardTitle>
          <CardDescription className="text-xs">
            {dataLimitGb ? `Included quota: ${dataLimitGb} GB` : "Your plan includes unlimited data"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dataLimitGb ? (
            <>
              <div className="mb-2 flex items-baseline justify-between gap-2 text-sm">
                <span className="font-semibold tabular-nums">{humanBytes(monthTotal)}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  of {dataLimitGb} GB{usagePct !== null ? ` · ${usagePct.toFixed(0)}% used` : ""}
                </span>
              </div>
              <div
                className="h-2.5 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={Math.round(usagePct ?? 0)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Monthly data usage"
              >
                <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${usagePct ?? 0}%` }} />
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400">
                Unlimited
              </Badge>
              <span className="text-sm text-muted-foreground tabular-nums">
                {humanBytes(monthTotal)} used this month
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4 stat chips */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ScStatChip label="Data this month" value={humanBytes(monthTotal)} icon={Download} />
        <ScStatChip label="Sessions this month" value={formatNumber(sessions)} icon={Wifi} />
        <ScStatChip label="Outstanding" value={formatINR(outstanding)} danger={outstanding > 0} icon={IndianRupee} />
        <ScStatChip label="Open tickets" value={formatNumber(overview.openTickets)} icon={Ticket} />
      </div>

      {/* Latest invoice + quick actions */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Latest invoice</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => onGo("billing")}>
              View all
            </Button>
          </CardHeader>
          <CardContent>
            {inv ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div>
                  <p className="font-mono text-sm font-medium">{inv.invoiceNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    Due {fmtDate(inv.dueDate)}
                  </p>
                </div>
                <div className="text-right sm:ml-auto">
                  <p className="text-sm font-semibold tabular-nums">{formatINR(inv.total)}</p>
                  <StatusBadge status={inv.status} map={MONEY_STATUS_BADGE} />
                </div>
              </div>
            ) : (
              <p className="py-2 text-sm text-muted-foreground">No invoices yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onGo("usage")}>
              <BarChart3 className="size-3.5" /> View usage
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onGo("billing")}>
              <IndianRupee className="size-3.5" /> Pay invoice
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onGo("support")}>
              <LifeBuoy className="size-3.5" /> Get support
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============================================================
// TAB 2 — My Usage
// ============================================================

function UsageTab({ subscriberId }: { subscriberId: string | null }) {
  const [days, setDays] = React.useState<"7" | "30" | "90">("30");

  const query = useQuery<UsageData>({
    // staff: scoped to the picked subscriber — customer (subscriberId null):
    // NO subscriberId param, the backend auto-picks their own subscriber.
    queryKey: ["selfcare", "usage", subscriberId ?? "self", days],
    queryFn: () =>
      (subscriberId
        ? apiRequest(`/api/selfcare/usage?subscriberId=${encodeURIComponent(subscriberId)}&days=${days}`)
        : apiRequest(`/api/selfcare/usage?days=${days}`)) as Promise<UsageData>,
    // null = customer mode (own data); staff renders are gated on a
    // non-empty selection upstream, so "" can never reach this query.
    enabled: subscriberId !== "",
    refetchInterval: 60000,
    staleTime: 50000,
    retry: 1,
  });

  const data = query.data;
  const chartData = (data?.daily ?? []).map((d) => ({
    day: d.day,
    down: num(d.inBytes),
    up: num(d.outBytes),
  }));

  const maxMbps = React.useMemo(() => {
    const rows = data?.speedHistory ?? [];
    return Math.max(1, ...rows.map((r) => Math.max(num(r.avgDownMbps), num(r.avgUpMbps))));
  }, [data?.speedHistory]);

  return (
    <div className="space-y-4">
      {/* Window pills + totals */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 overflow-x-auto pb-1" role="group" aria-label="Usage window">
          {(["7", "30", "90"] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={days === d}
              onClick={() => setDays(d)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors",
                days === d ? "border-primary bg-primary text-primary-foreground" : "border-transparent hover:bg-muted",
              )}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <ScStatChip label="Download" value={humanBytes(num(data?.totals?.inBytes))} icon={Download} />
        <ScStatChip label="Upload" value={humanBytes(num(data?.totals?.outBytes))} icon={Upload} />
        <ScStatChip label="Sessions" value={formatNumber(num(data?.totals?.sessions))} icon={Wifi} />
      </div>

      {/* Daily traffic chart — only real buckets, no fabricated zero-fill */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Daily traffic — last {days} days</CardTitle>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <Skeleton className="h-[260px] w-full" />
          ) : query.isError ? (
            <ScErrorState onRetry={() => query.refetch()} message={query.error instanceof Error ? query.error.message : undefined} />
          ) : chartData.length === 0 ? (
            <ScEmptyState
              icon={BarChart3}
              title="No usage recorded in this window"
              hint="Daily traffic appears here once your connection starts passing data."
            />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <defs>
                  <linearGradient id="scDlGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#dc2626" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#dc2626" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="scUlGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#16a34a" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#16a34a" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis
                  dataKey="day"
                  className="text-xs"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: string) => (typeof v === "string" && v.length >= 8 ? v.slice(5) : v)}
                />
                <YAxis className="text-xs" tickLine={false} axisLine={false} tickFormatter={(v: number) => humanBytes(v)} width={70} />
                <Tooltip formatter={(v) => humanBytes(Number(v))} contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="down" name="Download" stroke="#dc2626" strokeWidth={2} fill="url(#scDlGrad)" />
                <Area type="monotone" dataKey="up" name="Upload" stroke="#16a34a" strokeWidth={2} fill="url(#scUlGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Speed history */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Speed history</CardTitle>
          <CardDescription className="text-xs">Average throughput for your recent sessions</CardDescription>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
            </div>
          ) : query.isError ? (
            <ScErrorState onRetry={() => query.refetch()} message={query.error instanceof Error ? query.error.message : undefined} />
          ) : (data?.speedHistory ?? []).length === 0 ? (
            <ScEmptyState
              icon={WifiOff}
              title="No sessions recorded yet"
              hint="Usage appears once your connection starts passing traffic."
            />
          ) : (
            <div className="max-h-96 overflow-y-auto cryptsk-scrollbar rounded-lg border">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead>Started</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Avg down</TableHead>
                    <TableHead>Avg up</TableHead>
                    <TableHead className="hidden md:table-cell">Access node</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.speedHistory ?? []).map((s, i) => (
                    <TableRow key={`${s.startedAt}-${i}`} className="hover:bg-muted/50">
                      <TableCell>
                        <p className="text-xs font-medium">{fmtDateTime(s.startedAt)}</p>
                        <p className="text-[10px] text-muted-foreground">{relTime(s.startedAt)}</p>
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {s.stoppedAt ? formatDuration(s.durationSec) : (
                          <Badge variant="outline" className="gap-1 border-emerald-500/30 text-[10px] text-emerald-600 dark:text-emerald-400">
                            <span className="size-1.5 rounded-full bg-emerald-500 cryptsk-pulse-dot" aria-hidden="true" />
                            Live
                          </Badge>
                        )}
                      </TableCell>
                      <SpeedCell value={num(s.avgDownMbps)} max={maxMbps} className="text-red-600 dark:text-red-400 bg-red-500/70" />
                      <SpeedCell value={num(s.avgUpMbps)} max={maxMbps} className="text-emerald-600 dark:text-emerald-400 bg-emerald-500/70" />
                      <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                        {s.nasName || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SpeedCell({ value, max, className }: { value: number; max: number; className: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <TableCell>
      <div className="flex items-center gap-2">
        <span className="w-16 text-xs tabular-nums">{value.toFixed(1)} Mbps</span>
        <span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-muted sm:block" aria-hidden="true">
          <span className={cn("block h-full rounded-full", className)} style={{ width: `${pct}%` }} />
        </span>
      </div>
    </TableCell>
  );
}

// ============================================================
// TAB 3 — Billing
// ============================================================

function BillingTab({ customerId }: { customerId: string | null }) {
  const [selectedInvoice, setSelectedInvoice] = React.useState<InvoiceRow | null>(null);

  const query = useQuery<BillingData>({
    queryKey: ["selfcare", "billing", customerId],
    queryFn: () => apiRequest(`/api/selfcare/billing?customerId=${encodeURIComponent(customerId ?? "")}`) as Promise<BillingData>,
    enabled: !!customerId,
    refetchInterval: 60000,
    staleTime: 50000,
    retry: 1,
  });

  if (!customerId) return null;

  const data = query.data;
  const outstanding = num(data?.totals?.outstanding);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <ScStatChip label="Invoiced" value={formatINR(num(data?.totals?.invoiced))} icon={FileText} />
        <ScStatChip label="Paid" value={formatINR(num(data?.totals?.paid))} icon={CheckCircle2} />
        <ScStatChip label="Outstanding" value={formatINR(outstanding)} danger={outstanding > 0} icon={IndianRupee} />
      </div>

      {/* Invoices */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Invoices</CardTitle>
          <CardDescription className="text-xs">Click an invoice for the charge breakdown</CardDescription>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
          ) : query.isError ? (
            <ScErrorState onRetry={() => query.refetch()} message={query.error instanceof Error ? query.error.message : undefined} />
          ) : (data?.invoices ?? []).length === 0 ? (
            <ScEmptyState icon={FileText} title="No invoices yet" hint="Invoices appear here as soon as your first bill is generated." />
          ) : (
            <div className="max-h-96 overflow-y-auto cryptsk-scrollbar rounded-lg border">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Issued</TableHead>
                    <TableHead className="hidden sm:table-cell">Due</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="hidden text-right md:table-cell">Paid</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.invoices ?? []).map((inv) => (
                    <TableRow
                      key={inv.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedInvoice(inv)}
                      aria-label={`Open invoice ${inv.invoiceNumber}`}
                    >
                      <TableCell className="font-mono text-xs font-medium">{inv.invoiceNumber}</TableCell>
                      <TableCell><StatusBadge status={inv.status} map={MONEY_STATUS_BADGE} /></TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">{fmtDate(inv.createdAt)}</TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">{fmtDate(inv.dueDate)}</TableCell>
                      <TableCell className="text-right text-xs font-medium tabular-nums">{formatINR(inv.total)}</TableCell>
                      <TableCell className="hidden text-right text-xs tabular-nums md:table-cell">{formatINR(inv.paidAmount)}</TableCell>
                      <TableCell className={cn("text-right text-xs font-semibold tabular-nums", num(inv.balanceDue) > 0 && "text-red-600 dark:text-red-400")}>
                        {formatINR(inv.balanceDue)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payments */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Payments</CardTitle>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
          ) : query.isError ? (
            <ScErrorState onRetry={() => query.refetch()} message={query.error instanceof Error ? query.error.message : undefined} />
          ) : (data?.payments ?? []).length === 0 ? (
            <ScEmptyState icon={Wallet} title="No payments yet" hint="Once a payment is recorded against your account it will show up here." />
          ) : (
            <div className="max-h-96 overflow-y-auto cryptsk-scrollbar rounded-lg border">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead>Payment</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Received</TableHead>
                    <TableHead className="hidden md:table-cell">Invoice</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.payments ?? []).map((p) => {
                    const meta = methodMeta(p.method);
                    const MethodIcon = meta.icon;
                    return (
                      <TableRow key={p.id} className="hover:bg-muted/50">
                        <TableCell className="font-mono text-xs font-medium">{p.paymentNumber}</TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <MethodIcon className="size-3.5" aria-hidden="true" />
                            {meta.label}
                          </span>
                        </TableCell>
                        <TableCell><StatusBadge status={p.status} map={MONEY_STATUS_BADGE} /></TableCell>
                        <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
                          {relTime(p.receivedAt ?? p.paidAt)}
                        </TableCell>
                        <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                          {p.invoiceNumber || "—"}
                        </TableCell>
                        <TableCell className="text-right text-xs font-semibold tabular-nums">{formatINR(p.amount)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoice breakdown dialog */}
      <Dialog open={!!selectedInvoice} onOpenChange={(o) => !o && setSelectedInvoice(null)}>
        <DialogContent className="max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="font-mono text-base">{selectedInvoice?.invoiceNumber}</DialogTitle>
            <DialogDescription>Charge breakdown for this invoice</DialogDescription>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-1.5 text-sm">
              <BreakRow label="Status" value={<StatusBadge status={selectedInvoice.status} map={MONEY_STATUS_BADGE} />} />
              <BreakRow label="Line items" value={formatNumber(selectedInvoice._count?.items ?? 0)} />
              <BreakRow label="Issued" value={fmtDate(selectedInvoice.createdAt)} />
              <BreakRow label="Due" value={fmtDate(selectedInvoice.dueDate)} />
              <div className="my-2 h-px bg-border" role="separator" />
              <BreakRow label="Subtotal" value={formatINR(selectedInvoice.subtotal)} />
              <BreakRow label="Tax (GST)" value={formatINR(selectedInvoice.taxAmount)} />
              <div className="my-2 h-px bg-border" role="separator" />
              <BreakRow label="Total" value={formatINR(selectedInvoice.total)} strong />
              <BreakRow label="Paid" value={formatINR(selectedInvoice.paidAmount)} />
              <div className="my-2 h-px bg-border" role="separator" />
              <BreakRow
                label="Balance due"
                value={formatINR(selectedInvoice.balanceDue)}
                strong
                danger={num(selectedInvoice.balanceDue) > 0}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedInvoice(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BreakRow({ label, value, strong, danger }: {
  label: string; value: React.ReactNode; strong?: boolean; danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("tabular-nums", strong ? "font-semibold" : "text-xs", danger && "font-semibold text-red-600 dark:text-red-400")}>
        {value}
      </span>
    </div>
  );
}

// ============================================================
// TAB 4 — Support
// ============================================================

function SupportTab({ customerId, openTickets, isCustomer }: {
  customerId: string | null; openTickets: number; isCustomer: boolean;
}) {
  const [newTicketOpen, setNewTicketOpen] = React.useState(false);

  const query = useQuery<SupportData>({
    queryKey: ["selfcare", "support", customerId],
    queryFn: () => apiRequest(`/api/selfcare/support?customerId=${encodeURIComponent(customerId ?? "")}`) as Promise<SupportData>,
    enabled: !!customerId,
    refetchInterval: 60000,
    staleTime: 50000,
    retry: 1,
  });

  if (!customerId) return null;

  const tickets = query.data?.tickets ?? [];

  return (
    <div className="space-y-4">
      {isCustomer && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <MessageSquare className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div>
              <h2 className="text-base font-semibold tracking-tight">Support requests</h2>
              <p className="text-xs text-muted-foreground">
                {tickets.length === 0
                  ? "Raise a request and our team will follow up here."
                  : `${tickets.length} request${tickets.length === 1 ? "" : "s"} · ${openTickets} open`}
              </p>
            </div>
          </div>
          <Button
            className="h-11 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={() => setNewTicketOpen(true)}
          >
            <Plus className="size-4" aria-hidden="true" />
            New support request
          </Button>
        </div>
      )}

      {openTickets > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-400" role="status">
          <Clock className="size-4 shrink-0" aria-hidden="true" />
          You have {openTickets} open support request{openTickets === 1 ? "" : "s"} — our team is on it.
        </div>
      )}

      {query.isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}</div>
      ) : query.isError ? (
        <ScErrorState onRetry={() => query.refetch()} message={query.error instanceof Error ? query.error.message : undefined} />
      ) : tickets.length === 0 ? (
        <Card>
          <ScEmptyState
            icon={LifeBuoy}
            title="No support requests"
            hint="We're here if you need us — raise a request any time and our team will follow up."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <Card key={t.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-muted-foreground">{t.ticketNumber}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={t.subject}>{t.subject}</span>
                  <StatusBadge status={t.status} map={TICKET_STATUS_BADGE} />
                  <Badge variant="outline" className={cn("text-[10px] capitalize", PRIORITY_BADGE[(t.priority || "").toLowerCase()] || PRIORITY_BADGE.low)}>
                    {t.priority || "—"}
                  </Badge>
                </div>

                {t.description && (
                  <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-2.5 text-xs text-muted-foreground">{t.description}</p>
                )}

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                  <span>Raised {relTime(t.createdAt)}</span>
                  {t.category && <span>· {t.category.replace(/_/g, " ")}</span>}
                  {!t.resolvedAt && t.slaDueAt && <span>· reply expected {relTime(t.slaDueAt)}</span>}
                  {t.resolvedAt && <span className="text-emerald-600 dark:text-emerald-400">· resolved {relTime(t.resolvedAt)}</span>}
                </div>

                {t.replies.length > 0 && (
                  <div className="space-y-2 border-t pt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Conversation ({t.replies.length})
                    </p>
                    {t.replies.map((r, i) => (
                      <div key={`${t.id}-reply-${i}`} className="rounded-md border bg-card p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold">{r.authorName || "Support team"}</span>
                          <span className="text-[10px] text-muted-foreground">{relTime(r.createdAt)}</span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{r.message}</p>
                      </div>
                    ))}
                  </div>
                )}

                {isCustomer && (
                  <div className="border-t pt-3">
                    <ScTicketReplyBox ticketId={t.id} ticketStatus={t.status} />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {isCustomer && <ScNewTicketDialog open={newTicketOpen} onOpenChange={setNewTicketOpen} />}
    </div>
  );
}

// ---------- Support write actions (T7 — customer mode only) ----------

// New support request dialog (T7-a contract: POST /api/selfcare/support).
// Category/priority choices deliberately exclude "critical".
function ScNewTicketDialog({ open, onOpenChange }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [subject, setSubject] = React.useState("");
  const [category, setCategory] = React.useState("technical");
  const [priority, setPriority] = React.useState("medium");
  const [description, setDescription] = React.useState("");
  const [showErrors, setShowErrors] = React.useState(false);

  const subjectTrimmed = subject.trim();
  const descriptionTrimmed = description.trim();
  const subjectError = subjectTrimmed !== "" && subjectTrimmed.length < 3
    ? "Subject must be at least 3 characters."
    : null;
  const descriptionError = descriptionTrimmed !== "" && descriptionTrimmed.length < 5
    ? "Please describe the issue in at least 5 characters."
    : null;
  const formValid = subjectTrimmed.length >= 3 && descriptionTrimmed.length >= 5;

  const mutation = useMutation({
    mutationFn: () =>
      apiMutate("/api/selfcare/support", "POST", {
        subject: subjectTrimmed,
        category,
        priority,
        description: descriptionTrimmed,
      }) as Promise<ScNewTicketResponse>,
    onSuccess: (data) => {
      toast({
        title: "Request submitted",
        description: `${data.ticket.ticketNumber} — our team will respond.`,
      });
      onOpenChange(false);
      setSubject("");
      setCategory("technical");
      setPriority("medium");
      setDescription("");
      setShowErrors(false);
      qc.invalidateQueries({ queryKey: ["selfcare", "support"] });
      qc.invalidateQueries({ queryKey: ["selfcare", "overview"] });
    },
    onError: (err: Error) =>
      toast({ title: "Could not submit request", description: err.message, variant: "destructive" }),
  });

  function handleSubmit() {
    setShowErrors(true);
    if (!formValid || mutation.isPending) return;
    mutation.mutate();
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) setShowErrors(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New support request</DialogTitle>
          <DialogDescription>
            Describe the issue and our team will respond in this thread.
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sc-ticket-subject">Subject</Label>
            <Input
              id="sc-ticket-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={150}
              required
              autoComplete="off"
              placeholder="e.g. Wi-Fi keeps disconnecting every evening"
              className="h-11"
              aria-label="Subject"
              aria-invalid={showErrors && !!subjectError}
              disabled={mutation.isPending}
            />
            {showErrors && subjectError && (
              <p className="text-xs text-red-600 dark:text-red-400" role="alert">{subjectError}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sc-ticket-category">Category</Label>
              <Select value={category} onValueChange={setCategory} disabled={mutation.isPending}>
                <SelectTrigger id="sc-ticket-category" className="h-11" aria-label="Category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="complaint">Complaint</SelectItem>
                  <SelectItem value="technical">Technical</SelectItem>
                  <SelectItem value="billing">Billing</SelectItem>
                  <SelectItem value="installation">Installation</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sc-ticket-priority">Priority</Label>
              <Select value={priority} onValueChange={setPriority} disabled={mutation.isPending}>
                <SelectTrigger id="sc-ticket-priority" className="h-11" aria-label="Priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="sc-ticket-description">Description</Label>
              <span className="text-[10px] tabular-nums text-muted-foreground">{description.length} / 4000</span>
            </div>
            <Textarea
              id="sc-ticket-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={4000}
              rows={5}
              required
              placeholder="What's happening, since when, and anything you've already tried…"
              aria-label="Description"
              aria-invalid={showErrors && !!descriptionError}
              disabled={mutation.isPending}
            />
            {showErrors && descriptionError && (
              <p className="text-xs text-red-600 dark:text-red-400" role="alert">{descriptionError}</p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="h-11 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={mutation.isPending}
            >
              {mutation.isPending
                ? <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                : <Send className="size-4" aria-hidden="true" />}
              {mutation.isPending ? "Submitting…" : "Submit request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Per-ticket reply composer — own state per ticket so each conversation
// composes independently (T7-a contract: POST /api/selfcare/support/{id}/replies).
function ScTicketReplyBox({ ticketId, ticketStatus }: { ticketId: string; ticketStatus: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [message, setMessage] = React.useState("");
  const trimmed = message.trim();

  const mutation = useMutation({
    mutationFn: () =>
      apiMutate(`/api/selfcare/support/${encodeURIComponent(ticketId)}/replies`, "POST", {
        message: trimmed,
      }) as Promise<ScReplyResponse>,
    onSuccess: () => {
      toast({ title: "Reply sent", description: "Your message was added to the conversation." });
      setMessage("");
      // A reply to a resolved/closed ticket reopens it — openTickets may change.
      qc.invalidateQueries({ queryKey: ["selfcare", "support"] });
      qc.invalidateQueries({ queryKey: ["selfcare", "overview"] });
    },
    onError: (err: Error) =>
      toast({ title: "Could not send reply", description: err.message, variant: "destructive" }),
  });

  const willReopen = ticketStatus === "resolved" || ticketStatus === "closed";

  return (
    <div className="rounded-md border bg-card p-2.5">
      <form
        noValidate
        onSubmit={(e) => { e.preventDefault(); if (trimmed && !mutation.isPending) mutation.mutate(); }}
        className="space-y-2"
      >
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={4000}
          rows={2}
          placeholder="Write a reply to our team…"
          aria-label="Write a reply"
          disabled={mutation.isPending}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] tabular-nums text-muted-foreground">{message.length} / 4000</span>
          <Button
            type="submit"
            size="sm"
            className="h-11 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={mutation.isPending || trimmed.length === 0}
          >
            {mutation.isPending
              ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              : <Send className="size-3.5" aria-hidden="true" />}
            Send reply
          </Button>
        </div>
      </form>
      {willReopen && (
        <p className="mt-1.5 flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400" role="status">
          <Info className="size-3 shrink-0" aria-hidden="true" />
          Sending a reply will reopen this request.
        </p>
      )}
    </div>
  );
}

// ============================================================
// TAB 5 — Profile
// ============================================================

function ProfileTab({ subscriberId, isCustomer, portalEmail }: {
  subscriberId: string | null; isCustomer: boolean; portalEmail: string | null;
}) {
  const query = useQuery<ProfileData>({
    // staff: scoped to the picked subscriber — customer (subscriberId null):
    // NO subscriberId param, the backend auto-picks their own subscriber.
    queryKey: ["selfcare", "profile", subscriberId ?? "self"],
    queryFn: () =>
      (subscriberId
        ? apiRequest(`/api/selfcare/profile?subscriberId=${encodeURIComponent(subscriberId)}`)
        : apiRequest("/api/selfcare/profile")) as Promise<ProfileData>,
    enabled: subscriberId !== "",
    refetchInterval: 60000,
    staleTime: 50000,
    retry: 1,
  });

  if (query.isLoading) return <TabSkeleton />;
  if (query.isError) {
    return <ScErrorState onRetry={() => query.refetch()} message={query.error instanceof Error ? query.error.message : undefined} />;
  }

  const data = query.data;
  if (!data) return null;
  const { customer, subscriber } = data;
  const hasCompany = !!(customer.companyName || customer.gstin || customer.pan);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Identity + contacts */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary">
              {initialsOf(customer.displayName || "?")}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-bold tracking-tight">{customer.displayName}</h2>
              </div>
              {customer.kycVerified ? (
                <Badge variant="outline" className="mt-1 gap-1 border-emerald-500/30 text-[10px] text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-3" aria-hidden="true" /> Verified
                </Badge>
              ) : (
                <Badge variant="outline" className="mt-1 gap-1 border-amber-500/30 text-[10px] text-amber-600 dark:text-amber-400">
                  <Hourglass className="size-3" aria-hidden="true" /> Pending verification
                </Badge>
              )}
            </div>
          </div>

          {isCustomer ? (
            <ScContactEditor
              email={customer.email}
              phone={customer.phone}
              whatsappNumber={customer.whatsappNumber}
            />
          ) : (
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <InfoField label="Email" value={customer.email} />
              <InfoField label="Phone" value={customer.phone} />
              <InfoField label="WhatsApp" value={customer.whatsappNumber} />
            </div>
          )}

          {hasCompany && (
            <>
              <div className="my-4 h-px bg-border" role="separator" />
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Business details</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <InfoField label="Company" value={customer.companyName} />
                <InfoField label="GSTIN" value={customer.gstin} mono />
                <InfoField label="PAN" value={customer.pan} mono />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Service details */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Service details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InfoField label="Subscriber ID" value={subscriber.subscriberCode} mono />
          <InfoField label="Username" value={subscriber.radiusUsername} mono />
          <div>
            <p className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">Status</p>
            <StatusBadge status={subscriber.status} map={SERVICE_STATUS_BADGE} />
          </div>
          <InfoField label="Activated" value={fmtDate(subscriber.activatedAt)} />
          <InfoField label="Expires" value={fmtDate(subscriber.expiresAt)} />
          <InfoField label="Static IP" value={subscriber.staticIp} mono />
          <InfoField label="VLAN" value={subscriber.vlanId != null ? String(subscriber.vlanId) : null} mono />
        </CardContent>
      </Card>

      {/* Addresses */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Addresses</CardTitle>
        </CardHeader>
        <CardContent>
          {(customer.addresses ?? []).length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">No addresses on record.</p>
          ) : (
            <ul className="space-y-3">
              {(customer.addresses ?? []).map((a) => (
                <li key={a.id} className="text-sm">
                  <div className="mb-0.5 flex items-center gap-2">
                    <Badge variant="outline" className="text-[9px] uppercase">{a.type}</Badge>
                    {a.isPrimary && (
                      <Badge variant="outline" className="border-emerald-500/30 text-[9px] text-emerald-600 dark:text-emerald-400">
                        primary
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {[a.line1, a.line2, a.city, a.state, a.postalCode, a.country].filter(Boolean).join(", ")}
                    {a.landmark ? ` · near ${a.landmark}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Contacts */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Additional contacts</CardTitle>
        </CardHeader>
        <CardContent>
          {(customer.contacts ?? []).length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">No additional contacts on record.</p>
          ) : (
            <ul className="space-y-2">
              {(customer.contacts ?? []).map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant="outline" className="text-[9px] uppercase">{c.type}</Badge>
                  <span className="font-mono text-xs">{c.value}</span>
                  {c.label && <span className="text-xs text-muted-foreground">({c.label})</span>}
                  {c.isPrimary && (
                    <Badge variant="outline" className="border-emerald-500/30 text-[9px] text-emerald-600 dark:text-emerald-400">
                      primary
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Sign-in & security — customer write action (T7), 5th card */}
      {isCustomer && <ScSecurityCard portalEmail={portalEmail} />}
    </div>
  );
}

// ---------- Profile write actions (T7 — customer mode only) ----------

// Contact details block — read view + inline edit form (T7-a contract:
// PATCH /api/selfcare/profile). Customer mode only; staff keeps the
// plain read-only InfoFields.
function ScContactEditor({ email, phone, whatsappNumber }: {
  email: string | null; phone: string | null; whatsappNumber: string | null;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = React.useState(false);
  const [emailDraft, setEmailDraft] = React.useState("");
  const [phoneDraft, setPhoneDraft] = React.useState("");
  const [whatsappDraft, setWhatsappDraft] = React.useState("");
  const [showErrors, setShowErrors] = React.useState(false);

  const trimmedEmail = emailDraft.trim();
  const emailFormatError = trimmedEmail !== "" && !/^\S+@\S+\.\S+$/.test(trimmedEmail)
    ? "Enter a valid email address."
    : null;
  const formValid = emailFormatError === null;

  const mutation = useMutation({
    // Always send all three fields (phone/WhatsApp may be cleared to "").
    mutationFn: () =>
      apiMutate("/api/selfcare/profile", "PATCH", {
        email: trimmedEmail,
        phone: phoneDraft.trim(),
        whatsappNumber: whatsappDraft.trim(),
      }) as Promise<ScProfileUpdateResponse>,
    onSuccess: () => {
      toast({ title: "Contact details updated", description: "Your contact information has been saved." });
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["selfcare", "profile"] });
      qc.invalidateQueries({ queryKey: ["selfcare", "overview"] });
    },
    onError: (err: Error) =>
      toast({ title: "Could not update contact details", description: err.message, variant: "destructive" }),
  });

  function startEdit() {
    setEmailDraft(email ?? "");
    setPhoneDraft(phone ?? "");
    setWhatsappDraft(whatsappNumber ?? "");
    setShowErrors(false);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setShowErrors(false);
  }

  function handleSave() {
    setShowErrors(true);
    if (!formValid || mutation.isPending) return;
    mutation.mutate();
  }

  if (!editing) {
    return (
      <div className="mt-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Contact details</p>
          <Button
            variant="ghost"
            size="sm"
            className="h-11 gap-1.5 px-3 text-xs"
            onClick={startEdit}
            aria-label="Edit contact details"
          >
            <Pencil className="size-3.5" aria-hidden="true" /> Edit
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <InfoField label="Email" value={email} />
          <InfoField label="Phone" value={phone} />
          <InfoField label="WhatsApp" value={whatsappNumber} />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Edit contact details</p>
      <form noValidate onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="sc-contact-email">Email</Label>
            <Input
              id="sc-contact-email"
              type="email"
              value={emailDraft}
              onChange={(e) => setEmailDraft(e.target.value)}
              className="mt-1 h-11"
              placeholder="you@example.com"
              autoComplete="email"
              aria-label="Email"
              aria-invalid={showErrors && !!emailFormatError}
              disabled={mutation.isPending}
            />
            {showErrors && emailFormatError && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">{emailFormatError}</p>
            )}
          </div>
          <div>
            <Label htmlFor="sc-contact-phone">Phone</Label>
            <Input
              id="sc-contact-phone"
              type="tel"
              value={phoneDraft}
              onChange={(e) => setPhoneDraft(e.target.value)}
              className="mt-1 h-11"
              placeholder="Optional"
              autoComplete="tel"
              aria-label="Phone"
              disabled={mutation.isPending}
            />
          </div>
          <div>
            <Label htmlFor="sc-contact-whatsapp">WhatsApp</Label>
            <Input
              id="sc-contact-whatsapp"
              type="tel"
              value={whatsappDraft}
              onChange={(e) => setWhatsappDraft(e.target.value)}
              className="mt-1 h-11"
              placeholder="Optional"
              aria-label="WhatsApp number"
              disabled={mutation.isPending}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            className="h-11 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={mutation.isPending}
          >
            {mutation.isPending
              ? <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              : <Check className="size-4" aria-hidden="true" />}
            Save
          </Button>
          <Button type="button" variant="outline" className="h-11 gap-1.5" onClick={cancelEdit} disabled={mutation.isPending}>
            <X className="size-4" aria-hidden="true" /> Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

// Sign-in & security — portal identity + password change (T7-a contract:
// POST /api/selfcare/account/password). Customer mode only.
function ScSecurityCard({ portalEmail }: { portalEmail: string | null }) {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showPasswords, setShowPasswords] = React.useState(false);
  const [submitAttempted, setSubmitAttempted] = React.useState(false);

  const currentError = submitAttempted && currentPassword === ""
    ? "Enter your current password."
    : null;
  const shortError = newPassword !== "" && newPassword.length < 8
    ? "New password must be at least 8 characters."
    : null;
  const sameError = currentPassword !== "" && newPassword !== "" && newPassword === currentPassword
    ? "New password must be different from the current password."
    : null;
  const confirmError = confirmPassword !== "" && newPassword !== confirmPassword
    ? "Passwords do not match."
    : null;
  const formValid =
    currentPassword !== "" &&
    newPassword.length >= 8 &&
    newPassword !== currentPassword &&
    newPassword === confirmPassword;

  const strength = passwordStrength(newPassword);

  const mutation = useMutation({
    mutationFn: () =>
      apiMutate("/api/selfcare/account/password", "POST", {
        currentPassword,
        newPassword,
      }) as Promise<{ ok: boolean }>,
    onSuccess: () => {
      toast({ title: "Password updated", description: "Use your new password next time you sign in." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowPasswords(false);
      setSubmitAttempted(false);
    },
    onError: (err: Error) =>
      toast({ title: "Could not update password", description: err.message, variant: "destructive" }),
  });

  function handleSubmit() {
    setSubmitAttempted(true);
    if (!formValid || mutation.isPending) return;
    mutation.mutate();
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          Sign-in &amp; security
        </CardTitle>
        <CardDescription className="text-xs">
          {portalEmail ? (
            <>Signed in as <span className="font-medium text-foreground">{portalEmail}</span> — change your portal password below.</>
          ) : (
            "Change the password you use to sign in to this portal."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form noValidate onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="max-w-md space-y-3">
          <div>
            <ScPasswordInput
              id="sc-pw-current"
              label="Current password"
              value={currentPassword}
              onChange={setCurrentPassword}
              show={showPasswords}
              onToggle={() => setShowPasswords((v) => !v)}
              disabled={mutation.isPending}
              autoComplete="current-password"
              placeholder="Enter your current password"
            />
            {currentError && <p className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">{currentError}</p>}
          </div>

          <div>
            <ScPasswordInput
              id="sc-pw-new"
              label="New password"
              value={newPassword}
              onChange={setNewPassword}
              show={showPasswords}
              onToggle={() => setShowPasswords((v) => !v)}
              disabled={mutation.isPending}
              autoComplete="new-password"
              placeholder="At least 8 characters"
            />
            {newPassword !== "" && (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex h-1.5 flex-1 gap-1" aria-hidden="true">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className={cn("h-full flex-1 rounded-full", i < strength.filled ? strength.className : "bg-muted")}
                    />
                  ))}
                </div>
                <span className="w-10 text-right text-[10px] font-medium text-muted-foreground">{strength.label}</span>
              </div>
            )}
            {shortError && <p className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">{shortError}</p>}
            {sameError && <p className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">{sameError}</p>}
          </div>

          <div>
            <ScPasswordInput
              id="sc-pw-confirm"
              label="Confirm new password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              show={showPasswords}
              onToggle={() => setShowPasswords((v) => !v)}
              disabled={mutation.isPending}
              autoComplete="new-password"
              placeholder="Repeat the new password"
            />
            {confirmError && <p className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">{confirmError}</p>}
          </div>

          <Button
            type="submit"
            className="h-11 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={mutation.isPending}
          >
            {mutation.isPending
              ? <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              : <KeyRound className="size-4" aria-hidden="true" />}
            Update password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ScPasswordInput({ id, label, value, onChange, show, onToggle, disabled, autoComplete, placeholder }: {
  id: string; label: string; value: string; onChange: (value: string) => void;
  show: boolean; onToggle: () => void; disabled: boolean; autoComplete: string; placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          className="h-11 pr-11"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required
          aria-label={label}
          disabled={disabled}
        />
        <button
          type="button"
          className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={onToggle}
          aria-label={show ? "Hide passwords" : "Show passwords"}
          aria-pressed={show}
          disabled={disabled}
        >
          {show ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

function InfoField({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div>
      <p className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("break-words text-sm", mono ? "font-mono text-xs" : "")}>{value || "—"}</p>
    </div>
  );
}

// ============================================================
// TAB 6 — Service Status (T8-a: GET /api/selfcare/service-status)
// Subscriber-scoped and always read-only: staff preview passes the
// picked ?subscriberId= (mirrors usage/profile/plans), customer
// sessions send no params (the backend auto-picks their subscriber).
// Live RADIUS session, recent history and the lifecycle trail.
// Byte mapping follows the codebase convention (sessions/serialize.ts):
// acctinputoctets = UP, acctoutputoctets = DOWN.
// ============================================================

function ServiceStatusTab({ subscriberId }: { subscriberId: string | null }) {
  const query = useQuery<ServiceStatusData>({
    // staff: scoped to the picked subscriber — customer (subscriberId null):
    // NO subscriberId param, the backend auto-picks their own subscriber.
    queryKey: ["selfcare", "service-status", subscriberId ?? "self"],
    queryFn: () =>
      (subscriberId
        ? apiRequest(`/api/selfcare/service-status?subscriberId=${encodeURIComponent(subscriberId)}`)
        : apiRequest("/api/selfcare/service-status")) as Promise<ServiceStatusData>,
    enabled: subscriberId !== "",
    refetchInterval: 60000,
    staleTime: 50000,
    retry: 1,
  });

  if (query.isLoading) return <TabSkeleton />;
  if (query.isError) {
    return <ScErrorState onRetry={() => query.refetch()} message={query.error instanceof Error ? query.error.message : undefined} />;
  }

  const data = query.data;
  if (!data) return null;
  const { subscriber, activeSession } = data;
  const staticIp = subscriber.staticIp && subscriber.staticIp.trim() !== "" ? subscriber.staticIp : null;

  return (
    <div className="space-y-4">
      {/* Hero — identity + subscriber status + live connection indicator */}
      <Card className="cryptsk-card-load">
        <CardContent className="p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Connection status</p>
              <h2 className="mt-1 truncate text-lg font-bold tracking-tight">
                {subscriber.fullName || subscriber.radiusUsername}
              </h2>
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">{subscriber.subscriberCode}</p>
              <div className="mt-2">
                <StatusBadge status={subscriber.status} map={SERVICE_STATUS_BADGE} />
              </div>
            </div>
            {data.online ? (
              <div
                className="inline-flex shrink-0 items-center gap-2.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5"
                role="status"
                aria-label="Connection status: online now"
              >
                <span className="size-2.5 rounded-full bg-emerald-500 cryptsk-pulse-dot" aria-hidden="true" />
                <span className="text-base font-semibold text-emerald-600 dark:text-emerald-400">Online now</span>
              </div>
            ) : (
              <div
                className="inline-flex shrink-0 items-center gap-2.5 rounded-full border border-slate-400/40 bg-slate-500/10 px-4 py-2.5"
                role="status"
                aria-label="Connection status: offline"
              >
                <span className="size-2.5 rounded-full bg-slate-400" aria-hidden="true" />
                <span className="text-base font-semibold text-slate-600 dark:text-slate-400">Offline</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Plan + connection details */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Broadband plan</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn("font-semibold", subscriber.plan ? "text-base" : "text-sm text-muted-foreground")}>
              {subscriber.plan ? subscriber.plan.name : "No plan assigned to this connection yet"}
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InfoField label="Billing cycle" value={subscriber.plan ? cycleLabel(subscriber.plan.billingCycle) : null} />
              <InfoField
                label="Data limit"
                value={subscriber.plan ? (subscriber.plan.dataLimitGb ? `${subscriber.plan.dataLimitGb} GB` : "Unlimited") : null}
              />
              <InfoField label="Username" value={subscriber.radiusUsername} mono />
              {staticIp && <InfoField label="Static IP" value={staticIp} mono />}
              {subscriber.vlanId != null && <InfoField label="VLAN" value={String(subscriber.vlanId)} mono />}
            </div>
          </CardContent>
        </Card>

        {/* Live session — or an honest offline state */}
        {activeSession ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Wifi className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                Live session
              </CardTitle>
              <CardDescription className="text-xs">Connected since {relTime(activeSession.startedAt)}</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <InfoField label="Duration" value={formatDuration(num(activeSession.durationSeconds))} />
              <InfoField label="IP address" value={activeSession.ipAddress} mono />
              <InfoField label="Access node" value={activeSession.nas} />
              <InfoField label="Data down" value={humanBytes(num(activeSession.outputOctets))} />
              <InfoField label="Data up" value={humanBytes(num(activeSession.inputOctets))} />
              {activeSession.calledStationId && (
                <InfoField label="Called station" value={activeSession.calledStationId} mono />
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <ScEmptyState
              icon={WifiOff}
              title="No active session"
              hint="When your router connects, live session details appear here."
            />
          </Card>
        )}
      </div>

      {/* Recent sessions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Recent sessions</CardTitle>
        </CardHeader>
        <CardContent>
          {(data.recentSessions ?? []).length === 0 ? (
            <ScEmptyState
              icon={WifiOff}
              title="No recent sessions"
              hint="Session history appears here once your connection has been active."
            />
          ) : (
            <div className="max-h-96 overflow-y-auto cryptsk-scrollbar rounded-lg border">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead>Started</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead className="hidden sm:table-cell">IP address</TableHead>
                    <TableHead className="text-right">Down / Up</TableHead>
                    <TableHead className="hidden md:table-cell">Ended</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentSessions.map((s, i) => (
                    <TableRow key={`${s.startedAt}-${i}`} className="hover:bg-muted/50">
                      <TableCell>
                        <p className="text-xs font-medium">{fmtDateTime(s.startedAt)}</p>
                        <p className="text-[10px] text-muted-foreground">{relTime(s.startedAt)}</p>
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {s.stoppedAt ? formatDuration(num(s.durationSeconds)) : (
                          <Badge variant="outline" className="gap-1 border-emerald-500/30 text-[10px] text-emerald-600 dark:text-emerald-400">
                            <span className="size-1.5 rounded-full bg-emerald-500 cryptsk-pulse-dot" aria-hidden="true" />
                            Live
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">
                        {s.ipAddress || "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        <span className="text-red-600 dark:text-red-400">{humanBytes(num(s.outputOctets))}</span>
                        <span className="text-muted-foreground"> / </span>
                        <span className="text-emerald-600 dark:text-emerald-400">{humanBytes(num(s.inputOctets))}</span>
                      </TableCell>
                      <TableCell className="hidden text-[10px] text-muted-foreground md:table-cell">
                        {terminateCauseLabel(s.terminateCause)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lifecycle timeline */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Service lifecycle</CardTitle>
          <CardDescription className="text-xs">Status changes recorded for your connection</CardDescription>
        </CardHeader>
        <CardContent>
          {(data.lifecycle ?? []).length === 0 ? (
            <ScEmptyState
              icon={Hourglass}
              title="No status changes yet"
              hint="Lifecycle events appear here whenever your service status changes."
            />
          ) : (
            <ol className="relative space-y-4 border-l pl-5">
              {data.lifecycle.map((ev) => (
                <li key={ev.id} className="relative">
                  <span
                    className="absolute -left-[25px] top-1.5 size-2.5 rounded-full bg-slate-400 ring-4 ring-background"
                    aria-hidden="true"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={ev.state} map={SERVICE_STATUS_BADGE} />
                    <span className="text-xs text-muted-foreground">
                      {ev.previousState
                        ? `${ev.previousState.replace(/_/g, " ")} → ${ev.state.replace(/_/g, " ")}`
                        : "Initial state"}
                    </span>
                    <span className="ml-auto text-[10px] text-muted-foreground">{relTime(ev.changedAt)}</span>
                  </div>
                  {ev.reason && <p className="mt-1 text-xs text-muted-foreground">{ev.reason}</p>}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// TAB 7 — Payments (T8-a: GET /api/selfcare/wallet,
// POST /api/selfcare/vouchers/redeem, POST /api/selfcare/wallet/pay)
// The wallet summary and ledger read in both modes (staff preview is
// read-only); voucher redemption and paying invoices from the wallet
// are customer-only writes — gated on isCustomer exactly like T7
// (the backend 403s staff sessions regardless).
// ============================================================

// Invoice statuses the backend accepts for wallet payment — keep in
// sync with PAYABLE_STATUSES in /api/selfcare/wallet/pay (T8-a).
const PAYABLE_INVOICE_STATUSES = ["issued", "sent", "partial", "overdue"];

function PaymentsTab({ customerId, isCustomer }: { customerId: string | null; isCustomer: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const walletQuery = useQuery<WalletData>({
    queryKey: isCustomer ? ["selfcare", "wallet", "self", customerId] : ["selfcare", "wallet", customerId],
    queryFn: () =>
      (isCustomer
        ? apiRequest("/api/selfcare/wallet")
        : apiRequest(`/api/selfcare/wallet?customerId=${encodeURIComponent(customerId ?? "")}`)) as Promise<WalletData>,
    enabled: !!customerId,
    refetchInterval: 60000,
    staleTime: 50000,
    retry: 1,
  });

  // Outstanding invoices reuse the SAME billing query the Billing tab
  // uses (shared key → shared cache; no separate endpoint invented).
  const billingQuery = useQuery<BillingData>({
    queryKey: ["selfcare", "billing", customerId],
    queryFn: () => apiRequest(`/api/selfcare/billing?customerId=${encodeURIComponent(customerId ?? "")}`) as Promise<BillingData>,
    enabled: !!customerId,
    refetchInterval: 60000,
    staleTime: 50000,
    retry: 1,
  });

  // Pay an invoice in full from the wallet (customer mode only —
  // staff sessions never see the button, the backend 403s them too).
  const payMutation = useMutation({
    mutationFn: (invoiceId: string) =>
      apiMutate("/api/selfcare/wallet/pay", "POST", { invoiceId }) as Promise<ScWalletPayResponse>,
    onSuccess: (data) => {
      toast({ title: "Payment successful", description: `${data.invoice.invoiceNumber} settled` });
      // Wallet balance, the billing invoice list and the overview's
      // outstanding figure all move together after a payment.
      qc.invalidateQueries({ queryKey: ["selfcare", "wallet"] });
      qc.invalidateQueries({ queryKey: ["selfcare", "billing"] });
      qc.invalidateQueries({ queryKey: ["selfcare", "overview"] });
    },
    onError: (err: Error) =>
      toast({ title: "Payment failed", description: err.message, variant: "destructive" }),
  });

  if (!customerId) return null;

  const wallet = walletQuery.data?.wallet ?? null;
  const walletBalance = num(wallet?.balance);
  const transactions = walletQuery.data?.transactions ?? [];
  const outstanding = (billingQuery.data?.invoices ?? []).filter(
    (inv) => num(inv.balanceDue) > 0 && PAYABLE_INVOICE_STATUSES.includes((inv.status || "").toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className={cn("grid gap-4", isCustomer && "lg:grid-cols-2")}>
        {/* Wallet summary */}
        <Card className="cryptsk-card-load">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Wallet className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              Wallet
            </CardTitle>
            <CardDescription className="text-xs">Prepaid balance for instant invoice payments</CardDescription>
          </CardHeader>
          <CardContent>
            {walletQuery.isLoading ? (
              <div className="space-y-2" aria-busy="true">
                <Skeleton className="h-9 w-40" />
                <Skeleton className="h-4 w-56" />
              </div>
            ) : walletQuery.isError ? (
              <ScErrorState onRetry={() => walletQuery.refetch()} message={walletQuery.error instanceof Error ? walletQuery.error.message : undefined} />
            ) : wallet ? (
              <>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-3xl font-bold tabular-nums">{formatINR(walletBalance)}</span>
                  {wallet.currency && (
                    <Badge variant="outline" className="text-[10px] font-medium">{wallet.currency}</Badge>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                  <span>Minimum balance {formatINR(num(wallet.minBalance))}</span>
                  {wallet.autoRecharge && (
                    <Badge variant="outline" className="gap-1 border-emerald-500/30 text-[10px] text-emerald-600 dark:text-emerald-400">
                      <RefreshCw className="size-3" aria-hidden="true" />
                      Auto-recharge on
                    </Badge>
                  )}
                </div>
              </>
            ) : (
              <p className="py-2 text-sm text-muted-foreground">
                {isCustomer
                  ? "Your wallet is not activated yet — redeem a voucher to activate it."
                  : "This customer hasn\u2019t activated a wallet yet."}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Voucher redemption — customer-only write action */}
        {isCustomer && <ScVoucherRedeemCard />}
      </div>

      {/* Outstanding invoices */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Outstanding invoices</CardTitle>
          <CardDescription className="text-xs">Settle bills instantly from your wallet balance</CardDescription>
        </CardHeader>
        <CardContent>
          {billingQuery.isLoading ? (
            <div className="space-y-2" aria-busy="true">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : billingQuery.isError ? (
            <ScErrorState onRetry={() => billingQuery.refetch()} message={billingQuery.error instanceof Error ? billingQuery.error.message : undefined} />
          ) : outstanding.length === 0 ? (
            <ScEmptyState
              icon={CheckCircle2}
              title="No outstanding invoices"
              hint="You're all caught up — new bills appear here as soon as they're issued."
            />
          ) : (
            <ul className="divide-y rounded-lg border">
              {outstanding.map((inv) => {
                const due = num(inv.balanceDue);
                const isOverdue = (inv.status || "").toLowerCase() === "overdue";
                // No wallet (or a balance below the due amount) → the
                // backend would reject with "Insufficient wallet balance",
                // so the button is disabled up-front with a hint.
                const canAfford = wallet !== null && walletBalance >= due;
                const payingThis = payMutation.isPending && payMutation.variables === inv.id;
                return (
                  <li key={inv.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs font-semibold">{inv.invoiceNumber}</p>
                      <p className={cn("text-[10px] text-muted-foreground", isOverdue && "font-medium text-red-600 dark:text-red-400")}>
                        Due {fmtDate(inv.dueDate)}
                      </p>
                    </div>
                    <StatusBadge status={inv.status} map={MONEY_STATUS_BADGE} />
                    <p className="text-sm font-semibold tabular-nums">{formatINR(due)}</p>
                    {isCustomer && canAfford && (
                      <Button
                        size="sm"
                        className="h-11 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
                        disabled={payMutation.isPending}
                        onClick={() => payMutation.mutate(inv.id)}
                        aria-label={`Pay invoice ${inv.invoiceNumber} from wallet`}
                      >
                        {payingThis
                          ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                          : <Wallet className="size-3.5" aria-hidden="true" />}
                        Pay from wallet
                      </Button>
                    )}
                    {isCustomer && !canAfford && (
                      <span className="inline-flex flex-col items-end gap-0.5" title="Insufficient balance">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-11 gap-1.5"
                          disabled
                          aria-label={`Pay invoice ${inv.invoiceNumber} from wallet — insufficient balance`}
                        >
                          <Wallet className="size-3.5" aria-hidden="true" />
                          Pay from wallet
                        </Button>
                        <span className="text-[10px] text-amber-600 dark:text-amber-400" role="status">Insufficient balance</span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Wallet ledger */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Wallet transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {walletQuery.isLoading ? (
            <div className="space-y-2" aria-busy="true">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
          ) : walletQuery.isError ? (
            <ScErrorState onRetry={() => walletQuery.refetch()} message={walletQuery.error instanceof Error ? walletQuery.error.message : undefined} />
          ) : transactions.length === 0 ? (
            <ScEmptyState
              icon={Wallet}
              title="No wallet transactions yet"
              hint="Recharges, payments and refunds will appear here."
            />
          ) : (
            <div className="max-h-96 overflow-y-auto cryptsk-scrollbar rounded-lg border">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead className="hidden sm:table-cell">When</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Balance after</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((t) => {
                    const amt = num(t.amount);
                    const positive = amt >= 0;
                    return (
                      <TableRow key={t.id} className="hover:bg-muted/50">
                        <TableCell>
                          <StatusBadge status={t.type} map={WALLET_TXN_BADGE} />
                          {t.description && (
                            <p className="mt-0.5 max-w-56 truncate text-[10px] text-muted-foreground" title={t.description}>
                              {t.description}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
                          {relTime(t.createdAt)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right text-xs font-semibold tabular-nums",
                            positive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
                          )}
                        >
                          {positive ? "+" : "-"}{formatINR(Math.abs(amt))}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{formatINR(num(t.balanceAfter))}</TableCell>
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
  );
}

// Voucher redemption (T8-a contract: POST /api/selfcare/vouchers/redeem,
// customer mode only). The input is uppercased as the user types — the
// backend stores voucher codes uppercase — and server error strings
// ("Invalid or already used voucher code", "This voucher has expired")
// surface verbatim in the destructive toast via apiMutate.
function ScVoucherRedeemCard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [code, setCode] = React.useState("");

  const mutation = useMutation({
    mutationFn: () =>
      apiMutate("/api/selfcare/vouchers/redeem", "POST", { code: code.trim() }) as Promise<ScVoucherRedeemResponse>,
    onSuccess: (data) => {
      toast({
        title: "Voucher redeemed",
        description: `${formatINR(num(data.voucher.faceValue))} added to your wallet`,
      });
      setCode("");
      qc.invalidateQueries({ queryKey: ["selfcare", "wallet"] });
    },
    onError: (err: Error) =>
      toast({ title: "Could not redeem voucher", description: err.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Redeem a voucher</CardTitle>
        <CardDescription className="text-xs">
          Have a recharge voucher? Enter its code to top up your wallet.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          onSubmit={(e) => { e.preventDefault(); if (code.trim() !== "" && !mutation.isPending) mutation.mutate(); }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <Label htmlFor="sc-voucher-code" className="sr-only">Voucher code</Label>
          <Input
            id="sc-voucher-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Enter voucher code"
            className="h-11 flex-1 font-mono uppercase"
            autoComplete="off"
            maxLength={40}
            aria-label="Voucher code"
            disabled={mutation.isPending}
          />
          <Button
            type="submit"
            className="h-11 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={mutation.isPending || code.trim().length === 0}
            aria-label="Redeem voucher"
          >
            {mutation.isPending
              ? <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              : <Ticket className="size-4" aria-hidden="true" />}
            Redeem
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ============================================================
// TAB 8 — Plans
// ============================================================

function PlansTab({ subscriberId }: { subscriberId: string | null }) {
  const query = useQuery<PlansData>({
    // staff: scoped to the picked subscriber — customer (subscriberId null):
    // NO subscriberId param, the backend auto-picks their own subscriber.
    queryKey: ["selfcare", "plans", subscriberId ?? "self"],
    queryFn: () =>
      (subscriberId
        ? apiRequest(`/api/selfcare/plans?subscriberId=${encodeURIComponent(subscriberId)}`)
        : apiRequest("/api/selfcare/plans")) as Promise<PlansData>,
    enabled: subscriberId !== "",
    refetchInterval: 60000,
    staleTime: 50000,
    retry: 1,
  });

  if (query.isLoading) return <TabSkeleton />;
  if (query.isError) {
    return <ScErrorState onRetry={() => query.refetch()} message={query.error instanceof Error ? query.error.message : undefined} />;
  }

  const plans = query.data?.plans ?? [];
  const current = plans.find((p) => p.isCurrent || p.id === query.data?.currentPlanId) ?? null;
  const others = plans.filter((p) => !current || p.id !== current.id);

  if (plans.length === 0) {
    return (
      <Card>
        <ScEmptyState icon={PackageCheck} title="No plans published yet" hint="Available broadband plans will appear here for comparison." />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Current plan highlight */}
      {current && (
        <Card className="ring-2 ring-emerald-500/40">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-sm">{current.name}</CardTitle>
              <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/5 text-[10px] text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-3" aria-hidden="true" /> Current plan
              </Badge>
              {current.product?.name && (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">{current.product.name}</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-2xl font-bold tabular-nums">{formatINR(current.basePrice)}</span>
              <span className="text-xs text-muted-foreground">/ {cycleLabel(current.billingCycle)}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
              <Badge variant="outline" className="text-[10px]">
                {current.dataLimitGb ? `${current.dataLimitGb} GB data` : "Unlimited data"}
              </Badge>
              <Badge variant="outline" className="text-[10px]">GST {current.taxRate}%</Badge>
              {current.discountPercent > 0 && (
                <Badge variant="outline" className="border-amber-500/30 text-[10px] text-amber-600 dark:text-amber-400">
                  {current.discountPercent}% off
                </Badge>
              )}
              {current.setupFee === 0 ? (
                <Badge variant="outline" className="border-emerald-500/30 text-[10px] text-emerald-600 dark:text-emerald-400">
                  Setup waived
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px]">Setup {formatINR(current.setupFee)}</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Other plans grid — catalogue view only, no fake upgrade action */}
      {others.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {others.map((p) => (
            <Card key={p.id} className="flex flex-col">
              <CardContent className="flex flex-1 flex-col gap-2 p-4">
                <div>
                  <p className="text-sm font-semibold">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground">{p.product?.name || "Broadband"}</p>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg font-bold tabular-nums">{formatINR(p.basePrice)}</span>
                  <span className="text-[10px] text-muted-foreground">/ {cycleLabel(p.billingCycle)}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[10px]">
                  <Badge variant="outline" className="text-[10px]">
                    {p.dataLimitGb ? `${p.dataLimitGb} GB` : "Unlimited"}
                  </Badge>
                  {p.setupFee === 0 ? (
                    <Badge variant="outline" className="border-emerald-500/30 text-[10px] text-emerald-600 dark:text-emerald-400">
                      Setup waived
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">Setup {formatINR(p.setupFee)}</Badge>
                  )}
                  {p.discountPercent > 0 && (
                    <Badge variant="outline" className="border-amber-500/30 text-[10px] text-amber-600 dark:text-amber-400">
                      {p.discountPercent}% off
                    </Badge>
                  )}
                </div>
                <div className="mt-auto pt-2">
                  <a
                    href="#sc-plan-compare"
                    className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label={`Compare ${p.name} in the table below`}
                  >
                    Compare
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Comparison table — plans as columns */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm" id="sc-plan-compare">Compare plans</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto cryptsk-scrollbar rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Feature</TableHead>
                  {plans.map((p) => (
                    <TableHead key={p.id}>
                      <span className="flex items-center gap-1.5 text-xs">
                        {p.name}
                        {(current && p.id === current.id) && (
                          <span className="size-1.5 rounded-full bg-emerald-500" aria-label="Current plan" />
                        )}
                      </span>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="text-xs text-muted-foreground">Price</TableCell>
                  {plans.map((p) => (
                    <TableCell key={p.id} className="text-xs font-medium tabular-nums">{formatINR(p.basePrice)}</TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="text-xs text-muted-foreground">Billing cycle</TableCell>
                  {plans.map((p) => (
                    <TableCell key={p.id} className="text-xs capitalize">{cycleLabel(p.billingCycle)}</TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="text-xs text-muted-foreground">Data limit</TableCell>
                  {plans.map((p) => (
                    <TableCell key={p.id} className="text-xs">{p.dataLimitGb ? `${p.dataLimitGb} GB` : "Unlimited"}</TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="text-xs text-muted-foreground">Setup fee</TableCell>
                  {plans.map((p) => (
                    <TableCell key={p.id} className="text-xs tabular-nums">
                      {p.setupFee === 0
                        ? <span className="text-emerald-600 dark:text-emerald-400">Waived</span>
                        : formatINR(p.setupFee)}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="text-xs text-muted-foreground">GST</TableCell>
                  {plans.map((p) => (
                    <TableCell key={p.id} className="text-xs tabular-nums">{p.taxRate}%</TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
