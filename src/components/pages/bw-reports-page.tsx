"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  Activity, BarChart3, Download, Upload, Gauge, Users, Globe,
  ArrowDown, ArrowUp, TrendingUp, Clock, RefreshCw, FileDown,
  FileText, Filter, Calendar as CalendarIcon, Settings, ChevronDown,
  ChevronRight, Wifi, Network, Layers, Zap, PieChart as PieIcon,
  Search, Eye, Maximize2, X, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, PieChart, Pie, Cell, RadialBarChart, RadialBar,
} from "recharts";
import PageHeader from "@/components/page-header";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface TimeSeriesPoint {
  time: string;
  download: number;
  upload: number;
}

interface PoolSeriesPoint {
  time: string;
  [pool: string]: number | string;
}

interface TopConsumer {
  rank: number;
  username: string;
  ip: string;
  download: number;
  upload: number;
  total: number;
  avgSpeed: number;
}

interface SessionRecord {
  id: string;
  startTime: string;
  duration: string;
  download: number;
  upload: number;
  status: string;
}

interface UserReport {
  username: string;
  ip: string;
  plan: string;
  sessions: SessionRecord[];
  timeline: TimeSeriesPoint[];
  downloadTotal: number;
  uploadTotal: number;
}

interface PoolReport {
  name: string;
  subnet: string;
  utilization: number;
  avgDown: number;
  avgUp: number;
  totalData: number;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const COLORS = {
  download: "#10B981",
  upload: "#F59E0B",
  total: "#6366F1",
  peak: "#EF4444",
  avg: "#3B82F6",
  min: "#94A3B8",
};

const POOL_COLORS = ["#10B981", "#3B82F6", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16"];

const PIE_COLORS = ["#10B981", "#F59E0B", "#3B82F6", "#EF4444", "#8B5CF6", "#64748B"];

const TIME_RANGES = [
  { label: "1h", value: "1h" },
  { label: "6h", value: "6h" },
  { label: "12h", value: "12h" },
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "90d", value: "90d" },
  { label: "1y", value: "1y" },
] as const;

const INTERVALS = [
  { label: "5 min", value: "5m" },
  { label: "15 min", value: "15m" },
  { label: "1 hour", value: "1h" },
  { label: "6 hours", value: "6h" },
  { label: "1 day", value: "1d" },
] as const;

const TAB_ITEMS = [
  { value: "overview", label: "Overview", icon: Activity },
  { value: "gateway", label: "Gateway Reports", icon: Network },
  { value: "pool", label: "Pool Reports", icon: Layers },
  { value: "user", label: "User Reports", icon: Users },
  { value: "top", label: "Top Consumers", icon: BarChart3 },
  { value: "custom", label: "Custom Report", icon: Settings },
] as const;

type TabValue = (typeof TAB_ITEMS)[number]["value"];

// ═══════════════════════════════════════════════════════════════
// FORMATTERS
// ═══════════════════════════════════════════════════════════════

function formatBps(bps: number): string {
  if (bps >= 1_000_000_000) return `${(bps / 1_000_000_000).toFixed(2)} Gbps`;
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} Kbps`;
  return `${bps} bps`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_099_511_627_776) return `${(bytes / 1_099_511_627_776).toFixed(1)} TB`;
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ═══════════════════════════════════════════════════════════════
// CHART TOOLTIP COMPONENTS
// ═══════════════════════════════════════════════════════════════

function BWTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { value: number; name: string; color: string; dataKey?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg shadow-xl px-3 py-2 text-xs">
      <p className="font-medium text-foreground mb-1">{label}</p>
      {payload.map((item, i) => (
        <p key={i} className="text-muted-foreground flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
          {item.name}: <span className="text-foreground font-medium">{formatBps(item.value)}</span>
        </p>
      ))}
    </div>
  );
}

function BytesTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { value: number; name: string; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg shadow-xl px-3 py-2 text-xs">
      <p className="font-medium text-foreground mb-1">{label}</p>
      {payload.map((item, i) => (
        <p key={i} className="text-muted-foreground flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
          {item.name}: <span className="text-foreground font-medium">{formatBytes(item.value)}</span>
        </p>
      ))}
    </div>
  );
}

function PieTooltip({ active, payload }: {
  active?: boolean;
  payload?: { name: string; value: number; payload: { percent: number; fill: string } }[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-card border border-border rounded-lg shadow-xl px-3 py-2 text-xs">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: d.payload.fill }} />
        <span className="font-medium text-foreground">{d.name}</span>
      </div>
      <p className="text-muted-foreground">
        {formatBytes(d.value)} ({(d.payload.percent * 100).toFixed(1)}%)
      </p>
    </div>
  );
}

function ConsumerTooltip({ active, payload }: {
  active?: boolean;
  payload?: { value: number; name: string; color: string; payload: { username: string; ip: string } }[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-card border border-border rounded-lg shadow-xl px-3 py-2 text-xs">
      <p className="font-medium text-foreground">{d.payload.username}</p>
      <p className="text-muted-foreground">{d.payload.ip}</p>
      <p className="text-foreground font-medium mt-1">{formatBytes(d.value)}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// UTILITY COMPONENTS
// ═══════════════════════════════════════════════════════════════

function StatCard({ icon: Icon, label, value, sub, gradient }: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  gradient: string;
}) {
  return (
    <Card className="border shadow-sm hover:shadow-md transition-shadow duration-200">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${gradient}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-2xl font-bold tabular-nums leading-tight">{value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            {sub && <p className="text-[10px] text-muted-foreground/70">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function GaugeChart({ value, max, label, color }: {
  value: number; max: number; label: string; color: string;
}) {
  const pct = Math.min((value / max) * 100, 100);
  const data = [{ name: label, value: pct, fill: color }];
  return (
    <div className="flex flex-col items-center">
      <div className="h-40 w-40">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart cx="50%" cy="50%" innerRadius="60%" outerRadius="90%" startAngle={180} endAngle={0} barSize={12} data={data}>
            <RadialBar dataKey="value" cornerRadius={6} fill={color} background={{ fill: "currentColor" }} />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>
      <div className="text-center -mt-16">
        <p className="text-2xl font-bold tabular-nums">{pct.toFixed(0)}%</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function CSVExportButton({ data, filename }: { data: Record<string, unknown>[]; filename: string }) {
  const handleExport = useCallback(() => {
    if (!data.length) { toast.error("No data to export"); return; }
    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(","),
      ...data.map((row) =>
        headers
          .map((h) => {
            const v = String(row[h] ?? "");
            return v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
          })
          .join(",")
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported successfully");
  }, [data, filename]);

  return (
    <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={handleExport}>
      <FileDown className="h-3.5 w-3.5" />
      Export CSV
    </Button>
  );
}

// ═══════════════════════════════════════════════════════════════
// CUSTOM RADIAL LABEL (for utilization gauge)
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function BWReportsPage() {
  const [activeTab, setActiveTab] = useState<TabValue>("overview");

  // ─── Loading states ────────────────────────────────────────
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [gwLoading, setGwLoading] = useState(true);
  const [poolLoading, setPoolLoading] = useState(true);
  const [topLoading, setTopLoading] = useState(true);
  const [userLoading, setUserLoading] = useState(true);
  const [customLoading, setCustomLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const mountedRef = useRef(true);

  // Gateway reports state
  const [gwTimeRange, setGwTimeRange] = useState("24h");
  const [gwInterval, setGwInterval] = useState("15m");

  // Pool reports state
  const [poolTimeRange, setPoolTimeRange] = useState("7d");
  const [poolInterval, setPoolInterval] = useState("1h");
  const [selectedPools, setSelectedPools] = useState<string[]>([
    "Pool-A VLAN-10", "Pool-B VLAN-20", "Pool-C VLAN-30", "Pool-D VLAN-40",
  ]);
  const [dynamicPools, setDynamicPools] = useState<string[]>([
    "Pool-A VLAN-10", "Pool-B VLAN-20", "Pool-C VLAN-30", "Pool-D VLAN-40",
  ]);

  // User reports state
  const [userSearch, setUserSearch] = useState("");

  // Top consumers state
  const [topPeriod, setTopPeriod] = useState("7d");
  const [topLimit, setTopLimit] = useState("10");

  // Custom report state
  const [customSource, setCustomSource] = useState("gateway");
  const [customSourceId, setCustomSourceId] = useState("gw-main");
  const [customRange, setCustomRange] = useState("7d");
  const [customInterval, setCustomInterval] = useState("1h");
  const [customChartType, setCustomChartType] = useState<"area" | "line" | "bar" | "stacked">("area");
  const [customStartDate, setCustomStartDate] = useState<Date>();
  const [customEndDate, setCustomEndDate] = useState<Date>();
  const [customDateOpen, setCustomDateOpen] = useState(false);
  const [customGenerated, setCustomGenerated] = useState(false);

  // ─── API data states ───────────────────────────────────────
  const [overviewData, setOverviewData] = useState<TimeSeriesPoint[]>([]);
  const [overviewSummaryData, setOverviewSummaryData] = useState({
    avgDown: 0, peakDown: 0, avgUp: 0, peakUp: 0,
    totalDown: 0, totalUp: 0, p95: 0, currentUtil: 0,
    activeSessions: 0,
  });
  const [gwData, setGwData] = useState<TimeSeriesPoint[]>([]);
  const [gwStatsData, setGwStatsData] = useState({
    peakDown: 0, avgDown: 0, minDown: 0,
    peakUp: 0, avgUp: 0, minUp: 0, totalData: 0,
  });
  const [poolData, setPoolData] = useState<PoolSeriesPoint[]>([]);
  const [poolReportsData, setPoolReportsData] = useState<PoolReport[]>([]);
  const [topData, setTopData] = useState<TopConsumer[]>([]);
  const [userDataState, setUserDataState] = useState({
    username: "", ip: "", plan: "", sessions: [] as SessionRecord[],
    timeline: [] as TimeSeriesPoint[],
  });
  const [customDataState, setCustomDataState] = useState<TimeSeriesPoint[]>([]);

  // ─── Computed summaries ────────────────────────────────────
  const overviewSummary = useMemo(() => overviewSummaryData, [overviewSummaryData]);

  const sourceBreakdown = useMemo(() => [
    { name: "FTTH GPON", value: overviewSummary.totalDown * 0.52, percent: 0.52, fill: PIE_COLORS[0] },
    { name: "Wireless", value: overviewSummary.totalDown * 0.25, percent: 0.25, fill: PIE_COLORS[1] },
    { name: "Leased Line", value: overviewSummary.totalDown * 0.12, percent: 0.12, fill: PIE_COLORS[2] },
    { name: "Cable", value: overviewSummary.totalDown * 0.07, percent: 0.07, fill: PIE_COLORS[3] },
    { name: "Ethernet", value: overviewSummary.totalDown * 0.04, percent: 0.04, fill: PIE_COLORS[4] },
  ], [overviewSummary]);

  const gwStats = useMemo(() => gwStatsData, [gwStatsData]);

  const poolReports = useMemo(() => poolReportsData, [poolReportsData]);

  const userData = useMemo(() => userDataState, [userDataState]);
  const userRatio = useMemo(() => {
    const dl = userData.timeline.reduce((s, d) => s + d.download, 0);
    const ul = userData.timeline.reduce((s, d) => s + d.upload, 0);
    if (dl + ul === 0) return [{ name: "Download", value: 0, percent: 0.5, fill: COLORS.download },
            { name: "Upload", value: 0, percent: 0.5, fill: COLORS.upload }];
    return [{ name: "Download", value: dl, percent: dl / (dl + ul), fill: COLORS.download },
            { name: "Upload", value: ul, percent: ul / (dl + ul), fill: COLORS.upload }];
  }, [userData]);

  const customData = useMemo(() => customDataState, [customDataState]);
  const customStats = useMemo(() => {
    if (!customData.length) return null;
    const downloads = customData.map((d) => d.download);
    const uploads = customData.map((d) => d.upload);
    return {
      peakDown: Math.max(...downloads),
      avgDown: downloads.reduce((s, v) => s + v, 0) / downloads.length,
      minDown: Math.min(...downloads),
      peakUp: Math.max(...uploads),
      avgUp: uploads.reduce((s, v) => s + v, 0) / uploads.length,
      minUp: Math.min(...uploads),
      totalData: downloads.reduce((s, v) => s + v, 0) + uploads.reduce((s, v) => s + v, 0),
      dataPoints: customData.length,
    };
  }, [customData]);

  // ═══════════════════════════════════════════════════════════
  // API FETCH HOOKS
  // ═══════════════════════════════════════════════════════════

  // Helper to compute summary from timeseries data
  const computeStats = useCallback((data: TimeSeriesPoint[]) => {
    if (!data.length) return { peakDown: 0, avgDown: 0, minDown: 0, peakUp: 0, avgUp: 0, minUp: 0, totalData: 0 };
    const downloads = data.map((d) => d.download);
    const uploads = data.map((d) => d.upload);
    return {
      peakDown: Math.max(...downloads),
      avgDown: Math.round(downloads.reduce((s, v) => s + v, 0) / downloads.length),
      minDown: Math.min(...downloads),
      peakUp: Math.max(...uploads),
      avgUp: Math.round(uploads.reduce((s, v) => s + v, 0) / uploads.length),
      minUp: Math.min(...uploads),
      totalData: downloads.reduce((s, v) => s + v, 0) + uploads.reduce((s, v) => s + v, 0),
    };
  }, []);

  // Fetch overview data on mount
  useEffect(() => {
    if (!mountedRef.current) return;
    Promise.all([
      fetch(`/api/bw-reports?type=timeseries&range=24h&interval=15m`).then((r) => r.json()),
      fetch(`/api/bw-reports?type=summary&range=24h`).then((r) => r.json()),
    ])
      .then(([tsRes, sumRes]) => {
        if (!mountedRef.current) return;
        const tsData: TimeSeriesPoint[] = tsRes.data || [];
        setOverviewData(tsData);
        if (tsData.length > 0) {
          const downloads = tsData.map((d) => d.download);
          const uploads = tsData.map((d) => d.upload);
          const all = [...downloads, ...uploads].sort((a, b) => a - b);
          const p95Idx = Math.floor(all.length * 0.95);
          setOverviewSummaryData({
            avgDown: Math.round(downloads.reduce((s, v) => s + v, 0) / downloads.length),
            peakDown: Math.max(...downloads),
            avgUp: Math.round(uploads.reduce((s, v) => s + v, 0) / uploads.length),
            peakUp: Math.max(...uploads),
            totalDown: downloads.reduce((s, v) => s + v, 0),
            totalUp: uploads.reduce((s, v) => s + v, 0),
            p95: all[p95Idx] || 0,
            currentUtil: Math.round((downloads[downloads.length - 1] / 1_000_000_000) * 100),
            activeSessions: (sumRes.data as any)?.activeSessions || 0,
          });
        } else if (sumRes.data) {
          setOverviewSummaryData({ ...overviewSummaryData, ...sumRes.data });
        }
      })
      .catch((err) => {
        console.error("Overview fetch error:", err);
        setFetchError("Failed to load overview data");
      })
      .finally(() => { if (mountedRef.current) setOverviewLoading(false); });
  }, []);

  // Fetch gateway data when range/interval changes
  useEffect(() => {
    if (!mountedRef.current) return;
    fetch(`/api/bw-reports?type=timeseries&range=${gwTimeRange}&interval=${gwInterval}`)
      .then((r) => r.json())
      .then((res) => {
        if (!mountedRef.current) return;
        const data: TimeSeriesPoint[] = res.data || [];
        setGwData(data);
        setGwStatsData(computeStats(data));
      })
      .catch((err) => {
        console.error("Gateway fetch error:", err);
        setFetchError("Failed to load gateway data");
      })
      .finally(() => { if (mountedRef.current) setGwLoading(false); });
  }, [gwTimeRange, gwInterval, computeStats]);

  // Fetch pool data
  useEffect(() => {
    if (!mountedRef.current) return;
    Promise.all([
      fetch(`/api/bw-reports?type=pool-timeseries&range=${poolTimeRange}&interval=${poolInterval}`).then((r) => r.json()),
      fetch(`/api/bw-reports?type=pool-report&range=${poolTimeRange}`).then((r) => r.json()),
    ])
      .then(([tsRes, reportRes]) => {
        if (!mountedRef.current) return;
        const tsData: PoolSeriesPoint[] = tsRes.data || [];
        setPoolData(tsData);
        if (tsRes.pools && Array.isArray(tsRes.pools)) {
          setDynamicPools(tsRes.pools);
          setSelectedPools(tsRes.pools);
        }
        const reportData: PoolReport[] = reportRes.data || [];
        setPoolReportsData(reportData);
      })
      .catch((err) => {
        console.error("Pool fetch error:", err);
        setFetchError("Failed to load pool data");
      })
      .finally(() => { if (mountedRef.current) setPoolLoading(false); });
  }, [poolTimeRange, poolInterval]);

  // Fetch top consumers
  useEffect(() => {
    if (!mountedRef.current) return;
    fetch(`/api/bw-reports?type=top-users&limit=${topLimit}&period=${topPeriod}`)
      .then((r) => r.json())
      .then((res) => {
        if (!mountedRef.current) return;
        setTopData(res.data || []);
      })
      .catch((err) => {
        console.error("Top consumers fetch error:", err);
        setFetchError("Failed to load top consumers");
      })
      .finally(() => { if (mountedRef.current) setTopLoading(false); });
  }, [topLimit, topPeriod]);

  // Fetch user data when searching
  const userSearchRef = useRef(userSearch);
  useEffect(() => {
    userSearchRef.current = userSearch;
    if (!userSearch.trim() || !mountedRef.current) return;
    fetch(`/api/bw-reports?type=timeseries&range=24h&interval=30m`)
      .then((r) => r.json())
      .then((res) => {
        if (!mountedRef.current) return;
        setUserDataState({
          username: userSearch,
          ip: "—",
          plan: "—",
          sessions: [],
          timeline: res.data || [],
        });
      })
      .catch((err) => {
        console.error("User fetch error:", err);
      })
      .finally(() => { if (mountedRef.current) setUserLoading(false); });
  }, [userSearch]);

  // Derive display user data (empty when not searching)
  const displayUserData = !userSearch.trim()
    ? { username: "", ip: "", plan: "", sessions: [] as SessionRecord[], timeline: [] as TimeSeriesPoint[] }
    : userDataState;

  // Fetch custom report data when generated
  const prevCustomGenerated = useRef(customGenerated);
  useEffect(() => {
    prevCustomGenerated.current = customGenerated;
    if (!customGenerated || !mountedRef.current) return;
    fetch(`/api/bw-reports?type=timeseries&range=${customRange}&interval=${customInterval}`)
      .then((r) => r.json())
      .then((res) => {
        if (!mountedRef.current) return;
        setCustomDataState(res.data || []);
      })
      .catch((err) => {
        console.error("Custom report fetch error:", err);
        toast.error("Failed to generate report");
      })
      .finally(() => { if (mountedRef.current) setCustomLoading(false); });
  }, [customGenerated, customRange, customInterval]);

  // Derive display custom data (empty when not generated)
  const displayCustomData = !customGenerated ? [] : customDataState;

  // Cleanup
  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  // ─── Refresh handler ──────────────────────────────────────
  const handleRefresh = useCallback(() => {
    setFetchError("");
    // Re-trigger all fetches by toggling state briefly
    setOverviewLoading(true);
    Promise.all([
      fetch(`/api/bw-reports?type=timeseries&range=24h&interval=15m`).then((r) => r.json()),
      fetch(`/api/bw-reports?type=summary&range=24h`).then((r) => r.json()),
    ])
      .then(([tsRes, sumRes]) => {
        const tsData: TimeSeriesPoint[] = tsRes.data || [];
        setOverviewData(tsData);
        if (tsData.length > 0) {
          const downloads = tsData.map((d) => d.download);
          const uploads = tsData.map((d) => d.upload);
          const all = [...downloads, ...uploads].sort((a, b) => a - b);
          const p95Idx = Math.floor(all.length * 0.95);
          setOverviewSummaryData({
            avgDown: Math.round(downloads.reduce((s, v) => s + v, 0) / downloads.length),
            peakDown: Math.max(...downloads),
            avgUp: Math.round(uploads.reduce((s, v) => s + v, 0) / uploads.length),
            peakUp: Math.max(...uploads),
            totalDown: downloads.reduce((s, v) => s + v, 0),
            totalUp: uploads.reduce((s, v) => s + v, 0),
            p95: all[p95Idx] || 0,
            currentUtil: Math.round((downloads[downloads.length - 1] / 1_000_000_000) * 100),
            activeSessions: (sumRes.data as any)?.activeSessions || 0,
          });
        }
        toast.success("Data refreshed");
      })
      .catch(() => toast.error("Refresh failed"))
      .finally(() => setOverviewLoading(false));
  }, []);

  // ═══════════════════════════════════════════════════════════
  // RENDER: OVERVIEW TAB
  // ═══════════════════════════════════════════════════════════
  const renderOverview = () => (
    <div className="space-y-6">
          {overviewLoading ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {[...Array(5)].map((_, i) => (
                  <Card key={i} className="border shadow-sm">
                    <CardContent className="p-4"><Skeleton className="h-8 w-24" /></CardContent>
                  </Card>
                ))}
              </div>
              <Card className="lg:col-span-3 border shadow-sm">
                <CardContent className="p-4"><Skeleton className="h-72 w-full" /></CardContent>
              </Card>
              <Card className="lg:col-span-1 border shadow-sm">
                <CardContent className="p-4"><Skeleton className="h-40 w-full" /></CardContent>
              </Card>
              <Card className="border shadow-sm">
                <CardContent className="p-4"><Skeleton className="h-64 w-full" /></CardContent>
              </Card>
            </div>
          ) : (
      <div className="space-y-6">
      {fetchError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
n          {fetchError}
          <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={handleRefresh}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      {/* Summary stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard icon={Gauge} label="Total Bandwidth" value={formatBps(overviewSummary.avgDown + overviewSummary.avgUp)} sub={`Peak: ${formatBps(overviewSummary.peakDown)}`} gradient="bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400" />
        <StatCard icon={Wifi} label="Active Sessions" value={overviewSummary.activeSessions.toLocaleString() || "—"} sub="Active subscribers" gradient="bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400" />
        <StatCard icon={ArrowDown} label="Top Download" value={formatBps(overviewSummary.peakDown)} sub="24h peak" gradient="bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400" />
        <StatCard icon={ArrowUp} label="Top Upload" value={formatBps(overviewSummary.peakUp)} sub="24h peak" gradient="bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400" />
        <StatCard icon={TrendingUp} label="95th Percentile" value={formatBps(overviewSummary.p95)} sub="Sustained peak" gradient="bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400" />
      </div>

      {/* 24h Traffic Graph + Gauge + Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* 24h area chart */}
        <Card className="lg:col-span-3 border shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-500" />
                24-Hour Traffic
              </CardTitle>
              <Badge variant="outline" className="text-[10px]">Last 24 Hours</Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={overviewData}>
                  <defs>
                    <linearGradient id="ov-dl" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.download} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={COLORS.download} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="ov-ul" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.upload} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={COLORS.upload} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis dataKey="time" tick={{ fill: "#94A3B8", fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: "#94A3B8", fontSize: 10 }} tickFormatter={(v) => formatBps(v)} width={70} />
                  <Tooltip content={<BWTooltip />} />
                  <Legend formatter={(v: string) => <span className="text-xs text-muted-foreground">{v}</span>} />
                  <Area type="monotone" dataKey="download" name="Download" stroke={COLORS.download} strokeWidth={2} fill="url(#ov-dl)" dot={false} />
                  <Area type="monotone" dataKey="upload" name="Upload" stroke={COLORS.upload} strokeWidth={2} fill="url(#ov-ul)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Right column: Gauge + Pie */}
        <div className="space-y-6">
          <Card className="border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Gauge className="h-4 w-4 text-amber-500" />
                Current Utilization
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 flex justify-center">
              <GaugeChart value={overviewSummary.currentUtil} max={100} label="of 1 Gbps" color={COLORS.download} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Traffic breakdown pie */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <PieIcon className="h-4 w-4 text-blue-500" />
            Traffic Breakdown by Source Type
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-col lg:flex-row items-center gap-6">
            <div className="h-64 w-64 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={sourceBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2} strokeWidth={0}>
                    {sourceBreakdown.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 flex-1">
              {sourceBreakdown.map((item) => (
                <div key={item.name} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border border-border/50">
                  <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: item.fill }} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{item.name}</p>
                    <p className="text-[10px] text-muted-foreground">{(item.percent * 100).toFixed(0)}% • {formatBytes(item.value)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
      )}
    </div>
  );

  // ═══════════════════════════════════════════════════════════
  // RENDER: GATEWAY REPORTS TAB
  // ═══════════════════════════════════════════════════════════
  const renderGateway = () => {
    const csvData = gwData.map((d) => ({ Time: d.time, Download_bps: d.download, Upload_bps: d.upload, Download_Mbps: +(d.download / 1_000_000).toFixed(2), Upload_Mbps: +(d.upload / 1_000_000).toFixed(2) }));

    return (
      <div className="space-y-6">
        {/* Toolbar */}
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row md:items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                {TIME_RANGES.map((r) => (
                  <Button key={r.value} variant={gwTimeRange === r.value ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => setGwTimeRange(r.value)}>
                    {r.label}
                  </Button>
                ))}
              </div>
              <div className="hidden md:block w-px h-6 bg-border" />
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Interval:</Label>
                <Select value={gwInterval} onValueChange={setGwInterval}>
                  <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INTERVALS.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="ml-auto">
                <CSVExportButton data={csvData} filename={`gateway-report-${gwTimeRange}.csv`} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Large area chart */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Network className="h-4 w-4 text-emerald-500" />
                Gateway Bandwidth — Last {gwTimeRange}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleRefresh} title="Refresh">
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                <Badge variant="secondary" className="text-[10px]">{gwData.length} data points</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={gwData}>
                  <defs>
                    <linearGradient id="gw-dl" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.download} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={COLORS.download} stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="gw-ul" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.upload} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={COLORS.upload} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis dataKey="time" tick={{ fill: "#94A3B8", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#94A3B8", fontSize: 10 }} tickFormatter={(v) => formatBps(v)} width={75} />
                  <Tooltip content={<BWTooltip />} />
                  <Legend formatter={(v: string) => <span className="text-xs text-muted-foreground">{v}</span>} />
                  <Area type="monotone" dataKey="download" name="Download" stroke={COLORS.download} strokeWidth={2} fill="url(#gw-dl)" dot={false} />
                  <Area type="monotone" dataKey="upload" name="Upload" stroke={COLORS.upload} strokeWidth={2} fill="url(#gw-ul)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Stats below chart */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={ArrowDown} label="Peak Download" value={formatBps(gwStats.peakDown)} gradient="bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400" />
          <StatCard icon={Activity} label="Avg Download" value={formatBps(gwStats.avgDown)} gradient="bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400" />
          <StatCard icon={ArrowDown} label="Min Download" value={formatBps(gwStats.minDown)} gradient="bg-slate-100 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400" />
          <StatCard icon={Zap} label="Total Transferred" value={formatBytes(gwStats.totalData)} gradient="bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard icon={ArrowUp} label="Peak Upload" value={formatBps(gwStats.peakUp)} gradient="bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400" />
          <StatCard icon={Activity} label="Avg Upload" value={formatBps(gwStats.avgUp)} gradient="bg-purple-100 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400" />
          <StatCard icon={Activity} label="Min Upload" value={formatBps(gwStats.minUp)} gradient="bg-slate-100 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400" />
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════
  // RENDER: POOL REPORTS TAB
  // ═══════════════════════════════════════════════════════════
  const renderPool = () => {
    const allPools = dynamicPools;
    const togglePool = (pool: string) => {
      setSelectedPools((prev) =>
        prev.includes(pool) ? prev.filter((p) => p !== pool) : [...prev, pool]
      );
    };

    return (
      <div className="space-y-6">
        {/* Pool selector + time range */}
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row md:items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Layers className="h-4 w-4 text-muted-foreground shrink-0" />
                {allPools.map((pool) => (
                  <Button
                    key={pool}
                    variant={selectedPools.includes(pool) ? "default" : "outline"}
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => togglePool(pool)}
                  >
                    {pool}
                  </Button>
                ))}
              </div>
              <div className="hidden md:block w-px h-6 bg-border" />
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Period:</Label>
                <Select value={poolTimeRange} onValueChange={setPoolTimeRange}>
                  <SelectTrigger className="h-8 w-[100px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["24h", "7d", "30d", "90d"].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={poolInterval} onValueChange={setPoolInterval}>
                  <SelectTrigger className="h-8 w-[100px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["15m", "1h", "6h", "1d"].map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stacked area chart */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Layers className="h-4 w-4 text-purple-500" />
              Per-Pool Bandwidth (Stacked)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={poolData}>
                  <defs>
                    {allPools.map((pool, i) => (
                      <linearGradient key={pool} id={`pool-${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={POOL_COLORS[i]} stopOpacity={0.4} />
                        <stop offset="95%" stopColor={POOL_COLORS[i]} stopOpacity={0.05} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis dataKey="time" tick={{ fill: "#94A3B8", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#94A3B8", fontSize: 10 }} tickFormatter={(v) => formatBps(v)} width={75} />
                  <Tooltip content={<BWTooltip />} />
                  <Legend formatter={(v: string) => <span className="text-xs text-muted-foreground">{v}</span>} />
                  {allPools.map((pool, i) => (
                    <Area
                      key={pool}
                      type="monotone"
                      dataKey={pool}
                      name={pool}
                      stroke={POOL_COLORS[i]}
                      strokeWidth={1.5}
                      fill={`url(#pool-${i})`}
                      dot={false}
                      stackId="1"
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Pool comparison table */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Network className="h-4 w-4 text-blue-500" />
              Pool Comparison
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-xs">Pool</TableHead>
                    <TableHead className="text-xs">Subnet</TableHead>
                    <TableHead className="text-xs">Utilization</TableHead>
                    <TableHead className="text-xs text-right">Avg ↓</TableHead>
                    <TableHead className="text-xs text-right">Avg ↑</TableHead>
                    <TableHead className="text-xs text-right">Total Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {poolReports.map((pool, i) => (
                    <TableRow key={pool.name} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-medium text-xs flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: POOL_COLORS[i] }} />
                        {pool.name}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{pool.subnet}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden max-w-[120px]">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${pool.utilization}%`,
                                backgroundColor: pool.utilization > 80 ? COLORS.peak : pool.utilization > 60 ? COLORS.upload : COLORS.download,
                              }}
                            />
                          </div>
                          <span className={`text-xs font-medium ${pool.utilization > 80 ? "text-red-600" : pool.utilization > 60 ? "text-amber-600" : "text-emerald-600"}`}>
                            {pool.utilization}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-right text-emerald-600">{formatBps(pool.avgDown)}</TableCell>
                      <TableCell className="text-xs font-mono text-right text-amber-600">{formatBps(pool.avgUp)}</TableCell>
                      <TableCell className="text-xs font-mono text-right font-medium">{formatBytes(pool.totalData)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════
  // RENDER: USER REPORTS TAB
  // ═══════════════════════════════════════════════════════════
  const renderUser = () => {
    const csvData = userData.timeline.map((d) => ({
      Time: d.time, Download_bps: d.download, Upload_bps: d.upload,
    }));

    return (
      <div className="space-y-6">
        {/* User search */}
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-2 flex-1">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by username or IP address..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="secondary" className="text-xs gap-1">
                  <Users className="h-3 w-3" />
                  {userData.username}
                </Badge>
                <Badge variant="outline" className="text-xs font-mono">{userData.ip}</Badge>
                <Badge variant="outline" className="text-xs">{userData.plan}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* User bandwidth timeline */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-500" />
                Bandwidth Timeline — {userData.username}
              </CardTitle>
              <CSVExportButton data={csvData} filename={`user-${userData.username}.csv`} />
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={userData.timeline}>
                  <defs>
                    <linearGradient id="usr-dl" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.download} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={COLORS.download} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="usr-ul" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.upload} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={COLORS.upload} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis dataKey="time" tick={{ fill: "#94A3B8", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#94A3B8", fontSize: 10 }} tickFormatter={(v) => formatBps(v)} width={70} />
                  <Tooltip content={<BWTooltip />} />
                  <Legend formatter={(v: string) => <span className="text-xs text-muted-foreground">{v}</span>} />
                  <Area type="monotone" dataKey="download" name="Download" stroke={COLORS.download} strokeWidth={2} fill="url(#usr-dl)" dot={false} />
                  <Area type="monotone" dataKey="upload" name="Upload" stroke={COLORS.upload} strokeWidth={2} fill="url(#usr-ul)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* DL/UL Pie + Session History */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Download/Upload ratio pie */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <PieIcon className="h-4 w-4 text-purple-500" />
                Download / Upload Ratio
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="h-48 flex justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={userRatio} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} strokeWidth={0}>
                      {userRatio.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-4 mt-2">
                <div className="flex items-center gap-1.5 text-xs">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLORS.download }} />
                  <span className="text-muted-foreground">Download</span>
                  <span className="font-medium">{(userRatio[0].percent * 100).toFixed(0)}%</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLORS.upload }} />
                  <span className="text-muted-foreground">Upload</span>
                  <span className="font-medium">{(userRatio[1].percent * 100).toFixed(0)}%</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Session history table */}
          <Card className="lg:col-span-2 border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" />
                Session History
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs">Start Time</TableHead>
                      <TableHead className="text-xs">Duration</TableHead>
                      <TableHead className="text-xs text-right">Download</TableHead>
                      <TableHead className="text-xs text-right">Upload</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {userData.sessions.map((sess) => (
                      <TableRow key={sess.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          {new Date(sess.startTime).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </TableCell>
                        <TableCell className="text-xs tabular-nums">{sess.duration}</TableCell>
                        <TableCell className="text-xs font-mono text-right text-emerald-600">{formatBytes(sess.download)}</TableCell>
                        <TableCell className="text-xs font-mono text-right text-amber-600">{formatBytes(sess.upload)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={sess.status === "active" ? "default" : "secondary"}
                            className={`text-[10px] ${sess.status === "active" ? "bg-emerald-500/10 text-emerald-600 border-emerald-200" : ""}`}
                          >
                            {sess.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Data usage per session */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-blue-500" />
              Data Usage per Session
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={userData.sessions.map((s, i) => ({ name: `S${i + 1}`, download: s.download, upload: s.upload }))}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis dataKey="name" tick={{ fill: "#94A3B8", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#94A3B8", fontSize: 10 }} tickFormatter={(v) => formatBytes(v)} width={65} />
                  <Tooltip content={<BytesTooltip />} />
                  <Legend formatter={(v: string) => <span className="text-xs text-muted-foreground">{v}</span>} />
                  <Bar dataKey="download" name="Download" fill={COLORS.download} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="upload" name="Upload" fill={COLORS.upload} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════
  // RENDER: TOP CONSUMERS TAB
  // ═══════════════════════════════════════════════════════════
  const renderTopConsumers = () => {
    const csvData = topData.map((c) => ({
      Rank: c.rank, Username: c.username, IP: c.ip,
      Download: formatBytes(c.download), Upload: formatBytes(c.upload),
      Total: formatBytes(c.total), "Avg Speed": formatBps(c.avgSpeed),
    }));

    return (
      <div className="space-y-6">
        {/* Filters */}
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row md:items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                <Label className="text-xs text-muted-foreground mr-1">Period:</Label>
                {["24h", "7d", "30d"].map((p) => (
                  <Button key={p} variant={topPeriod === p ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => setTopPeriod(p)}>
                    {p}
                  </Button>
                ))}
              </div>
              <div className="hidden md:block w-px h-6 bg-border" />
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Limit:</Label>
                <Select value={topLimit} onValueChange={setTopLimit}>
                  <SelectTrigger className="h-8 w-[100px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["10", "20", "50", "100"].map((l) => <SelectItem key={l} value={l}>Top {l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="ml-auto">
                <CSVExportButton data={csvData} filename={`top-consumers-${topPeriod}.csv`} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bar chart */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-red-500" />
              Top {topLimit} Data Consumers — {topPeriod}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topData} layout="vertical" margin={{ left: 100 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis type="number" tick={{ fill: "#94A3B8", fontSize: 10 }} tickFormatter={(v) => formatBytes(v)} />
                  <YAxis type="category" dataKey="username" tick={{ fill: "#94A3B8", fontSize: 10 }} width={95} />
                  <Tooltip content={<ConsumerTooltip />} />
                  <Bar dataKey="total" name="Total Data" radius={[0, 6, 6, 0]}>
                    {topData.map((_, i) => (
                      <Cell key={i} fill={i < 3 ? COLORS.peak : i < 7 ? COLORS.upload : COLORS.avg} fillOpacity={1 - i * 0.04} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-500" />
              Consumer Details
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-xs w-12">Rank</TableHead>
                    <TableHead className="text-xs">Username</TableHead>
                    <TableHead className="text-xs font-mono">IP</TableHead>
                    <TableHead className="text-xs text-right">Download</TableHead>
                    <TableHead className="text-xs text-right">Upload</TableHead>
                    <TableHead className="text-xs text-right">Total</TableHead>
                    <TableHead className="text-xs text-right">Avg Speed</TableHead>
                    <TableHead className="text-xs w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topData.map((c) => (
                    <TableRow key={c.rank} className="hover:bg-muted/30 transition-colors cursor-pointer">
                      <TableCell className="text-xs">
                        <Badge variant={c.rank <= 3 ? "default" : "secondary"} className={`text-[10px] font-bold ${c.rank === 1 ? "bg-amber-500" : c.rank === 2 ? "bg-slate-400" : c.rank === 3 ? "bg-orange-600" : ""}`}>
                          #{c.rank}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs font-medium">{c.username}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{c.ip}</TableCell>
                      <TableCell className="text-xs font-mono text-right text-emerald-600">{formatBytes(c.download)}</TableCell>
                      <TableCell className="text-xs font-mono text-right text-amber-600">{formatBytes(c.upload)}</TableCell>
                      <TableCell className="text-xs font-mono text-right font-bold">{formatBytes(c.total)}</TableCell>
                      <TableCell className="text-xs font-mono text-right">{formatBps(c.avgSpeed)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="View details">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════
  // RENDER: CUSTOM REPORT TAB
  // ═══════════════════════════════════════════════════════════
  const renderCustom = () => {
    const sourceTypes = [
      { value: "gateway", label: "Gateway" },
      { value: "interface", label: "Interface" },
      { value: "subnet", label: "Subnet" },
      { value: "pool", label: "Pool" },
      { value: "user", label: "User" },
      { value: "plan", label: "Plan" },
    ];
    const chartTypes = [
      { value: "area", label: "Area Chart", icon: Activity },
      { value: "line", label: "Line Chart", icon: TrendingUp },
      { value: "bar", label: "Bar Chart", icon: BarChart3 },
      { value: "stacked", label: "Stacked Bar", icon: Layers },
    ] as const;

    const handleGenerate = () => {
      setCustomGenerated(false);
      setTimeout(() => setCustomGenerated(true), 0);
      toast.success("Generating report...");
    };

    const renderChart = () => {
      if (!customData.length) return (
        <div className="h-96 flex items-center justify-center text-muted-foreground text-sm border border-dashed rounded-xl">
          <div className="text-center">
            <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Configure parameters and click &quot;Generate Report&quot; to view data</p>
          </div>
        </div>
      );

      if (customChartType === "area") return (
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={customData}>
              <defs>
                <linearGradient id="cust-dl" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.download} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={COLORS.download} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="cust-ul" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={COLORS.upload} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={COLORS.upload} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis dataKey="time" tick={{ fill: "#94A3B8", fontSize: 10 }} />
              <YAxis tick={{ fill: "#94A3B8", fontSize: 10 }} tickFormatter={(v) => formatBps(v)} width={75} />
              <Tooltip content={<BWTooltip />} />
              <Legend formatter={(v: string) => <span className="text-xs text-muted-foreground">{v}</span>} />
              <Area type="monotone" dataKey="download" name="Download" stroke={COLORS.download} strokeWidth={2} fill="url(#cust-dl)" dot={false} />
              <Area type="monotone" dataKey="upload" name="Upload" stroke={COLORS.upload} strokeWidth={2} fill="url(#cust-ul)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      );

      if (customChartType === "line") return (
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={customData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis dataKey="time" tick={{ fill: "#94A3B8", fontSize: 10 }} />
              <YAxis tick={{ fill: "#94A3B8", fontSize: 10 }} tickFormatter={(v) => formatBps(v)} width={75} />
              <Tooltip content={<BWTooltip />} />
              <Legend formatter={(v: string) => <span className="text-xs text-muted-foreground">{v}</span>} />
              <Line type="monotone" dataKey="download" name="Download" stroke={COLORS.download} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="upload" name="Upload" stroke={COLORS.upload} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      );

      if (customChartType === "bar") return (
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={customData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis dataKey="time" tick={{ fill: "#94A3B8", fontSize: 10 }} />
              <YAxis tick={{ fill: "#94A3B8", fontSize: 10 }} tickFormatter={(v) => formatBps(v)} width={75} />
              <Tooltip content={<BWTooltip />} />
              <Legend formatter={(v: string) => <span className="text-xs text-muted-foreground">{v}</span>} />
              <Bar dataKey="download" name="Download" fill={COLORS.download} radius={[4, 4, 0, 0]} />
              <Bar dataKey="upload" name="Upload" fill={COLORS.upload} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      );

      // stacked bar
      return (
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={customData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis dataKey="time" tick={{ fill: "#94A3B8", fontSize: 10 }} />
              <YAxis tick={{ fill: "#94A3B8", fontSize: 10 }} tickFormatter={(v) => formatBps(v)} width={75} />
              <Tooltip content={<BWTooltip />} />
              <Legend formatter={(v: string) => <span className="text-xs text-muted-foreground">{v}</span>} />
              <Bar dataKey="download" name="Download" fill={COLORS.download} stackId="a" radius={[0, 0, 0, 0]} />
              <Bar dataKey="upload" name="Upload" fill={COLORS.upload} stackId="a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    };

    const csvData = customData.map((d) => ({
      Time: d.time, Download_bps: d.download, Upload_bps: d.upload,
      Download_Mbps: +(d.download / 1_000_000).toFixed(2),
      Upload_Mbps: +(d.upload / 1_000_000).toFixed(2),
    }));

    return (
      <div className="space-y-6">
        {/* Report configuration */}
        <Card className="border shadow-sm">
          <CardHeader className="bg-muted/30 rounded-t-xl">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Settings className="h-4 w-4 text-slate-500" />
              Report Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Source Type */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Source Type</Label>
                <Select value={customSource} onValueChange={setCustomSource}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {sourceTypes.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Source ID */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Source ID</Label>
                <Input
                  value={customSourceId}
                  onChange={(e) => setCustomSourceId(e.target.value)}
                  placeholder="e.g. gw-main, eth0, user-123"
                  className="h-9 text-sm"
                />
              </div>

              {/* Time Range */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Time Range</Label>
                <Select value={customRange} onValueChange={(v) => { setCustomRange(v); setCustomGenerated(false); }}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIME_RANGES.slice(3).map((r) => <SelectItem key={r.value} value={r.value}>Last {r.label}</SelectItem>)}
                    <SelectItem value="custom">Custom Range</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Custom date range */}
              {customRange === "custom" && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Start Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="h-9 w-full text-sm justify-start text-left font-normal gap-2">
                          <CalendarIcon className="h-3.5 w-3.5" />
                          {customStartDate ? customStartDate.toLocaleDateString() : "Pick start date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={customStartDate} onSelect={setCustomStartDate} />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">End Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="h-9 w-full text-sm justify-start text-left font-normal gap-2">
                          <CalendarIcon className="h-3.5 w-3.5" />
                          {customEndDate ? customEndDate.toLocaleDateString() : "Pick end date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={customEndDate} onSelect={setCustomEndDate} />
                      </PopoverContent>
                    </Popover>
                  </div>
                </>
              )}

              {/* Aggregate Interval */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Aggregate Interval</Label>
                <Select value={customInterval} onValueChange={setCustomInterval}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INTERVALS.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Chart Type */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Chart Type</Label>
                <div className="grid grid-cols-4 gap-1 p-1 bg-muted rounded-lg">
                  {chartTypes.map((ct) => {
                    const Icon = ct.icon;
                    return (
                      <button
                        key={ct.value}
                        type="button"
                        onClick={() => setCustomChartType(ct.value as "area" | "line" | "bar" | "stacked")}
                        className={`flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-medium transition-colors ${customChartType === ct.value ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        <Icon className="h-3 w-3" />
                        {ct.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Generate button */}
            <div className="mt-4 flex items-center gap-2">
              <Button className="h-9 text-sm gap-2" onClick={handleGenerate}>
                <BarChart3 className="h-4 w-4" />
                Generate Report
              </Button>
              {customGenerated && (
                <CSVExportButton data={csvData} filename={`custom-report-${customSource}-${customRange}.csv`} />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Full-size chart */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                {customGenerated ? `${customSource.toUpperCase()} — ${customSourceId}` : "Custom Report Preview"}
              </CardTitle>
              {customGenerated && (
                <Badge variant="outline" className="text-[10px]">
                  {customData.length} data points
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {renderChart()}
          </CardContent>
        </Card>

        {/* Summary statistics */}
        {customGenerated && customStats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={ArrowDown} label="Peak Download" value={formatBps(customStats.peakDown)} gradient="bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400" />
            <StatCard icon={Activity} label="Avg Download" value={formatBps(customStats.avgDown)} gradient="bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400" />
            <StatCard icon={ArrowUp} label="Peak Upload" value={formatBps(customStats.peakUp)} gradient="bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400" />
            <StatCard icon={Zap} label="Total Data" value={formatBytes(customStats.totalData)} gradient="bg-purple-100 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400" />
          </div>
        )}

        {/* Additional stats row */}
        {customGenerated && customStats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={Activity} label="Avg Upload" value={formatBps(customStats.avgUp)} gradient="bg-orange-100 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400" />
            <StatCard icon={Activity} label="Min Download" value={formatBps(customStats.minDown)} gradient="bg-slate-100 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400" />
            <StatCard icon={Activity} label="Min Upload" value={formatBps(customStats.minUp)} gradient="bg-slate-100 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400" />
            <StatCard icon={FileText} label="Data Points" value={String(customStats.dataPoints)} gradient="bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400" />
          </div>
        )}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════
  // MAIN RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <PageHeader
        title="Bandwidth Reports"
        description="Comprehensive bandwidth analytics and reporting for your ISP network."
        icon={BarChart3}
        badge={{ text: "Analytics", variant: "secondary" }}
        breadcrumbs={[
          { label: "Network" },
          { label: "Bandwidth Reports" },
        ]}
      />

      {/* Tab bar */}
      <div className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid p-1 bg-muted rounded-lg border shadow-sm gap-1">
        {TAB_ITEMS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveTab(tab.value)}
              className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${isActive ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-background/50"}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "overview" && renderOverview()}
      {activeTab === "gateway" && renderGateway()}
      {activeTab === "pool" && renderPool()}
      {activeTab === "user" && renderUser()}
      {activeTab === "top" && renderTopConsumers()}
      {activeTab === "custom" && renderCustom()}
    </div>
  );
}
