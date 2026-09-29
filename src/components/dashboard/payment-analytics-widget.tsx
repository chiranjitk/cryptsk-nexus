"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  IndianRupee,
  RefreshCw,
  AlertTriangle,
  TrendingUp,
  Wallet,
  Clock,
  Target,
  BarChart3,
} from "lucide-react";
import { formatINR } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────

interface PaymentModeItem {
  mode: string;
  count: number;
  total: number;
}

interface TopCollector {
  name: string;
  collected: number;
  count: number;
}

interface PaymentAnalyticsData {
  todayCollection: number;
  todayTarget: number;
  todayPercentage: number;
  weekCollection: number;
  monthCollection: number;
  monthTarget: number;
  monthPercentage: number;
  paymentModeBreakdown: PaymentModeItem[];
  topCollectors: TopCollector[];
  overdueAmount: number;
  overdueCount: number;
  avgPaymentAmount: number;
}

// ─── Color helpers ──────────────────────────────────────────────

const MODE_COLORS: Record<string, string> = {
  UPI: "#0D9488",
  CASH: "#10B981",
  ONLINE: "#F59E0B",
  BANK_TRANSFER: "#DC2626",
  CHEQUE: "#78716C",
  WALLET: "#D97706",
};

const MODE_LABELS: Record<string, string> = {
  UPI: "UPI",
  CASH: "Cash",
  ONLINE: "Online",
  BANK_TRANSFER: "Bank Transfer",
  CHEQUE: "Cheque",
  WALLET: "Wallet",
};

function progressColor(pct: number): string {
  if (pct >= 80) return "bg-emerald-500";
  if (pct >= 50) return "bg-amber-500";
  return "bg-red-500";
}

function progressTextColor(pct: number): string {
  if (pct >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

// ─── Progress Bar ───────────────────────────────────────────────

function CollectionBar({
  label,
  collected,
  target,
  percentage,
}: {
  label: string;
  collected: number;
  target: number;
  percentage: number;
}) {
  const barPct = Math.min(percentage, 100);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-foreground tabular-nums">
            {formatINR(collected)}
          </span>
          <span className="text-[10px] text-muted-foreground">of {formatINR(target)}</span>
          <span
            className={`text-[10px] font-bold tabular-nums ${progressTextColor(percentage)}`}
          >
            {percentage}%
          </span>
        </div>
      </div>
      <div className="h-2.5 w-full rounded-full bg-muted/50 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${progressColor(percentage)}`}
          style={{ width: `${barPct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Loading Skeleton ───────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-6 w-full rounded-full" />
        <Skeleton className="h-6 w-full rounded-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-full rounded-lg" />
        <div className="flex gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-16" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

// ─── Payment Analytics Widget ───────────────────────────────────

export function PaymentAnalyticsWidget() {
  const [data, setData] = useState<PaymentAnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    else setIsRefetching(true);
    try {
      const res = await fetch("/api/dashboard/payment-analytics", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch payment analytics");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("PaymentAnalyticsWidget fetch error:", err);
    } finally {
      setIsLoading(false);
      setIsRefetching(false);
    }
  }, []);

  useEffect(() => {
    fetchData(true);
    intervalRef.current = setInterval(() => fetchData(false), 120000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  // ── Mode breakdown data ──
  const totalModeAmount = data?.paymentModeBreakdown.reduce((s, m) => s + m.total, 0) || 0;
  const modeSegments = data?.paymentModeBreakdown.map((m) => ({
    ...m,
    label: MODE_LABELS[m.mode] || m.mode,
    color: MODE_COLORS[m.mode] || "#78716C",
    pct: totalModeAmount > 0 ? (m.total / totalModeAmount) * 100 : 0,
  })) || [];

  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter hover:shadow-md hover:border-emerald-200 dark:hover:border-emerald-800/50 transition-all duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-emerald-100 dark:bg-emerald-950/40">
              <IndianRupee className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            Payment Analytics
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => fetchData(false)}
            disabled={isRefetching}
            aria-label="Refresh payment analytics"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <LoadingSkeleton />
        ) : data ? (
          <div className="space-y-4">
            {/* ── Collection Progress ── */}
            <div className="space-y-3">
              <div className="flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Collection Progress
                </p>
              </div>
              <CollectionBar
                label="Today"
                collected={data.todayCollection}
                target={data.todayTarget}
                percentage={data.todayPercentage}
              />
              <CollectionBar
                label="This Month"
                collected={data.monthCollection}
                target={data.monthTarget}
                percentage={data.monthPercentage}
              />
            </div>

            {/* ── Payment Mode Distribution ── */}
            {modeSegments.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Payment Mode Distribution
                  </p>
                </div>
                {/* Stacked horizontal bar */}
                <div className="flex h-7 rounded-lg overflow-hidden bg-muted/30">
                  {modeSegments.map((seg) => (
                    <div
                      key={seg.mode}
                      className="h-full transition-all duration-700 flex items-center justify-center"
                      style={{
                        width: `${Math.max(seg.pct, 4)}%`,
                        backgroundColor: seg.color,
                      }}
                      title={`${seg.label}: ${formatINR(seg.total)} (${seg.count} payments)`}
                    >
                      {seg.pct >= 15 && (
                        <span className="text-[9px] font-bold text-white truncate px-1">
                          {seg.label}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                {/* Legend */}
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {modeSegments.map((seg) => (
                    <div key={seg.mode} className="flex items-center gap-1.5">
                      <span
                        className="inline-block w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: seg.color }}
                      />
                      <span className="text-[10px] text-muted-foreground">
                        {seg.label}
                      </span>
                      <span className="text-[10px] font-semibold text-foreground tabular-nums">
                        {formatINR(seg.total)}
                      </span>
                      <span className="text-[9px] text-muted-foreground">
                        ({seg.count})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Quick Stats Grid (2x2) ── */}
            <div className="grid grid-cols-2 gap-3">
              {/* Overdue */}
              <div className="rounded-lg border border-red-200 dark:border-red-800/40 bg-red-50/50 dark:bg-red-950/20 p-3 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
                <div className="flex items-center gap-1.5 mb-1">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                  <p className="text-[10px] font-medium text-red-600 dark:text-red-400 uppercase tracking-wider">
                    Overdue
                  </p>
                </div>
                <p className="text-lg font-bold text-red-600 dark:text-red-400 tabular-nums">
                  {formatINR(data.overdueAmount)}
                </p>
                <p className="text-[10px] text-red-500/80">
                  {data.overdueCount} invoice{data.overdueCount !== 1 ? "s" : ""}
                </p>
              </div>

              {/* Avg Payment */}
              <div className="rounded-lg border border-teal-200 dark:border-teal-800/40 bg-teal-50/50 dark:bg-teal-950/20 p-3 hover:bg-teal-50 dark:hover:bg-teal-950/30 transition-colors">
                <div className="flex items-center gap-1.5 mb-1">
                  <Wallet className="h-3.5 w-3.5 text-teal-500" />
                  <p className="text-[10px] font-medium text-teal-600 dark:text-teal-400 uppercase tracking-wider">
                    Avg Payment
                  </p>
                </div>
                <p className="text-lg font-bold text-teal-600 dark:text-teal-400 tabular-nums">
                  {formatINR(data.avgPaymentAmount)}
                </p>
                <p className="text-[10px] text-teal-500/80">per transaction</p>
              </div>

              {/* This Week */}
              <div className="rounded-lg border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors">
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                  <p className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                    This Week
                  </p>
                </div>
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {formatINR(data.weekCollection)}
                </p>
                <p className="text-[10px] text-emerald-500/80">collected</p>
              </div>

              {/* Collection Rate */}
              <div className="rounded-lg border border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-950/20 p-3 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors">
                <div className="flex items-center gap-1.5 mb-1">
                  <Clock className="h-3.5 w-3.5 text-amber-500" />
                  <p className="text-[10px] font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                    Collection Rate
                  </p>
                </div>
                <p className="text-lg font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                  {data.monthPercentage}%
                </p>
                <p className="text-[10px] text-amber-500/80">monthly target</p>
              </div>
            </div>

            {/* ── Top Collectors ── */}
            {data.topCollectors.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Top Collectors (This Month)
                  </p>
                </div>
                <div className="space-y-1.5">
                  {data.topCollectors.slice(0, 3).map((c, i) => (
                    <div
                      key={c.name}
                      className="flex items-center justify-between px-2 py-1 rounded-md hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-muted-foreground w-4">
                          {i + 1}.
                        </span>
                        <span className="text-[11px] font-medium text-foreground truncate max-w-[120px]">
                          {c.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">
                          {c.count} txn
                        </span>
                        <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {formatINR(c.collected)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Footer ── */}
            <p className="text-[10px] text-muted-foreground/60 text-right">
              Auto-refreshes every 120s
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
