"use client";

import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/utils";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Gauge,
  AlertTriangle,
  Wifi,
  WifiOff,
  ArrowUpDown,
  RefreshCw,
  Clock,
  Zap,
  ShieldAlert,
  Bell,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Timer,
  BarChart3,
  Network,
  Radio,
  Server,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────

interface LinkHealth {
  id: string;
  name: string;
  targetIp: string;
  protocol: "ICMP" | "TCP";
  avgLatency: number;
  minLatency: number;
  maxLatency: number;
  jitter: number;
  packetLoss: number;
  uptime: number;
  status: "healthy" | "degraded" | "down";
}

interface TimelinePoint {
  hour: number;
  label: string;
  latency: number;
}

interface AlertRule {
  id: string;
  name: string;
  metric: "Latency" | "Jitter" | "Packet Loss";
  warningThreshold: string;
  criticalThreshold: string;
  action: "Alert Only" | "Page Team" | "Auto-Failover";
  enabled: boolean;
}

interface LatencyEvent {
  id: string;
  timestamp: string;
  link: string;
  event: string;
  value: string;
  duration: string;
  action: string;
}

type SortField = "name" | "avgLatency" | "jitter" | "packetLoss" | "uptime" | "status";
type SortDir = "asc" | "desc";



// ─── Helpers ─────────────────────────────────────────────────────

function statusBadge(status: string) {
  if (status === "healthy")
    return (
      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-400 border-0 gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Healthy
      </Badge>
    );
  if (status === "degraded")
    return (
      <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-400 border-0 gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Degraded
      </Badge>
    );
  if (status === "down")
    return (
      <Badge className="bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-950/50 dark:text-red-400 border-0 gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
        Down
      </Badge>
    );
  return <Badge variant="secondary">{status}</Badge>;
}

function eventIcon(event: string) {
  if (event.includes("Spike") || event.includes("High")) return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  if (event.includes("Loss")) return <WifiOff className="h-4 w-4 text-red-500" />;
  if (event.includes("Degraded")) return <AlertCircle className="h-4 w-4 text-orange-500" />;
  if (event.includes("Recovered")) return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  return <Activity className="h-4 w-4 text-muted-foreground" />;
}

function eventBadge(event: string) {
  if (event.includes("Spike")) return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/50 dark:text-amber-400 border-0 text-xs">{event}</Badge>;
  if (event.includes("Jitter High")) return <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 dark:bg-orange-950/50 dark:text-orange-400 border-0 text-xs">{event}</Badge>;
  if (event.includes("Packet Loss")) return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-950/50 dark:text-red-400 border-0 text-xs">{event}</Badge>;
  if (event.includes("Degraded")) return <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 dark:bg-orange-950/50 dark:text-orange-400 border-0 text-xs">{event}</Badge>;
  if (event.includes("Recovered")) return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-400 border-0 text-xs">{event}</Badge>;
  return <Badge variant="secondary" className="text-xs">{event}</Badge>;
}

function actionBadge(action: string) {
  if (action.includes("Failover")) return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-950/50 dark:text-red-400 border-0 text-xs">{action}</Badge>;
  if (action.includes("Paged")) return <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100 dark:bg-purple-950/50 dark:text-purple-400 border-0 text-xs">{action}</Badge>;
  if (action.includes("Resolved")) return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-400 border-0 text-xs">{action}</Badge>;
  return <Badge variant="secondary" className="text-xs">{action}</Badge>;
}

function latencyColor(latency: number, isDark: boolean): string {
  if (latency <= 10) return isDark ? "#34d399" : "#059669";
  if (latency <= 30) return isDark ? "#fbbf24" : "#d97706";
  return isDark ? "#f87171" : "#dc2626";
}

function jitterBarColor(jitter: number): string {
  if (jitter <= 5) return "bg-emerald-500";
  if (jitter <= 20) return "bg-amber-500";
  return "bg-red-500";
}

// ─── SVG Line Chart ──────────────────────────────────────────────

function LatencyTimelineChart({ data, linkName }: { data: TimelinePoint[]; linkName: string }) {
  const width = 720;
  const height = 260;
  const padX = 50;
  const padY = 30;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;
  const maxVal = Math.max(...data.map((d) => d.latency), 60);
  const warningThreshold = 20;
  const criticalThreshold = 50;

  const points = data.map((d, i) => ({
    x: padX + (i / (data.length - 1)) * chartW,
    y: padY + chartH - (d.latency / maxVal) * chartH,
  }));

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x},${p.y}`).join(" ");

  const areaD = `${pathD} L ${points[points.length - 1].x},${padY + chartH} L ${points[0].x},${padY + chartH} Z`;

  const warningY = padY + chartH - (warningThreshold / maxVal) * chartH;
  const criticalY = padY + chartH - (criticalThreshold / maxVal) * chartH;

  const maxLatency = Math.max(...data.map((d) => d.latency));
  const minLatency = Math.min(...data.map((d) => d.latency));
  const avgLatency = data.reduce((s, d) => s + d.latency, 0) / data.length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Peak:</span>
          <span className="font-semibold text-red-600 dark:text-red-400">{maxLatency.toFixed(1)} ms</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Min:</span>
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">{minLatency.toFixed(1)} ms</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Avg:</span>
          <span className="font-semibold">{avgLatency.toFixed(1)} ms</span>
        </div>
        <div className="flex items-center gap-4 ml-auto text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-amber-500 inline-block" /> Warning ({warningThreshold} ms)</div>
          <div className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-red-500 inline-block" /> Critical ({criticalThreshold} ms)</div>
        </div>
      </div>
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[500px]" preserveAspectRatio="xMidYMid meet">
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const y = padY + chartH - f * chartH;
            const val = (f * maxVal).toFixed(0);
            return (
              <g key={f}>
                <line x1={padX} y1={y} x2={width - padX} y2={y} className="stroke-muted/30" strokeWidth="1" />
                <text x={padX - 8} y={y + 4} textAnchor="end" className="fill-muted-foreground" fontSize="10">{val}</text>
              </g>
            );
          })}
          {/* Warning threshold */}
          <line x1={padX} y1={warningY} x2={width - padX} y2={warningY} className="stroke-amber-500" strokeWidth="1.5" strokeDasharray="6 3" />
          {/* Critical threshold */}
          <line x1={padX} y1={criticalY} x2={width - padX} y2={criticalY} className="stroke-red-500" strokeWidth="1.5" strokeDasharray="6 3" />
          {/* Area */}
          <path d={areaD} className="fill-primary/8" />
          {/* Line */}
          <path d={pathD} className="fill-none stroke-primary" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {/* Dots */}
          {points.map((p, i) => {
            const v = data[i].latency;
            const dotColor = v > criticalThreshold ? "text-red-500" : v > warningThreshold ? "text-amber-500" : "text-emerald-500";
            return (
              <circle key={i} cx={p.x} cy={p.y} r="3" className={dotColor} fill="currentColor" />
            );
          })}
          {/* X-axis labels */}
          {data.filter((_, i) => i % 4 === 0 || i === data.length - 1).map((d, _, arr) => {
            const idx = data.indexOf(d);
            const x = padX + (idx / (data.length - 1)) * chartW;
            return <text key={idx} x={x} y={height - 5} textAnchor="middle" className="fill-muted-foreground" fontSize="10">{d.label}</text>;
          })}
          {/* Y-axis label */}
          <text x={12} y={padY + chartH / 2} textAnchor="middle" className="fill-muted-foreground" fontSize="10" transform={`rotate(-90 12 ${padY + chartH / 2})`}>Latency (ms)</text>
        </svg>
      </div>
      <p className="text-xs text-muted-foreground">Showing 24-hour latency for <span className="font-medium text-foreground">{linkName}</span></p>
    </div>
  );
}

// ─── Jitter Distribution Bar Chart ───────────────────────────────

function JitterDistributionChart({ links }: { links: LinkHealth[] }) {
  const sorted = [...links].sort((a, b) => b.jitter - a.jitter);
  const maxJitter = Math.max(...sorted.map((l) => l.jitter), 30);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500 inline-block" /> Good (0–5 ms)</div>
        <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-amber-500 inline-block" /> Moderate (5–20 ms)</div>
        <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red-500 inline-block" /> High (&gt;20 ms)</div>
      </div>
      <div className="space-y-2.5">
        {sorted.map((link) => {
          const pct = (link.jitter / maxJitter) * 100;
          return (
            <div key={link.id} className="flex items-center gap-3">
              <div className="w-40 sm:w-48 shrink-0 text-xs font-medium truncate text-right" title={link.name}>
                {link.name}
              </div>
              <div className="flex-1 bg-muted/40 rounded-full h-5 relative overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${jitterBarColor(link.jitter)}`}
                  style={{ width: `${Math.max(pct, 2)}%` }}
                />
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-foreground drop-shadow-sm">
                  {link.jitter.toFixed(1)} ms
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────

export default function LatencyMonitorPage() {
  const [sortField, setSortField] = useState<SortField>("avgLatency");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selectedLink, setSelectedLink] = useState("");
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [enabledOverrides, setEnabledOverrides] = useState<Record<string, boolean>>({});

  // ─── Fetch data from API ───────────────────────
  const { data, isLoading, refetch } = useQuery<{
    linkHealth: LinkHealth[];
    timeline: Record<string, TimelinePoint[]>;
    alertRules: AlertRule[];
    events: LatencyEvent[];
    stats: {
      avgLatency: number; avgJitter: number; avgPacketLoss: number;
      healthyCount: number; degradedCount: number; downCount: number;
      latencyTrend: number; jitterTrend: number;
    };
  }>({
    queryKey: ["latency-monitor"],
    queryFn: () => apiFetch("/api/latency-monitor"),
  });

  const linkHealth = data?.linkHealth || [];
  const timeline = data?.timeline || {};
  const events = data?.events || [];

  const {
    avgLatency = 0, avgJitter = 0, avgPacketLoss = 0,
    healthyCount = 0, degradedCount = 0, downCount = 0,
    latencyTrend = 0, jitterTrend = 0,
  } = data?.stats || {};

  // Derive alert rules from API data with local toggle overrides
  const alertRules = useMemo(() => {
    return (data?.alertRules || []).map((r) => ({
      ...r,
      enabled: r.id in enabledOverrides ? enabledOverrides[r.id] : r.enabled,
    }));
  }, [data?.alertRules, enabledOverrides]);

  // Auto-select first link when data loads
  const effectiveSelectedLink = selectedLink || linkHealth[0]?.name || "";

  // ─── Sorting ────────────────────────────────────
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ArrowUpRight className="ml-1 h-3 w-3" /> : <ArrowDownRight className="ml-1 h-3 w-3" />;
  };

  const sortedLinks = useMemo(() => {
    return [...linkHealth].sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;
      switch (sortField) {
        case "name": aVal = a.name; bVal = b.name; break;
        case "avgLatency": aVal = a.avgLatency; bVal = b.avgLatency; break;
        case "jitter": aVal = a.jitter; bVal = b.jitter; break;
        case "packetLoss": aVal = a.packetLoss; bVal = b.packetLoss; break;
        case "uptime": aVal = a.uptime; bVal = b.uptime; break;
        case "status":
          const statusOrder = { down: 0, degraded: 1, healthy: 2 };
          aVal = statusOrder[a.status]; bVal = statusOrder[b.status]; break;
        default: aVal = a.name; bVal = b.name;
      }
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [sortField, sortDir, linkHealth]);

  // ─── Alert Rule Toggle ──────────────────────────
  const toggleRule = (id: string) => {
    const rule = data?.alertRules?.find((r) => r.id === id);
    setEnabledOverrides((prev) => ({ ...prev, [id]: rule ? !rule.enabled : true }));
  };

  // ─── Refresh ────────────────────────────────────
  const refresh = () => { refetch(); setLastRefresh(new Date()); };

  const timelineData = effectiveSelectedLink && timeline[effectiveSelectedLink]
    ? timeline[effectiveSelectedLink]
    : linkHealth.length > 0 && timeline[linkHealth[0].name]
      ? timeline[linkHealth[0].name]
      : [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Latency / Jitter Monitor" description="Real-time network latency, jitter, and packet loss monitoring across all links" icon={Gauge} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><div className="h-4 w-24 bg-muted animate-pulse rounded mb-3" /><div className="h-8 w-16 bg-muted animate-pulse rounded" /></CardContent></Card>
          ))}
        </div>
        <Card><CardContent className="p-5"><div className="h-64 w-full bg-muted animate-pulse rounded" /></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Latency / Jitter Monitor"
        description="Real-time network latency, jitter, and packet loss monitoring across all links"
        icon={Gauge}
        actions={
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Updated {lastRefresh.toLocaleTimeString()}
            </span>
            <Button variant="outline" size="sm" onClick={refresh}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        }
      />

      {/* ═══ Section 1: Network Health Summary Cards ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Avg Latency */}
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Timer className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Avg Latency</span>
              </div>
              <div className={`flex items-center gap-0.5 text-xs font-semibold ${latencyTrend < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                {latencyTrend < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
                {Math.abs(latencyTrend).toFixed(1)} ms
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-bold tracking-tight">{avgLatency.toFixed(1)}</span>
              <span className="text-sm text-muted-foreground">ms</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Across all monitored links</p>
          </CardContent>
        </Card>

        {/* Avg Jitter */}
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Activity className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Avg Jitter</span>
              </div>
              <Badge className={`${avgJitter <= 10 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400" : "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"} border-0 text-[10px]`}>
                {avgJitter <= 10 ? "Normal" : "Elevated"}
              </Badge>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-bold tracking-tight">{avgJitter.toFixed(1)}</span>
              <span className="text-sm text-muted-foreground">ms</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {jitterTrend > 0 ? "↑" : "↓"} {Math.abs(jitterTrend).toFixed(1)} ms from last period
            </p>
          </CardContent>
        </Card>

        {/* Packet Loss */}
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <WifiOff className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Packet Loss</span>
              </div>
              <Badge className={`${avgPacketLoss <= 0.1 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400" : avgPacketLoss <= 0.5 ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400" : "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400"} border-0 text-[10px]`}>
                {avgPacketLoss <= 0.1 ? "Low" : avgPacketLoss <= 0.5 ? "Moderate" : "High"}
              </Badge>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-bold tracking-tight">{avgPacketLoss.toFixed(3)}</span>
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Average across all links</p>
          </CardContent>
        </Card>

        {/* Monitored Links */}
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Network className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Links</span>
              </div>
              <span className="text-2xl font-bold">{linkHealth.length}</span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border-0 text-[10px]">
                {healthyCount} OK
              </Badge>
              <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 border-0 text-[10px]">
                {degradedCount} Warn
              </Badge>
              <Badge className="bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400 border-0 text-[10px]">
                {downCount} Down
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">{linkHealth.length > 0 ? ((healthyCount / linkHealth.length) * 100).toFixed(0) : 0}%</span> healthy
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ═══ Tabs: Link Table | Charts | Rules | Events ═══ */}
      <Tabs defaultValue="links" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="links" className="gap-1.5">
            <Radio className="h-3.5 w-3.5" /> Link Health
          </TabsTrigger>
          <TabsTrigger value="timeline" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" /> Latency Timeline
          </TabsTrigger>
          <TabsTrigger value="jitter" className="gap-1.5">
            <Activity className="h-3.5 w-3.5" /> Jitter Distribution
          </TabsTrigger>
          <TabsTrigger value="rules" className="gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" /> Alert Rules
          </TabsTrigger>
          <TabsTrigger value="events" className="gap-1.5">
            <Bell className="h-3.5 w-3.5" /> Recent Events
          </TabsTrigger>
        </TabsList>

        {/* ═══ Section 2: Link Health Table ═══ */}
        <TabsContent value="links" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Monitored Network Links</CardTitle>
                  <CardDescription className="text-xs">Click column headers to sort</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {healthyCount} Healthy
                  </Badge>
                  <Badge variant="outline" className="text-xs gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> {degradedCount} Degraded
                  </Badge>
                  <Badge variant="outline" className="text-xs gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> {downCount} Down
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[520px]">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="min-w-[180px]">
                        <button className="flex items-center gap-0.5 hover:text-foreground transition-colors" onClick={() => handleSort("name")}>
                          Link Name {sortIcon("name")}
                        </button>
                      </TableHead>
                      <TableHead className="min-w-[120px]">Target IP</TableHead>
                      <TableHead className="min-w-[70px]">Protocol</TableHead>
                      <TableHead className="min-w-[80px]">
                        <button className="flex items-center gap-0.5 hover:text-foreground transition-colors" onClick={() => handleSort("avgLatency")}>
                          Avg Latency {sortIcon("avgLatency")}
                        </button>
                      </TableHead>
                      <TableHead className="min-w-[80px]">Min / Max</TableHead>
                      <TableHead className="min-w-[70px]">
                        <button className="flex items-center gap-0.5 hover:text-foreground transition-colors" onClick={() => handleSort("jitter")}>
                          Jitter {sortIcon("jitter")}
                        </button>
                      </TableHead>
                      <TableHead className="min-w-[80px]">
                        <button className="flex items-center gap-0.5 hover:text-foreground transition-colors" onClick={() => handleSort("packetLoss")}>
                          Pkt Loss {sortIcon("packetLoss")}
                        </button>
                      </TableHead>
                      <TableHead className="min-w-[75px]">
                        <button className="flex items-center gap-0.5 hover:text-foreground transition-colors" onClick={() => handleSort("uptime")}>
                          Uptime {sortIcon("uptime")}
                        </button>
                      </TableHead>
                      <TableHead className="min-w-[90px]">
                        <button className="flex items-center gap-0.5 hover:text-foreground transition-colors" onClick={() => handleSort("status")}>
                          Status {sortIcon("status")}
                        </button>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedLinks.map((link) => (
                      <TableRow key={link.id} className={link.status === "down" ? "bg-red-50/50 dark:bg-red-950/10" : link.status === "degraded" ? "bg-amber-50/30 dark:bg-amber-950/5" : ""}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Server className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="text-xs font-medium truncate max-w-[160px]">{link.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{link.targetIp}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] font-mono">{link.protocol}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className={`text-xs font-semibold ${link.avgLatency <= 10 ? "text-emerald-600 dark:text-emerald-400" : link.avgLatency <= 30 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                            {link.avgLatency.toFixed(1)} ms
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <span className="text-emerald-600 dark:text-emerald-400">{link.minLatency.toFixed(1)}</span>
                          <span className="mx-1">/</span>
                          <span className="text-red-600 dark:text-red-400">{link.maxLatency.toFixed(1)}</span>
                        </TableCell>
                        <TableCell>
                          <span className={`text-xs font-semibold ${link.jitter <= 5 ? "text-emerald-600 dark:text-emerald-400" : link.jitter <= 20 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                            {link.jitter.toFixed(1)} ms
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={`text-xs font-semibold ${link.packetLoss <= 0.1 ? "text-emerald-600 dark:text-emerald-400" : link.packetLoss <= 0.5 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                            {link.packetLoss.toFixed(2)}%
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={`text-xs font-semibold ${link.uptime >= 99.9 ? "text-emerald-600 dark:text-emerald-400" : link.uptime >= 99 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
                            {link.uptime.toFixed(2)}%
                          </span>
                        </TableCell>
                        <TableCell>{statusBadge(link.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Section 3: Latency Timeline Chart ═══ */}
        <TabsContent value="timeline" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Latency Timeline — Last 24 Hours</CardTitle>
                  <CardDescription className="text-xs">Select a link to view its latency history</CardDescription>
                </div>
                <Select value={effectiveSelectedLink} onValueChange={setSelectedLink}>
                  <SelectTrigger className="w-full sm:w-[260px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {linkHealth.map((l) => (
                      <SelectItem key={l.id} value={l.name}>
                        <div className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: l.status === "healthy" ? "#059669" : l.status === "degraded" ? "#d97706" : "#dc2626" }} />
                          {l.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <LatencyTimelineChart data={timelineData} linkName={effectiveSelectedLink} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Section 4: Jitter Distribution ═══ */}
        <TabsContent value="jitter" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Jitter Distribution Across Links</CardTitle>
              <CardDescription className="text-xs">Color-coded by severity: green (0–5 ms), yellow (5–20 ms), red (&gt;20 ms)</CardDescription>
            </CardHeader>
            <CardContent>
              <JitterDistributionChart links={linkHealth} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Section 5: Alert Rules ═══ */}
        <TabsContent value="rules" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Alert Rules &amp; Thresholds</CardTitle>
                  <CardDescription className="text-xs">Configure latency, jitter, and packet loss alert thresholds</CardDescription>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{alertRules.filter((r) => r.enabled).length}/{alertRules.length} active</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[480px]">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-12">On</TableHead>
                      <TableHead className="min-w-[160px]">Rule Name</TableHead>
                      <TableHead className="min-w-[100px]">Metric</TableHead>
                      <TableHead className="min-w-[110px]">Warning</TableHead>
                      <TableHead className="min-w-[110px]">Critical</TableHead>
                      <TableHead className="min-w-[110px]">Action</TableHead>
                      <TableHead className="min-w-[80px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alertRules.map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell>
                          <Switch
                            checked={rule.enabled}
                            onCheckedChange={() => toggleRule(rule.id)}
                            className="data-[state=checked]:bg-emerald-600"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {rule.metric === "Latency" && <Timer className="h-3.5 w-3.5 text-muted-foreground" />}
                            {rule.metric === "Jitter" && <Activity className="h-3.5 w-3.5 text-muted-foreground" />}
                            {rule.metric === "Packet Loss" && <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />}
                            <span className="text-xs font-medium">{rule.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] font-medium">{rule.metric}</Badge>
                        </TableCell>
                        <TableCell className="text-xs font-mono text-amber-600 dark:text-amber-400">{rule.warningThreshold}</TableCell>
                        <TableCell className="text-xs font-mono text-red-600 dark:text-red-400">{rule.criticalThreshold}</TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] border-0 ${
                            rule.action === "Auto-Failover"
                              ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400"
                              : rule.action === "Page Team"
                              ? "bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-400"
                              : "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400"
                          }`}>
                            {rule.action}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {rule.enabled ? (
                            <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" /> Active
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <XCircle className="h-3 w-3" /> Disabled
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Section 6: Recent Latency Events ═══ */}
        <TabsContent value="events" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Recent Latency Events</CardTitle>
                  <CardDescription className="text-xs">Timeline of latency, jitter, and packet loss events</CardDescription>
                </div>
                <Badge variant="outline" className="text-xs gap-1">
                  <Activity className="h-3 w-3" />
                  {events.length} events
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[520px]">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="min-w-[40px]"></TableHead>
                      <TableHead className="min-w-[140px]">Timestamp</TableHead>
                      <TableHead className="min-w-[160px]">Link</TableHead>
                      <TableHead className="min-w-[140px]">Event</TableHead>
                      <TableHead className="min-w-[80px]">Value</TableHead>
                      <TableHead className="min-w-[70px]">Duration</TableHead>
                      <TableHead className="min-w-[140px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((evt, idx) => (
                      <TableRow key={evt.id} className={evt.event.includes("Recovered") ? "bg-emerald-50/30 dark:bg-emerald-950/5" : evt.event.includes("Down") || evt.event.includes("Loss") ? "bg-red-50/20 dark:bg-red-950/5" : ""}>
                        <TableCell className="relative">
                          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border -translate-x-1/2" />
                          <div className="relative z-10 flex items-center justify-center h-full">
                            <div className={`h-2 w-2 rounded-full shrink-0 ${
                              evt.event.includes("Recovered") ? "bg-emerald-500" :
                              evt.event.includes("Down") || evt.event.includes("Loss") ? "bg-red-500" :
                              evt.event.includes("Degraded") ? "bg-orange-500" :
                              "bg-amber-500"
                            }`} />
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{evt.timestamp}</TableCell>
                        <TableCell className="text-xs font-medium">{evt.link}</TableCell>
                        <TableCell>{eventBadge(evt.event)}</TableCell>
                        <TableCell className="text-xs font-mono font-semibold">{evt.value}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{evt.duration}</TableCell>
                        <TableCell>{actionBadge(evt.action)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
