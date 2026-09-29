"use client";

import { useState, useEffect, useMemo } from "react";
import {
  History, Search, X, ChevronDown, ChevronRight, RotateCcw,
  ArrowRight, Clock, User, Tag, Layers, AlertTriangle, Loader2,
} from "lucide-react";
import PageHeader from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────
interface ActionHistoryEntry {
  id: string;
  timestamp: string;
  subscriberId: string;
  subscriberCode: string;
  subscriberName: string;
  actionType: "CREATE" | "UPDATE" | "DELETE" | "SUSPEND" | "ACTIVATE" | "GRANT" | "REVOKE" | "MIGRATE" | "RESET";
  entityType: string;
  entityId: string;
  oldValues: Record<string, string>;
  newValues: Record<string, string>;
  performedBy: string;
  reversible: boolean;
  reversedBy: string | null;
  reversedAt: string | null;
}

const ACTION_TYPES = ["CREATE", "UPDATE", "DELETE", "SUSPEND", "ACTIVATE", "GRANT", "REVOKE", "MIGRATE", "RESET"];

const FALLBACK_DATA: ActionHistoryEntry[] = [
  { id: "ah-001", timestamp: "2025-01-15T14:32:00Z", subscriberId: "sub-104", subscriberCode: "CRY-00104", subscriberName: "Arun Mehta", actionType: "UPDATE", entityType: "Plan", entityId: "plan-5", oldValues: { plan: "Basic 50 Mbps", price: "₹499" }, newValues: { plan: "Pro 100 Mbps", price: "₹999" }, performedBy: "admin", reversible: true, reversedBy: null, reversedAt: null },
  { id: "ah-002", timestamp: "2025-01-15T13:15:00Z", subscriberId: "sub-218", subscriberCode: "CRY-00218", subscriberName: "Priya Sharma", actionType: "SUSPEND", entityType: "Status", entityId: "sub-218", oldValues: { status: "ACTIVE" }, newValues: { status: "SUSPENDED", reason: "Non-payment for 30 days" }, performedBy: "billing-ops", reversible: true, reversedBy: null, reversedAt: null },
  { id: "ah-003", timestamp: "2025-01-15T11:00:00Z", subscriberId: "sub-156", subscriberCode: "CRY-00156", subscriberName: "Rahul Verma", actionType: "ACTIVATE", entityType: "Status", entityId: "sub-156", oldValues: { status: "SUSPENDED" }, newValues: { status: "ACTIVE" }, performedBy: "admin", reversible: true, reversedBy: null, reversedAt: null },
  { id: "ah-004", timestamp: "2025-01-14T16:45:00Z", subscriberId: "sub-301", subscriberCode: "CRY-00301", subscriberName: "Sunita Devi", actionType: "UPDATE", entityType: "IP Address", entityId: "sub-301", oldValues: { ip: "10.0.5.42", type: "DHCP" }, newValues: { ip: "10.0.5.89", type: "DHCP" }, performedBy: "noc-team", reversible: true, reversedBy: null, reversedAt: null },
  { id: "ah-005", timestamp: "2025-01-14T10:20:00Z", subscriberId: "sub-89", subscriberCode: "CRY-00089", subscriberName: "Kiran Joshi", actionType: "MIGRATE", entityType: "RadiusGroup", entityId: "sub-89", oldValues: { group: "basic-plan", speed: "50/50 Mbps" }, newValues: { group: "premium-plan", speed: "100/100 Mbps" }, performedBy: "admin", reversible: true, reversedBy: null, reversedAt: null },
  { id: "ah-006", timestamp: "2025-01-14T09:00:00Z", subscriberId: "sub-175", subscriberCode: "CRY-00175", subscriberName: "Deepak Singh", actionType: "GRANT", entityType: "GracePeriod", entityId: "gp-006", oldValues: { status: "Scheduled for suspension" }, newValues: { status: "Grace period active", days: "7", reason: "Payment deferred" }, performedBy: "admin", reversible: false, reversedBy: null, reversedAt: null },
  { id: "ah-007", timestamp: "2025-01-13T15:30:00Z", subscriberId: "sub-412", subscriberCode: "CRY-00412", subscriberName: "Meena Patel", actionType: "RESET", entityType: "BandwidthQuota", entityId: "sub-412", oldValues: { used: "45.2 GB / 50 GB" }, newValues: { used: "0 GB / 50 GB", resetType: "Manual" }, performedBy: "support-lead", reversible: false, reversedBy: null, reversedAt: null },
  { id: "ah-008", timestamp: "2025-01-13T12:00:00Z", subscriberId: "sub-100", subscriberCode: "CRY-00100", subscriberName: "Vikram Rao", actionType: "REVOKE", entityType: "TopUp", entityId: "tu-023", oldValues: { topUp: "50 GB Data Boost", status: "Active" }, newValues: { topUp: "50 GB Data Boost", status: "Revoked" }, performedBy: "billing-ops", reversible: true, reversedBy: null, reversedAt: null },
  { id: "ah-009", timestamp: "2025-01-12T17:00:00Z", subscriberId: "sub-104", subscriberCode: "CRY-00104", subscriberName: "Arun Mehta", actionType: "CREATE", entityType: "Subscriber", entityId: "sub-104", oldValues: {}, newValues: { name: "Arun Mehta", plan: "Basic 50 Mbps", status: "ACTIVE" }, performedBy: "admin", reversible: false, reversedBy: null, reversedAt: null },
  { id: "ah-010", timestamp: "2025-01-10T08:30:00Z", subscriberId: "sub-200", subscriberCode: "CRY-00200", subscriberName: "Neha Kapoor", actionType: "DELETE", entityType: "TopUp", entityId: "tu-018", oldValues: { topUp: "Speed Boost 200Mbps", status: "Expired" }, newValues: {}, performedBy: "system", reversible: false, reversedBy: null, reversedAt: null },
];

const PAGE_SIZE = 8;

// ─── Helpers ────────────────────────────────────────────────────
function getActionTypeBadge(actionType: string) {
  const styles: Record<string, string> = {
    CREATE: "bg-green-600 hover:bg-green-700 text-white border-green-600",
    UPDATE: "bg-amber-600 hover:bg-amber-700 text-white border-amber-600",
    DELETE: "bg-red-600 hover:bg-red-700 text-white border-red-600",
    SUSPEND: "bg-orange-600 hover:bg-orange-700 text-white border-orange-600",
    ACTIVATE: "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600",
    GRANT: "bg-teal-600 hover:bg-teal-700 text-white border-teal-600",
    REVOKE: "bg-rose-600 hover:bg-rose-700 text-white border-rose-600",
    MIGRATE: "bg-cyan-600 hover:bg-cyan-700 text-white border-cyan-600",
    RESET: "bg-slate-600 hover:bg-slate-700 text-white border-slate-600",
  };
  return <Badge className={`text-[10px] ${styles[actionType] || "bg-gray-500 text-white"}`}>{actionType}</Badge>;
}

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── Component ────────────────────────────────────────────────────
export default function ActionHistoryPage() {
  const [search, setSearch] = useState("");
  const [actionTypeFilter, setActionTypeFilter] = useState<string>("ALL");
  const [subscriberIdFilter, setSubscriberIdFilter] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<ActionHistoryEntry[]>([]);

  // Expandable rows
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Reverse dialog
  const [reverseOpen, setReverseOpen] = useState(false);
  const [reverseId, setReverseId] = useState<string | null>(null);

  // ─── Data Fetching ─────────────────────────────────────────────
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (actionTypeFilter !== "ALL") params.set("actionType", actionTypeFilter);
        if (subscriberIdFilter) params.set("subscriberId", subscriberIdFilter);
        if (startDate) params.set("startDate", startDate);
        if (endDate) params.set("endDate", endDate);
        const qs = params.toString();
        const res = await fetch(`/api/action-history${qs ? `?${qs}` : ""}`);
        if (!res.ok) throw new Error("Failed to fetch action history");
        const data = await res.json();
        setEntries(Array.isArray(data) ? data : data.data ?? data.actions ?? FALLBACK_DATA);
      } catch (err) {
        // logger
        setError(err instanceof Error ? err.message : "Unknown error");
        setEntries(FALLBACK_DATA);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [actionTypeFilter, subscriberIdFilter, startDate, endDate]);

  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Unique subscriber IDs for dropdown
  const uniqueSubscriberIds = useMemo(() => {
    const ids = new Map<string, { code: string; name: string }>();
    entries.forEach((e) => {
      if (!ids.has(e.subscriberId)) ids.set(e.subscriberId, { code: e.subscriberCode, name: e.subscriberName });
    });
    return Array.from(ids.entries()).map(([id, data]) => ({ id, ...data }));
  }, [entries]);

  // Filter & Paginate
  const filtered = useMemo(() => {
    return entries.filter((entry) => {
      if (actionTypeFilter !== "ALL" && entry.actionType !== actionTypeFilter) return false;
      if (subscriberIdFilter && entry.subscriberId !== subscriberIdFilter) return false;
      if (startDate) {
        const entryDate = new Date(entry.timestamp);
        if (entryDate < new Date(startDate)) return false;
      }
      if (endDate) {
        const entryDate = new Date(entry.timestamp);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (entryDate > end) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        return entry.subscriberName.toLowerCase().includes(q) || entry.subscriberCode.toLowerCase().includes(q) || entry.performedBy.toLowerCase().includes(q) || entry.entityType.toLowerCase().includes(q);
      }
      return true;
    });
  }, [entries, search, actionTypeFilter, subscriberIdFilter, startDate, endDate]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function handleReverse() {
    if (!reverseId) return;
    setLoading(true);
    try {
      await fetch(`/api/action-history?id=${reverseId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reverse" }) });
      setEntries((prev) => prev.map((e) => e.id === reverseId ? { ...e, reversedBy: "admin", reversedAt: new Date().toISOString() } : e));
      setReverseOpen(false);
      setReverseId(null);
      toast.success("Action reversed successfully");
    } catch {
      toast.error("Failed to reverse action");
    } finally {
      setLoading(false);
    }
  }

  const reversibleCount = entries.filter((e) => e.reversible && !e.reversedBy).length;
  const totalCount = entries.length;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <PageHeader
        title="Action History"
        description="Complete audit trail of all subscriber actions with the ability to reverse changes."
        icon={History}
      />

      {/* Error Banner */}
      {error && (
        <Card className="border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400">Showing demo data — API unavailable: {error}</p>
            <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={() => window.location.reload()}>
              <RotateCcw className="h-3 w-3 mr-1" />Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {loading && !entries.length ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border shadow-sm"><CardContent className="p-4"><Skeleton className="h-16 w-full rounded-lg" /></CardContent></Card>
          ))
        ) : (
          <>
            <Card className="border-0 rounded-xl ring-1 ring-teal-200/60 dark:ring-teal-800/40 bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-950/50 dark:to-cyan-950/30 shadow-sm hover:scale-[1.02] transition-all duration-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 shadow-sm shadow-teal-500/25"><History className="h-4 w-4 text-white" /></div>
                  <div>
                    <p className="text-2xl font-bold tabular-nums text-teal-700 dark:text-teal-300">{totalCount}</p>
                    <p className="text-xs text-muted-foreground font-medium">Total Actions</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 rounded-xl ring-1 ring-green-200/60 dark:ring-green-800/40 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/50 dark:to-emerald-950/30 shadow-sm hover:scale-[1.02] transition-all duration-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-sm shadow-green-500/25"><RotateCcw className="h-4 w-4 text-white" /></div>
                  <div>
                    <p className="text-2xl font-bold tabular-nums text-green-700 dark:text-green-300">{reversibleCount}</p>
                    <p className="text-xs text-muted-foreground font-medium">Reversible</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 rounded-xl ring-1 ring-amber-200/60 dark:ring-amber-800/40 bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/50 dark:to-yellow-950/30 shadow-sm hover:scale-[1.02] transition-all duration-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-600 shadow-sm shadow-amber-500/25"><Tag className="h-4 w-4 text-white" /></div>
                  <div>
                    <p className="text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-300">{new Set(entries.map((e) => e.actionType)).size}</p>
                    <p className="text-xs text-muted-foreground font-medium">Action Types</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 rounded-xl ring-1 ring-purple-200/60 dark:ring-purple-800/40 bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950/50 dark:to-violet-950/30 shadow-sm hover:scale-[1.02] transition-all duration-200">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 shadow-sm shadow-purple-500/25"><User className="h-4 w-4 text-white" /></div>
                  <div>
                    <p className="text-2xl font-bold tabular-nums text-purple-700 dark:text-purple-300">{new Set(entries.map((e) => e.performedBy)).size}</p>
                    <p className="text-xs text-muted-foreground font-medium">Actors</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Filters */}
      <Card className="border shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search subscriber, actor, or entity..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
            </div>
            <Select value={subscriberIdFilter} onValueChange={(v) => { setSubscriberIdFilter(v === "ALL" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Subscriber" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Subscribers</SelectItem>
                {uniqueSubscriberIds.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.code} — {s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={actionTypeFilter} onValueChange={(v) => { setActionTypeFilter(v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="Action Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Actions</SelectItem>
                {ACTION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} className="w-full sm:w-[150px]" />
            <Input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} className="w-full sm:w-[150px]" />
            {(search || actionTypeFilter !== "ALL" || subscriberIdFilter || startDate || endDate) && (
              <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setActionTypeFilter("ALL"); setSubscriberIdFilter(""); setStartDate(""); setEndDate(""); setPage(1); }}>
                <X className="h-4 w-4 mr-1" />Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border shadow-sm">
        <CardContent className="p-0">
          {loading && !entries.length ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
                <span className="text-sm text-muted-foreground">Loading action history...</span>
              </div>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs w-8"></TableHead>
                      <TableHead className="text-xs">Timestamp</TableHead>
                      <TableHead className="text-xs">Subscriber</TableHead>
                      <TableHead className="text-xs">Action</TableHead>
                      <TableHead className="text-xs hidden md:table-cell">Entity</TableHead>
                      <TableHead className="text-xs hidden lg:table-cell">Performed By</TableHead>
                      <TableHead className="text-xs">Reversible</TableHead>
                      <TableHead className="text-xs text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginated.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-12 text-muted-foreground">No actions found matching filters.</TableCell></TableRow>
                    ) : (
                      paginated.map((entry) => {
                        const isExpanded = expandedRows.has(entry.id);
                        const hasChanges = Object.keys(entry.oldValues).length > 0 || Object.keys(entry.newValues).length > 0;
                        return (
                          <>
                            <TableRow key={entry.id} className="hover:bg-muted/50 transition-colors duration-150 cursor-pointer" onClick={() => hasChanges && toggleRow(entry.id)}>
                              <TableCell>
                                {hasChanges && (
                                  <Button variant="ghost" size="icon" className="h-6 w-6">
                                    {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                  </Button>
                                )}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  <Clock className="h-3.5 w-3.5" />
                                  {formatTimestamp(entry.timestamp)}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div className="flex items-center justify-center h-7 w-7 rounded-md bg-slate-100 dark:bg-slate-800"><User className="h-3.5 w-3.5 text-muted-foreground" /></div>
                                  <div>
                                    <div className="text-xs font-medium">{entry.subscriberName}</div>
                                    <div className="text-[10px] text-muted-foreground font-mono">{entry.subscriberCode}</div>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>{getActionTypeBadge(entry.actionType)}</TableCell>
                              <TableCell className="text-xs hidden md:table-cell">
                                <div className="flex items-center gap-1.5">
                                  <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span>{entry.entityType}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground hidden lg:table-cell">{entry.performedBy}</TableCell>
                              <TableCell>
                                {entry.reversedBy ? (
                                  <Badge variant="outline" className="text-[10px] border-gray-400 text-gray-500">Reversed</Badge>
                                ) : entry.reversible ? (
                                  <Badge variant="outline" className="text-[10px] border-green-400 text-green-700 dark:border-green-600 dark:text-green-400">Yes</Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-[10px]">No</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                {entry.reversible && !entry.reversedBy && (
                                  <Button variant="ghost" size="sm" className="h-7 text-xs text-orange-600 hover:text-orange-700 hover:bg-orange-50" onClick={(e) => { e.stopPropagation(); setReverseId(entry.id); setReverseOpen(true); }}>
                                    <RotateCcw className="h-3.5 w-3.5 mr-1" />Reverse
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                            {/* Expanded row showing old/new values */}
                            {isExpanded && hasChanges && (
                              <TableRow key={`${entry.id}-expanded`} className="bg-muted/20">
                                <TableCell colSpan={8} className="px-8 py-3">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                      <div className="text-[10px] font-semibold uppercase text-muted-foreground mb-2 flex items-center gap-1">
                                        <span className="inline-block w-2 h-2 rounded-full bg-red-400" />Old Values
                                      </div>
                                      <div className="space-y-1">
                                        {Object.entries(entry.oldValues).length === 0 ? (
                                          <span className="text-xs text-muted-foreground italic">No previous values (new creation)</span>
                                        ) : (
                                          Object.entries(entry.oldValues).map(([key, val]) => (
                                            <div key={key} className="flex items-center gap-2 text-xs">
                                              <span className="font-medium text-muted-foreground min-w-[80px]">{key}:</span>
                                              <span className="line-through text-red-600 dark:text-red-400">{val}</span>
                                            </div>
                                          ))
                                        )}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="text-[10px] font-semibold uppercase text-muted-foreground mb-2 flex items-center gap-1">
                                        <ArrowRight className="h-2.5 w-2.5" />
                                        <span className="inline-block w-2 h-2 rounded-full bg-green-400" />New Values
                                      </div>
                                      <div className="space-y-1">
                                        {Object.entries(entry.newValues).length === 0 ? (
                                          <span className="text-xs text-muted-foreground italic">No values (deleted)</span>
                                        ) : (
                                          Object.entries(entry.newValues).map(([key, val]) => (
                                            <div key={key} className="flex items-center gap-2 text-xs">
                                              <span className="font-medium text-muted-foreground min-w-[80px]">{key}:</span>
                                              <span className="text-green-600 dark:text-green-400 font-medium">{val}</span>
                                            </div>
                                          ))
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-xs text-muted-foreground">Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}</p>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((p) => (
                      <Button key={p} variant={p === page ? "default" : "outline"} size="sm" className="h-7 w-7 text-xs" onClick={() => setPage(p)}>{p}</Button>
                    ))}
                    <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Reverse Confirmation */}
      <AlertDialog open={reverseOpen} onOpenChange={setReverseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><RotateCcw className="h-5 w-5 text-orange-600" />Reverse Action</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reverse this action? This will restore the previous values. The current state will be overridden. This action itself cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-orange-600 hover:bg-orange-700 text-white" onClick={handleReverse} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
              Confirm Reverse
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
