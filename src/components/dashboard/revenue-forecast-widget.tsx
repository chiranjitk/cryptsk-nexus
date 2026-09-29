"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { IndianRupee, TrendingUp, TrendingDown, ArrowUpRight, RefreshCw, ChevronRight } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { formatINR } from "@/lib/utils";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";

// ── Types ──────────────────────────────────────────────────────────

interface ForecastSummary {
  currentMRR: number;
  currentARR: number;
  historicalMRR: { month: string; revenue: number }[];
  forecast: {
    days30: { mrr: number; optimistic: number; pessimistic: number };
    days90: { mrr: number; optimistic: number; pessimistic: number };
  };
  growthMetrics: {
    growthRate: number;
    churnRate: number;
    netGrowthPerMonth: number;
  };
  outstandingReceivables: number;
}

// ── Theme Colors ───────────────────────────────────────────────────

const THEME_RED = "#DC2626";
const THEME_GREEN = "#16A34A";

// ── Compact number formatting ──────────────────────────────────────

function formatCompact(amount: number): string {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
  return `₹${amount}`;
}

// ── Mini Tooltip ───────────────────────────────────────────────────

function MiniTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { value: number; name: string; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card/95 border border-border/80 rounded-lg shadow-xl px-3 py-2 text-[10px] backdrop-blur-md">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((item, i) => (
        <p key={i} className="text-muted-foreground flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: item.color }} />
          <span className="font-semibold text-foreground tabular-nums">{formatINR(item.value)}</span>
        </p>
      ))}
    </div>
  );
}

// ── Widget Component ───────────────────────────────────────────────

export function RevenueForecastWidget() {
  const { setCurrentPage } = useAppStore();
  const [data, setData] = useState<ForecastSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [hasError, setHasError] = useState(false);

  const fetchData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setIsRefetching(true);
    setHasError(false);
    try {
      const res = await fetch("/api/revenue/forecast", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setData(json);
    } catch {
      setHasError(true);
    } finally {
      setIsLoading(false);
      setIsRefetching(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 120 seconds
  useEffect(() => {
    const interval = setInterval(() => fetchData(true), 120000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const projectedMRR90 = data?.forecast?.days90?.mrr || 0;
  const mrrGrowthPercent = data?.currentMRR
    ? Math.round(((projectedMRR90 - data.currentMRR) / data.currentMRR) * 10000) / 100
    : 0;
  const growthRate = data?.growthMetrics?.growthRate || 0;

  const handleViewForecast = () => {
    setCurrentPage("Revenue Forecast", "FINANCE");
  };

  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-red-100 dark:bg-red-950/40">
              <IndianRupee className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
            Revenue Forecast
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => fetchData(true)}
              disabled={isRefetching}
              aria-label="Refresh forecast"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-16 rounded-lg" />
            <div className="grid grid-cols-3 gap-2">
              <Skeleton className="h-12 rounded-lg" />
              <Skeleton className="h-12 rounded-lg" />
              <Skeleton className="h-12 rounded-lg" />
            </div>
            <Skeleton className="h-32 rounded-lg" />
          </div>
        ) : data ? (
          <>
            {/* ── Current MRR Hero ── */}
            <div className="rounded-lg border border-border/60 bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-950/20 dark:to-orange-950/20 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Monthly Recurring Revenue
                  </p>
                  <p className="text-2xl font-bold text-foreground tabular-nums mt-1">
                    {formatINR(data.currentMRR)}
                  </p>
                </div>
                <div
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold ${
                    mrrGrowthPercent >= 0
                      ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
                      : "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400"
                  }`}
                >
                  {mrrGrowthPercent >= 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {mrrGrowthPercent >= 0 ? "+" : ""}
                  {mrrGrowthPercent}%
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                Projected 90d: <span className="font-semibold text-foreground">{formatINR(projectedMRR90)}</span>
              </p>
            </div>

            {/* ── Stats Row ── */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-border/60 p-2.5 hover:bg-muted/40 transition-colors">
                <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">
                  Growth Rate
                </p>
                <p className="text-sm font-bold text-emerald-600 tabular-nums mt-0.5">
                  {growthRate}%
                </p>
              </div>
              <div className="rounded-lg border border-border/60 p-2.5 hover:bg-muted/40 transition-colors">
                <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">
                  ARR
                </p>
                <p className="text-sm font-bold text-foreground tabular-nums mt-0.5">
                  {formatCompact(data.currentARR)}
                </p>
              </div>
              <div className="rounded-lg border border-border/60 p-2.5 hover:bg-muted/40 transition-colors">
                <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">
                  Receivables
                </p>
                <p className="text-sm font-bold text-rose-600 tabular-nums mt-0.5">
                  {formatCompact(data.outstandingReceivables)}
                </p>
              </div>
            </div>

            {/* ── Mini MRR Trend Chart ── */}
            <div className="h-[120px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.historicalMRR} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="mrrMiniGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={THEME_RED} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={THEME_RED} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <RechartsTooltip content={<MiniTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke={THEME_RED}
                    fill="url(#mrrMiniGrad)"
                    strokeWidth={2}
                    dot={{ r: 2.5, fill: THEME_RED, stroke: "#fff", strokeWidth: 1.5 }}
                    activeDot={{ r: 4, fill: THEME_RED, stroke: "#fff", strokeWidth: 2 }}
                    name="MRR"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* ── View Forecast Link ── */}
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2 text-xs border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-300 btn-press"
              onClick={handleViewForecast}
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
              View Full Forecast
              <ChevronRight className="h-3 w-3 ml-auto opacity-50" />
            </Button>

            <p className="text-[10px] text-muted-foreground/60 text-right">
              Auto-refreshes every 120s
            </p>
          </>
        ) : hasError ? (
          <div className="flex flex-col items-center justify-center h-[200px] text-sm text-muted-foreground gap-3">
            <p>Failed to load forecast data</p>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => fetchData(true)}
              disabled={isRefetching}
            >
              <RefreshCw className={`h-3 w-3 mr-1.5 ${isRefetching ? "animate-spin" : ""}`} />
              Retry
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
            No forecast data available
          </div>
        )}
      </CardContent>
    </Card>
  );
}
