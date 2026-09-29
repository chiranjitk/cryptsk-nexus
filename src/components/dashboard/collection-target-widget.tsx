"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Target, RefreshCw, AlertTriangle, TrendingUp, CalendarDays, Banknote } from "lucide-react";
import { formatINR } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────

interface CollectionTargetResponse {
  monthlyTarget: number;
  monthCollected: number;
  collectionPercent: number;
  todayCollected: number;
  todayPaymentCount: number;
  monthPaymentCount: number;
  daysInMonth: number;
  daysElapsed: number;
  daysRemaining: number;
  dailyAvgCollected: number;
  dailyAvgNeeded: number;
  remaining: number;
  expectedByNow: number;
  onTrackPercent: number;
  status: "on_track" | "behind" | "critically_behind";
  timestamp: string;
}

// ─── Helpers ────────────────────────────────────────────────────

function statusConfig(status: string) {
  switch (status) {
    case "on_track":
      return {
        color: "#16A34A",
        bgClass: "bg-emerald-100 dark:bg-emerald-950/30",
        textClass: "text-emerald-600 dark:text-emerald-400",
        barGradient: "from-emerald-400 to-emerald-500",
        label: "On Track",
      };
    case "behind":
      return {
        color: "#D97706",
        bgClass: "bg-amber-100 dark:bg-amber-950/30",
        textClass: "text-amber-600 dark:text-amber-400",
        barGradient: "from-amber-400 to-amber-500",
        label: "Behind",
      };
    case "critically_behind":
      return {
        color: "#DC2626",
        bgClass: "bg-red-100 dark:bg-red-950/30",
        textClass: "text-red-600 dark:text-red-400",
        barGradient: "from-red-400 to-red-500",
        label: "Critically Behind",
      };
    default:
      return {
        color: "#78716C",
        bgClass: "bg-gray-100 dark:bg-gray-950/30",
        textClass: "text-gray-600 dark:text-gray-400",
        barGradient: "from-gray-400 to-gray-500",
        label: "Unknown",
      };
  }
}

// ─── Loading Skeleton ───────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-5 py-1">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      <Skeleton className="h-5 w-full rounded-full" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5 p-3 rounded-lg">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Collection Target Widget ───────────────────────────────────

export function CollectionTargetWidget() {
  const [data, setData] = useState<CollectionTargetResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    else setIsRefetching(true);
    setError(null);

    try {
      const res = await fetch("/api/dashboard/collection-target", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch collection target data");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Collection target widget fetch error:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
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

  const handleRefresh = useCallback(() => fetchData(false), [fetchData]);

  const config = data ? statusConfig(data.status) : statusConfig("on_track");

  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter hover:shadow-md hover:border-red-200 dark:hover:border-red-800/50 transition-all duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-rose-400 to-red-500 text-white shadow-sm">
              <Target className="h-3.5 w-3.5" />
            </div>
            Monthly Collection Target
          </CardTitle>
          <div className="flex items-center gap-2">
            {data && (
              <Badge
                className={`text-[10px] px-2 py-0.5 h-5 font-semibold border-0 ${config.bgClass} ${config.textClass}`}
              >
                {config.label}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={handleRefresh}
              disabled={isRefetching}
              aria-label="Refresh collection target data"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <LoadingSkeleton />
        ) : error ? (
          <div className="flex flex-col items-center py-10 gap-3">
            <div className="p-3 rounded-full bg-red-100 dark:bg-red-950/30 text-red-500 dark:text-red-400">
              <AlertTriangle className="h-8 w-8" />
            </div>
            <p className="text-sm text-muted-foreground text-center">Failed to load collection data.</p>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleRefresh}>
              <RefreshCw className="h-3 w-3" /> Retry
            </Button>
          </div>
        ) : data ? (
          <div className="space-y-5">
            {/* ── Hero: Collected vs Target ── */}
            <div className="flex items-center gap-4">
              <div className={`p-2.5 rounded-xl ${config.bgClass} ${config.textClass} shrink-0 transition-transform duration-200`}>
                <Banknote className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Collected This Month
                </p>
                <p className="text-xl sm:text-2xl font-bold tabular-nums text-foreground">
                  {formatINR(data.monthCollected)}
                </p>
                <p className="text-xs text-muted-foreground">
                  of {formatINR(data.monthlyTarget)} target
                </p>
              </div>
              <div className="text-right shrink-0">
                <p
                  className={`text-2xl sm:text-3xl font-bold tabular-nums ${config.textClass}`}
                >
                  {data.collectionPercent}%
                </p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Complete</p>
              </div>
            </div>

            {/* ── Progress Bar ── */}
            <div className="space-y-1.5">
              <div className="h-4 w-full rounded-full bg-muted/60 overflow-hidden">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${config.barGradient} transition-all duration-700 ease-out`}
                  style={{ width: `${Math.min(data.collectionPercent, 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{formatINR(data.monthCollected)} collected</span>
                <span>{formatINR(data.remaining)} remaining</span>
              </div>
            </div>

            {/* ── Stats Grid ── */}
            <div className="grid grid-cols-2 gap-3">
              {/* Days Remaining */}
              <div className="p-3 rounded-lg bg-muted/30 space-y-1">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <CalendarDays className="h-3 w-3" />
                  <span className="text-[10px] font-medium uppercase tracking-wider">Days Left</span>
                </div>
                <p className="text-lg font-bold tabular-nums text-foreground">
                  {data.daysRemaining}
                  <span className="text-xs font-normal text-muted-foreground ml-1">
                    of {data.daysInMonth}
                  </span>
                </p>
              </div>

              {/* Daily Average Collected */}
              <div className="p-3 rounded-lg bg-muted/30 space-y-1">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <TrendingUp className="h-3 w-3" />
                  <span className="text-[10px] font-medium uppercase tracking-wider">Daily Avg</span>
                </div>
                <p className="text-lg font-bold tabular-nums text-foreground">
                  {formatINR(data.dailyAvgCollected)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {data.monthPaymentCount} payments
                </p>
              </div>

              {/* Daily Average Needed */}
              <div className={`p-3 rounded-lg ${config.bgClass} space-y-1`}>
                <div className="flex items-center gap-1.5">
                  <Target className={`h-3 w-3 ${config.textClass}`} />
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Daily Needed
                  </span>
                </div>
                <p className={`text-lg font-bold tabular-nums ${config.textClass}`}>
                  {formatINR(data.dailyAvgNeeded)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  to meet target
                </p>
              </div>

              {/* Today's Collection */}
              <div className="p-3 rounded-lg bg-muted/30 space-y-1">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Banknote className="h-3 w-3" />
                  <span className="text-[10px] font-medium uppercase tracking-wider">Today</span>
                </div>
                <p className="text-lg font-bold tabular-nums text-foreground">
                  {formatINR(data.todayCollected)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {data.todayPaymentCount} payments
                </p>
              </div>
            </div>

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
