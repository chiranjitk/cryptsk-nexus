"use client";

import React, { useState, useEffect, useCallback } from "react";
import { cn, formatINR } from "@/lib/utils";
import {
  Banknote,
  Smartphone,
  Globe,
  Building2,
  FileText,
  Wallet,
  Clock,
  ArrowUpRight,
  RefreshCw,
  CreditCard,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Types ─────────────────────────────────────────────────────

interface PaymentItem {
  id: string;
  amount: number;
  paymentMode: string;
  status: string;
  createdAt: string;
  subscriber: {
    name: string;
    code: string;
  };
}

interface RecentPaymentsData {
  payments: PaymentItem[];
  totalToday: number;
  totalThisMonth: number;
  averagePayment: number;
  totalCount: number;
  timestamp: string;
}

// ─── Payment Mode Config ───────────────────────────────────────

type PaymentModeType =
  | "CASH"
  | "UPI"
  | "ONLINE"
  | "BANK_TRANSFER"
  | "CHEQUE"
  | "WALLET";

const PAYMENT_MODE_CONFIG: Record<
  PaymentModeType,
  {
    label: string;
    icon: React.ElementType;
    color: string;
    bgColor: string;
    borderColor: string;
    darkBgColor: string;
  }
> = {
  CASH: {
    label: "Cash",
    icon: Banknote,
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-50",
    borderColor: "border-l-emerald-500",
    darkBgColor: "dark:bg-emerald-950/40",
  },
  UPI: {
    label: "UPI",
    icon: Smartphone,
    color: "text-teal-600 dark:text-teal-400",
    bgColor: "bg-teal-50",
    borderColor: "border-l-teal-500",
    darkBgColor: "dark:bg-teal-950/40",
  },
  ONLINE: {
    label: "Online",
    icon: Globe,
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-50",
    borderColor: "border-l-red-500",
    darkBgColor: "dark:bg-red-950/40",
  },
  BANK_TRANSFER: {
    label: "Bank Transfer",
    icon: Building2,
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-50",
    borderColor: "border-l-amber-500",
    darkBgColor: "dark:bg-amber-950/40",
  },
  CHEQUE: {
    label: "Cheque",
    icon: FileText,
    color: "text-rose-600 dark:text-rose-400",
    bgColor: "bg-rose-50",
    borderColor: "border-l-rose-500",
    darkBgColor: "dark:bg-rose-950/40",
  },
  WALLET: {
    label: "Wallet",
    icon: Wallet,
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-50",
    borderColor: "border-l-orange-500",
    darkBgColor: "dark:bg-orange-950/40",
  },
};

// ─── Payment Status Config ─────────────────────────────────────

const STATUS_CONFIG: Record<
  string,
  { label: string; dotColor: string; textColor: string }
> = {
  VERIFIED: {
    label: "Verified",
    dotColor: "bg-emerald-500",
    textColor: "text-emerald-700 dark:text-emerald-400",
  },
  PENDING: {
    label: "Pending",
    dotColor: "bg-amber-500",
    textColor: "text-amber-700 dark:text-amber-400",
  },
  FAILED: {
    label: "Failed",
    dotColor: "bg-red-500",
    textColor: "text-red-700 dark:text-red-400",
  },
  REFUNDED: {
    label: "Refunded",
    dotColor: "bg-gray-400",
    textColor: "text-gray-600 dark:text-gray-400",
  },
};

// ─── Relative Time ─────────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  try {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffMs = now - then;

    if (diffMs < 60_000) return "just now";

    if (diffMs < 3_600_000) {
      const mins = Math.floor(diffMs / 60_000);
      return `${mins} min ago`;
    }

    if (diffMs < 86_400_000) {
      const hrs = Math.floor(diffMs / 3_600_000);
      return `${hrs} hour${hrs > 1 ? "s" : ""} ago`;
    }

    if (diffMs < 172_800_000) return "Yesterday";

    // Show date for older items
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return dateStr;
  }
}

// ─── Summary Stat Card ─────────────────────────────────────────

function SummaryStatCard({
  label,
  value,
  icon: Icon,
  theme,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  theme: "red" | "teal" | "amber";
}) {
  const themeClasses = {
    red: {
      iconBg: "bg-red-50 dark:bg-red-950/40",
      iconColor: "text-red-600 dark:text-red-400",
      border: "border-red-100 dark:border-red-900/30",
    },
    teal: {
      iconBg: "bg-teal-50 dark:bg-teal-950/40",
      iconColor: "text-teal-600 dark:text-teal-400",
      border: "border-teal-100 dark:border-teal-900/30",
    },
    amber: {
      iconBg: "bg-amber-50 dark:bg-amber-950/40",
      iconColor: "text-amber-600 dark:text-amber-400",
      border: "border-amber-100 dark:border-amber-900/30",
    },
  };

  const t = themeClasses[theme];

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-lg border p-2.5",
        t.border
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center h-8 w-8 rounded-lg shrink-0",
          t.iconBg
        )}
      >
        <Icon className={cn("h-4 w-4", t.iconColor)} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
          {label}
        </p>
        <p className="text-sm font-bold text-foreground tabular-nums truncate">
          {value}
        </p>
      </div>
    </div>
  );
}

// ─── Skeleton ──────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-0">
      {/* Summary stats skeleton */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-2.5 rounded-lg border p-2.5"
          >
            <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-2.5 w-14 rounded" />
              <Skeleton className="h-3.5 w-16 rounded" />
            </div>
          </div>
        ))}
      </div>
      {/* Timeline skeleton */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="relative flex items-start gap-3 py-3">
          <div className="flex flex-col items-center">
            <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
            {i < 4 && (
              <Skeleton className="w-0.5 flex-1 mt-1 rounded-full" />
            )}
          </div>
          <div className="flex-1 min-w-0 space-y-1.5 pt-0.5">
            <Skeleton className="h-3.5 w-2/3 rounded" />
            <Skeleton className="h-3 w-1/2 rounded" />
            <Skeleton className="h-2.5 w-20 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Empty State ───────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <div className="p-3 rounded-2xl bg-muted/50 text-muted-foreground/50">
        <CreditCard className="h-8 w-8" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-medium text-muted-foreground">
          No payments yet
        </p>
        <p className="text-xs text-muted-foreground/60">
          Payment records will appear here once collected.
        </p>
      </div>
    </div>
  );
}

// ─── Timeline Payment Item ─────────────────────────────────────

function TimelinePaymentItem({
  payment,
  index,
  isLast,
}: {
  payment: PaymentItem;
  index: number;
  isLast: boolean;
}) {
  const mode = PAYMENT_MODE_CONFIG[payment.paymentMode as PaymentModeType] ||
    PAYMENT_MODE_CONFIG.CASH;
  const status = STATUS_CONFIG[payment.status] || STATUS_CONFIG.PENDING;
  const ModeIcon = mode.icon;

  return (
    <div
      className={cn(
        "relative flex items-start gap-3 py-3",
        "transition-all duration-200 hover:translate-x-1 hover:shadow-sm rounded-r-lg group",
        "border-l-[3px] pl-3 ml-[1px]",
        mode.borderColor
      )}
    >
      {/* Connecting line for non-last items */}
      {!isLast && (
        <div className="absolute left-[13px] top-[42px] bottom-0 w-px bg-border/40" />
      )}

      {/* Mode icon */}
      <div
        className={cn(
          "flex items-center justify-center h-8 w-8 rounded-lg shrink-0 z-10",
          "transition-transform group-hover:scale-110",
          mode.bgColor,
          mode.darkBgColor
        )}
      >
        <ModeIcon className={cn("h-4 w-4", mode.color)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        {/* Subscriber name + status dot */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground truncate">
            {payment.subscriber.name}
          </span>
          <span
            className={cn(
              "h-2 w-2 rounded-full shrink-0",
              status.dotColor
            )}
            title={status.label}
          />
        </div>

        {/* Subscriber code */}
        <p className="text-xs font-mono text-muted-foreground">
          {payment.subscriber.code}
        </p>

        {/* Amount + mode badge + timestamp */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-foreground tabular-nums">
            {formatINR(payment.amount)}
          </span>
          <Badge
            variant="secondary"
            className={cn(
              "text-[10px] px-1.5 py-0 h-5 font-medium border-0",
              mode.bgColor,
              mode.color
            )}
          >
            {mode.label}
          </Badge>
          <span className="text-[10px] text-muted-foreground/60 tabular-nums flex items-center gap-0.5">
            <Clock className="h-2.5 w-2.5" />
            {formatRelativeTime(payment.createdAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Widget ───────────────────────────────────────────────

export function RecentPaymentsTimelineWidget() {
  const [data, setData] = useState<RecentPaymentsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPayments = useCallback(async (isBackground = false) => {
    if (isBackground) {
      setIsFetching(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const res = await fetch("/api/payments/recent", {
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Failed to fetch recent payments:", err);
      if (!isBackground) {
        setError("Failed to load recent payments");
      }
    } finally {
      setIsLoading(false);
      setIsFetching(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchPayments(false);
  }, [fetchPayments]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchPayments(true);
    }, 30_000);

    return () => clearInterval(interval);
  }, [fetchPayments]);

  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter overflow-hidden">
      {/* ── Header ── */}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <div className="flex items-center justify-center rounded-lg bg-gradient-to-br from-red-500 to-rose-600 p-1.5 text-white shadow-sm">
              <CreditCard className="h-3.5 w-3.5" />
            </div>
            Recent Payments
            {data && data.payments.length > 0 && (
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0 h-5 font-semibold bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 border-0"
              >
                {data.payments.length}
              </Badge>
            )}
          </CardTitle>

          <div className="flex items-center gap-1">
            {/* View All link */}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 px-2"
              onClick={() => {
                /* navigate to payments page */
              }}
            >
              View All
              <ArrowUpRight className="h-3 w-3" />
            </Button>
            {/* Refresh button */}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => fetchPayments(false)}
              disabled={isFetching}
            >
              <RefreshCw
                className={cn(
                  "h-3.5 w-3.5",
                  isFetching && "animate-spin"
                )}
              />
            </Button>
          </div>
        </div>
      </CardHeader>

      {/* ── Body ── */}
      <CardContent className="pt-0">
        {isLoading ? (
          <LoadingSkeleton />
        ) : error ? (
          <div className="flex flex-col items-center py-8 gap-2">
            <div className="p-2 rounded-xl bg-red-100 dark:bg-red-950/30 text-red-500">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <p className="text-xs text-muted-foreground">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1 mt-1"
              onClick={() => fetchPayments(false)}
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </Button>
          </div>
        ) : !data || data.payments.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* ── Summary Stats Row ── */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <SummaryStatCard
                label="Today"
                value={formatINR(data.totalToday)}
                icon={Banknote}
                theme="red"
              />
              <SummaryStatCard
                label="This Month"
                value={formatINR(data.totalThisMonth)}
                icon={Globe}
                theme="teal"
              />
              <SummaryStatCard
                label="Avg. Payment"
                value={formatINR(data.averagePayment)}
                icon={Wallet}
                theme="amber"
              />
            </div>

            {/* ── Timeline List ── */}
            <div className="max-h-96 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-rounded-full scrollbar-thumb-border/40 scrollbar-track-transparent hover:scrollbar-thumb-border/60">
              {data.payments.map((payment, index) => (
                <TimelinePaymentItem
                  key={payment.id}
                  payment={payment}
                  index={index}
                  isLast={index === data.payments.length - 1}
                />
              ))}
            </div>

            {/* ── Footer ── */}
            <div className="mt-3 pt-3 border-t border-border/50">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" />
                  Auto-refreshes every 30s
                </span>
                <span className="text-[10px] text-muted-foreground/40 tabular-nums">
                  {data.totalCount} total payments
                </span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default RecentPaymentsTimelineWidget;
