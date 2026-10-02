"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { formatINR } from "@/lib/utils";
import {
  BarChart3, TrendingUp, TrendingDown, CreditCard, Users, IndianRupee,
  AlertTriangle, CheckCircle2, AlertCircle, Shield, Award, Target,
  Zap, ChevronUp, ChevronDown, Minus, Eye, Loader2, Ban,
  ArrowUpRight, ArrowDownRight, Crown, Medal, Trophy,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

// ─── Types ─────────────────────────────────────────────────────
interface ResellerAnalytics {
  id: string;
  name: string;
  code: string;
  status: string;
  phone: string;
  email: string;
  areaNames: string[];
  totalSubscribers: number;
  activeSubscribers: number;
  inactiveSubscribers: number;
  churnRate: number;
  revenueContribution: number;
  mrrContribution: number;
  newSubscribersThisMonth: number;
  newSubscribersLastMonth: number;
  subscriberGrowth: number;
  earnedCommission: number;
  paidCommission: number;
  pendingCommission: number;
  creditLimit: number;
  creditUsed: number;
  creditAvailable: number;
  creditUtilization: number;
  performanceScore: number;
  commissionRate: number;
  monthlyTarget: number;
}

interface CommissionDetail {
  id: string;
  name: string;
  code: string;
  status: string;
  subscriberCount: number;
  revenue: number;
  monthlyTarget: number;
  churnRate: number;
  commissionCalculationMethod: string;
  baseRate: number;
  totalRate: number;
  volumeBonus: number;
  performanceBonus: number;
  retentionBonus: number;
  simpleCommission: number;
  tieredCommission: number;
  bonusEarnings: number;
  totalEarned: number;
  totalPaid: number;
  payoutHistory: PayoutEntry[];
}

interface PayoutEntry {
  id: string;
  resellerId?: string;
  resellerName?: string;
  period: string;
  subscriberCount: number;
  revenue: number;
  commissionRate: number;
  commissionAmount: number;
  status: string;
  paidOn: string | null;
  createdAt: string;
}

interface CreditReseller {
  id: string;
  name: string;
  code: string;
  status: string;
  phone: string;
  email: string;
  creditLimit: number;
  creditUsed: number;
  creditAvailable: number;
  utilization: number;
  isOverLimit: boolean;
  riskLevel: string;
  totalSubscribers: number;
  totalCommission: number;
}

interface CreditTrend {
  month: string;
  totalLimit: number;
  totalUsed: number;
  totalAvailable: number;
  averageUtilization: number;
  resellerCount: number;
  overLimitCount: number;
}

// ─── Helpers ───────────────────────────────────────────────────
function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-teal-600";
  if (score >= 40) return "text-amber-600";
  return "text-red-600";
}

function scoreBg(score: number): string {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-teal-500";
  if (score >= 40) return "bg-amber-500";
  return "bg-red-500";
}

function scoreGrade(score: number): string {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B+";
  if (score >= 60) return "B";
  if (score >= 50) return "C";
  if (score >= 40) return "D";
  return "F";
}

function riskBadge(level: string) {
  const styles: Record<string, string> = {
    HIGH: "bg-red-100 text-red-700 border-red-200",
    MEDIUM: "bg-amber-100 text-amber-700 border-amber-200",
    LOW: "bg-emerald-100 text-emerald-700 border-emerald-200",
  };
  return <Badge variant="outline" className={styles[level] || ""}>{level}</Badge>;
}

function StatusIcon({ status }: { status: string }) {
  if (status === "PAID") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (status === "PENDING") return <AlertCircle className="h-4 w-4 text-amber-600" />;
  return <Ban className="h-4 w-4 text-red-600" />;
}

function CircularProgress({ value, size = 40, strokeWidth = 4 }: { value: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(100, Math.max(0, value)) / 100;
  const offset = circumference - progress * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-muted/30" />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className={scoreBg(value)} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
      <text x={size / 2} y={size / 2} className="fill-foreground text-[10px] font-bold" textAnchor="middle" dominantBaseline="central" transform={`rotate(90 ${size / 2} ${size / 2})`}>
        {Math.round(value)}
      </text>
    </svg>
  );
}

function CreditGauge({ utilization, size = 56 }: { utilization: number; size?: number }) {
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(100, Math.max(0, utilization)) / 100;
  const offset = circumference - progress * circumference;
  const color = utilization > 90 ? "stroke-red-500" : utilization > 70 ? "stroke-amber-500" : "stroke-emerald-500";

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={5} className="text-muted/20" />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={5} className={color} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
    </svg>
  );
}

function StatCard({ title, value, subtitle, icon: Icon, color = "text-foreground" }: {
  title: string; value: string | number; subtitle?: string; icon: React.ElementType; color?: string;
}) {
  return (
    <Card className="border shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
            <p className={`text-xl font-bold mt-1 tabular-nums ${color}`}>{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <div className="p-2 rounded-lg bg-muted"><Icon className="h-4 w-4 text-muted-foreground" /></div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Loading Skeleton ──────────────────────────────────────────
function LoadingState() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────
export function ResellerAnalyticsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");
  const [payoutStatusFilter, setPayoutStatusFilter] = useState("ALL");
  const [creditDialogOpen, setCreditDialogOpen] = useState(false);
  const [creditReseller, setCreditReseller] = useState<CreditReseller | null>(null);
  const [newCreditLimit, setNewCreditLimit] = useState("");
  const [creditReason, setCreditReason] = useState("");

  // Queries
  const { data: analyticsData, isLoading: analyticsLoading } = useQuery({
    queryKey: ["reseller-analytics"],
    queryFn: () => apiFetch("/api/resellers/analytics"),
  });

  const { data: commissionData, isLoading: commissionLoading } = useQuery({
    queryKey: ["reseller-commission-engine"],
    queryFn: () => apiFetch("/api/resellers/commission-engine"),
    enabled: activeTab === "commission",
  });

  const { data: creditData, isLoading: creditLoading } = useQuery({
    queryKey: ["reseller-credit"],
    queryFn: () => apiFetch("/api/resellers/credit"),
    enabled: activeTab === "credit" || activeTab === "overview",
  });

  // Process payout mutation
  const processPayoutMutation = useMutation({
    mutationFn: async (resellerId: string) => {
      const now = new Date();
      const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      return apiFetch("/api/resellers/commission-engine", {
        method: "POST",
        body: JSON.stringify({ resellerId, period }),
      });
    },
    onSuccess: (data) => {
      if (data.success) toast.success(data.message);
      else toast.error(data.error || "Failed");
      queryClient.invalidateQueries({ queryKey: ["reseller-commission-engine"] });
    },
    onError: () => toast.error("Failed to process payout"),
  });

  const processAllPayoutsMutation = useMutation({
    mutationFn: async () => {
      if (!commissionData?.resellers) return;
      const now = new Date();
      const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const results = [];
      for (const r of commissionData.resellers as CommissionDetail[]) {
        try {
          const res = await apiFetch("/api/resellers/commission-engine", {
            method: "POST",
            body: JSON.stringify({ resellerId: r.id, period }),
          });
          results.push(res);
        } catch { /* skip failed */ }
      }
      return results;
    },
    onSuccess: () => {
      toast.success("Payout processing initiated for all resellers");
      queryClient.invalidateQueries({ queryKey: ["reseller-commission-engine"] });
    },
    onError: () => toast.error("Failed to process some payouts"),
  });

  // Adjust credit mutation
  const adjustCreditMutation = useMutation({
    mutationFn: (body: { resellerId: string; newLimit: number; reason: string }) =>
      apiFetch("/api/resellers/credit", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message);
        setCreditDialogOpen(false);
        setCreditReseller(null);
        setNewCreditLimit("");
        setCreditReason("");
        queryClient.invalidateQueries({ queryKey: ["reseller-credit"] });
        queryClient.invalidateQueries({ queryKey: ["reseller-analytics"] });
      } else {
        toast.error(data.error || "Failed to adjust credit");
      }
    },
    onError: () => toast.error("Failed to adjust credit limit"),
  });

  // Type assertions
  const analytics = analyticsData as {
    summary: {
      totalResellers: number;
      activeResellers: number;
      trialResellers: number;
      suspendedResellers: number;
      totalMrr: number;
      totalRevenue: number;
      avgCommissionRate: number;
      totalEarnedCommission: number;
      totalPendingPayouts: number;
      avgPerformanceScore: number;
    };
    resellers: ResellerAnalytics[];
    topByRevenue: ResellerAnalytics[];
    monthlyGrowth: Array<{ month: string; newSubscribers: number; byReseller: Array<{ resellerId: string; name: string; count: number }> }>;
    monthlyRevenue: Array<{ month: string; totalRevenue: number; byReseller: Array<{ resellerId: string; name: string; revenue: number }> }>;
  } | undefined;

  const commission = commissionData as {
    rules: {
      tiers: Array<{ threshold: string; bonus: string; description: string }>;
      performance: { condition: string; bonus: string; description: string };
      retention: { condition: string; bonus: string; description: string };
    };
    resellers: CommissionDetail[];
    summary: {
      totalSimpleCommission: number;
      totalTieredCommission: number;
      totalBonusEarnings: number;
      averageBonusPercent: number;
      totalResellers: number;
      eligibleForBonus: number;
    };
    payoutHistory: PayoutEntry[];
  } | undefined;

  const credit = creditData as {
    summary: {
      totalCreditLimit: number;
      totalCreditUsed: number;
      totalCreditAvailable: number;
      overallUtilization: number;
      averageUtilization: number;
      totalResellers: number;
      overLimitCount: number;
      highRiskCount: number;
      riskDistribution: Record<string, number>;
    };
    resellers: CreditReseller[];
    overLimitResellers: CreditReseller[];
    highRiskResellers: CreditReseller[];
    creditTrend: CreditTrend[];
  } | undefined;

  const resellers: ResellerAnalytics[] = analytics?.resellers || [];
  const topByRevenue: ResellerAnalytics[] = analytics?.topByRevenue || [];
  const commissionResellers: CommissionDetail[] = commission?.resellers || [];
  const payoutHistory: PayoutEntry[] = commission?.payoutHistory || [];
  const creditResellers: CreditReseller[] = credit?.resellers || [];
  const overLimitResellers: CreditReseller[] = credit?.overLimitResellers || [];
  const creditTrend: CreditTrend[] = credit?.creditTrend || [];
  const maxRevenue = topByRevenue.length > 0 ? Math.max(...topByRevenue.map((r) => r.revenueContribution)) : 1;

  const filteredPayouts = payoutStatusFilter === "ALL"
    ? payoutHistory
    : payoutHistory.filter((p) => p.status === payoutStatusFilter);

  // Sort resellers for best/worst
  const bestReseller = resellers.length > 0 ? [...resellers].sort((a, b) => b.performanceScore - a.performanceScore)[0] : null;
  const worstReseller = resellers.length > 0 ? [...resellers].sort((a, b) => a.performanceScore - b.performanceScore)[0] : null;

  const openCreditDialog = (r: CreditReseller) => {
    setCreditReseller(r);
    setNewCreditLimit(String(r.creditLimit));
    setCreditReason("");
    setCreditDialogOpen(true);
  };

  const handleAdjustCredit = () => {
    if (!creditReseller || !newCreditLimit) return;
    const limit = Number(newCreditLimit);
    if (isNaN(limit) || limit < 0) {
      toast.error("Invalid credit limit");
      return;
    }
    adjustCreditMutation.mutate({
      resellerId: creditReseller.id,
      newLimit: limit,
      reason: creditReason || "Manual adjustment",
    });
  };

  if (analyticsLoading && activeTab === "overview") return <LoadingState />;
  if (commissionLoading && activeTab === "commission") return <LoadingState />;
  if (creditLoading && activeTab === "credit") return <LoadingState />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Reseller Intelligence Hub</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Multi-tenant analytics, commission engine, credit management & growth insights</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" className="text-xs sm:text-sm">Overview</TabsTrigger>
          <TabsTrigger value="commission" className="text-xs sm:text-sm">Commission Engine</TabsTrigger>
          <TabsTrigger value="credit" className="text-xs sm:text-sm">Credit Mgmt</TabsTrigger>
          <TabsTrigger value="growth" className="text-xs sm:text-sm">Growth Analysis</TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════
            TAB 1: OVERVIEW
        ═══════════════════════════════════════════════════════ */}
        <TabsContent value="overview" className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Total Resellers" value={analytics?.summary.totalResellers || 0} subtitle={`${analytics?.summary.trialResellers || 0} on trial`} icon={Users} />
            <StatCard title="Total MRR" value={formatINR(analytics?.summary.totalMrr || 0)} subtitle="via reseller network" icon={IndianRupee} color="text-emerald-600" />
            <StatCard title="Avg Commission" value={`${analytics?.summary.avgCommissionRate || 0}%`} subtitle={`Pending: ${formatINR(analytics?.summary.totalPendingPayouts || 0)}`} icon={TrendingUp} color="text-teal-600" />
            <StatCard title="Active / Trial" value={`${analytics?.summary.activeResellers || 0} / ${analytics?.summary.trialResellers || 0}`} subtitle={`${analytics?.summary.suspendedResellers || 0} suspended`} icon={Award} />
          </div>

          {/* Top Resellers by Revenue */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-teal-600" />
                Top Resellers by Revenue Contribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topByRevenue.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No revenue data available</p>
              ) : (
                <div className="space-y-3">
                  {topByRevenue.slice(0, 8).map((r, idx) => (
                    <div key={r.id} className="flex items-center gap-3">
                      <span className="w-6 text-xs font-bold text-muted-foreground text-right">{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium truncate">{r.name}</span>
                          <span className="text-xs font-semibold tabular-nums text-teal-700">{formatINR(r.revenueContribution)}</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div
                            className="h-2 rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-500"
                            style={{ width: `${maxRevenue > 0 ? (r.revenueContribution / maxRevenue) * 100 : 0}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{r.activeSubscribers} active · {r.totalSubscribers} total subs</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Performance Table */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Reseller Performance Dashboard</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-medium uppercase">Reseller</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Subscribers</TableHead>
                      <TableHead className="text-xs font-medium uppercase">MRR</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Commission</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Credit Util</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resellers.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground text-sm">No resellers found</TableCell></TableRow>
                    ) : (
                      resellers.map((r) => (
                        <TableRow key={r.id} className="hover:bg-muted/50">
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                                {r.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{r.name}</p>
                                <p className="text-[10px] text-muted-foreground">{r.status}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <p className="text-sm tabular-nums">{r.activeSubscribers}/{r.totalSubscribers}</p>
                            <p className="text-[10px] text-muted-foreground">churn: {r.churnRate}%</p>
                          </TableCell>
                          <TableCell className="text-sm tabular-nums font-medium">{formatINR(r.mrrContribution)}</TableCell>
                          <TableCell>
                            <p className="text-sm tabular-nums">{formatINR(r.earnedCommission)}</p>
                            <p className="text-[10px] text-amber-600">{formatINR(r.pendingCommission)} pending</p>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <CreditGauge utilization={r.creditUtilization} size={32} />
                              <span className="text-xs tabular-nums font-medium">{Math.round(r.creditUtilization)}%</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <CircularProgress value={r.performanceScore} size={36} />
                              <span className={`text-xs font-bold ${scoreColor(r.performanceScore)}`}>{scoreGrade(r.performanceScore)}</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════
            TAB 2: COMMISSION ENGINE
        ═══════════════════════════════════════════════════════ */}
        <TabsContent value="commission" className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Simple Commission" value={formatINR(commission?.summary.totalSimpleCommission || 0)} subtitle="Base rate only" icon={IndianRupee} />
            <StatCard title="Tiered Commission" value={formatINR(commission?.summary.totalTieredCommission || 0)} subtitle="With all bonuses" icon={TrendingUp} color="text-emerald-600" />
            <StatCard title="Bonus Earnings" value={formatINR(commission?.summary.totalBonusEarnings || 0)} subtitle={`Avg +${commission?.summary.averageBonusPercent || 0}%`} icon={Zap} color="text-teal-600" />
            <StatCard title="Eligible for Bonus" value={`${commission?.summary.eligibleForBonus || 0}/${commission?.summary.totalResellers || 0}`} subtitle="Resellers with bonuses" icon={Award} />
          </div>

          {/* Commission Rules */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Target className="h-4 w-4 text-amber-600" />
                Commission Tier Rules
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Volume Tiers */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Volume Bonus</p>
                  {commission?.rules.tiers.map((tier, i) => (
                    <div key={i} className="flex items-center gap-2 p-2.5 rounded-lg border bg-muted/30">
                      <div className={`h-7 w-7 rounded-md flex items-center justify-center text-[10px] font-bold text-white shrink-0 ${i === 0 ? "bg-amber-500" : i === 1 ? "bg-teal-500" : "bg-emerald-500"}`}>
                        {tier.bonus.replace("+", "")}
                      </div>
                      <div>
                        <p className="text-xs font-medium">{tier.threshold}</p>
                        <p className="text-[10px] text-muted-foreground">{tier.description}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Performance Bonus */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Performance Bonus</p>
                  <div className="flex items-center gap-2 p-2.5 rounded-lg border bg-emerald-50 dark:bg-emerald-950/20">
                    <div className="h-7 w-7 rounded-md flex items-center justify-center text-[10px] font-bold text-white shrink-0 bg-emerald-500">+3%</div>
                    <div>
                      <p className="text-xs font-medium">{commission?.rules.performance.condition}</p>
                      <p className="text-[10px] text-muted-foreground">{commission?.rules.performance.description}</p>
                    </div>
                  </div>
                </div>

                {/* Retention Bonus */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Retention Bonus</p>
                  <div className="flex items-center gap-2 p-2.5 rounded-lg border bg-teal-50 dark:bg-teal-950/20">
                    <div className="h-7 w-7 rounded-md flex items-center justify-center text-[10px] font-bold text-white shrink-0 bg-teal-500">+2%</div>
                    <div>
                      <p className="text-xs font-medium">{commission?.rules.retention.condition}</p>
                      <p className="text-[10px] text-muted-foreground">{commission?.rules.retention.description}</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Commission Comparison Table */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">Commission Comparison: Simple vs Tiered</CardTitle>
                <Button
                  size="sm"
                  className="bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs"
                  onClick={() => processAllPayoutsMutation.mutate()}
                  disabled={processAllPayoutsMutation.isPending}
                >
                  {processAllPayoutsMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Zap className="h-3 w-3 mr-1" />}
                  Process All Payouts
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-medium uppercase">Reseller</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-center">Base Rate</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-center">Volume</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-center">Perf.</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-center">Retention</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-center">Total Rate</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-right">Monthly Commission</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-right">Bonus</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commissionResellers.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground text-sm">No commission data</TableCell></TableRow>
                    ) : (
                      commissionResellers.map((r) => (
                        <TableRow key={r.id} className="hover:bg-muted/50">
                          <TableCell>
                            <p className="text-sm font-medium">{r.name}</p>
                            <p className="text-[10px] text-muted-foreground">{r.subscriberCount} subs · {formatINR(r.revenue)}</p>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="font-semibold tabular-nums">{r.baseRate}%</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            {r.volumeBonus > 0 ? (
                              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 font-semibold tabular-nums">+{r.volumeBonus}%</Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {r.performanceBonus > 0 ? (
                              <Badge className="bg-teal-100 text-teal-700 border-teal-200 font-semibold tabular-nums">+{r.performanceBonus}%</Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {r.retentionBonus > 0 ? (
                              <Badge className="bg-amber-100 text-amber-700 border-amber-200 font-semibold tabular-nums">+{r.retentionBonus}%</Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge className="bg-red-100 text-red-700 border-red-200 font-bold tabular-nums">{r.totalRate}%</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <p className="text-sm font-semibold tabular-nums">{formatINR(r.tieredCommission)}</p>
                            <p className="text-[10px] text-muted-foreground line-through">{formatINR(r.simpleCommission)}</p>
                          </TableCell>
                          <TableCell className="text-right">
                            {r.bonusEarnings > 0 ? (
                              <span className="text-xs font-bold text-emerald-600 tabular-nums">+{formatINR(r.bonusEarnings)}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">₹0</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Payout History */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">Payout History</CardTitle>
                <Select value={payoutStatusFilter} onValueChange={setPayoutStatusFilter}>
                  <SelectTrigger className="w-32 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Status</SelectItem>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="PAID">Paid</SelectItem>
                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-medium uppercase">Reseller</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Period</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Subs</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Revenue</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Rate</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Amount</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Status</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPayouts.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground text-sm">No payout records</TableCell></TableRow>
                    ) : (
                      filteredPayouts.slice(0, 50).map((p) => (
                        <TableRow key={p.id} className="hover:bg-muted/50">
                          <TableCell className="text-sm font-medium">{p.resellerName || "Unknown"}</TableCell>
                          <TableCell className="text-sm tabular-nums">{p.period}</TableCell>
                          <TableCell className="text-sm tabular-nums">{p.subscriberCount}</TableCell>
                          <TableCell className="text-sm tabular-nums">{formatINR(p.revenue)}</TableCell>
                          <TableCell className="text-sm tabular-nums">{p.commissionRate}%</TableCell>
                          <TableCell className="text-sm tabular-nums font-semibold">{formatINR(p.commissionAmount)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <StatusIcon status={p.status} />
                              <Badge variant="outline" className={
                                p.status === "PAID" ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                                p.status === "PENDING" ? "bg-amber-100 text-amber-700 border-amber-200" :
                                "bg-red-100 text-red-700 border-red-200"
                              }>{p.status}</Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{p.paidOn ? new Date(p.paidOn).toLocaleDateString("en-IN") : "—"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════
            TAB 3: CREDIT MANAGEMENT
        ═══════════════════════════════════════════════════════ */}
        <TabsContent value="credit" className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Total Credit Limit" value={formatINR(credit?.summary.totalCreditLimit || 0)} subtitle={`${credit?.summary.totalResellers || 0} resellers`} icon={CreditCard} />
            <StatCard title="Credit Used" value={formatINR(credit?.summary.totalCreditUsed || 0)} subtitle={`${credit?.summary.overallUtilization || 0}% utilized`} icon={TrendingUp} color="text-amber-600" />
            <StatCard title="Available Credit" value={formatINR(credit?.summary.totalCreditAvailable || 0)} subtitle={`Avg ${credit?.summary.averageUtilization || 0}% utilization`} icon={Shield} color="text-emerald-600" />
            <StatCard title="Risk Alerts" value={credit?.summary.highRiskCount || 0} subtitle={`${credit?.summary.overLimitCount || 0} over-limit`} icon={AlertTriangle} color="text-red-600" />
          </div>

          {/* Over-Limit Alerts */}
          {overLimitResellers.length > 0 && (
            <Card className="border-2 border-red-200 bg-red-50/50 dark:bg-red-950/10 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2 text-red-700">
                  <AlertTriangle className="h-4 w-4" />
                  Over-Limit Resellers ({overLimitResellers.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {overLimitResellers.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg border border-red-200 bg-white dark:bg-card">
                      <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                        <Ban className="h-5 w-5 text-red-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{r.name}</p>
                        <p className="text-xs text-muted-foreground">{r.phone}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-red-600 font-semibold tabular-nums">
                            Used: {formatINR(r.creditUsed)} / {formatINR(r.creditLimit)}
                          </span>
                          <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200 text-[10px]">
                            OVER BY {formatINR(r.creditUsed - r.creditLimit)}
                          </Badge>
                        </div>
                      </div>
                      <Button size="sm" variant="outline" className="text-xs shrink-0" onClick={() => openCreditDialog(r)}>
                        Adjust
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Credit Gauges Grid */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-teal-600" />
                Credit Utilization by Reseller
              </CardTitle>
            </CardHeader>
            <CardContent>
              {creditResellers.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No credit data available</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {creditResellers.map((r) => (
                    <div
                      key={r.id}
                      className={`p-3 rounded-lg border transition-all hover:shadow-sm cursor-pointer ${
                        r.isOverLimit ? "border-red-200 bg-red-50/50" :
                        r.riskLevel === "HIGH" ? "border-amber-200 bg-amber-50/30" :
                        "hover:border-border"
                      }`}
                      onClick={() => openCreditDialog(r)}
                    >
                      <div className="flex flex-col items-center gap-2">
                        <CreditGauge utilization={r.utilization} size={52} />
                        <div className="text-center">
                          <p className="text-xs font-semibold truncate max-w-full">{r.name}</p>
                          <p className={`text-sm font-bold tabular-nums ${
                            r.utilization > 90 ? "text-red-600" :
                            r.utilization > 70 ? "text-amber-600" :
                            "text-emerald-600"
                          }`}>{Math.round(r.utilization)}%</p>
                          <p className="text-[10px] text-muted-foreground">
                            {formatINR(r.creditUsed)} / {formatINR(r.creditLimit)}
                          </p>
                        </div>
                        <div className="w-full">
                          <Progress
                            value={r.utilization}
                            className={`h-1.5 ${
                              r.utilization > 90 ? "[&>div]:bg-red-500" :
                              r.utilization > 70 ? "[&>div]:bg-amber-500" :
                              "[&>div]:bg-emerald-500"
                            }`}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Risk Assessment Table */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Risk Assessment</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-medium uppercase">Reseller</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Credit Limit</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Used</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Available</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Utilization</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Risk</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Subs</TableHead>
                      <TableHead className="text-xs font-medium uppercase text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {creditResellers.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground text-sm">No credit data</TableCell></TableRow>
                    ) : (
                      creditResellers.map((r) => (
                        <TableRow key={r.id} className={`hover:bg-muted/50 ${r.isOverLimit ? "bg-red-50/30" : ""}`}>
                          <TableCell>
                            <p className="text-sm font-medium">{r.name}</p>
                            <p className="text-[10px] text-muted-foreground">{r.status}</p>
                          </TableCell>
                          <TableCell className="text-sm tabular-nums">{formatINR(r.creditLimit)}</TableCell>
                          <TableCell className="text-sm tabular-nums font-medium">{formatINR(r.creditUsed)}</TableCell>
                          <TableCell className="text-sm tabular-nums">{formatINR(r.creditAvailable)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="w-16">
                                <Progress
                                  value={Math.min(100, r.utilization)}
                                  className={`h-1.5 ${
                                    r.utilization > 90 ? "[&>div]:bg-red-500" :
                                    r.utilization > 70 ? "[&>div]:bg-amber-500" :
                                    "[&>div]:bg-emerald-500"
                                  }`}
                                />
                              </div>
                              <span className={`text-xs font-semibold tabular-nums ${
                                r.utilization > 90 ? "text-red-600" :
                                r.utilization > 70 ? "text-amber-600" :
                                "text-emerald-600"
                              }`}>{Math.round(r.utilization)}%</span>
                            </div>
                          </TableCell>
                          <TableCell>{riskBadge(r.riskLevel)}</TableCell>
                          <TableCell className="text-sm tabular-nums">{r.totalSubscribers}</TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => openCreditDialog(r)}>
                              Adjust
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Credit Trend */}
          {creditTrend.length > 0 && (
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-teal-600" />
                  Credit Trend (Last 6 Months)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {creditTrend.map((t) => (
                    <div key={t.month} className="flex items-center gap-4">
                      <span className="w-16 text-xs font-medium text-muted-foreground shrink-0">{t.month}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="flex-1 bg-muted rounded-full h-3 relative overflow-hidden">
                            <div className="h-3 rounded-full bg-teal-500" style={{ width: `${t.totalLimit > 0 ? Math.min(100, (t.totalUsed / t.totalLimit) * 100) : 0}%` }} />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-[9px] font-bold text-white drop-shadow">{t.totalLimit > 0 ? Math.round((t.totalUsed / t.totalLimit) * 100) : 0}%</span>
                            </div>
                          </div>
                          <span className="text-xs tabular-nums text-muted-foreground w-24 text-right">{formatINR(t.totalUsed)}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          Limit: {formatINR(t.totalLimit)} · Available: {formatINR(t.totalAvailable)} · Over-limit: {t.overLimitCount}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Adjust Credit Dialog */}
          <Dialog open={creditDialogOpen} onOpenChange={setCreditDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adjust Credit Limit</DialogTitle>
                <DialogDescription>
                  Update credit limit for <span className="font-semibold">{creditReseller?.name}</span>
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                {creditReseller && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 rounded-lg border bg-muted/30">
                        <p className="text-[10px] text-muted-foreground uppercase">Current Limit</p>
                        <p className="text-lg font-bold tabular-nums">{formatINR(creditReseller.creditLimit)}</p>
                      </div>
                      <div className="p-3 rounded-lg border bg-muted/30">
                        <p className="text-[10px] text-muted-foreground uppercase">Current Usage</p>
                        <p className="text-lg font-bold tabular-nums text-amber-600">{formatINR(creditReseller.creditUsed)}</p>
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="new-limit">New Credit Limit (₹)</Label>
                      <Input
                        id="new-limit"
                        type="number"
                        value={newCreditLimit}
                        onChange={(e) => setNewCreditLimit(e.target.value)}
                        min={0}
                        className="mt-1"
                      />
                      {Number(newCreditLimit) < creditReseller.creditUsed && (
                        <p className="text-xs text-red-600 mt-1">
                          Cannot set below current usage ({formatINR(creditReseller.creditUsed)})
                        </p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="reason">Reason for Adjustment</Label>
                      <Textarea
                        id="reason"
                        value={creditReason}
                        onChange={(e) => setCreditReason(e.target.value)}
                        placeholder="Enter reason for credit limit change..."
                        className="mt-1"
                        rows={2}
                      />
                    </div>
                  </>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreditDialogOpen(false)}>Cancel</Button>
                <Button
                  className="bg-[#DC2626] hover:bg-[#B91C1C] text-white"
                  onClick={handleAdjustCredit}
                  disabled={adjustCreditMutation.isPending || !newCreditLimit || Number(newCreditLimit) < (creditReseller?.creditUsed || 0)}
                >
                  {adjustCreditMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                  Update Limit
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════
            TAB 4: GROWTH ANALYSIS
        ═══════════════════════════════════════════════════════ */}
        <TabsContent value="growth" className="space-y-4">
          {/* Best / Worst Reseller Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bestReseller && (
              <Card className="border-2 border-emerald-200 bg-emerald-50/30 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center">
                      <Crown className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-emerald-600">Best Performer</p>
                      <p className="text-lg font-bold">{bestReseller.name}</p>
                    </div>
                    <div className="ml-auto text-right">
                      <CircularProgress value={bestReseller.performanceScore} size={48} strokeWidth={5} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <div><p className="text-[10px] text-muted-foreground">Subscribers</p><p className="text-sm font-bold tabular-nums">{bestReseller.totalSubscribers}</p></div>
                    <div><p className="text-[10px] text-muted-foreground">MRR</p><p className="text-sm font-bold tabular-nums">{formatINR(bestReseller.mrrContribution)}</p></div>
                    <div><p className="text-[10px] text-muted-foreground">Churn</p><p className="text-sm font-bold tabular-nums">{bestReseller.churnRate}%</p></div>
                  </div>
                </CardContent>
              </Card>
            )}
            {worstReseller && (
              <Card className="border-2 border-red-200 bg-red-50/30 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center">
                      <AlertTriangle className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-red-600">Needs Attention</p>
                      <p className="text-lg font-bold">{worstReseller.name}</p>
                    </div>
                    <div className="ml-auto text-right">
                      <CircularProgress value={worstReseller.performanceScore} size={48} strokeWidth={5} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <div><p className="text-[10px] text-muted-foreground">Subscribers</p><p className="text-sm font-bold tabular-nums">{worstReseller.totalSubscribers}</p></div>
                    <div><p className="text-[10px] text-muted-foreground">MRR</p><p className="text-sm font-bold tabular-nums">{formatINR(worstReseller.mrrContribution)}</p></div>
                    <div><p className="text-[10px] text-muted-foreground">Churn</p><p className="text-sm font-bold tabular-nums text-red-600">{worstReseller.churnRate}%</p></div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Subscriber Growth Chart */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-teal-600" />
                Subscriber Growth by Reseller (Last 6 Months)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {analytics?.monthlyGrowth && analytics.monthlyGrowth.length > 0 ? (
                <div className="space-y-3">
                  {analytics.monthlyGrowth.map((m) => {
                    const topInMonth = [...(m.byReseller || [])].sort((a, b) => b.count - a.count).slice(0, 5);
                    const maxCount = Math.max(...(m.byReseller || []).map((b) => b.count), 1);
                    return (
                      <div key={m.month} className="border rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold">{m.month}</span>
                          <Badge variant="outline" className="text-xs tabular-nums">{m.newSubscribers} new</Badge>
                        </div>
                        {topInMonth.length > 0 ? topInMonth.map((r) => (
                          <div key={r.resellerId} className="flex items-center gap-2 mb-1 last:mb-0">
                            <span className="w-24 text-[11px] text-muted-foreground truncate shrink-0">{r.name}</span>
                            <div className="flex-1 bg-muted rounded-full h-2">
                              <div className="h-2 rounded-full bg-gradient-to-r from-teal-400 to-emerald-500" style={{ width: `${(r.count / maxCount) * 100}%` }} />
                            </div>
                            <span className="text-[11px] font-semibold tabular-nums w-8 text-right">{r.count}</span>
                          </div>
                        )) : (
                          <p className="text-xs text-muted-foreground">No new subscribers</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">No growth data available</p>
              )}
            </CardContent>
          </Card>

          {/* Revenue Growth Chart */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <IndianRupee className="h-4 w-4 text-amber-600" />
                Revenue Growth by Reseller (Last 6 Months)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {analytics?.monthlyRevenue && analytics.monthlyRevenue.length > 0 ? (
                <div className="space-y-3">
                  {analytics.monthlyRevenue.map((m) => {
                    const topRev = [...(m.byReseller || [])].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
                    const maxRev = Math.max(...(m.byReseller || []).map((b) => b.revenue), 1);
                    return (
                      <div key={m.month} className="border rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold">{m.month}</span>
                          <span className="text-xs font-semibold tabular-nums text-teal-700">{formatINR(m.totalRevenue)}</span>
                        </div>
                        {topRev.length > 0 ? topRev.map((r) => (
                          <div key={r.resellerId} className="flex items-center gap-2 mb-1 last:mb-0">
                            <span className="w-24 text-[11px] text-muted-foreground truncate shrink-0">{r.name}</span>
                            <div className="flex-1 bg-muted rounded-full h-2">
                              <div className="h-2 rounded-full bg-gradient-to-r from-amber-400 to-teal-500" style={{ width: `${maxRev > 0 ? (r.revenue / maxRev) * 100 : 0}%` }} />
                            </div>
                            <span className="text-[11px] font-semibold tabular-nums w-20 text-right">{formatINR(r.revenue)}</span>
                          </div>
                        )) : (
                          <p className="text-xs text-muted-foreground">No revenue data</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">No revenue data available</p>
              )}
            </CardContent>
          </Card>

          {/* Churn Comparison */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                Churn Rate Comparison
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-medium uppercase">Reseller</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Total</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Active</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Inactive</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Churn Rate</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Growth</TableHead>
                      <TableHead className="text-xs font-medium uppercase">Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resellers.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground text-sm">No data</TableCell></TableRow>
                    ) : (
                      [...resellers].sort((a, b) => a.churnRate - b.churnRate).map((r) => (
                        <TableRow key={r.id} className="hover:bg-muted/50">
                          <TableCell>
                            <p className="text-sm font-medium">{r.name}</p>
                          </TableCell>
                          <TableCell className="text-sm tabular-nums">{r.totalSubscribers}</TableCell>
                          <TableCell className="text-sm tabular-nums text-emerald-600">{r.activeSubscribers}</TableCell>
                          <TableCell className="text-sm tabular-nums text-red-600">{r.inactiveSubscribers}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress
                                value={Math.min(100, r.churnRate)}
                                className={`h-1.5 w-16 ${r.churnRate > 30 ? "[&>div]:bg-red-500" : r.churnRate > 15 ? "[&>div]:bg-amber-500" : "[&>div]:bg-emerald-500"}`}
                              />
                              <span className={`text-xs font-semibold tabular-nums ${r.churnRate > 30 ? "text-red-600" : r.churnRate > 15 ? "text-amber-600" : "text-emerald-600"}`}>
                                {r.churnRate}%
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {r.subscriberGrowth > 0 ? (
                                <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" />
                              ) : r.subscriberGrowth < 0 ? (
                                <ArrowDownRight className="h-3.5 w-3.5 text-red-600" />
                              ) : (
                                <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                              )}
                              <span className={`text-xs font-semibold tabular-nums ${r.subscriberGrowth > 0 ? "text-emerald-600" : r.subscriberGrowth < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                                {r.subscriberGrowth > 0 ? "+" : ""}{r.subscriberGrowth}%
                              </span>
                              <span className="text-[10px] text-muted-foreground">({r.newSubscribersThisMonth} new)</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <CircularProgress value={r.performanceScore} size={32} />
                              <span className={`text-xs font-bold ${scoreColor(r.performanceScore)}`}>{scoreGrade(r.performanceScore)}</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Default export required by page-loaders' dynamic imports and the
// all-pages/extended-pages default imports.
export default ResellerAnalyticsPage;
