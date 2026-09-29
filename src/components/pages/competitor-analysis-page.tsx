"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3, TrendingUp, TrendingDown, DollarSign, Target, GitCompare,
  Trophy, AlertTriangle, CheckCircle2, ArrowDownRight, ArrowUpRight, Minus,
  Loader2, RefreshCw, Filter, PieChart, Calendar, Brain, Zap, ShieldAlert,
  ChevronDown, ChevronUp, Eye,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart as RechartsPieChart, Pie, Cell, Legend, LineChart, Line, ComposedChart, Area,
} from "recharts";
import { toast } from "sonner";
import { apiFetch, formatINR } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────

interface ComparisonData {
  ourPlans: { id: string; name: string; category: string; downloadSpeed: number; uploadSpeed: number; price: number; dataLimitGb: number | null; valueScore: number }[];
  competitors: { name: string; planCount: number; avgPrice: number; minPrice: number; maxPrice: number }[];
  comparisonMatrix: {
    tier: string;
    ourPlans: { id: string; name: string; category: string; downloadSpeed: number; uploadSpeed: number; price: number; dataLimitGb: number | null; valueScore: number }[];
    ourAvgPrice: number;
    ourMinPrice: number;
    ourMaxPrice: number;
    ourAvgMbps: number;
    ourValueScore: number;
    competitorBreakdown: { name: string; planCount: number; avgPrice: number; minPrice: number; maxPrice: number; planNames: string[]; priceAdvantage: number }[];
    marketAvgPrice: number;
    priceAdvantage: number;
    cheapestVs: number;
    expensiveVs: number;
    competitiveVs: number;
    totalCompetitorsInTier: number;
  }[];
  insights: string[];
}

interface MarketShareData {
  competitors: { name: string; wins: number; losses: number; total: number; winRate: number; topWinReasons: { reason: string; count: number }[]; topLossReasons: { reason: string; count: number }[] }[];
  winLossTrend: { label: string; year: number; month: number; wins: number; losses: number }[];
  topReasons: { win: { reason: string; count: number }[]; loss: { reason: string; count: number }[] };
  marketShare: { name: string; share: number; subscribers: number }[];
  summary: {
    totalCompetitorsTracked: number;
    totalCompetitorPlans: number;
    totalRecords: number;
    totalWins: number;
    totalLosses: number;
    overallWinRate: number;
    ourActiveSubscribers: number;
    ourMarketShare: number;
  };
}

interface PricingIntelligenceData {
  priceMovements: {
    name: string; planCount: number; avgCurrentPrice: number;
    latestChanges: { planName: string; speed: string; oldPrice: number; newPrice: number; changedAt: string; direction: string }[];
    priceIncreases: number; priceDecreases: number; avgChangePercent: number; trend: string;
  }[];
  priceGapAnalysis: { tier: string; ourAvgPrice: number; competitorAvgPrice: number; gapPercent: number; status: string; ourPlanCount: number; competitorPlanCount: number }[];
  overallGapPercent: number;
  monthlyAcquisition: { month: string; year: number; monthNum: number; newSubscribers: number; lostToCompetitor: number; netChange: number }[];
  recommendations: { id: string; type: string; priority: string; plan: string; currentPrice: number; suggestedPrice: number; competitor: string; reason: string; potentialImpact: string }[];
  summary: {
    totalCompetitors: number; competitorsIncreasing: number; competitorsDecreasing: number; competitorsStable: number;
    ourAvgPrice: number; marketAvgPrice: number; overpricedTiers: number; competitiveTiers: number; underpricedTiers: number; highPriorityActions: number;
  };
}

interface WinLossRecord {
  id: string; subscriberId: string; competitorId: string; competitorName: string;
  result: string; reason: string; notes: string; createdAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────

const PIE_COLORS = ["#DC2626", "#0D9488", "#D97706", "#059669", "#EA580C", "#7C3AED", "#EC4899", "#0891B2"];
const GAP_COLORS = { OVERPRICED: "#DC2626", COMPETITIVE: "#D97706", UNDERPRICED: "#059669" };

// ─── Main Component ───────────────────────────────────────────────────────

export default function CompetitorAnalysisPage() {
  const [activeTab, setActiveTab] = useState("market");

  // Queries
  const { data: comparison, isLoading: compLoading, refetch: refetchComp } = useQuery<ComparisonData>({
    queryKey: ["competitor-comparison"],
    queryFn: () => apiFetch<ComparisonData>("/api/competitors/comparison"),
  });

  const { data: marketShare, isLoading: msLoading, refetch: refetchMs } = useQuery<MarketShareData>({
    queryKey: ["competitor-market-share"],
    queryFn: () => apiFetch<MarketShareData>("/api/competitors/market-share"),
  });

  const { data: pricingIntel, isLoading: piLoading, refetch: refetchPi } = useQuery<PricingIntelligenceData>({
    queryKey: ["competitor-pricing-intelligence"],
    queryFn: () => apiFetch<PricingIntelligenceData>("/api/competitors/pricing-intelligence"),
  });

  const { data: winLossRecords, isLoading: wlLoading, refetch: refetchWl } = useQuery<WinLossRecord[]>({
    queryKey: ["win-loss-records"],
    queryFn: () => apiFetch<WinLossRecord[]>("/api/competitors/win-loss"),
  });

  const refetchAll = () => {
    refetchComp();
    refetchMs();
    refetchPi();
    refetchWl();
    toast.success("Data refreshed");
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Competitor Analysis Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Advanced competitive intelligence with automated analysis</p>
        </div>
        <Button variant="outline" className="gap-1.5" onClick={refetchAll}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="market" className="gap-1.5">
            <Target className="h-3.5 w-3.5" /> Market Overview
          </TabsTrigger>
          <TabsTrigger value="comparison" className="gap-1.5">
            <GitCompare className="h-3.5 w-3.5" /> Plan Comparison
          </TabsTrigger>
          <TabsTrigger value="pricing" className="gap-1.5">
            <DollarSign className="h-3.5 w-3.5" /> Pricing Intel
          </TabsTrigger>
          <TabsTrigger value="winloss" className="gap-1.5">
            <Trophy className="h-3.5 w-3.5" /> Win/Loss Analysis
          </TabsTrigger>
        </TabsList>

        {/* ─── MARKET OVERVIEW TAB ────────────────────────────────────── */}
        <TabsContent value="market">
          {msLoading ? (
            <div className="space-y-4"><Skeleton className="h-32" /><Skeleton className="h-64" /><Skeleton className="h-48" /></div>
          ) : marketShare ? (
            <MarketOverviewTab data={marketShare} />
          ) : (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No market share data available</CardContent></Card>
          )}
        </TabsContent>

        {/* ─── PLAN COMPARISON TAB ───────────────────────────────────── */}
        <TabsContent value="comparison">
          {compLoading ? (
            <div className="space-y-4"><Skeleton className="h-32" /><Skeleton className="h-64" /><Skeleton className="h-48" /></div>
          ) : comparison ? (
            <PlanComparisonTab data={comparison} />
          ) : (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No comparison data available</CardContent></Card>
          )}
        </TabsContent>

        {/* ─── PRICING INTELLIGENCE TAB ──────────────────────────────── */}
        <TabsContent value="pricing">
          {piLoading ? (
            <div className="space-y-4"><Skeleton className="h-32" /><Skeleton className="h-64" /><Skeleton className="h-48" /></div>
          ) : pricingIntel ? (
            <PricingIntelligenceTab data={pricingIntel} />
          ) : (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No pricing intelligence data available</CardContent></Card>
          )}
        </TabsContent>

        {/* ─── WIN/LOSS ANALYSIS TAB ─────────────────────────────────── */}
        <TabsContent value="winloss">
          {wlLoading ? (
            <div className="space-y-4"><Skeleton className="h-32" /><Skeleton className="h-64" /><Skeleton className="h-48" /></div>
          ) : (
            <WinLossAnalysisTab records={winLossRecords || []} marketShare={marketShare} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── MARKET OVERVIEW TAB ──────────────────────────────────────────────────

function MarketOverviewTab({ data }: { data: MarketShareData }) {
  const { summary, competitors, winLossTrend, marketShare, topReasons } = data;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Competitors Tracked</p>
                <p className="text-2xl font-bold mt-1">{summary.totalCompetitorsTracked}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-red-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{summary.totalCompetitorPlans} plans tracked</p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Our Market Share</p>
                <p className="text-2xl font-bold mt-1">{summary.ourMarketShare}%</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-teal-50 dark:bg-teal-950/30 flex items-center justify-center">
                <Target className="h-5 w-5 text-teal-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{summary.ourActiveSubscribers} active subscribers</p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Overall Win Rate</p>
                <p className="text-2xl font-bold mt-1">{summary.overallWinRate}%</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
                <Trophy className="h-5 w-5 text-amber-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{summary.totalWins}W / {summary.totalLosses}L of {summary.totalRecords}</p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Total Engagements</p>
                <p className="text-2xl font-bold mt-1">{summary.totalRecords}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
                <PieChart className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Win/loss records</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Win/Loss Trend Chart */}
        <Card className="border shadow-sm lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-red-600" /> Win/Loss Trend (6 months)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={winLossTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis dataKey="label" tick={{ fill: "#94A3B8", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: "12px" }} />
                  <Bar dataKey="wins" name="Wins" fill="#059669" radius={[4, 4, 0, 0]} barSize={24} />
                  <Bar dataKey="losses" name="Losses" fill="#DC2626" radius={[4, 4, 0, 0]} barSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Market Share Pie */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <PieChart className="h-4 w-4 text-teal-600" /> Market Share
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={marketShare}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="share"
                    nameKey="name"
                    label={({ name, share }) => `${name.split(" ")[0]} ${share}%`}
                  >
                    {marketShare.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => `${value}%`} />
                </RechartsPieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Competitor Cards */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Eye className="h-4 w-4 text-red-600" /> Competitor Profiles
          </CardTitle>
        </CardHeader>
        <CardContent>
          {competitors.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No competitor engagement data yet. Report win/loss events to populate this section.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {competitors.map((comp) => (
                <Card key={comp.name} className="border bg-muted/20 shadow-sm">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">{comp.name}</h3>
                      <Badge variant={comp.winRate >= 50 ? "default" : "destructive"} className="text-xs">
                        {comp.winRate}% WR
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-lg font-bold text-emerald-600">{comp.wins}</p>
                        <p className="text-[10px] text-muted-foreground">Wins</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-red-600">{comp.losses}</p>
                        <p className="text-[10px] text-muted-foreground">Losses</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold">{comp.total}</p>
                        <p className="text-[10px] text-muted-foreground">Total</p>
                      </div>
                    </div>
                    {comp.topLossReasons.length > 0 && (
                      <div>
                        <p className="text-[10px] text-muted-foreground font-medium mb-1">Top Loss Reasons</p>
                        {comp.topLossReasons.map((r, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <span className="text-red-500">•</span>
                            <span className="truncate">{r.reason}</span>
                            <Badge variant="outline" className="text-[10px] ml-auto shrink-0">{r.count}</Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── PLAN COMPARISON TAB ──────────────────────────────────────────────────

function PlanComparisonTab({ data }: { data: ComparisonData }) {
  const [expandedTier, setExpandedTier] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Our Active Plans</p>
                <p className="text-2xl font-bold mt-1">{data.ourPlans.length}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
                <GitCompare className="h-5 w-5 text-red-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">vs {data.competitors.length} competitors</p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Avg Our Price</p>
                <p className="text-2xl font-bold mt-1">
                  {data.ourPlans.length > 0 ? formatINR(Math.round(data.ourPlans.reduce((s, p) => s + p.price, 0) / data.ourPlans.length)) : "N/A"}
                </p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-teal-50 dark:bg-teal-950/30 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-teal-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Across all active plans</p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Speed Tiers</p>
                <p className="text-2xl font-bold mt-1">{data.comparisonMatrix.filter(m => m.ourPlans.length > 0).length}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-amber-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">With active plans</p>
          </CardContent>
        </Card>
      </div>

      {/* Comparison Matrix */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <GitCompare className="h-4 w-4 text-red-600" /> Plan Comparison Matrix
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Speed Tier</TableHead>
                  <TableHead className="text-xs text-center">Our Avg Price</TableHead>
                  <TableHead className="text-xs text-center">Market Avg</TableHead>
                  <TableHead className="text-xs text-center">Advantage</TableHead>
                  <TableHead className="text-xs text-center">Value Score</TableHead>
                  <TableHead className="text-xs">Competitors in Tier</TableHead>
                  <TableHead className="text-xs text-center">Position</TableHead>
                  <TableHead className="text-xs w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.comparisonMatrix.map((row) => (
                  <React.Fragment key={row.tier}>
                    <TableRow
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => setExpandedTier(expandedTier === row.tier ? null : row.tier)}
                    >
                      <TableCell className="text-sm font-medium">{row.tier}</TableCell>
                      <TableCell className="text-sm text-center font-semibold">{formatINR(row.ourAvgPrice)}</TableCell>
                      <TableCell className="text-sm text-center">{formatINR(row.marketAvgPrice)}</TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="outline"
                          className={`text-xs font-semibold ${
                            row.priceAdvantage > 5
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : row.priceAdvantage < -5
                                ? "bg-red-50 text-red-700 border-red-200"
                                : "bg-amber-50 text-amber-700 border-amber-200"
                          }`}
                        >
                          {row.priceAdvantage > 0 ? "+" : ""}
                          {row.priceAdvantage}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-center font-mono">{row.ourValueScore}/Mbps</TableCell>
                      <TableCell className="text-sm">
                        <Badge variant="outline" className="text-xs">{row.totalCompetitorsInTier}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          {row.cheapestVs > 0 && <Badge className="bg-emerald-500 text-white text-[10px] px-1.5">Cheapest x{row.cheapestVs}</Badge>}
                          {row.competitiveVs > 0 && <Badge className="bg-amber-500 text-white text-[10px] px-1.5">Competitive x{row.competitiveVs}</Badge>}
                          {row.expensiveVs > 0 && <Badge className="bg-red-500 text-white text-[10px] px-1.5">Pricier x{row.expensiveVs}</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        {expandedTier === row.tier ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </TableCell>
                    </TableRow>

                    {/* Expanded detail */}
                    {expandedTier === row.tier && (
                      <TableRow>
                        <TableCell colSpan={8} className="bg-muted/30 p-4">
                          <div className="space-y-4">
                            {/* Our plans in this tier */}
                            <div>
                              <h4 className="text-xs font-semibold text-muted-foreground mb-2">Our Plans</h4>
                              {row.ourPlans.length > 0 ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                  {row.ourPlans.map((p) => (
                                    <Card key={p.id} className="border bg-background shadow-sm p-3">
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-semibold">{p.name}</span>
                                        <Badge variant="outline" className="text-xs">{p.category}</Badge>
                                      </div>
                                      <div className="space-y-1 text-xs text-muted-foreground">
                                        <div className="flex justify-between">
                                          <span>{p.downloadSpeed} Mbps Down / {p.uploadSpeed} Mbps Up</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span>Price</span>
                                          <span className="font-semibold text-foreground">{formatINR(p.price)}/mo</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span>Value Score</span>
                                          <span className="font-mono font-semibold text-foreground">{p.valueScore}/Mbps</span>
                                        </div>
                                        {p.dataLimitGb && (
                                          <div className="flex justify-between">
                                            <span>Data Limit</span>
                                            <span className="font-semibold text-foreground">{p.dataLimitGb} GB</span>
                                          </div>
                                        )}
                                      </div>
                                    </Card>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">No plans in this tier</p>
                              )}
                            </div>

                            {/* Competitor breakdown */}
                            {row.competitorBreakdown.length > 0 && (
                              <div>
                                <h4 className="text-xs font-semibold text-muted-foreground mb-2">Competitor Comparison</h4>
                                <div className="overflow-x-auto">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead className="text-xs">Competitor</TableHead>
                                        <TableHead className="text-xs text-center">Plans</TableHead>
                                        <TableHead className="text-xs text-center">Avg Price</TableHead>
                                        <TableHead className="text-xs text-center">Min-Max</TableHead>
                                        <TableHead className="text-xs text-center">vs Us</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {row.competitorBreakdown.map((comp) => (
                                        <TableRow key={comp.name}>
                                          <TableCell className="text-sm font-medium">{comp.name}</TableCell>
                                          <TableCell className="text-sm text-center">{comp.planCount}</TableCell>
                                          <TableCell className="text-sm text-center font-semibold">{formatINR(comp.avgPrice)}</TableCell>
                                          <TableCell className="text-xs text-center text-muted-foreground">{formatINR(comp.minPrice)} - {formatINR(comp.maxPrice)}</TableCell>
                                          <TableCell className="text-center">
                                            <Badge
                                              variant="outline"
                                              className={`text-xs font-semibold ${
                                                comp.priceAdvantage > 5
                                                  ? "bg-red-50 text-red-700 border-red-200"
                                                  : comp.priceAdvantage < -5
                                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                    : "bg-amber-50 text-amber-700 border-amber-200"
                                              }`}
                                            >
                                              {comp.priceAdvantage > 0 ? "+" : ""}
                                              {comp.priceAdvantage}%
                                            </Badge>
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Insights Panel */}
      {data.insights.length > 0 && (
        <Card className="border shadow-sm bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Brain className="h-4 w-4 text-amber-600" /> Competitive Position Insights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {data.insights.map((insight, i) => (
                <li key={i} className="text-sm text-muted-foreground flex gap-2">
                  <span className="text-amber-500 mt-0.5 shrink-0">•</span>
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── PRICING INTELLIGENCE TAB ─────────────────────────────────────────────

function PricingIntelligenceTab({ data }: { data: PricingIntelligenceData }) {
  const { summary, priceGapAnalysis, monthlyAcquisition, recommendations, priceMovements } = data;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Price Gap vs Market</p>
                <p className={`text-2xl font-bold mt-1 ${summary.overallGapPercent > 5 ? "text-red-600" : summary.overallGapPercent < -5 ? "text-emerald-600" : "text-amber-600"}`}>
                  {summary.overallGapPercent > 0 ? "+" : ""}{summary.overallGapPercent}%
                </p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-red-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Our avg: {formatINR(summary.ourAvgPrice)} / Market: {formatINR(summary.marketAvgPrice)}</p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Overpriced Tiers</p>
                <p className="text-2xl font-bold text-red-600 mt-1">{summary.overpricedTiers}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
                <ArrowUpRight className="h-5 w-5 text-red-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Above market avg</p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Competitive Tiers</p>
                <p className="text-2xl font-bold text-amber-600 mt-1">{summary.competitiveTiers}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
                <Minus className="h-5 w-5 text-amber-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Within ±10% of market</p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">High Priority Actions</p>
                <p className="text-2xl font-bold text-red-600 mt-1">{summary.highPriorityActions}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Require attention</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Price Gap Analysis Chart */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-red-600" /> Price Gap by Speed Tier
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={priceGapAnalysis} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis type="number" tick={{ fill: "#94A3B8", fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                  <YAxis dataKey="tier" type="category" tick={{ fill: "#94A3B8", fontSize: 10 }} width={100} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                    formatter={(value: number, name: string) => [`${value}%`, "Price Gap"]}
                  />
                  <Bar dataKey="gapPercent" name="Price Gap %" radius={[0, 4, 4, 0]} barSize={20}>
                    {priceGapAnalysis.map((entry, i) => (
                      <Cell key={i} fill={GAP_COLORS[entry.status as keyof typeof GAP_COLORS] || "#D97706"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-center gap-4 mt-3">
              <div className="flex items-center gap-1.5 text-xs"><div className="w-3 h-3 rounded-sm bg-red-500" />Overpriced (&gt;10%)</div>
              <div className="flex items-center gap-1.5 text-xs"><div className="w-3 h-3 rounded-sm bg-amber-500" />Competitive (±10%)</div>
              <div className="flex items-center gap-1.5 text-xs"><div className="w-3 h-3 rounded-sm bg-emerald-500" />Underpriced (&lt;-10%)</div>
            </div>
          </CardContent>
        </Card>

        {/* Monthly Acquisition vs Losses */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-teal-600" /> Subscriber Acquisition Sensitivity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthlyAcquisition}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis dataKey="month" tick={{ fill: "#94A3B8", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: "12px" }} />
                  <Bar dataKey="newSubscribers" name="New Subscribers" fill="#059669" radius={[4, 4, 0, 0]} barSize={20} />
                  <Bar dataKey="lostToCompetitor" name="Lost to Competitor" fill="#DC2626" radius={[4, 4, 0, 0]} barSize={20} />
                  <Line dataKey="netChange" name="Net Change" stroke="#D97706" strokeWidth={2} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Competitor Price Movements */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-red-600" /> Competitor Price Movements
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Competitor</TableHead>
                  <TableHead className="text-xs text-center">Plans</TableHead>
                  <TableHead className="text-xs text-center">Avg Price</TableHead>
                  <TableHead className="text-xs text-center">Avg Change</TableHead>
                  <TableHead className="text-xs text-center">Increases</TableHead>
                  <TableHead className="text-xs text-center">Decreases</TableHead>
                  <TableHead className="text-xs text-center">Trend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {priceMovements.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-6 text-sm text-muted-foreground">No price movement data available</TableCell></TableRow>
                ) : (
                  priceMovements.map((comp) => (
                    <TableRow key={comp.name}>
                      <TableCell className="text-sm font-medium">{comp.name}</TableCell>
                      <TableCell className="text-sm text-center">{comp.planCount}</TableCell>
                      <TableCell className="text-sm text-center font-semibold">{formatINR(comp.avgCurrentPrice)}</TableCell>
                      <TableCell className="text-sm text-center">
                        <span className={`font-semibold ${comp.avgChangePercent > 0 ? "text-red-600" : comp.avgChangePercent < 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                          {comp.avgChangePercent > 0 ? "+" : ""}{comp.avgChangePercent}%
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-center">
                        {comp.priceIncreases > 0 && <Badge variant="outline" className="bg-red-50 text-red-700 text-xs border-red-200">{comp.priceIncreases}</Badge>}
                        {comp.priceIncreases === 0 && <span className="text-xs text-muted-foreground">0</span>}
                      </TableCell>
                      <TableCell className="text-sm text-center">
                        {comp.priceDecreases > 0 && <Badge variant="outline" className="bg-emerald-50 text-emerald-700 text-xs border-emerald-200">{comp.priceDecreases}</Badge>}
                        {comp.priceDecreases === 0 && <span className="text-xs text-muted-foreground">0</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="outline"
                          className={`text-xs font-semibold ${
                            comp.trend === "increasing"
                              ? "bg-red-50 text-red-700 border-red-200"
                              : comp.trend === "decreasing"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-amber-50 text-amber-700 border-amber-200"
                          }`}
                        >
                          {comp.trend === "increasing" && <TrendingUp className="h-3 w-3 mr-1" />}
                          {comp.trend === "decreasing" && <TrendingDown className="h-3 w-3 mr-1" />}
                          {comp.trend.charAt(0).toUpperCase() + comp.trend.slice(1)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pricing Recommendations */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-600" /> Pricing Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recommendations.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No pricing recommendations at this time</p>
          ) : (
            <div className="space-y-3">
              {recommendations.map((rec) => (
                <div
                  key={rec.id}
                  className={`rounded-lg border p-4 ${
                    rec.priority === "HIGH"
                      ? "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20"
                      : rec.priority === "MEDIUM"
                        ? "border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20"
                        : "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant={rec.priority === "HIGH" ? "destructive" : rec.priority === "MEDIUM" ? "default" : "secondary"}
                          className="text-[10px]"
                        >
                          {rec.priority}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {rec.type === "PRICE_REDUCTION" ? "Price Reduction" : rec.type === "PRICE_INCREASE" ? "Price Increase" : rec.type === "COMPETITOR_ALERT" ? "Competitor Alert" : "Opportunity"}
                        </Badge>
                        {rec.plan !== "All Tiers" && <Badge variant="outline" className="text-[10px]">{rec.plan}</Badge>}
                      </div>
                      <p className="text-sm">{rec.reason}</p>
                      {rec.currentPrice > 0 && (
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-muted-foreground">Current: <span className="font-semibold text-foreground">{formatINR(rec.currentPrice)}</span></span>
                          <ArrowDownRight className="h-3 w-3 text-emerald-600" />
                          <span className="text-emerald-600 font-semibold">Suggested: {formatINR(rec.suggestedPrice)}</span>
                        </div>
                      )}
                      {rec.competitor && rec.competitor !== "Market Average" && (
                        <p className="text-xs text-muted-foreground">Competitor: <span className="font-medium">{rec.competitor}</span></p>
                      )}
                      <p className="text-xs text-muted-foreground">{rec.potentialImpact}</p>
                    </div>
                    <Button
                      size="sm"
                      variant={rec.priority === "HIGH" ? "destructive" : "outline"}
                      className="shrink-0"
                      onClick={() => toast.success(`Recommendation "${rec.type}" noted for review`)}
                    >
                      Apply
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── WIN/LOSS ANALYSIS TAB ────────────────────────────────────────────────

function WinLossAnalysisTab({ records, marketShare }: { records: WinLossRecord[]; marketShare?: MarketShareData }) {
  const [competitorFilter, setCompetitorFilter] = useState<string>("ALL");
  const [resultFilter, setResultFilter] = useState<string>("ALL");

  const filteredRecords = records.filter(r => {
    const matchComp = competitorFilter === "ALL" || r.competitorName === competitorFilter;
    const matchResult = resultFilter === "ALL" || r.result === resultFilter;
    return matchComp && matchResult;
  });

  const competitorNames = [...new Set(records.map(r => r.competitorName))];

  const winReasons = records.filter(r => r.result === "WIN").reduce<Record<string, number>>((acc, r) => {
    const reason = r.reason || "Unspecified";
    acc[reason] = (acc[reason] || 0) + 1;
    return acc;
  }, {});

  const lossReasons = records.filter(r => r.result === "LOSS").reduce<Record<string, number>>((acc, r) => {
    const reason = r.reason || "Unspecified";
    acc[reason] = (acc[reason] || 0) + 1;
    return acc;
  }, {});

  const winPieData = Object.entries(winReasons).map(([name, value]) => ({ name, value }));
  const lossPieData = Object.entries(lossReasons).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Total Records</p>
                <p className="text-2xl font-bold mt-1">{records.length}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
                <PieChart className="h-5 w-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Wins</p>
                <p className="text-2xl font-bold text-emerald-600 mt-1">{records.filter(r => r.result === "WIN").length}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-medium">Losses</p>
                <p className="text-2xl font-bold text-red-600 mt-1">{records.filter(r => r.result === "LOSS").length}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
                <ShieldAlert className="h-5 w-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pie Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Win Reasons
            </CardTitle>
          </CardHeader>
          <CardContent>
            {winPieData.length > 0 ? (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Pie data={winPieData} cx="50%" cy="50%" outerRadius={80} paddingAngle={2} dataKey="value" nameKey="name" label={({ name, value }) => `${name}: ${value}`}>
                      {winPieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No win records yet</p>
            )}
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-red-600" /> Loss Reasons
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lossPieData.length > 0 ? (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Pie data={lossPieData} cx="50%" cy="50%" outerRadius={80} paddingAngle={2} dataKey="value" nameKey="name" label={({ name, value }) => `${name}: ${value}`}>
                      {lossPieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No loss records yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detailed Records Table */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Filter className="h-4 w-4 text-red-600" /> Detailed Records
            </CardTitle>
            <div className="flex gap-2">
              <Select value={competitorFilter} onValueChange={setCompetitorFilter}>
                <SelectTrigger className="h-8 text-xs w-[160px]"><SelectValue placeholder="Competitor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Competitors</SelectItem>
                  {competitorNames.map(name => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={resultFilter} onValueChange={setResultFilter}>
                <SelectTrigger className="h-8 text-xs w-[120px]"><SelectValue placeholder="Result" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Results</SelectItem>
                  <SelectItem value="WIN">Wins</SelectItem>
                  <SelectItem value="LOSS">Losses</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Subscriber</TableHead>
                  <TableHead className="text-xs">Competitor</TableHead>
                  <TableHead className="text-xs text-center">Result</TableHead>
                  <TableHead className="text-xs">Reason</TableHead>
                  <TableHead className="text-xs">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">
                      No records match your filters
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRecords.map((r) => (
                    <TableRow key={r.id} className="hover:bg-muted/50 transition-colors">
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{r.subscriberId}</TableCell>
                      <TableCell className="text-sm">{r.competitorName || "Unknown"}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={r.result === "WIN" ? "default" : "destructive"} className="text-xs">
                          {r.result === "WIN" ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <ShieldAlert className="h-3 w-3 mr-1" />}
                          {r.result}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{r.reason || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{r.notes || "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground mt-3">Showing {filteredRecords.length} of {records.length} records</p>
        </CardContent>
      </Card>
    </div>
  );
}
