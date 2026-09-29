"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, ChevronRight, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";

// ─── Types ──────────────────────────────────────────────────

interface ChurnRiskSubscriber {
  id: string;
  name: string;
  code: string;
  planName: string;
  riskLevel: "HIGH" | "MEDIUM" | "LOW";
  reasons: string[];
}

interface ChurnRiskSummary {
  total: number;
  high: number;
  medium: number;
  low: number;
}

interface ChurnRiskResponse {
  subscribers: ChurnRiskSubscriber[];
  summary: ChurnRiskSummary;
}

// ─── Risk Badge Helpers ─────────────────────────────────────

function riskBadgeStyle(level: "HIGH" | "MEDIUM" | "LOW") {
  switch (level) {
    case "HIGH":
      return {
        bg: "bg-red-100 dark:bg-red-950/40",
        text: "text-red-700 dark:text-red-400",
        border: "border-red-200 dark:border-red-800/50",
      };
    case "MEDIUM":
      return {
        bg: "bg-amber-100 dark:bg-amber-950/40",
        text: "text-amber-700 dark:text-amber-400",
        border: "border-amber-200 dark:border-amber-800/50",
      };
    case "LOW":
      return {
        bg: "bg-teal-100 dark:bg-teal-950/40",
        text: "text-teal-700 dark:text-teal-400",
        border: "border-teal-200 dark:border-teal-800/50",
      };
  }
}

function riskRowBg(level: "HIGH" | "MEDIUM" | "LOW") {
  if (level === "HIGH") {
    return "bg-red-50/60 dark:bg-red-950/20 border-red-200/70 dark:border-red-800/40";
  }
  if (level === "MEDIUM") {
    return "bg-amber-50/40 dark:bg-amber-950/10 border-border/50";
  }
  return "border-border/50";
}

// ─── Churn Risk Widget ──────────────────────────────────────

export function ChurnRiskWidget() {
  const [data, setData] = useState<ChurnRiskResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);

  const fetchData = useCallback(
    async (showLoading = false) => {
      if (showLoading) setIsLoading(true);
      else setIsRefetching(true);

      try {
        const res = await fetch("/api/dashboard/churn-risk", {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to fetch churn risk data");
        const json: ChurnRiskResponse = await res.json();
        setData(json);
      } catch (err) {
        console.error("Churn Risk Widget fetch error:", err);
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
              <Skeleton className="h-5 w-36" />
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

  const displayed = data.subscribers.slice(0, 8);

  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter hover:shadow-md transition-all duration-200">
      {/* ── Header ── */}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-red-100 dark:bg-red-950/40 relative">
              <ShieldAlert className="h-4 w-4 text-red-600 dark:text-red-400" />
              {data.summary.high > 0 && (
                <span className="absolute -top-1 -right-1 flex items-center justify-center h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                </span>
              )}
            </div>
            Churn Risk Alerts
            {data.summary.total > 0 && (
              <Badge
                variant="secondary"
                className={cn(
                  "text-[10px] font-bold px-2 py-0.5 rounded-full",
                  data.summary.high > 0
                    ? "bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400"
                    : "bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400"
                )}
              >
                {data.summary.total}
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => fetchData(false)}
            disabled={isRefetching}
            aria-label="Refresh churn risk alerts"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", isRefetching && "animate-spin")}
            />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        {/* ── Summary bar ── */}
        <div className="rounded-lg border border-border/60 p-3 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              <span className="text-[11px] font-semibold text-red-600 dark:text-red-400">
                {data.summary.high}
              </span>
              <span className="text-[10px] text-muted-foreground">HIGH</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                {data.summary.medium}
              </span>
              <span className="text-[10px] text-muted-foreground">MEDIUM</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-teal-500" />
              <span className="text-[11px] font-semibold text-teal-600 dark:text-teal-400">
                {data.summary.low}
              </span>
              <span className="text-[10px] text-muted-foreground">LOW</span>
            </div>
          </div>
          <span className="text-[10px] text-muted-foreground">
            {data.summary.total} at-risk subscriber{data.summary.total !== 1 ? "s" : ""}
          </span>
        </div>

        {/* ── List ── */}
        {displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <div className="p-2 rounded-full bg-teal-100 dark:bg-teal-950/40 mb-2">
              <ShieldAlert className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            </div>
            <p className="text-xs font-medium">No churn risks detected</p>
            <p className="text-[10px] mt-0.5">All subscribers are in good standing</p>
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto custom-scrollbar space-y-1.5">
            {displayed.map((sub) => {
              const badgeStyle = riskBadgeStyle(sub.riskLevel);
              const rowBg = riskRowBg(sub.riskLevel);
              return (
                <div
                  key={sub.id}
                  className={cn(
                    "rounded-md border border-l-[3px] border-l-red-500 p-2.5",
                    "hover:bg-muted/50 transition-colors",
                    rowBg,
                    sub.riskLevel === "HIGH" && "border-l-red-500",
                    sub.riskLevel === "MEDIUM" && "border-l-amber-500",
                    sub.riskLevel === "LOW" && "border-l-teal-500"
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
                            badgeStyle.bg,
                            badgeStyle.text
                          )}
                        >
                          {sub.riskLevel}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                        <span className="truncate">{sub.planName}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">
                        {sub.reasons.join(" · ")}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── View All link ── */}
        {data.summary.total > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-8 text-xs text-muted-foreground hover:text-foreground gap-1"
            onClick={handleViewAll}
          >
            View all subscribers
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
