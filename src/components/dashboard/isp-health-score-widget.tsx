"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Heart, RefreshCw } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

interface HealthScoreResponse {
  score: number;
  uptime: number;
  activeRatio: number;
  complaintRate: number;
  components: {
    uptime: { score: number; label: string };
    activeRatio: { score: number; label: string };
    complaintRate: { score: number; label: string };
  };
}

// ─── Color helpers ──────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 80) return "#16A34A"; // green-600
  if (score >= 60) return "#D97706"; // amber-600
  return "#DC2626"; // red-600
}

function scoreBgClass(score: number): string {
  if (score >= 80) return "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400";
  if (score >= 60) return "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400";
  return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400";
}

function scoreLabel(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 80) return "Good";
  if (score >= 60) return "Fair";
  if (score >= 40) return "Poor";
  return "Critical";
}

// ─── Circular Gauge ─────────────────────────────────────────────

function HealthGauge({ score }: { score: number }) {
  const size = 130;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = scoreColor(score);

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
          {score}
        </span>
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mt-0.5">
          {scoreLabel(score)}
        </span>
      </div>
    </div>
  );
}

// ─── Metric Row ─────────────────────────────────────────────────

function MetricRow({
  label,
  value,
  score,
}: {
  label: string;
  value: string;
  score: number;
}) {
  const color = scoreColor(score);
  const widthPct = Math.min(Math.max(score, 0), 100);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <span
          className="text-[11px] font-bold tabular-nums"
          style={{ color }}
        >
          {value}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${widthPct}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  );
}

// ─── ISP Health Score Widget ────────────────────────────────────

export function IspHealthScoreWidget() {
  const [data, setData] = useState<HealthScoreResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    else setIsRefetching(true);

    try {
      const res = await fetch("/api/dashboard/health-score", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch health score");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("ISP Health Score fetch error:", err);
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

  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter hover:shadow-md transition-all duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-red-100 dark:bg-red-950/40">
              <Heart className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
            ISP Health Score
            {data && (
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${scoreBgClass(data.score)}`}
              >
                {data.score}/100
              </span>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => fetchData(false)}
            disabled={isRefetching}
            aria-label="Refresh health score"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="flex flex-col items-center py-4 gap-5">
            <Skeleton className="h-[130px] w-[130px] rounded-full" />
            <div className="w-full space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-10" />
                  </div>
                  <Skeleton className="h-1.5 w-full rounded-full" />
                </div>
              ))}
            </div>
          </div>
        ) : data ? (
          <div className="flex flex-col items-center gap-4">
            {/* Circular Gauge */}
            <HealthGauge score={data.score} />

            {/* Component Breakdown */}
            <div className="w-full space-y-3 mt-1">
              <MetricRow
                label="Uptime"
                value={`${data.components.uptime.score}%`}
                score={data.components.uptime.score}
              />
              <MetricRow
                label="Active Ratio"
                value={`${data.components.activeRatio.score}%`}
                score={data.components.activeRatio.score}
              />
              <MetricRow
                label="Complaint Score"
                value={`${data.components.complaintRate.score}%`}
                score={data.components.complaintRate.score}
              />
            </div>

            {/* Detail labels */}
            <div className="w-full space-y-1 mt-1">
              <p className="text-[9px] text-muted-foreground/70">{data.components.uptime.label}</p>
              <p className="text-[9px] text-muted-foreground/70">{data.components.activeRatio.label}</p>
              <p className="text-[9px] text-muted-foreground/70">{data.components.complaintRate.label}</p>
            </div>

            {/* Footer */}
            <p className="text-[10px] text-muted-foreground/60 text-right">
              Auto-refreshes every 60s
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
