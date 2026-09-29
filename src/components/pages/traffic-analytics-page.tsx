"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Users,
  Wifi,
  Clock,
  Download,
  Upload,
  FileDown,
  RefreshCw,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  Globe,
  Server,
  Zap,
  BarChart3,
  TrendingUp,
  MapPin,
  Network,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

// ─── Types ──────────────────────────────────────────────────────

interface TopTalker {
  rank: number;
  subscriberId: string;
  username: string;
  ip: string;
  download: number;
  upload: number;
  total: number;
  sessionDuration: string;
  protocols: { name: string; percent: number }[];
}

interface ProtocolData {
  name: string;
  bytes: number;
  percent: number;
  category: "streaming" | "social" | "p2p" | "communication" | "web" | "gaming" | "other";
}

interface GeoData {
  location: string;
  sessions: number;
  totalTraffic: number;
  avgSpeed: number;
}

interface InterfaceData {
  name: string;
  status: "up" | "down";
  download: number;
  upload: number;
  peakIn: number;
  peakOut: number;
  utilization: number;
  sparkline: number[];
}

interface TrendPoint {
  hour: string;
  download: number;
  upload: number;
}

type SortField =
  | "rank"
  | "username"
  | "ip"
  | "download"
  | "upload"
  | "total"
  | "sessionDuration";

type SortDir = "asc" | "desc";

interface TrafficAnalyticsResponse {
  summary: {
    totalTraffic: { download: number; upload: number };
    activeSessions: number;
    topProtocol: { name: string; percent: number };
    peakBandwidth: { time: string; value: number };
  };
  trend: TrendPoint[];
  topTalkers: TopTalker[];
  protocols: ProtocolData[];
  geographic: GeoData[];
  interfaces: InterfaceData[];
}

// ─── Helpers ──────────────────────────────────────────────────────

function formatTraffic(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${(mb * 1024).toFixed(0)} KB`;
}

function formatSpeed(mbps: number): string {
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(1)} Gbps`;
  return `${mbps.toFixed(0)} Mbps`;
}

const CATEGORY_COLORS: Record<string, { bg: string; bar: string; text: string }> = {
  streaming: {
    bg: "bg-red-50 dark:bg-red-950/30",
    bar: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
  },
  social: {
    bg: "bg-pink-50 dark:bg-pink-950/30",
    bar: "bg-pink-500",
    text: "text-pink-600 dark:text-pink-400",
  },
  p2p: {
    bg: "bg-amber-50 dark:bg-amber-950/30",
    bar: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
  },
  communication: {
    bg: "bg-green-50 dark:bg-green-950/30",
    bar: "bg-green-500",
    text: "text-green-600 dark:text-green-400",
  },
  web: {
    bg: "bg-slate-50 dark:bg-slate-950/30",
    bar: "bg-slate-500",
    text: "text-slate-600 dark:text-slate-400",
  },
  gaming: {
    bg: "bg-purple-50 dark:bg-purple-950/30",
    bar: "bg-purple-500",
    text: "text-purple-600 dark:text-purple-400",
  },
  other: {
    bg: "bg-gray-50 dark:bg-gray-950/30",
    bar: "bg-gray-400",
    text: "text-gray-600 dark:text-gray-400",
  },
};

// ─── Sparkline Mini Chart (SVG) ──────────────────────────────────

function MiniSparkline({
  data,
  color = "#16A34A",
  height = 32,
  width = 120,
}: {
  data: number[];
  color?: string;
  height?: number;
  width?: number;
}) {
  if (!data.length) return null;
  const max = Math.max(...data, 0.01);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = width / (data.length - 1);

  const points = data
    .map((v, i) => {
      const x = i * step;
      const y = height - 2 - ((v - min) / range) * (height - 4);
      return `${x},${y}`;
    })
    .join(" ");

  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon
        points={areaPoints}
        fill={`url(#grad-${color.replace("#", "")})`}
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Traffic Trend SVG Bar Chart ─────────────────────────────────

function TrafficTrendChart({ data }: { data: TrendPoint[] }) {
  const maxVal = Math.max(...data.map((d) => d.download + d.upload)) * 1.15;
  const chartH = 220;
  const barW = 14;
  const gap = 4;
  const totalW = data.length * (barW + gap);
  const labelH = 40;

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[600px]">
        {/* Y-axis labels */}
        <div className="relative h-[220px] ml-8 mr-2">
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
            <div
              key={pct}
              className="absolute left-0 right-0 border-t border-dashed border-border/40"
              style={{ top: `${pct * 100}%` }}
            >
              <span className="absolute -left-7 -top-2 text-[10px] text-muted-foreground tabular-nums">
                {(maxVal * (1 - pct)).toFixed(1)}
              </span>
            </div>
          ))}

          {/* Bars */}
          <div className="absolute inset-0 flex items-end justify-center">
            <svg width={totalW} height={chartH} className="overflow-visible">
              {/* Download bars */}
              {data.map((d, i) => {
                const x = i * (barW + gap);
                const dlH = (d.download / maxVal) * chartH;
                const ulH = (d.upload / maxVal) * chartH;
                return (
                  <g key={i}>
                    {/* Download (green) */}
                    <rect
                      x={x}
                      y={chartH - dlH - ulH}
                      width={barW}
                      height={dlH}
                      rx={2}
                      fill="#16A34A"
                      opacity={0.85}
                      className="hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <title>
                        {d.hour} — DL: {d.download.toFixed(2)} Gbps
                      </title>
                    </rect>
                    {/* Upload (orange) */}
                    <rect
                      x={x}
                      y={chartH - ulH}
                      width={barW}
                      height={ulH}
                      rx={2}
                      fill="#F97316"
                      opacity={0.85}
                      className="hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <title>
                        {d.hour} — UL: {d.upload.toFixed(2)} Gbps
                      </title>
                    </rect>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* X-axis labels */}
        <div
          className="flex ml-8 mr-2 mt-1"
          style={{ width: totalW }}
        >
          {data
            .filter((_, i) => i % 3 === 0)
            .map((d, i) => {
              const idx = i * 3;
              return (
                <span
                  key={idx}
                  className="text-[10px] text-muted-foreground flex-1 text-center tabular-nums"
                  style={{ marginLeft: idx === 0 ? 0 : `${(barW + gap) * 2}px` }}
                >
                  {d.hour}
                </span>
              );
            })}
        </div>
      </div>
    </div>
  );
}

// ─── Sort Icon Component (must be outside render) ──────────────────
function SortIcon({ field, currentField, sortDir }: { field: SortField; currentField: SortField; sortDir: SortDir }) {
  if (currentField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 text-muted-foreground/50" />;
  return sortDir === "asc" ? (
    <ChevronUp className="h-3 w-3 ml-1 text-primary" />
  ) : (
    <ChevronDown className="h-3 w-3 ml-1 text-primary" />
  );
}

// ─── Main Component ──────────────────────────────────────────────

export default function TrafficAnalyticsPage() {
  const [timeRange, setTimeRange] = useState("24h");
  const [sortField, setSortField] = useState<SortField>("total");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // ─── API Query ────────────────────────────────────────────────
  const { data, isLoading, isFetching, refetch } = useQuery<TrafficAnalyticsResponse>({
    queryKey: ["traffic-analytics", timeRange],
    queryFn: () => fetch("/api/traffic-analytics").then((r) => r.json()),
    refetchInterval: 60000, // Refresh every 60s
  });

  const summary = data?.summary;
  const trend = data?.trend || [];
  const topTalkers = data?.topTalkers || [];
  const protocols = data?.protocols || [];
  const geoData = data?.geographic || [];
  const interfaces = data?.interfaces || [];

  // ─── Sorted Top Talkers ────────────────────────────────────────
  const sortedTalkers = useMemo(() => {
    const sorted = [...topTalkers].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "rank":
          cmp = a.rank - b.rank;
          break;
        case "username":
          cmp = a.username.localeCompare(b.username);
          break;
        case "ip":
          cmp = a.ip.localeCompare(b.ip);
          break;
        case "download":
          cmp = a.download - b.download;
          break;
        case "upload":
          cmp = a.upload - b.upload;
          break;
        case "total":
          cmp = a.total - b.total;
          break;
        case "sessionDuration":
          cmp = a.sessionDuration.localeCompare(b.sessionDuration);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [topTalkers, sortField, sortDir]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  function handleRefresh() {
    refetch().then(() => {
      toast.success("Traffic data refreshed");
    });
  }

  function handleExport() {
    const headers = ["Rank", "Subscriber ID", "Username", "IP", "Download (MB)", "Upload (MB)", "Total (MB)", "Session Duration", "Top Protocol"];
    const rows = sortedTalkers.map((t) =>
      [t.rank, t.subscriberId, t.username, t.ip, t.download, t.upload, t.total, t.sessionDuration, t.protocols[0]?.name].join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `traffic-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Top talkers data exported as CSV");
  }

  // ─── Loading State ────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading traffic analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ─── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Traffic Analytics
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Deep-dive into ISP traffic patterns, top consumers, and protocol distribution.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          <span className="text-xs font-medium text-green-600">Live Monitoring</span>
        </div>
      </div>

      {/* ─── Section 1: Summary Cards ───────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Traffic */}
        <Card className="border shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-950/30 dark:to-orange-950/30">
                  <Activity className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums tracking-tight">
                    {summary ? ((summary.totalTraffic.download + summary.totalTraffic.upload)).toFixed(0) : "0"}
                    <span className="text-sm font-medium text-muted-foreground ml-1">GB</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Total Traffic (Today)</p>
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1 text-green-600">
                <ArrowDownToLine className="h-3 w-3" />
                {summary?.totalTraffic.download.toFixed(1) || "0"} GB
              </span>
              <span className="flex items-center gap-1 text-orange-500">
                <ArrowUpFromLine className="h-3 w-3" />
                {summary?.totalTraffic.upload.toFixed(1) || "0"} GB
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Active Sessions */}
        <Card className="border shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30">
                <Users className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums tracking-tight">
                  {summary?.activeSessions.toLocaleString() || "0"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Active Sessions</p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1 text-xs text-green-600">
              <TrendingUp className="h-3 w-3" />
              <span>From database</span>
            </div>
          </CardContent>
        </Card>

        {/* Top Protocol */}
        <Card className="border shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-gradient-to-br from-red-50 to-pink-50 dark:from-red-950/30 dark:to-pink-950/30">
                <Zap className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold tracking-tight">{summary?.topProtocol.name || "—"}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Top Protocol</p>
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground">Traffic share</span>
                <span className="font-semibold text-primary">{summary?.topProtocol.percent || 0}%</span>
              </div>
              <Progress value={summary?.topProtocol.percent || 0} className="h-1.5" />
            </div>
          </CardContent>
        </Card>

        {/* Peak Bandwidth */}
        <Card className="border shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/30">
                <TrendingUp className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums tracking-tight">
                  {summary?.peakBandwidth.value || "0"}
                  <span className="text-sm font-medium text-muted-foreground ml-1">Gbps</span>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">Peak Bandwidth</p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>Recorded at {summary?.peakBandwidth.time || "—"}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Section 2: Traffic Trend Chart ─────────────────────── */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Traffic Trend — Last 24 Hours
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Download &amp; upload bandwidth aggregated hourly
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-green-500" />
                  Download
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-orange-500" />
                  Upload
                </span>
              </div>
              <Separator orientation="vertical" className="h-4" />
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="h-8 w-[100px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">Last 24h</SelectItem>
                  <SelectItem value="7d">Last 7d</SelectItem>
                  <SelectItem value="30d">Last 30d</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={handleRefresh}
                disabled={isFetching}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <TrafficTrendChart data={trend} />
        </CardContent>
      </Card>

      {/* ─── Section 3: Top Talkers Table ───────────────────────── */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Top {sortedTalkers.length} Bandwidth Consumers
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Highest traffic-generating subscribers sorted by total usage
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={handleExport}
            >
              <FileDown className="h-3.5 w-3.5" />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <ScrollArea className="max-h-[520px]">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead
                    className="text-xs cursor-pointer select-none"
                    onClick={() => handleSort("rank")}
                  >
                    <span className="flex items-center">
                      Rank <SortIcon field="rank" currentField={sortField} sortDir={sortDir} />
                    </span>
                  </TableHead>
                  <TableHead
                    className="text-xs cursor-pointer select-none"
                    onClick={() => handleSort("username")}
                  >
                    <span className="flex items-center">
                      Subscriber <SortIcon field="username" currentField={sortField} sortDir={sortDir} />
                    </span>
                  </TableHead>
                  <TableHead
                    className="text-xs cursor-pointer select-none"
                    onClick={() => handleSort("ip")}
                  >
                    <span className="flex items-center">
                      IP Address <SortIcon field="ip" currentField={sortField} sortDir={sortDir} />
                    </span>
                  </TableHead>
                  <TableHead
                    className="text-xs cursor-pointer select-none text-right"
                    onClick={() => handleSort("download")}
                  >
                    <span className="flex items-center justify-end">
                      <ArrowDownToLine className="h-3 w-3 text-green-600 mr-1" />
                      Download <SortIcon field="download" currentField={sortField} sortDir={sortDir} />
                    </span>
                  </TableHead>
                  <TableHead
                    className="text-xs cursor-pointer select-none text-right"
                    onClick={() => handleSort("upload")}
                  >
                    <span className="flex items-center justify-end">
                      <ArrowUpFromLine className="h-3 w-3 text-orange-500 mr-1" />
                      Upload <SortIcon field="upload" currentField={sortField} sortDir={sortDir} />
                    </span>
                  </TableHead>
                  <TableHead
                    className="text-xs cursor-pointer select-none text-right"
                    onClick={() => handleSort("total")}
                  >
                    <span className="flex items-center justify-end">
                      Total <SortIcon field="total" currentField={sortField} sortDir={sortDir} />
                    </span>
                  </TableHead>
                  <TableHead
                    className="text-xs cursor-pointer select-none text-right"
                    onClick={() => handleSort("sessionDuration")}
                  >
                    <span className="flex items-center justify-end">
                      Duration <SortIcon field="sessionDuration" currentField={sortField} sortDir={sortDir} />
                    </span>
                  </TableHead>
                  <TableHead className="text-xs">Protocols</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedTalkers.length > 0 ? sortedTalkers.map((t) => (
                  <TableRow key={t.subscriberId} className="group">
                    <TableCell className="text-xs">
                      <span
                        className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold ${
                          t.rank <= 3
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {t.rank}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs font-medium">{t.username}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        {t.subscriberId}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {t.ip}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono tabular-nums text-green-600 font-medium">
                      {formatTraffic(t.download)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono tabular-nums text-orange-500 font-medium">
                      {formatTraffic(t.upload)}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono tabular-nums font-semibold">
                      {formatTraffic(t.total)}
                    </TableCell>
                    <TableCell className="text-xs text-right text-muted-foreground tabular-nums">
                      {t.sessionDuration}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 flex-wrap">
                        {t.protocols.length > 0 ? t.protocols.slice(0, 2).map((p) => (
                          <Badge
                            key={p.name}
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0 font-medium"
                          >
                            {p.name}
                            <span className="text-muted-foreground ml-0.5">
                              {p.percent}%
                            </span>
                          </Badge>
                        )) : (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                        {t.protocols.length > 2 && (
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 cursor-help"
                              >
                                +{t.protocols.length - 2}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              {t.protocols.slice(2).map((p) => (
                                <div key={p.name} className="text-xs">
                                  {p.name}: {p.percent}%
                                </div>
                              ))}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                      No usage data available
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </CardContent>
      </Card>

      {/* ─── Sections 4, 5, 6 in a responsive grid ─────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ─── Section 4: Protocol Distribution ──────────────────── */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              Protocol Distribution
            </CardTitle>
            <CardDescription className="text-xs">
              Traffic breakdown by application/protocol
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            {protocols.length > 0 ? protocols.map((proto) => {
              const colors = CATEGORY_COLORS[proto.category];
              return (
                <div key={proto.name} className="group">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block w-2.5 h-2.5 rounded-sm ${colors.bar}`}
                      />
                      <span className="font-medium">{proto.name}</span>
                      <Badge
                        variant="outline"
                        className={`text-[9px] px-1 py-0 ${colors.text} border-current/20`}
                      >
                        {proto.category}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 tabular-nums">
                      <span className="text-muted-foreground">
                        {proto.bytes} GB
                      </span>
                      <span className="font-semibold w-10 text-right">
                        {proto.percent}%
                      </span>
                    </div>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${colors.bar} transition-all duration-500 group-hover:opacity-80`}
                      style={{ width: `${proto.percent}%` }}
                    />
                  </div>
                </div>
              );
            }) : (
              <p className="text-sm text-muted-foreground text-center py-4">No protocol data available</p>
            )}

            {/* Legend */}
            <Separator className="my-2" />
            <div className="flex flex-wrap items-center gap-3 text-[10px]">
              {Object.entries(CATEGORY_COLORS).map(([key, c]) => (
                <span key={key} className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-sm ${c.bar}`} />
                  <span className="text-muted-foreground capitalize">{key}</span>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ─── Section 5: Geographic Distribution ───────────────── */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              Geographic Distribution
            </CardTitle>
            <CardDescription className="text-xs">
              Top 10 locations by traffic volume
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <ScrollArea className="max-h-[440px]">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs w-6">#</TableHead>
                    <TableHead className="text-xs">Location</TableHead>
                    <TableHead className="text-xs text-right">Sessions</TableHead>
                    <TableHead className="text-xs text-right">Traffic</TableHead>
                    <TableHead className="text-xs text-right">Avg Speed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {geoData.length > 0 ? geoData.map((g, i) => {
                    const maxTraffic = geoData[0].totalTraffic;
                    const pct = maxTraffic > 0 ? (g.totalTraffic / maxTraffic) * 100 : 0;
                    return (
                      <TableRow key={g.location}>
                        <TableCell className="text-xs">
                          <span
                            className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
                              i < 3
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {i + 1}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="text-xs font-medium">
                              {g.location}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums text-muted-foreground">
                          {g.sessions}
                        </TableCell>
                        <TableCell className="text-xs text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-primary/70"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="font-semibold tabular-nums w-16 text-right">
                              {g.totalTraffic} GB
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums">
                          {g.avgSpeed} Mbps
                        </TableCell>
                      </TableRow>
                    );
                  }) : (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                        No geographic data available
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* ─── Section 6: Interface Utilization ─────────────────── */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Network className="h-4 w-4 text-primary" />
                Interface Utilization
              </CardTitle>
              <CardDescription className="text-xs">
                Network device interfaces with bandwidth utilization
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <ScrollArea className="max-h-[360px]">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs">Interface</TableHead>
                  <TableHead className="text-xs text-center">Status</TableHead>
                  <TableHead className="text-xs text-right">Download</TableHead>
                  <TableHead className="text-xs text-right">Upload</TableHead>
                  <TableHead className="text-xs text-right">Peak In</TableHead>
                  <TableHead className="text-xs text-right">Peak Out</TableHead>
                  <TableHead className="text-xs text-right">Utilization</TableHead>
                  <TableHead className="text-xs">Trend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {interfaces.length > 0 ? interfaces.map((iface) => (
                  <TableRow key={iface.name}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Server className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="text-xs font-medium truncate max-w-[180px]">{iface.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        className={
                          iface.status === "up"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border-0 text-[10px]"
                            : "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400 border-0 text-[10px]"
                        }
                      >
                        {iface.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono tabular-nums text-green-600">
                      {iface.download} Gbps
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono tabular-nums text-orange-500">
                      {iface.upload} Gbps
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono tabular-nums text-muted-foreground">
                      {iface.peakIn} Gbps
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono tabular-nums text-muted-foreground">
                      {iface.peakOut} Gbps
                    </TableCell>
                    <TableCell className="text-xs text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-14 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              iface.utilization >= 80
                                ? "bg-red-500"
                                : iface.utilization >= 50
                                ? "bg-amber-500"
                                : "bg-emerald-500"
                            }`}
                            style={{ width: `${Math.min(iface.utilization, 100)}%` }}
                          />
                        </div>
                        <span className="font-semibold tabular-nums w-8 text-right">{iface.utilization}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <MiniSparkline data={iface.sparkline} width={100} height={28} />
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                      No interface data available
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
