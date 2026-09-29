"use client";

import React, { useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, Database, Cpu, Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Types ──────────────────────────────────────────────────────

interface SystemHealthResponse {
  status: "healthy" | "degraded" | "critical";
  uptime: number;
  uptimeHuman: string;
  memory: {
    used: string;
    total: string;
    percentage: number;
    rss: number;
  };
  database: {
    status: "connected" | "error";
    size: string;
  };
  version: string;
  timestamp: string;
  server: string;
}

interface MetricItem {
  id: string;
  label: string;
  value: string;
  status: "green" | "yellow" | "red";
  icon: React.ElementType;
}

// ─── Status helpers ─────────────────────────────────────────────

function statusDot(status: "green" | "yellow" | "red") {
  const colors = {
    green: "bg-green-500",
    yellow: "bg-yellow-500",
    red: "bg-red-500",
  };
  const pulse = status === "green" ? "animate-pulse" : "";
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${colors[status]} ${pulse}`}
    />
  );
}

function deriveMetrics(health: SystemHealthResponse): MetricItem[] {
  // API Latency — simulated from the timestamp freshness
  const age = Date.now() - new Date(health.timestamp).getTime();
  const latencyStatus: "green" | "yellow" | "red" =
    age < 5000 ? "green" : age < 15000 ? "yellow" : "red";

  // DB Status
  const dbStatus: "green" | "red" =
    health.database.status === "connected" ? "green" : "red";

  // Memory Usage
  const memStatus: "green" | "yellow" | "red" =
    health.memory.percentage < 70 ? "green" :
    health.memory.percentage < 90 ? "yellow" : "red";

  // Uptime — always green if the process is up
  const uptimeStatus: "green" | "yellow" = health.uptime > 300 ? "green" : "yellow";

  return [
    {
      id: "api-latency",
      label: "API Latency",
      value: `${age < 1000 ? `${age}ms` : `${(age / 1000).toFixed(1)}s`} ago`,
      status: latencyStatus,
      icon: Activity,
    },
    {
      id: "db-status",
      label: "DB Status",
      value: health.database.status === "connected"
        ? `Connected (${health.database.size})`
        : "Disconnected",
      status: dbStatus,
      icon: Database,
    },
    {
      id: "memory-usage",
      label: "Memory Usage",
      value: `${health.memory.percentage}% · ${health.memory.used}`,
      status: memStatus,
      icon: Cpu,
    },
    {
      id: "uptime",
      label: "Uptime",
      value: health.uptimeHuman,
      status: uptimeStatus,
      icon: Clock,
    },
  ];
}

// ─── System Health Widget ───────────────────────────────────────

export function SystemHealthWidget() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const {
    data: health,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<SystemHealthResponse>({
    queryKey: ["system-health"],
    queryFn: () => apiFetch<SystemHealthResponse>("/api/system/health"),
    refetchInterval: 30000,
  });

  // Keep a manual interval as a backup to trigger refetch (the query
  // library handles it, but this ensures stale data is refreshed)
  const handleManualRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      refetch();
    }, 30000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refetch]);

  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-red-500" />
            System Health
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={handleManualRefresh}
            disabled={isRefetching}
            aria-label="Refresh system health"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
        {health && (
          <div className="flex items-center gap-2 pt-0.5">
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                health.status === "healthy"
                  ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400"
                  : health.status === "degraded"
                    ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400"
                    : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
              }`}
            >
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  health.status === "healthy"
                    ? "bg-green-500"
                    : health.status === "degraded"
                      ? "bg-yellow-500"
                      : "bg-red-500"
                }`}
              />
              const status = health?.status ?? "unknown";

{status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
            <span className="text-[10px] text-muted-foreground">
              v{health.version}
            </span>
          </div>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border p-3"
              >
                <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </div>
            ))}
          </div>
        ) : health ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {deriveMetrics(health).map((metric) => {
              const Icon = metric.icon;
              return (
                <div
                  key={metric.id}
                  className="flex items-center gap-3 rounded-lg border border-border/60 p-3 hover:bg-muted/40 transition-colors"
                >
                  <div className="p-2 rounded-lg bg-muted text-muted-foreground shrink-0">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {statusDot(metric.status)}
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider truncate">
                        {metric.label}
                      </p>
                    </div>
                    <p className="text-xs font-semibold text-foreground mt-0.5 tabular-nums truncate">
                      {metric.value}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
        {health && (
          <p className="text-[10px] text-muted-foreground/60 mt-3 text-right">
            Auto-refreshes every 30s
          </p>
        )}
      </CardContent>
    </Card>
  );
}
