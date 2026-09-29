"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, formatINR } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  CreditCard,
  Wifi,
  Activity,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

interface PerformanceData {
  revenueThisMonth: number;
  revenueChangePercent: number;
  totalActive: number;
  newThisMonth: number;
  networkUptime: number;
  uptimeTrend: number;
  arpu: number;
  churnRate: number;
  collectionToday: number;
  dailyTarget: number;
  openComplaints: number;
  criticalCount: number;
  currentBandwidth: number;
  peakBandwidth: number;
  onlineDevices: number;
  totalDevices: number;
}

interface MetricItem {
  label: string;
  value: string;
  trend: "up" | "down" | "neutral" | "good" | "bad" | "warning";
  trendLabel: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  barValue: number;
  barColor: string;
}

export function PerformanceMetricsWidget() {
  const { data, isLoading } = useQuery<PerformanceData>({
    queryKey: ["performance-metrics"],
    queryFn: () => apiFetch<PerformanceData>("/api/dashboard?range=30d"),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const metrics: MetricItem[] = React.useMemo(() => {
    if (!data) return [];
    const collectionPct = data.dailyTarget > 0 ? Math.round((data.collectionToday / data.dailyTarget) * 100) : 0;
    const bwPct = data.peakBandwidth > 0 ? Math.round((data.currentBandwidth / data.peakBandwidth) * 100) : 0;
    const devicePct = data.totalDevices > 0 ? Math.round((data.onlineDevices / data.totalDevices) * 100) : 0;

    return [
      {
        label: "Revenue Growth",
        value: `${data.revenueChangePercent >= 0 ? "+" : ""}${data.revenueChangePercent}%`,
        trend: data.revenueChangePercent > 5 ? "good" : data.revenueChangePercent < 0 ? "bad" : "neutral",
        trendLabel: data.revenueChangePercent >= 0 ? "Growing" : "Declining",
        icon: TrendingUp,
        iconBg: "bg-red-100 dark:bg-red-950/40",
        iconColor: "text-red-600 dark:text-red-400",
        barValue: Math.max(0, Math.min(100, 50 + data.revenueChangePercent)),
        barColor: data.revenueChangePercent >= 0 ? "bg-gradient-to-r from-red-500 to-red-400" : "bg-gradient-to-r from-red-400 to-red-300",
      },
      {
        label: "Subscriber Growth",
        value: `+${data.newThisMonth}`,
        trend: data.newThisMonth > 10 ? "good" : data.newThisMonth > 0 ? "neutral" : "bad",
        trendLabel: `${data.newThisMonth} new`,
        icon: Users,
        iconBg: "bg-green-100 dark:bg-green-950/40",
        iconColor: "text-green-600 dark:text-green-400",
        barValue: Math.min(100, (data.newThisMonth / Math.max(data.totalActive, 1)) * 500),
        barColor: "bg-gradient-to-r from-green-500 to-green-400",
      },
      {
        label: "Network Uptime",
        value: `${data.networkUptime}%`,
        trend: data.networkUptime >= 99.5 ? "good" : data.networkUptime >= 99 ? "warning" : "bad",
        trendLabel: `${data.uptimeTrend >= 0 ? "+" : ""}${data.uptimeTrend}%`,
        icon: Wifi,
        iconBg: "bg-teal-100 dark:bg-teal-950/40",
        iconColor: "text-teal-600 dark:text-teal-400",
        barValue: data.networkUptime,
        barColor: data.networkUptime >= 99.5 ? "bg-gradient-to-r from-teal-500 to-teal-400" : data.networkUptime >= 99 ? "bg-gradient-to-r from-amber-500 to-amber-400" : "bg-gradient-to-r from-red-500 to-red-400",
      },
      {
        label: "Collection Target",
        value: `${collectionPct}%`,
        trend: collectionPct >= 80 ? "good" : collectionPct >= 50 ? "warning" : "bad",
        trendLabel: formatINR(data.collectionToday),
        icon: CreditCard,
        iconBg: "bg-emerald-100 dark:bg-emerald-950/40",
        iconColor: "text-emerald-600 dark:text-emerald-400",
        barValue: collectionPct,
        barColor: collectionPct >= 80 ? "bg-gradient-to-r from-emerald-500 to-emerald-400" : collectionPct >= 50 ? "bg-gradient-to-r from-amber-500 to-amber-400" : "bg-gradient-to-r from-red-500 to-red-400",
      },
      {
        label: "Bandwidth Usage",
        value: `${bwPct}%`,
        trend: bwPct > 85 ? "bad" : bwPct > 60 ? "warning" : "good",
        trendLabel: `${(data.currentBandwidth / 1000000).toFixed(0)} Mbps`,
        icon: Zap,
        iconBg: "bg-amber-100 dark:bg-amber-950/40",
        iconColor: "text-amber-600 dark:text-amber-400",
        barValue: bwPct,
        barColor: bwPct > 85 ? "bg-gradient-to-r from-red-500 to-red-400" : bwPct > 60 ? "bg-gradient-to-r from-amber-500 to-amber-400" : "bg-gradient-to-r from-green-500 to-green-400",
      },
      {
        label: "Device Online %",
        value: `${devicePct}%`,
        trend: devicePct >= 95 ? "good" : devicePct >= 80 ? "warning" : "bad",
        trendLabel: `${data.onlineDevices}/${data.totalDevices}`,
        icon: Activity,
        iconBg: "bg-indigo-100 dark:bg-indigo-950/40",
        iconColor: "text-indigo-600 dark:text-indigo-400",
        barValue: devicePct,
        barColor: devicePct >= 95 ? "bg-gradient-to-r from-indigo-500 to-indigo-400" : devicePct >= 80 ? "bg-gradient-to-r from-amber-500 to-amber-400" : "bg-gradient-to-r from-red-500 to-red-400",
      },
    ];
  }, [data]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 animate-card-enter">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border p-3 space-y-2">
            <div className="h-4 w-20 bg-muted animate-pulse rounded" />
            <div className="h-6 w-14 bg-muted animate-pulse rounded" />
            <div className="h-1.5 w-full bg-muted rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {metrics.map((metric, idx) => {
        const Icon = metric.icon;
        const TrendIcon = metric.trend === "good" || metric.trend === "up"
          ? ArrowUpRight
          : metric.trend === "bad" || metric.trend === "down"
            ? ArrowDownRight
            : Minus;
        const trendColorClass = metric.trend === "good" || metric.trend === "up"
          ? "text-green-500"
          : metric.trend === "bad" || metric.trend === "down"
            ? "text-red-500"
            : metric.trend === "warning"
              ? "text-amber-500"
              : "text-muted-foreground";

        return (
          <div
            key={metric.label}
            className="rounded-xl border shadow-sm p-3 animate-slide-up hover:shadow-md hover:border-border/80 transition-all duration-200 group"
            style={{ animationDelay: `${idx * 60}ms` }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider truncate">
                {metric.label}
              </span>
              <div className={`p-1.5 rounded-md ${metric.iconBg} ${metric.iconColor}`}>
                <Icon className="h-3 w-3" />
              </div>
            </div>
            <div className="flex items-end gap-1.5 mb-2">
              <span className="text-lg font-bold tabular-nums animate-count-up">{metric.value}</span>
              <TrendIcon className={`h-3 w-3 mb-0.5 ${trendColorClass}`} />
            </div>
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full animate-progress transition-all duration-700"
                style={{
                  "--progress": `${Math.min(metric.barValue, 100)}%`,
                  width: `${Math.min(metric.barValue, 100)}%`,
                } as React.CSSProperties}
              >
                <div className={`h-full w-full rounded-full ${metric.barColor}`} />
              </div>
            </div>
            <p className="text-[9px] text-muted-foreground mt-1 truncate">{metric.trendLabel}</p>
          </div>
        );
      })}
    </div>
  );
}
