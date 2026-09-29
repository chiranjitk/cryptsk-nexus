"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/utils";
import {
  Zap, Search, RefreshCw, Filter, CheckCircle2, XCircle, Clock,
  ArrowRight, User, Calendar, ArrowUpDown,
} from "lucide-react";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

// ─── Types ────────────────────────────────────────────────────────
interface CoaEvent {
  id: string;
  timestamp: string;
  subscriberId: string;
  subscriberName: string;
  subscriberCode: string;
  coaType: "PLAN_CHANGE" | "BANDWIDTH_CHANGE" | "SESSION_DISCONNECT" | "ATTRIBUTE_UPDATE" | "SUSPEND" | "RESUME";
  coaStatus: "SUCCESS" | "FAILED" | "PENDING" | "TIMEOUT";
  oldPlan: string | null;
  newPlan: string | null;
  bandwidthPercent: number | null;
  triggeredBy: string;
  errorMessage: string | null;
}

interface CoaStats {
  total: number;
  success: number;
  failed: number;
  pending: number;
}

interface CoaFilters {
  subscriberId: string;
  coaType: string;
  coaStatus: string;
  startDate: string;
  endDate: string;
}

const PAGE_SIZE = 15;

// ─── Component ────────────────────────────────────────────────────
export default function CoaEventsPage() {
  const [events, setEvents] = useState<CoaEvent[]>([]);
  const [stats, setStats] = useState<CoaStats>({ total: 0, success: 0, failed: 0, pending: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState<CoaFilters>({
    subscriberId: "",
    coaType: "",
    coaStatus: "",
    startDate: "",
    endDate: "",
  });
  const [appliedFilters, setAppliedFilters] = useState<CoaFilters>({ ...filters });

  // ─── Data Fetching ───
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (appliedFilters.subscriberId) params.set("subscriberId", appliedFilters.subscriberId);
      if (appliedFilters.coaType) params.set("coaType", appliedFilters.coaType);
      if (appliedFilters.coaStatus) params.set("coaStatus", appliedFilters.coaStatus);
      if (appliedFilters.startDate) params.set("startDate", appliedFilters.startDate);
      if (appliedFilters.endDate) params.set("endDate", appliedFilters.endDate);
      params.set("page", page.toString());
      params.set("limit", PAGE_SIZE.toString());

      const data = await apiFetch<{ events: CoaEvent[]; stats: CoaStats; totalPages: number }>(
        `/api/coa-events?${params.toString()}`
      );
      setEvents(data.events || []);
      setStats(data.stats || { total: 0, success: 0, failed: 0, pending: 0 });
      setTotalPages(data.totalPages || 1);
    } catch {
      toast.error("Failed to load CoA events");
    } finally {
      setLoading(false);
    }
  }, [appliedFilters, page]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // ─── Filter handlers ───
  function applyFilters() {
    setAppliedFilters({ ...filters });
    setPage(1);
  }

  function clearFilters() {
    setFilters({ subscriberId: "", coaType: "", coaStatus: "", startDate: "", endDate: "" });
    setAppliedFilters({ subscriberId: "", coaType: "", coaStatus: "", startDate: "", endDate: "" });
    setPage(1);
  }

  // ─── Render helpers ───
  function statusBadge(status: string) {
    const map: Record<string, { label: string; cls: string }> = {
      SUCCESS: { label: "Success", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" },
      FAILED: { label: "Failed", cls: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300" },
      PENDING: { label: "Pending", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" },
      TIMEOUT: { label: "Timeout", cls: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300" },
    };
    const entry = map[status] || { label: status, cls: "" };
    return <Badge className={`${entry.cls} text-[10px]`}>{entry.label}</Badge>;
  }

  function typeBadge(type: string) {
    const map: Record<string, { label: string; cls: string }> = {
      PLAN_CHANGE: { label: "Plan Change", cls: "bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300" },
      BANDWIDTH_CHANGE: { label: "BW Change", cls: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300" },
      SESSION_DISCONNECT: { label: "Disconnect", cls: "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300" },
      ATTRIBUTE_UPDATE: { label: "Attr Update", cls: "bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300" },
      SUSPEND: { label: "Suspend", cls: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300" },
      RESUME: { label: "Resume", cls: "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300" },
    };
    const entry = map[type] || { label: type, cls: "" };
    return <Badge className={`${entry.cls} text-[10px]`}>{entry.label}</Badge>;
  }

  function formatTimestamp(ts: string) {
    const d = new Date(ts);
    return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  // ─── Loading ───
  if (loading && page === 1) {
    return (
      <div className="space-y-6">
        <Skeleton className="skeleton-wave h-7 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        <Skeleton className="skeleton-wave h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <PageHeader
        title="Change of Authorization (CoA)"
        description="Monitor and manage RADIUS Change of Authorization events for subscriber plan changes, disconnects, and attribute updates."
        icon={Zap}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={fetchEvents} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />Refresh
            </Button>
          </div>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-0 rounded-xl ring-1 ring-slate-200/60 dark:ring-slate-800/40 bg-gradient-to-br from-slate-50 to-gray-50 dark:from-slate-950/50 dark:to-gray-950/30 shadow-sm hover:scale-[1.02] transition-all duration-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-slate-500 to-gray-600 shadow-sm shadow-slate-500/25"><Zap className="h-4 w-4 text-white" /></div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-foreground">{stats.total}</p>
                <p className="text-xs text-muted-foreground font-medium">Total Events</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 rounded-xl ring-1 ring-green-200/60 dark:ring-green-800/40 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/50 dark:to-emerald-950/30 shadow-sm hover:scale-[1.02] transition-all duration-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-sm shadow-green-500/25"><CheckCircle2 className="h-4 w-4 text-white" /></div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-green-700 dark:text-green-300">{stats.success}</p>
                <p className="text-xs text-muted-foreground font-medium">Successful</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 rounded-xl ring-1 ring-red-200/60 dark:ring-red-800/40 bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/50 dark:to-rose-950/30 shadow-sm hover:scale-[1.02] transition-all duration-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 shadow-sm shadow-red-500/25"><XCircle className="h-4 w-4 text-white" /></div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-red-700 dark:text-red-300">{stats.failed}</p>
                <p className="text-xs text-muted-foreground font-medium">Failed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 rounded-xl ring-1 ring-amber-200/60 dark:ring-amber-800/40 bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/50 dark:to-yellow-950/30 shadow-sm hover:scale-[1.02] transition-all duration-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-600 shadow-sm shadow-amber-500/25"><Clock className="h-4 w-4 text-white" /></div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-300">{stats.pending}</p>
                <p className="text-xs text-muted-foreground font-medium">Pending</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Subscriber ID</Label>
              <Input
                placeholder="Search subscriber..."
                value={filters.subscriberId}
                onChange={(e) => setFilters({ ...filters, subscriberId: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">CoA Type</Label>
              <Select value={filters.coaType || "__all__"} onValueChange={(val) => setFilters({ ...filters, coaType: val === "__all__" ? "" : val })}>
                <SelectTrigger><SelectValue placeholder="All types" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Types</SelectItem>
                  <SelectItem value="PLAN_CHANGE">Plan Change</SelectItem>
                  <SelectItem value="BANDWIDTH_CHANGE">Bandwidth Change</SelectItem>
                  <SelectItem value="SESSION_DISCONNECT">Session Disconnect</SelectItem>
                  <SelectItem value="ATTRIBUTE_UPDATE">Attribute Update</SelectItem>
                  <SelectItem value="SUSPEND">Suspend</SelectItem>
                  <SelectItem value="RESUME">Resume</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={filters.coaStatus || "__all__"} onValueChange={(val) => setFilters({ ...filters, coaStatus: val === "__all__" ? "" : val })}>
                <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Statuses</SelectItem>
                  <SelectItem value="SUCCESS">Success</SelectItem>
                  <SelectItem value="FAILED">Failed</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="TIMEOUT">Timeout</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Start Date</Label>
              <Input type="date" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">End Date</Label>
              <Input type="date" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} />
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={applyFilters}>Apply Filters</Button>
            <Button size="sm" variant="outline" onClick={clearFilters}>Clear</Button>
            {(appliedFilters.subscriberId || appliedFilters.coaType || appliedFilters.coaStatus || appliedFilters.startDate || appliedFilters.endDate) && (
              <Badge variant="secondary" className="text-[10px]">Filters active</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Events Table */}
      <Card className="border shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Timestamp</TableHead>
                  <TableHead className="text-xs">Subscriber</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">Type</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs hidden lg:table-cell">Plan Change</TableHead>
                  <TableHead className="text-xs hidden lg:table-cell">BW %</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">Triggered By</TableHead>
                  <TableHead className="text-xs hidden xl:table-cell">Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      No CoA events found. Events will appear here when subscriber plans or attributes are changed.
                    </TableCell>
                  </TableRow>
                ) : (
                  events.map((event) => (
                    <TableRow key={event.id} className="hover:bg-muted/50 transition-colors duration-150">
                      <TableCell className="text-xs whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          {formatTimestamp(event.timestamp)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs font-medium">{event.subscriberName}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{event.subscriberCode}</div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{typeBadge(event.coaType)}</TableCell>
                      <TableCell>{statusBadge(event.coaStatus)}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {(event.oldPlan || event.newPlan) ? (
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-muted-foreground line-through">{event.oldPlan || "—"}</span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            <span className="font-medium">{event.newPlan || "—"}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {event.bandwidthPercent !== null ? (
                          <Badge variant="outline" className="text-[10px]">
                            {event.bandwidthPercent}%
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs hidden md:table-cell">
                        <div className="flex items-center gap-1.5">
                          <User className="h-3 w-3 text-muted-foreground" />
                          {event.triggeredBy}
                        </div>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        {event.errorMessage ? (
                          <span className="text-xs text-red-600 dark:text-red-400 max-w-[200px] truncate block">{event.errorMessage}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-xs text-muted-foreground">
                Page {page} of {totalPages} ({stats.total} total events)
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
                <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
