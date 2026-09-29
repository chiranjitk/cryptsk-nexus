"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Heart, RefreshCw, AlertTriangle, TrendingUp, TrendingDown, Minus, ChevronRight } from "lucide-react";
import { useAppStore } from "@/store/app-store";

// ─── Types ──────────────────────────────────────────────────────

interface EnhancedHealthResponse {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  factors: {
    deviceHealth: { score: number; weight: number; label: string; onlineDevices: number; offlineDevices: number; totalDevices: number; onlineRatio: number };
    subscriberImpact: { score: number; weight: number; label: string; activeSubscribers: number; totalSubscribers: number; activeRatio: number };
    complaintDensity: { score: number; weight: number; label: string; complaints7d: number; avgDensityPer100: number };
    resolutionTime: { score: number; weight: number; label: string; avgHours: number; totalResolved: number };
    alertSeverity: { score: number; weight: number; label: string; critical: number; high: number; medium: number; low: number; totalActive: number };
  };
  predictions: { type: string; severity: string; confidence: number; message: string }[];
  recommendations: string[];
}

// ─── Color helpers ──────────────────────────────────────────────

function gradeColor(grade: string): string {
  switch (grade) {
    case "A": return "#16A34A";
    case "B": return "#0D9488";
    case "C": return "#D97706";
    case "D": return "#EA580C";
    case "F": return "#DC2626";
    default: return "#6B7280";
  }
}

function gradeBgClass(grade: string): string {
  switch (grade) {
    case "A": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400";
    case "B": return "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400";
    case "C": return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400";
    case "D": return "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400";
    case "F": return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400";
    default: return "bg-gray-100 text-gray-700 dark:bg-gray-950/40 dark:text-gray-400";
  }
}

function scoreColor(score: number): string {
  if (score >= 80) return "#16A34A";
  if (score >= 60) return "#D97706";
  return "#DC2626";
}

// ─── Circular Gauge ─────────────────────────────────────────────

function HealthGauge({ score, grade }: { score: number; grade: string }) {
  const size = 120;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = gradeColor(grade);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="currentColor" strokeWidth={strokeWidth}
          className="text-muted/30"
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-black tabular-nums" style={{ color }}>
          {score}
        </span>
        <span
          className="text-lg font-black leading-none mt-0.5"
          style={{ color }}
        >
          {grade}
        </span>
      </div>
    </div>
  );
}

// ─── Factor Mini Bar ────────────────────────────────────────────

function FactorBar({ label, score, value }: { label: string; score: number; value: string }) {
  const color = scoreColor(score);
  const isCritical = score < 40;
  const widthPct = Math.min(Math.max(score, 0), 100);

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className={`text-[10px] truncate max-w-[100px] ${isCritical ? "text-red-600 dark:text-red-400 font-semibold" : "text-muted-foreground"}`}>
          {isCritical && (
            <AlertTriangle className="inline h-2.5 w-2.5 mr-0.5 animate-pulse" />
          )}
          {label}
        </span>
        <span className="text-[10px] font-bold tabular-nums" style={{ color }}>
          {value}
        </span>
      </div>
      <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${isCritical ? "animate-pulse" : ""}`}
          style={{ width: `${widthPct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ─── Loading Skeleton ───────────────────────────────────────────

function WidgetSkeleton() {
  return (
    <Card className="border shadow-sm rounded-xl">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-7 w-7 rounded-full" />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-col items-center py-4 gap-4">
          <Skeleton className="h-[120px] w-[120px] rounded-full" />
          <div className="w-full space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-0.5">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-10" />
                </div>
                <Skeleton className="h-1 w-full rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Widget ────────────────────────────────────────────────

export function NetworkHealthEnhancedWidget() {
  const [data, setData] = useState<EnhancedHealthResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { setCurrentPage } = useAppStore();

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    else setIsRefetching(true);

    try {
      const res = await fetch("/api/network/health-enhanced", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch enhanced health score");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Network Health Enhanced fetch error:", err);
    } finally {
      setIsLoading(false);
      setIsRefetching(false);
    }
  }, []);

  useEffect(() => {
    fetchData(true);
    intervalRef.current = setInterval(() => fetchData(false), 60000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  const hasCriticalFactor = data
    ? Object.values(data.factors).some((f) => f.score < 40)
    : false;

  if (isLoading) return <WidgetSkeleton />;

  if (!data) return null;

  const handleViewFull = () => {
    setCurrentPage("Network Health", "NETWORK");
  };

  return (
    <Card className={`border shadow-sm rounded-xl animate-card-enter hover:shadow-md transition-all duration-200 ${hasCriticalFactor ? "ring-2 ring-red-500/30" : ""}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-red-100 dark:bg-red-950/40">
              <Heart className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
            AI Network Health
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${gradeBgClass(data.grade)}`}>
              {data.grade}
            </span>
            {data.predictions.length > 0 && (
              <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4 animate-badge-pulse">
                {data.predictions.length} prediction{data.predictions.length > 1 ? "s" : ""}
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-1">
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
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-col items-center gap-4">
          {/* Gauge */}
          <HealthGauge score={data.score} grade={data.grade} />

          {/* 5 Factor Bars */}
          <div className="w-full space-y-2">
            <FactorBar
              label="Devices"
              score={data.factors.deviceHealth.score}
              value={`${data.factors.deviceHealth.onlineDevices}/${data.factors.deviceHealth.totalDevices}`}
            />
            <FactorBar
              label="Subscribers"
              score={data.factors.subscriberImpact.score}
              value={`${data.factors.subscriberImpact.activeRatio}%`}
            />
            <FactorBar
              label="Complaints"
              score={data.factors.complaintDensity.score}
              value={`${data.factors.complaintDensity.complaints7d}/7d`}
            />
            <FactorBar
              label="Resolution"
              score={data.factors.resolutionTime.score}
              value={`${data.factors.resolutionTime.avgHours}h`}
            />
            <FactorBar
              label="Alerts"
              score={data.factors.alertSeverity.score}
              value={`${data.factors.alertSeverity.totalActive} active`}
            />
          </div>

          {/* Critical warning */}
          {hasCriticalFactor && (
            <div className="w-full rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-red-600 dark:text-red-400 animate-pulse shrink-0" />
              <span className="text-[10px] text-red-700 dark:text-red-300 leading-tight">
                {data.recommendations[0] || "Critical factors detected"}
              </span>
            </div>
          )}

          {/* View Full Link */}
          <button
            onClick={handleViewFull}
            className="w-full flex items-center justify-center gap-1 text-[10px] text-muted-foreground hover:text-red-600 dark:hover:text-red-400 transition-colors py-1 group"
          >
            View Full Analysis
            <ChevronRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
