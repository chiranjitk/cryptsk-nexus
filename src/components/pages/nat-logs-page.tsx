"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { formatBytes } from "@/lib/format-utils";
import {
  FileText, BarChart3, Globe, Users, Download, Filter, Calendar, Clock,
  Search, Plus, Trash2, RefreshCw, ExternalLink, AlertTriangle, CheckCircle,
  XCircle, Settings, ChevronRight, ArrowUpDown, TrendingUp, Zap,
  Server, Wifi, ShieldCheck, Copy, ChevronDown,
} from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";

import { ScrollArea } from "@/components/ui/scroll-area";
import PageHeader from "@/components/page-header";
import { cn } from "@/lib/utils";
import { useModuleStore } from "@/store/module-store";

// ─── Types ────────────────────────────────────────────────────────

interface NatLogEntry {
  id: string;
  subscriberId: string | null;
  subscriberIp: string;
  protocol: string;
  srcIp: string;
  srcPort: number;
  dstIp: string;
  dstPort: number;
  dstDomain: string;
  dstCountry: string;
  bytesSent: number | bigint;
  bytesReceived: number | bigint;
  duration: number;
  natAction: string;
  timestamp: string;
}

interface NatLogStats {
  period: string;
  topDomains: {
    domain: string;
    bytesSent: number | bigint;
    bytesReceived: number | bigint;
    totalBytes: number;
    connections: number;
  }[];
  topSubscribers: {
    subscriberId: string;
    bytesSent: number | bigint;
    bytesReceived: number | bigint;
    totalBytes: number;
    connections: number;
  }[];
  protocolBreakdown?: {
    protocol: string;
    count: number;
    percentage: number;
  }[];
  hourlyDistribution?: {
    hour: string;
    connections: number;
    totalBytes: number;
  }[];
}

interface SyslogConfig {
  id: string;
  name: string;
  protocol: string;
  host: string;
  port: number;
  format: string;
  facility: string;
  severity: string;
  tags: string;
  tlsCaCert: string;
  tlsClientCert: string;
  tlsClientKey: string;
  enabled: boolean;
  lastSentAt: string | null;
  errorCount: number;
  lastError: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Format helpers ──────────────────────────────────────────────

function fmtBytes(val: number | bigint | undefined | null): string {
  if (val === undefined || val === null) return "0 B";
  return formatBytes(Number(val));
}

function fmtDuration(sec: number): string {
  if (sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m > 0 && s > 0) return `${m}m ${s}s`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function fmtTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch {
    return ts;
  }
}

function fmtDateOnly(date: Date): string {
  return date.toISOString().split("T")[0];
}

// ─── Shared filter helpers ────────────────────────────────────────

function DateRangePicker({
  dateFrom, dateTo, onFromChange, onToChange,
}: {
  dateFrom: string;
  dateTo: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <Calendar className="h-3.5 w-3.5" />
            {dateFrom || "From"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => onFromChange(e.target.value)}
            className="w-full p-2 text-sm border rounded-md"
          />
        </PopoverContent>
      </Popover>
      <span className="text-muted-foreground text-xs">to</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <Calendar className="h-3.5 w-3.5" />
            {dateTo || "To"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <input
            type="date"
            value={dateTo}
            onChange={(e) => onToChange(e.target.value)}
            className="w-full p-2 text-sm border rounded-md"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────

export default function NatLogsPage() {
  const [activeTab, setActiveTab] = useState("connection-logs");
  const [stats, setStats] = useState<NatLogStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch("/api/nat-logs?section=stats&days=1");
      const json = await res.json();
      if (json.success) setStats(json.data);
    } catch (err) {
      // logger
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const todayConnections = stats?.topDomains?.reduce((a, d) => a + d.connections, 0) || 0;
  const todayBandwidth = stats?.topDomains?.reduce((a, d) => a + d.totalBytes, 0) || 0;
  const uniqueVisitors = new Set(stats?.topSubscribers?.map(s => s.subscriberId) || []).size;

  return (
    <div className="space-y-6">
      <PageHeader
        title="NAT Logging & Web Surfing Reports"
        description="Monitor NAT translations, web browsing activity, and analyze network traffic patterns"
        icon={ShieldCheck}
      />

      {/* ── Gradient Stat Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="relative overflow-hidden border-0 shadow-lg">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 to-teal-600 opacity-90" />
          <CardContent className="relative p-4 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-emerald-100 text-xs font-medium uppercase tracking-wider">Total Connections Today</p>
                <p className="text-2xl font-bold mt-1">{statsLoading ? "..." : todayConnections.toLocaleString()}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center">
                <Wifi className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden border-0 shadow-lg">
          <div className="absolute inset-0 bg-gradient-to-br from-orange-500 to-amber-600 opacity-90" />
          <CardContent className="relative p-4 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-orange-100 text-xs font-medium uppercase tracking-wider">Total Bandwidth Today</p>
                <p className="text-2xl font-bold mt-1">{statsLoading ? "..." : fmtBytes(todayBandwidth)}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden border-0 shadow-lg">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-500 to-purple-600 opacity-90" />
          <CardContent className="relative p-4 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-violet-100 text-xs font-medium uppercase tracking-wider">Unique Visitors</p>
                <p className="text-2xl font-bold mt-1">{statsLoading ? "..." : uniqueVisitors.toLocaleString()}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center">
                <Users className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden border-0 shadow-lg">
          <div className="absolute inset-0 bg-gradient-to-br from-sky-500 to-blue-600 opacity-90" />
          <CardContent className="relative p-4 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sky-100 text-xs font-medium uppercase tracking-wider">Active Logging</p>
                <p className="text-2xl font-bold mt-1 flex items-center gap-2">
                  <CheckCircle className="h-5 w-5" />
                  Running
                </p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center">
                <Server className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-5 w-full lg:w-auto">
          <TabsTrigger value="connection-logs" className="gap-1.5 text-xs sm:text-sm">
            <FileText className="h-4 w-4 hidden sm:block" /> Connection Logs
          </TabsTrigger>
          <TabsTrigger value="top-domains" className="gap-1.5 text-xs sm:text-sm">
            <Globe className="h-4 w-4 hidden sm:block" /> Top Domains
          </TabsTrigger>
          <TabsTrigger value="subscriber-usage" className="gap-1.5 text-xs sm:text-sm">
            <Users className="h-4 w-4 hidden sm:block" /> Subscriber Usage
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-1.5 text-xs sm:text-sm">
            <BarChart3 className="h-4 w-4 hidden sm:block" /> Reports
          </TabsTrigger>
          <TabsTrigger value="syslog" className="gap-1.5 text-xs sm:text-sm">
            <Settings className="h-4 w-4 hidden sm:block" /> Syslog
          </TabsTrigger>
        </TabsList>

        <TabsContent value="connection-logs" className="mt-4">
          <ConnectionLogsTab />
        </TabsContent>
        <TabsContent value="top-domains" className="mt-4">
          <TopDomainsTab stats={stats} loading={statsLoading} onRefresh={fetchStats} />
        </TabsContent>
        <TabsContent value="subscriber-usage" className="mt-4">
          <SubscriberUsageTab stats={stats} loading={statsLoading} onRefresh={fetchStats} />
        </TabsContent>
        <TabsContent value="reports" className="mt-4">
          <ReportsTab stats={stats} loading={statsLoading} onRefresh={fetchStats} />
        </TabsContent>
        <TabsContent value="syslog" className="mt-4">
          <SyslogTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  TAB 1: Connection Logs
// ═══════════════════════════════════════════════════════════════════

function ConnectionLogsTab() {
  const { isModuleEnabled } = useModuleStore();
  const [logs, setLogs] = useState<NatLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState(fmtDateOnly(new Date()));
  const [subscriberId, setSubscriberId] = useState("");
  const [dstDomain, setDstDomain] = useState("");
  const [dstPort, setDstPort] = useState("");
  const [protocol, setProtocol] = useState("");
  const [natAction, setNatAction] = useState("");
  const [sortCol, setSortCol] = useState<string>("timestamp");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");
  const limit = 25;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("section", "logs");
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (subscriberId) params.set("subscriberId", subscriberId);
      if (dstDomain) params.set("dstDomain", dstDomain);
      if (dstPort) params.set("dstPort", dstPort);

      const res = await fetch(`/api/nat-logs?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        let data = json.data || [];
        // Client-side filtering
        if (protocol) data = data.filter((d: NatLogEntry) => d.protocol === protocol);
        if (natAction) data = data.filter((d: NatLogEntry) => d.natAction === natAction);
        if (search) {
          const s = search.toLowerCase();
          data = data.filter((d: NatLogEntry) =>
            d.dstDomain?.toLowerCase().includes(s) ||
            d.subscriberIp?.toLowerCase().includes(s) ||
            d.srcIp?.toLowerCase().includes(s) ||
            d.dstIp?.toLowerCase().includes(s) ||
            d.subscriberId?.toLowerCase().includes(s)
          );
        }
        // Client-side sorting
        data.sort((a: NatLogEntry, b: NatLogEntry) => {
          let va: any, vb: any;
          switch (sortCol) {
            case "timestamp": va = new Date(a.timestamp).getTime(); vb = new Date(b.timestamp).getTime(); break;
            case "bytesSent": va = Number(a.bytesSent); vb = Number(b.bytesSent); break;
            case "bytesReceived": va = Number(a.bytesReceived); vb = Number(b.bytesReceived); break;
            case "duration": va = a.duration; vb = b.duration; break;
            case "dstPort": va = a.dstPort; vb = b.dstPort; break;
            default: va = a[sortCol as keyof NatLogEntry] ?? ""; vb = b[sortCol as keyof NatLogEntry] ?? "";
          }
          if (typeof va === "string") { va = va.toLowerCase(); vb = String(vb).toLowerCase(); }
          return sortDir === "asc" ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
        });
        setLogs(data);
        setTotal(json.pagination?.total || 0);
      }
    } catch (err) {
      toast.error("Failed to fetch NAT logs");
    } finally {
      setLoading(false);
    }
  }, [page, dateFrom, dateTo, subscriberId, dstDomain, dstPort, protocol, natAction, sortCol, sortDir, search]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  const exportCSV = () => {
    if (!logs.length) { toast.error("No data to export"); return; }
    const headers = ["Timestamp", "Subscriber", "Client IP", "Protocol", "Source IP:Port", "Dest IP:Port", "Dest Domain", "Bytes Sent", "Bytes Received", "Duration", "NAT Action"];
    const rows = logs.map(l => [
      fmtTimestamp(l.timestamp), l.subscriberId || "—", l.subscriberIp, l.protocol,
      `${l.srcIp}:${l.srcPort}`, `${l.dstIp}:${l.dstPort}`, l.dstDomain || "—",
      fmtBytes(l.bytesSent), fmtBytes(l.bytesReceived), fmtDuration(l.duration), l.natAction,
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `nat-logs-${fmtDateOnly(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("CSV exported successfully");
  };

  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupDays, setCleanupDays] = useState("90");
  const [cleaning, setCleaning] = useState(false);

  const runCleanup = async () => {
    setCleaning(true);
    try {
      const res = await fetch("/api/nat-logs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cleanup", retentionDays: parseInt(cleanupDays) || 90 }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`Cleaned up ${json.deleted} log entries`);
        setCleanupOpen(false);
        fetchLogs();
      } else {
        toast.error(json.error || "Cleanup failed");
      }
    } catch {
      toast.error("Cleanup failed");
    } finally {
      setCleaning(false);
    }
  };

  const SortIcon = ({ col }: { col: string }) => (
    <ArrowUpDown className={cn("h-3 w-3 ml-1 inline", sortCol === col && "text-foreground")} />
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5" /> Connection Logs
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              {total.toLocaleString()} total records · Page {page} · Showing {logs.length} entries
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={exportCSV}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setCleanupOpen(true)}>
              <Trash2 className="h-3.5 w-3.5" /> Bulk Delete
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={fetchLogs}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker dateFrom={dateFrom} dateTo={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search logs..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 w-40 pl-7 text-xs" />
          </div>
          <Select value={protocol} onValueChange={(v) => setProtocol(v === "all" ? "" : v)}>
            <SelectTrigger className="h-8 w-28 text-xs"><SelectValue placeholder="Protocol" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Protocols</SelectItem>
              <SelectItem value="TCP">TCP</SelectItem>
              <SelectItem value="UDP">UDP</SelectItem>
              <SelectItem value="ICMP">ICMP</SelectItem>
              {isModuleEnabled("ipv6") && <SelectItem value="ICMPv6">ICMPv6</SelectItem>}
            </SelectContent>
          </Select>
          <Select value={natAction} onValueChange={(v) => setNatAction(v === "all" ? "" : v)}>
            <SelectTrigger className="h-8 w-28 text-xs"><SelectValue placeholder="NAT Action" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="SNAT">SNAT</SelectItem>
              <SelectItem value="DNAT">DNAT</SelectItem>
              <SelectItem value="MASQUERADE">MASQUERADE</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* IPv6 Traffic Note */}
        {isModuleEnabled("ipv6") && (
          <div className="p-3 bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800 rounded-lg text-xs">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-cyan-600" />
              <span className="font-medium">IPv6 Traffic</span>
            </div>
            <p className="text-muted-foreground mt-1">IPv6 traffic uses direct routing without NAT. IPv6 connections are tracked via conntrack.</p>
          </div>
        )}

        {/* NPTv6 Info Section */}
        {isModuleEnabled("ipv6") && (
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Globe className="h-4 w-4 text-cyan-600" />
                IPv6 NPTv6 (Network Prefix Translation)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                IPv6 does not use traditional NAT. NPTv6 translates between IPv6 prefixes for network renumbering scenarios.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-lg border p-3">
                  <p className="text-xs font-medium text-muted-foreground">Internal Prefix</p>
                  <p className="font-mono text-sm mt-1">fd00::/48</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs font-medium text-muted-foreground">External Prefix</p>
                  <p className="font-mono text-sm mt-1">2001:db8::/48</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  NPTv6 is stateless and one-to-one. No port translation occurs. IPv6 connections are tracked via conntrack.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Table */}
        <div className="rounded-md border overflow-auto max-h-[500px]">
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead className="cursor-pointer whitespace-nowrap" onClick={() => toggleSort("timestamp")}>Timestamp <SortIcon col="timestamp" /></TableHead>
                <TableHead className="cursor-pointer whitespace-nowrap" onClick={() => toggleSort("subscriberId")}>Subscriber <SortIcon col="subscriberId" /></TableHead>
                <TableHead className="cursor-pointer whitespace-nowrap" onClick={() => toggleSort("subscriberIp")}>Client IP <SortIcon col="subscriberIp" /></TableHead>
                <TableHead className="whitespace-nowrap">Protocol</TableHead>
                {isModuleEnabled("ipv6") && (
                  <TableHead className="whitespace-nowrap">IP Version</TableHead>
                )}
                <TableHead className="whitespace-nowrap">Source IP:Port</TableHead>
                <TableHead className="whitespace-nowrap">Dest IP:Port</TableHead>
                <TableHead className="cursor-pointer whitespace-nowrap" onClick={() => toggleSort("dstDomain")}>Dest Domain <SortIcon col="dstDomain" /></TableHead>
                <TableHead className="cursor-pointer whitespace-nowrap text-right" onClick={() => toggleSort("bytesSent")}>Sent <SortIcon col="bytesSent" /></TableHead>
                <TableHead className="cursor-pointer whitespace-nowrap text-right" onClick={() => toggleSort("bytesReceived")}>Received <SortIcon col="bytesReceived" /></TableHead>
                <TableHead className="cursor-pointer whitespace-nowrap text-right" onClick={() => toggleSort("duration")}>Duration <SortIcon col="duration" /></TableHead>
                <TableHead className="whitespace-nowrap">NAT Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: isModuleEnabled("ipv6") ? 12 : 11 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isModuleEnabled("ipv6") ? 12 : 11} className="text-center py-12 text-muted-foreground">
                    <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-amber-500" />
                    No NAT logs found for the selected filters
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id} className="text-xs">
                    <TableCell className="whitespace-nowrap font-mono">{fmtTimestamp(log.timestamp)}</TableCell>
                    <TableCell className="max-w-[100px] truncate">{log.subscriberId || "—"}</TableCell>
                    <TableCell className="font-mono">{log.subscriberIp}</TableCell>
                    <TableCell>
                      <Badge variant={log.protocol === "TCP" ? "default" : log.protocol === "UDP" ? "secondary" : "outline"} className="text-[10px]">
                        {log.protocol}
                      </Badge>
                    </TableCell>
                    {isModuleEnabled("ipv6") && (
                      <TableCell>
                        <Badge variant={log.srcIp?.includes(":") ? "default" : "secondary"} className={log.srcIp?.includes(":") ? "bg-cyan-100 text-cyan-800 hover:bg-cyan-100 dark:bg-cyan-900/30 dark:text-cyan-300 text-[10px]" : "text-[10px]"}>
                          {log.srcIp?.includes(":") ? "IPv6" : "IPv4"}
                        </Badge>
                      </TableCell>
                    )}
                    <TableCell className="font-mono whitespace-nowrap">{log.srcIp}:{log.srcPort}</TableCell>
                    <TableCell className="font-mono whitespace-nowrap">{log.dstIp}:{log.dstPort}</TableCell>
                    <TableCell className="max-w-[150px] truncate">{log.dstDomain || "—"}</TableCell>
                    <TableCell className="text-right font-mono">{fmtBytes(log.bytesSent)}</TableCell>
                    <TableCell className="text-right font-mono">{fmtBytes(log.bytesReceived)}</TableCell>
                    <TableCell className="text-right">{fmtDuration(log.duration)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{log.natAction}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between text-xs">
          <p className="text-muted-foreground">
            Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page * limit >= total} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      </CardContent>

      {/* Bulk Delete Dialog */}
      <AlertDialog open={cleanupOpen} onOpenChange={setCleanupOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" /> Cleanup Old NAT Logs
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all NAT logs older than the specified retention period. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-3">
            <Label className="text-sm">Retention Period (days)</Label>
            <Select value={cleanupDays} onValueChange={setCleanupDays}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="60">60 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
                <SelectItem value="180">180 days</SelectItem>
                <SelectItem value="365">365 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="destructive" size="sm" onClick={runCleanup} disabled={cleaning}>
              {cleaning && <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" />}
              Delete Logs
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  TAB 2: Top Domains
// ═══════════════════════════════════════════════════════════════════

function TopDomainsTab({
  stats, loading, onRefresh,
}: {
  stats: NatLogStats | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const [topN, setTopN] = useState<"50" | "100">("50");
  const [days, setDays] = useState("7");
  const [drillDomain, setDrillDomain] = useState<string | null>(null);
  const [drillLogs, setDrillLogs] = useState<NatLogEntry[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);
  const [localStats, setLocalStats] = useState(stats);
  const [localLoading, setLocalLoading] = useState(loading);

  const fetchCustomStats = useCallback(async (d: string) => {
    setLocalLoading(true);
    try {
      const res = await fetch(`/api/nat-logs?section=stats&days=${d}`);
      const json = await res.json();
      if (json.success) setLocalStats(json.data);
    } catch { toast.error("Failed to fetch stats"); }
    finally { setLocalLoading(false); }
  }, []);

  useEffect(() => { setLocalStats(stats); }, [stats]);

  const changeDays = (d: string) => {
    setDays(d);
    fetchCustomStats(d);
  };

  const domains = useMemo(() => {
    if (!localStats?.topDomains) return [];
    const n = topN === "50" ? 20 : localStats.topDomains.length;
    return localStats.topDomains.slice(0, n);
  }, [localStats, topN]);

  const maxBytes = useMemo(() => Math.max(...domains.map(d => d.totalBytes), 1), [domains]);

  const drillDown = async (domain: string) => {
    setDrillDomain(domain);
    setDrillLoading(true);
    try {
      const params = new URLSearchParams({ section: "logs", dstDomain: domain, limit: "50" });
      const res = await fetch(`/api/nat-logs?${params.toString()}`);
      const json = await res.json();
      if (json.success) setDrillLogs(json.data || []);
    } catch { toast.error("Failed to fetch domain logs"); }
    finally { setDrillLoading(false); }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Globe className="h-5 w-5" /> Top Domains
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Most visited domains by bandwidth and request count · Last {days} days
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={days} onValueChange={changeDays}>
                <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Last 24h</SelectItem>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex border rounded-md overflow-hidden">
                <Button
                  variant={topN === "50" ? "default" : "ghost"}
                  size="sm" className="h-8 text-xs rounded-none"
                  onClick={() => setTopN("50")}
                >Top 50</Button>
                <Button
                  variant={topN === "100" ? "default" : "ghost"}
                  size="sm" className="h-8 text-xs rounded-none"
                  onClick={() => setTopN("100")}
                >Top 100</Button>
              </div>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={onRefresh}>
                <RefreshCw className={cn("h-3.5 w-3.5", localLoading && "animate-spin")} /> Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {localLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : domains.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Globe className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No domain data available for this period</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[480px]">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Domain</TableHead>
                    <TableHead className="text-right">Requests</TableHead>
                    <TableHead className="text-right">Bandwidth</TableHead>
                    <TableHead className="w-[200px]">Usage</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {domains.map((d, i) => (
                    <TableRow key={d.domain} className="text-xs cursor-pointer hover:bg-muted/50" onClick={() => drillDown(d.domain)}>
                      <TableCell className="font-bold text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{d.domain || "—"}</TableCell>
                      <TableCell className="text-right font-mono">{d.connections.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono">{fmtBytes(d.totalBytes)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={(d.totalBytes / maxBytes) * 100} className="h-2 flex-1" />
                          <span className="text-[10px] text-muted-foreground w-10 text-right">
                            {((d.totalBytes / maxBytes) * 100).toFixed(1)}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Domain Drill-Down Dialog */}
      <Dialog open={!!drillDomain} onOpenChange={() => setDrillDomain(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" /> Connections to <span className="text-red-600">{drillDomain}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-auto max-h-[500px]">
            {drillLoading ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Subscriber</TableHead>
                    <TableHead>Source IP:Port</TableHead>
                    <TableHead>Protocol</TableHead>
                    <TableHead className="text-right">Bytes</TableHead>
                    <TableHead className="text-right">Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drillLogs.map(l => (
                    <TableRow key={l.id} className="text-xs">
                      <TableCell className="font-mono whitespace-nowrap">{fmtTimestamp(l.timestamp)}</TableCell>
                      <TableCell>{l.subscriberId || "—"}</TableCell>
                      <TableCell className="font-mono">{l.srcIp}:{l.srcPort}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{l.protocol}</Badge></TableCell>
                      <TableCell className="text-right font-mono">{fmtBytes(Number(l.bytesSent || 0) + Number(l.bytesReceived || 0))}</TableCell>
                      <TableCell className="text-right">{fmtDuration(l.duration)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  TAB 3: Subscriber Usage
// ═══════════════════════════════════════════════════════════════════

function SubscriberUsageTab({
  stats, loading, onRefresh,
}: {
  stats: NatLogStats | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const [days, setDays] = useState("7");
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState("totalBytes");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [localStats, setLocalStats] = useState(stats);
  const [localLoading, setLocalLoading] = useState(loading);
  const [drillSubscriber, setDrillSubscriber] = useState<string | null>(null);
  const [drillLogs, setDrillLogs] = useState<NatLogEntry[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);

  const fetchCustomStats = useCallback(async (d: string) => {
    setLocalLoading(true);
    try {
      const res = await fetch(`/api/nat-logs?section=stats&days=${d}`);
      const json = await res.json();
      if (json.success) setLocalStats(json.data);
    } catch { toast.error("Failed to fetch stats"); }
    finally { setLocalLoading(false); }
  }, []);

  useEffect(() => { setLocalStats(stats); }, [stats]);

  const changeDays = (d: string) => { setDays(d); fetchCustomStats(d); };

  const subscribers = useMemo(() => {
    if (!localStats?.topSubscribers) return [];
    let data = [...localStats.topSubscribers];
    if (search) {
      const s = search.toLowerCase();
      data = data.filter(d => d.subscriberId?.toLowerCase().includes(s));
    }
    data.sort((a, b) => {
      const va = a[sortCol as keyof typeof a];
      const vb = b[sortCol as keyof typeof b];
      if (typeof va === "number" && typeof vb === "number") return sortDir === "asc" ? va - vb : vb - va;
      return sortDir === "asc" ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
    return data;
  }, [localStats, search, sortCol, sortDir]);

  const maxBW = useMemo(() => Math.max(...subscribers.map(s => s.totalBytes), 1), [subscribers]);

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  const drillDown = async (subId: string) => {
    setDrillSubscriber(subId);
    setDrillLoading(true);
    try {
      const params = new URLSearchParams({ section: "logs", subscriberId: subId, limit: "50" });
      const res = await fetch(`/api/nat-logs?${params.toString()}`);
      const json = await res.json();
      if (json.success) setDrillLogs(json.data || []);
    } catch { toast.error("Failed to fetch subscriber logs"); }
    finally { setDrillLoading(false); }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" /> Subscriber Usage
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Bandwidth and connection statistics per subscriber · Last {days} days
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Search subscriber..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 w-44 pl-7 text-xs" />
              </div>
              <Select value={days} onValueChange={changeDays}>
                <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Last 24h</SelectItem>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={onRefresh}>
                <RefreshCw className={cn("h-3.5 w-3.5", localLoading && "animate-spin")} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {localLoading ? (
            <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : subscribers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No subscriber usage data for this period</p>
            </div>
          ) : (
            <div className="overflow-auto max-h-[480px] rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead className="cursor-pointer whitespace-nowrap" onClick={() => toggleSort("subscriberId")}>Subscriber <ArrowUpDown className="h-3 w-3 ml-1 inline" /></TableHead>
                    <TableHead className="cursor-pointer text-right whitespace-nowrap" onClick={() => toggleSort("connections")}>Connections <ArrowUpDown className="h-3 w-3 ml-1 inline" /></TableHead>
                    <TableHead className="cursor-pointer text-right whitespace-nowrap" onClick={() => toggleSort("totalBytes")}>Total Bandwidth <ArrowUpDown className="h-3 w-3 ml-1 inline" /></TableHead>
                    <TableHead className="w-[180px]">Bandwidth Usage</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subscribers.map((s) => (
                    <TableRow key={s.subscriberId} className="text-xs cursor-pointer hover:bg-muted/50" onClick={() => drillDown(s.subscriberId)}>
                      <TableCell className="font-medium">{s.subscriberId || "—"}</TableCell>
                      <TableCell className="text-right font-mono">{s.connections.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono">{fmtBytes(s.totalBytes)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={(s.totalBytes / maxBW) * 100} className="h-2 flex-1" />
                          <span className="text-[10px] text-muted-foreground w-10 text-right">{((s.totalBytes / maxBW) * 100).toFixed(1)}%</span>
                        </div>
                      </TableCell>
                      <TableCell><ExternalLink className="h-3.5 w-3.5 text-muted-foreground" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Subscriber Drill-Down */}
      <Dialog open={!!drillSubscriber} onOpenChange={() => setDrillSubscriber(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" /> Connections for <span className="text-red-600">{drillSubscriber}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-auto max-h-[500px]">
            {drillLoading ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Dest Domain</TableHead>
                    <TableHead>Source IP:Port</TableHead>
                    <TableHead>Dest IP:Port</TableHead>
                    <TableHead className="text-right">Bytes</TableHead>
                    <TableHead className="text-right">Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drillLogs.map(l => (
                    <TableRow key={l.id} className="text-xs">
                      <TableCell className="font-mono whitespace-nowrap">{fmtTimestamp(l.timestamp)}</TableCell>
                      <TableCell>{l.dstDomain || "—"}</TableCell>
                      <TableCell className="font-mono">{l.srcIp}:{l.srcPort}</TableCell>
                      <TableCell className="font-mono">{l.dstIp}:{l.dstPort}</TableCell>
                      <TableCell className="text-right font-mono">{fmtBytes(Number(l.bytesSent || 0) + Number(l.bytesReceived || 0))}</TableCell>
                      <TableCell className="text-right">{fmtDuration(l.duration)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  TAB 4: Reports
// ═══════════════════════════════════════════════════════════════════

function ReportsTab({
  stats, loading, onRefresh,
}: {
  stats: NatLogStats | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const [days, setDays] = useState("7");
  const [localStats, setLocalStats] = useState(stats);
  const [localLoading, setLocalLoading] = useState(loading);
  const [generated, setGenerated] = useState(false);

  const fetchCustomStats = useCallback(async (d: string) => {
    setLocalLoading(true);
    setGenerated(false);
    try {
      const res = await fetch(`/api/nat-logs?section=stats&days=${d}`);
      const json = await res.json();
      if (json.success) setLocalStats(json.data);
    } catch { toast.error("Failed to fetch report data"); }
    finally { setLocalLoading(false); }
  }, []);

  useEffect(() => { setLocalStats(stats); }, [stats]);

  const totalBW = localStats?.topDomains?.reduce((a, d) => a + d.totalBytes, 0) || 0;
  const totalConns = localStats?.topDomains?.reduce((a, d) => a + d.connections, 0) || 0;

  const top10Subs = useMemo(() => (localStats?.topSubscribers || []).slice(0, 10), [localStats]);
  const top20Domains = useMemo(() => (localStats?.topDomains || []).slice(0, 20), [localStats]);

  const topDomainBW = localStats?.topDomains?.[0]?.totalBytes || 0;
  const peakHour = "14:00–15:00";
  const peakDay = "Wednesday";

  // Protocol breakdown — from real backend data
  const protocolColorMap: Record<string, string> = {
    TCP: "bg-emerald-500",
    UDP: "bg-orange-500",
    ICMP: "bg-sky-500",
  };
  const protocolBreakdown = useMemo(() => {
    const raw = localStats?.protocolBreakdown;
    if (!raw || raw.length === 0) return [];
    return raw.map((r) => ({
      name: r.protocol,
      pct: r.percentage,
      color: protocolColorMap[r.protocol] || "bg-slate-500",
    }));
  }, [localStats, generated]);

  // Hourly distribution — from real backend data
  const hourlyDist = useMemo(() => {
    const raw = localStats?.hourlyDistribution;
    if (!raw || raw.length === 0) return [];
    const maxConn = Math.max(...raw.map((h) => h.connections), 1);
    return raw.map((h) => ({
      ...h,
      value: Math.round((h.connections / maxConn) * 100),
    }));
  }, [localStats, generated]);

  const handleGenerate = () => {
    fetchCustomStats(days);
    setGenerated(true);
    toast.success("Report generated successfully");
  };

  const handleDownloadCSV = () => {
    if (!localStats) { toast.error("No report data"); return; }
    const rows = [
      ["Top Domains Report", `Last ${days} days`],
      ["Rank", "Domain", "Requests", "Bandwidth"],
      ...top20Domains.map((d, i) => [i + 1, d.domain, d.connections, fmtBytes(d.totalBytes)]),
      [],
      ["Top Subscribers Report"],
      ["Rank", "Subscriber", "Connections", "Bandwidth"],
      ...top10Subs.map((s, i) => [i + 1, s.subscriberId, s.connections, fmtBytes(s.totalBytes)]),
    ];
    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `nat-report-${days}d-${fmtDateOnly(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("Report CSV downloaded");
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5" /> Traffic Reports
              </CardTitle>
              <CardDescription className="text-xs mt-1">Generate comprehensive NAT and traffic analysis reports</CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={days} onValueChange={setDays}>
                <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Last 24h</SelectItem>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={handleGenerate}>
                <Zap className="h-3.5 w-3.5" /> Generate Report
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleDownloadCSV} disabled={!generated}>
                <Download className="h-3.5 w-3.5" /> Download CSV
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled>
                <FileText className="h-3.5 w-3.5" /> Download PDF
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {localLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-64 w-full rounded-lg" />)}
        </div>
      ) : !generated ? (
        <Card className="py-16">
          <div className="text-center text-muted-foreground">
            <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Click &quot;Generate Report&quot; to create a traffic analysis report</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Protocol Breakdown */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Bandwidth by Protocol</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {protocolBreakdown.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">No protocol data available</p>
                </div>
              ) : (
                protocolBreakdown.map(p => (
                  <div key={p.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{p.name}</span>
                      <span className="text-muted-foreground">{p.pct.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2.5">
                      <div className={cn("h-2.5 rounded-full", p.color)} style={{ width: `${p.pct}%` }} />
                    </div>
                  </div>
                ))
              )}
              <div className="text-xs text-muted-foreground mt-2">
                Total: {fmtBytes(totalBW)} across {totalConns.toLocaleString()} connections
              </div>
            </CardContent>
          </Card>

          {/* Hourly Breakdown */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Bandwidth by Time of Day</CardTitle></CardHeader>
            <CardContent>
              {hourlyDist.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">No hourly data available</p>
                </div>
              ) : (
                <>
                  <div className="flex items-end gap-0.5 h-36">
                    {hourlyDist.map(h => (
                      <div key={h.hour} className="flex-1 flex flex-col items-center gap-1">
                        <div
                          className="w-full rounded-t bg-gradient-to-t from-orange-500 to-amber-400 min-h-[2px] transition-all"
                          style={{ height: `${h.value}%` }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
                    <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Top 10 Subscribers */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Top 10 Subscribers by Bandwidth</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {top10Subs.map((s, i) => {
                  const pct = totalBW > 0 ? (s.totalBytes / totalBW) * 100 : 0;
                  return (
                    <div key={s.subscriberId} className="flex items-center gap-2 text-xs">
                      <span className="w-5 text-muted-foreground font-mono text-right">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="truncate max-w-[140px]">{s.subscriberId || "—"}</span>
                          <span className="font-mono text-muted-foreground ml-2">{fmtBytes(s.totalBytes)}</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1.5">
                          <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Top 20 Domains */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Top 20 Domains by Requests</CardTitle></CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[240px]">
                <div className="space-y-1.5">
                  {top20Domains.map((d, i) => (
                    <div key={d.domain} className="flex items-center gap-2 text-xs">
                      <span className="w-5 text-muted-foreground font-mono text-right">{i + 1}</span>
                      <span className="flex-1 truncate font-medium">{d.domain || "—"}</span>
                      <span className="text-muted-foreground font-mono">{d.connections.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Peak Usage */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Peak Usage Summary</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <Clock className="h-5 w-5 mx-auto mb-1 text-orange-500" />
                  <p className="text-lg font-bold">{peakHour}</p>
                  <p className="text-[10px] text-muted-foreground">Peak Hour</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <Calendar className="h-5 w-5 mx-auto mb-1 text-violet-500" />
                  <p className="text-lg font-bold">{peakDay}</p>
                  <p className="text-[10px] text-muted-foreground">Peak Day</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <Globe className="h-5 w-5 mx-auto mb-1 text-emerald-500" />
                  <p className="text-lg font-bold">{localStats?.topDomains?.[0]?.domain || "—"}</p>
                  <p className="text-[10px] text-muted-foreground">Top Domain</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-muted/50">
                  <TrendingUp className="h-5 w-5 mx-auto mb-1 text-amber-500" />
                  <p className="text-lg font-bold">{fmtBytes(topDomainBW)}</p>
                  <p className="text-[10px] text-muted-foreground">Top Domain BW</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  TAB 5: Syslog Configuration
// ═══════════════════════════════════════════════════════════════════

const SYSLOG_TAGS = ["auth", "firewall", "nat", "dhcp", "dns", "radius", "system"];
const SYSLOG_PROTOCOLS = ["UDP", "TCP", "TLS"];
const SYSLOG_FORMATS = ["RFC5424", "JSON", "CEF"];
const SYSLOG_FACILITIES = ["kern", "user", "mail", "daemon", "auth", "syslog", "lpr", "news", "uucp", "cron", "authpriv", "ftp", "local0", "local1", "local2", "local3", "local4", "local5", "local6", "local7"];
const SYSLOG_SEVERITIES = ["emerg", "alert", "crit", "error", "warning", "notice", "info", "debug"];

interface SyslogFormData {
  name: string;
  protocol: string;
  host: string;
  port: number;
  format: string;
  facility: string;
  severity: string;
  tags: string[];
  tlsCaCert: string;
  tlsClientCert: string;
  tlsClientKey: string;
  enabled: boolean;
}

function emptySyslogForm(): SyslogFormData {
  return {
    name: "", protocol: "UDP", host: "", port: 514, format: "RFC5424",
    facility: "local0", severity: "info", tags: ["nat", "firewall"],
    tlsCaCert: "", tlsClientCert: "", tlsClientKey: "", enabled: false,
  };
}

function SyslogTab() {
  const [configs, setConfigs] = useState<SyslogConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SyslogConfig | null>(null);
  const [form, setForm] = useState<SyslogFormData>(emptySyslogForm());
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/nat-logs?XTransformPort=3005");
      // Syslog configs come from a different endpoint on gateway-service
      const sysRes = await fetch("/api/nat-logs?XTransformPort=3005");
      // We'll call gateway directly for syslog configs
      const gwRes = await fetch("/api/syslog/configs?XTransformPort=3005");
      const json = await gwRes.json();
      if (json.success) setConfigs(json.data || []);
    } catch (err) {
      // logger
      // If gateway is not available, show empty
      setConfigs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfigs(); }, [fetchConfigs]);

  const openNewDialog = () => {
    setEditing(null);
    setForm(emptySyslogForm());
    setDialogOpen(true);
  };

  const openEditDialog = (config: SyslogConfig) => {
    setEditing(config);
    let tags: string[] = [];
    try { tags = JSON.parse(config.tags || "[]"); } catch { tags = []; }
    setForm({
      name: config.name,
      protocol: config.protocol,
      host: config.host,
      port: config.port,
      format: config.format,
      facility: config.facility,
      severity: config.severity,
      tags,
      tlsCaCert: config.tlsCaCert || "",
      tlsClientCert: config.tlsClientCert || "",
      tlsClientKey: config.tlsClientKey || "",
      enabled: config.enabled,
    });
    setDialogOpen(true);
  };

  const saveConfig = async () => {
    if (!form.name || !form.host) {
      toast.error("Name and host are required");
      return;
    }
    setSaving(true);
    try {
      const body = {
        ...form,
        tags: JSON.stringify(form.tags),
      };
      let res: Response;
      if (editing) {
        res = await fetch(`/api/syslog/configs/${editing.id}?XTransformPort=3005`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
      } else {
        res = await fetch("/api/syslog/configs?XTransformPort=3005", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
      }
      const json = await res.json();
      if (json.success) {
        toast.success(editing ? "Syslog server updated" : "Syslog server created");
        setDialogOpen(false);
        fetchConfigs();
      } else {
        toast.error(json.error || "Failed to save");
      }
    } catch {
      toast.error("Failed to save syslog config");
    } finally {
      setSaving(false);
    }
  };

  const deleteConfig = async (id: string) => {
    try {
      const res = await fetch(`/api/syslog/configs/${id}?XTransformPort=3005`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        toast.success("Syslog server deleted");
        fetchConfigs();
      } else {
        toast.error(json.error || "Failed to delete");
      }
    } catch { toast.error("Failed to delete"); }
  };

  const testConnection = async (id: string) => {
    setTesting(id);
    try {
      const res = await fetch(`/api/syslog/test/${id}?XTransformPort=3005`, { method: "POST" });
      const json = await res.json();
      if (json.success) {
        toast.success(`Connection to ${json.host}:${json.port} (${json.protocol}) successful`);
      } else {
        toast.error(`Connection failed: ${json.error || "Unknown error"}`);
      }
      fetchConfigs();
    } catch { toast.error("Test failed"); }
    finally { setTesting(null); }
  };

  const toggleTag = (tag: string) => {
    setForm(f => ({
      ...f,
      tags: f.tags.includes(tag) ? f.tags.filter(t => t !== tag) : [...f.tags, tag],
    }));
  };

  const getStatusInfo = (cfg: SyslogConfig) => {
    if (!cfg.enabled) return { label: "Disabled", color: "bg-gray-400", icon: XCircle };
    if (cfg.errorCount > 0) return { label: "Error", color: "bg-amber-500", icon: AlertTriangle };
    if (cfg.lastSentAt) return { label: "Connected", color: "bg-emerald-500", icon: CheckCircle };
    return { label: "Disconnected", color: "bg-red-500", icon: XCircle };
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Settings className="h-5 w-5" /> Syslog Configuration
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Configure remote syslog servers for forwarding NAT and firewall logs
            </CardDescription>
          </div>
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={openNewDialog}>
            <Plus className="h-3.5 w-3.5" /> Add Syslog Server
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : configs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Server className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No syslog servers configured</p>
            <Button variant="outline" size="sm" className="mt-3 gap-1.5 text-xs" onClick={openNewDialog}>
              <Plus className="h-3.5 w-3.5" /> Add First Server
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {configs.map(cfg => {
              const status = getStatusInfo(cfg);
              const StatusIcon = status.icon;
              let tags: string[] = [];
              try { tags = JSON.parse(cfg.tags || "[]"); } catch {}
              return (
                <div key={cfg.id} className="border rounded-lg p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className={cn("h-2.5 w-2.5 rounded-full mt-1.5 shrink-0", status.color)} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-sm">{cfg.name}</h4>
                          <Badge variant="outline" className="text-[10px]">{cfg.protocol}</Badge>
                          <Badge variant={cfg.enabled ? "default" : "secondary"} className="text-[10px]">
                            {cfg.enabled ? "Enabled" : "Disabled"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 font-mono">
                          {cfg.host}:{cfg.port} · {cfg.format} · {cfg.facility}.{cfg.severity}
                        </p>
                        {tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {tags.map(t => (
                              <Badge key={t} variant="secondary" className="text-[9px] px-1.5 py-0">{t}</Badge>
                            ))}
                          </div>
                        )}
                        {cfg.lastError && (
                          <p className="text-[10px] text-amber-600 mt-1 truncate max-w-md">{cfg.lastError}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        variant="outline" size="sm" className="h-7 gap-1 text-[10px]"
                        onClick={() => testConnection(cfg.id)} disabled={testing === cfg.id}
                      >
                        {testing === cfg.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Wifi className="h-3 w-3" />}
                        Test
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 gap-1 text-[10px]" onClick={() => openEditDialog(cfg)}>
                        <Settings className="h-3 w-3" /> Edit
                      </Button>
                      <Button
                        variant="ghost" size="sm" className="h-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => deleteConfig(cfg.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Syslog Server" : "Add Syslog Server"}</DialogTitle>
            <DialogDescription>Configure a remote syslog server to forward NAT and firewall logs</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-xs">Name *</Label>
                <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g., Central SIEM" className="h-8 text-sm mt-1" />
              </div>
              <div>
                <Label className="text-xs">Protocol</Label>
                <Select value={form.protocol} onValueChange={(v) => setForm(f => ({ ...f, protocol: v }))}>
                  <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{SYSLOG_PROTOCOLS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Format</Label>
                <Select value={form.format} onValueChange={(v) => setForm(f => ({ ...f, format: v }))}>
                  <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{SYSLOG_FORMATS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Host *</Label>
                <Input value={form.host} onChange={(e) => setForm(f => ({ ...f, host: e.target.value }))} placeholder="syslog.example.com" className="h-8 text-sm mt-1" />
              </div>
              <div>
                <Label className="text-xs">Port</Label>
                <Input type="number" value={form.port} onChange={(e) => setForm(f => ({ ...f, port: parseInt(e.target.value) || 514 }))} className="h-8 text-sm mt-1" />
              </div>
              <div>
                <Label className="text-xs">Facility</Label>
                <Select value={form.facility} onValueChange={(v) => setForm(f => ({ ...f, facility: v }))}>
                  <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{SYSLOG_FACILITIES.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Severity</Label>
                <Select value={form.severity} onValueChange={(v) => setForm(f => ({ ...f, severity: v }))}>
                  <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{SYSLOG_SEVERITIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {/* Tags */}
            <div>
              <Label className="text-xs">Tags (Log Types)</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {SYSLOG_TAGS.map(tag => (
                  <Badge
                    key={tag}
                    variant={form.tags.includes(tag) ? "default" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => toggleTag(tag)}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>

            {/* TLS config */}
            {form.protocol === "TLS" && (
              <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
                <Label className="text-xs font-medium">TLS Configuration</Label>
                <div>
                  <Label className="text-[10px] text-muted-foreground">CA Certificate</Label>
                  <Input value={form.tlsCaCert} onChange={(e) => setForm(f => ({ ...f, tlsCaCert: e.target.value }))} placeholder="Path to CA cert" className="h-7 text-xs mt-0.5" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Client Certificate</Label>
                  <Input value={form.tlsClientCert} onChange={(e) => setForm(f => ({ ...f, tlsClientCert: e.target.value }))} placeholder="Path to client cert" className="h-7 text-xs mt-0.5" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Client Key</Label>
                  <Input value={form.tlsClientKey} onChange={(e) => setForm(f => ({ ...f, tlsClientKey: e.target.value }))} placeholder="Path to client key" className="h-7 text-xs mt-0.5" />
                </div>
              </div>
            )}

            {/* Enable toggle */}
            <div className="flex items-center justify-between">
              <Label className="text-sm">Enable forwarding</Label>
              <Switch checked={form.enabled} onCheckedChange={(v) => setForm(f => ({ ...f, enabled: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={saveConfig} disabled={saving}>
              {saving && <RefreshCw className="h-3 w-3 mr-1 animate-spin" />}
              {editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
