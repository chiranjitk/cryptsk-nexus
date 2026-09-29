"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer,
} from "recharts";
import { toast } from "sonner";
import {
  Heart, RefreshCw, AlertTriangle, TrendingUp, TrendingDown, Minus,
  Activity, Clock, AlertCircle, Wifi, WifiOff, CheckCircle2,
  BarChart3, BrainCircuit, Zap, Ticket, ArrowUpRight,
  ShieldAlert, Users, Server,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

interface HealthFactors {
  deviceHealth: { score: number; weight: number; label: string; onlineDevices: number; offlineDevices: number; warningDevices: number; totalDevices: number; onlineRatio: number };
  subscriberImpact: { score: number; weight: number; label: string; activeSubscribers: number; totalSubscribers: number; activeRatio: number };
  complaintDensity: { score: number; weight: number; label: string; complaints7d: number; avgDensityPer100: number };
  resolutionTime: { score: number; weight: number; label: string; avgHours: number; totalResolved: number };
  alertSeverity: { score: number; weight: number; label: string; critical: number; high: number; medium: number; low: number; totalActive: number };
}

interface EnhancedHealthResponse {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  factors: HealthFactors;
  areas: { areaId: string; areaName: string; subscriberCount: number; deviceCount: number; complaints7d: number; densityPer100: number }[];
  offlineDevices: { id: string; name: string; type: string; lastSeenAt: string | null; ipAddress: string }[];
  activeAlerts: { id: string; severity: string; title: string; message: string; createdAt: string; source: string }[];
  predictions: { type: string; severity: string; confidence: number; message: string; action: string }[];
  recommendations: string[];
}

interface PredictiveResponse {
  predictions: { type: string; severity: string; confidence: number; message: string; action: string; metadata?: Record<string, unknown> }[];
  summary: { total: number; critical: number; high: number; medium: number; low: number };
  capacityForecasts: { areaId: string; areaName: string; subscribers: number; devices: number; utilization: number; status: string }[];
}

interface HealthHistoryResponse {
  daily: { date: string; score: number; deviceHealth: number; complaintScore: number; alertScore: number }[];
  summary: { currentScore: number; average: number; min: number; max: number; trend: number; trendDirection: string };
}

// ─── Color helpers ──────────────────────────────────────────────

function gradeColor(grade: string): string {
  switch (grade) {
    case "A": return "#16A34A";
    case "B": return "#0D9488";
    case "C": return "#D97706";
    case "D": return "#EA580C";
    case "F": return "#DC2626";
    default: return "#6B7280";
  }
}

function gradeBgClass(grade: string): string {
  switch (grade) {
    case "A": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400";
    case "B": return "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400";
    case "C": return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400";
    case "D": return "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400";
    case "F": return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400";
    default: return "bg-gray-100 text-gray-700 dark:bg-gray-950/40 dark:text-gray-400";
  }
}

function gradeLabel(grade: string): string {
  switch (grade) {
    case "A": return "Excellent";
    case "B": return "Good";
    case "C": return "Fair";
    case "D": return "Poor";
    case "F": return "Critical";
    default: return "Unknown";
  }
}

function scoreColor(score: number): string {
  if (score >= 80) return "#16A34A";
  if (score >= 60) return "#0D9488";
  if (score >= 40) return "#D97706";
  return "#DC2626";
}

function severityColor(severity: string): string {
  switch (severity) {
    case "CRITICAL": return "#DC2626";
    case "HIGH": return "#EA580C";
    case "MEDIUM": return "#D97706";
    case "LOW": return "#16A34A";
    default: return "#6B7280";
  }
}

function severityBgClass(severity: string): string {
  switch (severity) {
    case "CRITICAL": return "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400";
    case "HIGH": return "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400";
    case "MEDIUM": return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400";
    case "LOW": return "bg-green-100 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-400";
    default: return "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-950/40 dark:text-gray-400";
  }
}

function severityIcon(severity: string) {
  switch (severity) {
    case "CRITICAL": return <ShieldAlert className="h-4 w-4" />;
    case "HIGH": return <AlertCircle className="h-4 w-4" />;
    case "MEDIUM": return <AlertTriangle className="h-4 w-4" />;
    case "LOW": return <CheckCircle2 className="h-4 w-4" />;
    default: return <Activity className="h-4 w-4" />;
  }
}

function TrendIcon({ trend }: { trend: number }) {
  if (trend > 2) return <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />;
  if (trend < -2) return <TrendingDown className="h-3.5 w-3.5 text-red-600" />;
  return <Minus className="h-3.5 w-3.5 text-amber-600" />;
}

// ─── Large Circular Gauge ───────────────────────────────────────

function LargeGauge({ score, grade }: { score: number; grade: string }) {
  const size = 180;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = gradeColor(grade);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-muted/20" />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
          style={{ filter: `drop-shadow(0 0 6px ${color}40)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-black tabular-nums" style={{ color }}>{score}</span>
        <span className="text-2xl font-black mt-0.5" style={{ color }}>{grade}</span>
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mt-0.5">
          {gradeLabel(grade)}
        </span>
      </div>
    </div>
  );
}

// ─── Custom Chart Tooltip ───────────────────────────────────────

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card/90 border border-border/80 rounded-xl shadow-2xl px-4 py-3 text-xs backdrop-blur-md">
      <p className="font-semibold text-foreground mb-1.5 text-[11px]">{label}</p>
      {payload.map((item, i) => (
        <p key={i} className="text-muted-foreground flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: item.color }} />
          <span>{item.name}: </span>
          <span className="font-semibold text-foreground">{item.value}</span>
        </p>
      ))}
    </div>
  );
}

// ─── Factor Card ────────────────────────────────────────────────

function FactorCard({ label, score, icon: Icon, weight, details, trend }: {
  label: string; score: number; icon: React.ElementType; weight: number;
  details: React.ReactNode; trend?: number;
}) {
  const color = scoreColor(score);
  const isCritical = score < 40;
  const widthPct = Math.min(Math.max(score, 0), 100);

  return (
    <Card className={`border shadow-sm rounded-xl hover:shadow-md transition-all duration-200 ${isCritical ? "ring-2 ring-red-500/30" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-md ${isCritical ? "bg-red-100 dark:bg-red-950/40" : "bg-muted"}`}>
              <Icon className={`h-3.5 w-3.5 ${isCritical ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`} />
            </div>
            <span className="text-xs font-semibold text-foreground">{label}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-muted-foreground">{Math.round(weight * 100)}%</span>
            {trend !== undefined && <TrendIcon trend={trend} />}
          </div>
        </div>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl font-black tabular-nums" style={{ color }}>{score}</span>
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${isCritical ? "animate-pulse" : ""}`}
              style={{ width: `${widthPct}%`, backgroundColor: color }}
            />
          </div>
        </div>
        {details}
      </CardContent>
    </Card>
  );
}

// ─── Prediction Card ────────────────────────────────────────────

function PredictionCard({ prediction, onCreateTicket }: {
  prediction: { type: string; severity: string; confidence: number; message: string; action: string };
  onCreateTicket: (message: string) => void;
}) {
  const color = severityColor(prediction.severity);

  return (
    <Card className="border shadow-sm rounded-xl hover:shadow-md transition-all duration-200">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg mt-0.5" style={{ backgroundColor: `${color}15` }}>
            <span style={{ color }}>{severityIcon(prediction.severity)}</span>
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={`text-[9px] px-1.5 py-0 h-5 border ${severityBgClass(prediction.severity)}`}>
                {prediction.severity}
              </Badge>
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-5">
                {prediction.confidence}% confidence
              </Badge>
            </div>
            <p className="text-xs font-medium text-foreground leading-relaxed">{prediction.message}</p>
            <div className="flex items-start gap-1.5 p-2 rounded-lg bg-muted/50">
              <ArrowUpRight className="h-3 w-3 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
              <span className="text-[10px] text-muted-foreground leading-relaxed">{prediction.action}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[10px] gap-1 w-fit"
              onClick={() => onCreateTicket(prediction.message)}
            >
              <Ticket className="h-3 w-3" />
              Create Ticket
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ──────────────────────────────────────────────────

export default function NetworkHealthEnhancedPage() {
  const [healthData, setHealthData] = useState<EnhancedHealthResponse | null>(null);
  const [predictiveData, setPredictiveData] = useState<PredictiveResponse | null>(null);
  const [historyData, setHistoryData] = useState<HealthHistoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);

  const fetchAll = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    else setIsRefetching(true);

    try {
      const [healthRes, predictiveRes, historyRes] = await Promise.all([
        fetch("/api/network/health-enhanced", { credentials: "include" }),
        fetch("/api/network/predictive", { credentials: "include" }),
        fetch("/api/network/health-history", { credentials: "include" }),
      ]);

      if (healthRes.ok) setHealthData(await healthRes.json());
      if (predictiveRes.ok) setPredictiveData(await predictiveRes.json());
      if (historyRes.ok) setHistoryData(await historyRes.json());
    } catch (err) {
      console.error("Network Health page fetch error:", err);
    } finally {
      setIsLoading(false);
      setIsRefetching(false);
    }
  }, []);

  useEffect(() => {
    fetchAll(true);
  }, [fetchAll]);

  const handleCreateTicket = (message: string) => {
    toast.success("Ticket created", {
      description: `Issue: ${message.slice(0, 80)}...`,
    });
  };

  // ── Loading State ──
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-9 w-9 rounded-full" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-1 border"><CardContent className="p-8 flex items-center justify-center"><Skeleton className="h-[200px] w-[200px] rounded-full" /></CardContent></Card>
          <Card className="lg:col-span-2 border"><CardContent className="p-6"><Skeleton className="h-[200px] w-full rounded-lg" /></CardContent></Card>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!healthData || !predictiveData || !historyData) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <div className="p-4 rounded-2xl bg-red-100 dark:bg-red-950/30 text-red-500">
          <AlertTriangle className="h-10 w-10" />
        </div>
        <p className="text-lg font-semibold">Failed to load network health data</p>
        <Button variant="outline" onClick={() => fetchAll(true)}>
          <RefreshCw className="h-4 w-4 mr-2" /> Retry
        </Button>
      </div>
    );
  }

  // Combine predictions from both endpoints
  const allPredictions = [
    ...healthData.predictions.map((p) => ({ ...p, source: "health" as const })),
    ...predictiveData.predictions.map((p) => ({ ...p, source: "predictive" as const })),
  ];

  // Chart data
  const chartData = historyData.daily.map((d) => {
    const date = new Date(d.date);
    return {
      date: `${date.getDate()}/${date.getMonth() + 1}`,
      score: d.score,
      device: d.deviceHealth,
      complaints: d.complaintScore,
    };
  });

  const handleRefresh = () => fetchAll(false);

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Heart className="h-6 w-6 text-red-600" />
            AI Network Health
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Multi-factor health scoring with predictive insights
          </p>
        </div>
        <Button
          variant="outline" size="sm" className="h-9 w-9 p-0"
          onClick={handleRefresh} disabled={isRefetching}
        >
          <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* ── Health Overview: Score + Trend ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Score Gauge */}
        <Card className="border shadow-sm rounded-xl">
          <CardContent className="p-6 flex flex-col items-center justify-center gap-4">
            <LargeGauge score={healthData.score} grade={healthData.grade} />
            <div className="text-center">
              <span className={`inline-block text-xs font-bold px-3 py-1 rounded-full ${gradeBgClass(healthData.grade)}`}>
                {gradeLabel(healthData.grade)} Network Health
              </span>
            </div>
            <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <TrendIcon trend={historyData.summary.trend} />
                {historyData.summary.trendDirection === "improving"
                  ? `+${historyData.summary.trend}`
                  : historyData.summary.trendDirection === "declining"
                    ? `${historyData.summary.trend}`
                    : "Stable"}&nbsp;(30d)
              </span>
              <span>Avg: {historyData.summary.average}</span>
              <span>Min: {historyData.summary.min}</span>
              <span>Max: {historyData.summary.max}</span>
            </div>
          </CardContent>
        </Card>

        {/* Trend Chart */}
        <Card className="lg:col-span-2 border shadow-sm rounded-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-red-600" />
              30-Day Health Trend
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb20" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} width={30} />
                  <RechartsTooltip content={<ChartTooltip />} />
                  <Line type="monotone" dataKey="score" name="Overall" stroke="#DC2626" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="device" name="Devices" stroke="#0D9488" strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="complaints" name="Complaints" stroke="#D97706" strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Factor Analysis ── */}
      <div>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Activity className="h-5 w-5 text-red-600" />
          Factor Analysis
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <FactorCard
            label="Device Health"
            score={healthData.factors.deviceHealth.score}
            icon={Server}
            weight={healthData.factors.deviceHealth.weight}
            trend={historyData.summary.trendDirection === "improving" ? historyData.summary.trend : undefined}
            details={
              <div className="space-y-1 text-[10px] text-muted-foreground">
                <div className="flex justify-between"><span>Online</span><span className="font-semibold text-emerald-600">{healthData.factors.deviceHealth.onlineDevices}</span></div>
                <div className="flex justify-between"><span>Offline</span><span className="font-semibold text-red-600">{healthData.factors.deviceHealth.offlineDevices}</span></div>
                <div className="flex justify-between"><span>Warning</span><span className="font-semibold text-amber-600">{healthData.factors.deviceHealth.warningDevices}</span></div>
                <div className="flex justify-between"><span>Uptime</span><span className="font-semibold text-foreground">{healthData.factors.deviceHealth.onlineRatio}%</span></div>
              </div>
            }
          />
          <FactorCard
            label="Subscriber Impact"
            score={healthData.factors.subscriberImpact.score}
            icon={Users}
            weight={healthData.factors.subscriberImpact.weight}
            details={
              <div className="space-y-1 text-[10px] text-muted-foreground">
                <div className="flex justify-between"><span>Active</span><span className="font-semibold text-emerald-600">{healthData.factors.subscriberImpact.activeSubscribers}</span></div>
                <div className="flex justify-between"><span>Total</span><span className="font-semibold text-foreground">{healthData.factors.subscriberImpact.totalSubscribers}</span></div>
                <div className="flex justify-between"><span>Active Ratio</span><span className="font-semibold text-foreground">{healthData.factors.subscriberImpact.activeRatio}%</span></div>
              </div>
            }
          />
          <FactorCard
            label="Complaint Density"
            score={healthData.factors.complaintDensity.score}
            icon={AlertTriangle}
            weight={healthData.factors.complaintDensity.weight}
            details={
              <div className="space-y-1 text-[10px] text-muted-foreground">
                <div className="flex justify-between"><span>Last 7 Days</span><span className="font-semibold text-foreground">{healthData.factors.complaintDensity.complaints7d}</span></div>
                <div className="flex justify-between"><span>Density /100</span><span className="font-semibold text-foreground">{healthData.factors.complaintDensity.avgDensityPer100}</span></div>
              </div>
            }
          />
          <FactorCard
            label="Resolution Time"
            score={healthData.factors.resolutionTime.score}
            icon={Clock}
            weight={healthData.factors.resolutionTime.weight}
            details={
              <div className="space-y-1 text-[10px] text-muted-foreground">
                <div className="flex justify-between"><span>Avg Time</span><span className="font-semibold text-foreground">{healthData.factors.resolutionTime.avgHours}h</span></div>
                <div className="flex justify-between"><span>Resolved</span><span className="font-semibold text-foreground">{healthData.factors.resolutionTime.totalResolved}</span></div>
              </div>
            }
          />
          <FactorCard
            label="Alert Severity"
            score={healthData.factors.alertSeverity.score}
            icon={ShieldAlert}
            weight={healthData.factors.alertSeverity.weight}
            details={
              <div className="space-y-1 text-[10px] text-muted-foreground">
                <div className="flex justify-between"><span>Critical</span><span className="font-semibold text-red-600">{healthData.factors.alertSeverity.critical}</span></div>
                <div className="flex justify-between"><span>High</span><span className="font-semibold text-orange-600">{healthData.factors.alertSeverity.high}</span></div>
                <div className="flex justify-between"><span>Medium</span><span className="font-semibold text-amber-600">{healthData.factors.alertSeverity.medium}</span></div>
                <div className="flex justify-between"><span>Low</span><span className="font-semibold text-emerald-600">{healthData.factors.alertSeverity.low}</span></div>
              </div>
            }
          />
        </div>
      </div>

      {/* ── Predictive Insights ── */}
      {allPredictions.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-red-600" />
            Predictive Insights
            <Badge variant="destructive" className="text-[9px] h-5">
              {allPredictions.length}
            </Badge>
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {allPredictions.map((pred, i) => (
              <PredictionCard
                key={`${pred.type}-${i}`}
                prediction={pred}
                onCreateTicket={handleCreateTicket}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Area Breakdown ── */}
      {healthData.areas.length > 0 && (
        <Card className="border shadow-sm rounded-xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Wifi className="h-4 w-4 text-red-600" />
              Area Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="max-h-72 overflow-y-auto custom-scrollbar">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] font-semibold">Area</TableHead>
                    <TableHead className="text-[10px] font-semibold text-right">Subscribers</TableHead>
                    <TableHead className="text-[10px] font-semibold text-right">Devices</TableHead>
                    <TableHead className="text-[10px] font-semibold text-right">Complaints (7d)</TableHead>
                    <TableHead className="text-[10px] font-semibold text-right">Density /100</TableHead>
                    <TableHead className="text-[10px] font-semibold text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {healthData.areas
                    .sort((a, b) => b.densityPer100 - a.densityPer100)
                    .map((area) => {
                      const statusColor = area.densityPer100 > 10 ? "text-red-600" : area.densityPer100 > 5 ? "text-amber-600" : "text-emerald-600";
                      const statusLabel = area.densityPer100 > 10 ? "Critical" : area.densityPer100 > 5 ? "Warning" : "Healthy";
                      return (
                        <TableRow key={area.areaId} className="hover:bg-muted/30">
                          <TableCell className="text-xs font-medium">{area.areaName}</TableCell>
                          <TableCell className="text-xs text-right tabular-nums">{area.subscriberCount}</TableCell>
                          <TableCell className="text-xs text-right tabular-nums">{area.deviceCount}</TableCell>
                          <TableCell className="text-xs text-right tabular-nums font-semibold">{area.complaints7d}</TableCell>
                          <TableCell className="text-xs text-right tabular-nums">{area.densityPer100}</TableCell>
                          <TableCell className="text-xs text-right">
                            <span className={`font-semibold ${statusColor}`}>{statusLabel}</span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Alert Summary ── */}
      {healthData.activeAlerts.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Alert Count Summary */}
          <Card className="border shadow-sm rounded-xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-600" />
                Active Alerts Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3 text-center">
                  <p className="text-2xl font-black text-red-600 tabular-nums">{healthData.factors.alertSeverity.critical}</p>
                  <p className="text-[10px] font-medium text-red-600 mt-0.5">Critical</p>
                </div>
                <div className="rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 p-3 text-center">
                  <p className="text-2xl font-black text-orange-600 tabular-nums">{healthData.factors.alertSeverity.high}</p>
                  <p className="text-[10px] font-medium text-orange-600 mt-0.5">High</p>
                </div>
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-center">
                  <p className="text-2xl font-black text-amber-600 tabular-nums">{healthData.factors.alertSeverity.medium}</p>
                  <p className="text-[10px] font-medium text-amber-600 mt-0.5">Medium</p>
                </div>
                <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3 text-center">
                  <p className="text-2xl font-black text-green-600 tabular-nums">{healthData.factors.alertSeverity.low}</p>
                  <p className="text-[10px] font-medium text-green-600 mt-0.5">Low</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recent Alerts */}
          <Card className="border shadow-sm rounded-xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Zap className="h-4 w-4 text-red-600" />
                Recent Alerts
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-2">
                {healthData.activeAlerts.slice(0, 10).map((alert) => (
                  <div key={alert.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <Badge className={`text-[8px] px-1 py-0 h-4 shrink-0 border ${severityBgClass(alert.severity)}`}>
                      {alert.severity.slice(0, 1)}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium text-foreground truncate">
                        {alert.title || alert.message.slice(0, 60)}
                      </p>
                      <p className="text-[9px] text-muted-foreground">
                        {new Date(alert.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Offline Devices ── */}
      {healthData.offlineDevices.length > 0 && (
        <Card className="border shadow-sm rounded-xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <WifiOff className="h-4 w-4 text-red-600" />
              Offline Devices
              <Badge variant="destructive" className="text-[9px] h-5">
                {healthData.offlineDevices.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="max-h-48 overflow-y-auto custom-scrollbar">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] font-semibold">Device</TableHead>
                    <TableHead className="text-[10px] font-semibold">Type</TableHead>
                    <TableHead className="text-[10px] font-semibold">IP Address</TableHead>
                    <TableHead className="text-[10px] font-semibold">Last Seen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {healthData.offlineDevices.map((dev) => (
                    <TableRow key={dev.id} className="hover:bg-muted/30">
                      <TableCell className="text-xs font-medium">{dev.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{dev.type}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">{dev.ipAddress}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {dev.lastSeenAt
                          ? new Date(dev.lastSeenAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                          : "Never"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Recommendations ── */}
      {healthData.recommendations.length > 0 && (
        <Card className="border border-amber-200 dark:border-amber-800 shadow-sm rounded-xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-600" />
              Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-2">
              {healthData.recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <ArrowUpRight className="h-3 w-3 text-amber-600 shrink-0 mt-0.5" />
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
