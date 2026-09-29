"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Network } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "recharts";

// ─── Types ──────────────────────────────────────────────────────

interface ConnectionTypeData {
  type: string;
  label: string;
  count: number;
  percentage: number;
}

interface ConnectionTypeResponse {
  distribution: ConnectionTypeData[];
  totalSubscribers: number;
  timestamp: string;
}

// ─── Color mapping ──────────────────────────────────────────────
// FTTH=teal, WIRELESS=amber, CABLE=red, LEASED_LINE=emerald, ETHERNET=rose

const TYPE_COLORS: Record<string, string> = {
  FTTH: "#0D9488",           // teal-600
  WIRELESS: "#D97706",       // amber-600
  CABLE: "#DC2626",          // red-600
  LEASED_LINE: "#059669",    // emerald-600
  ETHERNET: "#F43F5E",       // rose-500
};

function getTypeColor(type: string): string {
  return TYPE_COLORS[type] ?? "#94A3B8";
}

// ─── Custom Pie Tooltip ─────────────────────────────────────────

function PieTooltip({ active, payload }: { active?: boolean; payload?: { payload: ConnectionTypeData }[] }) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="bg-card/90 border border-border/80 rounded-xl shadow-2xl px-4 py-3 text-xs backdrop-blur-md">
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className="inline-block h-3 w-3 rounded-sm"
          style={{ backgroundColor: getTypeColor(item.type) }}
        />
        <span className="font-semibold text-foreground">{item.label}</span>
      </div>
      <p className="text-muted-foreground">
        Subscribers: <span className="font-semibold text-foreground tabular-nums">{item.count.toLocaleString("en-IN")}</span>
      </p>
      <p className="text-muted-foreground">
        Share: <span className="font-semibold text-foreground tabular-nums">{item.percentage}%</span>
      </p>
    </div>
  );
}

// ─── Donut Center Label ─────────────────────────────────────────

function DonutCenterLabel({ totalSubscribers }: { totalSubscribers: number }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Total
      </span>
      <span className="text-lg sm:text-xl font-bold tabular-nums text-foreground mt-0.5">
        {totalSubscribers.toLocaleString("en-IN")}
      </span>
      <span className="text-[10px] text-muted-foreground mt-0.5">
        subscribers
      </span>
    </div>
  );
}

// ─── Legend Item ─────────────────────────────────────────────────

function LegendItem({ type, label, count, percentage, color }: ConnectionTypeData & { color: string }) {
  return (
    <div className="flex items-center gap-2.5 py-1.5 group">
      <span
        className="inline-block h-3 w-3 rounded-sm shrink-0 transition-transform group-hover:scale-125"
        style={{ backgroundColor: color }}
      />
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-xs font-medium text-foreground truncate">{label}</span>
        <Badge
          variant="secondary"
          className="text-[9px] px-1.5 py-0 h-4 font-medium tabular-nums bg-muted/60"
        >
          {count}
        </Badge>
      </div>
      <span className="text-[10px] text-muted-foreground tabular-nums w-10 text-right">
        {percentage}%
      </span>
    </div>
  );
}

// ─── Loading Skeleton ───────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="flex flex-col items-center py-2 gap-4">
      <div className="relative">
        <Skeleton className="h-[180px] w-[180px] rounded-full" />
      </div>
      <div className="w-full space-y-2.5 px-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <Skeleton className="h-3 w-3 rounded-sm shrink-0" />
            <Skeleton className="h-4 w-24" />
            <div className="flex-1" />
            <Skeleton className="h-3 w-8" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Connection Type Distribution Widget ────────────────────────

export function ConnectionTypeWidget() {
  const [data, setData] = useState<ConnectionTypeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    else setIsRefetching(true);

    try {
      const res = await fetch("/api/dashboard/connection-types", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch connection type data");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Connection type distribution fetch error:", err);
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

  // Filter types with > 0 count for the chart, keep all for legend
  const chartTypes = data?.distribution.filter((t) => t.count > 0) ?? [];
  const allTypes = data?.distribution ?? [];

  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter hover:shadow-md hover:border-teal-200 dark:hover:border-teal-800/50 transition-all duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-teal-400 to-teal-600 text-white shadow-sm">
              <Network className="h-3.5 w-3.5" />
            </div>
            Connection Types
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={handleRefresh}
            disabled={isRefetching}
            aria-label="Refresh connection type data"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <LoadingSkeleton />
        ) : data && chartTypes.length > 0 ? (
          <div className="flex flex-col items-center gap-4">
            {/* ── Donut Chart ── */}
            <div className="relative w-full max-w-[200px] mx-auto aspect-square">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartTypes}
                    cx="50%"
                    cy="50%"
                    innerRadius="55%"
                    outerRadius="85%"
                    paddingAngle={2}
                    dataKey="count"
                    nameKey="label"
                    strokeWidth={0}
                    animationBegin={0}
                    animationDuration={800}
                    animationEasing="ease-out"
                  >
                    {chartTypes.map((entry) => (
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
              <DonutCenterLabel totalSubscribers={data.totalSubscribers} />
            </div>

            {/* ── Legend ── */}
            <div className="w-full mt-1">
              <div className="divide-y divide-border/40 px-1">
                {allTypes.map((ct) => (
                  <LegendItem
                    key={ct.type}
                    {...ct}
                    color={getTypeColor(ct.type)}
                  />
                ))}
              </div>
            </div>

            {/* ── Footer ── */}
            <p className="text-[10px] text-muted-foreground/60 mt-1 text-right">
              Auto-refreshes every 60s
            </p>
          </div>
        ) : data && chartTypes.length === 0 ? (
          <div className="flex flex-col items-center py-8 gap-3">
            <div className="p-3 rounded-full bg-muted/50">
              <Network className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              No subscriber connection data available yet.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
