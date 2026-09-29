"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  UserMinus,
  TrendingDown,
  AlertTriangle,
  ArrowDownRight,
  RefreshCw,
  Wifi,
  Users,
} from "lucide-react";
import { formatINR } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";

// ─── Types ──────────────────────────────────────────────────────

interface Metrics {
  total: number;
  active: number;
  churnedThisMonth: number;
  churnedLastMonth: number;
  churnRate: number;
  retentionRate: number;
  newThisMonth: number;
  newLastMonth: number;
  growthRate: number;
  avgLifetimeDays: number;
  revenueAtRisk: number;
  complaintRatio: number;
}

interface ChurnByType {
  type: string;
  count: number;
}

interface AtRiskSubscriber {
  id: string;
  name: string;
  status: string;
  balance: number;
  plan: string;
  daysSincePayment: number;
}

interface RetentionResponse {
  metrics: Metrics;
  churnByType: ChurnByType[];
  atRiskSubscribers: AtRiskSubscriber[];
  timestamp: string;
}

// ─── Color helpers ──────────────────────────────────────────────

function retentionColor(rate: number): string {
  if (rate >= 95) return "#10B981";
  if (rate >= 85) return "#F59E0B";
  return "#DC2626";
}

function retentionBadgeClass(rate: number): string {
  if (rate >= 95) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400";
  if (rate >= 85) return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400";
  return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400";
}

const TYPE_COLORS: Record<string, string> = {
  FTTH: "#DC2626",
  WIRELESS: "#0D9488",
  CABLE: "#F59E0B",
  LEASED_LINE: "#10B981",
  ETHERNET: "#78716C",
};

const TYPE_ICONS: Record<string, string> = {
  FTTH: "fiber",
  WIRELESS: "wifi",
  CABLE: "cable",
  LEASED_LINE: "ethernet",
  ETHERNET: "ethernet",
};

// ─── Mini Progress Ring ─────────────────────────────────────────

function RetentionRing({ rate }: { rate: number }) {
  const size = 64;
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (rate / 100) * circumference;
  const color = retentionColor(rate);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/30"
        />
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
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold tabular-nums" style={{ color }}>
          {rate}%
        </span>
      </div>
    </div>
  );
}

// ─── Subscriber Flow Bar ────────────────────────────────────────

function FlowSegment({
  label,
  count,
  color,
  total,
}: {
  label: string;
  count: number;
  color: string;
  total: number;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex-1 min-w-0 text-center">
      <div
        className="h-8 rounded-md mx-0.5 flex items-center justify-center text-[10px] font-bold text-white transition-all duration-700"
        style={{
          width: `${Math.max(pct, 8)}%`,
          backgroundColor: color,
          minWidth: "48px",
          margin: "0 auto",
        }}
      >
        {count}
      </div>
      <p className="text-[9px] text-muted-foreground mt-1 truncate">{label}</p>
    </div>
  );
}

// ─── Mini Horizontal Bar ────────────────────────────────────────

function MiniBar({ percentage, color }: { percentage: number; color: string }) {
  const clamped = Math.min(Math.max(percentage, 0), 100);
  return (
    <div className="h-2 w-full rounded-full bg-muted/50 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-700 ease-out"
        style={{ width: `${clamped}%`, backgroundColor: color }}
      />
    </div>
  );
}

// ─── Connection Type Row ────────────────────────────────────────

function ConnectionTypeRow({ type, count, maxCount }: { type: string; count: number; maxCount: number }) {
  const color = TYPE_COLORS[type] || "#78716C";
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
  const icon =
    TYPE_ICONS[type] === "wifi" ? (
      <Wifi className="h-3 w-3 shrink-0" style={{ color }} />
    ) : (
      <span
        className="inline-block h-3 w-3 rounded-full shrink-0"
        style={{ backgroundColor: color }}
      />
    );

  return (
    <div className="flex items-center gap-2 py-1.5">
      {icon}
      <span className="text-[11px] font-medium text-foreground w-20 shrink-0 truncate">
        {type.replace(/_/g, " ")}
      </span>
      <div className="flex-1 min-w-0">
        <MiniBar percentage={pct} color={color} />
      </div>
      <span className="text-[11px] font-bold text-foreground tabular-nums w-6 text-right shrink-0">
        {count}
      </span>
    </div>
  );
}

// ─── Loading Skeleton ───────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-12 rounded-lg" />
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-2">
            <Skeleton className="h-7 flex-1 rounded" />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="h-3 w-3 rounded-full" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-2 flex-1 rounded-full" />
            <Skeleton className="h-4 w-6" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Subscriber Retention Widget ────────────────────────────────

export function RetentionChurnWidget() {
  const [data, setData] = useState<RetentionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const setCurrentPage = useAppStore((s) => s.setCurrentPage);

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    else setIsRefetching(true);
    try {
      const res = await fetch("/api/dashboard/retention", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch retention data");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("RetentionChurnWidget fetch error:", err);
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

  const handleSubscriberClick = useCallback(() => {
    setCurrentPage("Subscribers");
  }, [setCurrentPage]);

  const m = data?.metrics;
  const churnDelta = m ? m.churnedThisMonth - m.churnedLastMonth : 0;
  const maxChurnTypeCount = data?.churnByType.length
    ? Math.max(...data.churnByType.map((c) => c.count), 1)
    : 1;

  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter hover:shadow-md hover:border-red-200 dark:hover:border-red-800/50 transition-all duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-red-100 dark:bg-red-950/40">
              <Shield className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
            Subscriber Retention
            {m && (
              <Badge
                variant="secondary"
                className={`text-[10px] px-1.5 py-0 h-5 font-bold tabular-nums ${retentionBadgeClass(m.retentionRate)}`}
              >
                {m.retentionRate}%
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => fetchData(false)}
            disabled={isRefetching}
            aria-label="Refresh retention data"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <LoadingSkeleton />
        ) : data && m ? (
          <div className="space-y-4">
            {/* ── Section 1: Key Metrics ── */}
            <div className="grid grid-cols-3 gap-3">
              {/* Retention Rate */}
              <div className="rounded-lg border border-border/60 p-3 flex flex-col items-center hover:bg-muted/40 transition-colors">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Retention Rate
                </p>
                <RetentionRing rate={m.retentionRate} />
              </div>

              {/* Churn Rate */}
              <div className="rounded-lg border border-border/60 p-3 hover:bg-muted/40 transition-colors">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Churn Rate
                </p>
                <div className="flex items-center justify-center gap-1 mt-1">
                  <span className="text-xl font-bold text-red-600 dark:text-red-400 tabular-nums">
                    {m.churnRate}%
                  </span>
                </div>
                <div className="flex items-center justify-center gap-1 mt-1">
                  {churnDelta > 0 ? (
                    <ArrowDownRight className="h-3 w-3 text-red-500" />
                  ) : churnDelta < 0 ? (
                    <TrendingDown className="h-3 w-3 text-emerald-500 rotate-180" />
                  ) : null}
                  <span
                    className={`text-[10px] font-medium ${
                      churnDelta > 0
                        ? "text-red-600 dark:text-red-400"
                        : churnDelta < 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-muted-foreground"
                    }`}
                  >
                    {churnDelta > 0 ? "+" : ""}
                    {churnDelta} vs last mo.
                  </span>
                </div>
              </div>

              {/* Revenue at Risk */}
              <div className="rounded-lg border border-border/60 p-3 hover:bg-muted/40 transition-colors">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <AlertTriangle className="h-3 w-3 text-red-500" />
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Revenue at Risk
                  </p>
                </div>
                <p className="text-xl font-bold text-red-600 dark:text-red-400 tabular-nums text-center">
                  {formatINR(m.revenueAtRisk)}
                </p>
                <p className="text-[10px] text-muted-foreground text-center mt-1">
                  /month
                </p>
              </div>
            </div>

            {/* ── Section 2: Subscriber Flow ── */}
            <div className="rounded-lg border border-border/40 bg-muted/20 dark:bg-muted/10 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Subscriber Flow
                </p>
                <span
                  className={`text-[10px] font-bold tabular-nums ${
                    m.growthRate >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {m.growthRate >= 0 ? "+" : ""}
                  {m.growthRate}% growth
                </span>
              </div>
              <div className="flex items-end gap-2">
                <FlowSegment label="New" count={m.newThisMonth} color="#10B981" total={m.total || 1} />
                <FlowSegment label="Active" count={m.active} color="#0D9488" total={m.total || 1} />
                <FlowSegment label="At Risk" count={data.atRiskSubscribers.length} color="#F59E0B" total={m.total || 1} />
                <FlowSegment label="Churned" count={m.churnedThisMonth} color="#DC2626" total={m.total || 1} />
              </div>
            </div>

            {/* ── Section 3: At-Risk Subscribers ── */}
            {data.atRiskSubscribers.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <UserMinus className="h-3.5 w-3.5 text-amber-500" />
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                      At-Risk Subscribers
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className="text-[9px] px-1.5 py-0 h-4 font-medium bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                  >
                    Top 5
                  </Badge>
                </div>
                <div className="rounded-lg border border-border/40 overflow-hidden">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border/40">
                        <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">Name</th>
                        <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">Status</th>
                        <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Balance</th>
                        <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Days</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.atRiskSubscribers.map((sub) => (
                        <tr
                          key={sub.id}
                          className="border-b border-border/20 last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                          onClick={handleSubscriberClick}
                        >
                          <td className="py-1.5 px-2 font-medium text-foreground truncate max-w-[100px]">
                            {sub.name}
                          </td>
                          <td className="py-1.5 px-2">
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                sub.status === "SUSPENDED"
                                  ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                                  : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                              }`}
                            >
                              {sub.status === "SUSPENDED" ? "SUSP" : "NEG"}
                            </span>
                          </td>
                          <td className="py-1.5 px-2 text-right font-bold text-red-600 dark:text-red-400 tabular-nums">
                            {formatINR(sub.balance)}
                          </td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">
                            {sub.daysSincePayment >= 999 ? "—" : sub.daysSincePayment}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Section 4: Churn by Connection Type ── */}
            {data.churnByType.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Churn by Connection Type
                  </p>
                </div>
                <div className="divide-y divide-border/30">
                  {data.churnByType.map((ct) => (
                    <ConnectionTypeRow
                      key={ct.type}
                      type={ct.type}
                      count={ct.count}
                      maxCount={maxChurnTypeCount}
                    />
                  ))}
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
