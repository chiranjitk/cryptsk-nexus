"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, RefreshCw, Users, IndianRupee, TrendingUp, BarChart3 } from "lucide-react";
import { formatINR } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────

interface AreaItem {
  areaId: string;
  areaName: string;
  totalSubscribers: number;
  activeSubscribers: number;
  totalRevenue: number;
  complaintCount: number;
}

interface AreaDistributionResponse {
  areas: AreaItem[];
  summary: {
    totalAreas: number;
    totalSubscribers: number;
    totalActive: number;
    totalRevenue: number;
    totalComplaints: number;
    averagePerArea: number;
  };
}

// ─── Color palette for bars (no blue/indigo) ────────────────────

const BAR_COLORS = [
  { bar: "#DC2626", bg: "bg-red-100 dark:bg-red-950/40", text: "text-red-600 dark:text-red-400", gradient: "from-red-500 to-red-600" },
  { bar: "#0D9488", bg: "bg-teal-100 dark:bg-teal-950/40", text: "text-teal-600 dark:text-teal-400", gradient: "from-teal-500 to-teal-600" },
  { bar: "#D97706", bg: "bg-amber-100 dark:bg-amber-950/40", text: "text-amber-600 dark:text-amber-400", gradient: "from-amber-500 to-amber-600" },
  { bar: "#16A34A", bg: "bg-emerald-100 dark:bg-emerald-950/40", text: "text-emerald-600 dark:text-emerald-400", gradient: "from-emerald-500 to-emerald-600" },
  { bar: "#E11D48", bg: "bg-rose-100 dark:bg-rose-950/40", text: "text-rose-600 dark:text-rose-400", gradient: "from-rose-500 to-rose-600" },
  { bar: "#9333EA", bg: "bg-purple-100 dark:bg-purple-950/40", text: "text-purple-600 dark:text-purple-400", gradient: "from-purple-500 to-purple-600" },
  { bar: "#EA580C", bg: "bg-orange-100 dark:bg-orange-950/40", text: "text-orange-600 dark:text-orange-400", gradient: "from-orange-500 to-orange-600" },
  { bar: "#0891B2", bg: "bg-cyan-100 dark:bg-cyan-950/40", text: "text-cyan-600 dark:text-cyan-400", gradient: "from-cyan-500 to-cyan-600" },
];

function getBarColor(index: number) {
  return BAR_COLORS[index % BAR_COLORS.length];
}

// ─── Loading Skeleton ───────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {/* Summary row skeleton */}
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="text-center p-2 rounded-lg bg-muted/30">
            <Skeleton className="skeleton-wave h-3 w-16 mx-auto mb-1.5" />
            <Skeleton className="skeleton-wave h-5 w-12 mx-auto" />
          </div>
        ))}
      </div>
      {/* Area rows skeleton */}
      <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-2.5 w-full rounded-full" />
            <div className="flex items-center gap-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Area Row ───────────────────────────────────────────────────

function AreaRow({
  area,
  index,
  maxSubscribers,
}: {
  area: AreaItem;
  index: number;
  maxSubscribers: number;
}) {
  const color = getBarColor(index);
  const widthPct = maxSubscribers > 0 ? Math.max(4, (area.totalSubscribers / maxSubscribers) * 100) : 0;
  const activeRatio = area.totalSubscribers > 0 ? Math.round((area.activeSubscribers / area.totalSubscribers) * 100) : 0;

  return (
    <div className="space-y-1.5 py-1">
      {/* Area name + revenue badge */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
            style={{ backgroundColor: color.bar }}
          />
          <span className="text-xs font-medium text-foreground truncate">
            {area.areaName}
          </span>
          {index === 0 && (
            <Badge className="text-[9px] px-1.5 py-0 h-4 font-bold bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400 border-red-200 dark:border-red-800">
              Top Area
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge
            variant="secondary"
            className="text-[9px] px-1.5 py-0 h-4 font-semibold tabular-nums bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
          >
            {formatINR(area.totalRevenue)}
          </Badge>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2.5 w-full rounded-full bg-muted/80 dark:bg-muted/50 overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${color.gradient} transition-all duration-700 ease-out`}
          style={{ width: `${widthPct}%` }}
        />
      </div>

      {/* Subscribers count + active ratio + complaints */}
      <div className="flex items-center gap-3 text-[10px]">
        <div className="flex items-center gap-1 text-muted-foreground">
          <Users className="h-3 w-3" />
          <span className="tabular-nums font-medium text-foreground">{area.totalSubscribers}</span>
          <span>total</span>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <TrendingUp className="h-3 w-3 text-green-500" />
          <span className="tabular-nums font-medium text-green-600 dark:text-green-400">{area.activeSubscribers}</span>
          <span>active ({activeRatio}%)</span>
        </div>
        {area.complaintCount > 0 && (
          <div className="flex items-center gap-1 text-muted-foreground ml-auto">
            <BarChart3 className="h-3 w-3 text-orange-500" />
            <span className="tabular-nums font-medium text-orange-600 dark:text-orange-400">{area.complaintCount}</span>
            <span>complaints</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Area Distribution Widget ───────────────────────────────────

export function AreaDistributionWidget() {
  const [data, setData] = useState<AreaDistributionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    else setIsRefetching(true);

    try {
      const res = await fetch("/api/dashboard/area-distribution", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch area distribution");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Area distribution fetch error:", err);
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

  const maxSubscribers = data?.areas?.[0]?.totalSubscribers ?? 1;

  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter hover:shadow-md hover:border-red-200 dark:hover:border-red-800/50 transition-all duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-red-400 to-red-600 text-white shadow-sm">
              <MapPin className="h-3.5 w-3.5" />
            </div>
            Area Distribution
            {data && (
              <span className="text-[10px] font-medium text-muted-foreground">
                {data.summary.totalAreas} areas
              </span>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={handleRefresh}
            disabled={isRefetching}
            aria-label="Refresh area distribution"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <LoadingSkeleton />
        ) : data && data.areas.length > 0 ? (
          <div className="space-y-4">
            {/* ── Summary Stats ── */}
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-2.5 rounded-lg bg-muted/30 border border-border/40">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Total Subs</p>
                <p className="text-sm sm:text-base font-bold tabular-nums text-foreground mt-0.5">
                  {data.summary.totalSubscribers.toLocaleString("en-IN")}
                </p>
              </div>
              <div className="text-center p-2.5 rounded-lg bg-muted/30 border border-border/40">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Avg / Area</p>
                <p className="text-sm sm:text-base font-bold tabular-nums text-foreground mt-0.5">
                  {data.summary.averagePerArea.toLocaleString("en-IN")}
                </p>
              </div>
              <div className="text-center p-2.5 rounded-lg bg-muted/30 border border-border/40">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-1">
                  <IndianRupee className="h-2.5 w-2.5" />Revenue
                </p>
                <p className="text-sm sm:text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {formatINR(data.summary.totalRevenue)}
                </p>
              </div>
            </div>

            {/* ── Area Rows ── */}
            <div className="max-h-96 overflow-y-auto custom-scrollbar space-y-2">
              {data.areas.map((area, index) => (
                <AreaRow
                  key={area.areaId}
                  area={area}
                  index={index}
                  maxSubscribers={maxSubscribers}
                />
              ))}
            </div>

            {/* ── Footer ── */}
            <div className="flex items-center justify-between pt-2 mt-1 border-t border-border/60">
              <p className="text-[10px] text-muted-foreground">
                {data.summary.totalComplaints} total complaints across all areas
              </p>
              <p className="text-[10px] text-muted-foreground/60">
                Auto-refreshes every 2m
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center py-8 gap-3">
            <div className="p-3 rounded-full bg-muted/50">
              <MapPin className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              No area distribution data available yet.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
