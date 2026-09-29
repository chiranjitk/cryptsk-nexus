"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertTriangle, Clock, BarChart3 } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "recharts";

// ─── Types ──────────────────────────────────────────────────────

interface TypeDistribution {
  type: string;
  count: number;
}

interface PriorityDistribution {
  priority: string;
  count: number;
}

interface AvgResolutionEntry {
  priority: string;
  avgHours: number;
  count: number;
}

interface ComplaintsAnalyticsResponse {
  typeDistribution: TypeDistribution[];
  trendData: { date: string; total: number; open: number; resolved: number }[];
  avgResolutionTime: AvgResolutionEntry[];
  priorityDistribution: PriorityDistribution[];
  totalComplaints: number;
  openComplaints: number;
  avgResolutionOverall: number;
}

// ─── Constants & Mappings ──────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  NO_INTERNET: "No Internet",
  SLOW_SPEED: "Slow Speed",
  CABLE_CUT: "Cable Cut",
  WIFI_ISSUE: "WiFi Issue",
  PLAN_CHANGE: "Plan Change",
  BILLING_QUERY: "Billing Query",
  VOIP_ISSUE: "VoIP Issue",
  IPTV_ISSUE: "IPTV Issue",
  NEW_CONNECTION: "New Connection",
  OTHER: "Other",
};

const TYPE_COLORS: Record<string, string> = {
  NO_INTERNET: "#DC2626",     // red-600
  SLOW_SPEED: "#EA580C",       // orange-600
  CABLE_CUT: "#D97706",        // amber-600
  WIFI_ISSUE: "#0D9488",       // teal-600
  PLAN_CHANGE: "#059669",      // emerald-600
  BILLING_QUERY: "#F43F5E",    // rose-500
  VOIP_ISSUE: "#14B8A6",       // teal-500
  IPTV_ISSUE: "#16A34A",       // green-600
  NEW_CONNECTION: "#84CC16",   // lime-500
  OTHER: "#78716C",            // stone-500
};

const FALLBACK_COLORS = ["#A855F7", "#F97316", "#10B981", "#E11D48", "#06B6D4", "#8B5CF6"];

function getTypeColor(type: string): string {
  if (TYPE_COLORS[type]) return TYPE_COLORS[type];
  const idx = Math.abs(type.split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % FALLBACK_COLORS.length;
  return FALLBACK_COLORS[idx];
}

function getTypeLabel(type: string): string {
  return TYPE_LABELS[type] || type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const PRIORITY_INFO: Record<string, { label: string; color: string }> = {
  P1_CRITICAL: { label: "P1 Critical", color: "#DC2626" },
  P2_HIGH: { label: "P2 High", color: "#EA580C" },
  P3_MEDIUM: { label: "P3 Medium", color: "#D97706" },
  P4_LOW: { label: "P4 Low", color: "#16A34A" },
};

// ─── Custom Pie Tooltip ─────────────────────────────────────────

function PieTooltip({ active, payload }: { active?: boolean; payload?: { payload: TypeDistribution }[] }) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  const total = payload.reduce((sum, p) => sum + p.payload.count, 0);
  const pct = total > 0 ? ((item.count / total) * 100).toFixed(1) : "0.0";
  return (
    <div className="bg-card/90 border border-border/80 rounded-xl shadow-2xl px-4 py-3 text-xs backdrop-blur-md">
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className="inline-block h-3 w-3 rounded-sm"
          style={{ backgroundColor: getTypeColor(item.type) }}
        />
        <span className="font-semibold text-foreground">{getTypeLabel(item.type)}</span>
      </div>
      <p className="text-muted-foreground">
        Count: <span className="font-semibold text-foreground tabular-nums">{item.count}</span>
      </p>
      <p className="text-muted-foreground">
        Share: <span className="font-semibold text-foreground tabular-nums">{pct}%</span>
      </p>
    </div>
  );
}

// ─── Mini Horizontal Bar ────────────────────────────────────────

function MiniBar({ percentage, color }: { percentage: number; color: string }) {
  const clamped = Math.min(Math.max(percentage, 0), 100);
  return (
    <div className="h-2 w-full rounded-full bg-muted/50 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700 ease-out"
        style={{ width: `${clamped}%`, backgroundColor: color }}
      />
    </div>
  );
}

// ─── Priority Row ───────────────────────────────────────────────

function PriorityRow({ priority, count, maxCount }: { priority: string; count: number; maxCount: number }) {
  const info = PRIORITY_INFO[priority] || { label: priority, color: "#78716C" };
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;

  return (
    <div className="flex items-center gap-2.5 py-2">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
        style={{ backgroundColor: info.color }}
      />
      <span className="text-xs font-medium text-foreground w-[72px] shrink-0 truncate">{info.label}</span>
      <div className="flex-1 min-w-0">
        <MiniBar percentage={pct} color={info.color} />
      </div>
      <span className="text-xs font-bold text-foreground tabular-nums w-8 text-right shrink-0">{count}</span>
    </div>
  );
}

// ─── Status Badge ───────────────────────────────────────────────

function StatusPill({ label, count, color, bgClass }: { label: string; count: number; color: string; bgClass: string }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${bgClass}`}>
      <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <div className="flex items-center justify-between flex-1 min-w-0 gap-2">
        <span className="text-xs font-medium text-foreground truncate">{label}</span>
        <span className="text-xs font-bold tabular-nums" style={{ color }}>{count}</span>
      </div>
    </div>
  );
}

// ─── Loading Skeleton ───────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-5 py-1">
      {/* Summary stats skeleton */}
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="text-center space-y-1.5">
            <Skeleton className="h-5 w-full rounded" />
            <Skeleton className="h-7 w-16 mx-auto rounded" />
          </div>
        ))}
      </div>
      {/* Pie chart skeleton */}
      <Skeleton className="h-[180px] w-[180px] rounded-full mx-auto" />
      {/* Priority skeleton */}
      <div className="space-y-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <Skeleton className="h-2.5 w-2.5 rounded-full shrink-0" />
            <Skeleton className="h-4 w-[72px] shrink-0" />
            <Skeleton className="h-2 flex-1 rounded-full" />
            <Skeleton className="h-4 w-8 shrink-0" />
          </div>
        ))}
      </div>
      {/* Status skeleton */}
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 rounded-lg" />
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
        <BarChart3 className="h-8 w-8 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground text-center">No complaint data available yet.</p>
    </div>
  );
}

// ─── Complaints Analytics Widget ────────────────────────────────

export function ComplaintsAnalyticsWidget() {
  const [data, setData] = useState<ComplaintsAnalyticsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    else setIsRefetching(true);

    try {
      const res = await fetch("/api/complaints/analytics", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch complaints analytics");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Complaints analytics fetch error:", err);
    } finally {
      setIsLoading(false);
      setIsRefetching(false);
    }
  }, []);

  // Initial fetch + auto-refresh every 60 seconds
  useEffect(() => {
    fetchData(true);
    intervalRef.current = setInterval(() => fetchData(false), 60000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  const handleRefresh = useCallback(() => {
    fetchData(false);
  }, [fetchData]);

  // ── Derived data ──

  const typeData = data?.typeDistribution
    .slice()
    .sort((a, b) => b.count - a.count)
    .map((t) => ({ ...t, label: getTypeLabel(t.type) })) ?? [];

  const priorities = data?.priorityDistribution
    .slice()
    .sort((a, b) => {
      const order = ["P1_CRITICAL", "P2_HIGH", "P3_MEDIUM", "P4_LOW"];
      return order.indexOf(a.priority) - order.indexOf(b.priority);
    }) ?? [];

  const maxPriorityCount = priorities.length > 0
    ? Math.max(...priorities.map((p) => p.count), 1)
    : 1;

  // Status breakdown derived from available data
  const resolvedCount = data
    ? data.avgResolutionTime.reduce((sum, e) => sum + e.count, 0)
    : 0;
  const inProgressCount = data
    ? Math.max(data.totalComplaints - data.openComplaints - resolvedCount, 0)
    : 0;

  // Average resolution time display
  function formatAvgTime(hours: number): string {
    if (hours === 0) return "N/A";
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours < 24) return `${hours.toFixed(1)}h`;
    const days = Math.floor(hours / 24);
    const remainingHrs = hours % 24;
    return remainingHrs > 0 ? `${days}d ${Math.round(remainingHrs)}h` : `${days}d`;
  }

  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter hover:shadow-md hover:border-red-200 dark:hover:border-red-800/50 transition-all duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-red-400 to-orange-500 text-white shadow-sm">
              <BarChart3 className="h-3.5 w-3.5" />
            </div>
            Complaints Analytics
            {data && data.totalComplaints > 0 && (
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0 h-5 font-medium tabular-nums bg-muted/60"
              >
                {data.totalComplaints} total
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={handleRefresh}
            disabled={isRefetching}
            aria-label="Refresh complaints analytics"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <LoadingSkeleton />
        ) : data && data.totalComplaints > 0 ? (
          <div className="space-y-5">
            {/* ── Summary Stats Row ── */}
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center px-2 py-2 rounded-lg bg-red-50 dark:bg-red-950/30">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Total</p>
                <p className="text-lg font-bold text-red-600 dark:text-red-400 tabular-nums mt-0.5">
                  {data.totalComplaints}
                </p>
              </div>
              <div className="text-center px-2 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30">
                <div className="flex items-center justify-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-amber-500" />
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Open</p>
                </div>
                <p className="text-lg font-bold text-amber-600 dark:text-amber-400 tabular-nums mt-0.5">
                  {data.openComplaints}
                </p>
              </div>
              <div className="text-center px-2 py-2 rounded-lg bg-teal-50 dark:bg-teal-950/30">
                <div className="flex items-center justify-center gap-1">
                  <Clock className="h-3 w-3 text-teal-500" />
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Avg Time</p>
                </div>
                <p className="text-lg font-bold text-teal-600 dark:text-teal-400 tabular-nums mt-0.5">
                  {formatAvgTime(data.avgResolutionOverall)}
                </p>
              </div>
            </div>

            {/* ── Complaints by Type (Pie Chart) ── */}
            {typeData.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Complaints by Type
                </p>
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  {/* Pie Chart */}
                  <div className="w-full max-w-[180px] aspect-square shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={typeData}
                          cx="50%"
                          cy="50%"
                          innerRadius="50%"
                          outerRadius="85%"
                          paddingAngle={2}
                          dataKey="count"
                          nameKey="label"
                          strokeWidth={0}
                          animationBegin={0}
                          animationDuration={800}
                          animationEasing="ease-out"
                        >
                          {typeData.map((entry) => (
                            <Cell
                              key={`cell-${entry.type}`}
                              fill={getTypeColor(entry.type)}
                              className="transition-opacity hover:opacity-80"
                            />
                          ))}
                        </Pie>
                        <RechartsTooltip content={<PieTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Type Legend */}
                  <div className="flex-1 w-full min-w-0">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                      {typeData.slice(0, 10).map((entry) => (
                        <div key={entry.type} className="flex items-center gap-1.5 py-0.5 group min-w-0">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-sm shrink-0 transition-transform group-hover:scale-125"
                            style={{ backgroundColor: getTypeColor(entry.type) }}
                          />
                          <span className="text-[11px] text-foreground truncate flex-1 min-w-0">
                            {entry.label}
                          </span>
                          <span className="text-[11px] font-semibold text-muted-foreground tabular-nums shrink-0">
                            {entry.count}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Priority Breakdown ── */}
            {priorities.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Priority Breakdown
                </p>
                <div className="divide-y divide-border/40">
                  {priorities.map((p) => (
                    <PriorityRow
                      key={p.priority}
                      priority={p.priority}
                      count={p.count}
                      maxCount={maxPriorityCount}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── Status Breakdown ── */}
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Status Overview
              </p>
              <div className="grid grid-cols-2 gap-2">
                <StatusPill
                  label="Open"
                  count={data.openComplaints}
                  color="#DC2626"
                  bgClass="bg-red-50 dark:bg-red-950/30"
                />
                <StatusPill
                  label="In Progress"
                  count={inProgressCount}
                  color="#D97706"
                  bgClass="bg-amber-50 dark:bg-amber-950/30"
                />
                <StatusPill
                  label="Resolved"
                  count={resolvedCount}
                  color="#059669"
                  bgClass="bg-emerald-50 dark:bg-emerald-950/30"
                />
                <StatusPill
                  label="Total"
                  count={data.totalComplaints}
                  color="#0D9488"
                  bgClass="bg-teal-50 dark:bg-teal-950/30"
                />
              </div>
            </div>

            {/* ── Footer ── */}
            <p className="text-[10px] text-muted-foreground/60 text-right">
              Auto-refreshes every 60s
            </p>
          </div>
        ) : data && data.totalComplaints === 0 ? (
          <EmptyState />
        ) : null}
      </CardContent>
    </Card>
  );
}
