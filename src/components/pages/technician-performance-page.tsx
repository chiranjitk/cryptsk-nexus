"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Trophy, TrendingUp, Users, MapPin, Clock, Star, Zap, Award,
  CheckCircle, AlertTriangle, ArrowUp, ArrowDown, Minus, Send,
  Route, BarChart3, Target, Shield, Medal, Crown, Flame, Heart,
  ChevronDown, Loader2, RefreshCw, BadgeCheck, Circle, MapPinned,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { apiFetch } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────

interface PerformanceMetric {
  technicianId: string;
  technicianName: string;
  phone: string;
  email: string;
  status: string;
  skills: unknown;
  totalComplaintsAssigned: number;
  complaintsResolved: number;
  avgResolutionHours: number;
  firstVisitFixRate: number;
  totalInstallationsCompleted: number;
  attendanceRate: number;
  leaveDays: number;
  avgCustomerRating: number;
  backlogCount: number;
  performanceScore: number;
}

interface DispatchComplaint {
  id: string;
  ticketNumber: string;
  type: string;
  priority: string;
  description: string;
  subscriberName: string;
  subscriberPhone: string;
  areaName: string;
  areaId: string | null;
  assignedToId: string | null;
  daysOpen: number;
  createdAt: string;
}

interface DispatchRecommendation {
  complaint: DispatchComplaint;
  recommendedTechnician: {
    technicianId: string;
    name: string;
    phone: string;
  } | null;
  matchScore: number;
  reasons: string[];
  allCandidates: {
    technicianId: string;
    technicianName: string;
    technicianPhone: string;
    matchScore: number;
    reasons: string[];
  }[];
}

interface LeaderboardEntry {
  rank: number;
  technicianId: string;
  technicianName: string;
  phone: string;
  email: string;
  status: string;
  complaintsResolved: number;
  totalComplaintsAssigned: number;
  avgRating: number;
  avgResolutionHours: number;
  installationsCompleted: number;
  attendanceRate: number;
  presentDays: number;
  performanceScore: number;
  prevMonthScore: number;
  scoreChange: number;
  badges: string[];
}

interface RouteGroup {
  areaName: string;
  areaId: string | null;
  complaints: DispatchRecommendation[];
  technicianAssignments: {
    technicianId: string;
    technicianName: string;
    complaintsCount: number;
    priority: string;
  }[];
}

// ─── Constants ───────────────────────────────────────────────

const PRIORITY_BADGE: Record<string, { label: string; cls: string }> = {
  P1_CRITICAL: { label: "Critical", cls: "bg-red-600 text-white" },
  P2_HIGH: { label: "High", cls: "bg-amber-500 text-white" },
  P3_MEDIUM: { label: "Medium", cls: "bg-teal-500 text-white" },
  P4_LOW: { label: "Low", cls: "bg-slate-400 text-white" },
};

const BADGE_CONFIG: Record<string, { icon: typeof Zap; color: string; bg: string }> = {
  "Speed Demon": { icon: Zap, color: "text-amber-500", bg: "bg-amber-500/10" },
  "Customer Favorite": { icon: Heart, color: "text-rose-500", bg: "bg-rose-500/10" },
  Workhorse: { icon: Flame, color: "text-red-500", bg: "bg-red-500/10" },
  "Perfect Attendance": { icon: Shield, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  "Rising Star": { icon: TrendingUp, color: "text-teal-500", bg: "bg-teal-500/10" },
};

function getGrade(score: number): { grade: string; color: string } {
  if (score >= 90) return { grade: "A", color: "text-emerald-500" };
  if (score >= 75) return { grade: "B", color: "text-teal-500" };
  if (score >= 60) return { grade: "C", color: "text-amber-500" };
  if (score >= 40) return { grade: "D", color: "text-orange-500" };
  return { grade: "F", color: "text-red-500" };
}

function getScoreColor(score: number): string {
  if (score >= 80) return "stroke-emerald-500";
  if (score >= 60) return "stroke-teal-500";
  if (score >= 40) return "stroke-amber-500";
  return "stroke-red-500";
}

function getScoreTextColor(score: number): string {
  if (score >= 80) return "text-emerald-500";
  if (score >= 60) return "text-teal-500";
  if (score >= 40) return "text-amber-500";
  return "text-red-500";
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function hashColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = ["bg-red-500", "bg-teal-500", "bg-amber-500", "bg-emerald-500", "bg-rose-500", "bg-orange-500"];
  return colors[Math.abs(hash) % colors.length];
}

// ─── Circular Gauge Component ────────────────────────────────

function MiniGauge({ value, label, size = 64, strokeWidth = 5 }: { value: number; label: string; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const progress = Math.min(value, 100);
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" className="stroke-muted" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className={getScoreColor(value)}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center" style={{ width: size, height: size }}>
        <span className={`text-sm font-bold ${getScoreTextColor(value)}`}>
          {typeof value === "number" ? (value >= 10 ? Math.round(value) : value.toFixed(1)) : value}
        </span>
      </div>
      <span className="text-[10px] text-muted-foreground font-medium">{label}</span>
    </div>
  );
}

function LargeGauge({ value, label, size = 80 }: { value: number; label: string; size?: number }) {
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const progress = Math.min(value, 100);
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative inline-flex flex-col items-center gap-1">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" className="stroke-muted" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          className={getScoreColor(value)}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-lg font-bold ${getScoreTextColor(value)}`}>
          {Math.round(value)}
        </span>
      </div>
      <span className="text-[10px] text-muted-foreground font-medium">{label}</span>
    </div>
  );
}

// ─── Badge Component ─────────────────────────────────────────

function AchievementBadge({ badge }: { badge: string }) {
  const config = BADGE_CONFIG[badge];
  if (!config) return null;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${config.bg} ${config.color}`}>
      <Icon className="h-3 w-3" />
      {badge}
    </span>
  );
}

// ─── Main Component ──────────────────────────────────────────

export default function TechnicianPerformancePage() {
  const queryClient = useQueryClient();
  const [leaderboardMonth, setLeaderboardMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  // ─── Queries ──────────────────────────────────────────────

  const { data: performanceData, isLoading: perfLoading, refetch: refetchPerf } = useQuery({
    queryKey: ["technician-performance"],
    queryFn: () => apiFetch<{ success: boolean; metrics: PerformanceMetric[] }>("/api/technicians/performance"),
  });

  const { data: dispatchData, isLoading: dispatchLoading, refetch: refetchDispatch } = useQuery({
    queryKey: ["technician-dispatch"],
    queryFn: () => apiFetch<{
      success: boolean;
      recommendations: DispatchRecommendation[];
      availableTechniciansCount: number;
      totalUnresolved: number;
      onLeaveTodayCount: number;
    }>("/api/technicians/dispatch"),
  });

  const [year, month] = leaderboardMonth.split("-").map(Number);
  const { data: leaderboardData, isLoading: lbLoading, refetch: refetchLeaderboard } = useQuery({
    queryKey: ["technician-leaderboard", year, month],
    queryFn: () => apiFetch<{
      success: boolean;
      leaderboard: LeaderboardEntry[];
      month: number;
      year: number;
      monthName: string;
    }>(`/api/technicians/leaderboard?month=${month}&year=${year}`),
  });

  // ─── Assign mutation ──────────────────────────────────────

  const assignMutation = useMutation({
    mutationFn: async ({ complaintId, technicianId }: { complaintId: string; technicianId: string }) => {
      return apiFetch(`/api/complaints/${complaintId}`, {
        method: "PUT",
        body: JSON.stringify({ assignedToId: technicianId, status: "ASSIGNED" }),
      });
    },
    onSuccess: () => {
      toast.success("Complaint assigned successfully");
      queryClient.invalidateQueries({ queryKey: ["technician-dispatch"] });
    },
    onError: () => toast.error("Failed to assign complaint"),
  });

  const autoAssignMutation = useMutation({
    mutationFn: async (recommendations: DispatchRecommendation[]) => {
      const unassigned = recommendations.filter((r) => !r.complaint.assignedToId && r.recommendedTechnician);
      await Promise.all(
        unassigned.map((r) =>
          apiFetch(`/api/complaints/${r.complaint.id}`, {
            method: "PUT",
            body: JSON.stringify({
              assignedToId: r.recommendedTechnician!.technicianId,
              status: "ASSIGNED",
            }),
          })
        )
      );
      return unassigned.length;
    },
    onSuccess: (count) => {
      toast.success(`Auto-assigned ${count} complaint${count !== 1 ? "s" : ""} successfully`);
      queryClient.invalidateQueries({ queryKey: ["technician-dispatch"] });
    },
    onError: () => toast.error("Auto-assign failed"),
  });

  // ─── Route optimization data ──────────────────────────────

  const routeGroups: RouteGroup[] = (() => {
    const recs = dispatchData?.recommendations || [];
    const grouped = new Map<string, RouteGroup>();
    for (const rec of recs) {
      const areaName = rec.complaint.areaName || "Unassigned";
      const areaId = rec.complaint.areaId;
      const key = areaName;
      if (!grouped.has(key)) {
        grouped.set(key, { areaName, areaId, complaints: [], technicianAssignments: [] });
      }
      const group = grouped.get(key)!;
      group.complaints.push(rec);

      // Track technician assignments per area
      const techId = rec.complaint.assignedToId || rec.recommendedTechnician?.technicianId;
      if (techId) {
        const techName = rec.recommendedTechnician?.name || "Current Assignee";
        const existing = group.technicianAssignments.find((t) => t.technicianId === techId);
        if (existing) {
          existing.complaintsCount++;
        } else {
          group.technicianAssignments.push({
            technicianId: techId,
            technicianName: techName,
            complaintsCount: 1,
            priority: rec.complaint.priority,
          });
        }
      }
    }

    // Sort within groups by priority + days open
    const priorityOrder: Record<string, number> = { P1_CRITICAL: 0, P2_HIGH: 1, P3_MEDIUM: 2, P4_LOW: 3 };
    for (const group of grouped.values()) {
      group.complaints.sort((a, b) => {
        const pDiff = (priorityOrder[a.complaint.priority] || 9) - (priorityOrder[b.complaint.priority] || 9);
        if (pDiff !== 0) return pDiff;
        return b.complaint.daysOpen - a.complaint.daysOpen;
      });
      group.technicianAssignments.sort((a, b) => (priorityOrder[a.priority] || 9) - (priorityOrder[b.priority] || 9));
    }

    return Array.from(grouped.values()).sort((a, b) => b.complaints.length - a.complaints.length);
  })();

  // ─── Render helpers ───────────────────────────────────────

  const metrics = performanceData?.metrics || [];
  const recommendations = dispatchData?.recommendations || [];
  const leaderboard = leaderboardData?.leaderboard || [];

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  // ─── Loading State ────────────────────────────────────────

  if (perfLoading && dispatchLoading && lbLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="skeleton-wave h-7 w-56 mb-2" />
        <Skeleton className="skeleton-wave h-4 w-80" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border border-border/50 rounded-xl shadow-sm">
              <CardContent className="p-4">
                <Skeleton className="skeleton-wave h-4 w-24 mb-3" />
                <Skeleton className="skeleton-wave h-10 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="skeleton-wave h-96 w-full" />
      </div>
    );
  }

  // ─── Main Render ──────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Trophy className="h-6 w-6 text-amber-500" />
            Technician Performance & Route Optimization
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor performance, optimize dispatch, and plan routes
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            refetchPerf();
            refetchDispatch();
            refetchLeaderboard();
          }}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border border-border/50 rounded-xl shadow-sm card-hover-polished">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Total Technicians</p>
            <p className="text-2xl font-bold text-foreground">{metrics.length}</p>
            <p className="text-xs text-emerald-500 mt-1">
              {metrics.filter((m) => m.status === "available").length} available
            </p>
          </CardContent>
        </Card>
        <Card className="border border-border/50 rounded-xl shadow-sm card-hover-polished">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Unresolved Complaints</p>
            <p className="text-2xl font-bold text-red-500">{dispatchData?.totalUnresolved || 0}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {dispatchData?.onLeaveTodayCount || 0} techs on leave
            </p>
          </CardContent>
        </Card>
        <Card className="border border-border/50 rounded-xl shadow-sm card-hover-polished">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Avg Performance</p>
            <p className="text-2xl font-bold text-teal-500">
              {metrics.length > 0
                ? Math.round(metrics.reduce((s, m) => s + m.performanceScore, 0) / metrics.length)
                : 0}
            </p>
            <p className="text-xs text-muted-foreground mt-1">out of 100</p>
          </CardContent>
        </Card>
        <Card className="border border-border/50 rounded-xl shadow-sm card-hover-polished">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Top Performer</p>
            <p className="text-lg font-bold text-foreground truncate">
              {metrics.length > 0 ? metrics[0].technicianName : "—"}
            </p>
            <p className="text-xs text-amber-500 mt-1">
              Score: {metrics.length > 0 ? metrics[0].performanceScore : 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="leaderboard" className="space-y-4">
        <TabsList className="bg-muted/50 p-1 h-auto">
          <TabsTrigger value="leaderboard" className="text-xs px-3 py-1.5 data-[state=active]:bg-background">
            <Trophy className="h-3.5 w-3.5 mr-1.5" />
            Leaderboard
          </TabsTrigger>
          <TabsTrigger value="performance" className="text-xs px-3 py-1.5 data-[state=active]:bg-background">
            <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
            Performance Cards
          </TabsTrigger>
          <TabsTrigger value="dispatch" className="text-xs px-3 py-1.5 data-[state=active]:bg-background">
            <Send className="h-3.5 w-3.5 mr-1.5" />
            Smart Dispatch
          </TabsTrigger>
          <TabsTrigger value="routes" className="text-xs px-3 py-1.5 data-[state=active]:bg-background">
            <Route className="h-3.5 w-3.5 mr-1.5" />
            Route Optimization
          </TabsTrigger>
        </TabsList>

        {/* ─── LEADERBOARD TAB ─────────────────────────────── */}
        <TabsContent value="leaderboard" className="space-y-4">
          {/* Month Filter */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Select
                value={leaderboardMonth}
                onValueChange={setLeaderboardMonth}
              >
                <SelectTrigger className="w-[180px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => {
                    const m = new Date();
                    m.setMonth(m.getMonth() - i);
                    const val = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`;
                    return (
                      <SelectItem key={val} value={val} className="text-xs">
                        {monthNames[m.getMonth()]} {m.getFullYear()}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">
                Showing: {leaderboardData?.monthName || ""} {year}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {leaderboard.slice(0, 3).map((entry, idx) => (
                <div
                  key={entry.technicianId}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
                    idx === 0
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                      : idx === 1
                        ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        : "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300"
                  }`}
                >
                  <span className="text-base">{idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉"}</span>
                  <span className="font-semibold">{entry.technicianName}</span>
                  <span className="font-bold">{entry.performanceScore}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Leaderboard Table */}
          <Card className="border border-border/50 rounded-xl shadow-sm">
            <CardContent className="p-0">
              <ScrollArea className="max-h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="w-16 text-center text-xs font-semibold">Rank</TableHead>
                      <TableHead className="text-xs font-semibold">Technician</TableHead>
                      <TableHead className="text-center text-xs font-semibold">Score</TableHead>
                      <TableHead className="text-center text-xs font-semibold">Resolved</TableHead>
                      <TableHead className="text-center text-xs font-semibold">Avg Rating</TableHead>
                      <TableHead className="text-center text-xs font-semibold">Avg Time</TableHead>
                      <TableHead className="text-center text-xs font-semibold">Installs</TableHead>
                      <TableHead className="text-center text-xs font-semibold">Attendance</TableHead>
                      <TableHead className="text-xs font-semibold">Badges</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lbLoading
                      ? Array.from({ length: 6 }).map((_, i) => (
                          <TableRow key={i}>
                            <TableCell colSpan={9}>
                              <Skeleton className="skeleton-wave h-10 w-full" />
                            </TableCell>
                          </TableRow>
                        ))
                      : leaderboard.map((entry, idx) => (
                          <TableRow
                            key={entry.technicianId}
                            className={`border-b border-border/30 ${
                              idx < 3 ? "bg-amber-50/30 dark:bg-amber-950/10" : ""
                            } hover:bg-muted/30 transition-colors`}
                          >
                            <TableCell className="text-center">
                              {entry.rank === 1 ? (
                                <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-950/50">
                                  <Crown className="h-4 w-4 text-amber-500" />
                                </div>
                              ) : entry.rank === 2 ? (
                                <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800">
                                  <Medal className="h-4 w-4 text-slate-400" />
                                </div>
                              ) : entry.rank === 3 ? (
                                <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-950/40">
                                  <Medal className="h-4 w-4 text-orange-500" />
                                </div>
                              ) : (
                                <span className="text-sm text-muted-foreground font-mono">#{entry.rank}</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8">
                                  <AvatarFallback className={`${hashColor(entry.technicianName)} text-white text-xs font-bold`}>
                                    {getInitials(entry.technicianName)}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="text-sm font-medium text-foreground">{entry.technicianName}</p>
                                  <p className="text-[10px] text-muted-foreground">{entry.phone}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="relative inline-flex">
                                <LargeGauge value={entry.performanceScore} label="Score" size={52} />
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <span className="text-sm font-semibold text-foreground">{entry.complaintsResolved}</span>
                              <span className="text-[10px] text-muted-foreground ml-1">
                                / {entry.totalComplaintsAssigned}
                              </span>
                            </TableCell>
                            <TableCell className="text-center">
                              <span className={`text-sm font-bold ${entry.avgRating >= 4 ? "text-emerald-500" : entry.avgRating >= 3 ? "text-amber-500" : "text-red-500"}`}>
                                {entry.avgRating > 0 ? entry.avgRating.toFixed(1) : "—"}
                              </span>
                              {entry.avgRating > 0 && <Star className="h-3 w-3 text-amber-400 inline ml-0.5" />}
                            </TableCell>
                            <TableCell className="text-center">
                              <span className="text-sm text-foreground">
                                {entry.avgResolutionHours > 0
                                  ? entry.avgResolutionHours < 1
                                    ? `${Math.round(entry.avgResolutionHours * 60)}m`
                                    : `${entry.avgResolutionHours.toFixed(1)}h`
                                  : "—"}
                              </span>
                            </TableCell>
                            <TableCell className="text-center">
                              <span className="text-sm text-foreground">{entry.installationsCompleted}</span>
                            </TableCell>
                            <TableCell className="text-center">
                              <span className={`text-sm font-medium ${entry.attendanceRate >= 90 ? "text-emerald-500" : entry.attendanceRate >= 70 ? "text-amber-500" : "text-red-500"}`}>
                                {entry.attendanceRate}%
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1 max-w-[200px]">
                                {entry.badges.map((badge) => (
                                  <AchievementBadge key={badge} badge={badge} />
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                    {leaderboard.length === 0 && !lbLoading && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-12 text-muted-foreground text-sm">
                          No leaderboard data for this month
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── PERFORMANCE CARDS TAB ────────────────────────── */}
        <TabsContent value="performance" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {perfLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i} className="border border-border/50 rounded-xl shadow-sm">
                    <CardContent className="p-5">
                      <Skeleton className="skeleton-wave h-6 w-40 mb-4" />
                      <div className="flex justify-center gap-4 mb-4">
                        {Array.from({ length: 4 }).map((_, j) => (
                          <Skeleton key={j} className="skeleton-wave h-16 w-16 rounded-full" />
                        ))}
                      </div>
                      <Skeleton className="skeleton-wave h-4 w-full" />
                    </CardContent>
                  </Card>
                ))
              : metrics.map((m) => {
                  const grade = getGrade(m.performanceScore);
                  return (
                    <Card
                      key={m.technicianId}
                      className="border border-border/50 rounded-xl shadow-sm card-hover-polished"
                    >
                      <CardContent className="p-5">
                        {/* Header */}
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10">
                              <AvatarFallback className={`${hashColor(m.technicianName)} text-white text-sm font-bold`}>
                                {getInitials(m.technicianName)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-semibold text-foreground">{m.technicianName}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <Badge
                                  variant="outline"
                                  className={`text-[9px] px-1.5 py-0 ${
                                    m.status === "available"
                                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
                                      : m.status === "busy"
                                        ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800"
                                        : "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                                  }`}
                                >
                                  {m.status}
                                </Badge>
                                {m.backlogCount > 0 && (
                                  <Badge variant="destructive" className="text-[9px] px-1.5 py-0">
                                    {m.backlogCount} backlog
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`text-2xl font-black ${grade.color}`}>{grade.grade}</div>
                            <p className="text-[10px] text-muted-foreground">{m.performanceScore}/100</p>
                          </div>
                        </div>

                        {/* Metric Circles */}
                        <div className="flex justify-around mb-4 px-2">
                          <div className="relative">
                            <MiniGauge value={m.totalComplaintsAssigned > 0 ? (m.complaintsResolved / m.totalComplaintsAssigned) * 100 : 0} label="Resolution" size={60} strokeWidth={4} />
                          </div>
                          <div className="relative">
                            <MiniGauge value={m.avgCustomerRating > 0 ? (m.avgCustomerRating / 5) * 100 : 0} label="Rating" size={60} strokeWidth={4} />
                          </div>
                          <div className="relative">
                            <MiniGauge value={m.attendanceRate} label="Attendance" size={60} strokeWidth={4} />
                          </div>
                          <div className="relative">
                            <MiniGauge
                              value={Math.min(100, (m.complaintsResolved / Math.max(1, 30)) * 100)}
                              label="Productivity"
                              size={60}
                              strokeWidth={4}
                            />
                          </div>
                        </div>

                        {/* Details */}
                        <Separator className="my-3" />
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Resolved</span>
                            <span className="font-semibold text-foreground">{m.complaintsResolved}/{m.totalComplaintsAssigned}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Avg Time</span>
                            <span className="font-semibold text-foreground">
                              {m.avgResolutionHours > 0
                                ? m.avgResolutionHours < 1
                                  ? `${Math.round(m.avgResolutionHours * 60)}m`
                                  : `${m.avgResolutionHours.toFixed(1)}h`
                                : "—"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">First Visit Fix</span>
                            <span className="font-semibold text-foreground">{m.firstVisitFixRate}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Installations</span>
                            <span className="font-semibold text-foreground">{m.totalInstallationsCompleted}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Leave Days</span>
                            <span className={`font-semibold ${m.leaveDays > 5 ? "text-red-500" : "text-foreground"}`}>{m.leaveDays}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Avg Rating</span>
                            <span className="font-semibold text-foreground">
                              {m.avgCustomerRating > 0 ? m.avgCustomerRating.toFixed(1) : "—"}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
            {metrics.length === 0 && !perfLoading && (
              <div className="col-span-full text-center py-12 text-muted-foreground text-sm">
                No performance data available
              </div>
            )}
          </div>
        </TabsContent>

        {/* ─── SMART DISPATCH TAB ──────────────────────────── */}
        <TabsContent value="dispatch" className="space-y-4">
          {/* Summary + Auto Assign */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-4 text-xs">
              <span className="text-muted-foreground">
                <span className="font-semibold text-foreground">{recommendations.length}</span> unresolved complaints
              </span>
              <span className="text-muted-foreground">
                <span className="font-semibold text-emerald-500">{dispatchData?.availableTechniciansCount || 0}</span> techs available
              </span>
            </div>
            <Button
              size="sm"
              className="bg-teal-600 hover:bg-teal-700 text-white text-xs"
              onClick={() => autoAssignMutation.mutate(recommendations)}
              disabled={autoAssignMutation.isPending || recommendations.length === 0}
            >
              {autoAssignMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Zap className="h-3.5 w-3.5 mr-1.5" />
              )}
              Auto-Assign All
            </Button>
          </div>

          {/* Priority Queue */}
          <Card className="border border-border/50 rounded-xl shadow-sm">
            <CardContent className="p-0">
              <ScrollArea className="max-h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="w-20 text-xs font-semibold">Priority</TableHead>
                      <TableHead className="text-xs font-semibold">Ticket</TableHead>
                      <TableHead className="text-xs font-semibold">Subscriber</TableHead>
                      <TableHead className="text-xs font-semibold">Area</TableHead>
                      <TableHead className="text-center text-xs font-semibold">Days Open</TableHead>
                      <TableHead className="text-xs font-semibold">Best Match</TableHead>
                      <TableHead className="text-center text-xs font-semibold">Score</TableHead>
                      <TableHead className="text-xs font-semibold">Reasons</TableHead>
                      <TableHead className="text-center text-xs font-semibold">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dispatchLoading
                      ? Array.from({ length: 6 }).map((_, i) => (
                          <TableRow key={i}>
                            <TableCell colSpan={9}>
                              <Skeleton className="skeleton-wave h-10 w-full" />
                            </TableCell>
                          </TableRow>
                        ))
                      : recommendations.map((rec) => {
                          const pBadge = PRIORITY_BADGE[rec.complaint.priority] || PRIORITY_BADGE.P4_LOW;
                          return (
                            <TableRow
                              key={rec.complaint.id}
                              className={`border-b border-border/30 hover:bg-muted/30 transition-colors ${
                                rec.complaint.daysOpen > 3 ? "bg-red-50/20" : ""
                              }`}
                            >
                              <TableCell>
                                <Badge className={`${pBadge.cls} text-[10px] px-2 py-0`}>{pBadge.label}</Badge>
                              </TableCell>
                              <TableCell>
                                <div>
                                  <p className="text-xs font-mono font-semibold text-foreground">{rec.complaint.ticketNumber}</p>
                                  <p className="text-[10px] text-muted-foreground">{rec.complaint.type.replace(/_/g, " ")}</p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <p className="text-xs font-medium text-foreground">{rec.complaint.subscriberName}</p>
                                {rec.complaint.subscriberPhone && (
                                  <p className="text-[10px] text-muted-foreground">{rec.complaint.subscriberPhone}</p>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1 text-xs">
                                  <MapPin className="h-3 w-3 text-muted-foreground" />
                                  {rec.complaint.areaName}
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <span className={`text-xs font-bold ${rec.complaint.daysOpen > 3 ? "text-red-500" : rec.complaint.daysOpen > 1 ? "text-amber-500" : "text-foreground"}`}>
                                  {rec.complaint.daysOpen}d
                                </span>
                              </TableCell>
                              <TableCell>
                                {rec.recommendedTechnician ? (
                                  <div className="flex items-center gap-2">
                                    <Avatar className="h-6 w-6">
                                      <AvatarFallback className={`${hashColor(rec.recommendedTechnician.name)} text-white text-[9px] font-bold`}>
                                        {getInitials(rec.recommendedTechnician.name)}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div>
                                      <p className="text-xs font-medium text-foreground">{rec.recommendedTechnician.name}</p>
                                      <p className="text-[10px] text-muted-foreground">{rec.recommendedTechnician.phone}</p>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">No match</span>
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex flex-col items-center">
                                  <div className="relative inline-flex">
                                    <MiniGauge value={Math.min(100, (rec.matchScore / 70) * 100)} label="" size={36} strokeWidth={3} />
                                  </div>
                                  <span className="text-[10px] text-muted-foreground font-mono mt-0.5">{rec.matchScore}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col gap-0.5 max-w-[180px]">
                                  {rec.reasons.slice(0, 2).map((reason, i) => (
                                    <span key={i} className="text-[10px] text-muted-foreground leading-tight">
                                      • {reason}
                                    </span>
                                  ))}
                                  {rec.reasons.length > 2 && (
                                    <span className="text-[10px] text-muted-foreground">
                                      +{rec.reasons.length - 2} more
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                {rec.recommendedTechnician && !rec.complaint.assignedToId ? (
                                  <Button
                                    size="sm"
                                    className="bg-teal-600 hover:bg-teal-700 text-white text-[10px] h-7 px-2"
                                    onClick={() =>
                                      assignMutation.mutate({
                                        complaintId: rec.complaint.id,
                                        technicianId: rec.recommendedTechnician!.technicianId,
                                      })
                                    }
                                    disabled={assignMutation.isPending}
                                  >
                                    {assignMutation.isPending ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      "Assign"
                                    )}
                                  </Button>
                                ) : rec.complaint.assignedToId ? (
                                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-teal-500/10 text-teal-700 border-teal-200 dark:text-teal-400 dark:border-teal-800">
                                    <CheckCircle className="h-3 w-3 mr-0.5" />
                                    Assigned
                                  </Badge>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground">—</span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                    {recommendations.length === 0 && !dispatchLoading && (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-12 text-muted-foreground text-sm">
                          No unresolved complaints — all clear!
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── ROUTE OPTIMIZATION TAB ──────────────────────── */}
        <TabsContent value="routes" className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="text-sm text-muted-foreground">
              {routeGroups.length} area{routeGroups.length !== 1 ? "s" : ""} with pending work · Route ordered by priority + age
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Badge className="bg-red-600 text-white text-[10px] px-2 py-0">Critical</Badge>
              <Badge className="bg-amber-500 text-white text-[10px] px-2 py-0">High</Badge>
              <Badge className="bg-teal-500 text-white text-[10px] px-2 py-0">Medium</Badge>
              <Badge className="bg-slate-400 text-white text-[10px] px-2 py-0">Low</Badge>
            </div>
          </div>

          {dispatchLoading
            ? Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="border border-border/50 rounded-xl shadow-sm">
                  <CardContent className="p-4">
                    <Skeleton className="skeleton-wave h-6 w-40 mb-3" />
                    <Skeleton className="skeleton-wave h-32 w-full" />
                  </CardContent>
                </Card>
              ))
            : routeGroups.map((group) => {
                const totalInArea = group.complaints.length;
                return (
                  <Card key={group.areaName} className="border border-border/50 rounded-xl shadow-sm card-hover-polished">
                    <CardHeader className="pb-2 px-4 pt-4">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <MapPinned className="h-4 w-4 text-red-500" />
                          <CardTitle className="text-sm font-semibold">{group.areaName}</CardTitle>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {totalInArea} complaint{totalInArea !== 1 ? "s" : ""}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">
                            {group.technicianAssignments.length} technician{group.technicianAssignments.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-3">
                      {/* Technician Assignments */}
                      {group.technicianAssignments.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {group.technicianAssignments.map((tech) => (
                            <Badge
                              key={tech.technicianId}
                              variant="outline"
                              className={`text-[10px] px-2 py-0.5 ${
                                tech.priority === "P1_CRITICAL"
                                  ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800"
                                  : "bg-muted/50 text-foreground border-border/50"
                              }`}
                            >
                              <Avatar className="h-4 w-4 mr-1">
                                <AvatarFallback className={`${hashColor(tech.technicianName)} text-white text-[7px]`}>
                                  {getInitials(tech.technicianName)}
                                </AvatarFallback>
                              </Avatar>
                              {tech.technicianName}
                              <span className="ml-1 font-mono">×{tech.complaintsCount}</span>
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* Route Order Table */}
                      <div className="rounded-lg border border-border/50 overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/20 hover:bg-muted/20">
                              <TableHead className="w-8 text-center text-[10px] font-semibold">#</TableHead>
                              <TableHead className="w-20 text-[10px] font-semibold">Priority</TableHead>
                              <TableHead className="text-[10px] font-semibold">Ticket</TableHead>
                              <TableHead className="text-[10px] font-semibold">Subscriber</TableHead>
                              <TableHead className="text-center text-[10px] font-semibold">Days Open</TableHead>
                              <TableHead className="text-[10px] font-semibold">Assigned To</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.complaints.map((rec, idx) => {
                              const pBadge = PRIORITY_BADGE[rec.complaint.priority] || PRIORITY_BADGE.P4_LOW;
                              return (
                                <TableRow key={rec.complaint.id} className="border-b border-border/20 last:border-b-0">
                                  <TableCell className="text-center">
                                    <span className="text-[10px] font-mono text-muted-foreground">{idx + 1}</span>
                                  </TableCell>
                                  <TableCell>
                                    <Badge className={`${pBadge.cls} text-[9px] px-1.5 py-0`}>{pBadge.label}</Badge>
                                  </TableCell>
                                  <TableCell>
                                    <span className="text-xs font-mono text-foreground">{rec.complaint.ticketNumber}</span>
                                  </TableCell>
                                  <TableCell>
                                    <span className="text-xs text-foreground">{rec.complaint.subscriberName}</span>
                                  </TableCell>
                                  <TableCell className="text-center">
                                    <span className={`text-xs font-medium ${rec.complaint.daysOpen > 3 ? "text-red-500" : "text-foreground"}`}>
                                      {rec.complaint.daysOpen}d
                                    </span>
                                  </TableCell>
                                  <TableCell>
                                    {rec.recommendedTechnician ? (
                                      <span className="text-xs text-foreground">{rec.recommendedTechnician.name}</span>
                                    ) : (
                                      <span className="text-[10px] text-muted-foreground">Unassigned</span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
          {routeGroups.length === 0 && !dispatchLoading && (
            <Card className="border border-border/50 rounded-xl shadow-sm">
              <CardContent className="py-12 text-center text-muted-foreground text-sm">
                No route data available — all areas clear!
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
