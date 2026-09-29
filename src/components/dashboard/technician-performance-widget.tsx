"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Wrench,
  Star,
  Users,
  Clock,
  CheckCircle,
  AlertTriangle,
  UserCheck,
  UserX,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  Cell,
} from "recharts";

// ─── Types ──────────────────────────────────────────────────────

interface TechnicianStat {
  id: string;
  name: string;
  status: string;
  rating: number;
  totalAssigned: number;
  totalResolved: number;
  totalOpen: number;
  resolutionRate: number;
  avgResolutionHours: number;
}

interface Summary {
  total: number;
  available: number;
  avgRating: number;
  avgResolutionHours: number;
  totalOpenComplaints: number;
}

interface TechnicianStatsResponse {
  technicians: TechnicianStat[];
  summary: Summary;
  timestamp: string;
}

// ─── Helpers ────────────────────────────────────────────────────

/** Generate a deterministic color from a name string */
function nameToColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const palette = [
    "#DC2626",
    "#0D9488",
    "#F59E0B",
    "#10B981",
    "#EA580C",
    "#D97706",
    "#059669",
    "#E11D48",
    "#14B8A6",
    "#84CC16",
  ];
  const idx = Math.abs(hash) % palette.length;
  return palette[idx];
}

/** Get initials from a name (max 2 chars) */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/** Format average resolution time */
function formatAvgTime(hours: number): string {
  if (hours === 0) return "N/A";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  const days = Math.floor(hours / 24);
  const remaining = hours % 24;
  return remaining > 0 ? `${days}d ${Math.round(remaining)}h` : `${days}d`;
}

/** Status badge configuration */
function getStatusConfig(status: string) {
  switch (status) {
    case "available":
      return {
        label: "Available",
        color: "text-emerald-700 dark:text-emerald-400",
        bg: "bg-emerald-50 dark:bg-emerald-950/40",
        dot: "bg-emerald-500",
      };
    case "busy":
      return {
        label: "Busy",
        color: "text-amber-700 dark:text-amber-400",
        bg: "bg-amber-50 dark:bg-amber-950/40",
        dot: "bg-amber-500",
      };
    case "offline":
      return {
        label: "Offline",
        color: "text-gray-600 dark:text-gray-400",
        bg: "bg-gray-50 dark:bg-gray-800/40",
        dot: "bg-gray-400",
      };
    case "on_leave":
      return {
        label: "On Leave",
        color: "text-slate-600 dark:text-slate-400",
        bg: "bg-slate-50 dark:bg-slate-800/40",
        dot: "bg-slate-400",
      };
    default:
      return {
        label: status,
        color: "text-muted-foreground",
        bg: "bg-muted/50",
        dot: "bg-muted-foreground",
      };
  }
}

/** Get bar color based on open complaint count */
function getBarColor(count: number): string {
  if (count < 3) return "#10B981"; // green
  if (count <= 5) return "#F59E0B"; // amber
  return "#DC2626"; // red
}

// ─── Custom Tooltip for BarChart ─────────────────────────────────

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="bg-card/90 border border-border/80 rounded-lg shadow-xl px-3 py-2 text-xs backdrop-blur-md">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      <p className="text-muted-foreground">
        Open:{" "}
        <span className="font-bold text-foreground tabular-nums">
          {payload[0].value}
        </span>
      </p>
    </div>
  );
}

// ─── Loading Skeleton ───────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-5 py-1">
      {/* Summary bar skeleton */}
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-1.5 px-3 py-2.5">
            <Skeleton className="h-3 w-14 rounded" />
            <Skeleton className="h-6 w-10 rounded" />
          </div>
        ))}
      </div>
      {/* Technician cards skeleton */}
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 p-3 rounded-lg">
            <Skeleton className="h-9 w-9 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-28 rounded" />
                <Skeleton className="h-4 w-16 rounded-full" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
              <div className="flex gap-4">
                <Skeleton className="h-3 w-12 rounded" />
                <Skeleton className="h-3 w-12 rounded" />
                <Skeleton className="h-3 w-16 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
      {/* Chart skeleton */}
      <Skeleton className="h-[160px] w-full rounded-lg" />
    </div>
  );
}

// ─── Empty State ────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center py-10 gap-3">
      <div className="p-3 rounded-full bg-muted/50">
        <Wrench className="h-8 w-8 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground text-center">
        No technicians configured yet.
      </p>
    </div>
  );
}

// ─── Technician Row ─────────────────────────────────────────────

function TechnicianRow({ tech }: { tech: TechnicianStat }) {
  const statusCfg = getStatusConfig(tech.status);
  const avatarColor = nameToColor(tech.name);

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/30 hover:shadow-sm transition-all duration-200 group">
      {/* Avatar */}
      <div
        className="h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm"
        style={{ backgroundColor: avatarColor }}
      >
        {getInitials(tech.name)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        {/* Name + Status */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground truncate">
            {tech.name}
          </span>
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${statusCfg.bg} ${statusCfg.color}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
            {statusCfg.label}
          </span>
        </div>

        {/* Rating */}
        <div className="flex items-center gap-1 mt-1">
          <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
          <span className="text-xs font-medium text-foreground tabular-nums">
            {tech.rating.toFixed(1)}
          </span>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-3 mt-2 text-[11px]">
          <div className="flex items-center gap-1">
            <CheckCircle className="h-3 w-3 text-emerald-500" />
            <span className="text-muted-foreground">Resolved:</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {tech.totalResolved}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 text-red-500" />
            <span className="text-muted-foreground">Open:</span>
            <span className="font-semibold text-red-600 dark:text-red-400 tabular-nums">
              {tech.totalOpen}
            </span>
          </div>
        </div>

        {/* Resolution rate bar */}
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[10px] text-muted-foreground shrink-0">
            Rate:
          </span>
          <div className="flex-1 h-1.5 rounded-full bg-muted/50 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${Math.min(tech.resolutionRate, 100)}%`,
                backgroundColor:
                  tech.resolutionRate >= 80
                    ? "#10B981"
                    : tech.resolutionRate >= 50
                      ? "#F59E0B"
                      : "#DC2626",
              }}
            />
          </div>
          <span className="text-[10px] font-semibold tabular-nums text-foreground shrink-0">
            {tech.resolutionRate}%
          </span>
        </div>

        {/* Avg resolution time */}
        <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
          <Clock className="h-2.5 w-2.5" />
          <span>Avg: {formatAvgTime(tech.avgResolutionHours)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Technician Performance Widget ──────────────────────────────

export function TechnicianPerformanceWidget() {
  const [data, setData] = useState<TechnicianStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    else setIsRefetching(true);

    try {
      const res = await fetch("/api/dashboard/technician-stats", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch technician stats");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Technician stats fetch error:", err);
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

  // Chart data for workload distribution
  const chartData = data
    ? data.technicians
        .map((t) => ({
          name: getInitials(t.name),
          fullName: t.name,
          open: t.totalOpen,
        }))
        .sort((a, b) => b.open - a.open)
    : [];

  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter hover:shadow-md hover:border-red-200 dark:hover:border-red-800/50 transition-all duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-sm">
              <Wrench className="h-3.5 w-3.5" />
            </div>
            Technician Performance
            {data && data.summary.total > 0 && (
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0 h-5 font-medium tabular-nums bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
              >
                <UserCheck className="h-2.5 w-2.5 mr-0.5" />
                {data.summary.available} available
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={handleRefresh}
            disabled={isRefetching}
            aria-label="Refresh technician performance"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {isLoading ? (
          <LoadingSkeleton />
        ) : data && data.summary.total > 0 ? (
          <div className="space-y-5">
            {/* ── Section 1: Summary Bar ── */}
            <div className="grid grid-cols-3 gap-3">
              {/* Available Technicians (teal) */}
              <div className="px-3 py-2.5 rounded-lg bg-teal-50 dark:bg-teal-950/30">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Available
                  </p>
                </div>
                <p className="text-lg font-bold text-teal-600 dark:text-teal-400 tabular-nums mt-0.5">
                  {data.summary.available}
                  <span className="text-[10px] font-normal text-muted-foreground ml-0.5">
                    /{data.summary.total}
                  </span>
                </p>
              </div>

              {/* Avg Rating (amber) */}
              <div className="px-3 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30">
                <div className="flex items-center gap-1.5">
                  <Star className="h-2.5 w-2.5 text-amber-500" />
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Avg Rating
                  </p>
                </div>
                <p className="text-lg font-bold text-amber-600 dark:text-amber-400 tabular-nums mt-0.5">
                  {data.summary.avgRating.toFixed(1)}
                </p>
              </div>

              {/* Open Tickets (red) */}
              <div className="px-3 py-2.5 rounded-lg bg-red-50 dark:bg-red-950/30">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="h-2.5 w-2.5 text-red-500" />
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Open Tickets
                  </p>
                </div>
                <p className="text-lg font-bold text-red-600 dark:text-red-400 tabular-nums mt-0.5">
                  {data.summary.totalOpenComplaints}
                </p>
              </div>
            </div>

            {/* ── Section 2: Technician Leaderboard ── */}
            {data.technicians.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <TrendingUp className="h-3 w-3" />
                  Top Performers
                </p>
                <div className="space-y-1 divide-y divide-border/30">
                  {data.technicians.map((tech) => (
                    <TechnicianRow key={tech.id} tech={tech} />
                  ))}
                </div>
              </div>
            )}

            {/* ── Section 3: Workload Distribution (mini bar chart) ── */}
            {chartData.length > 0 && chartData.some((d) => d.open > 0) && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Users className="h-3 w-3" />
                  Workload Distribution
                </p>
                <div className="h-[160px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartData}
                      layout="vertical"
                      margin={{ top: 0, right: 24, bottom: 0, left: 0 }}
                    >
                      <XAxis
                        type="number"
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                        width={24}
                      />
                      <RechartsTooltip
                        content={<ChartTooltip />}
                        cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
                      />
                      <Bar
                        dataKey="open"
                        radius={[0, 4, 4, 0]}
                        maxBarSize={20}
                      >
                        {chartData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={getBarColor(entry.open)}
                            className="transition-opacity hover:opacity-80"
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {/* Legend */}
                <div className="flex items-center justify-center gap-4 mt-2">
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: "#10B981" }} />
                    Low (&lt;3)
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: "#F59E0B" }} />
                    Medium (3-5)
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: "#DC2626" }} />
                    High (&gt;5)
                  </div>
                </div>
              </div>
            )}

            {/* ── Footer ── */}
            <p className="text-[10px] text-muted-foreground/60 text-right">
              Auto-refreshes every 120s
            </p>
          </div>
        ) : data && data.summary.total === 0 ? (
          <EmptyState />
        ) : null}
      </CardContent>
    </Card>
  );
}
