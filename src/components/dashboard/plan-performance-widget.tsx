"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, TrendingUp, Users, Trophy, Zap } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  Cell,
} from "recharts";
import { formatINR, cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────

interface PlanData {
  id: string;
  name: string;
  category: string;
  categoryLabel: string;
  downloadSpeed: number;
  uploadSpeed: number;
  speedUnit: string;
  priceMonthly: number;
  subscriberCount: number;
  totalRevenue: number;
  utilizationPercent: number;
}

interface CategoryData {
  category: string;
  label: string;
  count: number;
  percentage: number;
}

interface PlanPerformanceResponse {
  plans: PlanData[];
  categories: CategoryData[];
  totalPlans: number;
  totalSubscribers: number;
  totalRevenue: number;
  mostPopular: PlanData | null;
  highestRevenue: PlanData | null;
  averagePrice: number;
  timestamp: string;
}

// ─── Bar color palette ──────────────────────────────────────────

const BAR_COLORS = [
  "#DC2626", // red-600
  "#0D9488", // teal-600
  "#D97706", // amber-600
  "#059669", // emerald-600
  "#F43F5E", // rose-500
  "#EA580C", // orange-600
  "#8B5CF6", // violet-500
  "#14B8A6", // teal-500
];

// ─── Category icon/color mapping ────────────────────────────────

const CATEGORY_STYLES: Record<string, { color: string; bgColor: string; dotColor: string }> = {
  FTTH: { color: "text-emerald-600 dark:text-emerald-400", bgColor: "bg-emerald-50 dark:bg-emerald-950/40", dotColor: "#059669" },
  WIRELESS: { color: "text-amber-600 dark:text-amber-400", bgColor: "bg-amber-50 dark:bg-amber-950/40", dotColor: "#D97706" },
  CABLE: { color: "text-teal-600 dark:text-teal-400", bgColor: "bg-teal-50 dark:bg-teal-950/40", dotColor: "#0D9488" },
  LEASED_LINE: { color: "text-red-600 dark:text-red-400", bgColor: "bg-red-50 dark:bg-red-950/40", dotColor: "#DC2626" },
  HOTSPOT: { color: "text-orange-600 dark:text-orange-400", bgColor: "bg-orange-50 dark:bg-orange-950/40", dotColor: "#EA580C" },
  COMBO: { color: "text-rose-600 dark:text-rose-400", bgColor: "bg-rose-50 dark:bg-rose-950/40", dotColor: "#F43F5E" },
};

function getCategoryStyle(category: string) {
  return CATEGORY_STYLES[category] ?? { color: "text-gray-600", bgColor: "bg-gray-50", dotColor: "#6B7280" };
}

// ─── Speed formatter ────────────────────────────────────────────

function formatSpeed(kbps: number, unit: string): string {
  if (unit === "MBPS") return `${kbps >= 1000 ? `${(kbps / 1000).toFixed(0)}G` : `${kbps}M`}bps`;
  if (unit === "GBPS") return `${kbps}Gbps`;
  return `${kbps}Kbps`;
}

// ─── Custom Bar Tooltip ─────────────────────────────────────────

function BarTooltip({ active, payload }: { active?: boolean; payload?: { payload: PlanData }[] }) {
  if (!active || !payload?.length) return null;
  const plan = payload[0].payload;
  return (
    <div className="bg-card/90 border border-border/80 rounded-xl shadow-2xl px-4 py-3 text-xs backdrop-blur-md">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="font-semibold text-foreground">{plan.name}</span>
        <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 font-medium bg-muted/60">
          {plan.categoryLabel}
        </Badge>
      </div>
      <p className="text-muted-foreground">
        Subscribers: <span className="font-semibold text-foreground tabular-nums">{plan.subscriberCount}</span>
      </p>
      <p className="text-muted-foreground">
        Revenue: <span className="font-semibold text-foreground tabular-nums">{formatINR(plan.totalRevenue)}</span>
        <span className="text-muted-foreground">/mo</span>
      </p>
      <p className="text-muted-foreground">
        Price: <span className="font-semibold text-foreground tabular-nums">{formatINR(plan.priceMonthly)}</span>
        <span className="text-muted-foreground">/mo</span>
      </p>
      <p className="text-muted-foreground">
        Speed: <span className="font-semibold text-foreground">{formatSpeed(plan.downloadSpeed, plan.speedUnit)}</span>
        {" / "}
        <span className="font-semibold text-foreground">{formatSpeed(plan.uploadSpeed, plan.speedUnit)}</span>
      </p>
    </div>
  );
}

// ─── Loading Skeleton ───────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {/* Metric cards skeleton */}
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border/50 p-3 space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-3 w-14" />
          </div>
        ))}
      </div>
      {/* Bar chart skeleton */}
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-4 w-24 shrink-0" />
            <Skeleton className="h-5 flex-1 rounded" />
            <Skeleton className="h-4 w-12 shrink-0" />
          </div>
        ))}
      </div>
      {/* Category row skeleton */}
      <div className="flex gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 flex-1 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

// ─── Plan Performance Widget ────────────────────────────────────

export function PlanPerformanceWidget() {
  const [data, setData] = useState<PlanPerformanceResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    else setIsRefetching(true);

    try {
      const res = await fetch("/api/plans/performance", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch plan performance data");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Plan performance fetch error:", err);
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

  // Top 8 plans by subscriber count for bar chart
  const topPlans = data?.plans.slice(0, 8) ?? [];
  const maxSubCount = topPlans.length > 0 ? topPlans[0].subscriberCount : 1;

  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter hover:shadow-md hover:border-red-200 dark:hover:border-red-800/50 transition-all duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-red-400 to-rose-500 text-white shadow-sm">
              <TrendingUp className="h-3.5 w-3.5" />
            </div>
            Plan Performance
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 font-medium bg-muted/60 tabular-nums">
              {data?.totalPlans ?? 0} plans
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={handleRefresh}
              disabled={isRefetching}
              aria-label="Refresh plan performance data"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isRefetching && "animate-spin")} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <LoadingSkeleton />
        ) : data && data.plans.length > 0 ? (
          <div className="flex flex-col gap-5">
            {/* ── Section 1: Top Performing Plans (3 metric cards) ── */}
            <div className="grid grid-cols-3 gap-3">
              {/* Most Popular Plan */}
              <div className="rounded-lg border border-border/50 p-3 bg-gradient-to-br from-red-50/50 to-transparent dark:from-red-950/20 dark:to-transparent">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Users className="h-3.5 w-3.5 text-red-500" />
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Most Popular
                  </span>
                </div>
                {data.mostPopular ? (
                  <>
                    <p className="text-sm font-semibold text-foreground truncate" title={data.mostPopular.name}>
                      {data.mostPopular.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                      {data.mostPopular.subscriberCount} subscribers
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">N/A</p>
                )}
              </div>

              {/* Highest Revenue Plan */}
              <div className="rounded-lg border border-border/50 p-3 bg-gradient-to-br from-emerald-50/50 to-transparent dark:from-emerald-950/20 dark:to-transparent">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Trophy className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Top Revenue
                  </span>
                </div>
                {data.highestRevenue ? (
                  <>
                    <p className="text-sm font-semibold text-foreground truncate" title={data.highestRevenue.name}>
                      {data.highestRevenue.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                      {formatINR(data.highestRevenue.totalRevenue)}/mo
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">N/A</p>
                )}
              </div>

              {/* Average Plan Price */}
              <div className="rounded-lg border border-border/50 p-3 bg-gradient-to-br from-amber-50/50 to-transparent dark:from-amber-950/20 dark:to-transparent">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Zap className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Avg Price
                  </span>
                </div>
                <p className="text-sm font-semibold text-foreground tabular-nums">
                  {formatINR(data.averagePrice)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">per month</p>
              </div>
            </div>

            {/* ── Section 2: Plan Distribution Bar Chart (top 8) ── */}
            {topPlans.length > 0 && (
              <div className="space-y-0">
                <p className="text-xs font-medium text-muted-foreground mb-2.5 uppercase tracking-wider">
                  Top Plans by Subscribers
                </p>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                  {topPlans.map((plan, index) => (
                    <div key={plan.id} className="flex items-center gap-3 group">
                      {/* Plan name */}
                      <div className="w-[140px] shrink-0 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors" title={plan.name}>
                          {plan.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground tabular-nums">
                          {formatINR(plan.priceMonthly)}/mo
                        </p>
                      </div>

                      {/* Bar */}
                      <div className="flex-1 min-w-0">
                        <div className="h-6 rounded-md overflow-hidden bg-muted/50 relative">
                          <div
                            className="h-full rounded-md transition-all duration-700 ease-out"
                            style={{
                              width: `${Math.max((plan.subscriberCount / maxSubCount) * 100, 4)}%`,
                              backgroundColor: BAR_COLORS[index % BAR_COLORS.length],
                              opacity: 0.85,
                            }}
                          />
                          {/* Count label inside bar */}
                          <span className="absolute inset-0 flex items-center pl-2 text-[10px] font-semibold text-white tabular-nums">
                            {plan.subscriberCount}
                          </span>
                        </div>
                      </div>

                      {/* Speed badge */}
                      <Badge
                        variant="secondary"
                        className="text-[9px] px-1.5 py-0 h-5 font-medium bg-muted/60 shrink-0 tabular-nums"
                      >
                        {formatSpeed(plan.downloadSpeed, plan.speedUnit)}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Section 3: Plan Category Breakdown ── */}
            {data.categories.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2.5 uppercase tracking-wider">
                  Category Breakdown
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {data.categories.map((cat) => {
                    const style = getCategoryStyle(cat.category);
                    return (
                      <div
                        key={cat.category}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg border border-border/50 px-3 py-2",
                          style.bgColor
                        )}
                      >
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: style.dotColor }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-xs font-medium truncate", style.color)}>
                            {cat.label}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {/* Mini percentage bar */}
                            <div className="h-1 w-12 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${Math.max(cat.percentage, 2)}%`,
                                  backgroundColor: style.dotColor,
                                  opacity: 0.7,
                                }}
                              />
                            </div>
                            <span className="text-[10px] text-muted-foreground tabular-nums">
                              {cat.count}
                            </span>
                            <span className="text-[9px] text-muted-foreground/70 tabular-nums">
                              ({cat.percentage}%)
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Footer ── */}
            <div className="flex items-center justify-between pt-1">
              <p className="text-[10px] text-muted-foreground/60">
                {data.totalSubscribers} total subscribers across {data.totalPlans} plans
              </p>
              <p className="text-[10px] text-muted-foreground/60">
                Auto-refreshes every 120s
              </p>
            </div>
          </div>
        ) : data && data.plans.length === 0 ? (
          <div className="flex flex-col items-center py-8 gap-3">
            <div className="p-3 rounded-full bg-muted/50">
              <TrendingUp className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              No active plans found.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
