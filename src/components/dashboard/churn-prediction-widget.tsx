"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldAlert, RefreshCw, ChevronRight, TrendingDown, IndianRupee } from "lucide-react";
import { cn, formatINR } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";

// ─── Types ──────────────────────────────────────────────────

interface ChurnAnalyticsData {
  riskDistribution: { CRITICAL: number; HIGH: number; MEDIUM: number; LOW: number };
  revenueAtRisk: number;
  totalActiveSubscribers: number;
}

// ─── Churn Prediction Widget ────────────────────────────────

export function ChurnPredictionWidget() {
  const [data, setData] = useState<ChurnAnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);

  const fetchData = useCallback(
    async (showLoading = false) => {
      if (showLoading) setIsLoading(true);
      else setIsRefetching(true);

      try {
        const res = await fetch("/api/churn/analytics", {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to fetch churn analytics");
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error("Churn Prediction Widget fetch error:", err);
      } finally {
        setIsLoading(false);
        setIsRefetching(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchData(true);
    intervalRef.current = setInterval(() => fetchData(false), 120000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  const handleViewAll = () => {
    setCurrentPage("Churn Prediction", "AI INTELLIGENCE");
  };

  const totalAtRisk = data
    ? (data.riskDistribution.CRITICAL || 0) + (data.riskDistribution.HIGH || 0)
    : 0;

  // ── Loading Skeleton ──
  if (isLoading) {
    return (
      <Card className="border shadow-sm rounded-xl animate-card-enter">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-7 rounded-md" />
              <Skeleton className="h-5 w-44" />
            </div>
            <Skeleton className="h-7 w-7 rounded-md" />
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-28 rounded-lg" />
          <Skeleton className="h-8 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const distribution = [
    { label: "Critical", count: data.riskDistribution.CRITICAL || 0, color: "bg-red-600", barColor: "bg-red-500" },
    { label: "High", count: data.riskDistribution.HIGH || 0, color: "bg-red-400", barColor: "bg-red-400" },
    { label: "Medium", count: data.riskDistribution.MEDIUM || 0, color: "bg-amber-500", barColor: "bg-amber-500" },
    { label: "Low", count: data.riskDistribution.LOW || 0, color: "bg-teal-500", barColor: "bg-teal-500" },
  ];

  const maxCount = Math.max(...distribution.map((d) => d.count), 1);

  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter hover:shadow-md transition-all duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-red-100 dark:bg-red-950/40 relative">
              <ShieldAlert className="h-4 w-4 text-red-600 dark:text-red-400" />
              {totalAtRisk > 0 && (
                <span className="absolute -top-1 -right-1 flex items-center justify-center h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                </span>
              )}
            </div>
            Churn Prediction
            {totalAtRisk > 0 && (
              <Badge
                variant="secondary"
                className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400"
              >
                {totalAtRisk} at risk
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => fetchData(false)}
            disabled={isRefetching}
            aria-label="Refresh churn prediction"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isRefetching && "animate-spin")} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">
        {/* ── Summary Stats ── */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border/60 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingDown className="h-3.5 w-3.5 text-red-500" />
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">High Risk</span>
            </div>
            <p className="text-xl font-bold text-red-600 dark:text-red-400 tabular-nums">
              {totalAtRisk}
            </p>
          </div>
          <div className="rounded-lg border border-border/60 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <IndianRupee className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Revenue at Risk</span>
            </div>
            <p className="text-sm font-bold text-amber-600 dark:text-amber-400 tabular-nums">
              {formatINR(data.revenueAtRisk)}
            </p>
          </div>
        </div>

        {/* ── Risk Distribution Bar Chart ── */}
        <div className="rounded-lg border border-border/60 p-3 space-y-2.5">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Risk Distribution</p>
          <div className="space-y-2">
            {distribution.map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <span className="text-[10px] font-medium text-muted-foreground w-14 shrink-0">{item.label}</span>
                <div className="flex-1 h-5 bg-muted/40 rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all duration-500", item.barColor)}
                    style={{ width: `${maxCount > 0 ? (item.count / maxCount) * 100 : 0}%`, minWidth: item.count > 0 ? "4px" : "0" }}
                  />
                </div>
                <span className="text-[10px] font-bold tabular-nums w-5 text-right">{item.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── View All Button ── */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full h-8 text-xs text-muted-foreground hover:text-foreground gap-1"
          onClick={handleViewAll}
        >
          View Churn Prediction
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>

        <p className="text-[10px] text-muted-foreground/60 text-right">
          Auto-refreshes every 120s
        </p>
      </CardContent>
    </Card>
  );
}
