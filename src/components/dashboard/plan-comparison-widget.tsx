"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { RefreshCw, BarChart3 } from "lucide-react";
import { formatINR } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────

interface PlanStat {
  planName: string;
  subscriberCount: number;
  totalRevenue: number;
  avgRevenuePerSubscriber: number;
}

interface PlanComparisonResponse {
  plans: PlanStat[];
}

// ─── Color palette for bars ─────────────────────────────────────

const BAR_COLORS = [
  { bar: "#DC2626", gradient: "from-red-500 to-red-600" },     // red
  { bar: "#0D9488", gradient: "from-teal-500 to-teal-600" },   // teal
  { bar: "#D97706", gradient: "from-amber-500 to-amber-600" },  // amber
  { bar: "#16A34A", gradient: "from-emerald-500 to-emerald-600" }, // emerald
  { bar: "#E11D48", gradient: "from-rose-500 to-rose-600" },    // rose
  { bar: "#059669", gradient: "from-emerald-600 to-emerald-700" }, // emerald-dark
  { bar: "#EA580C", gradient: "from-orange-500 to-orange-600" }, // orange
  { bar: "#DB2777", gradient: "from-pink-500 to-pink-600" },    // pink
];

// ─── Loading Skeleton ───────────────────────────────────────────

export function PlanComparisonWidgetSkeleton() {
  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-7 rounded-md" />
          <Skeleton className="h-5 w-40" />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3.5 w-10" />
              </div>
              <Skeleton className="h-3 w-full rounded-full" />
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))}
          <Skeleton className="h-4 w-40 mt-2" />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Plan Comparison Widget ─────────────────────────────────────

export function PlanComparisonWidget() {
  const [data, setData] = useState<PlanComparisonResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    else setIsRefetching(true);

    try {
      const res = await fetch("/api/dashboard/plan-comparison", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch plan comparison");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Plan comparison fetch error:", err);
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

  const plans = data?.plans ?? [];
  const maxSubscriberCount = plans.length > 0 ? plans[0].subscriberCount : 1;
  const totalSubscribers = plans.reduce((sum, p) => sum + p.subscriberCount, 0);
  const totalRevenue = plans.reduce((sum, p) => sum + p.totalRevenue, 0);

  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter hover:shadow-md hover:border-emerald-200 dark:hover:border-emerald-800/50 transition-all duration-200">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-emerald-100 dark:bg-emerald-950/40">
              <BarChart3 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            Plan Comparison
            <span className="text-[10px] font-medium text-muted-foreground">
              {plans.length} plan{plans.length !== 1 ? "s" : ""}
            </span>
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={handleRefresh}
            disabled={isRefetching}
            aria-label="Refresh plan comparison"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <PlanComparisonWidgetSkeleton />
        ) : plans.length > 0 ? (
          <div className="space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar">
            {plans.map((plan, index) => {
              const color = BAR_COLORS[index % BAR_COLORS.length];
              const widthPct =
                maxSubscriberCount > 0
                  ? Math.max(4, (plan.subscriberCount / maxSubscriberCount) * 100)
                  : 0;
              const pctOfTotal =
                totalSubscribers > 0
                  ? ((plan.subscriberCount / totalSubscribers) * 100).toFixed(1)
                  : "0";

              return (
                <div key={plan.planName} className="space-y-1.5">
                  {/* Plan name + subscriber count */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: color.bar }}
                      />
                      <span className="text-xs font-semibold text-foreground truncate">
                        {plan.planName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {pctOfTotal}%
                      </span>
                      <span className="text-xs font-bold text-foreground tabular-nums">
                        {plan.subscriberCount}
                      </span>
                    </div>
                  </div>

                  {/* Horizontal bar */}
                  <div className="h-3 w-full rounded-full bg-muted/80 dark:bg-muted/50 overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${color.gradient} transition-all duration-700 ease-out`}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>

                  {/* Revenue details */}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">
                      Total:{" "}
                      <span className="font-semibold text-foreground tabular-nums">
                        {formatINR(plan.totalRevenue)}
                      </span>
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      Avg:{" "}
                      <span className="font-semibold text-foreground tabular-nums">
                        {formatINR(plan.avgRevenuePerSubscriber)}
                      </span>
                      <span className="text-muted-foreground">/sub</span>
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Totals */}
            <div className="pt-2 mt-1 border-t border-border/60 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">Total Subscribers</span>
                <span className="text-xs font-bold text-foreground tabular-nums">
                  {totalSubscribers.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">Total Revenue</span>
                <span className="text-xs font-bold text-foreground tabular-nums">
                  {formatINR(totalRevenue)}
                </span>
              </div>
            </div>

            {/* Footer */}
            <p className="text-[10px] text-muted-foreground/60 text-right">
              Auto-refreshes every 120s
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            <div className="p-3 rounded-full bg-muted/50">
              <BarChart3 className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              No plan comparison data available
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
