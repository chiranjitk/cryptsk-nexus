"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch, formatINR } from "@/lib/utils";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from "recharts";
import { RefreshCw, IndianRupee } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface RevenueByPlan {
  planName: string;
  plan?: string;
  revenue: number;
  subscribers: number;
}

interface RevenueByArea {
  areaName: string;
  area?: string;
  revenue: number;
  subscribers: number;
}

const COLORS = [
  "#DC2626", "#F97316", "#EAB308", "#22C55E", "#14B8A6",
  "#3B82F6", "#8B5CF6", "#EC4899", "#6366F1", "#84CC16",
];

function RevenueTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { fullName: string; value: number; subscribers: number } }> }) {
  if (active && payload && payload.length > 0) {
    const d = payload[0].payload;
    return (
      <div className="bg-popover border border-border rounded-lg p-2.5 shadow-lg text-xs">
        <p className="font-semibold">{d.fullName}</p>
        <p className="text-muted-foreground">{formatINR(d.value)}</p>
        <p className="text-muted-foreground">{d.subscribers} subscribers</p>
      </div>
    );
  }
  return null;
}

export function RevenueBreakdownWidget() {
  const { data, isLoading, isFetching, refetch } = useQuery<{
    revenueByPlan: RevenueByPlan[];
    revenueByArea: RevenueByArea[];
    totalRevenue: number;
  }>({
    queryKey: ["revenue-breakdown"],
    queryFn: () => apiFetch("/api/reports?tab=financial"),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const planData = (data?.revenueByPlan || []).slice(0, 8).map((item) => {
    const label = item.planName || item.plan || "Unknown";
    return {
      name: label.length > 15 ? label.slice(0, 15) + "..." : label,
      fullName: label,
      value: item.revenue,
      subscribers: item.subscribers || 0,
    };
  });

  const areaData = (data?.revenueByArea || []).slice(0, 6).map((item) => {
    const label = item.areaName || item.area || "Unknown";
    return {
      name: label.length > 15 ? label.slice(0, 15) + "..." : label,
      fullName: label,
      value: item.revenue,
      subscribers: item.subscribers || 0,
    };
  });

  const totalRevenue = data?.totalRevenue || 0;

  return (
    <Card className="border shadow-sm animate-card-enter rounded-xl" style={{ animationDelay: "590ms" }}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <IndianRupee className="h-4 w-4 text-emerald-500" />
            Revenue Breakdown
          </CardTitle>
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
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-[200px]"><Skeleton className="skeleton-wave h-full w-full rounded-lg" /></div>
            <div className="h-[200px]"><Skeleton className="skeleton-wave h-full w-full rounded-lg" /></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* By Plan */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">By Plan</p>
              {planData.length > 0 ? (
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={planData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {planData.map((_, index) => (
                          <Cell key={`cell-plan-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip content={<RevenueTooltip />} />
                      <Legend
                        wrapperStyle={{ fontSize: "10px" }}
                        iconSize={8}
                        iconType="circle"
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
                  No revenue by plan data
                </div>
              )}
            </div>
            {/* By Area */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">By Area</p>
              {areaData.length > 0 ? (
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={areaData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {areaData.map((_, index) => (
                          <Cell key={`cell-area-${index}`} fill={COLORS[(index + 3) % COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip content={<RevenueTooltip />} />
                      <Legend
                        wrapperStyle={{ fontSize: "10px" }}
                        iconSize={8}
                        iconType="circle"
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
                  No revenue by area data
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
