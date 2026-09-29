"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, Clock, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Types ──────────────────────────────────────────────────────

interface PriorityMetrics {
  priority: string;
  label: string;
  open: number;
  breached: number;
  total: number;
  resolvedOnTime: number;
  complianceRate: number;
}

interface SlaMonitorResponse {
  overallComplianceRate: number;
  totalComplaints: number;
  openComplaints: number;
  breachedCount: number;
  resolvedOnTimeCount: number;
  avgResolutionTimeHours: number;
  priorities: PriorityMetrics[];
  timestamp: string;
}

// ─── Color helpers ──────────────────────────────────────────────

function complianceColor(rate: number): string {
  if (rate >= 95) return "#16A34A"; // green-600
  if (rate >= 80) return "#D97706"; // amber-600
  return "#DC2626"; // red-600
}

function complianceBgClass(rate: number): string {
  if (rate >= 95) return "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400";
  if (rate >= 80) return "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400";
  return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400";
}

function complianceRingTrack(rate: number): string {
  if (rate >= 95) return "stroke-green-500";
  if (rate >= 80) return "stroke-yellow-500";
  return "stroke-red-500";
}

function priorityColor(priority: string): string {
  switch (priority) {
    case "P1_CRITICAL":
      return "#DC2626";
    case "P2_HIGH":
      return "#EA580C";
    case "P3_MEDIUM":
      return "#D97706";
    case "P4_LOW":
      return "#16A34A";
    default:
      return "#6B7280";
  }
}

// ─── Circular Progress Ring ──────────────────────────────────────

function ComplianceRing({ percentage, size = 140 }: { percentage: number; size?: number }) {
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;
  const color = complianceColor(percentage);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/30"
        />
        {/* Progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-3xl font-bold tabular-nums"
          style={{ color }}
        >
          {percentage.toFixed(1)}
        </span>
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mt-0.5">
          % Compliant
        </span>
      </div>
    </div>
  );
}

// ─── Mini Progress Bar ──────────────────────────────────────────

function MiniProgressBar({ percentage, color }: { percentage: number; color: string }) {
  const clampedPercent = Math.min(Math.max(percentage, 0), 100);
  return (
    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700 ease-out"
        style={{
          width: `${clampedPercent}%`,
          backgroundColor: color,
        }}
      />
    </div>
  );
}

// ─── Priority Row ───────────────────────────────────────────────

function PriorityRow({ metrics }: { metrics: PriorityMetrics }) {
  const color = priorityColor(metrics.priority);

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border/40 last:border-0">
      {/* Priority dot + label */}
      <div className="flex items-center gap-2 w-20 shrink-0">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="text-xs font-semibold text-foreground truncate">
          {metrics.label}
        </span>
      </div>

      {/* Open count */}
      <span className="text-xs text-muted-foreground tabular-nums w-8 text-center shrink-0">
        {metrics.open} open
      </span>

      {/* Mini progress bar */}
      <div className="flex-1 min-w-0">
        <MiniProgressBar percentage={metrics.complianceRate} color={complianceColor(metrics.complianceRate)} />
      </div>

      {/* Breach count */}
      <div className="flex items-center gap-1 w-16 justify-end shrink-0">
        {metrics.breached > 0 ? (
          <>
            <AlertTriangle className="h-3 w-3 text-red-500" />
            <span className="text-xs font-bold text-red-600 dark:text-red-400 tabular-nums">
              {metrics.breached}
            </span>
          </>
        ) : (
          <span className="text-xs font-medium text-green-600 dark:text-green-400 tabular-nums">
            0
          </span>
        )}
      </div>

      {/* Compliance % */}
      <span
        className="text-[11px] font-bold tabular-nums w-12 text-right shrink-0"
        style={{ color: complianceColor(metrics.complianceRate) }}
      >
        {metrics.complianceRate}%
      </span>
    </div>
  );
}

// ─── SLA Monitor Widget ─────────────────────────────────────────

export function SlaMonitorWidget() {
  const [data, setData] = useState<SlaMonitorResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    else setIsRefetching(true);

    try {
      const res = await fetch("/api/sla/monitor", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch SLA data");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("SLA monitor fetch error:", err);
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

  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter hover:shadow-md transition-all duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Shield className="h-4 w-4 text-red-500" />
            SLA Compliance
            {data && (
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${complianceBgClass(data.overallComplianceRate)}`}
              >
                {data.overallComplianceRate.toFixed(1)}%
              </span>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={handleRefresh}
            disabled={isRefetching}
            aria-label="Refresh SLA data"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="flex flex-col items-center py-4 gap-6">
            <Skeleton className="h-[140px] w-[140px] rounded-full" />
            <div className="w-full space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-1.5 flex-1 rounded-full" />
                  <Skeleton className="h-4 w-8" />
                </div>
              ))}
            </div>
            <Skeleton className="h-4 w-32" />
          </div>
        ) : data ? (
          <div className="flex flex-col items-center gap-4">
            {/* ── Circular Compliance Ring ── */}
            <ComplianceRing percentage={data.overallComplianceRate} />

            {/* ── Summary Stats ── */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                <span>Avg Resolution: <span className="font-semibold text-foreground">{data.avgResolutionTimeHours}h</span></span>
              </div>
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3 text-red-500" />
                <span>Breaches: <span className="font-bold text-red-600 dark:text-red-400">{data.breachedCount}</span></span>
              </div>
            </div>

            {/* ── Priority Breakdown ── */}
            <div className="w-full mt-2">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Priority Breakdown
              </p>
              <div className="divide-y divide-border/40">
                {data.priorities.map((p) => (
                  <PriorityRow key={p.priority} metrics={p} />
                ))}
              </div>
            </div>

            {/* ── Footer ── */}
            <p className="text-[10px] text-muted-foreground/60 mt-1 text-right">
              Auto-refreshes every 60s
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
