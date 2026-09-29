"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, ArrowDown, ArrowUp } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

// ─── Types ──────────────────────────────────────────────────────

interface BandwidthDataPoint {
  hour: string;
  downloadBps: number;
  uploadBps: number;
}

interface BandwidthTrendsWidgetProps {
  bandwidthUsageData: BandwidthDataPoint[];
  peakBandwidth: number;
  currentBandwidth: number;
}

// ─── Custom Tooltip ─────────────────────────────────────────────

function BandwidthTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; name: string; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card/90 border border-border/80 rounded-xl shadow-2xl px-4 py-3 text-xs backdrop-blur-md">
      <p className="font-semibold text-foreground mb-2 text-[11px]">{label}</p>
      {payload.map((item, i) => (
        <p key={i} className="text-muted-foreground flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
            {item.name}
          </span>
          <span className="font-semibold text-foreground tabular-nums">
            {(item.value / 1000000).toFixed(1)} Mbps
          </span>
        </p>
      ))}
    </div>
  );
}

// ─── Bandwidth Trends Widget ────────────────────────────────────

export function BandwidthTrendsWidget({
  bandwidthUsageData,
  peakBandwidth,
  currentBandwidth,
}: BandwidthTrendsWidgetProps) {
  // Calculate average bandwidth
  const avgDownload =
    bandwidthUsageData.length > 0
      ? bandwidthUsageData.reduce((sum, d) => sum + d.downloadBps, 0) / bandwidthUsageData.length
      : 0;
  const avgUpload =
    bandwidthUsageData.length > 0
      ? bandwidthUsageData.reduce((sum, d) => sum + d.uploadBps, 0) / bandwidthUsageData.length
      : 0;

  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter hover:shadow-md hover:border-teal-200 dark:hover:border-teal-800/50 transition-all duration-200">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-teal-100 dark:bg-teal-950/40">
              <Activity className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            </div>
            Bandwidth Trends
            <span className="text-[10px] font-medium text-muted-foreground">
              Last 24h
            </span>
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="rounded-lg bg-muted/50 dark:bg-muted/30 px-3 py-2 text-center">
            <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">Peak</p>
            <p className="text-sm font-bold text-red-600 dark:text-red-400 tabular-nums">
              {(peakBandwidth / 1000000).toFixed(1)}
            </p>
            <p className="text-[9px] text-muted-foreground">Mbps</p>
          </div>
          <div className="rounded-lg bg-muted/50 dark:bg-muted/30 px-3 py-2 text-center">
            <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">Current</p>
            <p className="text-sm font-bold text-teal-600 dark:text-teal-400 tabular-nums">
              {(currentBandwidth / 1000000).toFixed(1)}
            </p>
            <p className="text-[9px] text-muted-foreground">Mbps</p>
          </div>
          <div className="rounded-lg bg-muted/50 dark:bg-muted/30 px-3 py-2 text-center">
            <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">Average</p>
            <p className="text-sm font-bold text-amber-600 dark:text-amber-400 tabular-nums">
              {((avgDownload + avgUpload) / 2 / 1000000).toFixed(1)}
            </p>
            <p className="text-[9px] text-muted-foreground">Mbps</p>
          </div>
        </div>

        {/* Chart */}
        {bandwidthUsageData.length > 0 ? (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={bandwidthUsageData}>
                <defs>
                  <linearGradient id="downloadGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0D9488" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#0D9488" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="uploadGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#DC2626" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#DC2626" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis
                  dataKey="hour"
                  tick={{ fill: "#94A3B8", fontSize: 10 }}
                  interval="preserveStartEnd"
                  tickFormatter={(v: string) => {
                    // Show every 3rd or 4th label to avoid crowding
                    return v;
                  }}
                />
                <YAxis
                  tick={{ fill: "#94A3B8", fontSize: 10 }}
                  tickFormatter={(v: number) => `${(v / 1000000).toFixed(0)}`}
                  width={35}
                />
                <RechartsTooltip content={<BandwidthTooltip />} />
                <Legend
                  iconType="plainline"
                  iconSize={12}
                  wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
                  formatter={(value: string) => (
                    <span className="text-xs text-muted-foreground">{value}</span>
                  )}
                />
                <Area
                  type="monotone"
                  dataKey="downloadBps"
                  name="Download"
                  stroke="#0D9488"
                  strokeWidth={2}
                  fill="url(#downloadGradient)"
                  dot={false}
                  activeDot={{ r: 4, fill: "#0D9488", strokeWidth: 2, stroke: "#fff" }}
                />
                <Area
                  type="monotone"
                  dataKey="uploadBps"
                  name="Upload"
                  stroke="#DC2626"
                  strokeWidth={2}
                  fill="url(#uploadGradient)"
                  dot={false}
                  activeDot={{ r: 4, fill: "#DC2626", strokeWidth: 2, stroke: "#fff" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex items-center justify-center h-48 text-xs text-muted-foreground">
            No bandwidth data available
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Loading Skeleton ───────────────────────────────────────────

export function BandwidthTrendsWidgetSkeleton() {
  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-7 rounded-md" />
          <Skeleton className="h-5 w-32" />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-3 gap-3 mb-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-48 w-full rounded-lg" />
      </CardContent>
    </Card>
  );
}
