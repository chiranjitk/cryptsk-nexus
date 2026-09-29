"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/utils";
import { Users, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
} from "recharts";

interface GrowthDataPoint {
  month: string;
  newSubs: number;
  churned: number;
  netGrowth: number;
  active: number;
}

export function SubscriberGrowthWidget() {
  const { data, isLoading, isFetching, refetch } = useQuery<any>({
    queryKey: ["subscriber-growth-chart"],
    queryFn: () => apiFetch("/api/reports?tab=subscriber"),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // API returns growthTrend: [{ month, active, newSubs, churned }] or legacy arrays
  let chartData: GrowthDataPoint[] = [];
  if (data) {
    if (Array.isArray(data.growthTrend)) {
      chartData = data.growthTrend.map((g: any) => ({
        month: g.month || "",
        newSubs: g.newSubs || 0,
        churned: g.churned || 0,
        netGrowth: (g.newSubs || 0) - (g.churned || 0),
        active: g.active || 0,
      }));
    } else if (Array.isArray(data.months)) {
      chartData = data.months.map((month: string, i: number) => ({
        month,
        newSubs: (data.newSubs as number[])[i] || 0,
        churned: (data.churned as number[])[i] || 0,
        netGrowth: ((data.newSubs as number[])[i] || 0) - ((data.churned as number[])[i] || 0),
        active: (data.active as number[])[i] || 0,
      }));
    }
  }

  const totalNew = chartData.reduce((s, d) => s + d.newSubs, 0);
  const totalChurned = chartData.reduce((s, d) => s + d.churned, 0);
  const netGrowth = totalNew - totalChurned;

  return (
    <Card className="border shadow-sm animate-card-enter rounded-xl" style={{ animationDelay: "570ms" }}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-500" />
            Subscriber Growth
          </CardTitle>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                New
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                Churned
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                Net
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {/* Summary badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-medium">
            +{totalNew} new
          </span>
          <span className="text-xs px-2 py-1 rounded-md bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 font-medium">
            -{totalChurned} churned
          </span>
          <span className={`text-xs px-2 py-1 rounded-md font-medium flex items-center gap-1 ${
            netGrowth >= 0
              ? "bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-green-400"
              : "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400"
          }`}>
            {netGrowth >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {netGrowth >= 0 ? "+" : ""}{netGrowth} net
          </span>
        </div>

        {/* Chart */}
        {isLoading ? (
          <div className="h-[200px]">
            <Skeleton className="skeleton-wave h-full w-full rounded-lg" />
          </div>
        ) : chartData.length > 0 ? (
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradNew" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradChurn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F87171" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#F87171" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradNet" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22C55E" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  width={35}
                />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    borderColor: "hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                />
                <Area
                  type="monotone"
                  dataKey="newSubs"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  fill="url(#gradNew)"
                  name="New"
                />
                <Area
                  type="monotone"
                  dataKey="churned"
                  stroke="#F87171"
                  strokeWidth={2}
                  fill="url(#gradChurn)"
                  name="Churned"
                />
                <Area
                  type="monotone"
                  dataKey="netGrowth"
                  stroke="#22C55E"
                  strokeWidth={2}
                  fill="url(#gradNet)"
                  name="Net Growth"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
            No subscriber growth data available
          </div>
        )}
      </CardContent>
    </Card>
  );
}
