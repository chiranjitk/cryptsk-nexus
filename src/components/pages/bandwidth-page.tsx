"use client";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/utils";
import {
  Activity, AlertTriangle, ArrowDown, Wifi, TrendingUp,
  Download, Filter, Settings2, CalendarDays, ChevronLeft, ChevronRight,
  RefreshCw, Layers, Monitor, GitCompareArrows, Eye, Gauge,
  Zap, Bell, Radio, Clock, Trash2, Plus,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import dynamic from "next/dynamic";

// Tab sub-components (separated to avoid enabled-flag re-render loops in React 19)
const ThrottlingTab = dynamic(() => import("./tabs/throttling-tab"), { ssr: false });
const QosTab = dynamic(() => import("./tabs/qos-tab"), { ssr: false });
const ThresholdsTab = dynamic(() => import("./tabs/thresholds-tab"), { ssr: false });

// ─── Types ────────────────────────────────────────────────────────
interface BandwidthDevice {
  deviceId: string;
  deviceName: string;
  ipAddress: string;
  type: string;
  avgDownload: number;
  avgUpload: number;
  peakDownload: number;
  peakUpload: number;
  currentLoad: number;
  logCount: number;
}

interface TopConsumer {
  id: string;
  name: string;
  code: string;
  currentCycleDataUsed: number;
  currentSpeedDown: number;
  currentSpeedUp: number;
  plan: { name: string; dataLimitGb: number | null } | null;
}

interface AlertItem {
  deviceName: string;
  type: string;
  value: number;
  threshold: number;
}

interface BandwidthData {
  devices: BandwidthDevice[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  aggregate: string;
  topConsumers: TopConsumer[];
  timeSeriesData: { time: string; download: number; upload: number }[];
  summary: {
    totalDevices: number;
    totalCurrentBps: number;
    totalPeakBps: number;
    totalDataUsedGb: number;
  };
  alerts: AlertItem[];
  thresholds: {
    downloadMbps: number;
    uploadMbps: number;
  };
}

interface DeviceOption {
  id: string;
  name: string;
  ipAddress: string;
  type: string;
}

interface InterfaceData {
  id: string;
  name: string;
  description: string;
  type: string;
  status: string;
  speed: number;
  txBytes: number;
  rxBytes: number;
  avgDownload: number;
  avgUpload: number;
  peakDownload: number;
  peakUpload: number;
  logCount: number;
  timeSeries: { time: string; download: number; upload: number }[];
}

interface ThrottleConfig {
  id: string;
  deviceId: string;
  maxDownloadMbps: number;
  maxUploadMbps: number;
  scheduleEnabled: boolean;
  scheduleStartTime: string;
  scheduleEndTime: string;
  scheduleDays: string;
  enabled: boolean;
  device: { id: string; name: string; ipAddress: string; type: string } | null;
}

interface QosConfigItem {
  id: string;
  name: string;
  priority: string;
  targetPlanId: string | null;
  targetIpRange: string;
  maxBandwidthMbps: number;
  minBandwidthMbps: number;
  enabled: boolean;
  targetPlan: { id: string; name: string } | null;
}

interface AlertRuleItem {
  id: string;
  name: string;
  condition: string;
  threshold: number;
  severity: string;
  notifyChannels: string;
  enabled: boolean;
}

// ─── Presets ──────────────────────────────────────────────────────
type DatePreset = "24h" | "7d" | "30d" | "this-month" | "last-month" | "custom";

// ─── Form state types moved to tab components ─────────────────


function getPresetRange(preset: DatePreset): { startDateMs: number; endDateMs: number } {
  const now = Date.now();
  const endDateMs = now;
  switch (preset) {
    case "24h":
      return { startDateMs: now - 24 * 60 * 60 * 1000, endDateMs };
    case "7d":
      return { startDateMs: now - 7 * 24 * 60 * 60 * 1000, endDateMs };
    case "30d":
      return { startDateMs: now - 30 * 24 * 60 * 60 * 1000, endDateMs };
    case "this-month": {
      const d = new Date();
      const first = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      return { startDateMs: first, endDateMs };
    }
    case "last-month": {
      const d = new Date();
      const first = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
      const last = new Date(d.getFullYear(), d.getMonth(), 0, 23, 59, 59).getTime();
      return { startDateMs: first, endDateMs: last };
    }
    default:
      return { startDateMs: now - 24 * 60 * 60 * 1000, endDateMs };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────
function formatBps(bps: number): string {
  if (bps >= 1_000_000_000) return `${(bps / 1_000_000_000).toFixed(1)} Gbps`;
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} Kbps`;
  return `${bps} bps`;
}

function formatBytes(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(0)} MB`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const PROTOCOL_COLORS = ["#16A34A", "#2563EB", "#F59E0B", "#EF4444", "#8B5CF6", "#6B7280"];

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; color: string; dataKey?: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg shadow-xl px-3 py-2 text-xs">
      <p className="font-medium text-foreground mb-1">{label}</p>
      {payload.map((item, i) => (
        <p key={i} className="text-muted-foreground">
          <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: item.color }} />
          {item.name}: {formatBps(item.value)}
        </p>
      ))}
    </div>
  );
}

function PieTooltip({ active, payload }: { active?: boolean; payload?: { name: string; value: number; payload: { percent: number } }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-card border border-border rounded-lg shadow-xl px-3 py-2 text-xs">
      <p className="font-medium text-foreground">{d.name}</p>
      <p className="text-muted-foreground">{(d.payload.percent * 100).toFixed(1)}%</p>
    </div>
  );
}

// ─── Tab definitions ──────────────────────────────────────────────
const TAB_ITEMS = [
  { value: "overview", label: "Overview", icon: Activity },
  { value: "throttling", label: "Throttling", icon: Gauge },
  { value: "qos", label: "QoS", icon: Zap },
  { value: "thresholds", label: "Alerts", icon: Bell },
] as const;

type TabValue = (typeof TAB_ITEMS)[number]["value"];

// ─── Component ────────────────────────────────────────────────────
export default function BandwidthPage() {
  const queryClient = useQueryClient();

  // ─── Core UI state ──────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabValue>("overview");
  const [datePreset, setDatePreset] = useState<DatePreset>("24h");
  const [customStart, setCustomStart] = useState<Date | undefined>(undefined);
  const [customEnd, setCustomEnd] = useState<Date | undefined>(undefined);
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);
  const [deviceId, setDeviceId] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [aggregate, setAggregate] = useState<"per-device" | "total">("per-device");
  const [liveMode, setLiveMode] = useState(false);

  // ─── Threshold settings dialog state ────────────────────────────
  const [thresholdOpen, setThresholdOpen] = useState(false);
  const [dlThreshold, setDlThreshold] = useState("800");
  const [ulThreshold, setUlThreshold] = useState("400");

  // ─── Compare dialog state (consolidated) ────────────────────────
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareMode, setCompareMode] = useState<"periods" | "devices">("periods");
  const [compareDevice1, setCompareDevice1] = useState("");
  const [compareDevice2, setCompareDevice2] = useState("");

  // ─── Interface drill-down dialog state (consolidated) ───────────
  const [interfaceOpen, setInterfaceOpen] = useState(false);
  const [interfaceDeviceId, setInterfaceDeviceId] = useState("");
  const [interfaceDeviceName, setInterfaceDeviceName] = useState("");



  // ─── Tab dialog states moved to sub-components ──────────────────


  // ─── Reference data queries ─────────────────────────────────────
  const { data: devicesData } = useQuery<{ items: DeviceOption[] }>({
    queryKey: ["devices-filter"],
    queryFn: () => apiFetch<{ items: DeviceOption[] }>("/api/devices?limit=100"),
    staleTime: 60_000,
  });
  const deviceOptions = devicesData?.items || [];

  const { data: plansData } = useQuery<{ items: { id: string; name: string }[] }>({
    queryKey: ["plans-filter"],
    queryFn: () => apiFetch<{ items: { id: string; name: string }[] }>("/api/plans?limit=100&status=ACTIVE"),
    staleTime: 60_000,
  });
  const planOptions = plansData?.items || [];

  // ─── Derived: date range (timestamps for stable referential equality) ─
  const { startDateMs, endDateMs } = useMemo(() => {
    if (datePreset === "custom" && customStart && customEnd) {
      return { startDateMs: customStart.getTime(), endDateMs: customEnd.getTime() };
    }
    return getPresetRange(datePreset);
  }, [datePreset, customStart, customEnd]);
  const startDate = new Date(startDateMs);
  const endDate = new Date(endDateMs);
  const startDateIso = startDate.toISOString();
  const endDateIso = endDate.toISOString();

  // ─── Derived: query URL ─────────────────────────────────────────
  const queryUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("startDate", new Date(startDateMs).toISOString());
    params.set("endDate", new Date(endDateMs).toISOString());
    if (deviceId && deviceId !== "all") params.set("deviceId", deviceId);
    params.set("page", String(page));
    params.set("limit", String(pageSize));
    params.set("aggregate", aggregate);
    return `/api/bandwidth?${params.toString()}`;
  }, [startDateMs, endDateMs, deviceId, page, pageSize, aggregate]);



  // ─── Main bandwidth query ───────────────────────────────────────
  const { data, isLoading, isFetching, refetch } = useQuery<BandwidthData>({
  queryKey: ["bandwidth", queryUrl],
  queryFn: () => apiFetch<BandwidthData>(queryUrl),
  refetchInterval: liveMode ? 5000 : false,
  enabled: !!queryUrl,
});

  // Memoize default thresholds to prevent new object on every render
  const defaultThresholds = useMemo(() => ({ downloadMbps: 800, uploadMbps: 400 }), []);
  const thresholds = data?.thresholds || defaultThresholds;

  // ─── Interface data query ───────────────────────────────────────
  const { data: interfaceData, isLoading: interfaceLoading } = useQuery<{ interfaces: InterfaceData[] }>({
    queryKey: ["bandwidth-interfaces", interfaceDeviceId, startDateIso, endDateIso],
    queryFn: () => apiFetch<{ interfaces: InterfaceData[] }>(`/api/bandwidth/interfaces?deviceId=${interfaceDeviceId}&startDate=${startDateIso}&endDate=${endDateIso}`),
    enabled: interfaceOpen && !!interfaceDeviceId,
  });

  // Tab-specific queries moved to sub-components


  // ─── Compare query URL (computed on demand when compareOpen is true) ──
  const getCompareUrl = () => {
    const params = new URLSearchParams();
    params.set("compareMode", compareMode);
    if (compareMode === "periods") {
      const now = new Date();
      const start1 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      params.set("startDate1", start1.toISOString());
      params.set("endDate1", now.toISOString());
      const start2 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      const end2 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      params.set("startDate2", start2.toISOString());
      params.set("endDate2", end2.toISOString());
      if (deviceId && deviceId !== "all") params.set("deviceId", deviceId);
    } else {
      params.set("deviceId1", compareDevice1);
      params.set("deviceId2", compareDevice2);
      params.set("startDate", startDateIso);
      params.set("endDate", endDateIso);
    }
    return `/api/bandwidth/compare?${params.toString()}`;
  };

  const { data: compareData, isLoading: compareLoading } = useQuery<Record<string, unknown>>({
    queryKey: ["bandwidth-compare", compareMode, compareDevice1, compareDevice2, deviceId],
    queryFn: () => apiFetch<Record<string, unknown>>(getCompareUrl()),
    enabled: compareOpen,
    staleTime: 30_000,
  });

  // ─── Derived: protocol breakdown ────────────────────────────────
  // TODO: These protocol percentages are hardcoded estimates. They should be
  // derived from actual DPI (Deep Packet Inspection) or NetFlow data from the API.
  // The API response currently does not include per-protocol breakdowns.
  const protocolData = data?.summary ? (() => {
    const total = data.summary.totalCurrentBps || 1;
    return [
      { name: "HTTPS", value: Math.round(total * 0.52), percent: 0.52 },
      { name: "HTTP", value: Math.round(total * 0.18), percent: 0.18 },
      { name: "DNS", value: Math.round(total * 0.05), percent: 0.05 },
      { name: "VPN", value: Math.round(total * 0.08), percent: 0.08 },
      { name: "FTP", value: Math.round(total * 0.07), percent: 0.07 },
      { name: "Other", value: Math.round(total * 0.10), percent: 0.10 },
    ];
  })() : [];

  // ─── Derived: pagination ────────────────────────────────────────
  const totalPages = data?.totalPages || 1;
  const totalDevices = data?.total || 0;
  const startItem = totalDevices === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalDevices);

  const pageNumbers = (() => {
    const pages: number[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push(-1);
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (page < totalPages - 2) pages.push(-2);
      pages.push(totalPages);
    }
    return pages;
  })();

  const dateRangeLabel = datePreset === "custom" && customStart && customEnd
    ? `${formatDate(customStart)} – ${formatDate(customEnd)}`
    : `${formatDate(startDate)} – ${formatDate(endDate)}`;

  function isOverThreshold(bps: number, type: "download" | "upload") {
    const thresh = type === "download" ? thresholds.downloadMbps * 1_000_000 : thresholds.uploadMbps * 1_000_000;
    return bps > thresh;
  }

  // ─── Mutations ──────────────────────────────────────────────────
  const saveThresholdMutation = useMutation({
    mutationFn: async (vals: { downloadMbps: number; uploadMbps: number }) => {
      return apiFetch("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ bandwidthThresholds: JSON.stringify(vals) }),
      });
    },
    onSuccess: () => {
      toast.success("Threshold settings saved");
      setThresholdOpen(false);
      // Use exact match to avoid invalidating bandwidth-thresholds query
      queryClient.invalidateQueries({ queryKey: ["bandwidth", queryUrl] });
    },
    onError: () => toast.error("Failed to save threshold settings"),
  });

  // Throttle mutations moved to ThrottlingTab
  // QoS mutations moved to QosTab
  // Alert rule mutations moved to ThresholdsTab


  // ─── Handlers ───────────────────────────────────────────────────
  function handlePresetChange(preset: DatePreset) {
    setDatePreset(preset);
    setPage(1);
    if (preset !== "custom") {
      setCustomStart(undefined);
      setCustomEnd(undefined);
    }
  }

  function handleCustomStartSelect(d: Date | undefined) {
    setCustomStart(d);
    setStartDateOpen(false);
    if (d) setPage(1);
  }

  function handleCustomEndSelect(d: Date | undefined) {
    setCustomEnd(d);
    setEndDateOpen(false);
    if (d) setPage(1);
  }

  function handleDeviceChange(val: string) {
    setDeviceId(val);
    setPage(1);
  }

  function handlePageSizeChange(val: string) {
    setPageSize(Number(val));
    setPage(1);
  }

  function handleAggregateToggle() {
    setAggregate((prev) => (prev === "per-device" ? "total" : "per-device"));
    setPage(1);
  }

  function handleExport() {
    const params = new URLSearchParams();
    params.set("startDate", startDate.toISOString());
    params.set("endDate", endDate.toISOString());
    if (deviceId && deviceId !== "all") params.set("deviceId", deviceId);
    params.set("aggregate", aggregate);
    const url = `/api/bandwidth/export?${params.toString()}`;
    const link = document.createElement("a");
    link.href = url;
    link.download = `bandwidth-export-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Exporting bandwidth data as CSV");
  }

  function handleSaveThreshold() {
    const dl = Number(dlThreshold);
    const ul = Number(ulThreshold);
    if (isNaN(dl) || isNaN(ul) || dl <= 0 || ul <= 0) {
      toast.error("Please enter valid threshold values");
      return;
    }
    saveThresholdMutation.mutate({ downloadMbps: dl, uploadMbps: ul });
  }

  function handleOpenInterfaceDrilldown(dev: BandwidthDevice) {
    setInterfaceDeviceId(dev.deviceId);
    setInterfaceDeviceName(dev.deviceName);
    setInterfaceOpen(true);
  }

  // Throttle handlers moved to ThrottlingTab
  // QoS handlers moved to QosTab
  // Threshold handlers moved to ThresholdsTab

  // ─── Loading ────────────────────────────────────────────────────
  if (isLoading && activeTab === "overview") {
    return (
      <div className="space-y-6">
        <Skeleton className="skeleton-wave h-7 w-40" />
        <Skeleton className="skeleton-wave h-12 rounded-lg" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        <Skeleton className="skeleton-wave h-80 rounded-lg" />
        <Skeleton className="skeleton-wave h-80 rounded-lg" />
      </div>
    );
  }

  // For non-overview tabs, never early-return — let the tab content handle its own loading
  // This prevents infinite re-render loops caused by mount/unmount cycling of useQuery hooks

  // ─── Render ─────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Bandwidth Monitor</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Real-time bandwidth usage across all network devices.</p>
        </div>
        <div className="flex items-center gap-2">
          {liveMode ? (
            <>
              <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" /></span>
              <span className="text-xs font-semibold text-red-600">LIVE</span>
            </>
          ) : (
            <>
              <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" /></span>
              <span className="text-xs font-medium text-green-600">Refreshing every 30s</span>
            </>
          )}
        </div>
      </div>

      {/* ─── Simple Tab Bar (no Radix Tabs) ───────────────────────── */}
      <div className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid p-1 bg-muted rounded-lg border shadow-sm gap-1">
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

      {/* ═══════════════ OVERVIEW TAB ═══════════════ */}
      {activeTab === "overview" && data && (
        <div className="space-y-6">
          {/* ─── Toolbar: Date Range, Device Filter, Actions ─── */}
          <Card className="border shadow-sm">
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row md:items-center gap-3 flex-wrap">
                {/* Date Range Presets */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                  {(["24h", "7d", "30d", "this-month", "last-month"] as const).map((p) => (
                    <Button key={p} variant={datePreset === p ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => handlePresetChange(p)}>
                      {p === "24h" ? "Last 24h" : p === "7d" ? "Last 7d" : p === "30d" ? "Last 30d" : p === "this-month" ? "This Month" : "Last Month"}
                    </Button>
                  ))}
                  <Button variant={datePreset === "custom" ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => handlePresetChange("custom")}>
                    Custom
                  </Button>
                </div>

                {/* Custom Date Pickers */}
                {datePreset === "custom" && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {customStart ? formatDate(customStart) : "Start Date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={customStart} onSelect={handleCustomStartSelect} />
                      </PopoverContent>
                    </Popover>
                    <span className="text-xs text-muted-foreground">to</span>
                    <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {customEnd ? formatDate(customEnd) : "End Date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={customEnd} onSelect={handleCustomEndSelect} />
                      </PopoverContent>
                    </Popover>
                  </div>
                )}

                <div className="hidden md:block w-px h-6 bg-border" />

                {/* Device Filter */}
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Select value={deviceId} onValueChange={handleDeviceChange}>
                    <SelectTrigger className="h-8 w-[180px] text-xs">
                      <SelectValue placeholder="All Devices" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Devices</SelectItem>
                      {deviceOptions.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          <span className="truncate">{d.name}</span>
                          <span className="text-muted-foreground ml-1.5 font-mono text-[10px]">{d.ipAddress}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="hidden md:block w-px h-6 bg-border" />

                {/* Action Buttons */}
                <div className="flex items-center gap-2 ml-auto flex-wrap">
                  <Button variant={liveMode ? "destructive" : "outline"} size="sm" className="h-8 text-xs gap-1.5" onClick={() => setLiveMode((p) => !p)}>
                    <Radio className="h-3.5 w-3.5" />
                    {liveMode ? "Live (5s)" : "Live Mode"}
                  </Button>

                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => setCompareOpen(true)}>
                    <GitCompareArrows className="h-3.5 w-3.5" />
                    Compare
                  </Button>

                  <Button variant={aggregate === "total" ? "default" : "outline"} size="sm" className="h-8 text-xs gap-1.5" onClick={handleAggregateToggle}>
                    <Layers className="h-3.5 w-3.5" />
                    {aggregate === "total" ? "Total" : "Per-Device"}
                  </Button>

                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => { setDlThreshold(String(thresholds.downloadMbps)); setUlThreshold(String(thresholds.uploadMbps)); setThresholdOpen(true); }}>
                    <Settings2 className="h-3.5 w-3.5" />
                    Thresholds
                  </Button>

                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={handleExport}>
                    <Download className="h-3.5 w-3.5" />
                    Export CSV
                  </Button>

                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => refetch()} disabled={isFetching}>
                    <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <span>Range: <span className="text-foreground font-medium">{dateRangeLabel}</span></span>
                {deviceId !== "all" && (
                  <span>• Device: <span className="text-foreground font-medium">{deviceOptions.find((d) => d.id === deviceId)?.name || deviceId}</span></span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-50 dark:bg-green-950/30"><Activity className="h-4 w-4 text-green-600" /></div>
                  <div>
                    <p className="text-2xl font-bold tabular-nums">{data.summary.totalDevices}</p>
                    <p className="text-xs text-muted-foreground">Active Devices</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-50 dark:bg-green-950/30"><ArrowDown className="h-4 w-4 text-green-600" /></div>
                  <div>
                    <p className="text-lg font-bold tabular-nums">{formatBps(data.summary.totalCurrentBps)}</p>
                    <p className="text-xs text-muted-foreground">Total Current Load</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-950/30"><TrendingUp className="h-4 w-4 text-purple-600" /></div>
                  <div>
                    <p className="text-lg font-bold tabular-nums">{formatBps(data.summary.totalPeakBps)}</p>
                    <p className="text-xs text-muted-foreground">Peak Usage</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-orange-50 dark:bg-orange-950/30"><Wifi className="h-4 w-4 text-orange-600" /></div>
                  <div>
                    <p className="text-lg font-bold tabular-nums">{data.summary.totalDataUsedGb} GB</p>
                    <p className="text-xs text-muted-foreground">Total Data Used</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Threshold Alerts */}
          {data.alerts.length > 0 && (
            <Card className="border-2 border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/10 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-red-700 dark:text-red-400">
                  <AlertTriangle className="h-4 w-4" />Bandwidth Threshold Alerts
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {data.alerts.map((alert, i) => (
                    <div key={i} className="flex items-center justify-between text-xs bg-white/60 dark:bg-background/60 rounded-lg border px-3 py-2">
                      <span className="font-medium">{alert.deviceName}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">{alert.type}</span>
                        <Badge variant="destructive" className="text-[10px]">{formatBps(alert.value)}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Time Series Chart */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-red-500" />Network Bandwidth
                {datePreset !== "24h" && <span className="text-xs font-normal text-muted-foreground">({dateRangeLabel})</span>}
                {datePreset === "24h" && <span className="text-xs font-normal text-muted-foreground">(Last 24 Hours)</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {data.timeSeriesData.length > 0 ? (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.timeSeriesData}>
                      <defs>
                        <linearGradient id="dlGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#16A34A" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#16A34A" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="ulGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563EB" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                      <XAxis dataKey="time" tick={{ fill: "#94A3B8", fontSize: 11 }} />
                      <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} tickFormatter={(v) => formatBps(v)} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend formatter={(value: string) => <span className="text-xs text-muted-foreground">{value}</span>} />
                      <Area type="monotone" dataKey="download" name="Download" stroke="#16A34A" strokeWidth={2} fill="url(#dlGrad)" dot={false} />
                      <Area type="monotone" dataKey="upload" name="Upload" stroke="#2563EB" strokeWidth={2} fill="url(#ulGrad)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-72 flex items-center justify-center text-muted-foreground text-sm">No bandwidth data available for the selected period.</div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Per-Device Bandwidth Table */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Monitor className="h-4 w-4 text-teal-500" />
                  {aggregate === "total" ? "Total Bandwidth" : "Device Bandwidth"}
                  <Badge variant="outline" className="text-[10px] ml-auto">
                    {totalDevices} device{totalDevices !== 1 ? "s" : ""}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">{aggregate === "total" ? "Scope" : "Device"}</TableHead>
                        <TableHead className="text-xs">Avg ↓</TableHead>
                        <TableHead className="text-xs">Avg ↑</TableHead>
                        <TableHead className="text-xs">Peak ↓</TableHead>
                        <TableHead className="text-xs">Current</TableHead>
                        {aggregate !== "total" && <TableHead className="text-xs w-8"></TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.devices.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">No data available</TableCell></TableRow>
                      ) : (
                        data.devices.map((d) => (
                          <TableRow key={d.deviceId} className="cursor-pointer hover:bg-muted/50 transition-colors duration-150" onClick={() => handleOpenInterfaceDrilldown(d)}>
                            <TableCell>
                              <div className="text-xs font-medium">{d.deviceName}</div>
                              <div className="text-[10px] text-muted-foreground font-mono">{d.ipAddress}</div>
                            </TableCell>
                            <TableCell className={`text-xs font-mono tabular-nums ${isOverThreshold(d.avgDownload, "download") ? "text-red-600 font-semibold" : "text-green-600"}`}>
                              {formatBps(d.avgDownload)}
                              {isOverThreshold(d.avgDownload, "download") && <AlertTriangle className="inline h-3 w-3 ml-1" />}
                            </TableCell>
                            <TableCell className={`text-xs font-mono tabular-nums ${isOverThreshold(d.avgUpload, "upload") ? "text-red-600 font-semibold" : "text-teal-600"}`}>
                              {formatBps(d.avgUpload)}
                              {isOverThreshold(d.avgUpload, "upload") && <AlertTriangle className="inline h-3 w-3 ml-1" />}
                            </TableCell>
                            <TableCell className={`text-xs font-mono tabular-nums ${isOverThreshold(d.peakDownload, "download") ? "text-red-600 font-semibold" : ""}`}>
                              {formatBps(d.peakDownload)}
                            </TableCell>
                            <TableCell className={`text-xs font-mono tabular-nums font-medium ${isOverThreshold(d.currentLoad, "download") ? "text-red-600" : ""}`}>
                              {formatBps(d.currentLoad)}
                            </TableCell>
                            {aggregate !== "total" && (
                              <TableCell>
                                <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                              </TableCell>
                            )}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {aggregate === "per-device" && totalPages > 1 && (
                  <div className="mt-3 flex flex-col sm:flex-row items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      Showing {startItem}–{endItem} of {totalDevices}
                    </span>
                    <div className="flex items-center gap-1">
                      <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
                        <SelectTrigger className="h-7 w-[65px] text-[10px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="20">20</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                          <SelectItem value="100">100</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-0.5">
                        <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </Button>
                        {pageNumbers.map((p, idx) =>
                          p < 0 ? (
                            <span key={`e${idx}`} className="px-1 text-xs text-muted-foreground">…</span>
                          ) : (
                            <Button key={p} variant={page === p ? "default" : "outline"} size="sm" className="h-7 w-7 p-0 text-xs" onClick={() => setPage(p)}>
                              {p}
                            </Button>
                          )
                        )}
                        <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-6">
              {/* Protocol Breakdown */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Radio className="h-4 w-4 text-violet-500" />Protocol Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={protocolData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" nameKey="name" strokeWidth={2} stroke="white">
                          {protocolData.map((_, index) => (
                            <Cell key={index} fill={PROTOCOL_COLORS[index % PROTOCOL_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<PieTooltip />} />
                        <Legend formatter={(value: string) => <span className="text-xs text-muted-foreground">{value}</span>} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Top Consumers */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-orange-500" />Top Data Consumers
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="overflow-x-auto max-h-96 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">#</TableHead>
                          <TableHead className="text-xs">Subscriber</TableHead>
                          <TableHead className="text-xs">Data Used</TableHead>
                          <TableHead className="text-xs">Plan Limit</TableHead>
                          <TableHead className="text-xs">Usage</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.topConsumers.length === 0 ? (
                          <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">No usage data available</TableCell></TableRow>
                        ) : (
                          data.topConsumers.map((c, idx) => {
                            const limit = c.plan?.dataLimitGb || 0;
                            const usedGb = c.currentCycleDataUsed / 1024;
                            const pct = limit > 0 ? Math.min((usedGb / limit) * 100, 100) : 0;
                            return (
                              <TableRow key={c.id} className="hover:bg-muted/50 transition-colors duration-150">
                                <TableCell className="text-xs font-bold text-muted-foreground">{idx + 1}</TableCell>
                                <TableCell>
                                  <div className="text-xs font-medium">{c.name}</div>
                                  <div className="text-[10px] text-muted-foreground font-mono">{c.code}</div>
                                </TableCell>
                                <TableCell className="text-xs font-mono tabular-nums font-medium">{formatBytes(c.currentCycleDataUsed)}</TableCell>
                                <TableCell className="text-xs">{limit > 0 ? `${limit} GB` : <span className="text-muted-foreground">Unlimited</span>}</TableCell>
                                <TableCell className="w-24">
                                  {limit > 0 ? (
                                    <div className="flex items-center gap-1.5">
                                      <Progress value={pct} className="h-1.5 flex-1" />
                                      <span className="text-[10px] tabular-nums text-muted-foreground">{Math.round(pct)}%</span>
                                    </div>
                                  ) : <span className="text-[10px] text-muted-foreground">—</span>}
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ THROTTLING TAB ═══════════════ */}
      {activeTab === "throttling" && <ThrottlingTab deviceOptions={deviceOptions} />}

      {/* ═══════════════ QoS TAB ═══════════════ */}
      {activeTab === "qos" && <QosTab planOptions={planOptions} />}

      {/* ═══════════════ ALERTS/THRESHOLDS TAB ═══════════════ */}
      {activeTab === "thresholds" && <ThresholdsTab />}

      {/* ═══════════════ DIALOGS (TEMPORARILY DISABLED FOR TESTING) ═══════════════ */}

    </div>
  );
}
