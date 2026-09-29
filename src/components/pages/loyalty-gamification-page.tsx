"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Trophy, Award, Crown, Star, Shield, Users, Flame, Zap, Bird,
  Heart, Timer, ShieldCheck, TrendingUp, RefreshCw, Loader2,
  ChevronRight, CircleDot, BarChart3, Target, Gift,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/utils";
import { toast } from "sonner";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend, RadialBarChart, RadialBar,
} from "recharts";

// ─── Types ───────────────────────────────────────────────
interface TierInfo {
  name: string;
  minPoints: number | string;
  maxPoints: number | string;
  multiplier: number;
  discount: number;
  benefits: string[];
  memberCount: number;
}

interface TopEarner {
  rank: number;
  id: string;
  subscriberId: string;
  subscriberName: string;
  totalPoints: number;
  availablePoints: number;
  tier: string;
}

interface RedemptionTrend {
  month: string;
  label: string;
  count: number;
  points: number;
}

interface StreakMember {
  memberId: string;
  subscriberId: string;
  subscriberName: string;
  streakLength: number;
  streakLabel: string;
}

interface StreakAnalysis {
  members: StreakMember[];
  distribution: Record<string, number>;
  totalWithStreaks: number;
}

interface BadgeEarner {
  subscriberId: string;
  subscriberName: string;
  tier: string;
  totalPoints: number;
}

interface BadgeInfo {
  key: string;
  name: string;
  description: string;
  icon: string;
  earnedCount: number;
  earners: BadgeEarner[];
}

interface EnhancedData {
  tierDistribution: Record<string, number>;
  pointsEconomy: { totalEarned: number; totalRedeemed: number; totalAvailable: number; avgPerMember: number };
  engagement: { totalMembers: number; activeMembersLast30Days: number; redemptionRate: number };
  topEarners: TopEarner[];
  redemptionTrends: RedemptionTrend[];
  streakAnalysis: StreakAnalysis;
}

interface TiersData {
  tiers: TierInfo[];
  totalMembers: number;
}

interface BadgesData {
  badges: BadgeInfo[];
}

// ─── Tier Config ─────────────────────────────────────────
const TIER_CONFIG: Record<string, { color: string; bgGradient: string; borderColor: string; textColor: string; iconBg: string; icon: React.ElementType; progressColor: string }> = {
  Bronze: { color: "text-orange-700", bgGradient: "from-orange-50 to-amber-50", borderColor: "border-orange-200", textColor: "text-orange-600", iconBg: "bg-orange-100", icon: Shield, progressColor: "bg-orange-500" },
  Silver: { color: "text-gray-600", bgGradient: "from-gray-50 to-slate-100", borderColor: "border-gray-300", textColor: "text-gray-500", iconBg: "bg-gray-200", icon: Shield, progressColor: "bg-gray-500" },
  Gold: { color: "text-amber-700", bgGradient: "from-amber-50 to-yellow-50", borderColor: "border-amber-300", textColor: "text-amber-600", iconBg: "bg-amber-100", icon: Star, progressColor: "bg-amber-500" },
  Platinum: { color: "text-slate-700", bgGradient: "from-slate-100 to-gray-200", borderColor: "border-slate-400", textColor: "text-slate-600", iconBg: "bg-slate-300", icon: Crown, progressColor: "bg-slate-500" },
};

const TIER_THRESHOLD_POINTS: Record<string, { min: number; max: number }> = {
  Bronze: { min: 0, max: 999 },
  Silver: { min: 1000, max: 4999 },
  Gold: { min: 5000, max: 14999 },
  Platinum: { min: 15000, max: 999999 },
};

const BADGE_ICONS: Record<string, React.ElementType> = {
  Bird, Heart, Zap, Users, Flame, Crown, ShieldCheck, Timer,
};

const BADGE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  early_bird: { bg: "bg-sky-100", text: "text-sky-700", border: "border-sky-200" },
  loyal_customer: { bg: "bg-rose-100", text: "text-rose-700", border: "border-rose-200" },
  power_user: { bg: "bg-amber-100", text: "text-amber-700", border: "border-amber-200" },
  referral_champion: { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-200" },
  streak_master: { bg: "bg-red-100", text: "text-red-700", border: "border-red-200" },
  high_roller: { bg: "bg-purple-100", text: "text-purple-700", border: "border-purple-200" },
  zero_dues: { bg: "bg-teal-100", text: "text-teal-700", border: "border-teal-200" },
  quick_payer: { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-200" },
};

function getTierBadge(tier: string) {
  const cfg = TIER_CONFIG[tier] || TIER_CONFIG.Bronze;
  const Icon = cfg.icon;
  return (
    <Badge className={`${cfg.iconBg} ${cfg.color} border ${cfg.borderColor} text-[10px] font-semibold`}>
      <Icon className="h-3 w-3 mr-1" />{tier}
    </Badge>
  );
}

function getInitials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

const AVATAR_COLORS = ["bg-red-500", "bg-teal-500", "bg-amber-500", "bg-emerald-500", "bg-rose-500", "bg-orange-500"];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ─── Skeleton Loaders ──────────────────────────────────
function TierSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <Card key={i} className="border">
          <CardContent className="p-5 space-y-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-2 w-full" />
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function LeaderboardSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

// ─── Stat Card ──────────────────────────────────────────
function StatCard({ title, value, subtitle, icon: Icon, gradient }: {
  title: string; value: string | number; subtitle: string; icon: React.ElementType; gradient: string;
}) {
  return (
    <Card className={`${gradient} border-0 shadow-lg`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wider opacity-80">{title}</p>
            <p className="text-xl font-bold mt-1 tabular-nums">{value}</p>
            <p className="text-[11px] mt-0.5 opacity-75">{subtitle}</p>
          </div>
          <div className="p-2 rounded-xl bg-white/20 backdrop-blur-sm"><Icon className="h-4 w-4" /></div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ────────────────────────────────────
export default function LoyaltyGamificationPage() {
  const queryClient = useQueryClient();
  const [tierFilter, setTierFilter] = useState("ALL");
  const [selectedBadge, setSelectedBadge] = useState<BadgeInfo | null>(null);

  // API queries
  const { data: enhancedData, isLoading: enhancedLoading, refetch: refetchEnhanced } = useQuery<EnhancedData>({
    queryKey: ["loyalty-enhanced"],
    queryFn: () => apiFetch("/api/loyalty/enhanced"),
  });

  const { data: tiersData, isLoading: tiersLoading } = useQuery<TiersData>({
    queryKey: ["loyalty-tiers"],
    queryFn: () => apiFetch("/api/loyalty/tiers"),
  });

  const { data: badgesData, isLoading: badgesLoading } = useQuery<BadgesData>({
    queryKey: ["loyalty-badges"],
    queryFn: () => apiFetch("/api/loyalty/badges"),
  });

  const recalcMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/loyalty/tiers", { method: "PUT" });
      if (!res.success) throw new Error(res.error || "Failed");
      return res;
    },
    onSuccess: (data) => {
      toast.success(`Recalculated tiers for ${data.data?.recalculated || 0} members`);
      queryClient.invalidateQueries({ queryKey: ["loyalty-enhanced"] });
      queryClient.invalidateQueries({ queryKey: ["loyalty-tiers"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const data = enhancedData;
  const tiers = tiersData?.tiers || [];
  const badges = badgesData?.badges || [];

  // Points economy chart data
  const economyChartData = data ? [
    { name: "Earned", value: data.pointsEconomy.totalEarned, fill: "#0D9488" },
    { name: "Redeemed", value: data.pointsEconomy.totalRedeemed, fill: "#DC2626" },
    { name: "Available", value: data.pointsEconomy.totalAvailable, fill: "#F59E0B" },
  ] : [];

  // Redemption trends chart data
  const trendData = data?.redemptionTrends || [];

  // Filtered leaderboard
  const filteredEarners = (data?.topEarners || []).filter(
    (e) => tierFilter === "ALL" || e.tier === tierFilter
  );

  // Streak distribution chart data
  const streakDistData = data ? Object.entries(data.streakAnalysis.distribution).map(([name, count]) => ({
    name: name.replace(/\s*\(.*\)/, ""),
    count,
    fill: name.includes("Platinum") ? "#475569" : name.includes("Gold") ? "#F59E0B" : name.includes("Active") ? "#DC2626" : "#9CA3AF",
  })) : [];

  const isLoading = enhancedLoading || tiersLoading || badgesLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <TierSkeleton />
        <Skeleton className="h-10 w-full" />
        <LeaderboardSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Trophy className="h-7 w-7 text-amber-500" />
            Loyalty Gamification
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Tier overview, leaderboards, badges, streaks & analytics
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => recalcMutation.mutate()}
          disabled={recalcMutation.isPending}
          className="gap-1.5"
        >
          {recalcMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Recalculate Tiers
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Members"
          value={data?.engagement.totalMembers ?? 0}
          subtitle="Loyalty program"
          icon={Users}
          gradient="stat-gradient-red"
        />
        <StatCard
          title="Active (30d)"
          value={data?.engagement.activeMembersLast30Days ?? 0}
          subtitle="Earned recently"
          icon={Flame}
          gradient="stat-gradient-amber"
        />
        <StatCard
          title="Redemption Rate"
          value={`${data?.engagement.redemptionRate ?? 0}%`}
          subtitle="Members redeemed"
          icon={TrendingUp}
          gradient="stat-gradient-green"
        />
        <StatCard
          title="Avg Points"
          value={data?.pointsEconomy.avgPerMember ?? 0}
          subtitle="Per member"
          icon={Award}
          gradient="stat-gradient-purple"
        />
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="tiers" className="space-y-4">
        <TabsList className="bg-muted p-1 h-auto flex flex-wrap">
          <TabsTrigger value="tiers" className="text-xs sm:text-sm gap-1.5">
            <Crown className="h-3.5 w-3.5" />Tier Overview
          </TabsTrigger>
          <TabsTrigger value="leaderboard" className="text-xs sm:text-sm gap-1.5">
            <Trophy className="h-3.5 w-3.5" />Leaderboard
          </TabsTrigger>
          <TabsTrigger value="badges" className="text-xs sm:text-sm gap-1.5">
            <Award className="h-3.5 w-3.5" />Badges
          </TabsTrigger>
          <TabsTrigger value="streaks" className="text-xs sm:text-sm gap-1.5">
            <Flame className="h-3.5 w-3.5" />Streak Rewards
          </TabsTrigger>
          <TabsTrigger value="analytics" className="text-xs sm:text-sm gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />Analytics
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════ TIER OVERVIEW TAB ═══════════════ */}
        <TabsContent value="tiers" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {(tiers.length > 0 ? tiers : [
              { name: "Bronze", minPoints: 0, maxPoints: 999, multiplier: 1, discount: 0, benefits: ["1x points earning rate"], memberCount: data?.tierDistribution?.Bronze ?? 0 },
              { name: "Silver", minPoints: 1000, maxPoints: 4999, multiplier: 1.2, discount: 0, benefits: ["1.2x points earning rate", "Free support priority"], memberCount: data?.tierDistribution?.Silver ?? 0 },
              { name: "Gold", minPoints: 5000, maxPoints: 14999, multiplier: 1.5, discount: 5, benefits: ["1.5x points earning rate", "5% discount on add-ons", "Priority support"], memberCount: data?.tierDistribution?.Gold ?? 0 },
              { name: "Platinum", minPoints: 15000, maxPoints: "∞", multiplier: 2, discount: 10, benefits: ["2x points earning rate", "10% discount on all services", "Priority support", "Exclusive rewards access"], memberCount: data?.tierDistribution?.Platinum ?? 0 },
            ]).map((tier) => {
              const cfg = TIER_CONFIG[tier.name] || TIER_CONFIG.Bronze;
              const TierIcon = cfg.icon;
              const thresholds = TIER_THRESHOLD_POINTS[tier.name];
              const progressPct = thresholds ? Math.min(100, (tier.memberCount / Math.max(1, (data?.engagement.totalMembers ?? 1))) * 100) : 0;

              return (
                <Card
                  key={tier.name}
                  className={`bg-gradient-to-br ${cfg.bgGradient} border ${cfg.borderColor} hover:shadow-lg transition-all duration-300 hover:-translate-y-1`}
                >
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`p-2.5 rounded-xl ${cfg.iconBg}`}>
                        <TierIcon className={`h-6 w-6 ${cfg.color}`} />
                      </div>
                      <div>
                        <h3 className={`font-bold text-lg ${cfg.color}`}>{tier.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          {tier.minPoints} – {tier.maxPoints} pts
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mb-3">
                      <span className={`text-2xl font-bold ${cfg.color}`}>{tier.memberCount}</span>
                      <span className="text-xs text-muted-foreground">members</span>
                    </div>

                    <Progress value={progressPct} className={`h-1.5 ${cfg.progressColor}`} />

                    <div className="mt-4 space-y-1.5">
                      {tier.benefits.map((b, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <ChevronRight className={`h-3 w-3 ${cfg.color}`} />
                          <span className="text-xs text-foreground/80">{b}</span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 flex items-center gap-1.5">
                      <Badge variant="outline" className={`text-[10px] ${cfg.borderColor} ${cfg.color}`}>
                        {tier.multiplier}x multiplier
                      </Badge>
                      {tier.discount > 0 && (
                        <Badge variant="outline" className={`text-[10px] ${cfg.borderColor} ${cfg.color}`}>
                          {tier.discount}% off
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ═══════════════ LEADERBOARD TAB ═══════════════ */}
        <TabsContent value="leaderboard" className="space-y-4">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-amber-500" />
                    Top 10 Earners
                  </CardTitle>
                  <CardDescription>Highest total loyalty points</CardDescription>
                </div>
                <Select value={tierFilter} onValueChange={setTierFilter}>
                  <SelectTrigger className="w-full sm:w-40 h-9">
                    <SelectValue placeholder="Filter by tier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Tiers</SelectItem>
                    <SelectItem value="Bronze">Bronze</SelectItem>
                    <SelectItem value="Silver">Silver</SelectItem>
                    <SelectItem value="Gold">Gold</SelectItem>
                    <SelectItem value="Platinum">Platinum</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                {filteredEarners.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Trophy className="h-10 w-10 mb-2 opacity-30" />
                    <p className="text-sm">No earners found</p>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead className="sticky top-0 bg-background z-10">
                      <tr className="border-b">
                        <th className="text-left text-xs font-medium uppercase text-muted-foreground px-4 py-3 w-16">Rank</th>
                        <th className="text-left text-xs font-medium uppercase text-muted-foreground px-4 py-3">Member</th>
                        <th className="text-right text-xs font-medium uppercase text-muted-foreground px-4 py-3">Points</th>
                        <th className="text-right text-xs font-medium uppercase text-muted-foreground px-4 py-3 hidden sm:table-cell">Available</th>
                        <th className="text-center text-xs font-medium uppercase text-muted-foreground px-4 py-3">Tier</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEarners.map((earner) => {
                        const rankDisplay = earner.rank === 1 ? "🥇" : earner.rank === 2 ? "🥈" : earner.rank === 3 ? "🥉" : `#${earner.rank}`;
                        return (
                          <tr key={earner.id} className="border-b hover:bg-muted/50 transition-colors">
                            <td className="px-4 py-3">
                              <span className="text-sm font-bold w-8 flex items-center justify-center">
                                {rankDisplay}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className={`h-8 w-8 rounded-full ${getAvatarColor(earner.subscriberName)} flex items-center justify-center text-white text-xs font-bold`}>
                                  {getInitials(earner.subscriberName)}
                                </div>
                                <span className="text-sm font-medium truncate max-w-[160px]">{earner.subscriberName}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="text-sm font-bold text-amber-600 tabular-nums">
                                {earner.totalPoints.toLocaleString("en-IN")}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right hidden sm:table-cell">
                              <span className="text-sm text-muted-foreground tabular-nums">
                                {earner.availablePoints.toLocaleString("en-IN")}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {getTierBadge(earner.tier)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════ BADGES GALLERY TAB ═══════════════ */}
        <TabsContent value="badges" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {badges.map((badge) => {
              const colors = BADGE_COLORS[badge.key] || { bg: "bg-gray-100", text: "text-gray-700", border: "border-gray-200" };
              const BadgeIcon = BADGE_ICONS[badge.icon] || Award;
              return (
                <Card
                  key={badge.key}
                  className={`border ${colors.border} hover:shadow-lg transition-all duration-300 cursor-pointer hover:-translate-y-1 group`}
                  onClick={() => setSelectedBadge(badge)}
                >
                  <CardContent className="p-5 text-center">
                    <div className={`mx-auto p-4 rounded-2xl ${colors.bg} w-fit mb-3 group-hover:scale-110 transition-transform duration-300`}>
                      <BadgeIcon className={`h-8 w-8 ${colors.text}`} />
                    </div>
                    <h3 className={`font-bold text-sm ${colors.text}`}>{badge.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{badge.description}</p>
                    <div className="mt-3">
                      <Badge variant="outline" className={`text-[10px] ${colors.border} ${colors.text}`}>
                        {badge.earnedCount} earned
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Badge Detail Dialog */}
          <Dialog open={!!selectedBadge} onOpenChange={() => setSelectedBadge(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {selectedBadge && (() => {
                    const colors = BADGE_COLORS[selectedBadge.key] || { bg: "bg-gray-100", text: "text-gray-700" };
                    const BadgeIcon = BADGE_ICONS[selectedBadge.icon] || Award;
                    return (
                      <div className={`p-2 rounded-xl ${colors.bg}`}>
                        <BadgeIcon className={`h-5 w-5 ${colors.text}`} />
                      </div>
                    );
                  })()}
                  {selectedBadge?.name}
                </DialogTitle>
                <DialogDescription>{selectedBadge?.description}</DialogDescription>
              </DialogHeader>
              <div className="max-h-72 overflow-y-auto space-y-2 mt-2">
                {selectedBadge?.earners.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No members have earned this badge yet</p>
                ) : (
                  selectedBadge?.earners.map((earner) => (
                    <div key={earner.subscriberId} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
                      <div className="flex items-center gap-2.5">
                        <div className={`h-8 w-8 rounded-full ${getAvatarColor(earner.subscriberName)} flex items-center justify-center text-white text-xs font-bold`}>
                          {getInitials(earner.subscriberName)}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{earner.subscriberName}</p>
                          <p className="text-xs text-muted-foreground">{earner.totalPoints.toLocaleString("en-IN")} pts</p>
                        </div>
                      </div>
                      {getTierBadge(earner.tier)}
                    </div>
                  ))
                )}
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ═══════════════ STREAK REWARDS TAB ═══════════════ */}
        <TabsContent value="streaks" className="space-y-4">
          {/* Streak Leaders */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Flame className="h-5 w-5 text-red-500" />
                Streak Leaders
              </CardTitle>
              <CardDescription>Members with consecutive on-time payment streaks</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
                {(!data?.streakAnalysis.members || data.streakAnalysis.members.length === 0) ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Flame className="h-10 w-10 mb-2 opacity-30" />
                    <p className="text-sm">No active streaks yet</p>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead className="sticky top-0 bg-background z-10">
                      <tr className="border-b">
                        <th className="text-left text-xs font-medium uppercase text-muted-foreground px-4 py-3 w-12">#</th>
                        <th className="text-left text-xs font-medium uppercase text-muted-foreground px-4 py-3">Member</th>
                        <th className="text-center text-xs font-medium uppercase text-muted-foreground px-4 py-3">Streak</th>
                        <th className="text-center text-xs font-medium uppercase text-muted-foreground px-4 py-3">Level</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.streakAnalysis.members.slice(0, 20).map((m, i) => (
                        <tr key={m.memberId} className="border-b hover:bg-muted/50 transition-colors">
                          <td className="px-4 py-3 text-sm font-medium text-muted-foreground">{i + 1}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className={`h-8 w-8 rounded-full ${getAvatarColor(m.subscriberName)} flex items-center justify-center text-white text-xs font-bold`}>
                                {getInitials(m.subscriberName)}
                              </div>
                              <span className="text-sm font-medium">{m.subscriberName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-sm font-bold text-red-600">{m.streakLength} months</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge className={`text-[10px] font-semibold ${
                              m.streakLabel === "Platinum Streak" ? "bg-slate-700 text-white" :
                              m.streakLabel === "Gold Streak" ? "bg-amber-100 text-amber-700" :
                              "bg-red-100 text-red-700"
                            }`}>
                              {m.streakLabel}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Streak Distribution */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="h-5 w-5 text-teal-500" />
                  Streak Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                {streakDistData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={streakDistData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={120} />
                      <RechartsTooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                      />
                      <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                        {streakDistData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">No data</div>
                )}
              </CardContent>
            </Card>

            {/* Streak Summary Cards */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Streak Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-red-50 border border-red-100">
                  <div className="flex items-center gap-2">
                    <Flame className="h-4 w-4 text-red-500" />
                    <span className="text-sm font-medium">Active Streaks</span>
                  </div>
                  <span className="text-lg font-bold text-red-600">{data?.streakAnalysis.totalWithStreaks ?? 0}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-slate-100 border border-slate-200">
                  <div className="flex items-center gap-2">
                    <Crown className="h-4 w-4 text-slate-500" />
                    <span className="text-sm font-medium">Platinum (12+)</span>
                  </div>
                  <span className="text-lg font-bold text-slate-600">{data?.streakAnalysis.distribution["Platinum Streak (12+)"] ?? 0}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-amber-50 border border-amber-100">
                  <div className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-amber-500" />
                    <span className="text-sm font-medium">Gold (6+)</span>
                  </div>
                  <span className="text-lg font-bold text-amber-600">{data?.streakAnalysis.distribution["Gold Streak (6+)"] ?? 0}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-orange-50 border border-orange-100">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-orange-500" />
                    <span className="text-sm font-medium">Active (3+)</span>
                  </div>
                  <span className="text-lg font-bold text-orange-600">{data?.streakAnalysis.distribution["Active Streak (3+)"] ?? 0}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══════════════ ANALYTICS TAB ═══════════════ */}
        <TabsContent value="analytics" className="space-y-4">
          {/* Points Economy */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CircleDot className="h-5 w-5 text-teal-500" />
                  Points Economy
                </CardTitle>
                <CardDescription>Earned vs Redeemed vs Available</CardDescription>
              </CardHeader>
              <CardContent>
                {economyChartData.length > 0 && economyChartData.some(d => d.value > 0) ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={economyChartData.filter(d => d.value > 0)}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={90}
                        paddingAngle={4}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value.toLocaleString("en-IN")}`}
                      >
                        {economyChartData.filter(d => d.value > 0).map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">No points data</div>
                )}

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="text-center p-2 rounded-lg bg-teal-50 border border-teal-100">
                    <p className="text-[10px] uppercase font-medium text-teal-600">Earned</p>
                    <p className="text-lg font-bold text-teal-700">{(data?.pointsEconomy.totalEarned ?? 0).toLocaleString("en-IN")}</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-red-50 border border-red-100">
                    <p className="text-[10px] uppercase font-medium text-red-600">Redeemed</p>
                    <p className="text-lg font-bold text-red-700">{(data?.pointsEconomy.totalRedeemed ?? 0).toLocaleString("en-IN")}</p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-amber-50 border border-amber-100">
                    <p className="text-[10px] uppercase font-medium text-amber-600">Available</p>
                    <p className="text-lg font-bold text-amber-700">{(data?.pointsEconomy.totalAvailable ?? 0).toLocaleString("en-IN")}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Engagement Metrics */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-red-500" />
                  Engagement Metrics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Tier Distribution */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Tier Distribution</p>
                  <div className="space-y-2">
                    {Object.entries(data?.tierDistribution || {}).map(([tier, count]) => {
                      const cfg = TIER_CONFIG[tier] || TIER_CONFIG.Bronze;
                      const pct = (data?.engagement.totalMembers ?? 0) > 0
                        ? Math.round(((count as number) / data.engagement.totalMembers) * 100)
                        : 0;
                      return (
                        <div key={tier} className="flex items-center gap-3">
                          <span className="text-xs font-medium w-20">{tier}</span>
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${cfg.progressColor} transition-all duration-500`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs font-medium tabular-nums w-16 text-right">{count} ({pct}%)</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Key metrics */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-[10px] uppercase font-medium text-muted-foreground">Active (30d)</p>
                    <p className="text-xl font-bold">{data?.engagement.activeMembersLast30Days ?? 0}</p>
                    <p className="text-[10px] text-muted-foreground">
                      of {data?.engagement.totalMembers ?? 0} members
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-[10px] uppercase font-medium text-muted-foreground">Redemption Rate</p>
                    <p className="text-xl font-bold">{data?.engagement.redemptionRate ?? 0}%</p>
                    <p className="text-[10px] text-muted-foreground">members redeemed</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Redemption Trends */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-amber-500" />
                Redemption Trends
              </CardTitle>
              <CardDescription>Monthly redemption activity (last 6 months)</CardDescription>
            </CardHeader>
            <CardContent>
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} label={{ value: "Count", angle: -90, position: "insideLeft", style: { fontSize: 11 } }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} label={{ value: "Points", angle: 90, position: "insideRight", style: { fontSize: 11 } }} />
                    <RechartsTooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                    />
                    <Bar yAxisId="left" dataKey="count" fill="#F59E0B" radius={[4, 4, 0, 0]} name="Redemptions" />
                    <Bar yAxisId="right" dataKey="points" fill="#DC2626" radius={[4, 4, 0, 0]} name="Points Used" />
                    <Legend />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">No redemption data for the last 6 months</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
