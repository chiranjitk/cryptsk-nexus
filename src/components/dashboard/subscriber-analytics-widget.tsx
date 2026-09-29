"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  RefreshCw,
  Users,
  TrendingUp,
  TrendingDown,
  IndianRupee,
  Wifi,
  Cable,
  Radio,
  Server,
  Network,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "recharts";
import { formatINR } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────

interface FunnelData {
  trial: number;
  active: number;
  suspended: number;
  disconnected: number;
  pending: number;
  total: number;
}

interface ConnectionTypeData {
  type: string;
  label: string;
  count: number;
}

interface PlanItem {
  planName: string;
  count: number;
}

interface SubscriberAnalyticsResponse {
  funnel: FunnelData;
  connectionTypes: ConnectionTypeData[];
  arpu: number;
  mrr: number;
  activeSubscribers: number;
  newThisMonth: number;
  newLastMonth: number;
  growthRate: number;
  planDistribution: PlanItem[];
  timestamp: string;
}

// ─── Color helpers ──────────────────────────────────────────────

const FUNNEL_COLORS: Record<string, string> = {
  trial: "#D97706",       // amber-600
  active: "#16A34A",      // green-600
  suspended: "#DC2626",   // red-600
  disconnected: "#6B7280", // gray-500
  pending: "#0D9488",     // teal-600
};

const FUNNEL_LABELS: Record<string, string> = {
  trial: "Trial",
  active: "Active",
  suspended: "Suspended",
  disconnected: "Disconnected",
  pending: "Pending",
};

const CONNECTION_COLORS: Record<string, string> = {
  FTTH: "#059669",        // emerald-600
  WIRELESS: "#D97706",    // amber-600
  CABLE: "#DC2626",       // red-600
  LEASED_LINE: "#0D9488", // teal-600
  ETHERNET: "#EA580C",    // orange-600
};

const CONNECTION_ICONS: Record<string, React.ElementType> = {
  FTTH: Cable,
  WIRELESS: Wifi,
  CABLE: Network,
  LEASED_LINE: Server,
  ETHERNET: Radio,
};

const PLAN_COLORS = ["#DC2626", "#0D9488", "#D97706", "#059669", "#EA580C"];

// ─── Custom Pie Tooltip ─────────────────────────────────────────

function PieTooltip({ active, payload }: { active?: boolean; payload?: { payload: PlanItem }[] }) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="bg-card/90 border border-border/80 rounded-xl shadow-2xl px-4 py-3 text-xs backdrop-blur-md">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-semibold text-foreground">{item.planName}</span>
      </div>
      <p className="text-muted-foreground">
        Subscribers: <span className="font-semibold text-foreground tabular-nums">{item.count}</span>
      </p>
    </div>
  );
}

// ─── Funnel Bar ─────────────────────────────────────────────────

function FunnelBar({
  label,
  count,
  total,
  color,
  icon: Icon,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
  icon?: React.ElementType;
}) {
  const percentage = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0">
      <div className="flex items-center gap-2 w-28 shrink-0">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
        <span className="text-xs font-medium text-foreground truncate">{label}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="h-2.5 w-full rounded-full bg-muted/60 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${Math.max(percentage, 2)}%`,
              backgroundColor: color,
            }}
          />
        </div>
      </div>
      <span
        className="text-xs font-bold tabular-nums w-10 text-right shrink-0"
        style={{ color }}
      >
        {count}
      </span>
      <span className="text-[10px] text-muted-foreground tabular-nums w-10 text-right shrink-0">
        {percentage.toFixed(1)}%
      </span>
    </div>
  );
}

// ─── Loading Skeleton ───────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-5">
      {/* Funnel */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-2.5 flex-1 rounded-full" />
            <Skeleton className="h-4 w-8" />
            <Skeleton className="h-3 w-10" />
          </div>
        ))}
      </div>
      {/* Connection type bars */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-36" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-2.5 flex-1 rounded-full" />
            <Skeleton className="h-4 w-6" />
          </div>
        ))}
      </div>
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
      </div>
      {/* Plan donut */}
      <div className="flex items-center gap-4">
        <Skeleton className="h-[120px] w-[120px] rounded-full" />
        <div className="space-y-2 flex-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="h-3 w-3 rounded-full" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-6 ml-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Subscriber Analytics Widget ────────────────────────────────

export function SubscriberAnalyticsWidget() {
  const [data, setData] = useState<SubscriberAnalyticsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    else setIsRefetching(true);

    try {
      const res = await fetch("/api/dashboard/subscriber-analytics", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch subscriber analytics");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Subscriber analytics fetch error:", err);
    } finally {
      setIsLoading(false);
      setIsRefetching(false);
    }
  }, []);

  // Initial fetch + auto-refresh every 120s
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

  const funnelEntries = data
    ? [
        { key: "active", ...data.funnel },
        { key: "trial", ...data.funnel },
        { key: "suspended", ...data.funnel },
        { key: "disconnected", ...data.funnel },
        { key: "pending", ...data.funnel },
      ]
    : [];

  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter hover:shadow-md hover:border-red-200 dark:hover:border-red-800/50 transition-all duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-red-400 to-rose-500 text-white shadow-sm">
              <Users className="h-3.5 w-3.5" />
            </div>
            Subscriber Analytics
            {data && (
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0 h-5 font-medium tabular-nums bg-muted/60"
              >
                {data.funnel.total.toLocaleString("en-IN")}
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={handleRefresh}
            disabled={isRefetching}
            aria-label="Refresh subscriber analytics"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <LoadingSkeleton />
        ) : data ? (
          <div className="space-y-5">
            {/* ── Subscriber Funnel ── */}
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Subscriber Funnel
              </p>
              <div>
                {funnelEntries.map((entry) => (
                  <FunnelBar
                    key={entry.key}
                    label={FUNNEL_LABELS[entry.key]}
                    count={data.funnel[entry.key as keyof FunnelData]}
                    total={data.funnel.total}
                    color={FUNNEL_COLORS[entry.key]}
                  />
                ))}
              </div>
            </div>

            {/* ── Connection Type Breakdown ── */}
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Connection Types
              </p>
              <div>
                {data.connectionTypes
                  .filter((ct) => ct.count > 0)
                  .sort((a, b) => b.count - a.count)
                  .map((ct) => {
                    const Icon = CONNECTION_ICONS[ct.type] || Wifi;
                    return (
                      <FunnelBar
                        key={ct.type}
                        label={ct.label}
                        count={ct.count}
                        total={data.funnel.total}
                        color={CONNECTION_COLORS[ct.type]}
                        icon={Icon}
                      />
                    );
                  })}
              </div>
            </div>

            {/* ── ARPU & Growth Stats ── */}
            <div className="grid grid-cols-2 gap-3">
              {/* ARPU */}
              <div className="rounded-lg border border-border/60 p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <IndianRupee className="h-3 w-3 text-red-500" />
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    ARPU
                  </span>
                </div>
                <p className="text-lg font-bold tabular-nums text-foreground">
                  {formatINR(data.arpu)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  MRR: {formatINR(data.mrr)}
                </p>
              </div>

              {/* Growth Rate */}
              <div className="rounded-lg border border-border/60 p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingUp className="h-3 w-3 text-teal-500" />
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Growth Rate
                  </span>
                </div>
                <p
                  className={`text-lg font-bold tabular-nums flex items-center gap-1 ${
                    data.growthRate >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {data.growthRate >= 0 ? (
                    <TrendingUp className="h-4 w-4" />
                  ) : (
                    <TrendingDown className="h-4 w-4" />
                  )}
                  {data.growthRate >= 0 ? "+" : ""}
                  {data.growthRate}%
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {data.newThisMonth} this month vs {data.newLastMonth} last
                </p>
              </div>
            </div>

            {/* ── Plan Distribution Donut ── */}
            {data.planDistribution.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Top Plans by Subscribers
                </p>
                <div className="flex items-center gap-4">
                  {/* Donut chart */}
                  <div className="relative w-[120px] h-[120px] shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data.planDistribution}
                          cx="50%"
                          cy="50%"
                          innerRadius="50%"
                          outerRadius="85%"
                          paddingAngle={2}
                          dataKey="count"
                          nameKey="planName"
                          strokeWidth={0}
                          animationBegin={0}
                          animationDuration={800}
                          animationEasing="ease-out"
                        >
                          {data.planDistribution.map((_entry, index) => (
                            <Cell
                              key={`plan-${index}`}
                              fill={PLAN_COLORS[index % PLAN_COLORS.length]}
                              className="transition-opacity hover:opacity-80"
                            />
                          ))}
                        </Pie>
                        <RechartsTooltip content={<PieTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Center label */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-[10px] text-muted-foreground">Active</span>
                      <span className="text-sm font-bold tabular-nums text-foreground">
                        {data.activeSubscribers}
                      </span>
                    </div>
                  </div>

                  {/* Plan legend */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    {data.planDistribution.map((plan, index) => (
                      <div key={plan.planName} className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: PLAN_COLORS[index % PLAN_COLORS.length] }}
                        />
                        <span className="text-[11px] font-medium text-foreground truncate flex-1">
                          {plan.planName}
                        </span>
                        <Badge
                          variant="secondary"
                          className="text-[9px] px-1.5 py-0 h-4 font-medium tabular-nums bg-muted/60 shrink-0"
                        >
                          {plan.count}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

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
