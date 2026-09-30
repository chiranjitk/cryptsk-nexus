"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Activity,
  Server,
  Network,
  Zap,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Cpu,
  Settings,
  AlertTriangle,
  Shield,
  Database,
  Layers,
  Users,
  Boxes,
  Power,
  Pause,
  Play,
  Radio,
  Trash,
  Trash2,
  Plus,
  Download,
  Search,
  Gauge,
  Clock,
  Filter,
  BarChart3,
  Cpu as CpuIcon,
  PlayCircle,
  ChevronDown,
  ChevronRight,
  Eye,
  PieChart as PieChartIcon,
  LineChart as LineChartIcon,
  TrendingUp,
  Hash,
  ArrowRightLeft,
  Globe2,
  Sparkles,
} from "lucide-react";
import {
  LineChart as RechartsLineChart,
  Line as RechartsLine,
  BarChart as RechartsBarChart,
  Bar as RechartsBar,
  PieChart as RechartsPieChart,
  Pie as RechartsPie,
  Area as RechartsArea,
  AreaChart as RechartsAreaChart,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend as RechartsLegend,
} from "recharts";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip as UITooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowUp,
  ArrowDown,
  Info,
  Timer,
  RotateCcw,
  FileCode,
  Bug,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────
// Shared types & helpers
// ─────────────────────────────────────────────────────────────────
type AnyRecord = Record<string, any>;

function formatBytes(bytes: number | string | undefined | null): string {
  if (bytes === undefined || bytes === null) return "—";
  const n = typeof bytes === "string" ? parseInt(bytes, 10) : bytes;
  if (isNaN(n) || n === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(n) / Math.log(1024));
  return `${(n / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatTime(iso: string | number | undefined | null): string {
  if (!iso) return "—";
  try {
    const d = typeof iso === "number" ? new Date(iso) : new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return String(iso);
  }
}

function formatDuration(ms: number | undefined | null): string {
  if (ms === undefined || ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function truncate(s: string | undefined | null, n = 12): string {
  if (!s) return "—";
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

// Status badge colors (slate/emerald/amber/red — no indigo/blue)
function statusBadgeVariant(
  status: string | undefined | null
): { className: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  const s = (status || "").toUpperCase();
  if (["UP", "ACTIVE", "OK", "CONNECTED", "HEALTHY", "VERIFIED", "FRESH", "PROGRAMMED"].includes(s)) {
    return { className: "bg-emerald-100 text-emerald-800 border-emerald-200", variant: "outline" };
  }
  if (["DOWN", "ERROR", "FAILED", "STALE", "DISCONNECTED"].includes(s)) {
    return { className: "bg-red-100 text-red-800 border-red-200", variant: "outline" };
  }
  if (["RECOVERING", "PENDING", "WARNING", "WARN"].includes(s)) {
    return { className: "bg-amber-100 text-amber-800 border-amber-200", variant: "outline" };
  }
  return { className: "bg-slate-100 text-slate-700 border-slate-200", variant: "outline" };
}

function riskBadge(level: string | undefined | null): React.ReactNode {
  const l = (level || "").toUpperCase();
  if (l === "CRITICAL") {
    return <Badge className="bg-red-600 text-white border-red-700 font-bold">CRITICAL</Badge>;
  }
  if (l === "HIGH") {
    return <Badge className="bg-red-100 text-red-800 border-red-200">HIGH</Badge>;
  }
  if (l === "MEDIUM") {
    return <Badge className="bg-amber-100 text-amber-800 border-amber-200">MEDIUM</Badge>;
  }
  if (l === "LOW") {
    return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">LOW</Badge>;
  }
  return <Badge variant="secondary">{level || "UNKNOWN"}</Badge>;
}

// ─────────────────────────────────────────────────────────────────
// Reusable error / loading / empty cards
// ─────────────────────────────────────────────────────────────────
function ServiceUnavailable({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 p-4 flex items-start gap-3">
      <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
      <div className="flex-1">
        <div className="font-medium text-red-900 dark:text-red-200">
          Service Unavailable
        </div>
        <div className="text-sm text-red-700/80 dark:text-red-300/80 mt-1">
          {message ||
            "Could not reach the VPP adapter, session-engine, or nat-logger service. The parallel subagent building this service may still be running."}
        </div>
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            className="mt-3 border-red-300 text-red-700 hover:bg-red-100"
            onClick={onRetry}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}

function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 p-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-2">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className="h-8 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// TAB 1: OVERVIEW
// ─────────────────────────────────────────────────────────────────
// Stat card color mapping (text-XXX-600 → hex for sparkline + hover border class).
// Palette restricted to slate/emerald/amber/red/purple/rose/cyan — NO indigo/blue.
const STAT_COLOR_HEX: Record<string, string> = {
  "text-emerald-600": "#059669",
  "text-amber-600": "#d97706",
  "text-red-600": "#dc2626",
  "text-slate-600": "#475569",
  "text-purple-600": "#9333ea",
  "text-rose-600": "#e11d48",
  "text-cyan-600": "#0891b2",
};

const STAT_COLOR_BORDER: Record<string, string> = {
  "text-emerald-600": "hover:border-emerald-300",
  "text-amber-600": "hover:border-amber-300",
  "text-red-600": "hover:border-red-300",
  "text-slate-600": "hover:border-slate-300",
  "text-purple-600": "hover:border-purple-300",
  "text-rose-600": "hover:border-rose-300",
  "text-cyan-600": "hover:border-cyan-300",
};

// Policy object type → color map (color-coded per §29/§32/§33/§34/§35 categories)
const POLICY_TYPE_COLORS: Record<
  string,
  { bar: string; text: string; bg: string; hex: string }
> = {
  ACL: { bar: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50", hex: "#10b981" },
  POLICER: { bar: "bg-amber-500", text: "text-amber-700", bg: "bg-amber-50", hex: "#f59e0b" },
  NAT: { bar: "bg-purple-500", text: "text-purple-700", bg: "bg-purple-50", hex: "#a855f7" },
  VRF: { bar: "bg-slate-500", text: "text-slate-700", bg: "bg-slate-50", hex: "#64748b" },
  QOS: { bar: "bg-rose-500", text: "text-rose-700", bg: "bg-rose-50", hex: "#f43f5e" },
  CLASSIFICATION: { bar: "bg-cyan-500", text: "text-cyan-700", bg: "bg-cyan-50", hex: "#06b6d4" },
};
const POLICY_TYPE_DEFAULT = {
  bar: "bg-slate-400",
  text: "text-slate-600",
  bg: "bg-slate-50",
  hex: "#94a3b8",
};

// Map a recovery log event string to a chart cell color (no indigo/blue).
function recoveryEventColor(event: string): string {
  const e = (event || "").toUpperCase();
  if (e.includes("FAIL")) return "#e11d48"; // rose-600
  if (e.includes("RESTART")) return "#dc2626"; // red-600
  if (e.includes("REBUILD") || e.includes("RECOVER")) return "#059669"; // emerald-600
  if (e.includes("SNAPSHOT") || e.includes("PERSIST")) return "#9333ea"; // purple-600
  return "#71717a"; // zinc-500
}

// Format adapter uptime (seconds → "5m 30s" / "1h 12m" / "45s")
function formatUptime(seconds: number | string | undefined | null): string {
  if (seconds === undefined || seconds === null) return "—";
  const s = typeof seconds === "string" ? parseInt(seconds, 10) : seconds;
  if (isNaN(s) || s < 0) return "—";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m < 60) return `${m}m ${sec}s`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm}m`;
}

// Tiny inline sparkline for StatCard trend display (recharts Area mini-chart)
function Sparkline({
  data,
  color,
  id,
}: {
  data: number[];
  color: string;
  id: string;
}) {
  if (!data || data.length < 2) return null;
  const chartData = data.map((v, i) => ({ i, v }));
  const gradientId = `spark-grad-${id}`;
  return (
    <ResponsiveContainer width="100%" height={28}>
      <RechartsAreaChart data={chartData} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.4} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <RechartsArea
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#${gradientId})`}
          isAnimationActive={false}
        />
      </RechartsAreaChart>
    </ResponsiveContainer>
  );
}

// Compact labeled row for the Adapter Stats card grid
function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-mono text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

// Enhanced StatCard: framer-motion hover lift + optional sparkline + optional delta arrow + tooltip
function StatCard({
  icon: Icon,
  label,
  value,
  color,
  loading,
  sub,
  trend,
  delta,
  tooltip,
  index = 0,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  color: string;
  loading?: boolean;
  sub?: React.ReactNode;
  trend?: { value: number; label: string }[];
  delta?: { value: number; positive: boolean };
  tooltip?: string;
  index?: number;
}) {
  const sparkColor = STAT_COLOR_HEX[color] || "#475569";
  const hoverBorder = STAT_COLOR_BORDER[color] || "hover:border-slate-300";
  const sparkId = React.useId();
  const trendValues = trend?.map((t) => t.value) || [];

  const card = (
    <Card className={`transition-colors border ${hoverBorder} h-full`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 font-medium text-muted-foreground">
          <Icon className={`h-4 w-4 ${color}`} />
          {label}
          {tooltip && <Info className="h-3 w-3 text-muted-foreground/50 ml-auto" />}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <>
            <Skeleton className="h-7 w-20 mb-2 animate-pulse" />
            <Skeleton className="h-1.5 w-full animate-pulse" />
          </>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold tracking-tight">{value}</div>
              {delta && (
                <span
                  className={`text-xs font-semibold flex items-center gap-0.5 ${
                    delta.positive ? "text-emerald-600" : "text-red-600"
                  }`}
                >
                  {delta.positive ? (
                    <ArrowUp className="h-3 w-3" />
                  ) : (
                    <ArrowDown className="h-3 w-3" />
                  )}
                  {Math.abs(delta.value)}
                </span>
              )}
            </div>
            {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
            {trendValues.length > 1 && (
              <div className="mt-2 -mb-1">
                <Sparkline data={trendValues} color={sparkColor} id={sparkId} />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, type: "spring", stiffness: 200 }}
      className="h-full"
    >
      {tooltip ? (
        <UITooltip>
          <TooltipTrigger asChild>
            <motion.div
              whileHover={{ y: -2 }}
              transition={{ type: "spring", stiffness: 200 }}
              className="h-full"
            >
              {card}
            </motion.div>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="max-w-[220px] text-xs">{tooltip}</p>
          </TooltipContent>
        </UITooltip>
      ) : (
        <motion.div
          whileHover={{ y: -2 }}
          transition={{ type: "spring", stiffness: 200 }}
          className="h-full"
        >
          {card}
        </motion.div>
      )}
    </motion.div>
  );
}

function OverviewTab() {
  const queryClient = useQueryClient();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showInterfacesDialog, setShowInterfacesDialog] = useState(false);

  const healthQ = useQuery({
    queryKey: ["vpp-health"],
    queryFn: async () => {
      const res = await fetch("/api/vpp?action=health");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: autoRefresh ? 5000 : false,
    retry: 1,
  });

  const stateQ = useQuery({
    queryKey: ["vpp-state"],
    queryFn: async () => {
      const res = await fetch("/api/vpp?action=state");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: autoRefresh ? 10000 : false,
    retry: 1,
  });

  const interfacesQ = useQuery({
    queryKey: ["vpp-interfaces"],
    queryFn: async () => {
      const res = await fetch("/api/vpp?action=interfaces");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: autoRefresh ? 10000 : false,
    retry: 1,
  });

  const configQ = useQuery({
    queryKey: ["vpp-config"],
    queryFn: async () => {
      const res = await fetch("/api/vpp?action=config-generate");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: false,
    retry: 1,
  });

  const recoveryQ = useQuery({
    queryKey: ["vpp-recovery-logs"],
    queryFn: async () => {
      const res = await fetch("/api/vpp?action=recovery-logs");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: autoRefresh ? 10000 : false,
    retry: 1,
  });

  const simulateRestartMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/vpp?action=simulate-restart", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      return data;
    },
    onSuccess: () => {
      toast.success("VPP restart simulated — recovery should begin");
      queryClient.invalidateQueries({ queryKey: ["vpp-recovery-logs"] });
      queryClient.invalidateQueries({ queryKey: ["vpp-health"] });
    },
    onError: (err: Error) => toast.error(err.message || "Simulate restart failed"),
  });

  const triggerRecoveryMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/vpp?action=restart-recovery", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      return data;
    },
    onSuccess: () => {
      toast.success("VPP recovery triggered");
      queryClient.invalidateQueries({ queryKey: ["vpp-recovery-logs"] });
      queryClient.invalidateQueries({ queryKey: ["vpp-state"] });
    },
    onError: (err: Error) => toast.error(err.message || "Recovery trigger failed"),
  });

  const reconcileMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/vpp?action=reconcile", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      return data;
    },
    onSuccess: () => {
      toast.success("Dataplane reconciliation complete");
      queryClient.invalidateQueries({ queryKey: ["vpp-config"] });
      queryClient.invalidateQueries({ queryKey: ["vpp-state"] });
    },
    onError: (err: Error) => toast.error(err.message || "Reconcile failed"),
  });

  // Trigger session-engine reconciliation (§40) — iterates ACTIVE sessions, calls /vpp/rebuild
  const reconcileSessionsMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/vpp?action=reconcile-sessions", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      return data;
    },
    onSuccess: () => {
      toast.success("Session reconciliation triggered");
      queryClient.invalidateQueries({ queryKey: ["vpp-recovery-logs"] });
      queryClient.invalidateQueries({ queryKey: ["vpp-reconciliation-logs"] });
    },
    onError: (err: Error) => toast.error(err.message || "Session reconciliation failed"),
  });

  const downloadConfig = () => {
    const txt =
      configQ.data?.config || configQ.data?.configText || JSON.stringify(configQ.data || {}, null, 2);
    const blob = new Blob([txt], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vpp-config-${Date.now()}.conf`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Config downloaded");
  };

  const health: AnyRecord = healthQ.data || {};
  const state: AnyRecord = stateQ.data || {};
  const interfaces: AnyRecord[] = interfacesQ.data?.interfaces || interfacesQ.data?.items || [];
  const recoveryLogs: AnyRecord[] = recoveryQ.data?.logs || recoveryQ.data?.items || recoveryQ.data?.data || [];
  const stats: AnyRecord = health.stats || state.stats || state.policyObjects ? state : {};
  // Clean stats accessor (prefers health.stats then state.stats; the `stats` var above has odd ternary precedence)
  const statsObj: AnyRecord = (health.stats as AnyRecord) || (state.stats as AnyRecord) || {};
  const configText: string = configQ.data?.config || configQ.data?.configText || "";

  const vppEpoch = state.epoch ?? health.epoch ?? state.vppEpoch ?? "—";
  const policyObjectsRaw =
    state.policyObjects ?? state.policyObjectsCount ?? health.policyObjects ?? 0;
  // policyObjects may be either a number (count) OR an object {ACL:N, POLICER:N, ...}
  const policyObjectsCount: number =
    typeof policyObjectsRaw === "number"
      ? Number(policyObjectsRaw)
      : policyObjectsRaw && typeof policyObjectsRaw === "object"
        ? (Object.values(policyObjectsRaw).reduce(
            (sum: number, v: unknown) => sum + (typeof v === "number" ? v : 0),
            0
          ) as number)
        : 0;
  const subscribersProgrammed =
    state.subscribersProgrammed ?? state.activeSubscribers ?? health.subscribersProgrammed ?? 0;
  // API returns vppLastRestartAt (camelCase) — fall back to legacy lastRestartAt
  const lastRestartAt =
    state.vppLastRestartAt ?? health.vppLastRestartAt ?? state.lastRestartAt ?? health.lastRestartAt;

  // Derived values for the 5 NEW stat cards (uptime, rebuilds, restarts, configs, errors)
  const adapterUptime = formatUptime(health.uptime ?? state.uptime);
  const rebuildsTotal = Number(statsObj.rebuilds ?? 0);
  const restartsSimulated = Number(statsObj.restartsSimulated ?? 0);
  const configsGenerated = Number(statsObj.configsGenerated ?? 0);
  const errorsCount = Number(statsObj.errors ?? 0);
  const programmedCount = Number(statsObj.programmed ?? 0);
  const removedCount = Number(statsObj.removed ?? 0);
  const lastGenerateAt = statsObj.lastGenerateAt;

  // Policy object breakdown (object form: {ACL:N, POLICER:N, NAT:N, VRF:N, QoS:N, CLASSIFICATION:N})
  const policyObjectsBreakdown: Record<string, number> | null =
    policyObjectsRaw && typeof policyObjectsRaw === "object" && !Array.isArray(policyObjectsRaw)
      ? (Object.fromEntries(
          Object.entries(policyObjectsRaw as Record<string, unknown>)
            .filter(([, v]) => typeof v === "number")
            .map(([k, v]) => [k, v] as [string, number])
        ) as Record<string, number>)
      : null;

  // Recovery timeline chart data (last 10 logs, reversed → oldest first for left-to-right reading)
  const recoveryChartData = recoveryLogs
    .slice(0, 10)
    .map((log) => {
      const ts = log.createdAt || log.timestamp;
      let timeLabel = "—";
      try {
        if (ts) {
          const d = new Date(ts);
          if (!isNaN(d.getTime())) {
            timeLabel = d.toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
            });
          }
        }
      } catch {
        /* keep default "—" */
      }
      return {
        time: timeLabel,
        sessionsAffected: Number(log.sessionsAffected ?? log.affected ?? 0),
        event: (log.event || log.eventType || "RECOVERY") as string,
      };
    })
    .reverse();

  const healthErr = healthQ.error;
  const stateErr = stateQ.error;
  const recoveryErr = recoveryQ.error;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="overview-content"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="space-y-6"
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Activity className="h-5 w-5 text-emerald-600" />
              Dataplane Overview
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              VPP v26.06 + DPDK live state, restart recovery, and reconciliation.
            </p>
          </div>
          <Button
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${autoRefresh ? "animate-spin" : ""}`} />
            {autoRefresh ? "Auto ON (5s)" : "Auto OFF"}
          </Button>
        </div>

        {/* Stats grid — 9 cards (4-col on lg+, stacks on sm) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Zap}
            label="VPP Epoch"
            value={vppEpoch}
            color="text-amber-600"
            loading={stateQ.isLoading && !stateErr}
            sub={stateErr ? undefined : "Rebuild counter"}
            tooltip="Increments every time VPP restarts. The session-engine detects the bump and rebuilds all subscriber policies."
            index={0}
          />
          <StatCard
            icon={Boxes}
            label="Policy Objects"
            value={policyObjectsCount}
            color="text-emerald-600"
            loading={stateQ.isLoading && !stateErr}
            sub="ACL/Policer/QoS/NAT/VRF"
            tooltip="Total policy objects programmed into VPP across all types (ACL, POLICER, NAT, VRF, QoS, CLASSIFICATION)."
            index={1}
          />
          <StatCard
            icon={Users}
            label="Subscribers Programmed"
            value={subscribersProgrammed}
            color="text-slate-600"
            loading={stateQ.isLoading && !stateErr}
            tooltip="Active subscriber sessions with VPP policy state (policer + NAT + ACL) in the dataplane."
            index={2}
          />
          <StatCard
            icon={Clock}
            label="Last Restart"
            value={lastRestartAt ? formatTime(lastRestartAt) : "—"}
            color="text-red-600"
            loading={stateQ.isLoading && !stateErr}
            sub={lastRestartAt ? "Detected by session-engine" : "No restarts detected"}
            tooltip="Timestamp of the most recent VPP epoch bump detected by the session-engine restart poller (5s interval)."
            index={3}
          />
          <StatCard
            icon={Timer}
            label="Adapter Uptime"
            value={adapterUptime}
            color="text-cyan-600"
            loading={healthQ.isLoading && !healthErr}
            sub="vpp-adapter process"
            tooltip="Time since the vpp-adapter service (port 3015) started. Resets on adapter restart."
            index={4}
          />
          <StatCard
            icon={RotateCcw}
            label="Rebuilds Total"
            value={rebuildsTotal}
            color="text-purple-600"
            loading={healthQ.isLoading && !healthErr}
            sub="Policy rebuilds"
            tooltip="Total number of times VPP policies have been rebuilt from session snapshots (restart recovery + manual triggers)."
            index={5}
          />
          <StatCard
            icon={Power}
            label="Restarts Simulated"
            value={restartsSimulated}
            color="text-amber-600"
            loading={healthQ.isLoading && !healthErr}
            sub="Simulated epoch bumps"
            tooltip="Number of times the 'Simulate VPP Restart' button has been clicked (dev/test only — production VPP restarts come from real binary crashes)."
            index={6}
          />
          <StatCard
            icon={FileCode}
            label="Configs Generated"
            value={configsGenerated}
            color="text-emerald-600"
            loading={healthQ.isLoading && !healthErr}
            sub=".conf files generated"
            tooltip="Total VPP config generations. Each /config/generate call increments this counter."
            index={7}
          />
          <StatCard
            icon={Bug}
            label="Errors"
            value={errorsCount}
            color={errorsCount > 0 ? "text-red-600" : "text-emerald-600"}
            loading={healthQ.isLoading && !healthErr}
            sub={errorsCount > 0 ? "Investigate immediately" : "All systems nominal"}
            delta={errorsCount > 0 ? { value: errorsCount, positive: false } : undefined}
            tooltip="Cumulative count of VPP adapter errors (programming failures, verification failures, config generation errors)."
            index={8}
          />
        </div>

        {/* Health state + connection status */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5 text-emerald-600" />
                VPP Adapter Health
              </CardTitle>
              <CardDescription>
                Live status from <code>/api/vpp?action=health</code>
              </CardDescription>
            </CardHeader>
            <CardContent>
              {healthErr ? (
                <ServiceUnavailable
                  message={healthErr.message}
                  onRetry={() => healthQ.refetch()}
                />
              ) : healthQ.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-6 w-48 animate-pulse" />
                  <Skeleton className="h-4 w-full animate-pulse" />
                  <Skeleton className="h-4 w-3/4 animate-pulse" />
                </div>
              ) : (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <Badge
                      className={
                        health.vppConnected
                          ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                          : "bg-red-100 text-red-800 border-red-200"
                      }
                    >
                      {health.status || (health.vppConnected ? "OK" : "DOWN")}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">VPP Connected</span>
                    <span className="font-mono">
                      {health.vppConnected ? "YES" : "NO"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Uptime</span>
                    <span className="font-mono">
                      {typeof health.uptime === "number" ? `${health.uptime}s` : health.uptime || "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Interfaces</span>
                    <span className="font-mono">
                      {health.interfaces ?? interfaces.length}
                    </span>
                  </div>
                  {health.stats && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Configs Generated</span>
                      <span className="font-mono">
                        {health.stats.configsGenerated ?? 0}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Network className="h-5 w-5 text-emerald-600" />
                VPP Interfaces
              </CardTitle>
              <CardDescription>
                Dataplane interfaces registered with VPP
              </CardDescription>
            </CardHeader>
            <CardContent>
              {interfacesQ.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full animate-pulse" />
                  ))}
                </div>
              ) : interfacesQ.error ? (
                <ServiceUnavailable
                  message={(interfacesQ.error as Error).message}
                  onRetry={() => interfacesQ.refetch()}
                />
              ) : interfaces.length === 0 ? (
                <EmptyState
                  icon={Network}
                  title="VPP Binary Not Connected"
                  description="The VPP adapter is running in policy-management mode. In production with DPDK + VPP binary, live interfaces will appear here."
                  size="sm"
                >
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setShowInterfacesDialog(true)}
                  >
                    <Info className="h-4 w-4 mr-1.5" />
                    Learn More
                  </Button>
                </EmptyState>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto cryptsk-scrollbar">
                  {interfaces.map((iface, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between border rounded-md p-3 bg-muted/30"
                    >
                      <div className="min-w-0">
                        <div className="font-mono font-medium truncate">
                          {iface.name || iface.dev_name || `iface-${i}`}
                        </div>
                        {iface.mac && (
                          <div className="text-xs text-muted-foreground">{iface.mac}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          className={
                            (iface.state === "up" || iface.link === "up")
                              ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                              : "bg-slate-100 text-slate-700 border-slate-200"
                          }
                        >
                          {iface.state || iface.link || "?"}
                        </Badge>
                        {iface.speed && (
                          <span className="text-xs text-muted-foreground">
                            {iface.speed}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Adapter Stats + Policy Object Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-slate-600" />
                Adapter Stats
              </CardTitle>
              <CardDescription>
                Cumulative counters from vpp-adapter since process start
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                <StatRow label="Configs Generated" value={configsGenerated} />
                <StatRow label="Programmed" value={programmedCount} />
                <StatRow label="Removed" value={removedCount} />
                <StatRow label="Rebuilds" value={rebuildsTotal} />
                <StatRow label="Restarts Simulated" value={restartsSimulated} />
                <StatRow
                  label="Errors"
                  value={
                    <span className="flex items-center gap-2">
                      {errorsCount}
                      {errorsCount > 0 && (
                        <Badge className="bg-red-100 text-red-800 border-red-200 text-[10px] px-1.5 py-0">
                          ATTENTION
                        </Badge>
                      )}
                    </span>
                  }
                />
                <StatRow
                  label="Last Generate At"
                  value={lastGenerateAt ? formatTime(lastGenerateAt) : "—"}
                />
                <StatRow label="Adapter Uptime" value={adapterUptime} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-emerald-600" />
                Policy Objects by Type
              </CardTitle>
              <CardDescription>
                Breakdown of VPP policy objects across all categories
              </CardDescription>
            </CardHeader>
            <CardContent>
              {policyObjectsBreakdown && Object.keys(policyObjectsBreakdown).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(policyObjectsBreakdown).map(([type, count]) => {
                    const key = type.toUpperCase();
                    const colors = POLICY_TYPE_COLORS[key] || POLICY_TYPE_DEFAULT;
                    const pct =
                      policyObjectsCount > 0 ? (count / policyObjectsCount) * 100 : 0;
                    return (
                      <div key={type} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className={`font-medium ${colors.text}`}>{type}</span>
                          <span className="font-mono text-muted-foreground">{count}</span>
                        </div>
                        <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                          <motion.div
                            className={`h-full ${colors.bar} rounded-full`}
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.6, ease: "easeOut" }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <div className="pt-3 mt-3 border-t flex items-center justify-between text-sm">
                    <span className="text-muted-foreground font-medium">Total</span>
                    <span className="font-mono font-bold text-foreground">
                      {policyObjectsCount}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground py-6 text-center">
                  No policy object breakdown available.
                  <br />
                  <span className="text-xs">
                    Policy objects are counted in aggregate only.
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recovery Timeline — bar chart + compact table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Power className="h-5 w-5 text-amber-600" />
              VPP Restart Recovery
            </CardTitle>
            <CardDescription>
              Last 10 recovery events (§41). The session-engine detects VPP restart,
              loads active session snapshots, rebuilds VPP policies, and verifies.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 mb-4">
              <Button
                size="sm"
                variant="outline"
                onClick={() => simulateRestartMut.mutate()}
                disabled={simulateRestartMut.isPending}
              >
                <Power className="h-4 w-4 mr-1.5" />
                {simulateRestartMut.isPending ? "Simulating…" : "Simulate VPP Restart"}
              </Button>
              <Button
                size="sm"
                onClick={() => triggerRecoveryMut.mutate()}
                disabled={triggerRecoveryMut.isPending}
              >
                <RefreshCw className="h-4 w-4 mr-1.5" />
                {triggerRecoveryMut.isPending ? "Triggering…" : "Trigger Recovery"}
              </Button>
            </div>

            {recoveryErr ? (
              <ServiceUnavailable
                message={(recoveryErr as Error).message}
                onRetry={() => recoveryQ.refetch()}
              />
            ) : recoveryQ.isLoading ? (
              <TableSkeleton rows={4} cols={6} />
            ) : recoveryLogs.length === 0 ? (
              <EmptyState
                icon={Power}
                title="No recovery events yet"
                description="VPP restart recovery has not been triggered. Click 'Simulate VPP Restart' to test."
                size="sm"
              />
            ) : (
              <div className="space-y-4">
                {/* Bar chart — sessionsAffected per recovery event, colored by event type */}
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsBarChart
                      data={recoveryChartData}
                      margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
                    >
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                      <YAxis
                        tick={{ fontSize: 10 }}
                        stroke="#94a3b8"
                        allowDecimals={false}
                        width={32}
                      />
                      <RechartsTooltip
                        cursor={{ fill: "rgba(148, 163, 184, 0.1)" }}
                        contentStyle={{
                          borderRadius: 8,
                          border: "1px solid #e2e8f0",
                          fontSize: 12,
                          padding: "8px 12px",
                          background: "#ffffff",
                        }}
                        formatter={(value, _name, item) => [
                          `${value} session${Number(value) === 1 ? "" : "s"}`,
                          ((item as AnyRecord)?.payload?.event as string) || "Recovery",
                        ]}
                        labelFormatter={(label) => `Time: ${label}`}
                      />
                      <RechartsBar dataKey="sessionsAffected" radius={[4, 4, 0, 0]}>
                        {recoveryChartData.map((entry, i) => (
                          <Cell key={`cell-${i}`} fill={recoveryEventColor(entry.event)} />
                        ))}
                      </RechartsBar>
                    </RechartsBarChart>
                  </ResponsiveContainer>
                </div>

                {/* Compact recovery logs table */}
                <div className="max-h-72 overflow-y-auto cryptsk-scrollbar rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Event</TableHead>
                        <TableHead className="text-xs">Epoch</TableHead>
                        <TableHead className="text-xs">Sessions Affected</TableHead>
                        <TableHead className="text-xs">Recovered / Failed</TableHead>
                        <TableHead className="text-xs">Duration</TableHead>
                        <TableHead className="text-xs">Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recoveryLogs.slice(0, 10).map((log, i) => {
                        const prevEpoch = log.prevEpoch ?? log.previousEpoch;
                        const newEpoch = log.newEpoch ?? log.currentEpoch;
                        return (
                          <TableRow key={i}>
                            <TableCell className="text-xs">
                              <Badge
                                variant="outline"
                                className={
                                  (log.event || "").includes("FAIL")
                                    ? "bg-red-100 text-red-800 border-red-200"
                                    : "bg-emerald-100 text-emerald-800 border-emerald-200"
                                }
                              >
                                {log.event || log.eventType || "RECOVERY"}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {prevEpoch !== undefined ? `${prevEpoch} → ${newEpoch}` : newEpoch ?? "—"}
                            </TableCell>
                            <TableCell className="text-xs">{log.sessionsAffected ?? log.affected ?? "—"}</TableCell>
                            <TableCell className="text-xs">
                              <span className="text-emerald-700 font-medium">
                                {log.sessionsRecovered ?? log.recovered ?? 0}
                              </span>
                              {" / "}
                              <span className="text-red-700 font-medium">
                                {log.sessionsFailed ?? log.failed ?? 0}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs">{formatDuration(log.durationMs ?? log.duration)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {formatTime(log.createdAt ?? log.timestamp)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Config + Reconciliation */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-slate-600" />
                Generated VPP Config
              </CardTitle>
              <CardDescription>
                Live-generated dataplane configuration
              </CardDescription>
            </CardHeader>
            <CardContent>
              {configQ.isLoading ? (
                <Skeleton className="h-48 w-full animate-pulse" />
              ) : configQ.error ? (
                <ServiceUnavailable
                  message={(configQ.error as Error).message}
                  onRetry={() => configQ.refetch()}
                />
              ) : (
                <>
                  <pre className="text-xs bg-muted/60 dark:bg-muted/30 p-3 rounded-md overflow-auto max-h-96 cryptsk-scrollbar whitespace-pre-wrap border">
                    {configText || "No config generated"}
                  </pre>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    onClick={downloadConfig}
                    disabled={!configText}
                  >
                    <Download className="h-4 w-4 mr-1.5" />
                    Download .conf
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-slate-600" />
                Dataplane Reconciliation
              </CardTitle>
              <CardDescription>
                Force VPP config regeneration from OSS/BSS state (subscribers, policies, NAS).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => reconcileMut.mutate()}
                  disabled={reconcileMut.isPending}
                >
                  <RefreshCw
                    className={`h-4 w-4 mr-1.5 ${reconcileMut.isPending ? "animate-spin" : ""}`}
                  />
                  {reconcileMut.isPending ? "Reconciling…" : "Reconcile Now"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => reconcileSessionsMut.mutate()}
                  disabled={reconcileSessionsMut.isPending}
                >
                  <RefreshCw
                    className={`h-4 w-4 mr-1.5 ${reconcileSessionsMut.isPending ? "animate-spin" : ""}`}
                  />
                  {reconcileSessionsMut.isPending ? "Reconciling…" : "Trigger Session Reconciliation"}
                </Button>
              </div>
              {reconcileMut.data && (
                <pre className="mt-3 text-xs bg-muted/60 dark:bg-muted/30 p-2 rounded-md border max-h-48 overflow-auto cryptsk-scrollbar">
                  {JSON.stringify(reconcileMut.data, null, 2)}
                </pre>
              )}
              {reconcileSessionsMut.data && (
                <pre className="mt-3 text-xs bg-muted/60 dark:bg-muted/30 p-2 rounded-md border max-h-48 overflow-auto cryptsk-scrollbar">
                  {JSON.stringify(reconcileSessionsMut.data, null, 2)}
                </pre>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Interfaces architecture dialog — opened by "Learn More" in the empty state */}
        <Dialog open={showInterfacesDialog} onOpenChange={setShowInterfacesDialog}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>VPP Interfaces Architecture</DialogTitle>
              <DialogDescription>
                Why interfaces may not appear in policy-management mode
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                The CRYPTSK ISP Platform uses a three-tier architecture for VPP dataplane
                management:
              </p>
              <ol className="list-decimal list-inside space-y-2 ml-2">
                <li>
                  <span className="font-medium text-foreground">OSS/BSS Layer</span> — Next.js
                  UI + PostgreSQL. Manages subscribers, plans, policies, and sessions.
                </li>
                <li>
                  <span className="font-medium text-foreground">Session Engine</span> (port
                  3010) — Orchestrates login/logout flows. Calls VPP adapter via HTTP API
                  (never <code className="text-xs">vppctl</code> directly) to enforce the hard
                  boundary between control plane and dataplane.
                </li>
                <li>
                  <span className="font-medium text-foreground">VPP Adapter</span> (port
                  3015) — Translates REST calls into VPP binary API operations. In
                  production, connects to a real VPP/DPDK binary via the GoVPP gateway.
                </li>
              </ol>
              <p>
                In this sandbox, the VPP adapter runs in{" "}
                <span className="font-medium text-foreground">policy-management mode</span> —
                it maintains in-memory policy state (policers, NAT mappings, ACLs) and
                persists SessionSnapshots to the database, but does not connect to a real VPP
                binary, so no live interfaces are reported.
              </p>
              <p>
                In production with DPDK + VPP binary deployed, this card will show all
                dataplane interfaces (DPDK, af_packet, virtio, tap, vxlan, etc.) with their
                state, MAC address, link speed, and live statistics counters.
              </p>
            </div>
            <DialogClose asChild>
              <Button variant="outline" className="w-full">
                Got it
              </Button>
            </DialogClose>
          </DialogContent>
        </Dialog>
      </motion.div>
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────
// TAB 2: POLICY OBJECTS
// ─────────────────────────────────────────────────────────────────
function PolicyObjectRow({
  obj,
  kind,
  onDelete,
}: {
  obj: AnyRecord;
  kind: "acl" | "nat" | "policy";
  onDelete: (obj: AnyRecord) => void;
}) {
  const id = obj.id || obj._id || obj.name;
  const name = obj.name || obj.profileName || "(unnamed)";
  const desc = obj.description || obj.desc;
  const isEnabled = obj.isEnabled ?? obj.enabled ?? true;
  const type = obj.type || obj.policyType || obj.mode;
  const created = obj.createdAt || obj.created;
  const updated = obj.updatedAt || obj.updated;

  return (
    <TableRow>
      <TableCell className="font-mono font-medium">{name}</TableCell>
      {(kind === "policy" || kind === "acl") && (
        <TableCell>
          {type && <Badge variant="secondary">{type}</Badge>}
        </TableCell>
      )}
      <TableCell className="text-muted-foreground text-xs max-w-xs truncate">
        {desc || "—"}
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={
            isEnabled
              ? "bg-emerald-100 text-emerald-800 border-emerald-200"
              : "bg-slate-100 text-slate-600 border-slate-200"
          }
        >
          {isEnabled ? "ENABLED" : "DISABLED"}
        </Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {formatTime(created)}
      </TableCell>
      <TableCell className="text-right">
        <Button
          size="sm"
          variant="ghost"
          className="text-red-600 hover:bg-red-50"
          onClick={() => onDelete(obj)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function CreatePolicyObjectForm({
  kind,
  onCreate,
}: {
  kind: "acl" | "nat" | "policy";
  onCreate: (payload: AnyRecord) => void;
}) {
  // Local form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [defaultAction, setDefaultAction] = useState("PERMIT");
  const [rulesJson, setRulesJson] = useState("[]");
  const [publicIpStart, setPublicIpStart] = useState("");
  const [publicIpEnd, setPublicIpEnd] = useState("");
  const [portStart, setPortStart] = useState("1024");
  const [portEnd, setPortEnd] = useState("65535");
  const [natMode, setNatMode] = useState("NAT44");
  const [policyType, setPolicyType] = useState("POLICER");
  const [profileId, setProfileId] = useState("");
  const [configJson, setConfigJson] = useState("{}");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    let payload: AnyRecord = { name, description };
    if (kind === "acl") {
      payload.defaultAction = defaultAction;
      try {
        payload.rules = JSON.parse(rulesJson);
      } catch {
        setError("rulesJson must be valid JSON");
        return;
      }
    } else if (kind === "nat") {
      payload.publicIpStart = publicIpStart;
      payload.publicIpEnd = publicIpEnd;
      payload.portStart = parseInt(portStart, 10);
      payload.portEnd = parseInt(portEnd, 10);
      payload.mode = natMode;
    } else if (kind === "policy") {
      payload.type = policyType;
      if (profileId) payload.profileId = profileId;
      try {
        payload.config = JSON.parse(configJson);
      } catch {
        setError("config must be valid JSON");
        return;
      }
    }
    onCreate(payload);
    // Reset
    setName("");
    setDescription("");
    setRulesJson("[]");
    setConfigJson("{}");
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 dark:bg-muted/20 p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label htmlFor={`name-${kind}`}>Name</Label>
          <Input
            id={`name-${kind}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. ACL-INTERNET-ONLY"
          />
        </div>
        <div>
          <Label htmlFor={`desc-${kind}`}>Description</Label>
          <Input
            id={`desc-${kind}`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
          />
        </div>
      </div>

      {kind === "acl" && (
        <>
          <div>
            <Label>Default Action</Label>
            <Select value={defaultAction} onValueChange={setDefaultAction}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PERMIT">PERMIT</SelectItem>
                <SelectItem value="DENY">DENY</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor={`rules-${kind}`}>Rules (JSON array)</Label>
            <Textarea
              id={`rules-${kind}`}
              value={rulesJson}
              onChange={(e) => setRulesJson(e.target.value)}
              className="font-mono text-xs"
              rows={5}
              placeholder='[{"action":"PERMIT","src":"10.0.0.0/8","dst":"any"}]'
            />
          </div>
        </>
      )}

      {kind === "nat" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Label>Public IP Start</Label>
            <Input
              value={publicIpStart}
              onChange={(e) => setPublicIpStart(e.target.value)}
              placeholder="203.0.113.10"
            />
          </div>
          <div>
            <Label>Public IP End</Label>
            <Input
              value={publicIpEnd}
              onChange={(e) => setPublicIpEnd(e.target.value)}
              placeholder="203.0.113.100"
            />
          </div>
          <div>
            <Label>Port Start</Label>
            <Input
              type="number"
              value={portStart}
              onChange={(e) => setPortStart(e.target.value)}
            />
          </div>
          <div>
            <Label>Port End</Label>
            <Input
              type="number"
              value={portEnd}
              onChange={(e) => setPortEnd(e.target.value)}
            />
          </div>
          <div className="col-span-2 md:col-span-4">
            <Label>NAT Mode</Label>
            <Select value={natMode} onValueChange={setNatMode}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NAT44">NAT44</SelectItem>
                <SelectItem value="NAT66">NAT66</SelectItem>
                <SelectItem value="CGNAT">CGNAT (carrier-grade)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {kind === "policy" && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={policyType} onValueChange={setPolicyType}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="POLICER">POLICER</SelectItem>
                  <SelectItem value="ACL">ACL</SelectItem>
                  <SelectItem value="NAT">NAT</SelectItem>
                  <SelectItem value="VRF">VRF</SelectItem>
                  <SelectItem value="QOS">QoS</SelectItem>
                  <SelectItem value="CLASSIFICATION">CLASSIFICATION</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Profile ID (optional)</Label>
              <Input
                value={profileId}
                onChange={(e) => setProfileId(e.target.value)}
                placeholder="Link to an ACL/NAT profile"
              />
            </div>
          </div>
          <div>
            <Label htmlFor={`config-${kind}`}>Config (JSON)</Label>
            <Textarea
              id={`config-${kind}`}
              value={configJson}
              onChange={(e) => setConfigJson(e.target.value)}
              className="font-mono text-xs"
              rows={4}
              placeholder='{"rate":100000000,"burst":1000000}'
            />
          </div>
        </>
      )}

      {error && (
        <div className="text-xs text-red-600 flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}

      <Button size="sm" onClick={submit}>
        <Plus className="h-4 w-4 mr-1.5" />
        Create
      </Button>
    </div>
  );
}

function PolicyObjectsTab() {
  const queryClient = useQueryClient();
  const [showAclForm, setShowAclForm] = useState(false);
  const [showNatForm, setShowNatForm] = useState(false);
  const [showPolicyForm, setShowPolicyForm] = useState(false);

  const aclQ = useQuery({
    queryKey: ["vpp-acl-profiles"],
    queryFn: async () => {
      const res = await fetch("/api/vpp?action=acl-profiles");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    retry: 1,
  });

  const natQ = useQuery({
    queryKey: ["vpp-nat-pools"],
    queryFn: async () => {
      const res = await fetch("/api/vpp?action=nat-pools");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    retry: 1,
  });

  const policyQ = useQuery({
    queryKey: ["vpp-policy-objects"],
    queryFn: async () => {
      const res = await fetch("/api/vpp?action=policy-objects");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    retry: 1,
  });

  const aclProfiles: AnyRecord[] = aclQ.data?.profiles || aclQ.data?.items || aclQ.data?.data || [];
  const natPools: AnyRecord[] = natQ.data?.pools || natQ.data?.items || natQ.data?.data || [];
  const policyObjects: AnyRecord[] = policyQ.data?.objects || policyQ.data?.items || policyQ.data?.data || [];

  const createMut = useMutation({
    mutationFn: async ({ kind, payload }: { kind: "acl" | "nat" | "policy"; payload: AnyRecord }) => {
      const action =
        kind === "acl"
          ? "acl-profiles-create"
          : kind === "nat"
          ? "nat-pools-create"
          : "policy-objects-create";
      const res = await fetch(`/api/vpp?action=${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      return data;
    },
    onSuccess: (_data, vars) => {
      const qk =
        vars.kind === "acl"
          ? "vpp-acl-profiles"
          : vars.kind === "nat"
          ? "vpp-nat-pools"
          : "vpp-policy-objects";
      queryClient.invalidateQueries({ queryKey: [qk] });
      toast.success(`${vars.kind.toUpperCase()} object created`);
    },
    onError: (err: Error) => toast.error(err.message || "Create failed"),
  });

  const deleteMut = useMutation({
    mutationFn: async ({ kind, id }: { kind: "acl" | "nat" | "policy"; id: string }) => {
      const action =
        kind === "acl"
          ? "acl-profiles-delete"
          : kind === "nat"
          ? "nat-pools-delete"
          : "policy-objects-delete";
      const res = await fetch(`/api/vpp?action=${action}&id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      return data;
    },
    onSuccess: (_data, vars) => {
      const qk =
        vars.kind === "acl"
          ? "vpp-acl-profiles"
          : vars.kind === "nat"
          ? "vpp-nat-pools"
          : "vpp-policy-objects";
      queryClient.invalidateQueries({ queryKey: [qk] });
      toast.success("Object deleted");
    },
    onError: (err: Error) => toast.error(err.message || "Delete failed"),
  });

  const onDelete = (kind: "acl" | "nat" | "policy") => (obj: AnyRecord) => {
    const id = String(obj.id || obj._id || obj.name);
    if (!id) {
      toast.error("Cannot delete — object has no identifier");
      return;
    }
    if (!window.confirm(`Delete ${obj.name || id}?`)) return;
    deleteMut.mutate({ kind, id });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Shield className="h-5 w-5 text-emerald-600" />
          VPP Policy Objects
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Reusable dataplane objects: ACL profiles, NAT pools, and Policier/QoS/VRF objects (§29, §32, §33).
        </p>
      </div>

      {/* ACL Profiles */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="h-5 w-5 text-slate-600" />
            ACL Profiles
            <Badge variant="secondary" className="ml-2">{aclProfiles.length}</Badge>
          </CardTitle>
          <CardDescription>
            Reusable ACL profiles (ACL-GUEST, ACL-HOTEL, ACL-ISP-BASIC, etc.)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-3">
            <Button
              size="sm"
              variant={showAclForm ? "secondary" : "outline"}
              onClick={() => setShowAclForm(!showAclForm)}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              {showAclForm ? "Cancel" : "New ACL Profile"}
            </Button>
          </div>
          {showAclForm && (
            <div className="mb-4">
              <CreatePolicyObjectForm
                kind="acl"
                onCreate={(payload) => createMut.mutate({ kind: "acl", payload })}
              />
            </div>
          )}
          {aclQ.isLoading ? (
            <TableSkeleton rows={3} cols={5} />
          ) : aclQ.error ? (
            <ServiceUnavailable
              message={(aclQ.error as Error).message}
              onRetry={() => aclQ.refetch()}
            />
          ) : aclProfiles.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="No ACL profiles"
              description="Create an ACL profile to define reusable permit/deny rules."
              size="sm"
              action={{
                label: "Create",
                onClick: () => setShowAclForm(true),
                icon: Plus,
              }}
            />
          ) : (
            <div className="rounded-md border max-h-96 overflow-y-auto cryptsk-scrollbar">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Enabled</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aclProfiles.map((obj, i) => (
                    <PolicyObjectRow key={i} obj={obj} kind="acl" onDelete={onDelete("acl")} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* NAT Pools */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Network className="h-5 w-5 text-slate-600" />
            NAT Pools
            <Badge variant="secondary" className="ml-2">{natPools.length}</Badge>
          </CardTitle>
          <CardDescription>
            VPP-managed NAT pools — translation state, port allocation, NAT processing
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-3">
            <Button
              size="sm"
              variant={showNatForm ? "secondary" : "outline"}
              onClick={() => setShowNatForm(!showNatForm)}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              {showNatForm ? "Cancel" : "New NAT Pool"}
            </Button>
          </div>
          {showNatForm && (
            <div className="mb-4">
              <CreatePolicyObjectForm
                kind="nat"
                onCreate={(payload) => createMut.mutate({ kind: "nat", payload })}
              />
            </div>
          )}
          {natQ.isLoading ? (
            <TableSkeleton rows={3} cols={5} />
          ) : natQ.error ? (
            <ServiceUnavailable
              message={(natQ.error as Error).message}
              onRetry={() => natQ.refetch()}
            />
          ) : natPools.length === 0 ? (
            <EmptyState
              icon={Network}
              title="No NAT pools"
              description="Create a NAT pool to define public IP/port ranges."
              size="sm"
              action={{
                label: "Create",
                onClick: () => setShowNatForm(true),
                icon: Plus,
              }}
            />
          ) : (
            <div className="rounded-md border max-h-96 overflow-y-auto cryptsk-scrollbar">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Enabled</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {natPools.map((obj, i) => (
                    <PolicyObjectRow key={i} obj={obj} kind="nat" onDelete={onDelete("nat")} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Policy Objects */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Boxes className="h-5 w-5 text-slate-600" />
            Policy Objects
            <Badge variant="secondary" className="ml-2">{policyObjects.length}</Badge>
          </CardTitle>
          <CardDescription>
            Policer, QoS, VRF, Classification objects linked to subscribers
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-3">
            <Button
              size="sm"
              variant={showPolicyForm ? "secondary" : "outline"}
              onClick={() => setShowPolicyForm(!showPolicyForm)}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              {showPolicyForm ? "Cancel" : "New Policy Object"}
            </Button>
          </div>
          {showPolicyForm && (
            <div className="mb-4">
              <CreatePolicyObjectForm
                kind="policy"
                onCreate={(payload) => createMut.mutate({ kind: "policy", payload })}
              />
            </div>
          )}
          {policyQ.isLoading ? (
            <TableSkeleton rows={3} cols={5} />
          ) : policyQ.error ? (
            <ServiceUnavailable
              message={(policyQ.error as Error).message}
              onRetry={() => policyQ.refetch()}
            />
          ) : policyObjects.length === 0 ? (
            <EmptyState
              icon={Boxes}
              title="No policy objects"
              description="Create a Policer/QoS/VRF object to bind to subscriber sessions."
              size="sm"
              action={{
                label: "Create",
                onClick: () => setShowPolicyForm(true),
                icon: Plus,
              }}
            />
          ) : (
            <div className="rounded-md border max-h-96 overflow-y-auto cryptsk-scrollbar">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Enabled</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {policyObjects.map((obj, i) => (
                    <PolicyObjectRow key={i} obj={obj} kind="policy" onDelete={onDelete("policy")} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// TAB 3: SESSION SNAPSHOTS
// ─────────────────────────────────────────────────────────────────
const RECOVERY_STATES = [
  "FRESH",
  "PROGRAMMED",
  "VERIFIED",
  "RECOVERING",
  "STALE",
  "FAILED",
] as const;

function SnapshotsTab() {
  const queryClient = useQueryClient();
  const [filterState, setFilterState] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const pageSize = 25;

  const snapshotsQ = useQuery({
    queryKey: ["vpp-snapshots", filterState, search, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterState !== "ALL") params.set("state", filterState);
      if (search) params.set("search", search);
      params.set("limit", String(pageSize));
      params.set("offset", String((page - 1) * pageSize));
      const res = await fetch(`/api/vpp?action=snapshots&${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 10000,
    retry: 1,
  });

  const rebuildMut = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await fetch(
        `/api/vpp?action=rebuild-session&sessionId=${encodeURIComponent(sessionId)}`,
        { method: "POST" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      return data;
    },
    onSuccess: (_data, sessionId) => {
      toast.success(`VPP rebuild triggered for ${truncate(sessionId)}`);
      queryClient.invalidateQueries({ queryKey: ["vpp-snapshots"] });
    },
    onError: (err: Error) => toast.error(err.message || "Rebuild failed"),
  });

  const snapshots: AnyRecord[] =
    snapshotsQ.data?.snapshots || snapshotsQ.data?.items || snapshotsQ.data?.data || [];
  const total: number = snapshotsQ.data?.total ?? snapshots.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Database className="h-5 w-5 text-emerald-600" />
          Session Snapshots
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Recoverable session state — used to rebuild VPP policies after VPP restart (§42).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Database className="h-4 w-4 text-slate-600" />
              Snapshots ({total})
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => snapshotsQ.refetch()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-3 mb-4">
            <div className="flex-1">
              <Label className="mb-1.5 block">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Username or framed IP"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </div>
            <div className="md:w-56">
              <Label className="mb-1.5 block">Recovery State</Label>
              <Select
                value={filterState}
                onValueChange={(v) => {
                  setFilterState(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All states" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All states</SelectItem>
                  {RECOVERY_STATES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {snapshotsQ.error ? (
            <ServiceUnavailable
              message={(snapshotsQ.error as Error).message}
              onRetry={() => snapshotsQ.refetch()}
            />
          ) : snapshotsQ.isLoading ? (
            <TableSkeleton rows={6} cols={8} />
          ) : snapshots.length === 0 ? (
            <EmptyState
              icon={Database}
              title="No session snapshots"
              description="Snapshots are created when subscribers are programmed into VPP. Try the Overview tab and run Reconcile Now."
              size="sm"
              action={{
                label: "Refresh",
                onClick: () => snapshotsQ.refetch(),
                icon: RefreshCw,
              }}
            />
          ) : (
            <>
              <div className="rounded-md border max-h-[480px] overflow-y-auto cryptsk-scrollbar">
                <Table>
                  <TableHeader className="sticky top-0 bg-card">
                    <TableRow>
                      <TableHead>Session ID</TableHead>
                      <TableHead>Username</TableHead>
                      <TableHead>Framed IP</TableHead>
                      <TableHead>MAC</TableHead>
                      <TableHead>VLAN</TableHead>
                      <TableHead>VRF</TableHead>
                      <TableHead>Policy ID</TableHead>
                      <TableHead>Epoch</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Programmed At</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {snapshots.map((s, i) => {
                      const st = s.vppRecoveryState || s.recoveryState || s.state;
                      const sb = statusBadgeVariant(st);
                      return (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs">
                            {truncate(s.sessionId || s.acctSessionId, 16)}
                          </TableCell>
                          <TableCell className="font-medium">
                            {s.username || "—"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {s.framedIp || s.framedIpAddress || "—"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {truncate(s.mac || s.callingStationId, 16)}
                          </TableCell>
                          <TableCell>{s.vlanId || "—"}</TableCell>
                          <TableCell className="font-mono text-xs">{s.vrf || "—"}</TableCell>
                          <TableCell className="font-mono text-xs">{s.policyId || "—"}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {s.vppEpoch ?? "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={sb.variant} className={sb.className}>
                              {st || "UNKNOWN"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatTime(s.vppProgrammedAt || s.programmedAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center gap-2 justify-end">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setSelectedSessionId(
                                    String(s.sessionId || s.acctSessionId || "")
                                  )
                                }
                                disabled={!(s.sessionId || s.acctSessionId)}
                              >
                                <Eye className="h-3.5 w-3.5 mr-1" />
                                View Details
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  rebuildMut.mutate(
                                    String(s.sessionId || s.acctSessionId || "")
                                  )
                                }
                                disabled={
                                  rebuildMut.isPending ||
                                  !(s.sessionId || s.acctSessionId)
                                }
                              >
                                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                                Rebuild VPP
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {/* Pagination */}
              <div className="flex items-center justify-between mt-3">
                <div className="text-xs text-muted-foreground">
                  Page {page} of {totalPages} • {total} total
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <SessionDetailDialog
        sessionId={selectedSessionId}
        onClose={() => setSelectedSessionId(null)}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// SESSION DETAIL MODAL (Snapshots tab)
// ─────────────────────────────────────────────────────────────────
function SessionDetailDialog({
  sessionId,
  onClose,
}: {
  sessionId: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const open = !!sessionId;

  const detailQ = useQuery({
    queryKey: ["vpp-snapshot-detail", sessionId],
    queryFn: async () => {
      if (!sessionId) return null;
      const res = await fetch(
        `/api/vpp?action=snapshot&sessionId=${encodeURIComponent(sessionId)}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: open,
    retry: 1,
  });

  const rebuildMut = useMutation({
    mutationFn: async (sid: string) => {
      const res = await fetch(
        `/api/vpp?action=rebuild-session&sessionId=${encodeURIComponent(sid)}`,
        { method: "POST" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      return data;
    },
    onSuccess: (_data, sid) => {
      toast.success(`VPP rebuild triggered for ${truncate(sid, 16)}`);
      queryClient.invalidateQueries({ queryKey: ["vpp-snapshots"] });
      queryClient.invalidateQueries({
        queryKey: ["vpp-snapshot-detail", sid],
      });
    },
    onError: (err: Error) => toast.error(err.message || "Rebuild failed"),
  });

  const snap: AnyRecord =
    detailQ.data?.snapshot || detailQ.data?.data || detailQ.data || {};
  const recoveryState =
    snap.vppRecoveryState || snap.recoveryState || snap.state;
  const sb = statusBadgeVariant(recoveryState);

  let configJsonPretty = "{}";
  try {
    const parsed =
      typeof snap.configJson === "string"
        ? JSON.parse(snap.configJson)
        : snap.configJson;
    configJsonPretty = JSON.stringify(parsed ?? {}, null, 2);
  } catch {
    configJsonPretty = String(snap.configJson || "{}");
  }

  const fields: { label: string; value: React.ReactNode }[] = [
    { label: "Subscriber ID", value: snap.subscriberId || "—" },
    { label: "Username", value: snap.username || "—" },
    { label: "NAS IP", value: snap.nasIp || "—" },
    { label: "NAS Port", value: snap.nasPort || "—" },
    { label: "Framed IP", value: snap.framedIp || snap.framedIpAddress || "—" },
    { label: "Framed IPv6", value: snap.framedIpv6 || "—" },
    { label: "MAC", value: snap.mac || snap.callingStationId || "—" },
    { label: "VLAN", value: snap.vlan || snap.vlanId || "—" },
    { label: "VRF", value: snap.vrf || "—" },
    { label: "IP Pool", value: snap.ipPool || "—" },
    {
      label: "Policy ID",
      value: snap.policyId || snap.vppPolicyId || "—",
    },
    {
      label: "ACL Profile ID",
      value: snap.aclProfileId || snap.vppAclProfileId || "—",
    },
    {
      label: "QoS Profile ID",
      value: snap.qosProfileId || snap.vppQosProfileId || "—",
    },
    {
      label: "NAT Profile ID",
      value: snap.natProfileId || snap.vppNatProfileId || "—",
    },
    { label: "Circuit ID", value: snap.circuitId || "—" },
    { label: "Remote ID", value: snap.remoteId || "—" },
    { label: "PPPoE Session ID", value: snap.pppoeSessionId || "—" },
    { label: "DHCP Client ID", value: snap.dhcpClientId || "—" },
    { label: "Speed Down (Kbps)", value: snap.speedDownKbps ?? "—" },
    { label: "Speed Up (Kbps)", value: snap.speedUpKbps ?? "—" },
    {
      label: "Session Timeout (s)",
      value: snap.timeoutSec ?? snap.sessionTimeout ?? "—",
    },
    { label: "VPP Epoch", value: snap.vppEpoch ?? "—" },
    {
      label: "VPP Programmed At",
      value: formatTime(snap.vppProgrammedAt),
    },
    {
      label: "VPP Recovery State",
      value: recoveryState || "—",
    },
    { label: "Snapshot Updated At", value: formatTime(snap.updatedAt) },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        a11yTitle={sessionId ? `Snapshot ${sessionId}` : "Snapshot detail"}
        className="sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="text-base text-muted-foreground">
              Session Snapshot
            </span>
            <span className="font-mono text-sm break-all">{sessionId}</span>
            {recoveryState && (
              <Badge variant={sb.variant} className={sb.className}>
                {recoveryState}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Full VPP-recoverable state for this session (§42). Fetched from
            <code className="mx-1">/api/vpp?action=snapshot</code>.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto cryptsk-scrollbar pr-1 -mr-2 space-y-4 flex-1">
          {detailQ.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : detailQ.error ? (
            <ServiceUnavailable
              message={(detailQ.error as Error).message}
              onRetry={() => detailQ.refetch()}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {fields.map((f, i) => (
                  <div
                    key={i}
                    className="rounded-md border bg-muted/30 dark:bg-muted/20 p-2"
                  >
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {f.label}
                    </div>
                    <div className="font-mono text-xs mt-0.5 break-all">
                      {f.value}
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Config JSON
                </div>
                <pre className="text-xs bg-muted/60 dark:bg-muted/30 p-3 rounded-md border max-h-64 overflow-auto cryptsk-scrollbar whitespace-pre-wrap">
                  {configJsonPretty}
                </pre>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => sessionId && rebuildMut.mutate(sessionId)}
            disabled={!sessionId || rebuildMut.isPending}
          >
            <RefreshCw
              className={`h-4 w-4 mr-1.5 ${rebuildMut.isPending ? "animate-spin" : ""}`}
            />
            {rebuildMut.isPending ? "Rebuilding…" : "Rebuild VPP"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────
// TAB: LIVE ACTIVITY — real-time session-engine event stream
// ─────────────────────────────────────────────────────────────────
const LIVE_EVENT_FILTERS = [
  { value: "all", label: "All Events" },
  { value: "sessions", label: "Sessions" },
  { value: "recovery", label: "Recovery" },
  { value: "reconciliation", label: "Reconciliation" },
  { value: "nat", label: "NAT" },
  { value: "dpi", label: "DPI" },
] as const;

type LiveEventCategory =
  | "sessions"
  | "recovery"
  | "reconciliation"
  | "nat"
  | "dpi"
  | "other";

function eventCategory(ev: AnyRecord): LiveEventCategory {
  const t = String(ev.eventType || ev.event || ev.type || "").toUpperCase();
  const ctx = String(ev.context || "").toLowerCase();
  if (
    t.includes("NAT") ||
    ctx.includes("nat_action") ||
    ctx.includes("nat_event") ||
    ctx.includes("nataction")
  ) {
    return "nat";
  }
  if (
    t === "POLICY_ENFORCE" ||
    t === "FUP_CHECK" ||
    t === "DATA_LIMIT_REACHED" ||
    t === "TIME_LIMIT_REACHED" ||
    t === "IDLE_TIMEOUT" ||
    t.includes("DPI")
  ) {
    return "dpi";
  }
  if (
    t.includes("RECONCILE") ||
    t.includes("RECONCILIATION") ||
    ctx.includes("reconciliation") ||
    t === "REBUILT_POLICIES"
  ) {
    return "reconciliation";
  }
  if (
    t.includes("RECOVERY") ||
    t === "RESTART_DETECTED" ||
    t === "NAS_REGISTER" ||
    t === "NAS_HEARTBEAT"
  ) {
    return "recovery";
  }
  if (
    t.startsWith("SESSION_") ||
    t.startsWith("AUTH_") ||
    t.startsWith("COA_") ||
    t === "ADMIN_DISCONNECT" ||
    t === "BULK_DISCONNECT"
  ) {
    return "sessions";
  }
  return "other";
}

function eventIcon(ev: AnyRecord): {
  Icon: React.ElementType;
  color: string;
} {
  const t = String(ev.eventType || ev.event || ev.type || "").toUpperCase();
  if (t === "SESSION_START") return { Icon: Activity, color: "text-emerald-600" };
  if (
    t === "SESSION_STOP" ||
    t === "ADMIN_DISCONNECT" ||
    t === "BULK_DISCONNECT" ||
    t === "SESSION_EXPIRE"
  ) {
    return { Icon: Power, color: "text-red-600" };
  }
  if (t.includes("RECOVERY") || t === "RESTART_DETECTED") {
    return { Icon: RefreshCw, color: "text-amber-600" };
  }
  if (t === "REBUILT_POLICIES") {
    return { Icon: CheckCircle2, color: "text-emerald-600" };
  }
  if (t.includes("RECONCILE") || t.includes("RECONCILIATION")) {
    return { Icon: Database, color: "text-slate-600" };
  }
  if (t.startsWith("COA_") || t === "COA") {
    return { Icon: Gauge, color: "text-purple-600" };
  }
  if (
    t === "FUP_CHECK" ||
    t === "DATA_LIMIT_REACHED" ||
    t === "TIME_LIMIT_REACHED" ||
    t === "IDLE_TIMEOUT"
  ) {
    return { Icon: BarChart3, color: "text-amber-600" };
  }
  if (t === "POLICY_ENFORCE") {
    return { Icon: Shield, color: "text-emerald-600" };
  }
  if (t.includes("NAT")) {
    return { Icon: Network, color: "text-slate-600" };
  }
  return { Icon: Activity, color: "text-slate-500" };
}

function eventBadgeClass(ev: AnyRecord): string {
  const cat = eventCategory(ev);
  switch (cat) {
    case "sessions":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "recovery":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "reconciliation":
      return "bg-slate-100 text-slate-700 border-slate-200";
    case "nat":
      return "bg-slate-100 text-slate-700 border-slate-200";
    case "dpi":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

function eventTitle(ev: AnyRecord): string {
  const t = String(ev.eventType || ev.event || ev.type || "EVENT");
  const upper = t.toUpperCase();
  const username = ev.username || "";
  const sub = ev.subscriberId ? truncate(ev.subscriberId, 16) : "";
  const who = username || sub || "—";
  switch (upper) {
    case "SESSION_START":
      return `Session start: ${who}`;
    case "SESSION_STOP":
      return `Session stop: ${who}`;
    case "SESSION_UPDATE":
      return `Session update: ${who}`;
    case "SESSION_EXPIRE":
      return `Session expired: ${who}`;
    case "ADMIN_DISCONNECT":
      return `Admin disconnect: ${who}`;
    case "BULK_DISCONNECT":
      return `Bulk disconnect: ${who}`;
    case "AUTH_REQUEST":
      return `Auth request: ${who}`;
    case "AUTH_SUCCESS":
      return `Auth success: ${who}`;
    case "AUTH_FAILURE":
      return `Auth failure: ${who}`;
    case "COA_REQUEST":
      return `CoA request: ${who}`;
    case "COA_SUCCESS":
      return `CoA success: ${who}`;
    case "COA_FAILURE":
      return `CoA failure: ${who}`;
    case "POLICY_ENFORCE":
      return `Policy enforce: ${who}`;
    case "DATA_LIMIT_REACHED":
      return `Data limit reached: ${who}`;
    case "TIME_LIMIT_REACHED":
      return `Time limit reached: ${who}`;
    case "IDLE_TIMEOUT":
      return `Idle timeout: ${who}`;
    case "FUP_CHECK":
      return `FUP check: ${who}`;
    case "NAS_REGISTER":
      return `NAS registered: ${ev.clientIp || ev.nasIp || "—"}`;
    case "NAS_HEARTBEAT":
      return `NAS heartbeat: ${ev.clientIp || ev.nasIp || "—"}`;
    case "RESTART_DETECTED":
      return `VPP restart detected`;
    case "REBUILT_POLICIES":
      return `VPP policies rebuilt`;
    default:
      if (username || sub) return `${t}: ${who}`;
      return t;
  }
}

function eventDescription(ev: AnyRecord): string {
  const parts: string[] = [];
  if (ev.sessionId) parts.push(`session=${truncate(ev.sessionId, 24)}`);
  if (ev.clientIp) parts.push(`ip=${ev.clientIp}`);
  if (ev.macAddress || ev.mac)
    parts.push(`mac=${ev.macAddress || ev.mac}`);
  if (ev.authResult) parts.push(`result=${ev.authResult}`);
  if (ev.source) parts.push(`source=${ev.source}`);
  if (ev.triggeredBy)
    parts.push(`by=${truncate(ev.triggeredBy, 16)}`);
  if (ev.context) {
    try {
      const ctx =
        typeof ev.context === "string"
          ? JSON.parse(ev.context)
          : ev.context;
      if (ctx && typeof ctx === "object") {
        const keys = Object.keys(ctx).slice(0, 4);
        for (const k of keys) {
          const v = (ctx as AnyRecord)[k];
          if (v !== null && v !== undefined && v !== "") {
            const str =
              typeof v === "object" ? JSON.stringify(v) : String(v);
            parts.push(`${k}=${str}`.slice(0, 60));
          }
        }
      } else if (typeof ctx === "string") {
        parts.push(ctx.slice(0, 80));
      }
    } catch {
      parts.push(String(ev.context).slice(0, 80));
    }
  }
  return parts.length ? parts.join(", ") : "—";
}

function relativeTime(iso: string | number | undefined | null): string {
  if (!iso) return "—";
  const d = typeof iso === "number" ? new Date(iso) : new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return "just now";
  if (diffMs < 1000) return "just now";
  if (diffMs < 60_000) return `${Math.floor(diffMs / 1000)}s ago`;
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return `${Math.floor(diffMs / 86_400_000)}d ago`;
}

function LiveActivityTab() {
  const [events, setEvents] = useState<AnyRecord[]>([]);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const eventsQ = useQuery({
    queryKey: ["vpp-events-feed"],
    queryFn: async () => {
      const res = await fetch("/api/vpp?action=events-feed&limit=50");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: paused ? false : 3000,
    retry: 1,
  });

  // Merge new events into state when query returns new data
  useEffect(() => {
    if (eventsQ.isError) {
      setError(
        (eventsQ.error as Error)?.message || "Failed to fetch events"
      );
      return;
    }
    setError(null);
    if (!eventsQ.data) return;
    const incoming: AnyRecord[] =
      eventsQ.data.events ||
      eventsQ.data.items ||
      eventsQ.data.data ||
      (Array.isArray(eventsQ.data) ? eventsQ.data : []);
    if (!Array.isArray(incoming) || incoming.length === 0) return;
    setEvents((prev) => {
      const seen = new Set(
        prev.map((e) => String(e.id || ""))
      );
      const fresh = incoming.filter((e) => {
        const id = String(e.id || "");
        return id && !seen.has(id);
      });
      if (fresh.length === 0) return prev;
      const merged = [...fresh, ...prev].slice(0, 200);
      merged.sort((a, b) => {
        const ta = new Date(
          a.createdAt || a.timestamp || a.ts || 0
        ).getTime();
        const tb = new Date(
          b.createdAt || b.timestamp || b.ts || 0
        ).getTime();
        return tb - ta;
      });
      return merged;
    });
  }, [eventsQ.data, eventsQ.isError, eventsQ.error]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      if (filter !== "all" && eventCategory(e) !== filter) return false;
      if (!q) return true;
      const haystack = [
        eventTitle(e),
        eventDescription(e),
        String(e.eventType || e.event || e.type || ""),
        String(e.sessionId || ""),
        String(e.username || ""),
        String(e.subscriberId || ""),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [events, filter, search]);

  const connectionState: "paused" | "connected" | "polling" | "error" =
    error
      ? "error"
      : paused
        ? "paused"
        : eventsQ.isFetching
          ? "polling"
          : "connected";

  const dotClass =
    connectionState === "error"
      ? "bg-red-500"
      : connectionState === "paused"
        ? "bg-slate-400"
        : connectionState === "polling"
          ? "bg-amber-500"
          : "bg-emerald-500";

  const dotPulse =
    !paused && connectionState === "polling" ? "animate-pulse" : "";

  const statusLabel =
    connectionState === "error"
      ? "Error"
      : connectionState === "paused"
        ? "Paused"
        : connectionState === "polling"
          ? "Polling"
          : "Connected";

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Radio className="h-5 w-5 text-emerald-600" />
              Live Activity
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
              Real-time session-engine event stream — polls
              <code className="px-1 py-0.5 bg-muted/60 dark:bg-muted/30 rounded">
                /api/vpp?action=events-feed
              </code>
              every 3s.
              <span className="inline-flex items-center gap-1.5">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${dotClass} ${dotPulse}`}
                />
                {statusLabel}
              </span>
            </p>
          </div>
        </div>

        {/* Top bar: pause/resume + clear + filter + search */}
        <Card>
          <CardContent className="p-3 flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={paused ? "default" : "outline"}
                onClick={() => setPaused(!paused)}
              >
                {paused ? (
                  <>
                    <Play className="h-4 w-4 mr-1.5" />
                    Resume
                  </>
                ) : (
                  <>
                    <Pause className="h-4 w-4 mr-1.5" />
                    Pause
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEvents([])}
                disabled={events.length === 0}
              >
                <Trash className="h-4 w-4 mr-1.5" />
                Clear
              </Button>
              {paused && (
                <Badge
                  variant="outline"
                  className="bg-amber-100 text-amber-800 border-amber-200"
                >
                  Paused
                </Badge>
              )}
              <Badge variant="secondary">
                {events.length} buffered / {filtered.length} shown
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-44">
                  <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LIVE_EVENT_FILTERS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search events…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Event stream */}
        <Card>
          <CardContent className="p-0">
            <div className="max-h-[600px] overflow-y-auto cryptsk-scrollbar">
              {error ? (
                <div className="p-4">
                  <ServiceUnavailable
                    message={
                      error +
                      " — session-engine (port 3010) /api/events feed may not be running."
                    }
                    onRetry={() => eventsQ.refetch()}
                  />
                </div>
              ) : filtered.length === 0 ? (
                <EmptyState
                  icon={Radio}
                  title={
                    events.length === 0
                      ? paused
                        ? "Paused — no events yet"
                        : "Waiting for events…"
                      : "No events match"
                  }
                  description={
                    events.length === 0
                      ? "Session events from the session-engine (logins, logouts, CoA, policy enforcement, VPP recovery) will appear here in real time."
                      : "No events match the current filter or search. Try clearing filters."
                  }
                  size="sm"
                  action={
                    !paused
                      ? {
                          label: "Refresh",
                          onClick: () => eventsQ.refetch(),
                          icon: RefreshCw,
                        }
                      : undefined
                  }
                />
              ) : (
                <AnimatePresence initial={false}>
                  {filtered.map((ev) => {
                    const { Icon, color } = eventIcon(ev);
                    const t = String(
                      ev.eventType || ev.event || ev.type || "EVENT"
                    );
                    const ts = ev.createdAt || ev.timestamp || ev.ts;
                    const key = String(
                      ev.id ||
                        `${t}-${ts}-${Math.random().toString(36).slice(2, 8)}`
                    );
                    return (
                      <motion.div
                        key={key}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.18 }}
                        className="flex items-start gap-3 px-4 py-3 border-b last:border-b-0 hover:bg-muted/30 dark:hover:bg-muted/20"
                      >
                        <div className={`mt-0.5 shrink-0 ${color}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant="outline"
                              className={eventBadgeClass(ev)}
                            >
                              {t}
                            </Badge>
                            <span className="text-sm font-medium truncate">
                              {eventTitle(ev)}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 font-mono break-all">
                            {eventDescription(ev)}
                          </div>
                        </div>
                        <UITooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="text-xs text-muted-foreground shrink-0 cursor-help hover:underline whitespace-nowrap"
                            >
                              {relativeTime(ts)}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            {formatTime(ts)}
                          </TooltipContent>
                        </UITooltip>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}

// ─────────────────────────────────────────────────────────────────
// TAB 4: NAT EVENTS
// ─────────────────────────────────────────────────────────────────
function NatEventsTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const eventsQ = useQuery({
    queryKey: ["nat-events-recent"],
    queryFn: async () => {
      const res = await fetch("/api/nat-logger?action=events-recent");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 5000,
    retry: 1,
  });

  const statsQ = useQuery({
    queryKey: ["nat-stats"],
    queryFn: async () => {
      const res = await fetch("/api/nat-logger?action=stats");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 10000,
    retry: 1,
  });

  const bufferQ = useQuery({
    queryKey: ["nat-buffer"],
    queryFn: async () => {
      const res = await fetch("/api/nat-logger?action=buffer");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 5000,
    retry: 1,
  });

  const flushMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/nat-logger?action=flush", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      return data;
    },
    onSuccess: () => {
      toast.success("NAT buffer flushed");
      queryClient.invalidateQueries({ queryKey: ["nat-buffer"] });
      queryClient.invalidateQueries({ queryKey: ["nat-events-recent"] });
      queryClient.invalidateQueries({ queryKey: ["nat-stats"] });
    },
    onError: (err: Error) => toast.error(err.message || "Flush failed"),
  });

  const events: AnyRecord[] = eventsQ.data?.events || eventsQ.data?.items || eventsQ.data?.data || [];
  const stats: AnyRecord = statsQ.data || {};
  const buffer: AnyRecord = bufferQ.data || {};

  const filteredEvents = useMemo(() => {
    if (!search.trim()) return events;
    const q = search.trim().toLowerCase();
    return events.filter(
      (e) =>
        (e.dstDomain || "").toLowerCase().includes(q) ||
        (e.subscriberIp || "").toLowerCase().includes(q)
    );
  }, [events, search]);

  // ─── Helpers for byte-string coercion ───────────────────────
  const numBytes = (v: any): number => {
    if (v === undefined || v === null) return 0;
    const n = typeof v === "string" ? parseInt(v, 10) : v;
    return isNaN(n) ? 0 : n;
  };

  // Per-minute bytes for the last ~60 minutes (from current event window)
  const perMinuteData = useMemo(() => {
    const map: Record<string, { ts: number; sent: number; recv: number; total: number }> = {};
    const now = Date.now();
    const windowStart = now - 60 * 60 * 1000;
    for (const e of events) {
      const ts = e.timestamp || e.createdAt;
      if (!ts) continue;
      const d = new Date(ts);
      if (isNaN(d.getTime())) continue;
      if (d.getTime() < windowStart) continue;
      d.setSeconds(0, 0);
      const key = String(d.getTime());
      if (!map[key]) map[key] = { ts: d.getTime(), sent: 0, recv: 0, total: 0 };
      const sent = numBytes(e.bytesSent);
      const recv = numBytes(e.bytesReceived);
      map[key].sent += sent;
      map[key].recv += recv;
      map[key].total += sent + recv;
    }
    return Object.values(map)
      .sort((a, b) => a.ts - b.ts)
      .map((v) => ({
        time: new Date(v.ts).toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
        }),
        sent: v.sent,
        recv: v.recv,
        total: v.total,
      }));
  }, [events]);

  // Top 10 dst domains (prefer stats.topDstDomains, fallback to events aggregation)
  const topDomainsChartData = useMemo(() => {
    const apiDomains: AnyRecord[] = stats.topDstDomains || [];
    if (apiDomains.length > 0) {
      return apiDomains.slice(0, 10).map((d) => ({
        domain: String(d.domain || "—"),
        bytes: numBytes(d.bytes),
      }));
    }
    const map: Record<string, number> = {};
    for (const e of events) {
      const d = e.dstDomain || "—";
      const b = numBytes(e.bytesSent) + numBytes(e.bytesReceived);
      map[d] = (map[d] || 0) + b;
    }
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([domain, bytes]) => ({ domain, bytes }));
  }, [stats, events]);

  // Bytes-per-protocol for pie chart
  const protocolData = useMemo(() => {
    const apiArr: AnyRecord[] = stats.bytesPerProtocol || [];
    if (apiArr.length > 0) {
      return apiArr.map((p) => ({
        name: String(p.protocol || "?"),
        value: numBytes(p.bytes),
        count: Number(p.count) || 0,
      }));
    }
    const map: Record<string, { value: number; count: number }> = {};
    for (const e of events) {
      const p = String(e.protocol || "?");
      if (!map[p]) map[p] = { value: 0, count: 0 };
      map[p].value += numBytes(e.bytesSent) + numBytes(e.bytesReceived);
      map[p].count += 1;
    }
    return Object.entries(map).map(([name, v]) => ({
      name,
      value: v.value,
      count: v.count,
    }));
  }, [stats, events]);

  const PROTOCOL_COLORS: Record<string, string> = {
    TCP: "#10b981", // emerald-500
    UDP: "#f59e0b", // amber-500
    ICMP: "#ef4444", // red-500
  };
  const PROTOCOL_ROW_TINT: Record<string, string> = {
    TCP: "hover:bg-slate-50 dark:hover:bg-slate-900/40",
    UDP: "bg-amber-50/40 hover:bg-amber-50/80 dark:bg-amber-950/10 dark:hover:bg-amber-950/20",
    ICMP: "bg-red-50/40 hover:bg-red-50/80 dark:bg-red-950/10 dark:hover:bg-red-950/20",
  };

  const COUNTRY_FLAGS: Record<string, string> = {
    US: "🇺🇸", GB: "🇬🇧", UK: "🇬🇧", IN: "🇮🇳", NL: "🇳🇱", SG: "🇸🇬",
    AU: "🇦🇺", DE: "🇩🇪", FR: "🇫🇷", JP: "🇯🇵", CA: "🇨🇦", BR: "🇧🇷",
    CN: "🇨🇳", KR: "🇰🇷", RU: "🇷🇺", IT: "🇮🇹", ES: "🇪🇸", MX: "🇲🇽",
    ZA: "🇿🇦", AE: "🇦🇪", SA: "🇸🇦", ID: "🇮🇩", TH: "🇹🇭", VN: "🇻🇳",
    PH: "🇵🇭", MY: "🇲🇾", SE: "🇸🇪", NO: "🇳🇴", FI: "🇫🇮", DK: "🇩🇰",
    CH: "🇨🇭", AT: "🇦🇹", BE: "🇧🇪", IE: "🇮🇪", PT: "🇵🇹", GR: "🇬🇷",
    TR: "🇹🇷", IL: "🇮🇱", EG: "🇪🇬", NG: "🇳🇬", AR: "🇦🇷", CL: "🇨🇱",
    NZ: "🇳🇿", HK: "🇭🇰", TW: "🇹🇼",
  };
  const flagFor = (cc: string | undefined | null): string => {
    const c = (cc || "").trim().toUpperCase();
    if (!c) return "🌐";
    return COUNTRY_FLAGS[c] || `🌐 ${c}`;
  };

  // ─── Derived metrics for stat cards ────────────────────────
  const totalEvents60 = stats.totalEvents ?? stats.total ?? stats.totalLast60Min ?? 0;
  const uniqueSubs = (stats.topSubscriberIps?.length as number) ?? 0;
  const avgEventSize = useMemo(() => {
    const total = numBytes(stats.totalBytesSent) + numBytes(stats.totalBytesReceived);
    const count = Number(stats.totalEvents) || 0;
    return count > 0 ? total / count : 0;
  }, [stats]);
  const totalBytes60 = numBytes(stats.totalBytesSent) + numBytes(stats.totalBytesReceived);

  const bufferSize = Number(buffer.size ?? buffer.bufferSize ?? 0);
  const bufferCapacity = Number(buffer.capacity ?? buffer.bufferCapacity ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Activity className="h-5 w-5 text-emerald-600" />
            NAT Events
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Live NAT event stream from nat-logger (port 3016) — auto-refresh every 5s (§34).
          </p>
        </div>
        <div className="flex items-center gap-2">
          {bufferSize > 0 && (
            <Badge
              variant="outline"
              className="bg-amber-100 text-amber-800 border-amber-300 animate-pulse"
            >
              <span className="relative flex h-2 w-2 mr-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-600" />
              </span>
              {bufferSize} buffered
            </Badge>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => flushMut.mutate()}
            disabled={flushMut.isPending}
            className={bufferSize > 0 ? "border-amber-400 text-amber-700 hover:bg-amber-50" : ""}
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${flushMut.isPending ? "animate-spin" : ""}`} />
            {flushMut.isPending ? "Flushing…" : "Force Flush"}
          </Button>
        </div>
      </div>

      {/* Stat cards (6) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          icon={Gauge}
          label="Buffer Size"
          value={bufferSize}
          color="text-amber-600"
          loading={bufferQ.isLoading}
          sub={`Cap ${bufferCapacity || "?"}`}
        />
        <StatCard
          icon={Clock}
          label="Last Flush"
          value={buffer.lastFlushAt ? formatTime(buffer.lastFlushAt) : "—"}
          color="text-slate-600"
          loading={bufferQ.isLoading}
        />
        <StatCard
          icon={BarChart3}
          label="Events (60m)"
          value={totalEvents60}
          color="text-emerald-600"
          loading={statsQ.isLoading}
        />
        <StatCard
          icon={ArrowRightLeft}
          label="Total Bytes"
          value={formatBytes(totalBytes60)}
          color="text-purple-600"
          loading={statsQ.isLoading}
        />
        <StatCard
          icon={TrendingUp}
          label="Avg Event Size"
          value={formatBytes(avgEventSize)}
          color="text-cyan-600"
          loading={statsQ.isLoading}
        />
        <StatCard
          icon={Users}
          label="Unique Subs"
          value={uniqueSubs}
          color="text-rose-600"
          loading={statsQ.isLoading}
        />
      </div>

      {/* Bytes per minute — line chart */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <LineChartIcon className="h-5 w-5 text-emerald-600" />
              Bytes per Minute
            </CardTitle>
            <CardDescription>
              Total bytes (sent + received) aggregated by minute from current event window
            </CardDescription>
          </CardHeader>
          <CardContent>
            {perMinuteData.length === 0 ? (
              <div className="h-44 flex items-center justify-center text-sm text-muted-foreground">
                No event timestamps available yet.
              </div>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsLineChart
                    data={perMinuteData}
                    margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                  >
                    <defs>
                      <linearGradient id="natBytesTotal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.6} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      tickLine={false}
                      axisLine={{ stroke: "#cbd5e1" }}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      tickLine={false}
                      axisLine={{ stroke: "#cbd5e1" }}
                      tickFormatter={(v) => formatBytes(Number(v)).replace(/\.\d/, "")}
                      width={70}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid #e2e8f0",
                        fontSize: 12,
                        background: "#fff",
                      }}
                      formatter={(value: number, name: string) => [
                        formatBytes(Number(value)),
                        name === "total" ? "Total" : name === "sent" ? "Sent" : "Received",
                      ]}
                      labelFormatter={(l) => `Minute ${l}`}
                    />
                    <RechartsLegend
                      wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                      iconType="line"
                    />
                    <RechartsLine
                      type="monotone"
                      dataKey="sent"
                      stroke="#f59e0b"
                      strokeWidth={1.5}
                      dot={false}
                      name="sent"
                    />
                    <RechartsLine
                      type="monotone"
                      dataKey="recv"
                      stroke="#8b5cf6"
                      strokeWidth={1.5}
                      dot={false}
                      name="recv"
                    />
                    <RechartsLine
                      type="monotone"
                      dataKey="total"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      dot={false}
                      name="total"
                      fill="url(#natBytesTotal)"
                    />
                  </RechartsLineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Two-column: Top destinations bar + Protocol pie */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.05 }}
          className="lg:col-span-1"
        >
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-5 w-5 text-emerald-600" />
                Top 10 Destination Domains
              </CardTitle>
              <CardDescription>By aggregated bytes (last 60 min)</CardDescription>
            </CardHeader>
            <CardContent>
              {topDomainsChartData.length === 0 ? (
                <EmptyState
                  icon={BarChart3}
                  title="No domain data"
                  description="Top domains will appear once traffic flows."
                  size="sm"
                />
              ) : (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsBarChart
                      layout="vertical"
                      data={topDomainsChartData}
                      margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 11, fill: "#64748b" }}
                        tickLine={false}
                        axisLine={{ stroke: "#cbd5e1" }}
                        tickFormatter={(v) => formatBytes(Number(v)).replace(/\.\d/, "")}
                      />
                      <YAxis
                        type="category"
                        dataKey="domain"
                        tick={{ fontSize: 11, fill: "#475569", fontFamily: "monospace" }}
                        tickLine={false}
                        axisLine={{ stroke: "#cbd5e1" }}
                        width={110}
                      />
                      <RechartsTooltip
                        contentStyle={{
                          borderRadius: 8,
                          border: "1px solid #e2e8f0",
                          fontSize: 12,
                          background: "#fff",
                        }}
                        formatter={(value: number) => [formatBytes(Number(value)), "Bytes"]}
                      />
                      <RechartsBar
                        dataKey="bytes"
                        fill="#10b981"
                        radius={[0, 4, 4, 0]}
                        barSize={16}
                      />
                    </RechartsBarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.1 }}
          className="lg:col-span-1"
        >
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <PieChartIcon className="h-5 w-5 text-purple-600" />
                Bytes per Protocol
              </CardTitle>
              <CardDescription>TCP / UDP / ICMP share of total bytes</CardDescription>
            </CardHeader>
            <CardContent>
              {protocolData.length === 0 ? (
                <EmptyState
                  icon={PieChartIcon}
                  title="No protocol data"
                  description="Bytes-by-protocol will appear once events flow."
                  size="sm"
                />
              ) : (
                <div className="flex flex-col md:flex-row items-center gap-4">
                  <div className="h-56 w-full md:w-1/2">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPieChart>
                        <RechartsPie
                          data={protocolData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={85}
                          innerRadius={45}
                          paddingAngle={2}
                          label={({ name, percent }) =>
                            percent !== undefined
                              ? `${name} ${(percent * 100).toFixed(0)}%`
                              : name
                          }
                          labelLine={false}
                        >
                          {protocolData.map((entry, idx) => (
                            <Cell
                              key={`cell-${idx}`}
                              fill={PROTOCOL_COLORS[entry.name] || "#64748b"}
                              stroke="#fff"
                              strokeWidth={2}
                            />
                          ))}
                        </RechartsPie>
                        <RechartsTooltip
                          contentStyle={{
                            borderRadius: 8,
                            border: "1px solid #e2e8f0",
                            fontSize: 12,
                            background: "#fff",
                          }}
                          formatter={(value: number, name: string) => [
                            formatBytes(Number(value)),
                            name,
                          ]}
                        />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 w-full md:w-1/2 space-y-2">
                    {protocolData
                      .slice()
                      .sort((a, b) => b.value - a.value)
                      .map((p) => (
                        <div
                          key={p.name}
                          className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border bg-muted/30"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="h-3 w-3 rounded-sm"
                              style={{
                                backgroundColor: PROTOCOL_COLORS[p.name] || "#64748b",
                              }}
                            />
                            <span className="font-mono text-sm font-medium">{p.name}</span>
                          </div>
                          <div className="text-right">
                            <div className="font-mono text-sm">{formatBytes(p.value)}</div>
                            <div className="text-xs text-muted-foreground">
                              {p.count} events
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Events table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-slate-600" />
              Recent NAT Events
              <Badge variant="secondary" className="ml-1">
                {filteredEvents.length}
              </Badge>
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground hidden sm:inline">
                Click row to expand
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => eventsQ.refetch()}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Filter by dst domain or subscriber IP"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {eventsQ.error ? (
            <ServiceUnavailable
              message={(eventsQ.error as Error).message + " — nat-logger (port 3016) may not be running yet."}
              onRetry={() => eventsQ.refetch()}
            />
          ) : eventsQ.isLoading ? (
            <TableSkeleton rows={6} cols={7} />
          ) : filteredEvents.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="No NAT events"
              description="nat-logger is running but no events have been ingested yet. The VPP adapter will post events when NAT translation occurs."
              size="sm"
              action={{
                label: "Refresh",
                onClick: () => eventsQ.refetch(),
                icon: RefreshCw,
              }}
            />
          ) : (
            <div className="rounded-md border max-h-[560px] overflow-y-auto cryptsk-scrollbar">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Subscriber IP</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Proto</TableHead>
                    <TableHead>Ports</TableHead>
                    <TableHead>Bytes</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEvents.slice(0, 200).map((e, i) => {
                    const rowKey = e.id || `evt-${i}`;
                    const sent = numBytes(e.bytesSent);
                    const recv = numBytes(e.bytesReceived);
                    const bytes = sent + recv;
                    const natAct = e.natAction || e.action;
                    const proto = String(e.protocol || "?").toUpperCase();
                    const isOpen = expandedRow === rowKey;
                    const cc = String(e.dstCountry || "").toUpperCase();
                    return (
                      <React.Fragment key={rowKey}>
                        <TableRow
                          className={`${PROTOCOL_ROW_TINT[proto] || ""} cursor-pointer transition-colors`}
                          onClick={() => setExpandedRow(isOpen ? null : rowKey)}
                          title={`Full timestamp: ${formatTime(e.timestamp || e.createdAt)} • duration: ${formatDuration(e.duration)}`}
                        >
                          <TableCell className="w-8 px-2">
                            {isOpen ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatTime(e.timestamp || e.createdAt)}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {e.subscriberIp || e.subscriberIpAddr || "—"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {e.dstDomain || e.destinationDomain || "—"}
                          </TableCell>
                          <TableCell className="text-xs">
                            <span className="inline-flex items-center gap-1" title={cc || "Unknown"}>
                              <span className="text-base leading-none">
                                {flagFor(e.dstCountry)}
                              </span>
                              <span className="text-muted-foreground">{cc || "—"}</span>
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                proto === "TCP"
                                  ? "bg-slate-100 text-slate-800 border-slate-300"
                                  : proto === "UDP"
                                  ? "bg-amber-100 text-amber-800 border-amber-300"
                                  : proto === "ICMP"
                                  ? "bg-red-100 text-red-800 border-red-300"
                                  : ""
                              }
                            >
                              {e.protocol || "?"}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {e.srcPort || "?"} → {e.dstPort || "?"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {formatBytes(bytes)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                (natAct || "").toUpperCase().includes("DENY") ||
                                (natAct || "").toUpperCase().includes("DROP")
                                  ? "bg-red-100 text-red-800 border-red-200"
                                  : "bg-emerald-100 text-emerald-800 border-emerald-200"
                              }
                            >
                              {natAct || "TRANSLATE"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                        {isOpen && (
                          <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableCell colSpan={9} className="p-0">
                              <Accordion type="single" collapsible defaultValue="details">
                                <AccordionItem value="details" className="border-0">
                                  <AccordionTrigger className="px-4 py-2 text-xs hover:no-underline">
                                    <span className="flex items-center gap-2 font-medium text-muted-foreground">
                                      <Eye className="h-3.5 w-3.5" />
                                      Full event details
                                    </span>
                                  </AccordionTrigger>
                                  <AccordionContent className="px-4 pb-3">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                      <Detail label="Event ID" value={<span className="font-mono">{String(e.id || "—").slice(0, 18)}…</span>} />
                                      <Detail label="Subscriber ID" value={<span className="font-mono">{String(e.subscriberId || "—").slice(0, 18)}…</span>} />
                                      <Detail label="Source IP:Port" value={<span className="font-mono">{e.srcIp || "?"}:{e.srcPort || "?"}</span>} />
                                      <Detail label="Dest IP:Port" value={<span className="font-mono">{e.dstIp || "?"}:{e.dstPort || "?"}</span>} />
                                      <Detail label="Bytes Sent" value={<span className="font-mono text-amber-700">{formatBytes(sent)}</span>} />
                                      <Detail label="Bytes Received" value={<span className="font-mono text-purple-700">{formatBytes(recv)}</span>} />
                                      <Detail label="Duration" value={<span className="font-mono">{formatDuration(e.duration)}</span>} />
                                      <Detail label="Action" value={<span className="font-mono">{natAct || "—"}</span>} />
                                      <Detail label="Timestamp (full)" value={<span className="font-mono">{formatTime(e.timestamp || e.createdAt)}</span>} />
                                      <Detail label="Protocol" value={<span className="font-mono">{e.protocol || "?"}</span>} />
                                      <Detail label="Country" value={<span>{flagFor(e.dstCountry)} {cc || "—"}</span>} />
                                      <Detail label="Destination" value={<span className="font-mono">{e.dstDomain || "—"}</span>} />
                                    </div>
                                  </AccordionContent>
                                </AccordionItem>
                              </Accordion>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Small detail label/value used in expanded NAT event rows
function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// TAB 5: DPI CLASSIFICATIONS
// ─────────────────────────────────────────────────────────────────
function DpiTab() {
  const queryClient = useQueryClient();
  const [riskFilter, setRiskFilter] = useState("ALL");
  const [appFilter, setAppFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [flowsDialogRow, setFlowsDialogRow] = useState<AnyRecord | null>(null);

  const dpiQ = useQuery({
    queryKey: ["vpp-dpi", riskFilter, appFilter, categoryFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (riskFilter !== "ALL") params.set("riskLevel", riskFilter);
      if (appFilter) params.set("appName", appFilter);
      if (categoryFilter) params.set("appCategory", categoryFilter);
      const res = await fetch(`/api/vpp?action=dpi-classifications&${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 10000,
    retry: 1,
  });

  const seedMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/vpp?action=dpi-seed-synthetic`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      return data;
    },
    onSuccess: (data: AnyRecord) => {
      const count = data?.created ?? data?.count ?? "?";
      toast.success(`Seeded ${count} synthetic DPI classifications`);
      queryClient.invalidateQueries({ queryKey: ["vpp-dpi"] });
    },
    onError: (err: Error) => toast.error(err.message || "Seed failed"),
  });

  const classifications: AnyRecord[] =
    dpiQ.data?.classifications || dpiQ.data?.items || dpiQ.data?.data || [];

  // ─── Local byte coercion (server returns bytes as strings) ──
  const numBytes = (v: any): number => {
    if (v === undefined || v === null) return 0;
    const n = typeof v === "string" ? parseInt(v, 10) : v;
    return isNaN(n) ? 0 : n;
  };

  const RISK_COLORS: Record<string, string> = {
    LOW: "#10b981",       // emerald-500
    MEDIUM: "#f59e0b",    // amber-500
    HIGH: "#ef4444",      // red-500
    CRITICAL: "#7f1d1d",  // dark red (red-950)
  };
  const RISK_ROW_TINT: Record<string, string> = {
    LOW: "",
    MEDIUM: "bg-amber-50/60 dark:bg-amber-950/15",
    HIGH: "bg-red-50/50 dark:bg-red-950/10",
    CRITICAL: "bg-red-50 dark:bg-red-950/30",
  };
  const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

  // ─── Risk distribution donut data ──────────────────────────
  const riskDistribution = useMemo(() => {
    const map: Record<string, number> = {
      LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0,
    };
    for (const c of classifications) {
      const lvl = String(c.riskLevel || "").toUpperCase();
      if (lvl in map) map[lvl] += 1;
    }
    return RISK_LEVELS.map((lvl) => ({ name: lvl, value: map[lvl] }));
  }, [classifications]);
  const totalClassifications = classifications.length;

  // ─── Top apps bar chart ─────────────────────────────────────
  const topAppsData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of classifications) {
      const a = String(c.appName || "—");
      map[a] = (map[a] || 0) + numBytes(c.bytesIn) + numBytes(c.bytesOut);
    }
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([app, bytes]) => ({ app, bytes }));
  }, [classifications]);

  // ─── Category breakdown stacked bar ─────────────────────────
  const categoryBreakdown = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const c of classifications) {
      const cat = String(c.appCategory || "Other");
      if (!map[cat]) map[cat] = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
      const lvl = String(c.riskLevel || "").toUpperCase();
      if (RISK_LEVELS.includes(lvl)) {
        map[cat][lvl] += numBytes(c.bytesIn) + numBytes(c.bytesOut);
      }
    }
    return Object.entries(map)
      .map(([category, vals]) => ({
        category,
        LOW: vals.LOW,
        MEDIUM: vals.MEDIUM,
        HIGH: vals.HIGH,
        CRITICAL: vals.CRITICAL,
      }))
      .sort((a, b) =>
        (b.LOW + b.MEDIUM + b.HIGH + b.CRITICAL) - (a.LOW + a.MEDIUM + a.HIGH + a.CRITICAL)
      )
      .slice(0, 8);
  }, [classifications]);

  // ─── Summary stats ──────────────────────────────────────────
  const highRiskCount = useMemo(() => {
    return classifications.filter((c) => {
      const lvl = String(c.riskLevel || "").toUpperCase();
      return lvl === "HIGH" || lvl === "CRITICAL";
    }).length;
  }, [classifications]);

  const totalBytes = useMemo(() => {
    let t = 0;
    for (const c of classifications) {
      t += numBytes(c.bytesIn) + numBytes(c.bytesOut);
    }
    return t;
  }, [classifications]);

  const uniqueApps = useMemo(() => {
    const set = new Set<string>();
    for (const c of classifications) {
      if (c.appName) set.add(String(c.appName));
    }
    return set.size;
  }, [classifications]);

  const maxBytesInRow = useMemo(() => {
    let m = 0;
    for (const c of classifications) {
      m = Math.max(m, numBytes(c.bytesIn), numBytes(c.bytesOut));
    }
    return m || 1;
  }, [classifications]);

  // ─── Risk filter chip click handler ────────────────────────
  const setRiskChip = (lvl: string) => {
    setRiskFilter(lvl);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <CpuIcon className="h-5 w-5 text-emerald-600" />
            DPI Classifications
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Application classification from nDPI / DPI engine — auto-refresh every 10s (§35).
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => dpiQ.refetch()}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Refresh
        </Button>
      </div>

      {/* Summary stat cards (4) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={CpuIcon}
          label="Total Classifications"
          value={totalClassifications}
          color="text-emerald-600"
          loading={dpiQ.isLoading}
        />
        <StatCard
          icon={AlertTriangle}
          label="High Risk Count"
          value={highRiskCount}
          color="text-red-600"
          loading={dpiQ.isLoading}
        />
        <StatCard
          icon={ArrowRightLeft}
          label="Total Bytes"
          value={formatBytes(totalBytes)}
          color="text-purple-600"
          loading={dpiQ.isLoading}
        />
        <StatCard
          icon={Boxes}
          label="Unique Apps"
          value={uniqueApps}
          color="text-cyan-600"
          loading={dpiQ.isLoading}
        />
      </div>

      {/* Charts row: Risk donut + Top apps bar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <PieChartIcon className="h-5 w-5 text-emerald-600" />
                Risk Distribution
              </CardTitle>
              <CardDescription>Classification count by risk level</CardDescription>
            </CardHeader>
            <CardContent>
              {totalClassifications === 0 ? (
                <EmptyState
                  icon={PieChartIcon}
                  title="No risk data"
                  description="Risk distribution will populate once classifications are ingested."
                  size="sm"
                />
              ) : (
                <div className="flex flex-col md:flex-row items-center gap-4">
                  <div className="relative h-64 w-full md:w-1/2">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPieChart>
                        <RechartsPie
                          data={riskDistribution}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={90}
                          innerRadius={55}
                          paddingAngle={2}
                          label={({ name, percent }) =>
                            percent !== undefined && percent > 0
                              ? `${name} ${(percent * 100).toFixed(0)}%`
                              : ""
                          }
                          labelLine={false}
                        >
                          {riskDistribution.map((entry, idx) => (
                            <Cell
                              key={`risk-cell-${idx}`}
                              fill={RISK_COLORS[entry.name] || "#64748b"}
                              stroke="#fff"
                              strokeWidth={2}
                            />
                          ))}
                        </RechartsPie>
                        <RechartsTooltip
                          contentStyle={{
                            borderRadius: 8,
                            border: "1px solid #e2e8f0",
                            fontSize: 12,
                            background: "#fff",
                          }}
                          formatter={(value: number, name: string) => [
                            `${value} classification${Number(value) === 1 ? "" : "s"}`,
                            name,
                          ]}
                        />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                    {/* Center overlay text */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <div className="text-2xl font-bold tracking-tight">
                        {totalClassifications}
                      </div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Total
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 w-full md:w-1/2 space-y-2">
                    {riskDistribution.map((r) => (
                      <button
                        key={r.name}
                        onClick={() => setRiskChip(riskFilter === r.name ? "ALL" : r.name)}
                        className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-md border bg-muted/30 hover:bg-muted/60 transition-colors ${
                          riskFilter === r.name ? "ring-2 ring-emerald-400" : ""
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="h-3 w-3 rounded-sm"
                            style={{
                              backgroundColor: RISK_COLORS[r.name] || "#64748b",
                            }}
                          />
                          <span className="font-mono text-sm font-medium">{r.name}</span>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-sm">{r.value}</div>
                          <div className="text-xs text-muted-foreground">
                            {totalClassifications > 0
                              ? `${((r.value / totalClassifications) * 100).toFixed(0)}%`
                              : "—"}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.05 }}
        >
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-5 w-5 text-emerald-600" />
                Top 10 Apps by Bytes
              </CardTitle>
              <CardDescription>Aggregated bytesIn + bytesOut per app</CardDescription>
            </CardHeader>
            <CardContent>
              {topAppsData.length === 0 ? (
                <EmptyState
                  icon={BarChart3}
                  title="No app data"
                  description="Top apps will appear once classifications are ingested."
                  size="sm"
                />
              ) : (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsBarChart
                      layout="vertical"
                      data={topAppsData}
                      margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 11, fill: "#64748b" }}
                        tickLine={false}
                        axisLine={{ stroke: "#cbd5e1" }}
                        tickFormatter={(v) => formatBytes(Number(v)).replace(/\.\d/, "")}
                      />
                      <YAxis
                        type="category"
                        dataKey="app"
                        tick={{ fontSize: 11, fill: "#475569", fontFamily: "monospace" }}
                        tickLine={false}
                        axisLine={{ stroke: "#cbd5e1" }}
                        width={100}
                      />
                      <RechartsTooltip
                        contentStyle={{
                          borderRadius: 8,
                          border: "1px solid #e2e8f0",
                          fontSize: 12,
                          background: "#fff",
                        }}
                        formatter={(value: number) => [formatBytes(Number(value)), "Bytes"]}
                      />
                      <RechartsBar
                        dataKey="bytes"
                        fill="#06b6d4"
                        radius={[0, 4, 4, 0]}
                        barSize={16}
                      />
                    </RechartsBarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Category breakdown stacked bar */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.1 }}
      >
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-5 w-5 text-purple-600" />
              Bytes per Category × Risk Level
            </CardTitle>
            <CardDescription>
              Stacked bar — how risk is distributed across app categories
            </CardDescription>
          </CardHeader>
          <CardContent>
            {categoryBreakdown.length === 0 ? (
              <EmptyState
                icon={BarChart3}
                title="No category data"
                description="Category breakdown will appear once classifications are ingested."
                size="sm"
              />
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBarChart
                    data={categoryBreakdown}
                    margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="category"
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      tickLine={false}
                      axisLine={{ stroke: "#cbd5e1" }}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      tickLine={false}
                      axisLine={{ stroke: "#cbd5e1" }}
                      tickFormatter={(v) => formatBytes(Number(v)).replace(/\.\d/, "")}
                      width={70}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid #e2e8f0",
                        fontSize: 12,
                        background: "#fff",
                      }}
                      formatter={(value: number, name: string) => [
                        formatBytes(Number(value)),
                        name,
                      ]}
                    />
                    <RechartsLegend
                      wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                      iconType="circle"
                    />
                    <RechartsBar dataKey="LOW" stackId="risk" fill={RISK_COLORS.LOW} name="LOW" />
                    <RechartsBar dataKey="MEDIUM" stackId="risk" fill={RISK_COLORS.MEDIUM} name="MEDIUM" />
                    <RechartsBar dataKey="HIGH" stackId="risk" fill={RISK_COLORS.HIGH} name="HIGH" />
                    <RechartsBar dataKey="CRITICAL" stackId="risk" fill={RISK_COLORS.CRITICAL} name="CRITICAL" radius={[4, 4, 0, 0]} />
                  </RechartsBarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Classifications table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <CpuIcon className="h-4 w-4 text-slate-600" />
              Classifications
              <Badge variant="secondary" className="ml-1">
                {classifications.length}
              </Badge>
            </span>
            <div className="flex items-center gap-2">
              {seedMut.isPending ? (
                <span className="text-xs text-muted-foreground">Seeding…</span>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => dpiQ.refetch()}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Risk filter chips */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-xs font-medium text-muted-foreground mr-1">
              Risk:
            </span>
            {["ALL", ...RISK_LEVELS].map((lvl) => {
              const isActive = riskFilter === lvl;
              const count =
                lvl === "ALL"
                  ? classifications.length
                  : classifications.filter(
                      (c) => String(c.riskLevel || "").toUpperCase() === lvl
                    ).length;
              return (
                <button
                  key={lvl}
                  onClick={() => setRiskChip(lvl)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    isActive
                      ? "bg-emerald-600 text-white border-emerald-700"
                      : "bg-background border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {lvl !== "ALL" && (
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        backgroundColor: isActive ? "#fff" : RISK_COLORS[lvl],
                      }}
                    />
                  )}
                  {lvl === "ALL" ? "All" : lvl}
                  <span
                    className={`ml-0.5 px-1.5 rounded-full text-[10px] ${
                      isActive ? "bg-emerald-700 text-white" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Secondary filters: App name + Category */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div>
              <Label className="mb-1.5 block">App Name</Label>
              <Input
                placeholder="e.g. YouTube"
                value={appFilter}
                onChange={(e) => setAppFilter(e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1.5 block">Category</Label>
              <Input
                placeholder="e.g. Streaming"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              />
            </div>
          </div>

          {dpiQ.error ? (
            <ServiceUnavailable
              message={(dpiQ.error as Error).message + " — DPI engine may not be running yet."}
              onRetry={() => dpiQ.refetch()}
            />
          ) : dpiQ.isLoading ? (
            <TableSkeleton rows={6} cols={8} />
          ) : classifications.length === 0 ? (
            <div className="rounded-lg border border-dashed border-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/20 p-6 flex flex-col items-center gap-4 text-center">
              <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                <Database className="h-6 w-6 text-emerald-600" />
              </div>
              <div className="space-y-1">
                <div className="font-semibold text-emerald-900 dark:text-emerald-200">
                  No DPI classifications yet
                </div>
                <div className="text-sm text-muted-foreground max-w-md">
                  The DpiClassification table is empty. Generate demo classifications
                  (synthetic nDPI data) to populate charts and the table below.
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => seedMut.mutate()}
                disabled={seedMut.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Sparkles className="h-4 w-4 mr-1.5" />
                {seedMut.isPending ? "Seeding…" : "Seed Demo DPI Data"}
              </Button>
            </div>
          ) : (
            <div className="rounded-md border max-h-[560px] overflow-y-auto cryptsk-scrollbar">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead>Detected At</TableHead>
                    <TableHead>Subscriber IP</TableHead>
                    <TableHead>Subscriber ID</TableHead>
                    <TableHead>App Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Protocol</TableHead>
                    <TableHead className="min-w-[180px]">Bytes In / Out</TableHead>
                    <TableHead>Flows</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {classifications.map((c, i) => {
                    const inBytes = numBytes(c.bytesIn);
                    const outBytes = numBytes(c.bytesOut);
                    const riskLvl = String(c.riskLevel || "").toUpperCase();
                    const inPct = maxBytesInRow > 0 ? (inBytes / maxBytesInRow) * 100 : 0;
                    const outPct = maxBytesInRow > 0 ? (outBytes / maxBytesInRow) * 100 : 0;
                    return (
                      <TableRow
                        key={c.id || i}
                        className={RISK_ROW_TINT[riskLvl] || ""}
                      >
                        <TableCell className="text-xs text-muted-foreground">
                          {formatTime(c.detectedAt || c.createdAt)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {c.subscriberIp || "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {truncate(c.subscriberId, 12)}
                        </TableCell>
                        <TableCell className="font-medium">{c.appName || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{c.appCategory || "—"}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{c.protocol || "?"}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1 min-w-[160px]">
                            <div className="flex items-center gap-2 text-[10px]">
                              <span className="text-amber-700 dark:text-amber-400 w-8">IN</span>
                              <div className="flex-1 h-2 bg-muted rounded overflow-hidden">
                                <div
                                  className="h-full bg-amber-500"
                                  style={{ width: `${Math.min(100, inPct)}%` }}
                                />
                              </div>
                              <span className="font-mono w-14 text-right">
                                {formatBytes(inBytes)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px]">
                              <span className="text-purple-700 dark:text-purple-400 w-8">OUT</span>
                              <div className="flex-1 h-2 bg-muted rounded overflow-hidden">
                                <div
                                  className="h-full bg-purple-500"
                                  style={{ width: `${Math.min(100, outPct)}%` }}
                                />
                              </div>
                              <span className="font-mono w-14 text-right">
                                {formatBytes(outBytes)}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-xs">{c.flows ?? 0}</span>
                        </TableCell>
                        <TableCell>{riskBadge(c.riskLevel)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            onClick={() => setFlowsDialogRow(c)}
                            title="View flow details"
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" />
                            <span className="text-xs">Flows</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Flows dialog */}
      <Dialog
        open={flowsDialogRow !== null}
        onOpenChange={(open) => {
          if (!open) setFlowsDialogRow(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-emerald-600" />
              Flows Breakdown — {flowsDialogRow?.appName || "—"}
            </DialogTitle>
            <DialogDescription>
              Per-classification flow and byte distribution
            </DialogDescription>
          </DialogHeader>
          {flowsDialogRow && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <Detail
                  label="App / Category"
                  value={
                    <span>
                      <span className="font-medium">{flowsDialogRow.appName || "—"}</span>
                      <span className="text-muted-foreground"> • {flowsDialogRow.appCategory || "—"}</span>
                    </span>
                  }
                />
                <Detail
                  label="Protocol"
                  value={<span className="font-mono">{flowsDialogRow.protocol || "—"}</span>}
                />
                <Detail
                  label="Subscriber IP"
                  value={<span className="font-mono">{flowsDialogRow.subscriberIp || "—"}</span>}
                />
                <Detail
                  label="Risk Level"
                  value={riskBadge(flowsDialogRow.riskLevel)}
                />
                <Detail
                  label="Detected At"
                  value={<span className="font-mono text-xs">{formatTime(flowsDialogRow.detectedAt || flowsDialogRow.createdAt)}</span>}
                />
                <Detail
                  label="Total Flows"
                  value={<span className="font-mono font-bold text-emerald-700">{flowsDialogRow.flows ?? 0}</span>}
                />
                <Detail
                  label="Bytes In"
                  value={<span className="font-mono text-amber-700">{formatBytes(numBytes(flowsDialogRow.bytesIn))}</span>}
                />
                <Detail
                  label="Bytes Out"
                  value={<span className="font-mono text-purple-700">{formatBytes(numBytes(flowsDialogRow.bytesOut))}</span>}
                />
                <Detail
                  label="Total Bytes"
                  value={
                    <span className="font-mono font-bold">
                      {formatBytes(numBytes(flowsDialogRow.bytesIn) + numBytes(flowsDialogRow.bytesOut))}
                    </span>
                  }
                />
                <Detail
                  label="Classification ID"
                  value={<span className="font-mono text-xs">{String(flowsDialogRow.id || "—").slice(0, 18)}…</span>}
                />
              </div>
              <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Note:</span> Per-flow breakdown
                (source/dest ports, per-flow byte counts, flow durations) requires the
                nDPI integration. For now this dialog summarizes the aggregated classification
                record stored in the <code>DpiClassification</code> table.
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// TAB 6: DUPLICATE LOGIN POLICY
// ─────────────────────────────────────────────────────────────────
function DuplicateLoginTab() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const policiesQ = useQuery({
    queryKey: ["vpp-duplicate-login-policy"],
    queryFn: async () => {
      const res = await fetch("/api/vpp?action=duplicate-login-policy");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    retry: 1,
  });

  const policies: AnyRecord[] =
    policiesQ.data?.policies || policiesQ.data?.items || policiesQ.data?.data || (Array.isArray(policiesQ.data) ? policiesQ.data : []);

  const createMut = useMutation({
    mutationFn: async (payload: AnyRecord) => {
      const res = await fetch("/api/vpp?action=duplicate-login-policy-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      return data;
    },
    onSuccess: () => {
      toast.success("Duplicate login policy created");
      queryClient.invalidateQueries({ queryKey: ["vpp-duplicate-login-policy"] });
      setShowForm(false);
    },
    onError: (err: Error) => toast.error(err.message || "Create failed"),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: AnyRecord }) => {
      const res = await fetch(`/api/vpp?action=duplicate-login-policy-update&id=${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      return data;
    },
    onSuccess: () => {
      toast.success("Policy updated");
      queryClient.invalidateQueries({ queryKey: ["vpp-duplicate-login-policy"] });
    },
    onError: (err: Error) => toast.error(err.message || "Update failed"),
  });

  const toggleEnabled = (p: AnyRecord) => {
    const id = String(p.id || p._id || p.name);
    if (!id) return;
    updateMut.mutate({
      id,
      payload: { ...p, isEnabled: !(p.isEnabled ?? true) },
    });
  };

  // ─── Create form state ───
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState("DENY_NEW");
  const [maxSessions, setMaxSessions] = useState("1");
  const [scope, setScope] = useState("USERNAME");
  const [isEnabled, setIsEnabled] = useState(true);

  const submit = () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    createMut.mutate({
      name,
      description,
      mode,
      maxSessions: parseInt(maxSessions, 10) || 1,
      scope,
      isEnabled,
    });
    setName("");
    setDescription("");
    setMaxSessions("1");
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Users className="h-5 w-5 text-emerald-600" />
          Duplicate Login Policy
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configure simultaneous-session handling: ALLOW_MULTIPLE, DENY_NEW,
          DISCONNECT_OLD, or LIMIT_N (§38).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-slate-600" />
            Policies
            <Badge variant="secondary" className="ml-2">{policies.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Button
              size="sm"
              variant={showForm ? "secondary" : "default"}
              onClick={() => setShowForm(!showForm)}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              {showForm ? "Cancel" : "New Policy"}
            </Button>
          </div>

          {showForm && (
            <div className="space-y-3 rounded-md border bg-muted/30 dark:bg-muted/20 p-4 mb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. ONE_SESSION_PER_USER" />
                </div>
                <div>
                  <Label>Description</Label>
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
                </div>
                <div>
                  <Label>Mode</Label>
                  <Select value={mode} onValueChange={setMode}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALLOW_MULTIPLE">ALLOW_MULTIPLE</SelectItem>
                      <SelectItem value="DENY_NEW">DENY_NEW</SelectItem>
                      <SelectItem value="DISCONNECT_OLD">DISCONNECT_OLD</SelectItem>
                      <SelectItem value="LIMIT_N">LIMIT_N</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Scope</Label>
                  <Select value={scope} onValueChange={setScope}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USERNAME">USERNAME</SelectItem>
                      <SelectItem value="MAC">MAC</SelectItem>
                      <SelectItem value="BOTH">BOTH</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Max Sessions</Label>
                  <Input type="number" value={maxSessions} onChange={(e) => setMaxSessions(e.target.value)} />
                </div>
                <div className="flex items-end">
                  <Label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={(e) => setIsEnabled(e.target.checked)}
                      className="h-4 w-4"
                    />
                    Enabled
                  </Label>
                </div>
              </div>
              <Button size="sm" onClick={submit} disabled={createMut.isPending}>
                <Plus className="h-4 w-4 mr-1.5" />
                {createMut.isPending ? "Creating…" : "Create"}
              </Button>
            </div>
          )}

          {policiesQ.error ? (
            <ServiceUnavailable
              message={(policiesQ.error as Error).message}
              onRetry={() => policiesQ.refetch()}
            />
          ) : policiesQ.isLoading ? (
            <TableSkeleton rows={3} cols={6} />
          ) : policies.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No duplicate login policies"
              description="Create a policy to control how simultaneous logins are handled."
              size="sm"
              action={{
                label: "Create",
                onClick: () => setShowForm(true),
                icon: Plus,
              }}
            />
          ) : (
            <div className="rounded-md border max-h-96 overflow-y-auto cryptsk-scrollbar">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Max Sessions</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Enabled</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {policies.map((p, i) => {
                    const id = String(p.id || p._id || p.name || i);
                    const isEnabled = p.isEnabled ?? p.enabled ?? true;
                    const mode = p.mode || "DENY_NEW";
                    const modeBadgeClass =
                      mode === "ALLOW_MULTIPLE"
                        ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                        : mode === "DENY_NEW"
                        ? "bg-red-100 text-red-800 border-red-200"
                        : mode === "DISCONNECT_OLD"
                        ? "bg-amber-100 text-amber-800 border-amber-200"
                        : "bg-slate-100 text-slate-700 border-slate-200";
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{p.name || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={modeBadgeClass}>
                            {mode}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono">{p.maxSessions ?? 1}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{p.scope || "USERNAME"}</Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            className={
                              isEnabled
                                ? "text-emerald-700 hover:bg-emerald-50"
                                : "text-slate-500 hover:bg-slate-50"
                            }
                            onClick={() => toggleEnabled(p)}
                            disabled={updateMut.isPending}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            {isEnabled ? "Enabled" : "Disabled"}
                          </Button>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:bg-red-50"
                            onClick={() => {
                              if (!window.confirm(`Delete policy '${p.name}'?`)) return;
                              updateMut.mutate({ id, payload: { ...p, isEnabled: false } });
                              // Note: actual delete endpoint could be added via DELETE
                              toast.success("Policy disabled (use backend DELETE for permanent removal)");
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────
export default function VPPGatewayPage() {
  const [tab, setTab] = useState("overview");

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Server className="h-6 w-6 text-emerald-600" />
            VPP Gateway
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            VPP v26.06 + DPDK dataplane — policy objects, session snapshots,
            NAT events, DPI, and duplicate-login policy.
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1 w-full justify-start">
          <TabsTrigger value="overview">
            <Activity className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="live">
            <Radio className="h-4 w-4" />
            Live Activity
          </TabsTrigger>
          <TabsTrigger value="policy">
            <Shield className="h-4 w-4" />
            Policy Objects
          </TabsTrigger>
          <TabsTrigger value="snapshots">
            <Database className="h-4 w-4" />
            Session Snapshots
          </TabsTrigger>
          <TabsTrigger value="nat">
            <Network className="h-4 w-4" />
            NAT Events
          </TabsTrigger>
          <TabsTrigger value="dpi">
            <Cpu className="h-4 w-4" />
            DPI
          </TabsTrigger>
          <TabsTrigger value="dup-login">
            <Users className="h-4 w-4" />
            Duplicate Login
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <OverviewTab />
        </TabsContent>
        <TabsContent value="live" className="mt-6">
          <LiveActivityTab />
        </TabsContent>
        <TabsContent value="policy" className="mt-6">
          <PolicyObjectsTab />
        </TabsContent>
        <TabsContent value="snapshots" className="mt-6">
          <SnapshotsTab />
        </TabsContent>
        <TabsContent value="nat" className="mt-6">
          <NatEventsTab />
        </TabsContent>
        <TabsContent value="dpi" className="mt-6">
          <DpiTab />
        </TabsContent>
        <TabsContent value="dup-login" className="mt-6">
          <DuplicateLoginTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
