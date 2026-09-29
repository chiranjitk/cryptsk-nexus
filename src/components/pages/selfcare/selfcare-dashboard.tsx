"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useSubscriberAuthStore, type SubscriberProfile, type UsageData, type InvoiceItem, type ServiceStatus } from "@/store/subscriber-auth-store";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Zap,
  Activity,
  ShieldCheck,
  Globe,
  Clock,
  ArrowDownToLine,
  ArrowUpFromLine,
  CreditCard,
  MessageSquarePlus,
  Download,
  RefreshCw,
  AlertTriangle,
  TrendingUp,
  Receipt,
  CalendarCheck,
  Eye,
  EyeOff,
  Lock,
  BarChart3,
  Loader2,
  KeyRound,
  CheckCircle2,
  FileText,
  Gauge,
  Server,
  ArrowRight,
  Wifi,
  WifiOff,
  AlertCircle,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────

import type { NavPage } from "./selfcare-layout";

interface SelfcareDashboardProps {
  onNavigate?: (page: NavPage) => void;
}

// ─── Helpers ──────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

function formatMB(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(1)} MB`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function usageColor(percentage: number): string {
  if (percentage >= 85) return "bg-red-500";
  if (percentage >= 60) return "bg-amber-500";
  return "bg-red-500";
}

function usageTextColor(percentage: number): string {
  if (percentage >= 85) return "text-red-600";
  if (percentage >= 60) return "text-amber-600";
  return "text-red-600";
}

function getNextBillingDate(billingStartDate: string | null): string | null {
  if (!billingStartDate) return null;
  const start = new Date(billingStartDate);
  const now = new Date();
  let next = new Date(now.getFullYear(), now.getMonth(), start.getDate());
  if (next <= now) {
    next.setMonth(next.getMonth() + 1);
  }
  return next.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

// ─── Gradient Icon Circle ────────────────────────────────────

function GradientIcon({ icon: Icon, from, to }: { icon: React.ElementType; from?: string; to?: string }) {
  return (
    <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${from || "from-red-500"} ${to || "to-red-700"} flex items-center justify-center flex-shrink-0`}>
      <Icon className="w-3.5 h-3.5 text-white" />
    </div>
  );
}

// ─── Data Hooks ───────────────────────────────────────────────

function useSubscriberData() {
  const { subscriber } = useSubscriberAuthStore();
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [outstandingBalance, setOutstandingBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [usageRes, statusRes, invoiceRes] = await Promise.allSettled([
        fetch("/api/subscriber-auth/usage"),
        fetch("/api/subscriber-auth/service-status"),
        fetch("/api/subscriber-auth/invoices?limit=5"),
      ]);

      if (usageRes.status === "fulfilled" && usageRes.value.ok) {
        const data = await usageRes.value.json();
        if (data.success) setUsage(data.data);
      }
      if (statusRes.status === "fulfilled" && statusRes.value.ok) {
        const data = await statusRes.value.json();
        if (data.success) setServiceStatus(data.data);
      }
      if (invoiceRes.status === "fulfilled" && invoiceRes.value.ok) {
        const data = await invoiceRes.value.json();
        if (data.success) {
          setInvoices(data.data || []);
          setOutstandingBalance(data.summary?.outstandingBalance || 0);
        }
      }
    } catch {
      setError("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return { subscriber, usage, serviceStatus, invoices, outstandingBalance, loading, error, refetch: fetchAll };
}

// ─── Skeleton Loader ──────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-32 w-full rounded-xl" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </div>
  );
}

// ─── Error State ──────────────────────────────────────────────

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
        <AlertTriangle className="w-7 h-7 text-destructive" />
      </div>
      <div className="text-center">
        <h3 className="font-semibold text-foreground">Failed to load data</h3>
        <p className="text-sm text-muted-foreground mt-1">{message}</p>
      </div>
      <Button variant="outline" onClick={onRetry} className="gap-2">
        <RefreshCw className="w-4 h-4" />
        Retry
      </Button>
    </div>
  );
}

// ─── Welcome Banner ───────────────────────────────────────────

function WelcomeBanner({ subscriber }: { subscriber: SubscriberProfile }) {
  return (
    <Card className="rounded-xl border-0 bg-gradient-to-r from-red-600 via-red-700 to-red-700 text-white overflow-hidden relative">
      <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-1/2 w-48 h-48 bg-white/5 rounded-full translate-y-1/2" />
      <CardContent className="py-6 px-6 relative z-10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-red-100 text-sm font-medium">
              Welcome back,
            </p>
            <h2 className="text-2xl font-bold mt-0.5">
              {subscriber.name}
            </h2>
            <p className="text-red-200/80 text-sm mt-1">
              {subscriber.plan
                ? `${subscriber.plan.name} · ↓${subscriber.plan.speedDown} Mbps / ↑${subscriber.plan.speedUp} Mbps`
                : "No active plan"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              className={`text-xs font-semibold px-2.5 py-0.5 border-0 ${
                subscriber.status === "ACTIVE"
                  ? "bg-red-500/30 text-red-100"
                  : subscriber.status === "SUSPENDED"
                    ? "bg-amber-500/30 text-amber-100"
                    : "bg-white/20 text-white/80"
              }`}
            >
              {subscriber.status}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Stat Card ────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
  iconBg,
  children,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  subValue?: string;
  iconBg: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm hover:shadow-md hover:scale-[1.02] transition-all duration-200">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {label}
            </p>
            <p className="text-xl font-bold text-foreground">{value}</p>
            {subValue && (
              <p className="text-xs text-muted-foreground">{subValue}</p>
            )}
            {children}
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Data Usage Mini Chart ────────────────────────────────────

function UsageMiniChart({ dailyUsage }: { dailyUsage: { date: string; total: number }[] }) {
  const last7 = dailyUsage.slice(-7);
  const maxVal = Math.max(...last7.map((d) => d.total), 1);

  return (
    <div className="flex items-end gap-1.5 h-20">
      {last7.map((d, i) => {
        const height = Math.max((d.total / maxVal) * 100, 4);
        return (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-[9px] text-muted-foreground tabular-nums">
              {formatMB(d.total)}
            </span>
            <div
              className="w-full rounded-sm bg-gradient-to-t from-red-600 to-red-400 transition-all duration-500 min-h-[4px]"
              style={{ height: `${height}%` }}
            />
            <span className="text-[9px] text-muted-foreground">
              {new Date(d.date).getDate()}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Usage Meter Gauge (SVG) ─────────────────────────────────

interface UsageMeterData {
  used: number;
  limit: number | null;
  percentage: number;
  remaining: number | null;
  daysLeft: number;
  dailyAverage: number;
  isUnlimited: boolean;
  downloadGb: number;
  uploadGb: number;
}

function UsageMeterGauge({ data, loading: meterLoading }: { data: UsageMeterData | null; loading: boolean }) {
  if (meterLoading) {
    return (
      <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm hover:shadow-md transition-all duration-200">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-36" />
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Skeleton className="h-40 w-40 rounded-full" />
        </CardContent>
      </Card>
    );
  }
  if (!data) return null;

  const { percentage, isUnlimited, used, limit, remaining, daysLeft, dailyAverage } = data;
  const displayPct = isUnlimited ? 0 : Math.min(percentage, 100);
  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (displayPct / 100) * circumference;
  const gaugeColor = displayPct >= 85 ? "#DC2626" : displayPct >= 60 ? "#F59E0B" : "#DC2626";

  return (
    <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm hover:shadow-md transition-all duration-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <GradientIcon icon={Gauge} from="from-red-500" to="to-red-700" />
          Real-Time Usage Meter
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center">
          <div className="relative w-44 h-44">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
              <circle cx="80" cy="80" r={radius} fill="none" stroke="currentColor" className="text-muted/40" strokeWidth="10" />
              <circle
                cx="80" cy="80" r={radius} fill="none"
                stroke={gaugeColor}
                strokeWidth="10" strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-foreground">
                {isUnlimited ? "∞" : `${displayPct.toFixed(0)}%`}
              </span>
              <span className="text-[11px] text-muted-foreground mt-0.5">
                {isUnlimited ? "Unlimited" : `${used.toFixed(1)} / ${limit} GB`}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4 w-full text-center">
            <div>
              <p className="text-xs text-muted-foreground">Remaining</p>
              <p className="text-sm font-semibold text-foreground">{isUnlimited ? "∞" : `${remaining?.toFixed(1)} GB`}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Days Left</p>
              <p className="text-sm font-semibold text-foreground">{isUnlimited ? "—" : `${daysLeft}d`}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Daily Avg</p>
              <p className="text-sm font-semibold text-foreground">{dailyAverage.toFixed(2)} GB</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Service Health Card ───────────────────────────────────────

interface ServiceHealthData {
  area: string;
  onlineDevices: number;
  offlineDevices: number;
  activeAlerts: number;
  maintenanceWindows: number;
  overallStatus: "HEALTHY" | "DEGRADED" | "DOWN";
  totalDevices: number;
  warningDevices?: number;
}

function ServiceHealthCard({ data, loading: healthLoading }: { data: ServiceHealthData | null; loading: boolean }) {
  if (healthLoading) {
    return (
      <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm hover:shadow-md transition-all duration-200">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-36" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full rounded-lg" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-12 rounded-lg" />
            <Skeleton className="h-12 rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }
  if (!data) return null;

  const statusConfig = {
    HEALTHY: { color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200", icon: Wifi, label: "All Systems Healthy" },
    DEGRADED: { color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", icon: AlertCircle, label: "Service Degraded" },
    DOWN: { color: "text-red-600", bg: "bg-red-50", border: "border-red-200", icon: WifiOff, label: "Service Down" },
  }[data.overallStatus];

  const StatusIcon = statusConfig.icon;

  return (
    <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm hover:shadow-md transition-all duration-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <GradientIcon icon={Server} from="from-teal-500" to="to-teal-700" />
          Service Health
        </CardTitle>
        <CardDescription className="text-xs">Area: {data.area}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className={`flex items-center gap-3 p-3 rounded-lg ${statusConfig.bg} border ${statusConfig.border}`}>
          <StatusIcon className={`w-5 h-5 ${statusConfig.color} flex-shrink-0`} />
          <div>
            <p className={`text-sm font-semibold ${statusConfig.color}`}>{statusConfig.label}</p>
            <p className="text-xs text-muted-foreground">{data.totalDevices} devices monitored</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-100">
            <Wifi className="w-4 h-4 text-emerald-600" />
            <div>
              <p className="text-sm font-bold text-emerald-700">{data.onlineDevices}</p>
              <p className="text-[10px] text-emerald-600">Online</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-50 border border-red-100">
            <WifiOff className="w-4 h-4 text-red-600" />
            <div>
              <p className="text-sm font-bold text-red-700">{data.offlineDevices}</p>
              <p className="text-[10px] text-red-600">Offline</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-100">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <div>
              <p className="text-sm font-bold text-amber-700">{data.activeAlerts}</p>
              <p className="text-[10px] text-amber-600">Alerts (24h)</p>
            </div>
          </div>
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
            <Wrench className="w-4 h-4 text-slate-600" />
            <div>
              <p className="text-sm font-bold text-slate-700">{data.maintenanceWindows}</p>
              <p className="text-[10px] text-slate-600">Maintenance</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Speed Trend Sparkline ─────────────────────────────────────

interface SpeedHistoryData {
  daily: { date: string; downloadMbps: number; uploadMbps: number }[];
  averages: { download: number; upload: number };
  peak: { download: number; upload: number; date: string | null };
}

function SpeedTrendSparkline({ data, loading: speedLoading }: { data: SpeedHistoryData | null; loading: boolean }) {
  if (speedLoading) {
    return (
      <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm hover:shadow-md transition-all duration-200">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-36" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }
  if (!data || data.daily.length === 0) {
    return (
      <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm hover:shadow-md transition-all duration-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <GradientIcon icon={TrendingUp} from="from-red-500" to="to-red-700" />
            Speed Trend (7 days)
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-20 text-sm text-muted-foreground">
          No speed data available
        </CardContent>
      </Card>
    );
  }

  const last7 = data.daily.slice(-7);
  const maxSpeed = Math.max(...last7.map((d) => d.downloadMbps), 0.1);
  const points = last7.map((d, i) => {
    const x = (i / Math.max(last7.length - 1, 1)) * 280;
    const y = 32 - (d.downloadMbps / maxSpeed) * 28;
    return `${x},${y}`;
  });
  const polyPoints = points.join(" ");
  const areaPoints = `0,32 ${polyPoints} 280,32`;

  return (
    <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm hover:shadow-md transition-all duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <GradientIcon icon={TrendingUp} from="from-red-500" to="to-red-700" />
            Speed Trend (7 days)
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-red-600 gap-1" onClick={() => { /* handled by parent */ }}>
            View All <ArrowRight className="w-3 h-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between">
          <svg viewBox="0 0 280 40" className="w-full h-16" preserveAspectRatio="none">
            <polygon points={areaPoints} fill="url(#speedGrad)" className="opacity-30" />
            <polyline points={polyPoints} fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <defs>
              <linearGradient id="speedGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#DC2626" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#DC2626" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
          <span>Avg ↓ {data.averages.download.toFixed(1)} Mbps</span>
          <span>Avg ↑ {data.averages.upload.toFixed(1)} Mbps</span>
          <span className="ml-auto">Peak ↓ {data.peak.download.toFixed(1)} Mbps</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Pay Now Dialog ───────────────────────────────────────────

function PayNowDialog({
  open,
  onOpenChange,
  subscriber,
  invoices,
  outstandingBalance,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscriber: SubscriberProfile;
  invoices: InvoiceItem[];
  outstandingBalance: number;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState<string>("");
  const [invoiceId, setInvoiceId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const unpaidInvoices = invoices.filter(
    (inv) => inv.status !== "PAID" && inv.status !== "CANCELLED"
  );

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setAmount(outstandingBalance > 0 ? String(outstandingBalance) : (subscriber.plan?.price ? String(subscriber.plan.price) : ""));
      setInvoiceId("");
    }
  }, [open, outstandingBalance, subscriber.plan?.price]);

  const handlePay = async () => {
    const payAmount = parseFloat(amount);
    if (!payAmount || payAmount <= 0) {
      toast.error("Invalid amount", { description: "Please enter a valid amount to pay." });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/subscriber-auth/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: payAmount,
          invoiceId: invoiceId || undefined,
          paymentMode: "ONLINE",
        }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success("Payment Initiated", {
          description: `Receipt: ${data.payment.receiptNumber} · ${formatCurrency(payAmount)}`,
        });
        onOpenChange(false);
        onSuccess();
      } else {
        toast.error("Payment Failed", { description: data.error || "Could not process payment." });
      }
    } catch {
      toast.error("Payment Error", { description: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-white" />
            </div>
            Pay Bill
          </DialogTitle>
          <DialogDescription>
            Make a payment towards your outstanding balance.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Outstanding Balance */}
          <div className="rounded-lg bg-muted/50 border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Outstanding Balance</span>
              <span className={`text-lg font-bold ${outstandingBalance > 0 ? "text-red-600" : "text-red-600"}`}>
                {formatCurrency(outstandingBalance)}
              </span>
            </div>
            {subscriber.plan && (
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-muted-foreground">Monthly Plan</span>
                <span className="text-sm font-medium">{formatCurrency(subscriber.plan.price)}</span>
              </div>
            )}
          </div>

          {/* Select Invoice */}
          {unpaidInvoices.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wider">Pay Against Invoice (Optional)</Label>
              <Select value={invoiceId} onValueChange={setInvoiceId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select an invoice..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No specific invoice</SelectItem>
                  {unpaidInvoices.map((inv) => (
                    <SelectItem key={inv.id} value={inv.id}>
                      {inv.invoiceNumber} — {formatCurrency(inv.balanceAmount)} ({inv.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Amount Input */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium uppercase tracking-wider">Amount (₹)</Label>
            <Input
              type="number"
              min={1}
              max={1000000}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount"
              className="h-10"
            />
            {unpaidInvoices.length > 0 && invoiceId && invoiceId !== "none" && (
              <p className="text-xs text-muted-foreground">
                Invoice balance: {formatCurrency(unpaidInvoices.find((i) => i.id === invoiceId)?.balanceAmount || 0)}
              </p>
            )}
          </div>

          {/* Quick Amount Buttons */}
          <div className="flex gap-2">
            {outstandingBalance > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs h-8"
                onClick={() => setAmount(String(outstandingBalance))}
              >
                Full Outstanding
              </Button>
            )}
            {subscriber.plan && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs h-8"
                onClick={() => setAmount(String(subscriber.plan.price))}
              >
                Monthly Plan
              </Button>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handlePay}
            disabled={submitting || !amount || parseFloat(amount) <= 0}
            className="bg-gradient-to-r from-red-500 to-red-700 hover:from-red-600 hover:to-red-800 text-white shadow-sm min-w-[100px]"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing…
              </>
            ) : (
              <>
                <CreditCard className="w-4 h-4 mr-2" />
                Pay {amount ? formatCurrency(parseFloat(amount)) : ""}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Raise Complaint Dialog ───────────────────────────────────

function RaiseComplaintDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [type, setType] = useState<string>("INTERNET");
  const [priority, setPriority] = useState<string>("P3_MEDIUM");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setType("INTERNET");
      setPriority("P3_MEDIUM");
      setDescription("");
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!description.trim()) {
      toast.error("Description required", { description: "Please describe your issue." });
      return;
    }
    if (description.trim().length < 10) {
      toast.error("Too short", { description: "Please provide at least 10 characters of description." });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/subscriber-auth/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          priority,
          description: description.trim(),
        }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success("Complaint Registered", {
          description: `Ticket #${data.complaint.ticketNumber} has been created. We'll get back to you soon.`,
          duration: 6000,
        });
        onOpenChange(false);
        onSuccess();
      } else {
        toast.error("Failed to create complaint", { description: data.error || "Please try again." });
      }
    } catch {
      toast.error("Network Error", { description: "Could not reach the server." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <MessageSquarePlus className="w-4 h-4 text-white" />
            </div>
            Raise Complaint
          </DialogTitle>
          <DialogDescription>
            Submit a support ticket and our team will assist you.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium uppercase tracking-wider">Issue Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INTERNET">Internet / Connectivity</SelectItem>
                <SelectItem value="SPEED">Speed Issues</SelectItem>
                <SelectItem value="BILLING">Billing</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium uppercase tracking-wider">Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="P1_CRITICAL">P1 — Critical</SelectItem>
                <SelectItem value="P2_HIGH">P2 — High</SelectItem>
                <SelectItem value="P3_MEDIUM">P3 — Medium</SelectItem>
                <SelectItem value="P4_LOW">P4 — Low</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium uppercase tracking-wider">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your issue in detail..."
              rows={4}
              maxLength={5000}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground text-right">
              {description.length}/5000
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !description.trim() || description.trim().length < 10}
            className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white shadow-sm min-w-[120px]"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting…
              </>
            ) : (
              <>
                <MessageSquarePlus className="w-4 h-4 mr-2" />
                Submit Ticket
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Change Password Dialog ───────────────────────────────────

function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShowCurrent(false);
      setShowNew(false);
      setShowConfirm(false);
    }
  }, [open]);

  const isValid =
    currentPassword.length > 0 &&
    newPassword.length >= 6 &&
    newPassword.length <= 64 &&
    newPassword === confirmPassword;

  const handleSubmit = async () => {
    if (!isValid) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/subscriber-auth/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success("Password Changed", {
          description: "Your service password has been updated successfully.",
        });
        onOpenChange(false);
      } else {
        toast.error("Failed", { description: data.error || "Could not change password." });
      }
    } catch {
      toast.error("Network Error", { description: "Could not reach the server." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center">
              <KeyRound className="w-4 h-4 text-white" />
            </div>
            Change Password
          </DialogTitle>
          <DialogDescription>
            Update your service account password.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium uppercase tracking-wider">Current Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                className="pl-10 pr-10 h-10"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium uppercase tracking-wider">New Password</Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password (min. 6 chars)"
                className="pl-10 pr-10 h-10"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {newPassword.length > 0 && newPassword.length < 6 && (
              <p className="text-xs text-amber-600">Password must be at least 6 characters</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium uppercase tracking-wider">Confirm New Password</Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="pl-10 pr-10 h-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {confirmPassword.length > 0 && newPassword !== confirmPassword && (
              <p className="text-xs text-red-600">Passwords do not match</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !isValid}
            className="bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 text-white shadow-sm min-w-[120px]"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Updating…
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Update Password
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Download Invoice Helper ──────────────────────────────────

function downloadInvoiceReceipt(subscriber: SubscriberProfile, invoice: InvoiceItem) {
  const divider = "═".repeat(48);
  const thinDivider = "─".repeat(48);

  const receipt = [
    divider,
    "         CRYPTSK INTELLIGENT ISP PLATFORM",
    "               PAYMENT RECEIPT",
    divider,
    "",
    `  Subscriber:    ${subscriber.name}`,
    `  Code:          ${subscriber.code}`,
    `  Invoice #:     ${invoice.invoiceNumber}`,
    `  Issue Date:    ${formatDate(invoice.issueDate)}`,
    `  Due Date:      ${formatDate(invoice.dueDate)}`,
    `  Plan:          ${subscriber.plan?.name || "N/A"}`,
    "",
    thinDivider,
    "  AMOUNT DETAILS",
    thinDivider,
    "",
    `  Grand Total:       ${formatCurrency(invoice.grandTotal)}`,
    `  Tax:               ${formatCurrency(invoice.totalTax)}`,
    `  Discount:          ${formatCurrency(invoice.discountAmount)}`,
    `  Paid:              ${formatCurrency(invoice.paidAmount)}`,
    `  Balance:           ${formatCurrency(invoice.balanceAmount)}`,
    "",
    `  Status:            ${invoice.status}`,
    `  Paid On:           ${invoice.paidAt ? formatDateTime(invoice.paidAt) : "Not paid yet"}`,
    "",
    divider,
    "  Thank you for being a valued subscriber!",
    divider,
    "",
    `  Generated on: ${new Date().toLocaleString("en-IN")}`,
    "",
  ].join("\n");

  const blob = new Blob([receipt], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `receipt-${invoice.invoiceNumber.replace(/\s+/g, "-")}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  toast.success("Receipt Downloaded", {
    description: `${invoice.invoiceNumber} receipt saved as .txt`,
  });
}

// ─── Dashboard Component ──────────────────────────────────────

export default function SelfcareDashboard({ onNavigate }: SelfcareDashboardProps) {
  const { subscriber, usage, serviceStatus, invoices, outstandingBalance, loading, error, refetch } = useSubscriberData();
  const { subscriber: storeSub } = useSubscriberAuthStore();
  const sub = subscriber || storeSub;

  // Dialog states
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [complaintDialogOpen, setComplaintDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [invoiceDownloadOpen, setInvoiceDownloadOpen] = useState(false);

  // New widget states
  const [usageMeterData, setUsageMeterData] = useState<UsageMeterData | null>(null);
  const [serviceHealthData, setServiceHealthData] = useState<ServiceHealthData | null>(null);
  const [speedHistoryData, setSpeedHistoryData] = useState<SpeedHistoryData | null>(null);
  const [widgetLoading, setWidgetLoading] = useState(true);

  // Fetch new widget data
  useEffect(() => {
    if (!sub) return;
    let cancelled = false;
    const controller = new AbortController();

    Promise.allSettled([
      fetch("/api/selfcare/usage-meter", { signal: controller.signal }).then((r) => r.json()),
      fetch("/api/selfcare/service-health", { signal: controller.signal }).then((r) => r.json()),
      fetch("/api/selfcare/speed-history", { signal: controller.signal }).then((r) => r.json()),
    ]).then(([meterRes, healthRes, speedRes]) => {
      if (cancelled) return;
      if (meterRes.status === "fulfilled" && meterRes.value.success) {
        setUsageMeterData(meterRes.value.data);
      }
      if (healthRes.status === "fulfilled" && healthRes.value.success) {
        setServiceHealthData(healthRes.value.data);
      }
      if (speedRes.status === "fulfilled" && speedRes.value.success) {
        setSpeedHistoryData(speedRes.value.data);
      }
      setWidgetLoading(false);
    }).catch(() => {
      if (!cancelled) setWidgetLoading(false);
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [sub]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (!sub) return <ErrorState message="No subscriber data available" onRetry={refetch} />;

  const usedMB = usage?.currentUsed ?? sub.currentCycleDataUsed ?? 0;
  const limitMB = usage?.dataLimit ?? (sub.plan?.dataLimitGb ? sub.plan.dataLimitGb * 1024 : null);
  const pct = limitMB ? Math.min(Math.round((usedMB / limitMB) * 100), 100) : 0;
  const isUnlimited = limitMB === null;
  const nextBillDate = getNextBillingDate(sub.billingStartDate);

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <WelcomeBanner subscriber={sub} />

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Zap}
          label="Plan Details"
          value={sub.plan?.name || "No Plan"}
          subValue={sub.plan ? `↓${sub.plan.speedDown} / ↑${sub.plan.speedUp} Mbps · ${formatCurrency(sub.plan.price)}/mo` : undefined}
          iconBg="bg-gradient-to-br from-red-500 to-red-700"
        />

        <StatCard
          icon={Activity}
          label="Data Usage"
          value={isUnlimited ? formatMB(usedMB) : `${formatMB(usedMB)} / ${formatMB(limitMB)}`}
          subValue={isUnlimited ? "Unlimited" : `${pct}% used`}
          iconBg="bg-gradient-to-br from-amber-500 to-orange-600"
        >
          {!isUnlimited && (
            <div className="pt-2">
              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    pct >= 85 ? "bg-gradient-to-r from-red-500 to-rose-500" :
                    pct >= 60 ? "bg-gradient-to-r from-amber-500 to-orange-500" :
                    "bg-gradient-to-r from-red-500 to-red-500"
                  }`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
            </div>
          )}
        </StatCard>

        <StatCard
          icon={CalendarCheck}
          label="Next Billing"
          value={sub.plan ? formatCurrency(sub.plan.price) : "N/A"}
          subValue={nextBillDate ? `Due: ${nextBillDate}` : undefined}
          iconBg="bg-gradient-to-br from-violet-500 to-purple-600"
        />

        <StatCard
          icon={ShieldCheck}
          label="Connection Status"
          value={sub.status}
          subValue={`Code: ${sub.code}`}
          iconBg={
            sub.status === "ACTIVE"
              ? "bg-gradient-to-br from-red-500 to-red-700"
              : sub.status === "SUSPENDED"
                ? "bg-gradient-to-br from-amber-500 to-yellow-600"
                : "bg-gradient-to-br from-slate-500 to-slate-600"
          }
        >
          <div className="flex items-center gap-1.5 mt-1">
            {sub.status === "ACTIVE" && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
            )}
            <Badge
              className={`text-[10px] ${
                sub.status === "ACTIVE"
                  ? "bg-red-100 text-red-700 hover:bg-red-100 border-0"
                  : sub.status === "SUSPENDED"
                    ? "bg-amber-100 text-amber-700 hover:bg-amber-100 border-0"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-100 border-0"
              }`}
            >
              {sub.status}
            </Badge>
          </div>
        </StatCard>
      </div>

      {/* Connection Info + Usage Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Connection Info */}
        <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm hover:shadow-md transition-all duration-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <GradientIcon icon={Globe} from="from-red-500" to="to-red-700" />
              Connection Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="Connection Type" value={sub.connectionType || "N/A"} />
            <Separator />
            <InfoRow label="IP Address" value={sub.ipAddress || "N/A"} />
            <Separator />
            <InfoRow label="IP Type" value={sub.ipType || "Dynamic"} />
            <Separator />
            <InfoRow
              label="Last Authentication"
              value={formatDateTime(sub.lastAuthAt)}
            />
            <Separator />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Speeds</span>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-red-600 font-medium">
                  <ArrowDownToLine className="w-3.5 h-3.5" />
                  {sub.currentSpeedDown || sub.plan?.speedDown || 0} Mbps
                </span>
                <span className="flex items-center gap-1 text-red-700 font-medium">
                  <ArrowUpFromLine className="w-3.5 h-3.5" />
                  {sub.currentSpeedUp || sub.plan?.speedUp || 0} Mbps
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Data Usage Mini Chart */}
        <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm hover:shadow-md transition-all duration-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <GradientIcon icon={TrendingUp} from="from-amber-500" to="to-orange-600" />
              Data Usage — Last 7 Days
            </CardTitle>
            <CardDescription>
              {isUnlimited ? "Unlimited plan — usage for reference" : `${pct}% of ${formatMB(limitMB)} used this cycle`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {usage?.dailyUsage && usage.dailyUsage.length > 0 ? (
              <UsageMiniChart dailyUsage={usage.dailyUsage} />
            ) : (
              <div className="flex items-center justify-center h-20 text-sm text-muted-foreground">
                No usage data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* New Widgets Row: Usage Meter + Service Health + Speed Trend + Compare Plan */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <UsageMeterGauge data={usageMeterData} loading={widgetLoading} />
        <ServiceHealthCard data={serviceHealthData} loading={widgetLoading} />
        <SpeedTrendSparkline data={speedHistoryData} loading={widgetLoading} />
        <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <GradientIcon icon={Zap} from="from-amber-500" to="to-orange-600" />
              Plan Comparison
            </CardTitle>
            <CardDescription className="text-xs">
              See how your plan compares to others
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between">
            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50 border">
                <Zap className="w-4 h-4 text-red-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{sub.plan?.name || "No Plan"}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {sub.plan ? `↓${sub.plan.speedDown} / ↑${sub.plan.speedUp} Mbps` : "—"}
                  </p>
                </div>
                <Badge className="text-[10px] bg-red-100 text-red-700 border-0">Current</Badge>
              </div>
            </div>
            <Button
              className="w-full justify-center gap-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white border-0 shadow-sm"
              onClick={() => onNavigate?.("plan-compare")}
            >
              Compare My Plan
              <ArrowRight className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Quick Actions */}
        <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm hover:shadow-md transition-all duration-200 lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <GradientIcon icon={Zap} from="from-red-500" to="to-red-700" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {/* Pay Now */}
            <Button
              className="w-full justify-start gap-2 h-10 text-sm bg-gradient-to-r from-red-500 to-red-700 hover:from-red-600 hover:to-red-800 text-white border-0 shadow-sm"
              onClick={() => setPayDialogOpen(true)}
            >
              <CreditCard className="w-4 h-4" />
              Pay Bill
              {outstandingBalance > 0 && (
                <Badge className="ml-auto bg-white/20 text-white hover:bg-white/20 border-0 text-[10px]">
                  {formatCurrency(outstandingBalance)}
                </Badge>
              )}
            </Button>

            {/* Raise Complaint */}
            <Button
              variant="outline"
              className="w-full justify-start gap-2 h-10 text-sm border-border/50 bg-background hover:bg-muted/50"
              onClick={() => setComplaintDialogOpen(true)}
            >
              <MessageSquarePlus className="w-4 h-4 text-amber-600" />
              Raise Ticket
            </Button>

            {/* View Usage */}
            <Button
              variant="outline"
              className="w-full justify-start gap-2 h-10 text-sm border-border/50 bg-background hover:bg-muted/50"
              onClick={() => onNavigate?.("usage")}
            >
              <BarChart3 className="w-4 h-4 text-red-600" />
              View Usage
            </Button>

            {/* Change Password */}
            <Button
              variant="outline"
              className="w-full justify-start gap-2 h-10 text-sm border-border/50 bg-background hover:bg-muted/50"
              onClick={() => setPasswordDialogOpen(true)}
            >
              <KeyRound className="w-4 h-4 text-slate-600" />
              Change Password
            </Button>

            {/* Download Invoice */}
            <Button
              variant="outline"
              className="w-full justify-start gap-2 h-10 text-sm border-border/50 bg-background hover:bg-muted/50"
              onClick={() => setInvoiceDownloadOpen(true)}
            >
              <Download className="w-4 h-4 text-violet-600" />
              Download Invoice
            </Button>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="rounded-xl border border-border/50 ring-1 ring-black/5 shadow-sm hover:shadow-md transition-all duration-200 lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <GradientIcon icon={Clock} from="from-slate-400" to="to-slate-500" />
              Recent Invoices
            </CardTitle>
          </CardHeader>
          <CardContent>
            {invoices.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {invoices.slice(0, 5).map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center">
                        <Receipt className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {inv.invoiceNumber}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(inv.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => downloadInvoiceReceipt(sub, inv)}
                        title="Download receipt"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-foreground">
                          {formatCurrency(inv.grandTotal)}
                        </p>
                        <Badge
                          className={`text-[10px] ${
                            inv.status === "PAID"
                              ? "bg-red-100 text-red-700 hover:bg-red-100 border-0"
                              : inv.status === "OVERDUE"
                                ? "bg-red-100 text-red-700 hover:bg-red-100 border-0"
                                : "bg-amber-100 text-amber-700 hover:bg-amber-100 border-0"
                          }`}
                        >
                          {inv.status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-sm text-muted-foreground">
                <Receipt className="w-8 h-8 mb-2 opacity-40" />
                No recent invoices
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Dialogs ─── */}

      {/* Pay Now Dialog */}
      <PayNowDialog
        open={payDialogOpen}
        onOpenChange={setPayDialogOpen}
        subscriber={sub}
        invoices={invoices}
        outstandingBalance={outstandingBalance}
        onSuccess={refetch}
      />

      {/* Raise Complaint Dialog */}
      <RaiseComplaintDialog
        open={complaintDialogOpen}
        onOpenChange={setComplaintDialogOpen}
        onSuccess={refetch}
      />

      {/* Change Password Dialog */}
      <ChangePasswordDialog
        open={passwordDialogOpen}
        onOpenChange={setPasswordDialogOpen}
      />

      {/* Download Invoice Dialog (select invoice) */}
      <Dialog open={invoiceDownloadOpen} onOpenChange={setInvoiceDownloadOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                <FileText className="w-4 h-4 text-white" />
              </div>
              Download Receipt
            </DialogTitle>
            <DialogDescription>
              Select an invoice to download its receipt.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {invoices.length > 0 ? (
              invoices.map((inv) => (
                <button
                  key={inv.id}
                  onClick={() => {
                    downloadInvoiceReceipt(sub, inv);
                    setInvoiceDownloadOpen(false);
                  }}
                  className="w-full flex items-center justify-between py-2.5 px-3 rounded-lg border border-border/50 hover:bg-muted/50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{inv.invoiceNumber}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(inv.createdAt)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{formatCurrency(inv.grandTotal)}</p>
                    <Badge
                      className={`text-[10px] ${
                        inv.status === "PAID"
                          ? "bg-red-100 text-red-700 hover:bg-red-100 border-0"
                          : inv.status === "OVERDUE"
                            ? "bg-red-100 text-red-700 hover:bg-red-100 border-0"
                            : "bg-amber-100 text-amber-700 hover:bg-amber-100 border-0"
                      }`}
                    >
                      {inv.status}
                    </Badge>
                  </div>
                </button>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-sm text-muted-foreground">
                <FileText className="w-8 h-8 mb-2 opacity-40" />
                No invoices available
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Info Row ─────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
