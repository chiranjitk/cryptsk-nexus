"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  Wifi,
  Users,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Types ──────────────────────────────────────────────────────

interface NetworkStatusData {
  devices: {
    total: number;
    online: number;
    offline: number;
    warning: number;
  };
  subscribers: {
    total: number;
    active: number;
  };
  complaints: {
    open: number;
    byPriority: {
      P1: number;
      P2: number;
      P3: number;
      P4: number;
    };
  };
  networkUptime: number;
  timestamp: string;
}

type StatusLevel = "green" | "yellow" | "red";

interface NetworkSegment {
  label: string;
  status: StatusLevel;
}

// ─── Circular Progress (CSS-only) ───────────────────────────────

function CircularProgress({
  value,
  size = 80,
  strokeWidth = 6,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  const color =
    value >= 99.5
      ? "text-emerald-500"
      : value >= 99
        ? "text-amber-500"
        : "text-red-500";

  const trackColor =
    value >= 99.5
      ? "stroke-emerald-200 dark:stroke-emerald-900/50"
      : value >= 99
        ? "stroke-amber-200 dark:stroke-amber-900/50"
        : "stroke-red-200 dark:stroke-red-900/50";

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg
        width={size}
        height={size}
        className="-rotate-90"
        aria-label={`Uptime: ${value}%`}
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className={trackColor}
        />
        {/* Progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={`${color} transition-all duration-1000 ease-out`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={`text-sm font-bold tabular-nums leading-none ${color}`}
        >
          {value.toFixed(1)}
        </span>
        <span className="text-[8px] text-muted-foreground mt-0.5">%</span>
      </div>
    </div>
  );
}

// ─── Status Dot ─────────────────────────────────────────────────

function StatusDot({ status }: { status: StatusLevel }) {
  const colors = {
    green: "bg-green-500",
    yellow: "bg-yellow-500",
    red: "bg-red-500",
  };
  const pulse = status === "green" ? "animate-pulse" : "";
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${colors[status]} ${pulse} ring-2 ring-offset-1 ring-offset-background ${
        status === "green"
          ? "ring-green-500/30"
          : status === "yellow"
            ? "ring-yellow-500/30"
            : "ring-red-500/30"
      }`}
    />
  );
}

// ─── Derive network segment status from data ───────────────────

function deriveSegments(data: NetworkStatusData): NetworkSegment[] {
  const deviceRatio =
    (data.devices?.total ?? 0) > 0 ? (data.devices?.online ?? 0) / (data.devices?.total ?? 1) : 1;

  // Core Network — based on uptime
  const coreStatus: StatusLevel =
    data.networkUptime >= 99.5
      ? "green"
      : data.networkUptime >= 99
        ? "yellow"
        : "red";

  // Distribution — based on device health
  const distStatus: StatusLevel =
    deviceRatio >= 0.95
      ? "green"
      : deviceRatio >= 0.8
        ? "yellow"
        : "red";

  // Last Mile — based on subscriber active ratio + complaints
  const subRatio =
    (data.subscribers?.total ?? 0) > 0
      ? (data.subscribers?.active ?? 0) / (data.subscribers?.total ?? 1)
      : 1;
  const complaintSeverity =
    (data.complaints?.open ?? 0) > 10
      ? 2
      : (data.complaints?.open ?? 0) > 3
        ? 1
        : 0;
  const lastMileStatus: StatusLevel =
    subRatio >= 0.9 && complaintSeverity === 0
      ? "green"
      : subRatio >= 0.7 && complaintSeverity <= 1
        ? "yellow"
        : "red";

  return [
    { label: "Core Network", status: coreStatus },
    { label: "Distribution", status: distStatus },
    { label: "Last Mile", status: lastMileStatus },
  ];
}

// ─── Priority badge config ──────────────────────────────────────

const PRIORITY_CONFIG: {
  key: string;
  label: string;
  badgeClass: string;
}[] = [
  {
    key: "P1",
    label: "Critical",
    badgeClass:
      "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  },
  {
    key: "P2",
    label: "High",
    badgeClass:
      "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400",
  },
  {
    key: "P3",
    label: "Medium",
    badgeClass:
      "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400",
  },
  {
    key: "P4",
    label: "Low",
    badgeClass:
      "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400",
  },
];

// ─── Network Status Widget ──────────────────────────────────────

export function NetworkStatusWidget() {
  const [data, setData] = useState<NetworkStatusData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);

  const fetchData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setIsRefetching(true);
    try {
      const res = await fetch("/api/network/status", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("NetworkStatusWidget fetch error:", err);
    } finally {
      setIsLoading(false);
      setIsRefetching(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData(true);
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const segments = data ? deriveSegments(data) : [];

  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-red-500" />
            Network Status
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => fetchData(true)}
            disabled={isRefetching}
            aria-label="Refresh network status"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
        {data && (
          <div className="flex items-center gap-2 pt-0.5">
            <span className="text-[10px] text-muted-foreground">
              Last updated:{" "}
              {new Date(data.timestamp).toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          </div>
        )}
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {isLoading ? (
          <div className="space-y-4">
            <div className="flex justify-center py-2">
              <Skeleton className="h-20 w-20 rounded-full" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-12 rounded-lg" />
          </div>
        ) : data ? (
          <>
            {/* ── Network Segments ── */}
            <div className="grid grid-cols-3 gap-2">
              {segments.map((seg) => (
                <div
                  key={seg.label}
                  className="flex flex-col items-center gap-1.5 rounded-lg border border-border/60 p-2.5 hover:bg-muted/40 transition-colors"
                >
                  <StatusDot status={seg.status} />
                  <span className="text-[10px] font-medium text-muted-foreground text-center leading-tight">
                    {seg.label}
                  </span>
                </div>
              ))}
            </div>

            {/* ── Uptime Circular Progress + Subscribers ── */}
            <div className="flex items-center gap-4 rounded-lg border border-border/60 p-3">
              <CircularProgress value={data.networkUptime} size={72} strokeWidth={5} />

              <div className="flex-1 min-w-0 space-y-2">
                {/* Subscribers */}
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-muted text-muted-foreground shrink-0">
                    <Users className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Active Subscribers
                    </p>
                    <p className="text-xs font-semibold text-foreground tabular-nums">
                      {data.subscribers.active.toLocaleString("en-IN")}{" "}
                      <span className="text-muted-foreground font-normal">
                        / {data.subscribers.total.toLocaleString("en-IN")}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Devices */}
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-muted text-muted-foreground shrink-0">
                    <Wifi className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      Online Devices
                    </p>
                    <p className="text-xs font-semibold text-foreground tabular-nums">
                      {data.devices.online}{" "}
                      <span className="text-muted-foreground font-normal">
                        / {data.devices.total}
                      </span>
                      {data.devices.warning > 0 && (
                        <span className="text-amber-600 text-[10px] ml-1.5">
                          ({data.devices.warning} warning)
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Open Complaints Summary ── */}
            <div className="rounded-lg border border-border/60 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Open Complaints
                </p>
                {data.complaints.open > 0 && (
                  <Badge
                    variant="destructive"
                    className="text-[9px] px-1.5 py-0 h-4 ml-auto"
                  >
                    {data.complaints.open}
                  </Badge>
                )}
              </div>
              {data.complaints.open === 0 ? (
                <p className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                  All clear — no open complaints
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {PRIORITY_CONFIG.map((p) => {
                    const count =
                      data.complaints.byPriority[
                        p.key as keyof typeof data.complaints.byPriority
                      ] ?? 0;
                    if (count === 0) return null;
                    return (
                      <div
                        key={p.key}
                        className={`flex items-center justify-between rounded-md px-2 py-1.5 ${p.badgeClass}`}
                      >
                        <span className="text-[10px] font-medium">
                          {p.label}
                        </span>
                        <span className="text-[10px] font-bold tabular-nums">
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Auto-refresh indicator ── */}
            <p className="text-[10px] text-muted-foreground/60 text-right">
              Auto-refreshes every 30s
            </p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
