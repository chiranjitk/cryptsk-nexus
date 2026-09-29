"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, RefreshCw, Wallet, Target, CalendarDays, BarChart3 } from "lucide-react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatINR } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────

interface DailyDataPoint {
  date: string;
  label: string;
  collected: number;
  target: number;
  achievement: number;
}

interface CollectionSummary {
  totalCollected: number;
  avgDaily: number;
  bestDay: {
    date: string;
    label: string;
    amount: number;
  };
  avgAchievement: number;
  daysMetTarget: number;
  daysWithData: number;
  dailyTarget: number;
  runningTotal: number;
}

interface CollectionPerformanceResponse {
  dailyData: DailyDataPoint[];
  summary: CollectionSummary;
}

// ─── Custom Tooltip ─────────────────────────────────────────────

function CollectionTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; name: string; color: string; dataKey?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card/90 border border-border/80 rounded-xl shadow-2xl px-4 py-3 text-xs backdrop-blur-md">
      <p className="font-semibold text-foreground mb-2 text-[11px]">{label}</p>
      {payload.map((item, i) => (
        <p key={i} className="text-muted-foreground flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
            {item.name}
          </span>
          <span className="font-semibold text-foreground tabular-nums">
            {item.dataKey === "achievement" ? `${item.value}%` : formatINR(item.value)}
          </span>
        </p>
      ))}
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
            <Skeleton className="h-5 w-40" />
          </div>
          <Skeleton className="h-7 w-7 rounded-md" />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Summary stats skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
        {/* Chart skeleton */}
        <Skeleton className="h-52 w-full rounded-lg" />
      </CardContent>
    </Card>
  );
}

// ─── Collection Performance Widget ──────────────────────────────

export function CollectionPerformanceWidget() {
  const [data, setData] = useState<CollectionPerformanceResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    else setIsRefetching(true);

    try {
      const res = await fetch("/api/dashboard/collection-performance", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch collection performance data");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Collection performance fetch error:", err);
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
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-400 to-green-500 text-white shadow-sm">
              <BarChart3 className="h-3.5 w-3.5" />
            </div>
            Collection Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-col items-center py-8 gap-3">
            <div className="p-3 rounded-full bg-muted/50">
              <Wallet className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Unable to load collection data.
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

  const { dailyData, summary } = data;
  const hasData = dailyData.some((d) => d.collected > 0);

  // Achievement badge color
  const achievementColor =
    summary.avgAchievement >= 100
      ? "bg-green-100 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-800"
      : summary.avgAchievement >= 75
        ? "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800"
        : summary.avgAchievement >= 50
          ? "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800"
          : "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800";

  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter hover:shadow-md hover:border-emerald-200 dark:hover:border-emerald-800/50 transition-all duration-200">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-emerald-400 to-green-500 text-white shadow-sm">
              <BarChart3 className="h-3.5 w-3.5" />
            </div>
            Collection Performance
            <span className="text-[10px] font-medium text-muted-foreground">
              Last 30 Days
            </span>
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={handleRefresh}
            disabled={isRefetching}
            aria-label="Refresh collection data"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {/* Total Collected */}
          <div className="rounded-lg bg-muted/50 dark:bg-muted/30 px-3 py-2.5 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Wallet className="h-3 w-3 text-emerald-500" />
              <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">Total Collected</p>
            </div>
            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {formatINR(summary.totalCollected)}
            </p>
          </div>

          {/* Average Daily */}
          <div className="rounded-lg bg-muted/50 dark:bg-muted/30 px-3 py-2.5 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <TrendingUp className="h-3 w-3 text-teal-500" />
              <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">Avg Daily</p>
            </div>
            <p className="text-sm font-bold text-teal-600 dark:text-teal-400 tabular-nums">
              {formatINR(summary.avgDaily)}
            </p>
          </div>

          {/* Best Day */}
          <div className="rounded-lg bg-muted/50 dark:bg-muted/30 px-3 py-2.5 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <CalendarDays className="h-3 w-3 text-amber-500" />
              <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">Best Day</p>
            </div>
            <p className="text-sm font-bold text-amber-600 dark:text-amber-400 tabular-nums">
              {summary.bestDay.amount > 0 ? formatINR(summary.bestDay.amount) : "—"}
            </p>
            {summary.bestDay.label && summary.bestDay.amount > 0 && (
              <p className="text-[9px] text-muted-foreground">{summary.bestDay.label}</p>
            )}
          </div>

          {/* Achievement Rate */}
          <div className="rounded-lg bg-muted/50 dark:bg-muted/30 px-3 py-2.5 text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Target className="h-3 w-3 text-red-500" />
              <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">Achievement</p>
            </div>
            <Badge
              variant="outline"
              className={`text-xs font-bold tabular-nums ${achievementColor}`}
            >
              {summary.avgAchievement}%
            </Badge>
            <p className="text-[9px] text-muted-foreground mt-0.5">
              {summary.daysMetTarget}/{summary.daysWithData} days met target
            </p>
          </div>
        </div>

        {/* Chart */}
        {hasData ? (
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dailyData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <defs>
                  <linearGradient id="collectionGreenGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16A34A" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#16A34A" stopOpacity={0.5} />
                  </linearGradient>
                  <linearGradient id="collectionRedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#DC2626" stopOpacity={0.7} />
                    <stop offset="95%" stopColor="#DC2626" stopOpacity={0.4} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#94A3B8", fontSize: 9 }}
                  interval="preserveStartEnd"
                  tickFormatter={(v: string) => v}
                />
                <YAxis
                  tick={{ fill: "#94A3B8", fontSize: 9 }}
                  tickFormatter={(v: number) => {
                    if (v >= 1000) return `${(v / 1000).toFixed(0)}K`;
                    return `${v}`;
                  }}
                  width={40}
                />
                <RechartsTooltip content={<CollectionTooltip />} />
                <Legend
                  iconType="plainline"
                  iconSize={12}
                  wrapperStyle={{ fontSize: "10px", paddingTop: "6px" }}
                  formatter={(value: string) => (
                    <span className="text-[10px] text-muted-foreground">{value}</span>
                  )}
                />
                {/* Bar for actual collection — green if met target, red/amber if below */}
                <Bar
                  dataKey="collected"
                  name="Collected"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={16}
                  fill="#16A34A"
                  shape={(props: Record<string, unknown>) => {
                    const { x, y, width, height, payload } = props as {
                      x: number; y: number; width: number; height: number; payload: DailyDataPoint;
                    };
                    const metTarget = payload.collected >= payload.target && payload.collected > 0;
                    const fill = metTarget ? "url(#collectionGreenGrad)" : "url(#collectionRedGrad)";
                    const stroke = metTarget ? "#16A34A" : "#DC2626";
                    return (
                      <rect
                        x={x}
                        y={y}
                        width={width}
                        height={height}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={1}
                        rx={3}
                        ry={3}
                        className="transition-all duration-200"
                      />
                    );
                  }}
                />
                {/* Line for daily target */}
                <Line
                  type="monotone"
                  dataKey="target"
                  name="Target"
                  stroke="#D97706"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={false}
                  activeDot={{ r: 3, fill: "#D97706", strokeWidth: 1, stroke: "#fff" }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-52 text-xs text-muted-foreground gap-3">
            <div className="p-3 rounded-full bg-muted/50">
              <Wallet className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              No verified payments in the last 30 days.
            </p>
          </div>
        )}

        {/* Footer */}
        <p className="text-[10px] text-muted-foreground/60 mt-2 text-right">
          Daily target: {formatINR(summary.dailyTarget)} · Auto-refreshes every 120s
        </p>
      </CardContent>
    </Card>
  );
}
