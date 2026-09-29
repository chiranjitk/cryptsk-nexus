"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  AlertTriangle,
  CalendarClock,
  Activity,
  Wallet,
  BarChart3,
  Target,
  IndianRupee,
} from "lucide-react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import { formatINR, apiFetch } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────

interface ForecastData {
  currentMRR: number;
  currentARR: number;
  historicalMRR: { month: string; revenue: number }[];
  forecast: {
    days30: { mrr: number; optimistic: number; pessimistic: number };
    days60: { mrr: number; optimistic: number; pessimistic: number };
    days90: { mrr: number; optimistic: number; pessimistic: number };
  };
  growthMetrics: {
    newSubsLast3Months: number;
    avgNewPerMonth: number;
    churnedLast3Months: number;
    avgChurnPerMonth: number;
    netGrowthPerMonth: number;
    avgPlanPrice: number;
    growthRate: number;
    churnRate: number;
  };
  cashFlowProjection: { week: string; expectedInflow: number }[];
  planMRRBreakdown: { planCategory: string; mrr: number; subscribers: number }[];
  outstandingReceivables: number;
}

interface CashflowData {
  collectionPattern: { dayOfMonth: number; totalCollected: number; paymentCount: number }[];
  averageCollectionRate: number;
  outstandingReceivables: number;
  overdueInvoiceCount: number;
  expectedCashInflow30Days: number;
  paymentModeTrend: {
    month: string;
    modes: { mode: string; amount: number; count: number }[];
  }[];
  dailyCollectionPattern: { dayOfWeek: string; avgAmount: number }[];
}

// ── Color Constants ────────────────────────────────────────────────

const THEME = {
  red: "#DC2626",
  redLight: "rgba(220, 38, 38, 0.1)",
  teal: "#0D9488",
  tealLight: "rgba(13, 148, 136, 0.1)",
  amber: "#D97706",
  amberLight: "rgba(217, 119, 6, 0.1)",
  green: "#16A34A",
  greenLight: "rgba(22, 163, 74, 0.1)",
  rose: "#E11D48",
  orange: "#EA580C",
  emerald: "#059669",
};

const PLAN_COLORS: Record<string, string> = {
  FTTH: THEME.red,
  WIRELESS: THEME.amber,
  CABLE: THEME.teal,
  LEASED_LINE: THEME.green,
  HOTSPOT: THEME.rose,
  COMBO: THEME.orange,
  OTHER: "#64748B",
};

// ── Custom Recharts Tooltip ────────────────────────────────────────

function ChartTooltip({ active, payload, label, isCurrency = false }: {
  active?: boolean;
  payload?: { value: number; name: string; color: string; dataKey?: string }[];
  label?: string;
  isCurrency?: boolean;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card/95 border border-border/80 rounded-xl shadow-2xl px-4 py-3 text-xs backdrop-blur-md">
      <p className="font-semibold text-foreground mb-2 text-[11px]">{label}</p>
      {payload.map((item, i) => (
        <p key={i} className="text-muted-foreground flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
            {item.name}
          </span>
          <span className="font-semibold text-foreground tabular-nums">
            {isCurrency ? formatINR(item.value) : item.value.toLocaleString("en-IN")}
          </span>
        </p>
      ))}
    </div>
  );
}

// ── Format helpers ─────────────────────────────────────────────────

function formatCompact(amount: number): string {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
  return `₹${amount}`;
}

function formatPercent(val: number): string {
  return `${val >= 0 ? "+" : ""}${val.toFixed(1)}%`;
}

// ── Component ──────────────────────────────────────────────────────

export default function RevenueForecastPage() {
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [cashflow, setCashflow] = useState<CashflowData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);

  // Scenario analysis inputs
  const [churnIncrease, setChurnIncrease] = useState(0);
  const [newSubsPerMonth, setNewSubsPerMonth] = useState(0);

  const fetchData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setIsRefetching(true);
    try {
      const [fRes, cRes] = await Promise.all([
        fetch("/api/revenue/forecast", { credentials: "include" }),
        fetch("/api/revenue/cashflow", { credentials: "include" }),
      ]);
      if (!fRes.ok || !cRes.ok) throw new Error("API error");
      const fData = await fRes.json();
      const cData = await cRes.json();
      setForecast(fData);
      setCashflow(cData);
    } catch (err) {
      console.error("Failed to load forecast:", err);
    } finally {
      setIsLoading(false);
      setIsRefetching(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Build MRR chart data: 6 months historical + 3 months forecast ──
  const mrrChartData = forecast ? [
    // Historical data
    ...forecast.historicalMRR.map((item) => ({
      month: item.month,
      revenue: item.revenue,
      optimistic: undefined as number | undefined,
      pessimistic: undefined as number | undefined,
      type: "actual" as const,
    })),
    // Forecast data (month 7 = +30d, month 8 = +60d, month 9 = +90d)
    { month: "+30d", revenue: forecast.forecast.days30.mrr, optimistic: forecast.forecast.days30.optimistic, pessimistic: forecast.forecast.days30.pessimistic, type: "forecast" as const },
    { month: "+60d", revenue: forecast.forecast.days60.mrr, optimistic: forecast.forecast.days60.optimistic, pessimistic: forecast.forecast.days60.pessimistic, type: "forecast" as const },
    { month: "+90d", revenue: forecast.forecast.days90.mrr, optimistic: forecast.forecast.days90.optimistic, pessimistic: forecast.forecast.days90.pessimistic, type: "forecast" as const },
  ] : [];

  // ── Build confidence band data ──
  const confidenceBandData = forecast ? [
    ...forecast.historicalMRR.map((item) => ({
      month: item.month,
      optimistic: item.revenue,
      pessimistic: item.revenue,
    })),
    { month: "+30d", optimistic: forecast.forecast.days30.optimistic, pessimistic: forecast.forecast.days30.pessimistic },
    { month: "+60d", optimistic: forecast.forecast.days60.optimistic, pessimistic: forecast.forecast.days60.pessimistic },
    { month: "+90d", optimistic: forecast.forecast.days90.optimistic, pessimistic: forecast.forecast.days90.pessimistic },
  ] : [];

  // ── Scenario calculations ──
  const scenarioResult = forecast ? (() => {
    const adjustedChurn = forecast.growthMetrics.avgChurnPerMonth * (1 + churnIncrease / 100);
    const adjustedNew = forecast.growthMetrics.avgNewPerMonth + newSubsPerMonth;
    const netGrowth = adjustedNew - adjustedChurn;
    const projectedMRR90 = Math.max(0, forecast.currentMRR + netGrowth * forecast.growthMetrics.avgPlanPrice * 3);
    const optimistic = Math.round(projectedMRR90 * 1.2);
    const pessimistic = Math.round(projectedMRR90 * 0.8);
    return {
      projectedMRR90: Math.round(projectedMRR90),
      optimistic,
      pessimistic,
      netGrowthPerMonth: Math.round(netGrowth * 10) / 10,
      mrrChange: Math.round(projectedMRR90 - forecast.currentMRR),
      mrrChangePercent: forecast.currentMRR > 0
        ? Math.round(((projectedMRR90 - forecast.currentMRR) / forecast.currentMRR) * 10000) / 100
        : 0,
    };
  })() : null;

  // ── Heatmap intensity calculation ──
  function getHeatmapColor(value: number, max: number): string {
    if (max === 0) return "bg-gray-100 dark:bg-gray-900";
    const ratio = value / max;
    if (ratio > 0.8) return "bg-red-500 dark:bg-red-600 text-white";
    if (ratio > 0.6) return "bg-red-400 dark:bg-red-500 text-white";
    if (ratio > 0.4) return "bg-amber-400 dark:bg-amber-500 text-white";
    if (ratio > 0.2) return "bg-amber-300 dark:bg-amber-400 text-gray-900";
    if (ratio > 0) return "bg-amber-200 dark:bg-amber-600/50 text-gray-900 dark:text-gray-200";
    return "bg-gray-100 dark:bg-gray-900 text-gray-500";
  }

  // ── Loading State ──
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!forecast || !cashflow) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <AlertTriangle className="h-10 w-10 text-red-500" />
        <p className="text-lg font-semibold">Failed to load forecast data</p>
        <Button variant="outline" size="sm" onClick={() => fetchData(true)}>
          <RefreshCw className="h-4 w-4 mr-2" /> Retry
        </Button>
      </div>
    );
  }

  const projectedMRR90 = forecast.forecast.days90.mrr;
  const mrrGrowthPercent = forecast.currentMRR > 0
    ? Math.round(((projectedMRR90 - forecast.currentMRR) / forecast.currentMRR) * 10000) / 100
    : 0;

  const maxCollectionDay = Math.max(...cashflow.collectionPattern.map((d) => d.totalCollected), 1);

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <div className="p-2 rounded-lg bg-gradient-to-br from-red-500 to-orange-500 text-white">
              <TrendingUp className="h-5 w-5" />
            </div>
            Revenue Forecast & Cash Flow
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-powered revenue projections based on subscriber trends and payment patterns
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 btn-shine"
          onClick={() => fetchData(true)}
          disabled={isRefetching}
        >
          <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* ── 4 Summary Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Current MRR */}
        <Card className="border shadow-sm rounded-xl hover:shadow-md transition-shadow">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Current MRR
              </p>
              <div className="p-1.5 rounded-md bg-red-100 dark:bg-red-950/40">
                <IndianRupee className="h-4 w-4 text-red-600 dark:text-red-400" />
              </div>
            </div>
            <p className="text-2xl font-bold text-foreground tabular-nums">
              {formatINR(forecast.currentMRR)}
            </p>
            <div className="flex items-center gap-1 mt-1.5">
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400">
                <Activity className="h-3 w-3 mr-0.5" />
                Active
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Projected MRR (+90d) */}
        <Card className="border shadow-sm rounded-xl hover:shadow-md transition-shadow">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Projected MRR (90d)
              </p>
              <div className="p-1.5 rounded-md bg-teal-100 dark:bg-teal-950/40">
                <TrendingUp className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              </div>
            </div>
            <p className="text-2xl font-bold text-foreground tabular-nums">
              {formatINR(projectedMRR90)}
            </p>
            <div className={`flex items-center gap-1 mt-1.5 text-xs font-semibold ${mrrGrowthPercent >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {mrrGrowthPercent >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              {formatPercent(mrrGrowthPercent)}
            </div>
          </CardContent>
        </Card>

        {/* ARR */}
        <Card className="border shadow-sm rounded-xl hover:shadow-md transition-shadow">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Annual Run Rate
              </p>
              <div className="p-1.5 rounded-md bg-amber-100 dark:bg-amber-950/40">
                <CalendarClock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
            <p className="text-2xl font-bold text-foreground tabular-nums">
              {formatINR(forecast.currentARR)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              MRR × 12
            </p>
          </CardContent>
        </Card>

        {/* Outstanding Receivables */}
        <Card className="border shadow-sm rounded-xl hover:shadow-md transition-shadow">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Outstanding Receivables
              </p>
              <div className="p-1.5 rounded-md bg-rose-100 dark:bg-rose-950/40">
                <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
              </div>
            </div>
            <p className="text-2xl font-bold text-foreground tabular-nums">
              {formatINR(cashflow.outstandingReceivables)}
            </p>
            <div className="flex items-center gap-1 mt-1.5">
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400">
                {cashflow.overdueInvoiceCount} invoices
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── MRR Trend Chart with Confidence Bands ── */}
      <Card className="border shadow-sm rounded-xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-red-100 dark:bg-red-950/40">
              <BarChart3 className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
            MRR Trend & Forecast
          </CardTitle>
          <p className="text-xs text-muted-foreground">Historical revenue with 90-day projection and confidence intervals</p>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="h-[360px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={confidenceBandData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="optimisticGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={THEME.green} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={THEME.green} stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="pessimisticGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={THEME.red} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={THEME.red} stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCompact(v)} />
                <RechartsTooltip content={<ChartTooltip isCurrency />} />
                <Area
                  type="monotone"
                  dataKey="optimistic"
                  stroke={THEME.green}
                  fill="url(#optimisticGrad)"
                  strokeWidth={1}
                  name="Optimistic (+20%)"
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="pessimistic"
                  stroke={THEME.red}
                  fill="url(#pessimisticGrad)"
                  strokeWidth={1}
                  name="Pessimistic (-20%)"
                  dot={false}
                />
                <Line
                  type="monotone"
                  data={mrrChartData}
                  dataKey="revenue"
                  stroke={THEME.red}
                  strokeWidth={2.5}
                  dot={(props: Record<string, unknown>) => {
                    const { cx, cy, payload } = props as { cx?: number; cy?: number; payload?: { type?: string } };
                    if (payload?.type === "forecast") {
                      return (
                        <circle
                          key={`dot-${props.index}`}
                          cx={cx}
                          cy={cy}
                          r={4}
                          fill={THEME.red}
                          stroke="#fff"
                          strokeWidth={2}
                        />
                      );
                    }
                    return (
                      <circle
                        key={`dot-${props.index}`}
                        cx={cx}
                        cy={cy}
                        r={3}
                        fill={THEME.red}
                        stroke="#fff"
                        strokeWidth={1.5}
                      />
                    );
                  }}
                  name="Revenue"
                  activeDot={{ r: 5, fill: THEME.red, stroke: "#fff", strokeWidth: 2 }}
                />
                <Legend
                  verticalAlign="top"
                  height={36}
                  formatter={(value: string) => (
                    <span className="text-xs text-muted-foreground">{value}</span>
                  )}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* ── Cash Flow Projection + Revenue Breakdown Table ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cash Flow Projection Bar Chart */}
        <Card className="border shadow-sm rounded-xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-teal-100 dark:bg-teal-950/40">
                <Wallet className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              </div>
              Cash Flow Projection (90 days)
            </CardTitle>
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">Expected weekly inflows</p>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-teal-100 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400">
                {formatINR(cashflow.expectedCashInflow30Days)} expected (30d)
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={forecast.cashFlowProjection} margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatCompact(v)} />
                  <RechartsTooltip content={<ChartTooltip isCurrency />} />
                  <Bar
                    dataKey="expectedInflow"
                    name="Expected Inflow"
                    fill={THEME.teal}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Revenue Breakdown by Plan Category */}
        <Card className="border shadow-sm rounded-xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-amber-100 dark:bg-amber-950/40">
                <Target className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              MRR by Plan Category
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-auto max-h-[320px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Category</TableHead>
                    <TableHead className="text-xs text-right">Subscribers</TableHead>
                    <TableHead className="text-xs text-right">MRR</TableHead>
                    <TableHead className="text-xs text-right">% Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {forecast.planMRRBreakdown.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No plan data available
                      </TableCell>
                    </TableRow>
                  ) : (
                    forecast.planMRRBreakdown
                      .sort((a, b) => b.mrr - a.mrr)
                      .map((row) => {
                        const totalMRR = forecast.planMRRBreakdown.reduce((s, r) => s + r.mrr, 0) || 1;
                        const pct = Math.round((row.mrr / totalMRR) * 10000) / 100;
                        const color = PLAN_COLORS[row.planCategory] || THEME.red;
                        return (
                          <TableRow key={row.planCategory} className="hover:bg-muted/40">
                            <TableCell className="text-xs font-medium">
                              <span className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                {row.planCategory}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-right tabular-nums">{row.subscribers}</TableCell>
                            <TableCell className="text-xs text-right font-semibold tabular-nums">{formatINR(row.mrr)}</TableCell>
                            <TableCell className="text-xs text-right tabular-nums">{pct}%</TableCell>
                          </TableRow>
                        );
                      })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Scenario Analysis ── */}
      <Card className="border shadow-sm rounded-xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-gradient-to-br from-red-500 to-amber-500 text-white">
              <Target className="h-4 w-4" />
            </div>
            Scenario Analysis
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Model &quot;what-if&quot; scenarios to see how changes impact projected MRR
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Input Section */}
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-red-500" />
                  If churn increases by
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={500}
                    value={churnIncrease}
                    onChange={(e) => setChurnIncrease(Number(e.target.value) || 0)}
                    className="w-24 h-9 text-sm"
                    placeholder="0"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Current avg churn: {forecast.growthMetrics.avgChurnPerMonth}/month ({forecast.growthMetrics.churnRate}%)
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                  If new subscriptions reach
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={500}
                    value={newSubsPerMonth}
                    onChange={(e) => setNewSubsPerMonth(Number(e.target.value) || 0)}
                    className="w-24 h-9 text-sm"
                    placeholder="0"
                  />
                  <span className="text-sm text-muted-foreground">/month</span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Current avg new subs: {forecast.growthMetrics.avgNewPerMonth}/month
                </p>
              </div>
            </div>

            {/* Result Section */}
            {scenarioResult && (
              <div className="space-y-3">
                <div className="rounded-lg border border-border/60 bg-gradient-to-br from-red-50/50 to-amber-50/50 dark:from-red-950/10 dark:to-amber-950/10 p-4">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
                    Projected MRR (90 days)
                  </p>
                  <p className="text-3xl font-bold text-foreground tabular-nums">
                    {formatINR(scenarioResult.projectedMRR90)}
                  </p>
                  <div className={`flex items-center gap-1 mt-1 text-sm font-semibold ${scenarioResult.mrrChangePercent >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {scenarioResult.mrrChangePercent >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                    {formatINR(Math.abs(scenarioResult.mrrChange))} ({formatPercent(scenarioResult.mrrChangePercent)})
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border/60 p-3">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Optimistic</p>
                    <p className="text-base font-bold text-emerald-600 tabular-nums mt-1">{formatINR(scenarioResult.optimistic)}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 p-3">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Pessimistic</p>
                    <p className="text-base font-bold text-red-600 tabular-nums mt-1">{formatINR(scenarioResult.pessimistic)}</p>
                  </div>
                </div>

                <div className="rounded-lg border border-border/60 p-3">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Net Growth / Month
                  </p>
                  <p className={`text-base font-bold tabular-nums mt-1 ${scenarioResult.netGrowthPerMonth >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {scenarioResult.netGrowthPerMonth >= 0 ? "+" : ""}{scenarioResult.netGrowthPerMonth} subs
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Collection Pattern Heatmap ── */}
      <Card className="border shadow-sm rounded-xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-amber-100 dark:bg-amber-950/40">
              <Activity className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            Collection Pattern by Day of Month
          </CardTitle>
          <div className="flex items-center gap-3">
            <p className="text-xs text-muted-foreground">Payment collection heatmap based on last 3 months</p>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400">
              {cashflow.averageCollectionRate}% avg collection rate
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-7 sm:grid-cols-10 md:grid-cols-14 lg:grid-cols-16 gap-1">
            {cashflow.collectionPattern.map((day) => (
              <div
                key={day.dayOfMonth}
                className={`rounded-md p-1.5 sm:p-2 text-center transition-all hover:scale-105 cursor-default ${getHeatmapColor(day.totalCollected, maxCollectionDay)}`}
                title={`Day ${day.dayOfMonth}: ${formatINR(day.totalCollected)} from ${day.paymentCount} payments`}
              >
                <p className="text-[9px] sm:text-[10px] font-semibold">{day.dayOfMonth}</p>
                <p className="text-[8px] sm:text-[9px] opacity-80 hidden sm:block">{formatCompact(day.totalCollected)}</p>
              </div>
            ))}
          </div>
          {/* Legend */}
          <div className="flex items-center gap-3 mt-4">
            <span className="text-[10px] text-muted-foreground">Low</span>
            <div className="flex gap-0.5">
              <div className="w-4 h-3 rounded-sm bg-amber-200 dark:bg-amber-600/50" />
              <div className="w-4 h-3 rounded-sm bg-amber-300 dark:bg-amber-400" />
              <div className="w-4 h-3 rounded-sm bg-amber-400 dark:bg-amber-500" />
              <div className="w-4 h-3 rounded-sm bg-red-400 dark:bg-red-500" />
              <div className="w-4 h-3 rounded-sm bg-red-500 dark:bg-red-600" />
            </div>
            <span className="text-[10px] text-muted-foreground">High</span>
          </div>
        </CardContent>
      </Card>

      {/* ── Payment Mode Trend + Day of Week Pattern ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Mode Trend */}
        <Card className="border shadow-sm rounded-xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-emerald-100 dark:bg-emerald-950/40">
                <DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              Payment Mode Trend
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cashflow.paymentModeTrend} margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatCompact(v)} />
                  <RechartsTooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="bg-card/95 border border-border/80 rounded-xl shadow-2xl px-4 py-3 text-xs backdrop-blur-md">
                          <p className="font-semibold text-foreground mb-2">{label}</p>
                          {payload.map((item, i) => {
                            const modeData = (item.payload as Record<string, unknown>)?.modes as Array<{ mode: string; amount: number; count: number }> | undefined;
                            if (!modeData) return null;
                            return (
                              <div key={i}>
                                {modeData.map((m, j) => (
                                  <p key={j} className="text-muted-foreground py-0.5 flex items-center justify-between gap-4">
                                    <span>{m.mode}</span>
                                    <span className="font-semibold text-foreground tabular-nums">{formatINR(m.amount)}</span>
                                  </p>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="modes" name="Payment Modes" fill={THEME.emerald} radius={[4, 4, 0, 0]}>
                    {cashflow.paymentModeTrend.map((entry, index) => (
                      <rect key={`cell-${index}`} fill={index === cashflow.paymentModeTrend.length - 1 ? THEME.red : THEME.teal} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {cashflow.paymentModeTrend.length > 0 && cashflow.paymentModeTrend[cashflow.paymentModeTrend.length - 1].modes.map((m) => (
                <Badge key={m.mode} variant="secondary" className="text-[10px] px-2 py-0.5">
                  {m.mode}: {formatCompact(m.amount)}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Day of Week Collection Pattern */}
        <Card className="border shadow-sm rounded-xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-orange-100 dark:bg-orange-950/40">
                <BarChart3 className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </div>
              Collection by Day of Week
            </CardTitle>
            <p className="text-xs text-muted-foreground">Average daily collection pattern</p>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cashflow.dailyCollectionPattern} margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                  <XAxis dataKey="dayOfWeek" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatCompact(v)} />
                  <RechartsTooltip content={<ChartTooltip isCurrency />} />
                  <Bar
                    dataKey="avgAmount"
                    name="Avg Collection"
                    fill={THEME.orange}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
