"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import {
  Clock,
  Search,
  RefreshCw,
  Filter,
  ArrowDownToLine,
  ArrowUpFromLine,
  Users,
  Activity,
  Server,
  ChevronLeft,
  ChevronRight,
  X,
  CalendarDays,
  Globe,
} from "lucide-react";
import PageHeader from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
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
import { EmptyState } from "@/components/ui/empty-state";

// ─── Types ────────────────────────────────────────────────────────
interface SessionHistoryEntry {
  id: string;
  sessionId: string;
  username: string;
  framedIp: string;
  nasIp: string;
  nasPortId: string | null;
  startTime: string;
  stopTime: string;
  acctSessionTime: number;
  acctInputOctets: number;
  acctOutputOctets: number;
  acctTerminateCause: string;
  downloadFormatted: string;
  uploadFormatted: string;
  durationFormatted: string;
}

interface SessionHistoryStats {
  totalSessions: number;
  avgDurationFormatted: string;
  totalDataFormatted: string;
  uniqueUsers: number;
}

interface SessionHistoryResponse {
  entries: SessionHistoryEntry[];
  stats: SessionHistoryStats;
  totalPages: number;
  total: number;
}

interface Filters {
  search: string;
  dateFrom: string;
  dateTo: string;
  nasIp: string;
  terminateCause: string;
}

const PAGE_LIMIT = 50;

// ─── Helpers ──────────────────────────────────────────────────────

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(1)} KB`;
}

function getTodayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function getLastWeekStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().split("T")[0];
}

function TerminateBadge({ cause }: { cause: string }) {
  if (cause === "User-Request") {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-0 text-[11px] font-medium">
        Normal
      </Badge>
    );
  }

  const errorCauses = [
    "NAS-Error",
    "Port-Error",
    "Service-Unavailable",
    "Lost-Carrier",
    "Lost-Service",
  ];
  const isError = errorCauses.includes(cause);

  return (
    <Badge
      className={`border-0 text-[11px] font-medium ${
        isError
          ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300"
          : "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300"
      }`}
    >
      {cause || "Unknown"}
    </Badge>
  );
}

// ─── Component ────────────────────────────────────────────────────
export default function SessionHistoryPage() {
  const [entries, setEntries] = useState<SessionHistoryEntry[]>([]);
  const [stats, setStats] = useState<SessionHistoryStats>({
    totalSessions: 0,
    avgDurationFormatted: "0m",
    totalDataFormatted: "0 B",
    uniqueUsers: 0,
  });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  const [filters, setFilters] = useState<Filters>({
    search: "",
    dateFrom: getLastWeekStr(),
    dateTo: getTodayStr(),
    nasIp: "",
    terminateCause: "",
  });
  const [appliedFilters, setAppliedFilters] = useState<Filters>({ ...filters });

  const hasActiveFilters =
    appliedFilters.search ||
    appliedFilters.nasIp ||
    appliedFilters.terminateCause ||
    appliedFilters.dateFrom ||
    appliedFilters.dateTo;

  // ─── Fetch data ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (appliedFilters.search)
      params.set("search", appliedFilters.search);
    if (appliedFilters.dateFrom)
      params.set("dateFrom", appliedFilters.dateFrom);
    if (appliedFilters.dateTo) params.set("dateTo", appliedFilters.dateTo);
    if (appliedFilters.nasIp) params.set("nasIp", appliedFilters.nasIp);
    if (appliedFilters.terminateCause)
      params.set("terminateCause", appliedFilters.terminateCause);
    params.set("page", page.toString());
    params.set("limit", PAGE_LIMIT.toString());

    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch effect
    setLoading(true);

    apiFetch<SessionHistoryResponse>(
      `/api/aaa/session-history?${params.toString()}`
    ).then((data) => {
      if (cancelled) return;
      setEntries(data.entries || []);
      setStats(
        data.stats || {
          totalSessions: 0,
          avgDurationFormatted: "0m",
          totalDataFormatted: "0 B",
          uniqueUsers: 0,
        }
      );
      setTotalPages(data.totalPages || 1);
      setTotal(data.total || 0);
    }).catch(() => {
      if (!cancelled) toast.error("Failed to load session history");
    }).finally(() => {
      if (!cancelled) {
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [appliedFilters, page, refreshKey]);

  // ─── Filter handlers ───────────────────────────────────────────
  function applyFilters() {
    setAppliedFilters({ ...filters });
    setPage(1);
  }

  function clearFilters() {
    const empty: Filters = {
      search: "",
      dateFrom: "",
      dateTo: "",
      nasIp: "",
      terminateCause: "",
    };
    setFilters(empty);
    setAppliedFilters(empty);
    setPage(1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") applyFilters();
  }

  // ─── Stat cards config ────────────────────────────────────────
  const statCards = [
    {
      label: "Total Sessions",
      value: stats.totalSessions.toLocaleString(),
      icon: Clock,
      gradient: "from-slate-500 to-slate-700",
    },
    {
      label: "Avg Duration",
      value: stats.avgDurationFormatted,
      icon: Activity,
      gradient: "from-teal-500 to-teal-700",
    },
    {
      label: "Total Data",
      value: stats.totalDataFormatted,
      icon: Globe,
      gradient: "from-rose-500 to-rose-700",
    },
    {
      label: "Unique Users",
      value: stats.uniqueUsers.toLocaleString(),
      icon: Users,
      gradient: "from-orange-500 to-orange-700",
    },
  ];

  // ─── Skeleton loading ─────────────────────────────────────────
  if (loading && page === 1) {
    return (
      <div className="space-y-6">
        <Skeleton className="skeleton-wave h-7 w-64" />
        <Skeleton className="skeleton-wave h-4 w-96" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[88px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="skeleton-wave h-[72px] rounded-xl" />
        <Card className="border shadow-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <th key={i} className="p-3">
                        <Skeleton className="h-4 w-16" />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="p-3">
                          <Skeleton className="h-4 w-full max-w-[120px]" />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <PageHeader
        title="Session History"
        description="Completed RADIUS sessions and accounting records"
        icon={Clock}
        actions={
          <Button
            variant="outline"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((item, i) => (
          <Card
            key={item.label}
            className="border-0 shadow-md overflow-hidden animate-card-enter"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div
              className={`bg-gradient-to-br ${item.gradient} p-4 rounded-xl`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/80 text-xs font-medium">
                    {item.label}
                  </p>
                  <p className="text-white text-2xl font-bold mt-1 tabular-nums">
                    {item.value}
                  </p>
                </div>
                <item.icon className="h-8 w-8 text-white/25" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Filter Bar */}
      <Card className="border shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Filters</span>
            {hasActiveFilters && (
              <Badge
                variant="secondary"
                className="text-[10px] bg-primary/10 text-primary"
              >
                Active
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Search by username */}
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">
                Username
              </Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search username..."
                  value={filters.search}
                  onChange={(e) =>
                    setFilters({ ...filters, search: e.target.value })
                  }
                  onKeyDown={handleKeyDown}
                  className="pl-8 h-9 text-sm"
                />
              </div>
            </div>

            {/* Date range */}
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">
                Date From
              </Label>
              <div className="relative">
                <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) =>
                    setFilters({ ...filters, dateFrom: e.target.value })
                  }
                  className="pl-8 h-9 text-sm"
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">
                Date To
              </Label>
              <div className="relative">
                <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) =>
                    setFilters({ ...filters, dateTo: e.target.value })
                  }
                  className="pl-8 h-9 text-sm"
                />
              </div>
            </div>

            {/* NAS IP */}
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">NAS IP</Label>
              <div className="relative">
                <Server className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="e.g. 10.0.0.1"
                  value={filters.nasIp}
                  onChange={(e) =>
                    setFilters({ ...filters, nasIp: e.target.value })
                  }
                  onKeyDown={handleKeyDown}
                  className="pl-8 h-9 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mt-3">
            {/* Terminate Cause */}
            <div className="grid gap-1.5 w-full sm:w-auto">
              <Label className="text-xs text-muted-foreground">
                Terminate Cause
              </Label>
              <Select
                value={filters.terminateCause || "__all__"}
                onValueChange={(val) =>
                  setFilters({
                    ...filters,
                    terminateCause: val === "__all__" ? "" : val,
                  })
                }
              >
                <SelectTrigger className="h-9 w-full sm:w-[200px] text-sm">
                  <SelectValue placeholder="All causes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Causes</SelectItem>
                  <SelectItem value="User-Request">
                    User-Request (Normal)
                  </SelectItem>
                  <SelectItem value="Idle-Timeout">Idle-Timeout</SelectItem>
                  <SelectItem value="Session-Timeout">Session-Timeout</SelectItem>
                  <SelectItem value="Admin-Reset">Admin-Reset</SelectItem>
                  <SelectItem value="NAS-Error">NAS-Error</SelectItem>
                  <SelectItem value="NAS-Reboot">NAS-Reboot</SelectItem>
                  <SelectItem value="Lost-Carrier">Lost-Carrier</SelectItem>
                  <SelectItem value="Port-Error">Port-Error</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 sm:ml-auto sm:mt-5">
              <Button size="sm" className="h-9 text-sm" onClick={applyFilters}>
                <Search className="h-3.5 w-3.5 mr-1.5" />
                Apply
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9 text-sm"
                onClick={clearFilters}
              >
                <X className="h-3.5 w-3.5 mr-1.5" />
                Clear
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sessions Table */}
      <Card className="border shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-semibold h-10">
                    Username
                  </TableHead>
                  <TableHead className="text-xs font-semibold h-10 hidden lg:table-cell">
                    Start Time
                  </TableHead>
                  <TableHead className="text-xs font-semibold h-10">
                    Stop Time
                  </TableHead>
                  <TableHead className="text-xs font-semibold h-10">
                    Duration
                  </TableHead>
                  <TableHead className="text-xs font-semibold h-10 hidden md:table-cell">
                    Download
                  </TableHead>
                  <TableHead className="text-xs font-semibold h-10 hidden md:table-cell">
                    Upload
                  </TableHead>
                  <TableHead className="text-xs font-semibold h-10 hidden xl:table-cell">
                    NAS IP
                  </TableHead>
                  <TableHead className="text-xs font-semibold h-10">
                    Cause
                  </TableHead>
                  <TableHead className="text-xs font-semibold h-10 hidden lg:table-cell">
                    Framed IP
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  // Inline loading for pagination changes
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full max-w-[100px]" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : entries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="p-0">
                      <EmptyState
                        icon={Clock}
                        title="No session history found"
                        description={
                          hasActiveFilters
                            ? "No completed sessions match the current filters. Try adjusting your search criteria."
                            : "Completed RADIUS sessions will appear here once users disconnect."
                        }
                        size="sm"
                        action={
                          hasActiveFilters
                            ? {
                                label: "Clear Filters",
                                onClick: clearFilters,
                                icon: X,
                              }
                            : undefined
                        }
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  entries.map((entry) => (
                    <TableRow
                      key={entry.id}
                      className="hover:bg-muted/50 transition-colors duration-150"
                    >
                      {/* Username */}
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Users className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-xs font-semibold font-mono">
                            {entry.username}
                          </span>
                        </div>
                      </TableCell>

                      {/* Start Time */}
                      <TableCell className="hidden lg:table-cell">
                        <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                          {formatTimestamp(entry.startTime)}
                        </span>
                      </TableCell>

                      {/* Stop Time */}
                      <TableCell>
                        <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                          {formatTimestamp(entry.stopTime)}
                        </span>
                      </TableCell>

                      {/* Duration */}
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-xs font-mono tabular-nums font-medium">
                            {formatDuration(entry.acctSessionTime)}
                          </span>
                        </div>
                      </TableCell>

                      {/* Download */}
                      <TableCell className="hidden md:table-cell">
                        <div className="flex items-center gap-1">
                          <ArrowDownToLine className="h-3 w-3 text-emerald-500 shrink-0" />
                          <span className="text-xs font-mono tabular-nums">
                            {formatBytes(entry.acctOutputOctets)}
                          </span>
                        </div>
                      </TableCell>

                      {/* Upload */}
                      <TableCell className="hidden md:table-cell">
                        <div className="flex items-center gap-1">
                          <ArrowUpFromLine className="h-3 w-3 text-orange-500 shrink-0" />
                          <span className="text-xs font-mono tabular-nums">
                            {formatBytes(entry.acctInputOctets)}
                          </span>
                        </div>
                      </TableCell>

                      {/* NAS IP */}
                      <TableCell className="hidden xl:table-cell">
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                          {entry.nasIp || "—"}
                        </code>
                      </TableCell>

                      {/* Terminate Cause */}
                      <TableCell>
                        <TerminateBadge cause={entry.acctTerminateCause} />
                      </TableCell>

                      {/* Framed IP */}
                      <TableCell className="hidden lg:table-cell">
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                          {entry.framedIp || "—"}
                        </code>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t bg-muted/20">
              <p className="text-xs text-muted-foreground">
                Showing{" "}
                <span className="font-medium text-foreground">
                  {((page - 1) * PAGE_LIMIT) + 1}
                  –{Math.min(page * PAGE_LIMIT, total)}
                </span>{" "}
                of{" "}
                <span className="font-medium text-foreground">
                  {total.toLocaleString()}
                </span>{" "}
                sessions
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Prev
                </Button>

                {(() => {
                  const pages: (number | "ellipsis")[] = [];
                  const current = page;
                  const tp = totalPages;
                  const range = 2;

                  if (tp <= 7) {
                    for (let i = 1; i <= tp; i++) pages.push(i);
                  } else {
                    pages.push(1);
                    if (current > range + 2) pages.push("ellipsis");
                    const start = Math.max(2, current - range);
                    const end = Math.min(tp - 1, current + range);
                    for (let i = start; i <= end; i++) pages.push(i);
                    if (current < tp - range - 1) pages.push("ellipsis");
                    pages.push(tp);
                  }

                  return pages.map((p, idx) =>
                    p === "ellipsis" ? (
                      <span
                        key={`ellipsis-${idx}`}
                        className="px-1 text-xs text-muted-foreground"
                      >
                        …
                      </span>
                    ) : (
                      <Button
                        key={p}
                        variant={p === current ? "default" : "outline"}
                        size="sm"
                        className="h-8 w-8 text-xs p-0"
                        onClick={() => setPage(p)}
                      >
                        {p}
                      </Button>
                    )
                  );
                })()}

                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
