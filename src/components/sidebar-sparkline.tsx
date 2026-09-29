"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  YAxis,
  Tooltip,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

interface GrowthPoint {
  month: string;
  additions: number;
}

interface DashboardData {
  subscriberGrowthData: GrowthPoint[];
}

// ─── Custom Tooltip ─────────────────────────────────────────────

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-[#1E293B] border border-white/10 rounded-md px-2 py-1 shadow-lg">
      <p className="text-[10px] text-[#94A3B8]">{label}</p>
      <p className="text-[11px] font-semibold text-[#E2E8F0]">
        +{payload[0].value} new
      </p>
    </div>
  );
}

// ─── Activity Sparkline ─────────────────────────────────────────

export function ActivitySparkline() {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["sidebar-sparkline-data"],
    queryFn: () =>
      fetch("/api/dashboard?range=7d").then((r) => r.json()),
    refetchInterval: 120_000,
    staleTime: 90_000,
    retry: 1,
  });

  const chartData = data?.subscriberGrowthData ?? [];
  const hasData = chartData.length > 0 && chartData.some((p) => p.additions > 0);
  const totalNew = chartData.reduce((sum, p) => sum + p.additions, 0);

  return (
    <div className="group-data-[collapsible=icon]:hidden px-1 pb-1">
      {/* Label */}
      <div className="flex items-center gap-1.5 px-2 py-1">
        <TrendingUp className="h-3 w-3 text-[#DC2626] shrink-0" />
        <span className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">
          Signups
        </span>
        {!isLoading && hasData && (
          <span className="ml-auto text-[10px] font-bold text-[#DC2626]">
            +{totalNew}
          </span>
        )}
      </div>

      {/* Chart area */}
      {isLoading ? (
        <div className="px-2 py-1">
          <Skeleton className="h-[40px] w-full rounded-md" />
        </div>
      ) : hasData ? (
        <div className="h-[40px] w-full px-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 2, right: 4, left: -20, bottom: 2 }}
            >
              <defs>
                <linearGradient id="sparkGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#DC2626" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#DC2626" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
              <Tooltip
                content={<CustomTooltip />}
                cursor={false}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="additions"
                stroke="#DC2626"
                strokeWidth={1.5}
                fill="url(#sparkGradient)"
                dot={false}
                activeDot={{
                  r: 3,
                  fill: "#DC2626",
                  stroke: "#0F172A",
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-[40px] flex items-center justify-center px-2">
          <span className="text-[10px] text-[#475569]">No signups in 7 days</span>
        </div>
      )}
    </div>
  );
}
