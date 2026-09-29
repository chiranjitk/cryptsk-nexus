"use client";

import React, { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldAlert, TrendingDown, IndianRupee, RefreshCw, Search,
  ChevronLeft, ChevronRight, ArrowUpDown, Download, Eye, Send, Phone,
  AlertTriangle, X, Clock, BarChart3, Activity, Users, MessageSquare,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
} from "recharts";
import { toast } from "sonner";
import { apiFetch, formatINR } from "@/lib/utils";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────

interface RiskFactors {
  paymentScore: number;
  paymentDetails: string[];
  complaintScore: number;
  complaintDetails: string[];
  tenureScore: number;
  tenureDetails: string[];
  engagementScore: number;
  engagementDetails: string[];
  balanceScore: number;
  balanceDetails: string[];
}

interface PredictedSubscriber {
  id: string;
  name: string;
  email: string;
  phone: string;
  planName: string;
  areaName: string;
  riskScore: number;
  riskLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  factors: RiskFactors;
}

interface ChurnAnalytics {
  riskDistribution: { CRITICAL: number; HIGH: number; MEDIUM: number; LOW: number };
  areaBreakdown: { areaId: string; areaName: string; totalSubscribers: number; avgRiskScore: number; highRiskCount: number }[];
  planBreakdown: { planId: string; planName: string; totalSubscribers: number; avgRiskScore: number; highRiskCount: number }[];
  churnTrend: { month: string; churned: number; activated: number }[];
  revenueAtRisk: number;
  topReasons: { reason: string; count: number; category: string }[];
  totalActiveSubscribers: number;
  generatedAt: string;
}

interface RetentionCommunication {
  id: string;
  trackingId: string;
  actionType: string;
  actionDetail: string;
  note: string;
  createdBy: string;
  createdById: string;
  createdAt: string;
}

// ─── Constants ──────────────────────────────────────────────

const RISK_LEVEL_CONFIG: Record<string, { bg: string; text: string; border: string; dot: string; progress: string }> = {
  CRITICAL: { bg: "bg-red-100 dark:bg-red-950/50", text: "text-red-700 dark:text-red-400", border: "border-red-300 dark:border-red-800", dot: "bg-red-600", progress: "[&>div]:bg-red-600" },
  HIGH: { bg: "bg-red-50 dark:bg-red-950/30", text: "text-red-600 dark:text-red-400", border: "border-red-200 dark:border-red-800/60", dot: "bg-red-400", progress: "[&>div]:bg-red-400" },
  MEDIUM: { bg: "bg-amber-50 dark:bg-amber-950/30", text: "text-amber-700 dark:text-amber-400", border: "border-amber-200 dark:border-amber-800/60", dot: "bg-amber-500", progress: "[&>div]:bg-amber-500" },
  LOW: { bg: "bg-teal-50 dark:bg-teal-950/30", text: "text-teal-700 dark:text-teal-400", border: "border-teal-200 dark:border-teal-800/60", dot: "bg-teal-500", progress: "[&>div]:bg-teal-500" },
};

const PIE_COLORS = ["#DC2626", "#EF4444", "#F59E0B", "#14B8A6"];

const REASON_CATEGORY_COLORS: Record<string, string> = {
  payment: "#DC2626",
  service: "#F59E0B",
  financial: "#EF4444",
  engagement: "#14B8A6",
};

// ─── Custom Tooltip ────────────────────────────────────────

function ChartTooltip({ active, payload, label, isCurrency = false }: {
  active?: boolean; payload?: { value: number; name: string; color: string }[];
  label?: string; isCurrency?: boolean;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card/95 border border-border/80 rounded-xl shadow-2xl px-3 py-2 text-xs backdrop-blur-md">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((item, i) => (
        <p key={i} className="text-muted-foreground flex items-center justify-between gap-3 py-0.5">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
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

// ─── Main Page ─────────────────────────────────────────────

export default function ChurnPredictionPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<string>("ALL");
  const [areaFilter, setAreaFilter] = useState<string>("ALL");
  const [planFilter, setPlanFilter] = useState<string>("ALL");
  const [minScore, setMinScore] = useState<string>("0");
  const [sortField, setSortField] = useState<string>("riskScore");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [actionDialog, setActionDialog] = useState<{ open: boolean; subscriber: PredictedSubscriber | null }>({ open: false, subscriber: null });
  const [actionType, setActionType] = useState<string>("GENERAL_REMINDER");
  const [discountType, setDiscountType] = useState<string>("PERCENTAGE");
  const [discountValue, setDiscountValue] = useState<string>("");
  const [actionNotes, setActionNotes] = useState("");
  const [actionChannel, setActionChannel] = useState<string>("IN_APP");
  const [commHistory, setCommHistory] = useState<RetentionCommunication[]>([]);
  const [showCommHistory, setShowCommHistory] = useState(false);

  // Fetch prediction data
  const { data: predictionData, isLoading: isLoadingPrediction } = useQuery<{
    subscribers: PredictedSubscriber[];
    summary: { critical: number; high: number; medium: number; low: number; avgScore: number };
  }>({
    queryKey: ["churn-prediction"],
    queryFn: () => apiFetch("/api/churn/predict"),
    refetchInterval: 120000,
  });

  // Fetch analytics data
  const { data: analytics, isLoading: isLoadingAnalytics } = useQuery<ChurnAnalytics>({
    queryKey: ["churn-analytics"],
    queryFn: () => apiFetch("/api/churn/analytics"),
    refetchInterval: 120000,
  });

  // Retention action mutation
  const retentionMutation = useMutation({
    mutationFn: async (body: { subscriberId: string; actionType: string; discount: { type: string; value: number } | null; notes: string; channel: string }) => {
      return apiFetch("/api/churn/retention", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      toast.success("Retention action saved successfully!");
      closeActionDialog();
      queryClient.invalidateQueries({ queryKey: ["churn-prediction"] });
      queryClient.invalidateQueries({ queryKey: ["churn-analytics"] });
    },
    onError: () => toast.error("Failed to save retention action"),
  });

  const fetchCommHistory = useCallback(async (subscriberId: string) => {
    try {
      const data = await apiFetch<{ communications: RetentionCommunication[] }>(
        `/api/churn/retention?subscriberId=${subscriberId}`
      );
      setCommHistory(data.communications || []);
      setShowCommHistory(true);
    } catch {
      setCommHistory([]);
    }
  }, []);

  const closeActionDialog = () => {
    setActionDialog({ open: false, subscriber: null });
    setActionType("GENERAL_REMINDER");
    setDiscountType("PERCENTAGE");
    setDiscountValue("");
    setActionNotes("");
    setActionChannel("IN_APP");
    setShowCommHistory(false);
    setCommHistory([]);
  };

  const openActionDialog = (subscriber: PredictedSubscriber) => {
    setActionDialog({ open: true, subscriber });
    fetchCommHistory(subscriber.id);
  };

  const handleSaveAction = () => {
    if (!actionDialog.subscriber) return;

    if (actionType === "DISCOUNT" && !discountValue) {
      toast.error("Please enter a discount value");
      return;
    }

    const discount = actionType === "DISCOUNT"
      ? { type: discountType, value: parseFloat(discountValue) || 0 }
      : null;

    if (!actionNotes.trim() && actionType !== "DISCOUNT") {
      toast.error("Please add notes for this action");
      return;
    }

    retentionMutation.mutate({
      subscriberId: actionDialog.subscriber.id,
      actionType,
      discount,
      notes: actionNotes,
      channel: actionChannel,
    });
  };

  const handleSort = (field: string) => {
    if (sortField === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  // Filtering & sorting
  const filteredSubscribers = (() => {
    if (!predictionData?.subscribers) return [];
    let items = predictionData.subscribers.filter((s) => {
      const matchesSearch = !search ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.email.toLowerCase().includes(search.toLowerCase()) ||
        s.phone.includes(search);
      const matchesRisk = riskFilter === "ALL" || s.riskLevel === riskFilter;
      const matchesArea = areaFilter === "ALL" || s.areaName === areaFilter;
      const matchesPlan = planFilter === "ALL" || s.planName === planFilter;
      const matchesScore = s.riskScore >= parseInt(minScore);
      return matchesSearch && matchesRisk && matchesArea && matchesPlan && matchesScore;
    });

    items = [...items].sort((a, b) => {
      let aVal: number | string = a[sortField as keyof PredictedSubscriber] as number | string;
      let bVal: number | string = b[sortField as keyof PredictedSubscriber] as number | string;
      if (typeof aVal === "string") aVal = aVal.toLowerCase();
      if (typeof bVal === "string") bVal = bVal.toLowerCase();
      if (sortDir === "asc") return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
    });
    return items;
  })();

  const totalPages = Math.max(1, Math.ceil(filteredSubscribers.length / pageSize));
  const pagedSubscribers = filteredSubscribers.slice((page - 1) * pageSize, page * pageSize);
  const showingFrom = filteredSubscribers.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = Math.min(page * pageSize, filteredSubscribers.length);

  // Unique areas and plans for filters
  const uniqueAreas = [...new Set(predictionData?.subscribers.map((s) => s.areaName) || [])].filter(Boolean).sort();
  const uniquePlans = [...new Set(predictionData?.subscribers.map((s) => s.planName) || [])].filter(Boolean).sort();

  // Chart data
  const distributionData = analytics ? [
    { name: "Critical", value: analytics.riskDistribution.CRITICAL || 0, color: PIE_COLORS[0] },
    { name: "High", value: analytics.riskDistribution.HIGH || 0, color: PIE_COLORS[1] },
    { name: "Medium", value: analytics.riskDistribution.MEDIUM || 0, color: PIE_COLORS[2] },
    { name: "Low", value: analytics.riskDistribution.LOW || 0, color: PIE_COLORS[3] },
  ] : [];

  const totalAtRisk = analytics
    ? (analytics.riskDistribution.CRITICAL || 0) + (analytics.riskDistribution.HIGH || 0)
    : 0;

  const isLoading = isLoadingPrediction || isLoadingAnalytics;

  // Export handler
  const handleExport = () => {
    if (filteredSubscribers.length === 0) { toast.error("No data to export"); return; }
    const headers = ["Name", "Email", "Phone", "Plan", "Area", "Risk Score", "Risk Level", "Payment", "Complaints", "Tenure", "Engagement", "Balance"];
    const rows = filteredSubscribers.map(s => [
      s.name, s.email, s.phone, s.planName, s.areaName, s.riskScore, s.riskLevel,
      s.factors.paymentDetails.join("; "), s.factors.complaintDetails.join("; "),
      s.factors.tenureDetails.join("; "), s.factors.engagementDetails.join("; "),
      s.factors.balanceDetails.join("; "),
    ].map(c => `"${c}"`).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `churn-prediction-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredSubscribers.length} records`);
  };

  const resetFilters = () => {
    setSearch("");
    setRiskFilter("ALL");
    setAreaFilter("ALL");
    setPlanFilter("ALL");
    setMinScore("0");
    setPage(1);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-red-600" />
            AI Churn Prediction
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Machine learning-powered churn risk scoring for active subscribers.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
          <Button
            variant="outline" size="sm" className="gap-1.5"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["churn-prediction"] });
              queryClient.invalidateQueries({ queryKey: ["churn-analytics"] });
              toast.success("Refreshing data...");
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
          <Skeleton className="skeleton-wave h-80 rounded-xl" />
          <Skeleton className="skeleton-wave h-64 rounded-xl" />
        </div>
      ) : predictionData && analytics ? (
        <>
          {/* ── 1. Summary Cards ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border shadow-sm rounded-xl hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-lg bg-red-100 dark:bg-red-950/40">
                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  </div>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Total At-Risk</span>
                </div>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400 tabular-nums">
                  {totalAtRisk}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  of {analytics.totalActiveSubscribers} active
                </p>
              </CardContent>
            </Card>

            <Card className="border shadow-sm rounded-xl hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-950/40">
                    <IndianRupee className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Revenue at Risk</span>
                </div>
                <p className="text-lg font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                  {formatINR(analytics.revenueAtRisk)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">Monthly fees at risk</p>
              </CardContent>
            </Card>

            <Card className="border shadow-sm rounded-xl hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-lg bg-orange-100 dark:bg-orange-950/40">
                    <Activity className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                  </div>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Avg Risk Score</span>
                </div>
                <p className="text-2xl font-bold tabular-nums">
                  <span className={cn(
                    predictionData.summary.avgScore >= 60 ? "text-red-600" :
                    predictionData.summary.avgScore >= 40 ? "text-amber-600" :
                    "text-teal-600"
                  )}>
                    {predictionData.summary.avgScore}
                  </span>
                  <span className="text-sm text-muted-foreground font-normal">/100</span>
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">Across all subscribers</p>
              </CardContent>
            </Card>

            <Card className="border shadow-sm rounded-xl hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-lg bg-red-100 dark:bg-red-950/40">
                    <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
                  </div>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Churned Last Month</span>
                </div>
                <p className="text-2xl font-bold tabular-nums">
                  {analytics.churnTrend.length > 0 ? analytics.churnTrend[analytics.churnTrend.length - 1].churned : 0}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">Disconnected subscribers</p>
              </CardContent>
            </Card>
          </div>

          {/* ── 2. Charts Row ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Risk Distribution Chart */}
            <Card className="border shadow-sm rounded-xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-red-600" /> Risk Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={distributionData} layout="vertical" margin={{ left: 0, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" horizontal={false} />
                      <XAxis type="number" tick={{ fill: "#94A3B8", fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" tick={{ fill: "#94A3B8", fontSize: 11 }} width={70} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="value" name="Subscribers" radius={[0, 6, 6, 0]} barSize={24}>
                        {distributionData.map((entry, index) => (
                          <Cell key={index} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Area Risk Heatmap */}
            <Card className="border shadow-sm rounded-xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4 text-red-600" /> Area Risk Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                {analytics.areaBreakdown.length > 0 ? (
                  <div className="max-h-52 overflow-y-auto custom-scrollbar">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-[10px]">Area</TableHead>
                          <TableHead className="text-[10px] text-center">Subs</TableHead>
                          <TableHead className="text-[10px] text-center">Avg Score</TableHead>
                          <TableHead className="text-[10px] text-center">High Risk</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analytics.areaBreakdown.slice(0, 8).map((area) => (
                          <TableRow key={area.areaId} className="hover:bg-muted/30">
                            <TableCell className="text-xs font-medium py-1.5">{area.areaName}</TableCell>
                            <TableCell className="text-xs text-center tabular-nums py-1.5">{area.totalSubscribers}</TableCell>
                            <TableCell className="text-center py-1.5">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] font-bold tabular-nums",
                                  area.avgRiskScore >= 60 ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400" :
                                  area.avgRiskScore >= 40 ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400" :
                                  "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/30 dark:text-teal-400"
                                )}
                              >
                                {area.avgRiskScore}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center py-1.5">
                              <span className={cn(
                                "text-xs font-bold tabular-nums",
                                area.highRiskCount > 0 ? "text-red-600" : "text-teal-600"
                              )}>
                                {area.highRiskCount}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">
                    No area data available
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Churn Trend */}
            <Card className="border shadow-sm rounded-xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-red-600" /> Monthly Churn Trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={analytics.churnTrend} margin={{ left: -20, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                      <XAxis dataKey="month" tick={{ fill: "#94A3B8", fontSize: 10 }} />
                      <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} />
                      <Tooltip content={<ChartTooltip />} />
                      <Line type="monotone" dataKey="churned" name="Churned" stroke="#DC2626" strokeWidth={2} dot={{ fill: "#DC2626", r: 4 }} />
                      <Line type="monotone" dataKey="activated" name="Activated" stroke="#14B8A6" strokeWidth={2} dot={{ fill: "#14B8A6", r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── 3. Subscriber Risk Table ── */}
          <Card className="border shadow-sm rounded-xl">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-red-600" />
                  Subscriber Risk Analysis
                  <Badge variant="outline" className="text-xs font-normal">
                    {filteredSubscribers.length} subscriber{filteredSubscribers.length !== 1 ? "s" : ""}
                  </Badge>
                </CardTitle>
                <div className="flex gap-2 flex-wrap">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search name, email, phone..."
                      value={search}
                      onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                      className="pl-8 h-8 text-xs w-[200px]"
                    />
                  </div>
                  <Select value={riskFilter} onValueChange={(v) => { setRiskFilter(v); setPage(1); }}>
                    <SelectTrigger className="h-8 text-xs w-[120px]"><SelectValue placeholder="Risk Level" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Levels</SelectItem>
                      <SelectItem value="CRITICAL">Critical</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="LOW">Low</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={areaFilter} onValueChange={(v) => { setAreaFilter(v); setPage(1); }}>
                    <SelectTrigger className="h-8 text-xs w-[120px]"><SelectValue placeholder="Area" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Areas</SelectItem>
                      {uniqueAreas.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={planFilter} onValueChange={(v) => { setPlanFilter(v); setPage(1); }}>
                    <SelectTrigger className="h-8 text-xs w-[120px]"><SelectValue placeholder="Plan" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Plans</SelectItem>
                      {uniquePlans.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    placeholder="Min score"
                    value={minScore}
                    onChange={(e) => { setMinScore(e.target.value); setPage(1); }}
                    className="h-8 text-xs w-[80px]"
                    min="0"
                    max="100"
                  />
                  {(search || riskFilter !== "ALL" || areaFilter !== "ALL" || planFilter !== "ALL" || minScore !== "0") && (
                    <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={resetFilters}>
                      <X className="h-3 w-3 mr-1" /> Clear
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs cursor-pointer select-none" onClick={() => handleSort("name")}>
                        Subscriber <ArrowUpDown className="h-3 w-3 inline ml-1" />
                      </TableHead>
                      <TableHead className="text-xs cursor-pointer select-none" onClick={() => handleSort("planName")}>
                        Plan <ArrowUpDown className="h-3 w-3 inline ml-1" />
                      </TableHead>
                      <TableHead className="text-xs cursor-pointer select-none" onClick={() => handleSort("areaName")}>
                        Area <ArrowUpDown className="h-3 w-3 inline ml-1" />
                      </TableHead>
                      <TableHead className="text-xs cursor-pointer select-none" onClick={() => handleSort("riskScore")}>
                        Risk Score <ArrowUpDown className="h-3 w-3 inline ml-1" />
                      </TableHead>
                      <TableHead className="text-xs cursor-pointer select-none" onClick={() => handleSort("riskLevel")}>
                        Level <ArrowUpDown className="h-3 w-3 inline ml-1" />
                      </TableHead>
                      <TableHead className="text-xs">Key Factors</TableHead>
                      <TableHead className="text-xs text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedSubscribers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-sm text-muted-foreground">
                          No subscribers match current filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      pagedSubscribers.map((sub) => {
                        const config = RISK_LEVEL_CONFIG[sub.riskLevel] || RISK_LEVEL_CONFIG.LOW;
                        const topFactors = getTopFactors(sub.factors);

                        return (
                          <TableRow
                            key={sub.id}
                            className="hover:bg-muted/30 transition-colors"
                          >
                            <TableCell>
                              <div>
                                <p className="text-sm font-medium">{sub.name}</p>
                                <p className="text-[11px] text-muted-foreground">{sub.phone}</p>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">{sub.planName}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{sub.areaName}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Progress
                                  value={sub.riskScore}
                                  className={cn("h-2 w-20", config.progress)}
                                />
                                <span className={cn("text-xs font-bold tabular-nums min-w-[28px]", config.text)}>
                                  {sub.riskScore}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", config.bg, config.text, config.border)}
                              >
                                <span className={cn("inline-block w-1.5 h-1.5 rounded-full mr-1", config.dot)} />
                                {sub.riskLevel}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="max-w-[200px]">
                                {topFactors.slice(0, 2).map((f, i) => (
                                  <p key={i} className="text-[10px] text-muted-foreground truncate">
                                    {f}
                                  </p>
                                ))}
                                {topFactors.length > 2 && (
                                  <p className="text-[10px] text-muted-foreground/60">+{topFactors.length - 2} more</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                className={cn(
                                  "text-xs h-7 gap-1",
                                  sub.riskLevel === "CRITICAL" || sub.riskLevel === "HIGH"
                                    ? "border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/30"
                                    : "border-amber-200 text-amber-600 hover:bg-amber-50 dark:border-amber-800 dark:hover:bg-amber-950/30"
                                )}
                                onClick={() => openActionDialog(sub)}
                              >
                                <Eye className="h-3 w-3" /> Take Action
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t mt-3">
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-muted-foreground">
                      Showing {showingFrom}–{showingTo} of {filteredSubscribers.length}
                    </p>
                    <Select
                      value={String(pageSize)}
                      onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}
                    >
                      <SelectTrigger className="h-7 text-xs w-[70px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[10, 15, 25, 50].map((s) => (
                          <SelectItem key={s} value={String(s)}>{s}/page</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" className="h-7 px-2" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pn: number;
                      if (totalPages <= 5) pn = i + 1;
                      else if (page <= 3) pn = i + 1;
                      else if (page >= totalPages - 2) pn = totalPages - 4 + i;
                      else pn = page - 2 + i;
                      return (
                        <Button
                          key={pn}
                          variant={page === pn ? "default" : "outline"}
                          size="sm"
                          className="h-7 w-7 p-0 text-xs"
                          onClick={() => setPage(pn)}
                        >
                          {pn}
                        </Button>
                      );
                    })}
                    <Button variant="outline" size="sm" className="h-7 px-2" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}

      {/* ── Retention Action Dialog ── */}
      <Dialog open={actionDialog.open} onOpenChange={(open) => { if (!open) closeActionDialog(); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-red-600" />
              Retention Action
            </DialogTitle>
          </DialogHeader>

          {actionDialog.subscriber && (
            <div className="space-y-4">
              {/* Subscriber info */}
              <div className="rounded-lg border p-3 bg-muted/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{actionDialog.subscriber.name}</p>
                    <p className="text-xs text-muted-foreground">{actionDialog.subscriber.phone} · {actionDialog.subscriber.planName}</p>
                  </div>
                  <div className="text-right">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded-full",
                        RISK_LEVEL_CONFIG[actionDialog.subscriber.riskLevel]?.bg,
                        RISK_LEVEL_CONFIG[actionDialog.subscriber.riskLevel]?.text,
                        RISK_LEVEL_CONFIG[actionDialog.subscriber.riskLevel]?.border,
                      )}
                    >
                      {actionDialog.subscriber.riskLevel} ({actionDialog.subscriber.riskScore}/100)
                    </Badge>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {getTopFactors(actionDialog.subscriber.factors).map((f, i) => (
                    <Badge key={i} variant="outline" className="text-[9px] border-red-200 text-red-600 bg-red-50 dark:bg-red-950/20 dark:border-red-800 dark:text-red-400">
                      {f}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Communication History */}
              {showCommHistory && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Previous Actions
                  </p>
                  {commHistory.length > 0 ? (
                    <div className="max-h-36 overflow-y-auto custom-scrollbar space-y-1.5">
                      {commHistory.slice(0, 10).map((c) => (
                        <div key={c.id} className="flex items-start gap-2 p-2 rounded-lg bg-muted/30 border text-[11px]">
                          <MessageSquare className="h-3 w-3 text-teal-600 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className="text-[9px] px-1 py-0">{c.actionType.replace(/_/g, " ")}</Badge>
                              <span className="text-muted-foreground">
                                {new Date(c.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                              </span>
                            </div>
                            {c.note && <p className="text-muted-foreground mt-0.5 truncate">{c.note}</p>}
                            <p className="text-muted-foreground/60 mt-0.5">by {c.createdBy}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-2">No previous actions</p>
                  )}
                </div>
              )}

              <div className="h-px bg-border" />

              {/* Action Form */}
              <div className="space-y-3">
                <div>
                  <Label className="text-xs font-medium">Action Type</Label>
                  <Select value={actionType} onValueChange={setActionType}>
                    <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GENERAL_REMINDER">Payment Reminder</SelectItem>
                      <SelectItem value="DISCOUNT">Apply Discount</SelectItem>
                      <SelectItem value="CALLBACK">Schedule Callback</SelectItem>
                      <SelectItem value="RETENTION_MESSAGE">Send Retention Message</SelectItem>
                      <SelectItem value="PLAN_UPGRADE">Suggest Plan Upgrade</SelectItem>
                      <SelectItem value="PAYMENT_PLAN">Offer Payment Plan</SelectItem>
                      <SelectItem value="SPECIAL_OFFER">Special Offer</SelectItem>
                      <SelectItem value="ESCALATION">Escalate to Manager</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {actionType === "DISCOUNT" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-medium">Discount Type</Label>
                      <Select value={discountType} onValueChange={setDiscountType}>
                        <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PERCENTAGE">Percentage (%)</SelectItem>
                          <SelectItem value="FLAT">Flat Amount (INR)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs font-medium">
                        {discountType === "PERCENTAGE" ? "Percentage" : "Amount (INR)"}
                      </Label>
                      <Input
                        type="number"
                        value={discountValue}
                        onChange={(e) => setDiscountValue(e.target.value)}
                        className="h-9 mt-1"
                        placeholder={discountType === "PERCENTAGE" ? "e.g. 10" : "e.g. 200"}
                        min="0"
                      />
                    </div>
                  </div>
                )}

                {(actionType === "RETENTION_MESSAGE" || actionType === "SPECIAL_OFFER") && (
                  <div>
                    <Label className="text-xs font-medium">Channel</Label>
                    <Select value={actionChannel} onValueChange={setActionChannel}>
                      <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="IN_APP">In-App</SelectItem>
                        <SelectItem value="SMS">SMS</SelectItem>
                        <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                        <SelectItem value="EMAIL">Email</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div>
                  <Label className="text-xs font-medium">Notes</Label>
                  <Textarea
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    placeholder="Add notes about this retention action..."
                    rows={3}
                    className="mt-1 text-sm"
                  />
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={closeActionDialog}>Cancel</Button>
                <Button
                  className="bg-red-600 hover:bg-red-700 text-white gap-1.5"
                  disabled={retentionMutation.isPending}
                  onClick={handleSaveAction}
                >
                  {retentionMutation.isPending ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  Save Action
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────

function getTopFactors(factors: RiskFactors): string[] {
  const all: string[] = [
    ...factors.paymentDetails,
    ...factors.complaintDetails,
    ...factors.tenureDetails,
    ...factors.engagementDetails,
    ...factors.balanceDetails,
  ];
  return all.filter((v, i, arr) => arr.indexOf(v) === i);
}
