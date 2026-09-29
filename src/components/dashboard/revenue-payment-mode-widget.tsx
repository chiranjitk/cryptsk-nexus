"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Wallet } from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "recharts";
import { formatINR } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────

interface PaymentModeData {
  mode: string;
  label: string;
  total: number;
  count: number;
  percentage: number;
}

interface RevenueByModeResponse {
  modes: PaymentModeData[];
  totalRevenue: number;
  totalPayments: number;
  timestamp: string;
}

// ─── Color mapping ──────────────────────────────────────────────
// red for top, teal, amber, emerald, rose for others

const MODE_COLORS: Record<string, string> = {
  CASH: "#DC2626",          // red-600
  UPI: "#0D9488",           // teal-600
  ONLINE: "#D97706",        // amber-600
  BANK_TRANSFER: "#059669", // emerald-600
  CHEQUE: "#F43F5E",        // rose-500
  WALLET: "#EA580C",        // orange-600
};

// Fallback colors if unknown modes appear
const FALLBACK_COLORS = ["#8B5CF6", "#14B8A6", "#F97316", "#10B981", "#E11D48", "#84CC16"];

function getModeColor(mode: string): string {
  if (MODE_COLORS[mode]) return MODE_COLORS[mode];
  const idx = Math.abs(mode.split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % FALLBACK_COLORS.length;
  return FALLBACK_COLORS[idx];
}

// ─── Custom Pie Tooltip ─────────────────────────────────────────

function PieTooltip({ active, payload }: { active?: boolean; payload?: { payload: PaymentModeData }[] }) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="bg-card/90 border border-border/80 rounded-xl shadow-2xl px-4 py-3 text-xs backdrop-blur-md">
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className="inline-block h-3 w-3 rounded-sm"
          style={{ backgroundColor: getModeColor(item.mode) }}
        />
        <span className="font-semibold text-foreground">{item.label}</span>
      </div>
      <p className="text-muted-foreground">
        Revenue: <span className="font-semibold text-foreground tabular-nums">{formatINR(item.total)}</span>
      </p>
      <p className="text-muted-foreground">
        Transactions: <span className="font-semibold text-foreground tabular-nums">{item.count}</span>
      </p>
      <p className="text-muted-foreground">
        Share: <span className="font-semibold text-foreground tabular-nums">{item.percentage}%</span>
      </p>
    </div>
  );
}

// ─── Donut Center Label ─────────────────────────────────────────

function DonutCenterLabel({ totalRevenue, totalPayments }: { totalRevenue: number; totalPayments: number }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Total Revenue
      </span>
      <span className="text-lg sm:text-xl font-bold tabular-nums text-foreground mt-0.5">
        {formatINR(totalRevenue)}
      </span>
      <span className="text-[10px] text-muted-foreground mt-0.5">
        {totalPayments} transactions
      </span>
    </div>
  );
}

// ─── Legend Item ─────────────────────────────────────────────────

function LegendItem({ mode, label, total, count, percentage, color }: PaymentModeData & { color: string }) {
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
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-xs font-semibold text-foreground tabular-nums">
          {formatINR(total)}
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums w-10 text-right">
          {percentage}%
        </span>
      </div>
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
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <Skeleton className="h-3 w-3 rounded-sm shrink-0" />
            <Skeleton className="h-4 w-20" />
            <div className="flex-1" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-3 w-8" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Revenue by Payment Mode Widget ─────────────────────────────

export function RevenuePaymentModeWidget() {
  const [data, setData] = useState<RevenueByModeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    else setIsRefetching(true);

    try {
      const res = await fetch("/api/payments/revenue-by-mode", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch revenue by mode data");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Revenue by payment mode fetch error:", err);
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

  // Filter modes with > 0 for the chart, keep all for legend
  const chartModes = data?.modes.filter((m) => m.total > 0) ?? [];
  const allModes = data?.modes ?? [];

  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter hover:shadow-md hover:border-red-200 dark:hover:border-red-800/50 transition-all duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-red-400 to-rose-500 text-white shadow-sm">
              <Wallet className="h-3.5 w-3.5" />
            </div>
            Revenue by Payment Mode
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={handleRefresh}
            disabled={isRefetching}
            aria-label="Refresh payment mode data"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <LoadingSkeleton />
        ) : data && chartModes.length > 0 ? (
          <div className="flex flex-col items-center gap-4">
            {/* ── Donut Chart ── */}
            <div className="relative w-full max-w-[200px] mx-auto aspect-square">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartModes}
                    cx="50%"
                    cy="50%"
                    innerRadius="55%"
                    outerRadius="85%"
                    paddingAngle={2}
                    dataKey="total"
                    nameKey="label"
                    strokeWidth={0}
                    animationBegin={0}
                    animationDuration={800}
                    animationEasing="ease-out"
                  >
                    {chartModes.map((entry, index) => (
                      <Cell
                        key={`cell-${entry.mode}`}
                        fill={getModeColor(entry.mode)}
                        className="transition-opacity hover:opacity-80"
                      />
                    ))}
                  </Pie>
                  <RechartsTooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <DonutCenterLabel
                totalRevenue={data.totalRevenue}
                totalPayments={data.totalPayments}
              />
            </div>

            {/* ── Legend ── */}
            <div className="w-full mt-1">
              <div className="divide-y divide-border/40 px-1">
                {allModes.map((mode) => (
                  <LegendItem
                    key={mode.mode}
                    {...mode}
                    color={getModeColor(mode.mode)}
                  />
                ))}
              </div>
            </div>

            {/* ── Footer ── */}
            <p className="text-[10px] text-muted-foreground/60 mt-1 text-right">
              Auto-refreshes every 120s
            </p>
          </div>
        ) : data && chartModes.length === 0 ? (
          <div className="flex flex-col items-center py-8 gap-3">
            <div className="p-3 rounded-full bg-muted/50">
              <Wallet className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              No verified payment data available yet.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
