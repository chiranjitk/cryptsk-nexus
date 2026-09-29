"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  Activity, ArrowDown, ArrowUp, Clock, Filter, Gauge,
  AlertTriangle, AlertCircle, CheckCircle, Info, XCircle,
  RefreshCw, TrendingDown, TrendingUp, Zap, BarChart3,
  Layers, Wifi, Phone, Video, Gamepad2, Globe, Download,
  Shield, Timer, Eye, ChevronRight, Copy, ArrowRight,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip, TooltipContent, TooltipTrigger, TooltipProvider,
} from "@/components/ui/tooltip";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";

// ═══════════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════════

type QueueStatus = "active" | "congested" | "idle";

interface QueueStat {
  name: string;
  priority: number;
  guaranteed: number;
  ceiling: number;
  current: number;
  droppedPkts: number;
  borrowed: number;
  status: QueueStatus;
  sessions: number;
}

interface TrafficClass {
  name: string;
  icon: React.ReactNode;
  percentage: number;
  bandwidth: number;
  color: string;
  bgClass: string;
}

interface QoSEvent {
  id: string;
  timestamp: string;
  eventType: "queue_congested" | "packet_drop_threshold" | "priority_boost" | "bandwidth_limit_hit";
  queue: string;
  details: string;
  actionTaken: string;
  severity: "critical" | "warning" | "info";
}

interface QosMonitorResponse {
  queues: QueueStat[];
  trafficClasses: { name: string; icon: string; percentage: number; bandwidth: number; color: string; bgClass: string }[];
  events: QoSEvent[];
  heatmap: number[][];
}

// ═══════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function congestionColor(value: number): string {
  if (value >= 80) return "bg-red-500 dark:bg-red-400";
  if (value >= 60) return "bg-orange-400 dark:bg-orange-500";
  if (value >= 40) return "bg-yellow-400 dark:bg-yellow-500";
  if (value >= 20) return "bg-lime-400 dark:bg-lime-500";
  return "bg-green-500 dark:bg-green-400";
}

function congestionOpacity(value: number): string {
  if (value >= 80) return "opacity-100";
  if (value >= 60) return "opacity-90";
  if (value >= 40) return "opacity-75";
  if (value >= 20) return "opacity-60";
  return "opacity-50";
}

function statusBadge(status: QueueStatus) {
  const config = {
    active: { label: "Active", className: "border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30", icon: <CheckCircle className="h-3 w-3" /> },
    congested: { label: "Congested", className: "border-red-500/50 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30", icon: <AlertCircle className="h-3 w-3" /> },
    idle: { label: "Idle", className: "border-slate-400/50 text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/30", icon: <Clock className="h-3 w-3" /> },
  }[status];
  return (
    <Badge variant="outline" className={`text-[11px] gap-1 ${config.className}`}>
      {config.icon}
      {config.label}
    </Badge>
  );
}

function severityBadge(severity: QoSEvent["severity"]) {
  const config = {
    critical: { label: "Critical", className: "border-red-500/50 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30", icon: <XCircle className="h-3 w-3" /> },
    warning: { label: "Warning", className: "border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30", icon: <AlertTriangle className="h-3 w-3" /> },
    info: { label: "Info", className: "border-sky-500/50 text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/30", icon: <Info className="h-3 w-3" /> },
  }[severity];
  return (
    <Badge variant="outline" className={`text-[10px] gap-1 ${config.className}`}>
      {config.icon}
      {config.label}
    </Badge>
  );
}

function eventTypeLabel(type: QoSEvent["eventType"]): string {
  const labels: Record<string, string> = {
    queue_congested: "Queue Congested",
    packet_drop_threshold: "Packet Drop Threshold",
    priority_boost: "Priority Boost",
    bandwidth_limit_hit: "Bandwidth Limit Hit",
  };
  return labels[type] ?? type;
}

// Icon resolver for traffic classes
function TrafficClassIcon({ iconName }: { iconName: string }) {
  const iconProps = { className: "h-3.5 w-3.5" };
  switch (iconName) {
    case "Phone": return <Phone {...iconProps} />;
    case "Video": return <Video {...iconProps} />;
    case "Gamepad2": return <Gamepad2 {...iconProps} />;
    case "Globe": return <Globe {...iconProps} />;
    case "Download": return <Download {...iconProps} />;
    default: return <Globe {...iconProps} />;
  }
}

// ═══════════════════════════════════════════════════════════════════
//  COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function QosMonitorPage() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQueue, setSearchQueue] = useState("");
  const [lastRefresh, setLastRefresh] = useState(new Date().toLocaleTimeString());

  // ─── API Query ──────────────────────────────────────────────
  const { data, isLoading, isFetching, refetch } = useQuery<QosMonitorResponse>({
    queryKey: ["qos-monitor"],
    queryFn: () => fetch("/api/qos-monitor").then((r) => r.json()),
    refetchInterval: 30000,
  });

  const queues = useMemo(() => data?.queues || [], [data?.queues]);
  const trafficClassesRaw = data?.trafficClasses || [];
  const qosEvents = data?.events || [];
  const heatmap = data?.heatmap || [];

  // Resolve icon components for traffic classes
  const trafficClasses: TrafficClass[] = trafficClassesRaw.map((cls) => ({
    ...cls,
    icon: <TrafficClassIcon iconName={cls.icon} />,
  }));

  const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}`);

  // ─── Derived data ──────────────────────────────────────────────
  const activeQueues = queues.filter((q) => q.status !== "idle").length;
  const totalBandwidth = queues.reduce((s, q) => s + q.current, 0);
  const totalDropped = queues.reduce((s, q) => s + q.droppedPkts, 0);
  const prioritySessions = queues
    .filter((q) => q.priority <= 3)
    .reduce((s, q) => s + q.sessions, 0);

  const filteredQueues = useMemo(() => {
    const copy = [...queues];
    return copy
      .filter((q) => statusFilter === "all" || q.status === statusFilter)
      .filter((q) => !searchQueue || q.name.toLowerCase().includes(searchQueue.toLowerCase()));
  }, [queues, statusFilter, searchQueue]);

  const handleRefresh = () => {
    refetch().then(() => {
      setLastRefresh(new Date().toLocaleTimeString());
    });
  };

  // ─── Loading State ────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-red-600" />
          <p className="text-sm text-muted-foreground">Loading QoS monitor data...</p>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <TooltipProvider>
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* ─── Header ─────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Gauge className="h-6 w-6 text-red-600" />
              QoS Monitor
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Real-time quality of service monitoring, queue analytics &amp; congestion tracking.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="text-xs gap-1.5 border-green-500/50 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30"
            >
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              Live
            </Badge>
            <span className="text-[11px] text-muted-foreground hidden sm:inline">
              Last refresh: {lastRefresh}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={handleRefresh}
              disabled={isFetching}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════
            SECTION 1: QoS Summary Cards
        ═══════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Active Queues */}
          <Card className="border shadow-sm overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
                  <Layers className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-muted-foreground truncate">Active Queues</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums">{activeQueues}<span className="text-sm font-normal text-muted-foreground">/{queues.length}</span></p>
                </div>
                <Badge variant="outline" className="text-[10px] gap-1 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20">
                  <TrendingUp className="h-3 w-3" />
                  {queues.length > 0 ? Math.round((activeQueues / queues.length) * 100) : 0}%
                </Badge>
              </div>
            </CardContent>
            <div className="h-1 bg-emerald-500" />
          </Card>

          {/* Total Bandwidth Shaped */}
          <Card className="border shadow-sm overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-50 dark:bg-red-950/30">
                  <Activity className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-muted-foreground truncate">Total Bandwidth Shaped</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums">{totalBandwidth.toFixed(1)} <span className="text-sm font-normal text-muted-foreground">Mbps</span></p>
                </div>
                <Badge variant="outline" className="text-[10px] gap-1 border-red-500/40 text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-950/20">
                  <ArrowUp className="h-3 w-3" />
                  {(totalBandwidth / 1000).toFixed(1)}G
                </Badge>
              </div>
            </CardContent>
            <div className="h-1 bg-red-500" />
          </Card>

          {/* Dropped Packets */}
          <Card className="border shadow-sm overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30">
                  <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-muted-foreground truncate">Dropped Packets</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums">{formatNumber(totalDropped)}</p>
                </div>
                <Badge variant="outline" className="text-[10px] gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/20">
                  <TrendingDown className="h-3 w-3" />
                  {totalDropped > 0 ? `${(totalDropped / 60).toFixed(1)}/s` : "0/s"}
                </Badge>
              </div>
            </CardContent>
            <div className="h-1 bg-amber-500" />
          </Card>

          {/* Priority Sessions */}
          <Card className="border shadow-sm overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-950/30">
                  <Zap className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-muted-foreground truncate">Priority Sessions</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums">{prioritySessions.toLocaleString()}</p>
                </div>
                <Badge variant="outline" className="text-[10px] gap-1 border-purple-500/40 text-purple-600 dark:text-purple-400 bg-purple-50/50 dark:bg-purple-950/20">
                  <Wifi className="h-3 w-3" />
                  P1-P3
                </Badge>
              </div>
            </CardContent>
            <div className="h-1 bg-purple-500" />
          </Card>
        </div>

        {/* ═══════════════════════════════════════════════════════════
            SECTION 2: Queue Statistics Table
        ═══════════════════════════════════════════════════════════ */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-red-600" />
                  Queue Statistics
                </CardTitle>
                <CardDescription className="text-xs mt-1">
                  All QoS traffic classes with real-time utilization data
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Search queues..."
                  className="h-8 w-40 text-xs"
                  value={searchQueue}
                  onChange={(e) => setSearchQueue(e.target.value)}
                />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 w-32 text-xs">
                    <Filter className="h-3.5 w-3.5 mr-1" />
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="congested">Congested</SelectItem>
                    <SelectItem value="idle">Idle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[11px] font-semibold text-muted-foreground h-9">Queue Name</TableHead>
                    <TableHead className="text-[11px] font-semibold text-muted-foreground h-9 text-center">Priority</TableHead>
                    <TableHead className="text-[11px] font-semibold text-muted-foreground h-9 text-right">Guaranteed</TableHead>
                    <TableHead className="text-[11px] font-semibold text-muted-foreground h-9 text-right">Ceiling</TableHead>
                    <TableHead className="text-[11px] font-semibold text-muted-foreground h-9 text-right">Current</TableHead>
                    <TableHead className="text-[11px] font-semibold text-muted-foreground h-9 text-right">Dropped Pkts</TableHead>
                    <TableHead className="text-[11px] font-semibold text-muted-foreground h-9 text-right">Borrowed</TableHead>
                    <TableHead className="text-[11px] font-semibold text-muted-foreground h-9 text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredQueues.map((q) => {
                    const utilPct = q.ceiling > 0 ? Math.round((q.current / q.ceiling) * 100) : 0;
                    return (
                      <TableRow key={q.name} className={cn(q.status === "congested" && "bg-red-50/50 dark:bg-red-950/10")}>
                        <TableCell className="py-2.5">
                          <div className="flex items-center gap-2">
                            <div className={cn("h-2 w-2 rounded-full shrink-0",
                              q.status === "active" ? "bg-emerald-500" :
                              q.status === "congested" ? "bg-red-500" : "bg-slate-300 dark:bg-slate-600"
                            )} />
                            <span className="text-xs font-medium font-mono">{q.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-2.5 text-center">
                          <Badge variant="outline" className={cn(
                            "text-[10px] font-mono",
                            q.priority <= 2 ? "border-red-500/40 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20" :
                            q.priority <= 4 ? "border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20" :
                            "border-slate-400/40 text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/20"
                          )}>
                            P{q.priority}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-2.5 text-right text-xs tabular-nums text-muted-foreground">{q.guaranteed} Mbps</TableCell>
                        <TableCell className="py-2.5 text-right text-xs tabular-nums">{q.ceiling} Mbps</TableCell>
                        <TableCell className="py-2.5 text-right">
                          <span className={cn("text-xs font-semibold tabular-nums",
                            utilPct >= 90 ? "text-red-600 dark:text-red-400" :
                            utilPct >= 70 ? "text-amber-600 dark:text-amber-400" :
                            "text-emerald-600 dark:text-emerald-400"
                          )}>
                            {q.current} Mbps
                          </span>
                          <span className="text-[10px] text-muted-foreground ml-1">({utilPct}%)</span>
                        </TableCell>
                        <TableCell className="py-2.5 text-right">
                          <span className={cn("text-xs tabular-nums",
                            q.droppedPkts > 100 ? "text-red-600 dark:text-red-400 font-semibold" :
                            q.droppedPkts > 0 ? "text-amber-600 dark:text-amber-400" :
                            "text-muted-foreground"
                          )}>
                            {formatNumber(q.droppedPkts)}
                          </span>
                        </TableCell>
                        <TableCell className="py-2.5 text-right text-xs tabular-nums">
                          {q.borrowed > 0 ? (
                            <span className="text-sky-600 dark:text-sky-400">{q.borrowed} Mbps</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="py-2.5 text-center">{statusBadge(q.status)}</TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredQueues.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                        No queues match the current filter.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* ═══════════════════════════════════════════════════════════
            SECTION 3: Congestion Heatmap
        ═══════════════════════════════════════════════════════════ */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-red-600" />
              Congestion Heatmap
            </CardTitle>
            <CardDescription className="text-xs">
              24-hour congestion levels across all traffic queues (green = low, red = high)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Legend */}
            <div className="flex items-center gap-3 mb-4">
              <span className="text-[10px] text-muted-foreground font-medium">LOW</span>
              <div className="flex gap-0.5">
                {[10, 25, 40, 55, 70, 85, 100].map((v) => (
                  <div key={v} className={cn("h-3 w-5 rounded-sm", congestionColor(v))} />
                ))}
              </div>
              <span className="text-[10px] text-muted-foreground font-medium">HIGH</span>
            </div>

            {/* Heatmap Grid */}
            <div className="overflow-x-auto">
              <div className="min-w-[700px]">
                {/* Hour labels */}
                <div className="flex items-center gap-1 mb-1">
                  <div className="w-[130px] shrink-0" />
                  {HOUR_LABELS.map((h, i) => (
                    <div key={i} className="flex-1 text-center text-[9px] text-muted-foreground font-mono">
                      {i % 3 === 0 ? h : ""}
                    </div>
                  ))}
                </div>

                {/* Queue rows */}
                {queues.map((queue, qi) => (
                  <div key={queue.name} className="flex items-center gap-1 mb-0.5">
                    <div className="w-[130px] shrink-0 flex items-center gap-1.5">
                      <div className={cn("h-2 w-2 rounded-full shrink-0",
                        queue.priority <= 2 ? "bg-red-500" :
                        queue.priority <= 4 ? "bg-amber-500" : "bg-slate-400"
                      )} />
                      <span className="text-[10px] font-mono text-muted-foreground truncate">{queue.name.replace(/_/g, " ")}</span>
                    </div>
                    <div className="flex flex-1 gap-0.5">
                      {(heatmap[qi] || Array(24).fill(0)).map((val, hi) => (
                        <Tooltip key={hi}>
                          <TooltipTrigger asChild>
                            <div className={cn(
                              "flex-1 h-5 rounded-sm cursor-default transition-transform hover:scale-125 hover:z-10",
                              congestionColor(val),
                              congestionOpacity(val)
                            )} />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-[10px]">
                            <span className="font-mono">{queue.name.replace(/_/g, " ")}</span> at {HOUR_LABELS[hi]}:00 — <span className="font-semibold">{val}%</span>
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ═══════════════════════════════════════════════════════════
            SECTION 4: Real-time Queue Utilization
        ═══════════════════════════════════════════════════════════ */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Gauge className="h-4 w-4 text-red-600" />
              Real-time Queue Utilization
            </CardTitle>
            <CardDescription className="text-xs">
              Current bandwidth vs guaranteed rate vs ceiling for each queue
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {queues.map((q) => {
              const utilPct = q.ceiling > 0 ? Math.round((q.current / q.ceiling) * 100) : 0;
              const guaranteedPct = q.ceiling > 0 ? Math.round((q.guaranteed / q.ceiling) * 100) : 0;
              const borrowedPct = q.borrowed > 0 ? Math.round((q.borrowed / q.ceiling) * 100) : 0;

              return (
                <div key={q.name} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-medium">{q.name}</span>
                      {statusBadge(q.status)}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="tabular-nums">{q.current}/{q.ceiling} Mbps</span>
                      <span className={cn("font-semibold tabular-nums",
                        utilPct >= 90 ? "text-red-600 dark:text-red-400" :
                        utilPct >= 70 ? "text-amber-600 dark:text-amber-400" :
                        "text-emerald-600 dark:text-emerald-400"
                      )}>
                        {utilPct}%
                      </span>
                    </div>
                  </div>
                  <div className="relative h-5 w-full rounded-full bg-muted overflow-hidden">
                    {/* Ceiling background (full bar) */}
                    <div className="absolute inset-0 rounded-full border border-muted-foreground/10" />
                    {/* Guaranteed zone */}
                    <div
                      className="absolute left-0 top-0 bottom-0 bg-emerald-200/60 dark:bg-emerald-800/40 rounded-l-full"
                      style={{ width: `${guaranteedPct}%` }}
                    />
                    {/* Borrowed zone */}
                    {borrowedPct > 0 && (
                      <div
                        className="absolute top-0 bottom-0 bg-sky-200/60 dark:bg-sky-800/40"
                        style={{ left: `${guaranteedPct}%`, width: `${borrowedPct}%` }}
                      />
                    )}
                    {/* Current utilization */}
                    <div
                      className={cn("absolute left-0 top-0 bottom-0 rounded-l-full transition-all duration-500",
                        utilPct >= 90 ? "bg-red-500/70" :
                        utilPct >= 70 ? "bg-amber-500/70" :
                        "bg-emerald-500/70"
                      )}
                      style={{ width: `${Math.min(utilPct, 100)}%` }}
                    />
                    {/* Guaranteed marker */}
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-emerald-600 dark:bg-emerald-400 z-10"
                      style={{ left: `${guaranteedPct}%` }}
                    />
                    {/* Labels inside bar */}
                    <div className="absolute inset-0 flex items-center px-2">
                      {q.current > 0 && (
                        <span className="text-[9px] font-semibold text-white drop-shadow-sm ml-auto mr-1 tabular-nums">
                          {q.current} Mbps
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-4 pt-2 text-[10px] text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-4 rounded-sm bg-emerald-200/60 dark:bg-emerald-800/40 border border-emerald-400/30" />
                Guaranteed Zone
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-4 rounded-sm bg-sky-200/60 dark:bg-sky-800/40 border border-sky-400/30" />
                Borrowed Bandwidth
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-4 rounded-sm bg-emerald-500/70" />
                Utilization (&lt;70%)
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-4 rounded-sm bg-amber-500/70" />
                Utilization (70-90%)
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-4 rounded-sm bg-red-500/70" />
                Utilization (&gt;90%)
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-0.5 bg-emerald-600 dark:bg-emerald-400" />
                Guaranteed Marker
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ─── Row: Traffic Class Breakdown + Events Log ────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* ═══════════════════════════════════════════════════════
              SECTION 5: Traffic Class Breakdown
          ═════════════════════════════════════════════════════════ */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Layers className="h-4 w-4 text-red-600" />
                Traffic Class Breakdown
              </CardTitle>
              <CardDescription className="text-xs">
                Bandwidth distribution by traffic classification
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Donut center summary */}
              <div className="flex items-center gap-4 mb-2">
                <div className="relative h-28 w-28 shrink-0">
                  <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                    {trafficClasses.reduce<{ cumulative: number; elements: React.ReactNode[] }>((acc, cls, i) => {
                      const circumference = 2 * Math.PI * 40;
                      const offset = circumference - (acc.cumulative / 100) * circumference;
                      const strokeLength = (cls.percentage / 100) * circumference;
                      const colors = ["#10b981", "#a855f7", "#f97316", "#0ea5e9", "#ef4444"];
                      acc.elements.push(
                        <circle
                          key={i}
                          cx="50" cy="50" r="40"
                          fill="none"
                          stroke={colors[i % colors.length]}
                          strokeWidth="12"
                          strokeDasharray={`${strokeLength} ${circumference - strokeLength}`}
                          strokeDashoffset={offset}
                          strokeLinecap="butt"
                          className="transition-all duration-700"
                        />
                      );
                      acc.cumulative += cls.percentage;
                      return acc;
                    }, { cumulative: 0, elements: [] }).elements}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-lg font-bold tabular-nums">{totalBandwidth.toFixed(0)}</span>
                    <span className="text-[9px] text-muted-foreground">Mbps</span>
                  </div>
                </div>
                <div className="flex-1 space-y-1.5">
                  {trafficClasses.map((cls, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className={cn("h-2.5 w-2.5 rounded-sm shrink-0", cls.color)} />
                      <span className="text-[11px] text-muted-foreground flex-1 truncate">{cls.name}</span>
                      <span className="text-[11px] font-semibold tabular-nums">{cls.percentage}%</span>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Detailed bars */}
              <div className="space-y-2.5">
                {trafficClasses.map((cls, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={cn("p-1 rounded-md", cls.bgClass)}>
                          {cls.icon}
                        </div>
                        <span className="text-xs font-medium">{cls.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-semibold tabular-nums">{cls.bandwidth} Mbps</span>
                        <span className="text-[10px] text-muted-foreground ml-1.5">({cls.percentage}%)</span>
                      </div>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all duration-700", cls.color)}
                        style={{ width: `${cls.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* ═══════════════════════════════════════════════════════
              SECTION 6: Recent QoS Events Log
          ═════════════════════════════════════════════════════════ */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Clock className="h-4 w-4 text-red-600" />
                    Recent QoS Events
                  </CardTitle>
                  <CardDescription className="text-xs mt-1">
                    Latest quality of service events and actions taken
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-[10px] gap-1 border-red-500/40 text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-950/20">
                  {qosEvents.filter((e) => e.severity === "critical").length} Critical
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[480px] overflow-y-auto custom-scrollbar">
                <div className="divide-y">
                  {qosEvents.length > 0 ? qosEvents.map((evt) => (
                    <div
                      key={evt.id}
                      className={cn("px-4 py-3 transition-colors hover:bg-muted/50",
                        evt.severity === "critical" && "border-l-2 border-l-red-500"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn("mt-0.5 shrink-0 p-1 rounded-md",
                          evt.severity === "critical" ? "bg-red-100 dark:bg-red-950/40" :
                          evt.severity === "warning" ? "bg-amber-100 dark:bg-amber-950/40" :
                          "bg-sky-100 dark:bg-sky-950/40"
                        )}>
                          {evt.severity === "critical" ? <XCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" /> :
                           evt.severity === "warning" ? <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" /> :
                           <Info className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-mono text-muted-foreground">{evt.timestamp}</span>
                            {severityBadge(evt.severity)}
                            <Badge variant="outline" className="text-[10px] font-mono border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400">
                              {evt.queue}
                            </Badge>
                          </div>
                          <p className="text-xs font-medium mt-1">{eventTypeLabel(evt.eventType)}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{evt.details}</p>
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                            <p className="text-[10px] text-emerald-600 dark:text-emerald-400">{evt.actionTaken}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      No QoS events recorded in the last 24 hours
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </TooltipProvider>
  );
}
