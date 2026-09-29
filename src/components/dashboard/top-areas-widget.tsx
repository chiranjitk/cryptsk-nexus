"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin } from "lucide-react";
import { formatINR } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────

interface AreaRevenueItem {
  area: string;
  revenue: number;
}

interface TopAreasWidgetProps {
  areaWiseRevenue: AreaRevenueItem[];
}

// ─── Color palette for bars ─────────────────────────────────────

const BAR_COLORS = [
  { bar: "#DC2626", gradient: "from-red-500 to-red-600" },    // red
  { bar: "#0D9488", gradient: "from-teal-500 to-teal-600" },  // teal
  { bar: "#D97706", gradient: "from-amber-500 to-amber-600" }, // amber
  { bar: "#16A34A", gradient: "from-emerald-500 to-emerald-600" }, // green
  { bar: "#E11D48", gradient: "from-rose-500 to-rose-600" },  // rose
];

// ─── Top Revenue Areas Widget ───────────────────────────────────

export function TopAreasWidget({ areaWiseRevenue }: TopAreasWidgetProps) {
  // Sort by revenue descending, take top 5
  const sorted = [...areaWiseRevenue]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const totalRevenue = sorted.reduce((sum, item) => sum + item.revenue, 0);
  const maxRevenue = sorted.length > 0 ? sorted[0].revenue : 1;

  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter hover:shadow-md hover:border-amber-200 dark:hover:border-amber-800/50 transition-all duration-200">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-amber-100 dark:bg-amber-950/40">
              <MapPin className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            Top Revenue Areas
            <span className="text-[10px] font-medium text-muted-foreground">
              Top 5
            </span>
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {sorted.length > 0 ? (
          <div className="space-y-3">
            {sorted.map((item, index) => {
              const color = BAR_COLORS[index] || BAR_COLORS[0];
              const widthPct = maxRevenue > 0 ? Math.max(4, (item.revenue / maxRevenue) * 100) : 0;
              const percentOfTotal = totalRevenue > 0 ? ((item.revenue / totalRevenue) * 100).toFixed(1) : "0";

              return (
                <div key={item.area} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: color.bar }}
                      />
                      <span className="text-xs font-medium text-foreground truncate">
                        {item.area}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {percentOfTotal}%
                      </span>
                      <span className="text-xs font-semibold text-foreground tabular-nums">
                        {formatINR(item.revenue)}
                      </span>
                    </div>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-muted/80 dark:bg-muted/50 overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${color.gradient} transition-all duration-700 ease-out`}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
              );
            })}

            {/* Total */}
            <div className="pt-2 mt-1 border-t border-border/60">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Total (Top 5)</span>
                <span className="text-sm font-bold text-foreground tabular-nums">
                  {formatINR(totalRevenue)}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-40 text-xs text-muted-foreground">
            No area revenue data available
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Loading Skeleton ───────────────────────────────────────────

export function TopAreasWidgetSkeleton() {
  return (
    <Card className="border shadow-sm rounded-xl animate-card-enter">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-7 rounded-md" />
          <Skeleton className="h-5 w-32" />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-2.5 w-full rounded-full" />
            </div>
          ))}
          <Skeleton className="h-4 w-48 mt-2" />
        </div>
      </CardContent>
    </Card>
  );
}
