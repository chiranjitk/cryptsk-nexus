"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, AlertTriangle, RefreshCw, Timer, Zap } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

interface PriorityData {
  priority: string;
  label: string;
  avgResponseHours: number;
  count: number;
  breached: number;
  slaTargetHours: number;
  withinSla: number;
  breachRate: number;
}

interface ResponseTimeResponse {
  priorities: PriorityData[];
  overallAvgHours: number;
  totalResponses: number;
  totalBreached: number;
  overallBreachRate: number;
  slaTargets: Record<string, number>;
  timestamp: string;
}

// ─── Color helpers ──────────────────────────────────────────────

function priorityColor(priority: string): string {
  switch (priority) {
    case "P1_CRITICAL": return "#DC2626";
    case "P2_HIGH": return "#EA580C";
    case "P3_MEDIUM": return "#D97706";
    case "P4_LOW": return "#16A34A";
    default: return "#78716C";
  }
}

function barColor(avgHours: number, targetHours: number): string {
  const ratio = avgHours / targetHours;
  if (ratio <= 0.5) return "#16A34A"; // green — well within SLA
  if (ratio <= 0.8) return "#0D9488"; // teal — good
  if (ratio <= 1.0) return "#D97706"; // amber — approaching SLA
  return "#DC2626"; // red — breached
}

function formatHours(hours: number): string {
  if (hours === 0) return "N/A";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  const days = Math.floor(hours / 24);
  const remaining = hours % 24;
  return remaining > 0 ? `${days}d ${Math.round(remaining)}h` : `${days}d`;
}

// ─── Horizontal Bar ─────────────────────────────────────────────

function ResponseBar({
  avgHours,
  maxHours,
  targetHours,
  priority,
}: {
  avgHours: number;
  maxHours: number;
  targetHours: number;
  priority: string;
}) {
  const barWidth = maxHours > 0 ? (avgHours / maxHours) * 100 : 0;
  const targetPosition = maxHours > 0 ? (targetHours / maxHours) * 100 : 0;
  const color = barColor(avgHours, targetHours);

  return (
    <div className="relative h-5 w-full rounded-full bg-muted/60 overflow-hidden">
      {/* Colored bar */}
      <div
        className="h-full rounded-full transition-all duration-700 ease-out"
        style={{ width: `${Math.min(barWidth, 100)}%`, backgroundColor: color }}
      />
      {/* SLA target marker */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-foreground/30 z-10"
        style={{ left: `${Math.min(targetPosition, 100)}%` }}
        title={`SLA Target: ${targetHours}h`}
      />
      {/* SLA target label on right edge */}
      {targetPosition < 90 && (
        <div
          className="absolute top-0 bottom-0 flex items-center z-10"
          style={{ left: `${Math.min(targetPosition + 1, 85)}%` }}
        >
          <span className="text-[8px] font-medium text-foreground/50 whitespace-nowrap">
            {targetHours}h
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Priority Row ───────────────────────────────────────────────

function PriorityRow({ data, maxHours }: { data: PriorityData; maxHours: number }) {
  const color = priorityColor(data.priority);
  const isBreached = data.avgResponseHours > data.slaTargetHours;

  return (
    <div className="space-y-1.5 py-2.5 border-b border-border/40 last:border-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
            style={{ backgroundColor: color }}
          />
          <span className="text-xs font-semibold text-foreground">{data.label}</span>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            ({data.count} tickets)
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isBreached && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-red-600 dark:text-red-400">
              <AlertTriangle className="h-3 w-3" />
              {data.breached} breached
            </span>
          )}
          <span
            className="text-xs font-bold tabular-nums"
            style={{ color: barColor(data.avgResponseHours, data.slaTargetHours) }}
          >
            {formatHours(data.avgResponseHours)}
          </span>
        </div>
      </div>
      <ResponseBar
        avgHours={data.avgResponseHours}
        maxHours={maxHours}
        targetHours={data.slaTargetHours}
        priority={data.priority}
      />
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>SLA Target: {data.slaTargetHours}h</span>
        <span>
          {data.withinSla}/{data.count} within SLA
        </span>
      </div>
    </div>
  );
}

// ─── Loading Skeleton ───────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-5 py-1">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-12" />
            </div>
            <Skeleton className="h-5 w-full rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Empty State ────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center py-10 gap-3">
      <div className="p-3 rounded-full bg-muted/50">
        <Timer className="h-8 w-8 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground text-center">
        No response time data available yet.
      </p>
      <p className="text-xs text-muted-foreground/60">
        Response times are calculated from the first comment on each ticket.
      </p>
    </div>
  );
}

// ─── Response Time Widget ───────────────────────────────────────

export function ResponseTimeWidget() {
  const [data, setData] = useState<ResponseTimeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    else setIsRefetching(true);
    setError(null);

    try {
      const res = await fetch("/api/dashboard/response-time", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch response time data");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Response time widget fetch error:", err);
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

  const hasData = data && data.totalResponses > 0;

  // Find max average hours for bar scaling
  const maxAvgHours = data
    ? Math.max(...data.priorities.map((p) => p.avgResponseHours), ...data.priorities.map((p) => p.slaTargetHours), 1)
    : 1;

  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter hover:shadow-md hover:border-red-200 dark:hover:border-red-800/50 transition-all duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-teal-400 to-emerald-500 text-white shadow-sm">
              <Clock className="h-3.5 w-3.5" />
            </div>
            Ticket Response Time
            {data && (
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0 h-5 font-medium tabular-nums bg-muted/60"
              >
                {data.totalResponses} tickets
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={handleRefresh}
            disabled={isRefetching}
            aria-label="Refresh response time data"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
          </Button>
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
            <p className="text-sm text-muted-foreground text-center">Failed to load response time data.</p>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleRefresh}>
              <RefreshCw className="h-3 w-3" /> Retry
            </Button>
          </div>
        ) : hasData ? (
          <div className="space-y-4">
            {/* ── Summary Row ── */}
            <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/30">
              <div className="p-2 rounded-lg bg-teal-100 dark:bg-teal-950/30 text-teal-600 dark:text-teal-400 shrink-0">
                <Zap className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Average First Response
                </p>
                <p className="text-lg font-bold tabular-nums text-foreground">
                  {formatHours(data.overallAvgHours)}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  SLA Breach Rate
                </p>
                <p
                  className="text-lg font-bold tabular-nums"
                  style={{
                    color: data.overallBreachRate > 20
                      ? "#DC2626"
                      : data.overallBreachRate > 10
                        ? "#D97706"
                        : "#16A34A",
                  }}
                >
                  {data.overallBreachRate}%
                </p>
              </div>
            </div>

            {/* ── Priority Breakdown ── */}
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Response Time by Priority
              </p>
              <div className="divide-y divide-border/40">
                {data.priorities.map((p) => (
                  <PriorityRow key={p.priority} data={p} maxHours={maxAvgHours} />
                ))}
              </div>
            </div>

            {/* ── Legend ── */}
            <div className="flex items-center gap-4 text-[10px] text-muted-foreground flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                <span>Within SLA</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                <span>Approaching SLA</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                <span>Breached SLA</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-0.5 bg-foreground/30" />
                <span>SLA Target</span>
              </div>
            </div>

            {/* ── Footer ── */}
            <p className="text-[10px] text-muted-foreground/60 text-right">
              Auto-refreshes every 120s
            </p>
          </div>
        ) : (
          <EmptyState />
        )}
      </CardContent>
    </Card>
  );
}
