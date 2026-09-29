"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Crown } from "lucide-react";
import { formatINR } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────

interface TopSubscriber {
  rank: number;
  subscriberId: string;
  name: string;
  planName: string;
  totalPaid: number;
  paymentCount: number;
  lastPaymentDate: string;
}

interface TopSubscribersResponse {
  subscribers: TopSubscriber[];
}

// ─── Rank medal colors (gold / silver / bronze) ─────────────────

const RANK_STYLES: Record<number, { bg: string; text: string; border: string; icon: string }> = {
  1: {
    bg: "bg-amber-50 dark:bg-amber-950/30",
    text: "text-amber-700 dark:text-amber-400",
    border: "border-amber-200 dark:border-amber-800/50",
    icon: "#F59E0B",
  },
  2: {
    bg: "bg-slate-50 dark:bg-slate-950/30",
    text: "text-slate-600 dark:text-slate-300",
    border: "border-slate-200 dark:border-slate-700/50",
    icon: "#94A3B8",
  },
  3: {
    bg: "bg-orange-50 dark:bg-orange-950/30",
    text: "text-orange-800 dark:text-orange-400",
    border: "border-orange-200 dark:border-orange-800/50",
    icon: "#B45309",
  },
};

function getRankStyle(rank: number) {
  return RANK_STYLES[rank] ?? {
    bg: "",
    text: "text-muted-foreground",
    border: "border-transparent",
    icon: "#94A3B8",
  };
}

// ─── Loading Skeleton ───────────────────────────────────────────

export function TopSubscribersWidgetSkeleton() {
  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-7 rounded-md" />
          <Skeleton className="h-5 w-44" />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-7 w-7 rounded-full shrink-0" />
              <div className="flex-1 min-w-0 space-y-1.5">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3 w-16" />
              </div>
              <div className="text-right space-y-1 shrink-0">
                <Skeleton className="h-3.5 w-20 ml-auto" />
                <Skeleton className="h-3 w-12 ml-auto" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Top Revenue Subscribers Widget ─────────────────────────────

export function TopSubscribersWidget() {
  const [data, setData] = useState<TopSubscribersResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    else setIsRefetching(true);

    try {
      const res = await fetch("/api/dashboard/top-subscribers", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch top subscribers");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Top subscribers fetch error:", err);
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

  const subscribers = data?.subscribers ?? [];

  function formatLastPayment(dateStr: string): string {
    try {
      const num = Number(dateStr);
      const date = !isNaN(num) ? new Date(num) : new Date(dateStr);
      return isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
      });
    } catch {
      return "—";
    }
  }

  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter hover:shadow-md hover:border-rose-200 dark:hover:border-rose-800/50 transition-all duration-200">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-rose-100 dark:bg-rose-950/40">
              <Crown className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            </div>
            Top Revenue Subscribers
            <span className="text-[10px] font-medium text-muted-foreground">
              Top 5
            </span>
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={handleRefresh}
            disabled={isRefetching}
            aria-label="Refresh top subscribers"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <TopSubscribersWidgetSkeleton />
        ) : subscribers.length > 0 ? (
          <div className="space-y-1">
            {subscribers.map((sub) => {
              const style = getRankStyle(sub.rank);
              const isTop3 = sub.rank <= 3;

              return (
                <div
                  key={sub.subscriberId}
                  className={`flex items-center gap-3 rounded-lg p-2 -mx-1 transition-colors hover:bg-muted/40 ${
                    isTop3 ? `${style.bg} border ${style.border}` : ""
                  }`}
                >
                  {/* Rank badge */}
                  <div
                    className={`flex items-center justify-center h-7 w-7 rounded-full shrink-0 text-xs font-bold ${
                      isTop3
                        ? `${style.bg} ${style.text} ring-1 ${style.border}`
                        : "bg-muted/60 text-muted-foreground"
                    }`}
                  >
                    {sub.rank}
                  </div>

                  {/* Subscriber info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate leading-tight">
                      {sub.name}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge
                        variant="secondary"
                        className={`text-[9px] px-1.5 py-0 h-4 font-medium ${
                          isTop3
                            ? `${style.bg} ${style.text} border-0`
                            : "bg-muted/60"
                        }`}
                      >
                        {sub.planName}
                      </Badge>
                      <span className="text-[9px] text-muted-foreground tabular-nums">
                        {sub.paymentCount} payment{sub.paymentCount !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>

                  {/* Revenue */}
                  <div className="text-right shrink-0">
                    <p
                      className={`text-xs font-bold tabular-nums ${
                        isTop3 ? style.text : "text-foreground"
                      }`}
                    >
                      {formatINR(sub.totalPaid)}
                    </p>
                    <p className="text-[9px] text-muted-foreground mt-0.5">
                      Last: {formatLastPayment(sub.lastPaymentDate)}
                    </p>
                  </div>
                </div>
              );
            })}

            {/* Footer */}
            <div className="pt-2 mt-2 border-t border-border/60">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                  Auto-refreshes every 120s
                </span>
                <span className="text-[10px] font-medium text-muted-foreground">
                  {subscribers.length} subscriber{subscribers.length !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            <div className="p-3 rounded-full bg-muted/50">
              <Crown className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              No subscriber payment data available
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
