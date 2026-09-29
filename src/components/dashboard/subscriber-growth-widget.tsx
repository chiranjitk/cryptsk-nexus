"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

interface GrowthDataPoint {
  month: string;
  additions: number;
}

interface DashboardResponse {
  subscriberGrowthData: GrowthDataPoint[];
  newInRange: number;
  churnedInRange: number;
  churnRate: number;
  range: string;
  rangeDays: number;
}

type TimeRange = "7d" | "30d" | "90d";

// ─── SVG Area Chart Component ──────────────────────────────────

function AreaChart({
  data,
  width,
  height,
  hoveredIndex,
  onHover,
  onLeave,
}: {
  data: GrowthDataPoint[];
  width: number;
  height: number;
  hoveredIndex: number | null;
  onHover: (index: number | null) => void;
  onLeave: () => void;
}) {
  if (data.length === 0) return null;

  const padding = { top: 12, right: 16, bottom: 28, left: 36 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxVal = Math.max(...data.map((d) => d.additions), 1);
  // Round up max to a nice number
  const niceMax =
    maxVal <= 5
      ? 5
      : maxVal <= 10
        ? 10
        : Math.ceil(maxVal / 5) * 5;

  const stepX = data.length > 1 ? chartW / (data.length - 1) : chartW;

  // Build points for the line
  const points = data.map((d, i) => ({
    x: padding.left + i * stepX,
    y: padding.top + chartH - (d.additions / niceMax) * chartH,
    value: d.additions,
    label: d.month,
  }));

  // Build the line path
  const linePath =
    points.length > 1
      ? points
          .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
          .join(" ")
      : "";

  // Build the area fill path
  const areaPath =
    points.length > 1
      ? `${linePath} L ${points[points.length - 1].x} ${padding.top + chartH} L ${points[0].x} ${padding.top + chartH} Z`
      : "";

  // Y-axis gridlines and labels
  const yTicks = 4;
  const yGridLines = Array.from({ length: yTicks + 1 }, (_, i) => {
    const val = Math.round((niceMax / yTicks) * i);
    const y = padding.top + chartH - (val / niceMax) * chartH;
    return { val, y };
  });

  // X-axis labels — show a subset to avoid overlap
  const maxLabels = Math.min(data.length, 8);
  const labelStep = Math.max(1, Math.floor(data.length / maxLabels));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-full"
      preserveAspectRatio="xMidYMid meet"
      onMouseLeave={onLeave}
    >
      <defs>
        <linearGradient id="growthGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#DC2626" stopOpacity={0.35} />
          <stop offset="70%" stopColor="#DC2626" stopOpacity={0.08} />
          <stop offset="100%" stopColor="#DC2626" stopOpacity={0} />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Y-axis gridlines */}
      {yGridLines.map((tick) => (
        <g key={tick.val}>
          <line
            x1={padding.left}
            y1={tick.y}
            x2={padding.left + chartW}
            y2={tick.y}
            className="stroke-muted/50 dark:stroke-muted/30"
            strokeDasharray="3 3"
            strokeWidth={0.5}
          />
          <text
            x={padding.left - 6}
            y={tick.y + 3}
            textAnchor="end"
            className="fill-muted-foreground text-[9px]"
            fontSize={9}
          >
            {tick.val}
          </text>
        </g>
      ))}

      {/* X-axis labels */}
      {data.map((d, i) => {
        if (i % labelStep !== 0 && i !== data.length - 1) return null;
        const x = padding.left + i * stepX;
        return (
          <text
            key={i}
            x={x}
            y={height - 6}
            textAnchor="middle"
            className="fill-muted-foreground text-[9px]"
            fontSize={9}
          >
            {d.month}
          </text>
        );
      })}

      {/* Area fill */}
      <path
        d={areaPath}
        fill="url(#growthGradient)"
        className="transition-all duration-500 ease-out"
      />

      {/* Line */}
      <path
        d={linePath}
        fill="none"
        stroke="#DC2626"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="transition-all duration-500 ease-out"
        filter="url(#glow)"
      />

      {/* Invisible hover areas */}
      {data.map((_, i) => {
        const x = padding.left + i * stepX;
        const barW = stepX;
        return (
          <rect
            key={i}
            x={x - barW / 2}
            y={padding.top}
            width={barW}
            height={chartH}
            fill="transparent"
            onMouseEnter={() => onHover(i)}
            className="cursor-crosshair"
          />
        );
      })}

      {/* Hover vertical line */}
      {hoveredIndex !== null && points[hoveredIndex] && (
        <line
          x1={points[hoveredIndex].x}
          y1={padding.top}
          x2={points[hoveredIndex].x}
          y2={padding.top + chartH}
          className="stroke-red-400 dark:stroke-red-500"
          strokeWidth={1}
          strokeDasharray="4 3"
          opacity={0.6}
        />
      )}

      {/* Data point circles */}
      {hoveredIndex !== null && points[hoveredIndex] && (
        <g className="transition-all duration-150 ease-out">
          {/* Outer ring */}
          <circle
            cx={points[hoveredIndex].x}
            cy={points[hoveredIndex].y}
            r={6}
            fill="#DC2626"
            opacity={0.2}
            className="animate-pulse"
          />
          {/* Inner dot */}
          <circle
            cx={points[hoveredIndex].x}
            cy={points[hoveredIndex].y}
            r={4}
            fill="#DC2626"
            stroke="white"
            strokeWidth={2}
            className="dark:stroke-background"
          />
        </g>
      )}

      {/* Hover tooltip */}
      {hoveredIndex !== null && points[hoveredIndex] && (
        <g>
          <rect
            x={Math.min(
              Math.max(points[hoveredIndex].x - 40, 4),
              width - 84
            )}
            y={points[hoveredIndex].y - 34}
            width={80}
            height={26}
            rx={6}
            className="fill-popover stroke-border"
            strokeWidth={1}
          />
          <text
            x={Math.min(
              Math.max(points[hoveredIndex].x - 40, 4),
              width - 84
            ) + 40}
            y={points[hoveredIndex].y - 18}
            textAnchor="middle"
            className="fill-foreground text-[10px] font-semibold"
            fontSize={10}
          >
            +{points[hoveredIndex].value} subs
          </text>
        </g>
      )}

      {/* Always show dots for first and last data points */}
      {points.length > 0 && (
        <>
          <circle
            cx={points[0].x}
            cy={points[0].y}
            r={3}
            fill="#DC2626"
            stroke="white"
            strokeWidth={1.5}
            className="dark:stroke-background"
          />
          <circle
            cx={points[points.length - 1].x}
            cy={points[points.length - 1].y}
            r={3}
            fill="#DC2626"
            stroke="white"
            strokeWidth={1.5}
            className="dark:stroke-background"
          />
        </>
      )}
    </svg>
  );
}

// ─── Subscriber Growth Widget ──────────────────────────────────

export function SubscriberGrowthWidget() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [selectedRange, setSelectedRange] = useState<TimeRange>("30d");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async (range: TimeRange, showSpinner = false) => {
    if (showSpinner) setIsRefetching(true);
    try {
      const res = await fetch(`/api/dashboard?range=${range}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("SubscriberGrowthWidget fetch error:", err);
    } finally {
      setIsLoading(false);
      setIsRefetching(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchData(selectedRange);
  }, [selectedRange, fetchData]);

  const growthData = data?.subscriberGrowthData || [];

  // Compute growth rate: compare second-half total vs first-half total
  const growthRate = useMemo(() => {
    if (growthData.length < 2) return 0;
    const mid = Math.floor(growthData.length / 2);
    const firstHalf = growthData.slice(0, mid).reduce((s, d) => s + d.additions, 0);
    const secondHalf = growthData.slice(mid).reduce((s, d) => s + d.additions, 0);
    if (firstHalf === 0) return secondHalf > 0 ? 100 : 0;
    return Math.round(((secondHalf - firstHalf) / firstHalf) * 100);
  }, [growthData]);

  // Average daily additions
  const avgDaily = useMemo(() => {
    if (growthData.length === 0) return 0;
    const total = growthData.reduce((s, d) => s + d.additions, 0);
    return Math.round(total / growthData.length);
  }, [growthData]);

  const rangeButtons: { key: TimeRange; label: string }[] = [
    { key: "7d", label: "7d" },
    { key: "30d", label: "30d" },
    { key: "90d", label: "90d" },
  ];

  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-red-100 dark:bg-red-950/40">
              <Users className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
            Subscriber Growth
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => fetchData(selectedRange, true)}
            disabled={isRefetching}
            aria-label="Refresh subscriber growth"
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
            {/* Loading skeleton for stats */}
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
            {/* Loading skeleton for chart */}
            <Skeleton className="h-[200px] w-full rounded-lg" />
          </div>
        ) : data ? (
          <>
            {/* ── Summary Stats ── */}
            <div className="grid grid-cols-3 gap-3">
              {/* Total New Subscribers */}
              <div className="rounded-lg border border-border/60 p-3 hover:bg-muted/40 transition-colors">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  New Subscribers
                </p>
                <p className="text-xl font-bold text-foreground tabular-nums mt-1">
                  {data.newInRange}
                </p>
              </div>

              {/* Avg Daily */}
              <div className="rounded-lg border border-border/60 p-3 hover:bg-muted/40 transition-colors">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Avg Daily
                </p>
                <p className="text-xl font-bold text-foreground tabular-nums mt-1">
                  {avgDaily}
                </p>
              </div>

              {/* Growth Rate */}
              <div className="rounded-lg border border-border/60 p-3 hover:bg-muted/40 transition-colors">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Growth Trend
                </p>
                <div className="flex items-center gap-1 mt-1">
                  {growthRate >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-emerald-500 shrink-0" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-500 shrink-0" />
                  )}
                  <span
                    className={`text-xl font-bold tabular-nums ${
                      growthRate >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {growthRate >= 0 ? "+" : ""}
                    {growthRate}%
                  </span>
                </div>
              </div>
            </div>

            {/* ── Churn indicator ── */}
            {data.churnedInRange > 0 && (
              <div className="flex items-center gap-2 rounded-md bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 px-3 py-2">
                <TrendingDown className="h-3.5 w-3.5 text-red-500 shrink-0" />
                <p className="text-[11px] text-red-700 dark:text-red-400 font-medium">
                  {data.churnedInRange} subscriber{data.churnedInRange !== 1 ? "s" : ""} churned in this period
                  <span className="ml-1.5 text-red-500 dark:text-red-500">
                    ({data.churnRate}% churn rate)
                  </span>
                </p>
              </div>
            )}

            {/* ── Time Range Selector ── */}
            <div className="flex items-center gap-1">
              {rangeButtons.map((btn) => (
                <Button
                  key={btn.key}
                  variant={selectedRange === btn.key ? "default" : "ghost"}
                  size="sm"
                  className={`h-7 px-3 text-xs rounded-md transition-all duration-200 ${
                    selectedRange === btn.key
                      ? "bg-red-600 hover:bg-red-700 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                  onClick={() => setSelectedRange(btn.key)}
                >
                  {btn.label}
                </Button>
              ))}
              <span className="text-[10px] text-muted-foreground ml-auto">
                {data.rangeDays}-day range
              </span>
            </div>

            {/* ── Chart ── */}
            <div
              ref={containerRef}
              className="rounded-lg border border-border/40 bg-muted/20 dark:bg-muted/10 p-1"
            >
              {growthData.length > 0 ? (
                <div className="h-[200px] w-full">
                  <AreaChart
                    data={growthData}
                    width={500}
                    height={200}
                    hoveredIndex={hoveredIndex}
                    onHover={setHoveredIndex}
                    onLeave={() => setHoveredIndex(null)}
                  />
                </div>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
                  No subscriber growth data available
                </div>
              )}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
