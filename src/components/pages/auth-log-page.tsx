"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import {
  Shield,
  ShieldCheck,
  ShieldX,
  Search,
  Filter,
  RefreshCw,
  Users,
  Activity,
  Clock,
  Wifi,
  ChevronLeft,
  ChevronRight,
  Download,
  Calendar,
  X,
  Loader2,
  Globe,
  Radio,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
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

// ─── Types ────────────────────────────────────────────────────────

interface AuthLogEntry {
  id: string;
  username: string;
  reply: string;
  authType: string;
  nasIp: string;
  clientIp: string | null;
  callingStationId: string | null;
  calledStationId: string | null;
  timestamp: string;
}

interface AuthLogStats {
  totalToday: number;
  acceptCount: number;
  rejectCount: number;
  activeSessions: number;
}

interface AuthLogResponse {
  entries: AuthLogEntry[];
  stats: AuthLogStats;
  totalPages: number;
  total: number;
}

// ─── Constants ────────────────────────────────────────────────────

const PAGE_SIZE = 50;

const DATE_PRESETS = [
  { label: "Today", value: "today" },
  { label: "Last 7 Days", value: "7d" },
  { label: "Last 30 Days", value: "30d" },
  { label: "Custom", value: "custom" },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getDateRange(preset: string): { from: string; to: string } {
  const today = new Date();
  const to = today.toISOString().split("T")[0];

  switch (preset) {
    case "today":
      return { from: to, to };
    case "7d": {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      return { from: d.toISOString().split("T")[0], to };
    }
    case "30d": {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      return { from: d.toISOString().split("T")[0], to };
    }
    default:
      return { from: "", to };
  }
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-IN").format(n);
}

// ─── Auth Result Badge ───────────────────────────────────────────

function AuthResultBadge({ reply }: { reply: string }) {
  if (reply === "Access-Accept") {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[10px] flex items-center gap-1 w-fit">
        <ShieldCheck className="h-3 w-3" />
        Accept
      </Badge>
    );
  }
  if (reply === "Access-Reject") {
    return (
      <Badge className="bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300 border border-red-200 dark:border-red-800 text-[10px] flex items-center gap-1 w-fit">
        <ShieldX className="h-3 w-3" />
        Reject
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-[10px]">
      {reply || "Unknown"}
    </Badge>
  );
}

// ─── Stats Card ───────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  gradient,
  loading,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  loading: boolean;
}) {
  return (
    <Card className="border-0 shadow-md overflow-hidden hover:shadow-lg transition-all duration-200 hover:scale-[1.02]">
      <div className={`bg-gradient-to-br ${gradient} p-4 sm:p-5 rounded-xl`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white/80 text-xs font-medium">{label}</p>
            <p className="text-white text-xl sm:text-2xl font-bold mt-1">
              {loading ? (
                <span className="inline-block w-12 h-7 bg-white/20 rounded animate-pulse" />
              ) : (
                formatNumber(value)
              )}
            </p>
          </div>
          <Icon className="h-7 w-7 sm:h-8 sm:w-8 text-white/30" />
        </div>
      </div>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────

export default function AuthLogPage() {
  // ─── Filter State ─────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [resultFilter, setResultFilter] = useState("all");
  const [nasIp, setNasIp] = useState("");
  const [datePreset, setDatePreset] = useState("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // ─── Data State ───────────────────────────────────────────
  const [entries, setEntries] = useState<AuthLogEntry[]>([]);
  const [stats, setStats] = useState<AuthLogStats>({
    totalToday: 0,
    acceptCount: 0,
    rejectCount: 0,
    activeSessions: 0,
  });
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [exporting, setExporting] = useState(false);

  // ─── Compute date range from preset ───────────────────────
  const { from: dateFrom, to: dateTo } = (() => {
    if (datePreset === "custom") {
      return { from: customFrom, to: customTo };
    }
    return getDateRange(datePreset);
  })();

  // ─── Fetch Data ───────────────────────────────────────────
  const fetchData = useCallback(
    async (pageNum: number, showLoading: boolean) => {
      if (showLoading) setLoading(true);
      else setFetching(true);

      try {
        const params = new URLSearchParams();
        if (search) params.set("search", search);
        if (resultFilter !== "all") params.set("result", resultFilter);
        if (dateFrom) params.set("dateFrom", dateFrom);
        if (dateTo) params.set("dateTo", dateTo);
        if (nasIp) params.set("nasIp", nasIp);
        params.set("page", String(pageNum));
        params.set("limit", String(PAGE_SIZE));

        const data = await apiFetch<AuthLogResponse>(
          `/api/aaa/auth-log?${params.toString()}`
        );

        setEntries(data.entries || []);
        setStats(data.stats || {
          totalToday: 0,
          acceptCount: 0,
          rejectCount: 0,
          activeSessions: 0,
        });
        setTotalPages(data.totalPages || 1);
        setTotal(data.total || 0);
      } catch {
        toast.error("Failed to load auth log");
      } finally {
        setLoading(false);
        setFetching(false);
      }
    },
    [search, resultFilter, dateFrom, dateTo, nasIp]
  );

  useEffect(() => {
    fetchData(1, true);
  }, [fetchData]);

  // ─── Handlers ─────────────────────────────────────────────
  function handlePageChange(newPage: number) {
    setPage(newPage);
    fetchData(newPage, false);
  }

  function handleRefresh() {
    fetchData(page, false);
  }

  function handlePresetChange(preset: string) {
    setDatePreset(preset);
    if (preset !== "custom") {
      setCustomFrom("");
      setCustomTo("");
    }
  }

  function handleApplyCustomDate() {
    if (!customFrom && !customTo) {
      toast.error("Please select at least a start or end date");
      return;
    }
    // The dateFrom/dateTo derived values will update, triggering fetchData
  }

  // ─── Export CSV ───────────────────────────────────────────
  async function handleExport() {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (resultFilter !== "all") params.set("result", resultFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (nasIp) params.set("nasIp", nasIp);
      params.set("limit", "10000");

      const res = await fetch(`/api/aaa/auth-log/export?${params.toString()}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `auth-log-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Auth log exported as CSV");
    } catch {
      toast.error("Failed to export auth log");
    } finally {
      setExporting(false);
    }
  }

  // ─── Active Filters ───────────────────────────────────────
  const hasActiveFilters =
    search !== "" ||
    resultFilter !== "all" ||
    datePreset !== "today" ||
    nasIp !== "" ||
    (datePreset === "custom" && (customFrom || customTo));

  function clearAllFilters() {
    setSearch("");
    setResultFilter("all");
    setNasIp("");
    setDatePreset("today");
    setCustomFrom("");
    setCustomTo("");
    setPage(1);
  }

  // ─── Loading State ────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* Header skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="skeleton-wave h-7 w-36" />
            <Skeleton className="skeleton-wave h-4 w-80 max-w-full" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="skeleton-wave h-9 w-24" />
            <Skeleton className="skeleton-wave h-9 w-28" />
          </div>
        </div>

        {/* Stats cards skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>

        {/* Filter bar skeleton */}
        <Skeleton className="skeleton-wave h-44 rounded-xl w-full" />

        {/* Table skeleton */}
        <Card className="border shadow-sm">
          <CardContent className="p-0">
            <div className="p-4 border-b">
              <Skeleton className="skeleton-wave h-5 w-40" />
            </div>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 border-b last:border-b-0">
                <Skeleton className="skeleton-wave h-4 w-36 shrink-0" />
                <Skeleton className="skeleton-wave h-4 w-24 shrink-0" />
                <Skeleton className="skeleton-wave h-5 w-16 shrink-0" />
                <Skeleton className="skeleton-wave h-4 w-28 shrink-0 hidden md:block" />
                <Skeleton className="skeleton-wave h-4 w-28 shrink-0 hidden md:block" />
                <Skeleton className="skeleton-wave h-4 w-32 shrink-0 hidden lg:block" />
                <Skeleton className="skeleton-wave h-4 w-32 shrink-0 hidden lg:block" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────
  const acceptRate =
    stats.totalToday > 0
      ? ((stats.acceptCount / stats.totalToday) * 100).toFixed(1)
      : "0.0";

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ─── Header ───────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-red-600 shadow-sm">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Auth Log</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Authentication attempts and RADIUS session events
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={fetching}
          >
            <RefreshCw
              className={`h-4 w-4 mr-1.5 ${fetching ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-1.5" />
            )}
            Export CSV
          </Button>
        </div>
      </div>

      {/* ─── Stats Cards ──────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Auth Today"
          value={stats.totalToday}
          icon={Activity}
          gradient="from-slate-500 to-slate-700"
          loading={false}
        />
        <StatCard
          label="Access-Accept"
          value={stats.acceptCount}
          icon={ShieldCheck}
          gradient="from-emerald-500 to-emerald-700"
          loading={false}
        />
        <StatCard
          label="Access-Reject"
          value={stats.rejectCount}
          icon={ShieldX}
          gradient="from-red-500 to-red-700"
          loading={false}
        />
        <StatCard
          label="Active Sessions"
          value={stats.activeSessions}
          icon={Wifi}
          gradient="from-teal-500 to-teal-700"
          loading={false}
        />
      </div>

      {/* ─── Summary Row ───────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground px-1">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          Accept Rate:{" "}
          <span className="font-semibold text-foreground">{acceptRate}%</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-slate-400" />
          Total Records:{" "}
          <span className="font-semibold text-foreground">
            {formatNumber(total)}
          </span>
        </span>
        {hasActiveFilters && (
          <span className="flex items-center gap-1.5 ml-auto">
            <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-200 dark:border-amber-800 dark:text-amber-400">
              <Filter className="h-3 w-3 mr-1" />
              Filters active
            </Badge>
          </span>
        )}
      </div>

      {/* ─── Filter Bar ───────────────────────────────────── */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              Filters
            </CardTitle>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                onClick={clearAllFilters}
              >
                <X className="h-3 w-3 mr-1" />
                Clear All
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Username Search */}
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">
                Username
              </Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search username..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="pl-8 h-9 text-sm"
                />
              </div>
            </div>

            {/* Date Range Preset */}
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">
                Date Range
              </Label>
              <Select
                value={datePreset}
                onValueChange={handlePresetChange}
              >
                <SelectTrigger className="h-9 text-sm">
                  <Calendar className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Select range" />
                </SelectTrigger>
                <SelectContent>
                  {DATE_PRESETS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Auth Result Filter */}
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">
                Auth Result
              </Label>
              <Select
                value={resultFilter}
                onValueChange={(val) => {
                  setResultFilter(val);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 text-sm">
                  <Shield className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="All results" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Results</SelectItem>
                  <SelectItem value="Access-Accept">Access-Accept</SelectItem>
                  <SelectItem value="Access-Reject">Access-Reject</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* NAS IP Filter */}
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">
                NAS IP
              </Label>
              <div className="relative">
                <Radio className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="e.g. 10.0.0.1"
                  value={nasIp}
                  onChange={(e) => {
                    setNasIp(e.target.value);
                    setPage(1);
                  }}
                  className="pl-8 h-9 text-sm font-mono"
                />
              </div>
            </div>
          </div>

          {/* Custom Date Range */}
          {datePreset === "custom" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 pt-3 border-t">
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">From</Label>
                <Input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">To</Label>
                <Input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="flex items-end">
                <Button
                  size="sm"
                  className="w-full bg-red-600 hover:bg-red-700 text-white h-9"
                  onClick={handleApplyCustomDate}
                >
                  Apply Date Range
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Auth Log Table ───────────────────────────────── */}
      <Card className="border shadow-sm">
        <CardContent className="p-0">
          {/* Table Header Bar */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">
                Recent Auth Events
              </span>
              {fetching && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages} &middot; {formatNumber(total)} total
            </span>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-semibold w-[180px]">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3" />
                      Timestamp
                    </div>
                  </TableHead>
                  <TableHead className="text-xs font-semibold w-[160px]">
                    <div className="flex items-center gap-1.5">
                      <Users className="h-3 w-3" />
                      Username
                    </div>
                  </TableHead>
                  <TableHead className="text-xs font-semibold w-[120px]">
                    <div className="flex items-center gap-1.5">
                      <Shield className="h-3 w-3" />
                      Auth Result
                    </div>
                  </TableHead>
                  <TableHead className="text-xs font-semibold hidden md:table-cell w-[140px]">
                    <div className="flex items-center gap-1.5">
                      <Globe className="h-3 w-3" />
                      Client IP
                    </div>
                  </TableHead>
                  <TableHead className="text-xs font-semibold hidden md:table-cell w-[140px]">
                    <div className="flex items-center gap-1.5">
                      <Radio className="h-3 w-3" />
                      NAS IP
                    </div>
                  </TableHead>
                  <TableHead className="text-xs font-semibold hidden lg:table-cell w-[150px]">
                    <div className="flex items-center gap-1.5">
                      <Wifi className="h-3 w-3" />
                      Calling ID (MAC)
                    </div>
                  </TableHead>
                  <TableHead className="text-xs font-semibold hidden xl:table-cell">
                    <div className="flex items-center gap-1.5">
                      <Wifi className="h-3 w-3" />
                      Called Station ID
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center py-16 text-muted-foreground"
                    >
                      <div className="flex flex-col items-center gap-3">
                        <div className="rounded-full bg-muted p-4">
                          <Shield className="h-10 w-10 text-muted-foreground/40" />
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-medium">
                            No auth events found
                          </p>
                          <p className="text-xs mt-1">
                            Authentication events will appear here as users
                            connect to the network.
                          </p>
                        </div>
                        {hasActiveFilters && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-1"
                            onClick={clearAllFilters}
                          >
                            Clear Filters
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  entries.map((entry, index) => (
                    <TableRow
                      key={entry.id || `${entry.timestamp}-${index}`}
                      className={`transition-colors duration-150 ${
                        entry.reply === "Access-Reject"
                          ? "hover:bg-red-50/50 dark:hover:bg-red-950/10"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      {/* Timestamp */}
                      <TableCell className="text-xs whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground">
                            {formatTimestamp(entry.timestamp)}
                          </span>
                        </div>
                      </TableCell>

                      {/* Username */}
                      <TableCell>
                        <span className="text-xs font-semibold font-mono text-foreground">
                          {entry.username || "—"}
                        </span>
                      </TableCell>

                      {/* Auth Result */}
                      <TableCell>
                        <AuthResultBadge reply={entry.reply} />
                      </TableCell>

                      {/* Client IP */}
                      <TableCell className="hidden md:table-cell">
                        <div className="flex items-center gap-1.5">
                          <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-xs text-muted-foreground font-mono">
                            {entry.clientIp || "—"}
                          </span>
                        </div>
                      </TableCell>

                      {/* NAS IP */}
                      <TableCell className="hidden md:table-cell">
                        <div className="flex items-center gap-1.5">
                          <Radio className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-xs text-muted-foreground font-mono">
                            {entry.nasIp || "—"}
                          </span>
                        </div>
                      </TableCell>

                      {/* Calling Station ID (MAC) */}
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex items-center gap-1.5">
                          <Wifi className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-xs text-muted-foreground font-mono">
                            {entry.callingStationId || "—"}
                          </span>
                        </div>
                      </TableCell>

                      {/* Called Station ID */}
                      <TableCell className="hidden xl:table-cell">
                        <div className="flex items-center gap-1.5">
                          <Wifi className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-xs text-muted-foreground font-mono">
                            {entry.calledStationId || "—"}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}

                {/* Inline fetch skeleton rows */}
                {fetching &&
                  !loading &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={`skel-${i}`} className="pointer-events-none">
                      <TableCell>
                        <Skeleton className="skeleton-wave h-4 w-32" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="skeleton-wave h-4 w-20" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="skeleton-wave h-5 w-16" />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Skeleton className="skeleton-wave h-4 w-24" />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Skeleton className="skeleton-wave h-4 w-24" />
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <Skeleton className="skeleton-wave h-4 w-28" />
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        <Skeleton className="skeleton-wave h-4 w-28" />
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t bg-muted/20">
              <p className="text-xs text-muted-foreground">
                Showing{" "}
                <span className="font-semibold text-foreground">
                  {(page - 1) * PAGE_SIZE + 1}
                </span>
                –
                <span className="font-semibold text-foreground">
                  {Math.min(page * PAGE_SIZE, total)}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-foreground">
                  {formatNumber(total)}
                </span>{" "}
                entries
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={page <= 1 || fetching}
                  onClick={() => handlePageChange(page - 1)}
                >
                  <ChevronLeft className="h-3 w-3 mr-1" />
                  Prev
                </Button>
                {/* Page numbers */}
                {(() => {
                  const pages: number[] = [];
                  const maxVisible = 5;
                  let start = Math.max(1, page - Math.floor(maxVisible / 2));
                  const end = Math.min(totalPages, start + maxVisible - 1);
                  if (end - start < maxVisible - 1) {
                    start = Math.max(1, end - maxVisible + 1);
                  }
                  for (let i = start; i <= end; i++) pages.push(i);
                  return pages.map((p) => (
                    <Button
                      key={p}
                      variant={p === page ? "default" : "outline"}
                      size="sm"
                      className="h-8 w-8 text-xs p-0"
                      disabled={fetching}
                      onClick={() => handlePageChange(p)}
                    >
                      {p}
                    </Button>
                  ));
                })()}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={page >= totalPages || fetching}
                  onClick={() => handlePageChange(page + 1)}
                >
                  Next
                  <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
