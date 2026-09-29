"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  RefreshCw,
  AlertTriangle,
  Wifi,
  Cable,
  Radio,
  ArrowRightLeft,
  Clock,
  UserMinus,
  Trophy,
} from "lucide-react";
import { formatINR } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────

interface LifecycleStage {
  stage: string;
  label: string;
  count: number;
  color: string;
}

interface ConnectionTypeItem {
  type: string;
  count: number;
}

interface RecentChurned {
  name: string;
  date: string;
  plan: string;
  reason: string;
}

interface TopPlan {
  name: string;
  count: number;
}

interface SubscriberLifecycleData {
  totalSubscribers: number;
  lifecycleStages: LifecycleStage[];
  connectionTypeBreakdown: ConnectionTypeItem[];
  recentChurned: RecentChurned[];
  avgLifetimeDays: number;
  topPlans: TopPlan[];
}

// ─── Connection type icons & colors ─────────────────────────────

const CONN_TYPE_CONFIG: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  FTTH: { color: "#10B981", icon: Wifi, label: "FTTH" },
  CABLE: { color: "#F59E0B", icon: Cable, label: "Cable" },
  WIRELESS: { color: "#0D9488", icon: Radio, label: "Wireless" },
  LEASED_LINE: { color: "#DC2626", icon: ArrowRightLeft, label: "Leased" },
  ETHERNET: { color: "#78716C", icon: Cable, label: "Ethernet" },
};

// ─── Loading Skeleton ───────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {/* Funnel skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="h-8 w-full rounded" />
          </div>
        ))}
      </div>
      {/* Connection type skeleton */}
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
      {/* Churned skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

// ─── Lifecycle Funnel Row ───────────────────────────────────────

function FunnelRow({
  stage,
  total,
  isMostPopulated,
}: {
  stage: LifecycleStage;
  total: number;
  isMostPopulated: boolean;
}) {
  const pct = total > 0 ? (stage.count / total) * 100 : 0;
  const barWidth = Math.max(pct, 2);

  return (
    <div
      className={`flex items-center gap-3 py-1.5 px-2 rounded-md transition-all duration-200 ${
        isMostPopulated
          ? "bg-muted/60 ring-1 ring-emerald-500/30"
          : "hover:bg-muted/30"
      }`}
    >
      {/* Color indicator */}
      <div
        className="w-1 self-stretch rounded-full shrink-0"
        style={{ backgroundColor: stage.color }}
      />
      {/* Label */}
      <span
        className="text-[11px] font-medium w-24 shrink-0 truncate"
        style={{ color: stage.color }}
      >
        {stage.label}
      </span>
      {/* Percentage bar */}
      <div className="flex-1 min-w-0">
        <div className="h-3 w-full rounded-full bg-muted/40 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${barWidth}%`,
              backgroundColor: stage.color,
              opacity: isMostPopulated ? 1 : 0.7,
            }}
          />
        </div>
      </div>
      {/* Count */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span
          className="text-[12px] font-bold tabular-nums"
          style={{ color: stage.color }}
        >
          {stage.count}
        </span>
        <span className="text-[9px] text-muted-foreground tabular-nums">
          {pct.toFixed(0)}%
        </span>
        {isMostPopulated && (
          <Badge
            variant="secondary"
            className="text-[8px] px-1 py-0 h-4 bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
          >
            Top
          </Badge>
        )}
      </div>
    </div>
  );
}

// ─── Connection Type Card ───────────────────────────────────────

function ConnectionTypeCard({ type, count }: { type: ConnectionTypeItem }) {
  const config = CONN_TYPE_CONFIG[type.type] || {
    color: "#78716C",
    icon: Cable,
    label: type.type,
  };
  const IconComp = config.icon;

  return (
    <div className="rounded-lg border border-border/50 p-2.5 flex flex-col items-center gap-1.5 hover:bg-muted/40 transition-colors">
      <div
        className="p-1.5 rounded-md"
        style={{ backgroundColor: `${config.color}15` }}
      >
        <IconComp className="h-3.5 w-3.5" style={{ color: config.color }} />
      </div>
      <span className="text-[13px] font-bold text-foreground tabular-nums">
        {count}
      </span>
      <span className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">
        {config.label}
      </span>
    </div>
  );
}

// ─── Subscriber Lifecycle Widget ────────────────────────────────

export function SubscriberLifecycleWidget() {
  const [data, setData] = useState<SubscriberLifecycleData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    else setIsRefetching(true);
    try {
      const res = await fetch("/api/dashboard/subscriber-lifecycle", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch subscriber lifecycle");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("SubscriberLifecycleWidget fetch error:", err);
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

  const mostPopulatedStage = data?.lifecycleStages.reduce(
    (max, s) => (s.count > max.count ? s : max),
    data.lifecycleStages[0]
  );

  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter hover:shadow-md hover:border-amber-200 dark:hover:border-amber-800/50 transition-all duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-amber-100 dark:bg-amber-950/40">
              <Users className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            Subscriber Lifecycle
            {data && (
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0 h-5 font-bold tabular-nums bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
              >
                {data.totalSubscribers} total
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => fetchData(false)}
            disabled={isRefetching}
            aria-label="Refresh subscriber lifecycle"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <LoadingSkeleton />
        ) : data ? (
          <div className="space-y-4">
            {/* ── Lifecycle Funnel (Vertical) ── */}
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 mb-1">
                <Trophy className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Lifecycle Stages
                </p>
              </div>
              <div className="divide-y divide-border/20">
                {data.lifecycleStages.map((stage) => (
                  <FunnelRow
                    key={stage.stage}
                    stage={stage}
                    total={data.totalSubscribers}
                    isMostPopulated={stage.stage === mostPopulatedStage?.stage}
                  />
                ))}
              </div>
            </div>

            {/* ── Connection Type Breakdown ── */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Wifi className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Connection Types
                </p>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {data.connectionTypeBreakdown.map((ct) => (
                  <ConnectionTypeCard key={ct.type} type={ct} />
                ))}
              </div>
            </div>

            {/* ── Top Plans ── */}
            {data.topPlans.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Trophy className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Top Plans
                  </p>
                </div>
                <div className="space-y-1">
                  {data.topPlans.slice(0, 3).map((plan, i) => (
                    <div
                      key={plan.name}
                      className="flex items-center justify-between px-2 py-1 rounded-md hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-muted-foreground w-4">
                          {i + 1}.
                        </span>
                        <span className="text-[11px] font-medium text-foreground truncate max-w-[160px]">
                          {plan.name}
                        </span>
                      </div>
                      <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {plan.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Recently Churned ── */}
            {data.recentChurned.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <UserMinus className="h-3.5 w-3.5 text-red-500" />
                  <p className="text-[10px] font-medium text-red-600 dark:text-red-400 uppercase tracking-wider">
                    Recently Churned
                  </p>
                </div>
                <div className="space-y-1.5">
                  {data.recentChurned.map((churned, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-red-200/60 dark:border-red-800/30 bg-red-50/40 dark:bg-red-950/15 px-3 py-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-foreground truncate max-w-[140px]">
                          {churned.name}
                        </span>
                        <span className="text-[9px] text-muted-foreground tabular-nums">
                          {churned.date}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-[10px] text-muted-foreground truncate max-w-[160px]">
                          {churned.plan}
                        </span>
                        <span className="text-[10px] text-red-500 truncate max-w-[120px]">
                          {churned.reason}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Avg Lifetime ── */}
            {data.avgLifetimeDays > 0 && (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/30 border border-border/30">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Avg. Subscriber Lifetime
                  </span>
                </div>
                <span className="text-[13px] font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                  {data.avgLifetimeDays} days
                </span>
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
