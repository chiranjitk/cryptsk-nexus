"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, RefreshCw, ChevronRight, Users } from "lucide-react";
import { formatINR, cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";

// ─── Types ──────────────────────────────────────────────

interface ExpiringSubscriber {
  id: string;
  code: string;
  name: string;
  planName: string;
  priceMonthly: number;
  expiresAt: string;
  daysLeft: number;
  area: string;
}

interface ExpiringResponse {
  expiring: ExpiringSubscriber[];
  totalExpiring: number;
  totalActive: number;
}

// ─── Color Helpers ──────────────────────────────────────

function daysLeftColor(days: number) {
  if (days <= 2) return { text: "text-red-600 dark:text-red-400", bg: "bg-red-100 dark:bg-red-950/40", border: "border-l-red-600 dark:border-l-red-500" };
  if (days <= 5) return { text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-950/40", border: "border-l-amber-500 dark:border-l-amber-400" };
  return { text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-950/40", border: "border-l-emerald-500 dark:border-l-emerald-400" };
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ─── Expiring Subscriptions Widget ──────────────────────

export function ExpiringSubscriptionsWidget() {
  const [data, setData] = useState<ExpiringResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);

  const fetchData = useCallback(
    async (showLoading = false) => {
      if (showLoading) setIsLoading(true);
      else setIsRefetching(true);

      try {
        const res = await fetch("/api/subscribers/expiring", {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to fetch expiring subscriptions");
        const json: ExpiringResponse = await res.json();
        setData(json);
      } catch (err) {
        console.error("Expiring Subscriptions Widget fetch error:", err);
      } finally {
        setIsLoading(false);
        setIsRefetching(false);
      }
    },
    []
  );

  // Initial fetch + auto-refresh every 120 seconds
  useEffect(() => {
    fetchData(true);
    intervalRef.current = setInterval(() => fetchData(false), 120000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  const handleViewAll = () => {
    setCurrentPage("Subscribers", "MAIN");
  };

  // ── Loading Skeleton ──
  if (isLoading) {
    return (
      <Card className="border shadow-sm rounded-xl animate-card-enter">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-7 rounded-md" />
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-7 w-7 rounded-md" />
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <Skeleton className="h-10 rounded-lg" />
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-11 rounded-md" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Empty / No data ──
  if (!data) return null;

  const displayed = data.expiring.slice(0, 5);

  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter hover:shadow-md transition-all duration-200">
      {/* ── Header ── */}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-amber-100 dark:bg-amber-950/40">
              <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            Expiring Subscriptions
            {data.totalExpiring > 0 && (
              <Badge
                variant="secondary"
                className={cn(
                  "text-[10px] font-bold px-2 py-0.5 rounded-full",
                  data.totalExpiring > 3
                    ? "bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400"
                    : "bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400"
                )}
              >
                {data.totalExpiring}
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => fetchData(false)}
            disabled={isRefetching}
            aria-label="Refresh expiring subscriptions"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isRefetching && "animate-spin")} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        {/* ── Summary bar ── */}
        <div className="rounded-lg border border-border/60 p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              of <span className="font-semibold text-foreground">{data.totalActive}</span> active subscribers
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            Next 7 days
          </span>
        </div>

        {/* ── List ── */}
        {displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <div className="p-2 rounded-full bg-emerald-100 dark:bg-emerald-950/40 mb-2">
              <Clock className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-xs font-medium">No expiring subscriptions</p>
            <p className="text-[10px] mt-0.5">All subscriptions are renewed on time</p>
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto custom-scrollbar space-y-1.5">
            {displayed.map((sub) => {
              const color = daysLeftColor(sub.daysLeft);
              return (
                <div
                  key={sub.id}
                  className={cn(
                    "rounded-md border border-border/50 border-l-[3px] p-2.5",
                    "hover:bg-muted/50 transition-colors",
                    color.border
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {sub.name}
                        </p>
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-[9px] font-bold px-1.5 py-0 h-4 rounded shrink-0",
                            color.bg,
                            color.text
                          )}
                        >
                          {sub.daysLeft}d left
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                        <span className="truncate">{sub.planName}</span>
                        <span className="shrink-0">·</span>
                        <span className="shrink-0">{sub.area}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                        Expires: {formatDate(sub.expiresAt)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-foreground tabular-nums">
                        {formatINR(sub.priceMonthly)}
                      </p>
                      <p className="text-[9px] text-muted-foreground">/month</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── View All link ── */}
        {data.totalExpiring > 5 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-8 text-xs text-muted-foreground hover:text-foreground gap-1"
            onClick={handleViewAll}
          >
            View all {data.totalExpiring} expiring
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        )}

        {/* ── Auto-refresh indicator ── */}
        <p className="text-[10px] text-muted-foreground/60 text-right">
          Auto-refreshes every 120s
        </p>
      </CardContent>
    </Card>
  );
}
