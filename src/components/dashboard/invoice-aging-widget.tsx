"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  RefreshCw,
  Clock,
  TrendingDown,
  PieChart,
  FileText,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { formatINR } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────

interface ApiBucket {
  label: string;
  daysMin: number;
  daysMax: number;
  count: number;
  totalAmount: number;
  totalBalance: number;
}

interface TopOverdue {
  invoiceNumber: string;
  subscriberName: string;
  balance: number;
  dueDate: string;
  daysOverdue: number;
}

interface InvoiceAgingResponse {
  buckets: ApiBucket[];
  dso: { days: number; trend: "neutral" | "up" | "down" };
  collectionEfficiency: number;
  totalOutstanding: number;
  topOverdue: TopOverdue[];
  timestamp: string;
}

// ─── Constants ──────────────────────────────────────────────────

const BUCKET_COLORS: Record<string, string> = {
  "Current (0-30)": "#14B8A6",
  "31-60 Days": "#D97706",
  "61-90 Days": "#DC2626",
  "90+ Days": "#991B1B",
};

const BUCKET_BG_COLORS: Record<string, string> = {
  "Current (0-30)": "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-400 dark:border-teal-800",
  "31-60 Days": "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800",
  "61-90 Days": "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800",
  "90+ Days": "bg-red-100 text-red-900 border-red-300 dark:bg-red-950/60 dark:text-red-300 dark:border-red-700",
};

// ─── Helpers ────────────────────────────────────────────────────

function mapToDisplayBuckets(apiBuckets: ApiBucket[]) {
  // Combine API "Current" and "1-30 Days" into single "Current (0-30)" bucket
  const current = apiBuckets.find((b) => b.label === "Current");
  const oneToThirty = apiBuckets.find((b) => b.label === "1-30 Days");
  const thirtyOneToSixty = apiBuckets.find((b) => b.label === "31-60 Days");
  const sixtyOneToNinety = apiBuckets.find((b) => b.label === "61-90 Days");
  const ninetyPlus = apiBuckets.find((b) => b.label === "90+ Days");

  return [
    {
      label: "Current (0-30)",
      count: (current?.count ?? 0) + (oneToThirty?.count ?? 0),
      totalBalance: (current?.totalBalance ?? 0) + (oneToThirty?.totalBalance ?? 0),
    },
    {
      label: "31-60 Days",
      count: thirtyOneToSixty?.count ?? 0,
      totalBalance: thirtyOneToSixty?.totalBalance ?? 0,
    },
    {
      label: "61-90 Days",
      count: sixtyOneToNinety?.count ?? 0,
      totalBalance: sixtyOneToNinety?.totalBalance ?? 0,
    },
    {
      label: "90+ Days",
      count: ninetyPlus?.count ?? 0,
      totalBalance: ninetyPlus?.totalBalance ?? 0,
    },
  ];
}

// ─── Custom Tooltip ─────────────────────────────────────────────

function AgingTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; payload: { label: string; count: number; totalBalance: number } }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const data = item.payload;
  return (
    <div className="bg-card/90 border border-border/80 rounded-xl shadow-2xl px-4 py-3 text-xs backdrop-blur-md">
      <p className="font-semibold text-foreground mb-1.5 text-[11px]">{label}</p>
      <p className="text-muted-foreground flex items-center justify-between gap-4 py-0.5">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-sm"
            style={{ backgroundColor: BUCKET_COLORS[label ?? ""] ?? "#94A3B8" }}
          />
          Outstanding
        </span>
        <span className="font-semibold text-foreground tabular-nums">
          {formatINR(data.totalBalance)}
        </span>
      </p>
      <p className="text-muted-foreground flex items-center justify-between gap-4 py-0.5">
        <span>Invoices</span>
        <span className="font-semibold text-foreground tabular-nums">{data.count}</span>
      </p>
    </div>
  );
}

// ─── Loading Skeleton ───────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-7 rounded-md" />
            <Skeleton className="h-5 w-44" />
          </div>
          <Skeleton className="h-7 w-7 rounded-md" />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Summary stats skeleton */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        {/* Stacked bar skeleton */}
        <Skeleton className="h-5 w-full rounded-full mb-4" />
        {/* Chart skeleton */}
        <Skeleton className="h-48 w-full rounded-lg" />
      </CardContent>
    </Card>
  );
}

// ─── Invoice Aging Widget ───────────────────────────────────────

export function InvoiceAgingWidget() {
  const [data, setData] = useState<InvoiceAgingResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    else setIsRefetching(true);

    try {
      const res = await fetch("/api/dashboard/invoice-aging", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch invoice aging data");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Invoice aging fetch error:", err);
    } finally {
      setIsLoading(false);
      setIsRefetching(false);
    }
  }, []);

  // Initial fetch + auto-refresh every 120 seconds
  useEffect(() => {
    fetchData(true);
    intervalRef.current = setInterval(() => fetchData(false), 120000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  const handleRefresh = useCallback(() => {
    fetchData(false);
  }, [fetchData]);

  if (isLoading) return <LoadingSkeleton />;

  if (!data) {
    return (
      <Card className="border shadow-sm rounded-xl animate-card-enter">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-red-400 to-rose-500 text-white shadow-sm">
              <PieChart className="h-3.5 w-3.5" />
            </div>
            Invoice Aging
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-col items-center py-8 gap-3">
            <div className="p-3 rounded-full bg-muted/50">
              <AlertTriangle className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Unable to load invoice aging data.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={handleRefresh}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const displayBuckets = mapToDisplayBuckets(data.buckets);
  const totalBalance = displayBuckets.reduce((sum, b) => sum + b.totalBalance, 0);
  const hasData = totalBalance > 0;

  // Compute percentage breakdown for the summary
  const overdueBalance =
    (displayBuckets[1]?.totalBalance ?? 0) +
    (displayBuckets[2]?.totalBalance ?? 0) +
    (displayBuckets[3]?.totalBalance ?? 0);
  const overduePercent = totalBalance > 0 ? Math.round((overdueBalance / totalBalance) * 1000) / 10 : 0;

  // DSO badge color
  const dsoColor =
    data.dso.days <= 30
      ? "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-400 dark:border-teal-800"
      : data.dso.days <= 60
        ? "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800"
        : "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800";

  // Collection efficiency badge color
  const ceColor =
    data.collectionEfficiency >= 90
      ? "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-400 dark:border-teal-800"
      : data.collectionEfficiency >= 70
        ? "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800"
        : "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800";

  // Chart data
  const chartData = displayBuckets.map((b) => ({
    label: b.label,
    totalBalance: b.totalBalance,
    count: b.count,
  }));

  // Stacked bar segments
  const stackedSegments = hasData
    ? displayBuckets
        .filter((b) => b.totalBalance > 0)
        .map((b) => ({
          label: b.label,
          percentage: totalBalance > 0 ? (b.totalBalance / totalBalance) * 100 : 0,
          color: BUCKET_COLORS[b.label] ?? "#94A3B8",
        }))
    : [];

  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter hover:shadow-md hover:border-red-200 dark:hover:border-red-800/50 transition-all duration-200">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-red-400 to-rose-500 text-white shadow-sm">
              <PieChart className="h-3.5 w-3.5" />
            </div>
            Invoice Aging
            <span className="text-[10px] font-medium text-muted-foreground">
              Outstanding Breakdown
            </span>
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={handleRefresh}
            disabled={isRefetching}
            aria-label="Refresh invoice aging data"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {/* ── Summary stats ── */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {/* Total Outstanding */}
          <div className="rounded-lg bg-muted/50 dark:bg-muted/30 px-3 py-2.5 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <FileText className="h-3 w-3 text-red-500" />
              <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">
                Total Outstanding
              </p>
            </div>
            <p className="text-sm font-bold text-red-600 dark:text-red-400 tabular-nums">
              {formatINR(data.totalOutstanding)}
            </p>
            <p className="text-[9px] text-muted-foreground mt-0.5">
              {overduePercent}% overdue
            </p>
          </div>

          {/* DSO */}
          <div className="rounded-lg bg-muted/50 dark:bg-muted/30 px-3 py-2.5 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Clock className="h-3 w-3 text-amber-500" />
              <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">
                DSO
              </p>
            </div>
            <Badge
              variant="outline"
              className={`text-xs font-bold tabular-nums ${dsoColor}`}
            >
              {data.dso.days} days
            </Badge>
            <p className="text-[9px] text-muted-foreground mt-0.5">Days Sales Outstanding</p>
          </div>

          {/* Collection Efficiency */}
          <div className="rounded-lg bg-muted/50 dark:bg-muted/30 px-3 py-2.5 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <TrendingDown className="h-3 w-3 text-teal-500" />
              <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">
                Collection Eff.
              </p>
            </div>
            <Badge
              variant="outline"
              className={`text-xs font-bold tabular-nums ${ceColor}`}
            >
              {data.collectionEfficiency}%
            </Badge>
          </div>
        </div>

        {/* ── Horizontal Stacked Bar ── */}
        {hasData && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Aging Distribution
              </p>
              <p className="text-[10px] text-muted-foreground tabular-nums">
                {formatINR(totalBalance)} total
              </p>
            </div>
            <div className="flex w-full h-5 rounded-full overflow-hidden bg-muted/30 gap-px">
              {stackedSegments.map((seg) => (
                <div
                  key={seg.label}
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${seg.percentage}%`,
                    backgroundColor: seg.color,
                    minWidth: seg.percentage > 0 ? "4px" : "0px",
                  }}
                  title={`${seg.label}: ${seg.percentage.toFixed(1)}%`}
                />
              ))}
            </div>
            {/* Bucket legend below stacked bar */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
              {displayBuckets.map((b) => {
                const pct = totalBalance > 0 ? (b.totalBalance / totalBalance) * 100 : 0;
                return (
                  <div key={b.label} className="flex items-center gap-1.5">
                    <span
                      className="inline-block w-2 h-2 rounded-sm"
                      style={{ backgroundColor: BUCKET_COLORS[b.label] ?? "#94A3B8" }}
                    />
                    <span className="text-[9px] text-muted-foreground">
                      {b.label}
                    </span>
                    <span className="text-[9px] font-semibold text-foreground tabular-nums">
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Bar Chart ── */}
        {hasData ? (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#94A3B8", fontSize: 9 }}
                  interval={0}
                  tickFormatter={(v: string) => v}
                />
                <YAxis
                  tick={{ fill: "#94A3B8", fontSize: 9 }}
                  tickFormatter={(v: number) => {
                    if (v >= 100000) return `${(v / 100000).toFixed(0)}L`;
                    if (v >= 1000) return `${(v / 1000).toFixed(0)}K`;
                    return `${v}`;
                  }}
                  width={45}
                />
                <RechartsTooltip content={<AgingTooltip />} />
                <Bar
                  dataKey="totalBalance"
                  name="Outstanding"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={40}
                >
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={BUCKET_COLORS[entry.label] ?? "#94A3B8"}
                      className="transition-all duration-200"
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-xs text-muted-foreground gap-3">
            <div className="p-3 rounded-full bg-muted/50">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              No outstanding invoices found.
            </p>
          </div>
        )}

        {/* ── Top Overdue Invoices ── */}
        {data.topOverdue.length > 0 && (
          <div className="mt-4 border-t border-border/50 pt-3">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Top Overdue Invoices
            </p>
            <div className="space-y-1.5 max-h-36 overflow-y-auto custom-scrollbar">
              {data.topOverdue.map((inv) => (
                <div
                  key={inv.invoiceNumber}
                  className="flex items-center justify-between px-2 py-1.5 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-mono text-muted-foreground truncate">
                      {inv.invoiceNumber}
                    </span>
                    <span className="text-[10px] text-muted-foreground truncate hidden sm:inline">
                      — {inv.subscriberName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <Badge
                      variant="outline"
                      className={`text-[9px] px-1.5 py-0 h-4 ${
                        inv.daysOverdue > 90
                          ? "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800"
                          : inv.daysOverdue > 60
                            ? "bg-red-100 text-red-600 border-red-200 dark:bg-red-950/40 dark:text-red-500 dark:border-red-800"
                            : inv.daysOverdue > 30
                              ? "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800"
                              : "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-400 dark:border-teal-800"
                      }`}
                    >
                      {inv.daysOverdue}d
                    </Badge>
                    <span className="text-[10px] font-semibold text-foreground tabular-nums">
                      {formatINR(inv.balance)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Percentage breakdown row ── */}
        {hasData && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <div className="grid grid-cols-4 gap-2">
              {displayBuckets.map((b) => {
                const pct = totalBalance > 0 ? (b.totalBalance / totalBalance) * 100 : 0;
                return (
                  <div key={b.label} className="text-center">
                    <Badge
                      variant="outline"
                      className={`text-[9px] px-1 py-0 h-4 font-semibold tabular-nums ${BUCKET_BG_COLORS[b.label] ?? ""}`}
                    >
                      {pct.toFixed(1)}%
                    </Badge>
                    <p className="text-[9px] font-semibold text-foreground tabular-nums mt-0.5">
                      {formatINR(b.totalBalance)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <p className="text-[10px] text-muted-foreground/60 mt-2 text-right">
          DSO: {data.dso.days} days &middot; Auto-refreshes every 120s
        </p>
      </CardContent>
    </Card>
  );
}
