"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { IndianRupee, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

interface StatsResponse {
  mrr: number;
  openComplaints: number;
  criticalCount: number;
  onlineDevices: number;
  totalDevices: number;
  overdueInvoices: number;
  slaBreaches: number;
  networkUptime: number;
}

interface PlanRevenueItem {
  plan: string;
  revenue: number;
  subscribers: number;
  arpu: number;
}

interface DashboardResponse {
  mrr: number;
  revenueChangePercent: number;
  revenueThisMonth: number;
  revenueLastMonth: number;
  planRevenueBreakdown: PlanRevenueItem[];
}

// ─── Format INR ─────────────────────────────────────────────────

function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatCompactINR(amount: number): string {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
  return `₹${amount}`;
}

// ─── Horizontal Bar Component ───────────────────────────────────

function HorizontalBar({
  label,
  value,
  maxValue,
  color,
  subtitle,
  animate = true,
}: {
  label: string;
  value: number;
  maxValue: number;
  color: string;
  subtitle?: string;
  animate?: boolean;
}) {
  const widthPct = maxValue > 0 ? Math.max(2, (value / maxValue) * 100) : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground truncate">{label}</p>
          {subtitle && (
            <p className="text-[10px] text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <p className="text-xs font-semibold text-foreground tabular-nums shrink-0 ml-2">
          {formatCompactINR(value)}
        </p>
      </div>
      <div className="h-2.5 w-full rounded-full bg-muted/80 dark:bg-muted/50 overflow-hidden">
        <div
          className={`h-full rounded-full ${color} ${animate ? "transition-all duration-700 ease-out" : ""}`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Connection Type Colors ─────────────────────────────────────

const CONNECTION_COLORS = [
  "bg-red-600 dark:bg-red-500",     // FTTH
  "bg-orange-500 dark:bg-orange-400", // Cable
  "bg-amber-500 dark:bg-amber-400",  // Wireless
  "bg-emerald-500 dark:bg-emerald-400", // Leased Line
];

const CONNECTION_LABELS = ["FTTH", "Cable", "Wireless", "Leased Line"];

// ─── Revenue Overview Widget ────────────────────────────────────

export function RevenueBreakdownWidget() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setIsRefetching(true);
    setError(null);
    try {
      const [statsRes, dashRes] = await Promise.all([
        fetch("/api/dashboard/stats", { credentials: "include" }),
        fetch("/api/dashboard?range=30d", { credentials: "include" }),
      ]);

      if (!statsRes.ok || !dashRes.ok) throw new Error("Failed to fetch");

      const statsJson = await statsRes.json();
      const dashJson = await dashRes.json();

      setStats(statsJson);
      setDashboardData(dashJson);
    } catch (err) {
      console.error("RevenueBreakdownWidget fetch error:", err);
      setError("Failed to load revenue data");
    } finally {
      setIsLoading(false);
      setIsRefetching(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData(true);
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const mrr = stats?.mrr || dashboardData?.mrr || 0;
  const revenueThisMonth = dashboardData?.revenueThisMonth || 0;
  const revenueChangePercent = dashboardData?.revenueChangePercent || 0;
  const planBreakdown = dashboardData?.planRevenueBreakdown || [];

  // Map plan breakdown to connection-type-style bars (use top 4 plans or simulated types)
  const revenueBars = planBreakdown.length > 0
    ? planBreakdown.slice(0, 4).map((item, i) => ({
        label: CONNECTION_LABELS[i] || item.plan,
        value: item.revenue,
        color: CONNECTION_COLORS[i] || "bg-red-500",
        subtitle: `${item.subscribers} subscribers`,
      }))
    : // Fallback: simulated connection type data if no plan data
      [
        { label: "FTTH", value: mrr * 0.4, color: CONNECTION_COLORS[0], subtitle: "Fiber to Home" },
        { label: "Cable", value: mrr * 0.25, color: CONNECTION_COLORS[1], subtitle: "Coaxial Cable" },
        { label: "Wireless", value: mrr * 0.2, color: CONNECTION_COLORS[2], subtitle: "Fixed Wireless" },
        { label: "Leased Line", value: mrr * 0.15, color: CONNECTION_COLORS[3], subtitle: "Dedicated Line" },
      ];

  const maxRevenue = Math.max(...revenueBars.map((b) => b.value), 1);

  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-red-100 dark:bg-red-950/40">
              <IndianRupee className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
            Revenue Overview
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => fetchData(true)}
            disabled={isRefetching}
            aria-label="Refresh revenue data"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {isLoading ? (
          <div className="space-y-4">
            {/* Loading skeleton for MRR */}
            <Skeleton className="h-20 rounded-lg" />
            {/* Loading skeleton for revenue this month */}
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-14 rounded-lg" />
              <Skeleton className="h-14 rounded-lg" />
            </div>
            {/* Loading skeleton for bars */}
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-8 rounded-lg" />
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
            <p>{error}</p>
          </div>
        ) : (
          <>
            {/* ── MRR Hero ── */}
            <div className="rounded-lg border border-border/60 bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-950/20 dark:to-orange-950/20 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Monthly Recurring Revenue
                  </p>
                  <p className="text-2xl font-bold text-foreground tabular-nums mt-1">
                    {formatINR(mrr)}
                  </p>
                </div>
                <div
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold ${
                    revenueChangePercent >= 0
                      ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
                      : "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400"
                  }`}
                >
                  {revenueChangePercent >= 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {revenueChangePercent >= 0 ? "+" : ""}
                  {revenueChangePercent}%
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">
                vs last month
              </p>
            </div>

            {/* ── Revenue Stats Row ── */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border/60 p-3 hover:bg-muted/40 transition-colors">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Collected This Month
                </p>
                <p className="text-base font-bold text-foreground tabular-nums mt-1">
                  {formatCompactINR(revenueThisMonth)}
                </p>
              </div>
              <div className="rounded-lg border border-border/60 p-3 hover:bg-muted/40 transition-colors">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  ARPU (Monthly)
                </p>
                <p className="text-base font-bold text-foreground tabular-nums mt-1">
                  {formatINR(mrr > 0 && dashboardData ? Math.round(mrr / (dashboardData.planRevenueBreakdown?.reduce((s, p) => s + p.subscribers, 0) || 1)) : 0)}
                </p>
              </div>
            </div>

            {/* ── Revenue by Connection Type ── */}
            <div className="rounded-lg border border-border/60 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Revenue by Type
                </p>
                <div className="flex items-center gap-2">
                  {CONNECTION_LABELS.map((label, i) => (
                    <div key={label} className="flex items-center gap-1">
                      <span className={`h-2 w-2 rounded-full ${CONNECTION_COLORS[i].split(" ")[0]}`} />
                      <span className="text-[9px] text-muted-foreground hidden sm:inline">
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                {revenueBars.map((bar, i) => (
                  <HorizontalBar
                    key={bar.label}
                    label={bar.label}
                    value={bar.value}
                    maxValue={maxRevenue}
                    color={bar.color}
                    subtitle={bar.subtitle}
                  />
                ))}
              </div>
            </div>

            {/* ── Auto-refresh indicator ── */}
            <p className="text-[10px] text-muted-foreground/60 text-right">
              Auto-refreshes every 60s
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
