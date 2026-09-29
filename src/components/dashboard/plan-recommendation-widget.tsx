"use client";

import { useState, useEffect } from "react";
import { formatINR } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import {
  Sparkles,
  TrendingDown,
  TrendingUp,
  ArrowRight,
  RefreshCw,
  PiggyBank,
  Zap,
  DollarSign,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface RecommendSummary {
  totalSubscribersAnalyzed: number;
  totalOpportunities: number;
  savingsCount: number;
  upgradeCount: number;
  betterValueCount: number;
  betterFitCount: number;
  totalPotentialSavings: number;
  totalPotentialCost: number;
  netMonthlyImpact: number;
}

interface Opportunity {
  subscriberId: string;
  subscriberName: string;
  subscriberCode: string;
  areaName: string | null;
  currentPlanName: string;
  currentPlanPrice: number;
  recommendedPlanName: string;
  recommendedPlanPrice: number;
  type: string;
  monthlySavings: number;
  score: number;
  reasons: string[];
}

interface RecommendData {
  success: boolean;
  summary: RecommendSummary;
  opportunities: Opportunity[];
  generatedAt: string;
}

const TYPE_BADGE: Record<string, { label: string; class: string }> = {
  downgrade: {
    label: "Save",
    class: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
  },
  upgrade: {
    label: "Upgrade",
    class: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800",
  },
  better_value: {
    label: "Better Value",
    class: "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-400 dark:border-teal-800",
  },
  better_fit: {
    label: "Better Fit",
    class: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800",
  },
};

export function PlanRecommendationWidget() {
  const [data, setData] = useState<RecommendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { setCurrentPage } = useAppStore();

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/plans/recommend", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch recommendations");
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 120000); // 2 min refresh
    return () => clearInterval(interval);
  }, []);

  const topOpportunities = data?.opportunities?.slice(0, 5) || [];
  const summary = data?.summary;

  const handleViewAnalysis = () => {
    setCurrentPage("Plan Recommendations", "MAIN");
  };

  if (loading) {
    return (
      <Card className="border shadow-sm rounded-xl">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Skeleton className="skeleton-wave h-5 w-5 rounded-md" />
              <Skeleton className="skeleton-wave h-5 w-44" />
            </div>
            <Skeleton className="skeleton-wave h-8 w-8 rounded-md" />
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="skeleton-wave h-16 rounded-lg" />
            ))}
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="skeleton-wave h-12 rounded-md" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border shadow-sm rounded-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-red-500" />
            Plan Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={fetchData}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border shadow-sm rounded-xl hover:shadow-md hover:border-red-200 dark:hover:border-red-800/50 transition-all duration-200">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-amber-400 to-amber-500 text-white shadow-sm">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            Smart Plan Recommendations
            {summary && summary.totalOpportunities > 0 && (
              <Badge className="text-[10px] px-1.5 py-0 bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800">
                {summary.totalOpportunities}
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={fetchData}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {/* Summary Stats */}
        {summary && (
          <div className="grid grid-cols-3 gap-3">
            {/* Subscribers who could save */}
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/50 p-3 text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <PiggyBank className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                {summary.savingsCount}
              </p>
              <p className="text-[10px] text-emerald-600 dark:text-emerald-500 font-medium">
                Could Save
              </p>
            </div>

            {/* Subscribers who need upgrades */}
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 p-3 text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <TrendingUp className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              </div>
              <p className="text-lg font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                {summary.upgradeCount}
              </p>
              <p className="text-[10px] text-amber-600 dark:text-amber-500 font-medium">
                Need Upgrade
              </p>
            </div>

            {/* Revenue Opportunity */}
            <div className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/50 p-3 text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <DollarSign className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
              </div>
              <p className="text-lg font-bold text-red-700 dark:text-red-400 tabular-nums">
                {formatINR(summary.totalPotentialSavings)}
              </p>
              <p className="text-[10px] text-red-600 dark:text-red-500 font-medium">
                Monthly Savings
              </p>
            </div>
          </div>
        )}

        {/* Top Opportunities List */}
        {topOpportunities.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Top Opportunities
            </p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {topOpportunities.map((opp, idx) => {
                const typeBadge = TYPE_BADGE[opp.type] || TYPE_BADGE.better_value;
                return (
                  <div
                    key={opp.subscriberId}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors group"
                  >
                    <span className="text-[10px] font-bold text-muted-foreground w-4 text-center">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">
                        {opp.subscriberName}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {opp.currentPlanName} → {opp.recommendedPlanName}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {opp.monthlySavings > 0 ? (
                        <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          -{formatINR(opp.monthlySavings)}
                        </p>
                      ) : (
                        <p className="text-xs font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                          +{formatINR(Math.abs(opp.monthlySavings))}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[9px] px-1.5 py-0 shrink-0 ${typeBadge.class}`}
                    >
                      {typeBadge.label}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <Zap className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">All subscribers are on optimal plans</p>
          </div>
        )}

        {/* View Analysis Button */}
        <Button
          onClick={handleViewAnalysis}
          variant="outline"
          size="sm"
          className="w-full gap-1.5 text-xs border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
        >
          View Full Analysis
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </CardContent>
    </Card>
  );
}
