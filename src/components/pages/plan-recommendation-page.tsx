"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, formatINR } from "@/lib/utils";
import { toast } from "sonner";
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  DollarSign,
  RefreshCw,
  PiggyBank,
  Zap,
  ArrowUpDown,
  Filter,
  CheckCircle2,
  Download,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import PageHeader from "@/components/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Types ──────────────────────────────────────────────

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

interface OptimizationData {
  success: boolean;
  opportunities: Opportunity[];
  totalCurrentMRR: number;
  totalOptimizedMRR: number;
  potentialGain: number;
  subscriberAnalysis: {
    subscriberId: string;
    subscriberName: string;
    subscriberCode: string;
    areaName: string | null;
    currentPlanId: string;
    currentPlanName: string;
    currentPrice: number;
    optimalPlanId: string | null;
    optimalPlanName: string | null;
    optimalPrice: number;
    monthlySavings: number;
    type: string;
    reasons: string[];
    projectedMonthlyGb: number;
    dataUtilizationPercent: number | null;
  }[];
  groupByArea: Record<
    string,
    { currentMRR: number; optimizedMRR: number; count: number; potentialChange: number }
  >;
  groupByPlan: Record<
    string,
    {
      currentMRR: number;
      optimizedMRR: number;
      count: number;
      potentialChange: number;
      subscriberCount: number;
    }
  >;
  generatedAt: string;
}

const TYPE_BADGE: Record<string, { label: string; class: string; icon: React.ElementType }> = {
  downgrade: {
    label: "Downgrade",
    class: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
    icon: TrendingDown,
  },
  upgrade: {
    label: "Upgrade",
    class: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800",
    icon: TrendingUp,
  },
  better_value: {
    label: "Better Value",
    class: "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-400 dark:border-teal-800",
    icon: Sparkles,
  },
  better_fit: {
    label: "Better Fit",
    class: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800",
    icon: Zap,
  },
};

export default function PlanRecommendationPage() {
  const [activeTab, setActiveTab] = useState<"recommendations" | "optimization">("recommendations");
  const [typeFilter, setTypeFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Fetch recommendation data
  const { data: recommendData, isLoading: loadingRecommend, refetch: refetchRecommend } = useQuery<RecommendData>({
    queryKey: ["plan-recommendations"],
    queryFn: () => apiFetch<RecommendData>("/api/plans/recommend"),
    refetchInterval: 120000,
    enabled: activeTab === "recommendations",
  });

  // Fetch optimization data
  const { data: optimizationData, isLoading: loadingOptimize, refetch: refetchOptimize } = useQuery<OptimizationData>({
    queryKey: ["plan-optimization"],
    queryFn: () => apiFetch<OptimizationData>("/api/plans/optimization"),
    refetchInterval: 120000,
    enabled: activeTab === "optimization",
  });

  // Derived data for recommendations tab
  const filteredOpportunities = useMemo(() => {
    if (!recommendData?.opportunities) return [];
    let filtered = [...recommendData.opportunities];

    if (typeFilter !== "all") {
      filtered = filtered.filter((o) => o.type === typeFilter);
    }
    if (areaFilter !== "all") {
      filtered = filtered.filter((o) => o.areaName === areaFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (o) =>
          o.subscriberName.toLowerCase().includes(q) ||
          o.subscriberCode.toLowerCase().includes(q) ||
          o.currentPlanName.toLowerCase().includes(q) ||
          o.recommendedPlanName.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [recommendData, typeFilter, areaFilter, searchQuery]);

  // Derived data for optimization tab
  const filteredAnalysis = useMemo(() => {
    if (!optimizationData?.subscriberAnalysis) return [];
    let filtered = [...optimizationData.subscriberAnalysis];

    if (typeFilter !== "all") {
      filtered = filtered.filter((a) => a.type === typeFilter);
    }
    if (areaFilter !== "all") {
      filtered = filtered.filter((a) => a.areaName === areaFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (a) =>
          a.subscriberName.toLowerCase().includes(q) ||
          a.subscriberCode.toLowerCase().includes(q) ||
          a.currentPlanName.toLowerCase().includes(q) ||
          (a.optimalPlanName && a.optimalPlanName.toLowerCase().includes(q))
      );
    }

    return filtered;
  }, [optimizationData, typeFilter, areaFilter, searchQuery]);

  // Available areas for filter
  const availableAreas = useMemo(() => {
    const areas = new Set<string>();
    recommendData?.opportunities?.forEach((o) => {
      if (o.areaName) areas.add(o.areaName);
    });
    optimizationData?.subscriberAnalysis?.forEach((a) => {
      if (a.areaName) areas.add(a.areaName);
    });
    return Array.from(areas).sort();
  }, [recommendData, optimizationData]);

  // Pagination
  const currentData = activeTab === "recommendations" ? filteredOpportunities : filteredAnalysis;
  const totalPages = Math.ceil(currentData.length / pageSize);
  const paginatedData = currentData.slice((page - 1) * pageSize, page * pageSize);

  const handleApplyRecommendations = () => {
    toast.success("Plan recommendations queued for review. Implementation will be processed by the admin.");
  };

  const handleExport = () => {
    if (!recommendData?.opportunities) {
      toast.error("No data available to export");
      return;
    }

    const rows: string[][] = [];
    rows.push(["Plan Recommendation Report — Cryptsk ISP"]);
    rows.push(["Generated", new Date().toLocaleString("en-IN")]);
    rows.push([]);
    rows.push(["Name", "Code", "Area", "Current Plan", "Current Price", "Recommended Plan", "Recommended Price", "Savings/Cost", "Type", "Score", "Reasons"]);

    for (const opp of recommendData.opportunities) {
      rows.push([
        opp.subscriberName,
        opp.subscriberCode,
        opp.areaName || "",
        opp.currentPlanName,
        opp.currentPlanPrice.toString(),
        opp.recommendedPlanName,
        opp.recommendedPlanPrice.toString(),
        opp.monthlySavings.toString(),
        opp.type,
        opp.score.toString(),
        opp.reasons.join("; "),
      ]);
    }

    const csvContent = rows.map((row) =>
      row.map((cell) => {
        const str = String(cell).replace(/"/g, '""');
        return str.includes(",") || str.includes("\n") || str.includes('"') ? `"${str}"` : str;
      }).join(",")
    ).join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `plan-recommendations-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Report exported successfully");
  };

  const summary = recommendData?.summary;
  const isLoading = activeTab === "recommendations" ? loadingRecommend : loadingOptimize;

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        icon={Sparkles}
        title="Plan Recommendations"
        description="AI-powered plan optimization and smart recommendations based on usage patterns"
        badge={summary ? { text: `${summary.totalOpportunities} Opportunities` } : undefined}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleExport}>
              <Download className="h-3.5 w-3.5" />Export CSV
            </Button>
            <Button
              size="sm"
              className="gap-1.5 text-xs bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                refetchRecommend();
                refetchOptimize();
                toast.success("Data refreshed");
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" />Refresh
            </Button>
          </div>
        }
      />

      {/* Tab Selector */}
      <div className="flex items-center gap-2 border rounded-lg p-1 w-fit">
        <Button
          variant={activeTab === "recommendations" ? "secondary" : "ghost"}
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => { setActiveTab("recommendations"); setPage(1); }}
        >
          <Sparkles className="h-3.5 w-3.5" />Smart Recommendations
        </Button>
        <Button
          variant={activeTab === "optimization" ? "secondary" : "ghost"}
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => { setActiveTab("optimization"); setPage(1); }}
        >
          <DollarSign className="h-3.5 w-3.5" />Revenue Optimization
        </Button>
      </div>

      {/* ─── Recommendations Tab ─── */}
      {activeTab === "recommendations" && (
        <>
          {/* Revenue Opportunity Summary Cards */}
          {summary && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Total Savings Opportunity */}
              <Card className="border shadow-sm rounded-xl border-l-4 border-l-emerald-500 hover:shadow-md transition-all duration-200">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 shrink-0">
                      <PiggyBank className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Total Savings Potential
                      </p>
                      <p className="text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                        {formatINR(summary.totalPotentialSavings)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {summary.savingsCount} subscribers could save monthly
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Upgrade Opportunities */}
              <Card className="border shadow-sm rounded-xl border-l-4 border-l-amber-500 hover:shadow-md transition-all duration-200">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 shrink-0">
                      <TrendingUp className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Upgrade Opportunities
                      </p>
                      <p className="text-xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
                        {summary.upgradeCount}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        subscribers need higher plans
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Better Value */}
              <Card className="border shadow-sm rounded-xl border-l-4 border-l-teal-500 hover:shadow-md transition-all duration-200">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-teal-100 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 shrink-0">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Better Value Available
                      </p>
                      <p className="text-xl font-bold tabular-nums text-teal-600 dark:text-teal-400">
                        {summary.betterValueCount}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        subscribers on suboptimal plans
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Net Impact */}
              <Card className="border shadow-sm rounded-xl border-l-4 border-l-red-500 hover:shadow-md transition-all duration-200">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl shrink-0 ${
                      summary.netMonthlyImpact > 0
                        ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
                        : "bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400"
                    }`}>
                      <DollarSign className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Net Monthly Impact
                      </p>
                      <p className={`text-xl font-bold tabular-nums ${
                        summary.netMonthlyImpact > 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400"
                      }`}>
                        {summary.netMonthlyImpact > 0 ? "+" : ""}{formatINR(summary.netMonthlyImpact)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {summary.totalSubscribersAnalyzed} subscribers analyzed
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[200px]">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search subscriber, plan..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              />
            </div>
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="downgrade">Downgrade (Save)</SelectItem>
                <SelectItem value="upgrade">Upgrade</SelectItem>
                <SelectItem value="better_value">Better Value</SelectItem>
                <SelectItem value="better_fit">Better Fit</SelectItem>
              </SelectContent>
            </Select>
            <Select value={areaFilter} onValueChange={(v) => { setAreaFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Area" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Areas</SelectItem>
                {availableAreas.map((area) => (
                  <SelectItem key={area} value={area}>{area}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(typeFilter !== "all" || areaFilter !== "all" || searchQuery.trim()) && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={() => { setTypeFilter("all"); setAreaFilter("all"); setSearchQuery(""); setPage(1); }}
              >
                Clear Filters
              </Button>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              {filteredOpportunities.length} of {recommendData?.opportunities?.length || 0} results
            </span>
          </div>

          {/* Recommendations Table */}
          {isLoading ? (
            <Card className="border shadow-sm rounded-xl">
              <CardContent className="p-0">
                <div className="space-y-0">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 px-4 py-3 border-b last:border-0">
                      <Skeleton className="skeleton-wave h-4 w-32" />
                      <Skeleton className="skeleton-wave h-4 w-24" />
                      <Skeleton className="skeleton-wave h-4 w-20" />
                      <Skeleton className="skeleton-wave h-4 w-5" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : paginatedData.length === 0 ? (
            <Card className="border shadow-sm rounded-xl">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className="h-16 w-16 rounded-2xl bg-red-50 dark:bg-red-950/20 flex items-center justify-center mb-4">
                  <Sparkles className="h-8 w-8 text-red-400/60" />
                </div>
                <p className="text-foreground font-semibold text-base">No recommendations found</p>
                <p className="text-xs text-muted-foreground/70 mt-1 mb-4 text-center max-w-xs">
                  {searchQuery || typeFilter !== "all" || areaFilter !== "all"
                    ? "Try adjusting your filters to see more results"
                    : "All subscribers are on optimal plans"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border shadow-sm rounded-xl overflow-hidden">
              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs font-semibold">Subscriber</TableHead>
                        <TableHead className="text-xs font-semibold">Area</TableHead>
                        <TableHead className="text-xs font-semibold">Current Plan</TableHead>
                        <TableHead className="text-xs font-semibold">Current Price</TableHead>
                        <TableHead className="text-xs font-semibold">Recommended Plan</TableHead>
                        <TableHead className="text-xs font-semibold">New Price</TableHead>
                        <TableHead className="text-xs font-semibold">Savings/Cost</TableHead>
                        <TableHead className="text-xs font-semibold">Type</TableHead>
                        <TableHead className="text-xs font-semibold">Score</TableHead>
                        <TableHead className="text-xs font-semibold">Reasons</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedData.map((opp) => {
                        const typeBadge = TYPE_BADGE[opp.type] || TYPE_BADGE.better_value;
                        const TypeIcon = typeBadge.icon;
                        return (
                          <TableRow key={opp.subscriberId} className="table-row-hover">
                            <TableCell>
                              <div>
                                <p className="text-sm font-medium text-foreground">{opp.subscriberName}</p>
                                <p className="text-[10px] text-muted-foreground font-mono">{opp.subscriberCode}</p>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {opp.areaName || "—"}
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="text-sm font-medium">{opp.currentPlanName}</p>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm font-medium tabular-nums">
                              {formatINR(opp.currentPlanPrice)}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <ArrowUpDown className="h-3 w-3 text-red-500 shrink-0" />
                                <p className="text-sm font-medium text-red-600 dark:text-red-400">
                                  {opp.recommendedPlanName}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm font-medium tabular-nums">
                              {formatINR(opp.recommendedPlanPrice)}
                            </TableCell>
                            <TableCell>
                              <span
                                className={`text-sm font-bold tabular-nums ${
                                  opp.monthlySavings > 0
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-amber-600 dark:text-amber-400"
                                }`}
                              >
                                {opp.monthlySavings > 0 ? "-" : "+"}
                                {formatINR(Math.abs(opp.monthlySavings))}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={`text-[10px] px-1.5 py-0 gap-0.5 ${typeBadge.class}`}
                              >
                                <TypeIcon className="h-2.5 w-2.5" />
                                {typeBadge.label}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <div className="relative h-1.5 w-12 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-500 to-amber-500 rounded-full"
                                    style={{ width: `${Math.min(opp.score, 100)}%` }}
                                  />
                                </div>
                                <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
                                  {opp.score}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="max-w-[200px]">
                                <p className="text-[10px] text-muted-foreground line-clamp-2">
                                  {opp.reasons.join("; ")}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-[10px] gap-1 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
                                onClick={() => {
                                  toast.success(`Plan change recommendation for ${opp.subscriberName} queued for review`);
                                }}
                              >
                                <CheckCircle2 className="h-3 w-3" />Apply
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t">
                    <span className="text-xs text-muted-foreground">
                      Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredOpportunities.length)} of {filteredOpportunities.length}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </Button>
                      {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                        const pageNum = page <= 3 ? i + 1 : page + i - 2;
                        if (pageNum < 1 || pageNum > totalPages) return null;
                        return (
                          <Button
                            key={pageNum}
                            variant={pageNum === page ? "default" : "outline"}
                            size="icon"
                            className="h-7 w-7 text-xs"
                            onClick={() => setPage(pageNum)}
                          >
                            {pageNum}
                          </Button>
                        );
                      })}
                      <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Bulk Actions */}
          {filteredOpportunities.length > 0 && (
            <Card className="border shadow-sm rounded-xl">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {filteredOpportunities.length} Plan Recommendations
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Review and apply recommended plan changes for subscribers
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={handleExport}
                    >
                      <Download className="h-3.5 w-3.5" />Export
                    </Button>
                    <Button
                      size="sm"
                      className="gap-1.5 text-xs bg-red-600 hover:bg-red-700 text-white"
                      onClick={handleApplyRecommendations}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />Apply Recommendations
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ─── Optimization Tab ─── */}
      {activeTab === "optimization" && optimizationData && (
        <>
          {/* Revenue Optimization Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border shadow-sm rounded-xl border-l-4 border-l-red-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 shrink-0">
                    <DollarSign className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Current MRR
                    </p>
                    <p className="text-xl font-bold tabular-nums">{formatINR(optimizationData.totalCurrentMRR)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border shadow-sm rounded-xl border-l-4 border-l-teal-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-teal-100 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 shrink-0">
                    <ArrowUpDown className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Optimized MRR
                    </p>
                    <p className="text-xl font-bold tabular-nums">{formatINR(optimizationData.totalOptimizedMRR)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className={`border shadow-sm rounded-xl border-l-4 ${
              optimizationData.potentialGain > 0
                ? "border-l-emerald-500"
                : "border-l-amber-500"
            }`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl shrink-0 ${
                    optimizationData.potentialGain > 0
                      ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
                      : "bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400"
                  }`}>
                    {optimizationData.potentialGain > 0 ? <TrendingDown className="h-5 w-5" /> : <TrendingUp className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Revenue Change
                    </p>
                    <p className={`text-xl font-bold tabular-nums ${
                      optimizationData.potentialGain > 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-amber-600 dark:text-amber-400"
                    }`}>
                      {optimizationData.potentialGain > 0 ? "-" : "+"}{formatINR(Math.abs(optimizationData.potentialGain))}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Group by Plan */}
          <Card className="border shadow-sm rounded-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-red-500" />
                Impact by Current Plan
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-semibold">Plan Name</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Subscribers</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Current MRR</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Optimized MRR</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Change</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(optimizationData.groupByPlan).map(([planName, stats]) => (
                      <TableRow key={planName} className="table-row-hover">
                        <TableCell className="text-sm font-medium">{planName}</TableCell>
                        <TableCell className="text-sm text-right tabular-nums">{stats.subscriberCount}</TableCell>
                        <TableCell className="text-sm text-right tabular-nums">{formatINR(stats.currentMRR)}</TableCell>
                        <TableCell className="text-sm text-right tabular-nums">{formatINR(stats.optimizedMRR)}</TableCell>
                        <TableCell className="text-sm text-right tabular-nums">
                          <span className={stats.potentialChange > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
                            {stats.potentialChange > 0 ? "-" : "+"}{formatINR(Math.abs(stats.potentialChange))}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Group by Area */}
          <Card className="border shadow-sm rounded-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Filter className="h-4 w-4 text-teal-500" />
                Impact by Area
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-semibold">Area</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Subscribers</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Current MRR</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Optimized MRR</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Change</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(optimizationData.groupByArea).map(([areaName, stats]) => (
                      <TableRow key={areaName} className="table-row-hover">
                        <TableCell className="text-sm font-medium">{areaName}</TableCell>
                        <TableCell className="text-sm text-right tabular-nums">{stats.count}</TableCell>
                        <TableCell className="text-sm text-right tabular-nums">{formatINR(stats.currentMRR)}</TableCell>
                        <TableCell className="text-sm text-right tabular-nums">{formatINR(stats.optimizedMRR)}</TableCell>
                        <TableCell className="text-sm text-right tabular-nums">
                          <span className={stats.potentialChange > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
                            {stats.potentialChange > 0 ? "-" : "+"}{formatINR(Math.abs(stats.potentialChange))}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
