"use client";

import * as React from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowDownUp, CalendarClock, ChevronLeft, ChevronRight,
  Clock, Download, History, Power, RefreshCw, Search, Upload, Wifi, WifiOff,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

// ============================================================
// Types — mirror /api/sessions response (BigInt already stringified)
// ============================================================
type SessionRow = {
  radacctid: string;
  acctsessionid: string;
  username: string | null;
  groupname: string | null;
  nasipaddress: string;
  nasportid: string | null;
  framedipaddress: string;
  callingstationid: string | null;
  acctstarttime: string | null;
  acctupdatetime: string | null;
  acctstoptime: string | null;
  acctsessiontime: number | null;
  acctinputoctets: number;
  acctoutputoctets: number;
  acctterminatecause: string | null;
  status: "active" | "stopped";
  liveDurationSec: number | null;
};

type SessionStats = {
  activeCount: number;
  historyCount: number;
  todayCount: number;
  totalTrafficBytesToday: number;
};

type NasEntry = { ip: string; shortname: string | null };

type SessionsResponse = {
  sessions: SessionRow[];
  total: number;
  page: number;
  pageSize: number;
  stats: SessionStats;
  nasList: NasEntry[];
};

const PAGE_SIZE = 50;

const CAUSE_STYLES: Record<string, string> = {
  "Admin-Reset": "border-red-500/30 bg-red-500/5 text-red-600",
  "User-Request": "border-emerald-500/30 bg-emerald-500/5 text-emerald-600",
  "Idle-Timeout": "border-amber-500/30 bg-amber-500/5 text-amber-600",
  "Session-Timeout": "border-amber-500/30 bg-amber-500/5 text-amber-600",
  "Lost-Service": "border-muted text-muted-foreground",
  "NAS-Reboot": "border-violet-500/30 bg-violet-500/5 text-violet-600",
  "NAS-Request": "border-violet-500/30 bg-violet-500/5 text-violet-600",
};

function fmtBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const str = i === 0 || v >= 100 ? Math.round(v).toString() : v >= 10 ? v.toFixed(1) : v.toFixed(2);
  return `${str} ${units[i]}`;
}

function fmtDuration(totalSecs: number): string {
  if (!totalSecs || totalSecs <= 0) return "0s";
  const d = Math.floor(totalSecs / 86400);
  const h = Math.floor((totalSecs % 86400) / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = Math.floor(totalSecs % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtRelative(iso: string, nowMs: number): string {
  const diff = Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function fmtClock(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export function SessionsPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = React.useState<"active" | "history">("active");
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [nas, setNas] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [now, setNow] = React.useState(() => Date.now());
  const [disconnectTarget, setDisconnectTarget] = React.useState<SessionRow | null>(null);

  // Debounce the search box so typing doesn't hammer the API
  React.useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // 1s clock for live-ticking durations on active sessions
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const listQuery = useQuery<SessionsResponse>({
    queryKey: ["sessions", "list", tab, search, nas, page],
    queryFn: async () => {
      const params = new URLSearchParams({ status: tab, limit: String(PAGE_SIZE), page: String(page) });
      if (search) params.set("search", search);
      if (nas) params.set("nas", nas);
      const res = await fetch(`/api/sessions?${params}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `Failed to load sessions (${res.status})`);
      return body as SessionsResponse;
    },
    refetchInterval: 15000,
    placeholderData: keepPreviousData,
  });

  // Stats are independent of tab/search/page — light query, same 15s cadence
  const statsQuery = useQuery<{ stats: SessionStats }>({
    queryKey: ["sessions", "stats"],
    queryFn: async () => {
      const res = await fetch("/api/sessions?status=all&limit=1");
      if (!res.ok) throw new Error("Failed to load session stats");
      return res.json();
    },
    refetchInterval: 15000,
  });

  const disconnect = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/sessions/${id}/disconnect`, { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `Disconnect failed (${res.status})`);
      return body as { success: boolean; source: "session-engine" | "database"; session: SessionRow };
    },
    onSuccess: (data) => {
      toast({
        title: "Session disconnected",
        description:
          data.source === "session-engine"
            ? "Disconnect-Request sent via session engine — awaiting Accounting-Stop from the NAS."
            : "Marked stopped in RADIUS DB (acctstoptime set, cause Admin-Reset).",
      });
      setDisconnectTarget(null);
      qc.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (err: Error) => {
      toast({ title: "Disconnect failed", description: err.message, variant: "destructive" });
    },
  });

  const sessions = listQuery.data?.sessions ?? [];
  const total = listQuery.data?.total ?? 0;
  const pageSize = listQuery.data?.pageSize ?? PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const stats = statsQuery.data?.stats;
  const nasList = listQuery.data?.nasList ?? [];
  const isLoading = listQuery.isLoading;
  const isError = listQuery.isError;

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["sessions"] });
  };

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 cryptsk-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">RADIUS Sessions</h1>
          <p className="text-sm text-muted-foreground">
            Live accounting from radacct · auto-refresh 15s
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={refreshAll}>
          <RefreshCw className="size-4" /> Refresh
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="card-lift cryptsk-card-load">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Active Sessions</CardTitle>
            <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10">
              <Wifi className="size-4 text-emerald-500" />
            </div>
          </CardHeader>
          <CardContent>
            {statsQuery.isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold tabular-nums">{stats?.activeCount ?? "—"}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">online right now</p>
          </CardContent>
        </Card>

        <Card className="card-lift cryptsk-card-load" style={{ animationDelay: "50ms" }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Sessions Today</CardTitle>
            <div className="flex size-8 items-center justify-center rounded-lg bg-violet-500/10">
              <CalendarClock className="size-4 text-violet-500" />
            </div>
          </CardHeader>
          <CardContent>
            {statsQuery.isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold tabular-nums">{stats?.todayCount ?? "—"}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">started since 00:00 UTC</p>
          </CardContent>
        </Card>

        <Card className="card-lift cryptsk-card-load" style={{ animationDelay: "100ms" }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Traffic Today</CardTitle>
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
              <ArrowDownUp className="size-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            {statsQuery.isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold tabular-nums">{fmtBytes(stats?.totalTrafficBytesToday ?? 0)}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">upload + download today</p>
          </CardContent>
        </Card>

        <Card className="card-lift cryptsk-card-load" style={{ animationDelay: "150ms" }}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total Historical</CardTitle>
            <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10">
              <History className="size-4 text-amber-500" />
            </div>
          </CardHeader>
          <CardContent>
            {statsQuery.isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold tabular-nums">{stats?.historyCount ?? "—"}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">completed sessions</p>
          </CardContent>
        </Card>
      </div>

      {/* Sessions table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Tabs value={tab} onValueChange={(v) => { setTab(v as "active" | "history"); setPage(1); }}>
              <TabsList>
                <TabsTrigger value="active" className="gap-2">
                  <span className="size-1.5 rounded-full bg-emerald-500 cryptsk-pulse-dot" />
                  Active
                </TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by user, IP, MAC…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="h-9 w-full pl-8 text-sm sm:w-64"
                />
              </div>
              <Select
                value={nas || "all"}
                onValueChange={(v) => { setNas(v === "all" ? "" : v); setPage(1); }}
              >
                <SelectTrigger className="h-9 w-full text-sm sm:w-52">
                  <SelectValue placeholder="All NAS devices" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All NAS devices</SelectItem>
                  {nasList.map((n) => (
                    <SelectItem key={n.ip} value={n.ip}>
                      {n.shortname ? `${n.shortname} (${n.ip})` : n.ip}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isError ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <AlertTriangle className="size-8 text-red-500" />
              <p className="text-sm text-muted-foreground">
                {listQuery.error instanceof Error ? listQuery.error.message : "Failed to load sessions"}
              </p>
              <Button variant="outline" size="sm" onClick={() => listQuery.refetch()}>
                <RefreshCw className="size-4" /> Try again
              </Button>
            </div>
          ) : isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="size-6 rounded-full" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : sessions.length === 0 ? (
            tab === "active" ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <WifiOff className="size-8 text-muted-foreground/50" />
                <p className="text-sm font-medium">No active sessions</p>
                <p className="max-w-sm text-xs text-muted-foreground">
                  Sessions appear here when RADIUS accounting starts streaming from your NAS devices.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <History className="size-8 text-muted-foreground/50" />
                <p className="text-sm font-medium">No historical sessions</p>
                <p className="max-w-sm text-xs text-muted-foreground">
                  Completed RADIUS accounting sessions will appear here.
                </p>
              </div>
            )
          ) : (
            <div className="max-h-96 overflow-y-auto overflow-x-auto cryptsk-scrollbar">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  {tab === "active" ? (
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Client IP</TableHead>
                      <TableHead>NAS</TableHead>
                      <TableHead className="hidden md:table-cell">MAC</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Down</TableHead>
                      <TableHead>Up</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  ) : (
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Client IP</TableHead>
                      <TableHead>NAS</TableHead>
                      <TableHead className="hidden md:table-cell">MAC</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Stopped</TableHead>
                      <TableHead>Cause</TableHead>
                      <TableHead>Traffic ↓/↑</TableHead>
                    </TableRow>
                  )}
                </TableHeader>
                <TableBody>
                  {tab === "active"
                    ? sessions.map((s) => {
                        const liveSecs = s.acctstarttime
                          ? Math.max(0, Math.floor((now - new Date(s.acctstarttime).getTime()) / 1000))
                          : (s.acctsessiontime ?? 0);
                        return (
                          <TableRow key={s.radacctid} className="hover:bg-muted/50">
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Avatar className="size-6">
                                  <AvatarFallback className="bg-primary/10 text-primary text-[9px] font-bold">
                                    {(s.username || "?").charAt(0).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-mono">{s.username || "—"}</span>
                                  <span className="size-1.5 rounded-full bg-emerald-500 cryptsk-pulse-dot" aria-label="active" />
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs font-mono">{s.framedipaddress || "—"}</TableCell>
                            <TableCell className="text-xs font-mono text-muted-foreground">{s.nasipaddress}</TableCell>
                            <TableCell className="hidden md:table-cell text-xs font-mono text-muted-foreground">
                              {s.callingstationid || "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap" suppressHydrationWarning>
                              {s.acctstarttime ? fmtRelative(s.acctstarttime, now) : "—"}
                            </TableCell>
                            <TableCell className="text-xs tabular-nums whitespace-nowrap" suppressHydrationWarning>
                              <Clock className="inline size-3 mr-1 text-muted-foreground" />
                              {fmtDuration(liveSecs)}
                            </TableCell>
                            <TableCell className="text-xs tabular-nums whitespace-nowrap">
                              <Download className="inline size-3 mr-1 text-emerald-500" />
                              {fmtBytes(s.acctoutputoctets)}
                            </TableCell>
                            <TableCell className="text-xs tabular-nums whitespace-nowrap">
                              <Upload className="inline size-3 mr-1 text-amber-500" />
                              {fmtBytes(s.acctinputoctets)}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1.5 border-red-500/30 px-2 text-xs text-red-600 hover:bg-red-500/10 hover:text-red-700"
                                disabled={disconnect.isPending}
                                onClick={() => setDisconnectTarget(s)}
                              >
                                <Power className="size-3.5" />
                                <span className="hidden lg:inline">Disconnect</span>
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    : sessions.map((s) => (
                        <TableRow key={s.radacctid} className="hover:bg-muted/50">
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Avatar className="size-6">
                                <AvatarFallback className="bg-muted text-muted-foreground text-[9px] font-bold">
                                  {(s.username || "?").charAt(0).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm font-mono">{s.username || "—"}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs font-mono">{s.framedipaddress || "—"}</TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">{s.nasipaddress}</TableCell>
                          <TableCell className="hidden md:table-cell text-xs font-mono text-muted-foreground">
                            {s.callingstationid || "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap" suppressHydrationWarning>
                            {s.acctstarttime ? fmtClock(s.acctstarttime) : "—"}
                          </TableCell>
                          <TableCell className="text-xs tabular-nums whitespace-nowrap">
                            <Clock className="inline size-3 mr-1 text-muted-foreground" />
                            {fmtDuration(s.acctsessiontime ?? 0)}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap" suppressHydrationWarning>
                            {s.acctstoptime ? fmtClock(s.acctstoptime) : "—"}
                          </TableCell>
                          <TableCell>
                            {s.acctterminatecause ? (
                              <Badge
                                variant="outline"
                                className={`text-[9px] whitespace-nowrap ${CAUSE_STYLES[s.acctterminatecause] || "border-muted text-muted-foreground"}`}
                              >
                                {s.acctterminatecause}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs tabular-nums whitespace-nowrap">
                            <Download className="inline size-3 mr-1 text-emerald-500" />
                            {fmtBytes(s.acctoutputoctets)}
                            <span className="mx-1 text-muted-foreground">/</span>
                            <Upload className="inline size-3 mr-1 text-amber-500" />
                            {fmtBytes(s.acctinputoctets)}
                          </TableCell>
                        </TableRow>
                      ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {!isLoading && !isError && total > 0 && (
            <div className="flex items-center justify-between gap-4 border-t px-4 py-3">
              <p className="text-xs text-muted-foreground">
                Showing{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}
                </span>{" "}
                of <span className="font-medium text-foreground tabular-nums">{total}</span> sessions
              </p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground tabular-nums">
                  Page {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  aria-label="Next page"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Disconnect confirmation */}
      <AlertDialog open={!!disconnectTarget} onOpenChange={(open) => { if (!open) setDisconnectTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect this session?</AlertDialogTitle>
            <AlertDialogDescription>
              {disconnectTarget && (
                <>
                  User <span className="font-mono font-medium text-foreground">{disconnectTarget.username || "unknown"}</span>{" "}
                  ({disconnectTarget.framedipaddress || "no IP"}) will be disconnected from{" "}
                  <span className="font-mono font-medium text-foreground">{disconnectTarget.nasipaddress}</span>.
                  {disconnectTarget.status === "active" &&
                    " An administrator disconnect will be attempted; the session will be marked stopped with cause Admin-Reset."}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnect.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={disconnect.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (disconnectTarget) disconnect.mutate(disconnectTarget.radacctid);
              }}
            >
              {disconnect.isPending ? "Disconnecting…" : "Disconnect"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
